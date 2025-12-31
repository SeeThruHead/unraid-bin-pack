import type { FileEntry} from "./FileEntry"

export type MoveStatus = "pending" | "in_progress" | "completed" | "skipped" | "failed"

export interface FileMove {
  readonly file: FileEntry
  readonly targetDiskPath: string
  readonly destinationPath: string
  readonly status: MoveStatus
  readonly reason?: string
}

export interface MovePlan {
  readonly moves: readonly FileMove[]
  readonly summary: MoveSummary
}

export interface MoveSummary {
  readonly totalFiles: number
  readonly totalBytes: number
  readonly movesPerDisk: ReadonlyMap<string, number>
  readonly bytesPerDisk: ReadonlyMap<string, number>
}

export const createFileMove = (
  file: FileEntry,
  targetDiskPath: string
): FileMove => ({
  file,
  targetDiskPath,
  destinationPath: `${targetDiskPath}/${file.relativePath}`,
  status: "pending",
})

export const skipMove = (move: FileMove, reason: string): FileMove => ({
  ...move,
  status: "skipped",
  reason,
})

export const computeSummary = (moves: readonly FileMove[]): MoveSummary => {
  const pendingMoves = moves.filter((m) => m.status === "pending")

  const { movesPerDisk, bytesPerDisk } = pendingMoves.reduce(
    (acc, move) => {
      const disk = move.targetDiskPath
      acc.movesPerDisk.set(disk, (acc.movesPerDisk.get(disk) ?? 0) + 1)
      acc.bytesPerDisk.set(disk, (acc.bytesPerDisk.get(disk) ?? 0) + move.file.sizeBytes)
      return acc
    },
    {
      movesPerDisk: new Map<string, number>(),
      bytesPerDisk: new Map<string, number>(),
    }
  )

  return {
    totalFiles: pendingMoves.length,
    totalBytes: pendingMoves.reduce((acc, m) => acc + m.file.sizeBytes, 0),
    movesPerDisk,
    bytesPerDisk,
  }
}

export const createMovePlan = (moves: readonly FileMove[]): MovePlan => ({
  moves,
  summary: computeSummary(moves),
})
