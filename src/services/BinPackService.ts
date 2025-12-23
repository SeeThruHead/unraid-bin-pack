/**
 * BinPackService - implements hybrid bin-packing for file placement.
 *
 * Two-pass algorithm:
 * 1. Pack entire folders first (coarse-grained, fast)
 * 2. Pack remaining individual files to fill gaps (fine-grained)
 *
 * This approach:
 * - Keeps related files together (movies, anime episodes, etc.)
 * - Fills disk space efficiently with small files
 * - Processes fewer items in pass 1 (hundreds vs millions)
 */

import { Context, Effect, Layer } from "effect"
import type { Disk } from "../domain/Disk"
import type { FileEntry } from "../domain/FileEntry"
import {
  type FolderGroup,
  type FolderGroupOptions,
  groupByImmediateFolder,
  sortBySize,
} from "../domain/FolderGroup"
import {
  type FileMove,
  type MovePlan,
  createFileMove,
  skipMove,
  createMovePlan,
} from "../domain/MovePlan"

// =============================================================================
// Types
// =============================================================================

export interface BinPackOptions {
  /** Minimum bytes to keep free on each disk */
  readonly thresholdBytes: number
  /** Algorithm to use */
  readonly algorithm: "best-fit" | "first-fit"
  /** Folders smaller than this are never split (default: 1GB) */
  readonly minSplitSizeBytes?: number
  /** If largest file is >= this % of total, keep folder together (default: 0.9) */
  readonly folderThreshold?: number
}

export interface BinPackResult {
  readonly plan: MovePlan
  /** Folders that were placed as a whole */
  readonly placedFolders: readonly FolderGroup[]
  /** Folders that couldn't fit, exploded into individual files */
  readonly explodedFolders: readonly FolderGroup[]
}

// =============================================================================
// Service interface
// =============================================================================

export interface BinPackService {
  /**
   * Compute optimal file moves using hybrid folder+file packing.
   *
   * @param disks - All disks with their free space (excluding spillover)
   * @param spilloverFiles - Files on the spillover disk to move
   */
  readonly computeMoves: (
    disks: readonly Disk[],
    spilloverFiles: readonly FileEntry[],
    options: BinPackOptions
  ) => Effect.Effect<BinPackResult>
}

export class BinPackServiceTag extends Context.Tag("BinPackService")<
  BinPackServiceTag,
  BinPackService
>() {}

// =============================================================================
// Disk state tracking
// =============================================================================

interface DiskState {
  readonly disk: Disk
  remainingBytes: number
}

const createDiskStates = (disks: readonly Disk[]): DiskState[] =>
  disks.map((disk) => ({
    disk,
    remainingBytes: disk.freeBytes,
  }))

// =============================================================================
// Best-fit / First-fit selection
// =============================================================================

const selectBestFit = (
  diskStates: DiskState[],
  sizeBytes: number,
  thresholdBytes: number
): DiskState | null =>
  diskStates.reduce<{ disk: DiskState | null; remaining: number }>(
    (best, ds) => {
      const remainingAfter = ds.remainingBytes - sizeBytes
      if (remainingAfter >= thresholdBytes && remainingAfter < best.remaining) {
        return { disk: ds, remaining: remainingAfter }
      }
      return best
    },
    { disk: null, remaining: Infinity }
  ).disk

const selectFirstFit = (
  diskStates: DiskState[],
  sizeBytes: number,
  thresholdBytes: number
): DiskState | null =>
  diskStates.find((ds) => ds.remainingBytes - sizeBytes >= thresholdBytes) ?? null

// =============================================================================
// Live implementation
// =============================================================================

export const BinPackServiceLive = Layer.succeed(BinPackServiceTag, {
  computeMoves: (disks, spilloverFiles, options) =>
    Effect.sync(() => {
      const { thresholdBytes, algorithm } = options
      const selectDisk = algorithm === "best-fit" ? selectBestFit : selectFirstFit

      // Build folder grouping options
      const folderOptions: FolderGroupOptions = {
        minSplitSizeBytes: options.minSplitSizeBytes ?? 1024 * 1024 * 1024, // 1GB
        folderThreshold: options.folderThreshold ?? 0.9,
      }

      // Initialize disk states
      const diskStates = createDiskStates(disks)

      // Group files by immediate parent folder with size-based heuristics
      const folders = sortBySize(groupByImmediateFolder(spilloverFiles, folderOptions))

      // =========================================================================
      // PASS 1: Try to place entire folders
      // =========================================================================

      const pass1Result = folders.reduce<{
        moves: FileMove[]
        placedFolders: FolderGroup[]
        explodedFolders: FolderGroup[]
      }>(
        (acc, folder) => {
          const targetDisk = selectDisk(diskStates, folder.totalBytes, thresholdBytes)

          if (targetDisk) {
            // Place entire folder on this disk
            const folderMoves = folder.files.map((file) =>
              createFileMove(file, targetDisk.disk.path)
            )
            targetDisk.remainingBytes -= folder.totalBytes
            return {
              moves: [...acc.moves, ...folderMoves],
              placedFolders: [...acc.placedFolders, folder],
              explodedFolders: acc.explodedFolders,
            }
          } else if (folder.keepTogether) {
            // Folder must stay together but doesn't fit - skip all files
            const skippedMoves = folder.files.map((file) =>
              skipMove(
                createFileMove(file, file.diskPath),
                `Folder must stay together but no disk has ${folder.totalBytes} bytes`
              )
            )
            return {
              moves: [...acc.moves, ...skippedMoves],
              placedFolders: acc.placedFolders,
              explodedFolders: acc.explodedFolders,
            }
          } else {
            // Folder can be split - mark for pass 2
            return {
              moves: acc.moves,
              placedFolders: acc.placedFolders,
              explodedFolders: [...acc.explodedFolders, folder],
            }
          }
        },
        { moves: [], placedFolders: [], explodedFolders: [] }
      )

      // =========================================================================
      // PASS 2: Fill gaps with individual files from exploded folders
      // =========================================================================

      // Collect all files from exploded folders, sort by size descending
      const remainingFiles = pass1Result.explodedFolders
        .flatMap((f) => f.files)
        .sort((a, b) => b.sizeBytes - a.sizeBytes)

      const pass2Moves = remainingFiles.map((file) => {
        const targetDisk = selectDisk(diskStates, file.sizeBytes, thresholdBytes)

        if (targetDisk) {
          targetDisk.remainingBytes -= file.sizeBytes
          return createFileMove(file, targetDisk.disk.path)
        } else {
          // No disk can fit this file
          return skipMove(
            createFileMove(file, file.diskPath),
            "No disk has enough space"
          )
        }
      })

      const moves = [...pass1Result.moves, ...pass2Moves]

      return {
        plan: createMovePlan(moves),
        placedFolders: pass1Result.placedFolders,
        explodedFolders: pass1Result.explodedFolders,
      }
    }),
})
