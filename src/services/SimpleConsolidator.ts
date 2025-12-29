/**
 * SimpleConsolidator - Simple disk-by-disk consolidation
 *
 * Algorithm:
 * 1. Rank disks by fullness (least full first)
 * 2. For each source disk:
 *    - Find the best COMBINATION of files that fills destination disks well
 *    - Move those files
 *    - Repeat until no more files can be moved
 * 3. Move to next source disk
 *
 * Key: Finds combinations of files (e.g., 345MB + 200MB) that fit better
 * than single large files (e.g., 540MB alone).
 */

import { Array, Effect, Order, pipe } from "effect"
import type { FileEntry } from "../domain/FileEntry"
import type { FileMove } from "../domain/MovePlan"
import { createFileMove } from "../domain/MovePlan"
import type { WorldView, DiskState } from "../domain/WorldView"

// =============================================================================
// Types
// =============================================================================

export interface ConsolidationOptions {
  readonly minSpaceBytes: number
  readonly minFileSizeBytes?: number // Min file size to consider (default: 0, move all files)
  readonly pathPrefixes?: readonly string[] // Path prefixes to include (default: all paths)
  readonly maxCombinationSize?: number // Max files to consider in a combination (default: 5)
  readonly srcDiskPaths?: readonly string[] // If specified, only move files from these disks
}

export interface ConsolidationResult {
  readonly moves: ReadonlyArray<FileMove>
  readonly bytesConsolidated: number
}

interface DiskWithUsage extends DiskState {
  readonly usedBytes: number
  readonly usedPct: number
}

// =============================================================================
// Main API
// =============================================================================

/**
 * Consolidate files by moving them from least full disks to other disks.
 * Finds combinations of files that fill destination disks efficiently.
 */
