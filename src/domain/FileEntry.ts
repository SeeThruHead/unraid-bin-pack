/**
 * Domain type for a file discovered during scanning.
 */

export interface FileEntry {
  /** Full absolute path to the file */
  readonly absolutePath: string
  /** Path relative to the disk root (for destination calculation) */
  readonly relativePath: string
  /** File size in bytes */
  readonly sizeBytes: number
  /** Disk path this file is on */
  readonly diskPath: string
}

/**
 * Calculate destination path if this file were moved to another disk.
 */
export const destinationPath = (file: FileEntry, destDiskPath: string): string =>
  `${destDiskPath}/${file.relativePath}`
