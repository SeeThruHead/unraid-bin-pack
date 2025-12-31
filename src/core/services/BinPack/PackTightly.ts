import { Effect } from "effect"
import type { FileEntry } from "@domain/FileEntry"
import type { FileMove } from "@domain/MovePlan"
import { createFileMove } from "@domain/MovePlan"
import type { WorldView } from "@domain/WorldView"
import { rankDisksByFullness } from "@domain/DiskRanking"
import { applyFileFilters } from "@domain/FileFilter"

export interface PackTightlyOptions {
  readonly minSpaceBytes: number
  readonly minFileSizeBytes?: number
  readonly pathPrefixes?: readonly string[]
  readonly srcDiskPaths?: readonly string[]
}

export interface ConsolidationResult {
  readonly moves: ReadonlyArray<FileMove>
  readonly bytesConsolidated: number
}

type AvailableSpaceMap = Map<string, number>
type EmptiedDisksSet = Set<string>
type DestinationDisksSet = Set<string>

interface PackingState {
  availableSpace: AvailableSpaceMap
  emptiedDisks: EmptiedDisksSet
  destinationDisks: DestinationDisksSet
  allMoves: FileMove[]
}

const findBestDestination = (
  file: FileEntry,
  availableSpace: AvailableSpaceMap,
  sourceDiskPath: string,
  emptiedDisks: EmptiedDisksSet,
  minSpaceBytes: number
): string | null => {
  const candidates = [...availableSpace.entries()]
    .filter(([diskPath]) =>
      diskPath !== sourceDiskPath && !emptiedDisks.has(diskPath)
    )
    .filter(([_, freeBytes]) =>
      freeBytes - minSpaceBytes >= file.sizeBytes
    )
    .sort((a, b) => a[1] - b[1]) // Sort by LEAST free space (fill fuller disks first)

  return candidates.length > 0 ? candidates[0]![0] : null
}