export const consolidateSimple = (
  worldView: WorldView,
  options: ConsolidationOptions
): Effect.Effect<ConsolidationResult, never> =>
  Effect.gen(function* () {
    const maxCombinationSize = options.maxCombinationSize ?? 5
    const minFileSizeBytes = options.minFileSizeBytes ?? 0
    const pathPrefixes = options.pathPrefixes ?? []

    // Filter files by size and path
    let filteredFiles = worldView.files

    // Filter by file size
    if (minFileSizeBytes > 0) {
      const beforeSize = filteredFiles.length
      filteredFiles = filteredFiles.filter((f) => f.sizeBytes >= minFileSizeBytes)
      const filteredCount = beforeSize - filteredFiles.length
      if (filteredCount > 0) {
        yield* Effect.logDebug(
          `Filtered out ${filteredCount} files smaller than ${(minFileSizeBytes / 1024 / 1024).toFixed(2)}MB`
        )
      }
    }

    // Filter by path prefixes
    if (pathPrefixes.length > 0) {
      const beforePath = filteredFiles.length
      filteredFiles = filteredFiles.filter((f) =>
        pathPrefixes.some((prefix) => {
          // Extract path after /mnt/diskN/ to match against prefix
          const diskMatch = f.absolutePath.match(/^\/mnt\/disk\d+(.*)$/)
          if (diskMatch && diskMatch[1]) {
            return diskMatch[1].startsWith(prefix)
          }
          // Fallback to full path check (for non-standard paths)
          return f.absolutePath.startsWith(prefix)
        })
      )
      const filteredCount = beforePath - filteredFiles.length
      if (filteredCount > 0) {
        yield* Effect.logDebug(
          `Filtered out ${filteredCount} files not matching path prefixes: ${pathPrefixes.join(", ")}`
        )
      }
    }

    const filteredWorldView: WorldView = {
      ...worldView,
      files: filteredFiles,
    }

    // Rank disks by fullness (least full first)
    let rankedDisks = rankDisksByFullness(filteredWorldView)

    // Always exclude /mnt/disks from consolidation
    rankedDisks = rankedDisks.filter((d) => d.path !== "/mnt/disks")

    // Filter to only specified source disks if provided
    if (options.srcDiskPaths && options.srcDiskPaths.length > 0) {
      rankedDisks = rankedDisks.filter((d) =>
        options.srcDiskPaths!.includes(d.path)
      )
      yield* Effect.logDebug(
        `Filtered to ${rankedDisks.length} source disks: ${options.srcDiskPaths.join(", ")}`
      )
    }

    yield* Effect.logDebug(
      `Ranked ${rankedDisks.length} disks by fullness (least full first)`
    )

    // Track available space on each disk as we move files
    // Exclude /mnt/disks from destinations
    const availableSpace = new Map<string, number>(
      filteredWorldView.disks
        .filter((d) => d.path !== "/mnt/disks")
        .map((d) => [d.path, d.freeBytes])
    )

    // Track which files have been moved
    const movedFiles = new Set<string>()
    const allMoves: FileMove[] = []

    // Track which disks have been processed (removed from destination consideration)
    const processedDisks = new Set<string>()

    // Process each source disk from least full to most full
    for (const sourceDisk of rankedDisks) {
      yield* Effect.logDebug(
        `Processing source disk: ${sourceDisk.path} (${sourceDisk.usedPct.toFixed(1)}% full)`
      )

      // Get files on this disk that haven't been moved yet
      let remainingFiles = pipe(
        filteredWorldView.files,
        Array.filter(
          (f) => f.diskPath === sourceDisk.path && !movedFiles.has(f.absolutePath)
        )
      )

      // Get current available space on this source disk for comparison
      const sourceAvailableSpace = availableSpace.get(sourceDisk.path) ?? 0

      // Keep finding and applying best combinations until no more can be moved
      while (remainingFiles.length > 0) {
        // Find the best combination across all destination disks (excluding processed ones)
        const bestMove = findBestCombination(
          remainingFiles,
          sourceDisk.path,
          availableSpace,
          options.minSpaceBytes,
          maxCombinationSize,
          sourceAvailableSpace,
          processedDisks
        )

        if (!bestMove) {
          // No more combinations can be moved from this disk
          yield* Effect.logDebug(
            `No more files can be moved from ${sourceDisk.path}`
          )

          // Log diagnostic info about why we stopped
          const sortedRemaining = [...remainingFiles].sort((a, b) => a.sizeBytes - b.sizeBytes)
          const smallestFile = sortedRemaining[0]
          if (smallestFile) {
            yield* Effect.logDebug(
              `  Smallest remaining file: ${(smallestFile.sizeBytes / 1024 / 1024).toFixed(3)}MB`
            )
          }

          // Log available space on destinations
          const destinations = [...availableSpace.entries()]
            .filter(([diskPath]) => diskPath !== sourceDisk.path && !processedDisks.has(diskPath))
            .sort((a, b) => b[1] - a[1]) // Sort by free space descending

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

        // Apply the move
        const moves = bestMove.files.map((file) =>
          createFileMove(file, bestMove.targetDisk)
        )

        for (const move of moves) {
          allMoves.push(move)
          movedFiles.add(move.file.absolutePath)

          // Update available space
          const currentSpace = availableSpace.get(bestMove.targetDisk) ?? 0
          availableSpace.set(
            bestMove.targetDisk,
            currentSpace - move.file.sizeBytes
          )
        }

        yield* Effect.logDebug(
          `Moved ${moves.length} file(s) (${(bestMove.totalBytes / 1024 / 1024).toFixed(1)}MB) from ${sourceDisk.path} to ${bestMove.targetDisk}`
        )

        // Update remaining files
        remainingFiles = pipe(
          remainingFiles,
          Array.filter((f) => !movedFiles.has(f.absolutePath))
        )
      }

      // Mark this disk as processed - it won't be a destination for future disks
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

    // Log final disk state
    yield* Effect.logDebug(`Final disk state:`)
    const finalDiskState = [...availableSpace.entries()]
      .sort((a, b) => b[1] - a[1]) // Sort by free space descending

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

// =============================================================================
// Disk Ranking
// =============================================================================

/**
 * Rank disks by fullness (least full first).
 * Only includes disks that have files on them.
 */
const rankDisksByFullness = (worldView: WorldView): ReadonlyArray<DiskWithUsage> =>
  pipe(
    worldView.disks,
    Array.map((disk) => {
      const usedBytes = disk.totalBytes - disk.freeBytes
      const usedPct = disk.totalBytes > 0 ? (usedBytes / disk.totalBytes) * 100 : 0
      return {
        ...disk,
        usedBytes,
        usedPct,
      }
    }),
    Array.filter((disk) => {
      // Only include disks with files on them
      return worldView.files.some((f) => f.diskPath === disk.path)
    }),
    Array.sort(Order.mapInput(Order.number, (d: DiskWithUsage) => d.usedPct)) // Ascending
  )

// =============================================================================
// Combination Finding
// =============================================================================

interface CombinationCandidate {
  readonly files: ReadonlyArray<FileEntry>
  readonly totalBytes: number
  readonly targetDisk: string
  readonly wastedSpace: number
  readonly score: number
}

/**
 * Find the best combination of files to move to any destination disk.
 *
 * Tries all combinations up to maxCombinationSize and picks the one that:
 * 1. Fits in the destination (including minSpace reservation)
 * 2. Wastes the least space (fills most completely)
 *
 * Returns null if no combination can be moved.
 */
const findBestCombination = (
  files: ReadonlyArray<FileEntry>,
  sourceDiskPath: string,
  availableSpace: Map<string, number>,
  minSpaceBytes: number,
  maxCombinationSize: number,
  _sourceAvailableSpace: number, // Keep for compatibility but don't use
  processedDisks: Set<string>
): CombinationCandidate | null => {
  // Get all destination disks (not the source, and not already processed)
  // Once a disk is processed, it's removed from the destination pool
  const destinations = [...availableSpace.entries()].filter(
    ([diskPath]) => diskPath !== sourceDiskPath && !processedDisks.has(diskPath)
  )

  if (destinations.length === 0) return null

  let bestCandidate: CombinationCandidate | null = null

  // Try each destination disk
  for (const [targetDisk, freeSpace] of destinations) {
    const availableForFiles = freeSpace - minSpaceBytes

    if (availableForFiles <= 0) continue

    // Find best combination for this destination
    const combination = findBestCombinationForDisk(
      files,
      availableForFiles,
      targetDisk,
      maxCombinationSize
    )

    if (!combination) continue

    // Update best if this is better
    if (!bestCandidate || combination.score > bestCandidate.score) {
      bestCandidate = combination
    }
  }

  return bestCandidate
}

/**
 * Bucket for grouping files by size range
 */
interface FileBucket {
  readonly minSize: number
  readonly maxSize: number
  readonly files: FileEntry[]
  readonly avgSize: number
}

/**
 * Create size-based buckets for files
 * Buckets: 0-100KB, 100KB-1MB, 1MB-10MB, 10MB-100MB, 100MB+
 */
const createFileBuckets = (files: ReadonlyArray<FileEntry>): ReadonlyArray<FileBucket> => {
  const KB = 1024
  const MB = 1024 * 1024

  const bucketRanges = [
    { min: 0, max: 100 * KB },           // 0-100KB
    { min: 100 * KB, max: 1 * MB },      // 100KB-1MB
    { min: 1 * MB, max: 10 * MB },       // 1MB-10MB
    { min: 10 * MB, max: 100 * MB },     // 10MB-100MB
    { min: 100 * MB, max: Infinity },    // 100MB+
  ]

  return bucketRanges.map(range => {
    const bucketFiles = files.filter(
      f => f.sizeBytes >= range.min && f.sizeBytes < range.max
    )

    const avgSize = bucketFiles.length > 0
      ? bucketFiles.reduce((sum, f) => sum + f.sizeBytes, 0) / bucketFiles.length
      : 0

    return {
      minSize: range.min,
      maxSize: range.max,
      files: bucketFiles,
      avgSize,
    }
  }).filter(bucket => bucket.files.length > 0) // Only non-empty buckets
}

/**
 * Find the best combination using bucketing to reduce complexity.
 *
 * Strategy:
 * 1. Group files by size into buckets
 * 2. Use greedy knapsack with buckets
 * 3. Sample files from buckets to build combinations
 */
const findBestCombinationForDisk = (
  files: ReadonlyArray<FileEntry>,
  availableBytes: number,
  targetDisk: string,
  maxCombinationSize: number
): CombinationCandidate | null => {
  // Filter to only files that fit
  const fittingFiles = files.filter(f => f.sizeBytes <= availableBytes)

  if (fittingFiles.length === 0) return null

  // Create buckets grouped by size
  const buckets = createFileBuckets(fittingFiles)

  let best: CombinationCandidate | null = null

  // Strategy 1: Try single files (greedy - pick largest that fits)
  for (const file of fittingFiles) {
    if (file.sizeBytes <= availableBytes) {
      const wastedSpace = availableBytes - file.sizeBytes
      const score = file.sizeBytes / availableBytes

      if (!best || score > best.score) {
        best = {
          files: [file],
          totalBytes: file.sizeBytes,
          targetDisk,
          wastedSpace,
          score,
        }
      }
    }
  }

  // Strategy 2: Try combinations from buckets (sample-based)
  // For each bucket, sample a few files to try in combinations
  const sampledFiles: FileEntry[] = []
  for (const bucket of buckets) {
    // Sample up to 3 files from each bucket (smallest, median, largest)
    const sorted = [...bucket.files].sort((a, b) => a.sizeBytes - b.sizeBytes)
    const samples = [
      sorted[0],                                    // smallest
      sorted[Math.floor(sorted.length / 2)],        // median
      sorted[sorted.length - 1],                    // largest
    ].filter(Boolean) as FileEntry[]

    sampledFiles.push(...samples)
  }

  // Remove duplicates
  const uniqueSamples = [...new Map(
    sampledFiles.map(f => [f.absolutePath, f])
  ).values()]

  // Try combinations of sampled files (much smaller set!)
  for (let size = 2; size <= Math.min(maxCombinationSize, uniqueSamples.length); size++) {
    const combinations = generateCombinations(uniqueSamples, size)

    for (const combo of combinations) {
      const totalBytes = combo.reduce((sum, f) => sum + f.sizeBytes, 0)

      if (totalBytes > availableBytes) continue

      const wastedSpace = availableBytes - totalBytes
      const score = totalBytes / availableBytes

      if (!best || score > best.score) {
        best = {
          files: combo,
          totalBytes,
          targetDisk,
          wastedSpace,
          score,
        }
      }
    }
  }

  return best
}

/**
 * Generate all combinations of k elements from array.
 * Iterative approach to avoid stack overflow.
 */
const generateCombinations = <T>(
  array: ReadonlyArray<T>,
  k: number
): ReadonlyArray<ReadonlyArray<T>> => {
  if (k === 0) return [[]]
  if (k > array.length) return []
  if (k === 1) return array.map((item) => [item])

  const results: T[][] = []

  const helper = (start: number, current: T[]) => {
    if (current.length === k) {
      results.push([...current])
      return
    }

    for (let i = start; i < array.length; i++) {
      current.push(array[i]!)
      helper(i + 1, current)
      current.pop()
    }
  }

  helper(0, [])
  return results
}
