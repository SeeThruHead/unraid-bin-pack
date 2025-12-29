/**
 * WorldView - snapshot of disk and file state for consolidation
 */

import type { FileEntry } from "./FileEntry"

export interface DiskState {
  readonly path: string
  readonly totalBytes: number
  readonly freeBytes: number
}

export interface WorldView {
  readonly disks: ReadonlyArray<DiskState>
  readonly files: ReadonlyArray<FileEntry>
}
