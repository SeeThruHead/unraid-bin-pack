import { Array, Order, pipe } from "effect"
import type { DiskState } from "./WorldView"
import type { FileEntry } from "./FileEntry"

export interface DiskWithUsage extends DiskState {
  readonly usedBytes: number
  readonly usedPct: number
}

export const calculateDiskUsage = (disk: DiskState): DiskWithUsage => {
  const usedBytes = disk.totalBytes - disk.freeBytes
  const usedPct = disk.totalBytes > 0 ? (usedBytes / disk.totalBytes) * 100 : 0
  return { ...disk, usedBytes, usedPct }
}

export const hasFilesOnDisk = (disk: DiskState, files: readonly FileEntry[]): boolean =>
  files.some(file => file.diskPath === disk.path)

export const rankDisksByFullness = (
  disks: readonly DiskState[],
  files: readonly FileEntry[]
): readonly DiskWithUsage[] =>
  pipe(
    disks,
    Array.map(calculateDiskUsage),
    Array.filter(disk => hasFilesOnDisk(disk, files)),
    Array.sort(Order.mapInput(Order.number, (d: DiskWithUsage) => d.usedPct))
  )
