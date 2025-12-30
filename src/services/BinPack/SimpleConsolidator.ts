import { Array, Effect, pipe } from "effect"
import type { FileEntry } from "@domain/FileEntry"
import type { FileMove } from "@domain/MovePlan"
import { createFileMove } from "@domain/MovePlan"
import type { WorldView } from "@domain/WorldView"
import { applyFileFilters } from "@domain/FileFilter"
import { rankDisksByFullness } from "@domain/DiskRanking"
import { findBestCombinationForDisk } from "./MoveGenerator"

export interface ConsolidationOptions {
  readonly minSpaceBytes: number
  readonly minFileSizeBytes?: number
  readonly pathPrefixes?: readonly string[]
  readonly maxCombinationSize?: number
  readonly srcDiskPaths?: readonly string[]
}

export interface ConsolidationResult {
  readonly moves: ReadonlyArray<FileMove>
  readonly bytesConsolidated: number
}

type AvailableSpaceMap = Map<string, number>
type ProcessedDisksSet = Set<string>

export const consolidateSimple = (
  worldView: WorldView,
  options: ConsolidationOptions
): Effect.Effect<ConsolidationResult, never> =>
  Effect.gen(function* () {
    const maxCombinationSize = options.maxCombinationSize ?? 5

    const beforeFilterCount = worldView.files.length
    const filteredFiles = applyFileFilters(worldView.files, {
      minSizeBytes: options.minFileSizeBytes,
      pathPrefixes: options.pathPrefixes,
    })

    const filteredCount = beforeFilterCount - filteredFiles.length
    if (filteredCount > 0) {
      yield* Effect.logDebug(`Filtered out ${filteredCount} files`)
    }

    const filteredWorldView: WorldView = {
      ...worldView,
      files: filteredFiles,
    }

    let rankedDisks = rankDisksByFullness(filteredWorldView.disks, filteredWorldView.files)

    rankedDisks = rankedDisks.filter((d) => d.path !== "/mnt/disks")

    if (options.srcDiskPaths && options.srcDiskPaths.length > 0) {
      const srcDiskPaths = options.srcDiskPaths
      rankedDisks = rankedDisks.filter((d) =>
        srcDiskPaths.includes(d.path)
      )
      yield* Effect.logDebug(
        `Filtered to ${rankedDisks.length} source disks: ${srcDiskPaths.join(", ")}`
      )
    }

    yield* Effect.logDebug(
      `Ranked ${rankedDisks.length} disks by fullness (least full first)`
    )

    const availableSpace = new Map<string, number>(
      filteredWorldView.disks
        .filter((d) => d.path !== "/mnt/disks")
        .map((d) => [d.path, d.freeBytes])
    )

    const movedFiles = new Set<string>()
    const allMoves: FileMove[] = []

    const processedDisks = new Set<string>()

    for (const sourceDisk of rankedDisks) {
      yield* Effect.logDebug(
        `Processing source disk: ${sourceDisk.path} (${sourceDisk.usedPct.toFixed(1)}% full)`
      )

      let remainingFiles = pipe(
        filteredWorldView.files,
        Array.filter(
          (f) => f.diskPath === sourceDisk.path && !movedFiles.has(f.absolutePath)
        )
      )

      while (remainingFiles.length > 0) {
        const bestMove = findBestMoveAcrossDestinations(
          remainingFiles,
          sourceDisk.path,
          availableSpace,
          options.minSpaceBytes,
          maxCombinationSize,
          processedDisks
        )

        if (!bestMove) {
          yield* Effect.logDebug(
            `No more files can be moved from ${sourceDisk.path}`
          )

          const sortedRemaining = [...remainingFiles].sort((a, b) => a.sizeBytes - b.sizeBytes)
          const smallestFile = sortedRemaining[0]
          if (smallestFile) {
            yield* Effect.logDebug(
              `  Smallest remaining file: ${(smallestFile.sizeBytes / 1024 / 1024).toFixed(3)}MB`
            )
          }

          const destinations = [...availableSpace.entries()]
            .filter(([diskPath]) => diskPath !== sourceDisk.path && !processedDisks.has(diskPath))
            .sort((a, b) => b[1] - a[1])
          yield* Effect.logDebug(
            `  Available destinations: ${destinations.length}`
          )
          for (const [diskPath, freeSpace] of destinations.slice(0, 3)) {
            const availableForFiles = freeSpace - options.minSpaceBytes
            yield* Effect.logDebug(
              `    ${diskPath}: ${(freeSpace / 1024 / 1024).toFixed(2)}MB free, ${(availableForFiles / 1024 / 1024).toFixed(2)}MB available for files`
            )
          }

          break
        }

        const moves = bestMove.files.map((file) =>
          createFileMove(file, bestMove.targetDisk)
        )

        for (const move of moves) {
          allMoves.push(move)
          movedFiles.add(move.file.absolutePath)

          const currentSpace = availableSpace.get(bestMove.targetDisk) ?? 0
          availableSpace.set(
            bestMove.targetDisk,
            currentSpace - move.file.sizeBytes
          )
        }

        yield* Effect.logDebug(
          `Moved ${moves.length} file(s) (${(bestMove.totalBytes / 1024 / 1024).toFixed(1)}MB) from ${sourceDisk.path} to ${bestMove.targetDisk}`
        )

        remainingFiles = pipe(
          remainingFiles,
          Array.filter((f) => !movedFiles.has(f.absolutePath))
        )
      }

      processedDisks.add(sourceDisk.path)
      yield* Effect.logDebug(`Disk ${sourceDisk.path} processed and removed from destination pool`)
    }

    const bytesConsolidated = allMoves.reduce(
      (sum, m) => sum + m.file.sizeBytes,
      0
    )

    yield* Effect.logDebug(
      `Consolidation complete: ${allMoves.length} moves, ${(bytesConsolidated / 1024 / 1024).toFixed(1)}MB consolidated`
    )

    yield* Effect.logDebug(`Final disk state:`)
    const finalDiskState = [...availableSpace.entries()]
      .sort((a, b) => b[1] - a[1])
    for (const [diskPath, freeSpace] of finalDiskState) {
      const diskName = diskPath.split('/').pop()
      yield* Effect.logDebug(
        `  ${diskName}: ${(freeSpace / 1024 / 1024).toFixed(2)}MB free`
      )
    }

    return {
      moves: allMoves,
      bytesConsolidated,
    }
  })

const findBestMoveAcrossDestinations = (
  files: ReadonlyArray<FileEntry>,
  sourceDiskPath: string,
  availableSpace: AvailableSpaceMap,
  minSpaceBytes: number,
  maxCombinationSize: number,
  processedDisks: ProcessedDisksSet
) => {
  const destinations = [...availableSpace.entries()].filter(
    ([diskPath]) => diskPath !== sourceDiskPath && !processedDisks.has(diskPath)
  )

  if (destinations.length === 0) return null

  let bestCandidate = null

  for (const [targetDisk, freeSpace] of destinations) {
    const availableForFiles = freeSpace - minSpaceBytes

    if (availableForFiles <= 0) continue

    const combination = findBestCombinationForDisk(
      files,
      availableForFiles,
      targetDisk,
      maxCombinationSize
    )

    if (!combination) continue

    if (!bestCandidate || combination.score > bestCandidate.score) {
      bestCandidate = combination
    }
  }

  return bestCandidate
}