export const packTightly = (
  worldView: WorldView,
  options: PackTightlyOptions
): Effect.Effect<ConsolidationResult, never> =>
  Effect.gen(function* () {
    // Apply file filters
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

    // Rank all disks by fullness
    let rankedDisks = rankDisksByFullness(worldView.disks, filteredWorldView.files)

    // Filter to only source disks if specified
    if (options.srcDiskPaths && options.srcDiskPaths.length > 0) {
      const srcDiskSet = new Set(options.srcDiskPaths)
      rankedDisks = rankedDisks.filter(disk => srcDiskSet.has(disk.path))
      yield* Effect.logDebug(`Limiting sources to: ${options.srcDiskPaths.join(', ')}`)
    }

    yield* Effect.logDebug(`Processing ${rankedDisks.length} disks in order: ${rankedDisks.map(d => `${d.path} (${d.usedPct.toFixed(1)}% full)`).join(', ')}`)

    const initialState: PackingState = {
      availableSpace: new Map(worldView.disks.map(d => [d.path, d.freeBytes])),
      emptiedDisks: new Set<string>(),
      destinationDisks: new Set<string>(),
      allMoves: []
    }

    const finalState = yield* Effect.reduce(
      rankedDisks,
      initialState,
      (state, sourceDisk) => Effect.gen(function* () {
        const filesOnDisk = filteredWorldView.files
          .filter(f => f.diskPath === sourceDisk.path)
          .sort((a, b) => b.sizeBytes - a.sizeBytes)

        yield* Effect.logDebug(`\n--- Processing ${sourceDisk.path} (${sourceDisk.usedPct.toFixed(1)}% full, ${(sourceDisk.freeBytes / 1024 / 1024).toFixed(0)} MB free) ---`)
        yield* Effect.logDebug(`  Files on disk: ${filesOnDisk.map(f => `${f.relativePath} (${(f.sizeBytes / 1024 / 1024).toFixed(0)} MB)`).join(', ') || 'none'}`)

        // Skip if this disk has received files (it's a destination, not a source)
        if (state.destinationDisks.has(sourceDisk.path)) {
          yield* Effect.logDebug(`  ❌ SKIPPING ${sourceDisk.path}: This disk is a DESTINATION (already received files)`)
          return state
        }

        // Check if any file on this disk can be moved
        const canMoveAnyFile = filesOnDisk.some(file =>
          findBestDestination(
            file,
            state.availableSpace,
            sourceDisk.path,
            state.emptiedDisks,
            options.minSpaceBytes
          ) !== null
        )

        if (!canMoveAnyFile) {
          yield* Effect.logDebug(`  ❌ SKIPPING ${sourceDisk.path}: No files can fit on any available destination`)
          yield* Effect.logDebug(`     Available destinations: ${[...state.availableSpace.entries()]
            .filter(([p]) => p !== sourceDisk.path && !state.emptiedDisks.has(p))
            .map(([p, free]) => `${p} (${((free - options.minSpaceBytes) / 1024 / 1024).toFixed(0)} MB available)`)
            .join(', ')}`)
          return state
        }

        yield* Effect.logDebug(`  ✓ Processing files from ${sourceDisk.path}...`)

        const updatedState = yield* Effect.reduce(
          filesOnDisk,
          state,
          (fileState, file) => Effect.gen(function* () {
            const destination = findBestDestination(
              file,
              fileState.availableSpace,
              sourceDisk.path,
              fileState.emptiedDisks,
              options.minSpaceBytes
            )

            if (!destination) {
              yield* Effect.logDebug(`    ⊘ ${file.relativePath} (${(file.sizeBytes / 1024 / 1024).toFixed(0)} MB): Cannot fit anywhere`)
              return fileState
            }

            const destFreeBefore = fileState.availableSpace.get(destination)!
            const destAvailable = destFreeBefore - options.minSpaceBytes
            yield* Effect.logDebug(`    → ${file.relativePath} (${(file.sizeBytes / 1024 / 1024).toFixed(0)} MB) to ${destination} (has ${(destAvailable / 1024 / 1024).toFixed(0)} MB available)`)

            const move = createFileMove(file, destination)
            const newAvailableSpace = new Map(fileState.availableSpace)
            newAvailableSpace.set(destination, destFreeBefore - file.sizeBytes)

            // Mark destination disk as having received files
            const newDestinationDisks = new Set(fileState.destinationDisks)
            newDestinationDisks.add(destination)

            return {
              ...fileState,
              availableSpace: newAvailableSpace,
              destinationDisks: newDestinationDisks,
              allMoves: [...fileState.allMoves, move]
            }
          })
        )

        const movedFromSource = updatedState.allMoves.filter(m => m.file.diskPath === sourceDisk.path)
        const bytesMovedOff = movedFromSource.reduce((sum, m) => sum + m.file.sizeBytes, 0)
        const totalBytesOnDisk = filesOnDisk.reduce((sum, f) => sum + f.sizeBytes, 0)

        if (bytesMovedOff === totalBytesOnDisk && totalBytesOnDisk > 0) {
          yield* Effect.logDebug(`  🎉 ${sourceDisk.path} is now EMPTY! Marking as finished (no longer a destination)`)
          return {
            ...updatedState,
            emptiedDisks: new Set([...updatedState.emptiedDisks, sourceDisk.path])
          }
        } else {
          yield* Effect.logDebug(`  ⚠ ${sourceDisk.path} still has ${((totalBytesOnDisk - bytesMovedOff) / 1024 / 1024).toFixed(0)} MB remaining (${filesOnDisk.length - movedFromSource.length} files couldn't be moved)`)
        }

        return updatedState
      })
    )

    return {
      moves: finalState.allMoves,
      bytesConsolidated: finalState.allMoves.reduce((sum, m) => sum + m.file.sizeBytes, 0)
    }
  })
