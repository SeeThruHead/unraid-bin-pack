import { Effect } from "effect"
import type { FileEntry } from "@domain/FileEntry"
import type { FileMove } from "@domain/MovePlan"
import { createFileMove } from "@domain/MovePlan"
import type { WorldView } from "@domain/WorldView"
import { applyMove } from "@domain/WorldView"
import { rankDisksByFullness } from "@domain/DiskRanking"
import { applyFileFilters } from "@domain/FileFilter"
import { optimizeMoveChains } from "@domain/MoveOptimization"

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

/**
 * Find the best destination disk for a file.
 * Prefers fuller disks first (least free space) to concentrate free space.
 * Excludes source disk and already-processed disks.
 */
const findBestDestination = (
  file: FileEntry,
  worldView: WorldView,
  sourceDiskPath: string,
  processedDisks: Set<string>,
  minSpaceBytes: number
): string | null => {
  const candidates = worldView.disks
    .filter(disk =>
      disk.path !== sourceDiskPath &&
      !processedDisks.has(disk.path) &&
      disk.freeBytes - minSpaceBytes >= file.sizeBytes
    )
    .sort((a, b) => a.freeBytes - b.freeBytes) // Sort by LEAST free space (fill fuller disks first)

  return candidates.length > 0 ? candidates[0]!.path : null
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

    // Start with filtered WorldView
    let currentWorldView: WorldView = {
      ...worldView,
      files: filteredFiles,
    }

    const processedDisks = new Set<string>()
    const allMoves: FileMove[] = []

    // Determine which disks are eligible to be sources
    const srcDiskSet = options.srcDiskPaths && options.srcDiskPaths.length > 0
      ? new Set(options.srcDiskPaths)
      : null

    if (srcDiskSet) {
      yield* Effect.logDebug(`Limiting sources to: ${Array.from(srcDiskSet).join(', ')}`)
    }

    // Iterative emptying: process one disk at a time until we can't move any more files
    while (true) {
      // Rank disks by fullness in current WorldView state
      let rankedDisks = rankDisksByFullness(currentWorldView.disks, currentWorldView.files)

      // Filter to only source disks if specified
      if (srcDiskSet) {
        rankedDisks = rankedDisks.filter(disk => srcDiskSet.has(disk.path))
      }

      // Find the least full unprocessed disk with files on it
      const sourceDisk = rankedDisks.find(disk => !processedDisks.has(disk.path))

      if (!sourceDisk) {
        yield* Effect.logDebug(`\n✓ No more unprocessed disks with files - consolidation complete`)
        break
      }

      const sourceDiskPath = sourceDisk.path

      yield* Effect.logDebug(`\n--- Processing ${sourceDiskPath} (${sourceDisk.usedPct.toFixed(1)}% full, ${(sourceDisk.freeBytes / 1024 / 1024).toFixed(0)} MB free) ---`)

      // Get files on this disk from current WorldView (sorted largest first)
      const filesOnDisk = currentWorldView.files
        .filter(f => f.diskPath === sourceDiskPath)
        .sort((a, b) => b.sizeBytes - a.sizeBytes)

      yield* Effect.logDebug(`  Files on disk: ${filesOnDisk.map(f => `${f.relativePath} (${(f.sizeBytes / 1024 / 1024).toFixed(0)} MB)`).join(', ') || 'none'}`)

      let movedCount = 0

      // Try to move files off this disk until we can't move any more
      for (const file of filesOnDisk) {
        const destination = findBestDestination(
          file,
          currentWorldView,
          sourceDiskPath,
          processedDisks,
          options.minSpaceBytes
        )

        if (!destination) {
          yield* Effect.logDebug(`    ⊘ ${file.relativePath} (${(file.sizeBytes / 1024 / 1024).toFixed(0)} MB): Cannot fit anywhere`)
          continue
        }

        const destDisk = currentWorldView.disks.find(d => d.path === destination)!
        const destAvailable = destDisk.freeBytes - options.minSpaceBytes
        yield* Effect.logDebug(`    → ${file.relativePath} (${(file.sizeBytes / 1024 / 1024).toFixed(0)} MB) to ${destination} (has ${(destAvailable / 1024 / 1024).toFixed(0)} MB available)`)

        // Create move
        const move = createFileMove(file, destination)
        allMoves.push(move)
        movedCount++

        // Apply move to WorldView (updates disk states and file locations)
        currentWorldView = applyMove(currentWorldView, move)
      }

      if (movedCount === filesOnDisk.length && filesOnDisk.length > 0) {
        yield* Effect.logDebug(`  🎉 ${sourceDiskPath} is now EMPTY!`)
      } else if (movedCount > 0) {
        yield* Effect.logDebug(`  ⚠ ${sourceDiskPath} partially emptied (${movedCount}/${filesOnDisk.length} files moved)`)
      } else {
        yield* Effect.logDebug(`  ❌ No files could be moved from ${sourceDiskPath}`)
      }

      // Mark this disk as processed
      processedDisks.add(sourceDiskPath)
    }

    // Optimize move chains (collapse disk8→disk7→disk6 into disk8→disk6)
    const optimizedMoves = optimizeMoveChains(allMoves)
    const optimizedCount = allMoves.length - optimizedMoves.length

    if (optimizedCount > 0) {
      yield* Effect.logDebug(`\n✓ Optimized ${optimizedCount} redundant moves (collapsed chains)`)
    }

    return {
      moves: optimizedMoves,
      bytesConsolidated: optimizedMoves.reduce((sum, m) => sum + m.file.sizeBytes, 0)
    }
  })
