/**
 * WorldView - snapshot of disk and file state for consolidation
 */

import type { FileEntry } from "./FileEntry"

export type DiskState = {
  readonly path: string
  readonly totalBytes: number
  readonly freeBytes: number
}

export type WorldView = {
  readonly disks: ReadonlyArray<DiskState>
  readonly files: ReadonlyArray<FileEntry>
}
