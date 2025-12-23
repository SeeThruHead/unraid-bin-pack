/**
 * FolderGroup - represents a group of files under a common folder.
 *
 * Used for hybrid bin-packing: pack folders first, then individual files.
 *
 * Size-based heuristics:
 * - If largest file is >= folderThreshold (90%) of folder size, keep together
 * - If folder is smaller than minSplitSize (1GB), never split
 * - Otherwise, folder can be exploded into individual files
 */

import type { FileEntry } from "./FileEntry"

// =============================================================================
// Types
// =============================================================================

export interface FolderGroup {
  /** The immediate parent folder path (relative to disk root) */
  readonly folderPath: string
  /** All files in this folder */
  readonly files: readonly FileEntry[]
  /** Total size of all files */
  readonly totalBytes: number
  /** Size of the largest file in the folder */
  readonly largestFileBytes: number
  /** Whether this folder should be kept together (not split) */
  readonly keepTogether: boolean
}

export interface FolderGroupOptions {
  /** Folders smaller than this are never split (default: 1GB) */
  readonly minSplitSizeBytes: number
  /** If largest file is >= this % of total, keep folder together (default: 0.9) */
  readonly folderThreshold: number
}

const DEFAULT_OPTIONS: FolderGroupOptions = {
  minSplitSizeBytes: 1024 * 1024 * 1024, // 1GB
  folderThreshold: 0.9,
}

// =============================================================================
// Constructors
// =============================================================================

/**
 * Group files by their immediate parent folder.
 *
 * Examples:
 *   movies/Inception/movie.mkv     → folder: "movies/Inception"
 *   movies/Inception/extras.mkv    → folder: "movies/Inception"
 *   anime/show1/season1/ep01.mkv   → folder: "anime/show1/season1"
 *   photo.jpg                      → folder: "" (root)
 *
 * Then applies size-based heuristics to determine if each folder should
 * be kept together or can be split.
 */
export const groupByImmediateFolder = (
  files: readonly FileEntry[],
  options: FolderGroupOptions = DEFAULT_OPTIONS
): FolderGroup[] => {
  // Group files by folder path using reduce
  const groups = files.reduce((acc, file) => {
    const lastSlash = file.relativePath.lastIndexOf("/")
    const folder = lastSlash === -1 ? "" : file.relativePath.slice(0, lastSlash)
    const existing = acc.get(folder) ?? []
    acc.set(folder, [...existing, file])
    return acc
  }, new Map<string, FileEntry[]>())

  return Array.from(groups.entries()).map(([folderPath, folderFiles]) => {
    const totalBytes = folderFiles.reduce((sum, f) => sum + f.sizeBytes, 0)
    const largestFileBytes = Math.max(...folderFiles.map((f) => f.sizeBytes))

    // Determine if folder should be kept together
    const keepTogether =
      // Small folders are never split
      totalBytes < options.minSplitSizeBytes ||
      // If one file dominates, keep together (movie-like folders)
      largestFileBytes / totalBytes >= options.folderThreshold

    return {
      folderPath,
      files: folderFiles,
      totalBytes,
      largestFileBytes,
      keepTogether,
    }
  })
}

/**
 * @deprecated Use groupByImmediateFolder instead. This groups too coarsely.
 */
export const groupByTopLevelFolder = (files: readonly FileEntry[]): FolderGroup[] => {
  const groups = files.reduce((acc, file) => {
    const firstSlash = file.relativePath.indexOf("/")
    const folder = firstSlash === -1 ? "" : file.relativePath.slice(0, firstSlash)
    const existing = acc.get(folder) ?? []
    acc.set(folder, [...existing, file])
    return acc
  }, new Map<string, FileEntry[]>())

  return Array.from(groups.entries()).map(([folderPath, folderFiles]) => {
    const totalBytes = folderFiles.reduce((sum, f) => sum + f.sizeBytes, 0)
    const largestFileBytes = Math.max(...folderFiles.map((f) => f.sizeBytes))
    return {
      folderPath,
      files: folderFiles,
      totalBytes,
      largestFileBytes,
      keepTogether: true, // Old behavior: always keep together
    }
  })
}

/**
 * Sort folders by total size descending (for best-fit packing).
 */
export const sortBySize = (folders: readonly FolderGroup[]): FolderGroup[] =>
  [...folders].sort((a, b) => b.totalBytes - a.totalBytes)
