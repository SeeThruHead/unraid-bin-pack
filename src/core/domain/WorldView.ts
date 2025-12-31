import type { FileEntry } from "./FileEntry"
import type { FileMove } from "./MovePlan"

export interface DiskState {
  readonly path: string
  readonly totalBytes: number
  readonly freeBytes: number
}

export interface WorldView {
  readonly disks: ReadonlyArray<DiskState>
  readonly files: ReadonlyArray<FileEntry>
}

/**
 * Apply a file move to the WorldView, returning a new WorldView with updated disk states and file locations.
 * This is used for iterative consolidation where we apply moves and recalculate after each move.
 */
export const applyMove = (worldView: WorldView, move: FileMove): WorldView => {
  const updatedDisks = worldView.disks.map(disk => {
    if (disk.path === move.file.diskPath) {
      // Source disk - free up space
      return { ...disk, freeBytes: disk.freeBytes + move.file.sizeBytes }
    } else if (disk.path === move.targetDiskPath) {
      // Destination disk - use space
      return { ...disk, freeBytes: disk.freeBytes - move.file.sizeBytes }
    }
    return disk
  })

  const updatedFiles = worldView.files.map(file => {
    if (file.absolutePath === move.file.absolutePath) {
      // Update file location
      return {
        ...file,
        diskPath: move.targetDiskPath,
        absolutePath: move.destinationPath,
      }
    }
    return file
  })

  return {
    disks: updatedDisks,
    files: updatedFiles,
  }
}
