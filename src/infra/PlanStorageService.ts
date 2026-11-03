/**
 * PlanStorageService - persists move plans to disk for plan/apply workflow.
 */

import { Context, Data, Effect } from "effect"
import type { MovePlan, FileMove } from "../domain/MovePlan"

// =============================================================================
// Service errors - all possible failure modes
// =============================================================================

export class PlanNotFound extends Data.TaggedError("PlanNotFound")<{
  readonly path: string
}> {}

export class PlanPermissionDenied extends Data.TaggedError("PlanPermissionDenied")<{
  readonly path: string
  readonly operation: "read" | "write"
}> {}

export class PlanParseError extends Data.TaggedError("PlanParseError")<{
  readonly path: string
  readonly reason: string
}> {}

export class PlanSaveFailed extends Data.TaggedError("PlanSaveFailed")<{
  readonly path: string
  readonly reason: string
}> {}

export class PlanLoadFailed extends Data.TaggedError("PlanLoadFailed")<{
  readonly path: string
  readonly reason: string
}> {}

export type PlanStorageError =
  | PlanNotFound
  | PlanPermissionDenied
  | PlanParseError
  | PlanSaveFailed
  | PlanLoadFailed

// =============================================================================
// Serializable plan format
// =============================================================================

/**
 * Plan format v3: Adds disk stats for destination disks.
 *
 * The moves object is keyed by absolute source path, making it impossible
 * to have duplicate entries for the same file regardless of any bugs in
 * the planning or execution code.
 */
export type SerializedPlan = {
  readonly version: 3
  readonly createdAt: string
  readonly sourceDisk: string
  /** Moves keyed by absolute source path - prevents duplicates by design */
  readonly moves: Record<string, SerializedMove>
  /** Disk stats for destination disks at plan creation time */
  readonly diskStats: Record<string, DiskStat>
}

type SerializedMove = {
  readonly sourceRelPath: string
  readonly sourceDisk: string
  readonly targetDisk: string
  readonly destAbsPath: string
  readonly sizeBytes: number
  readonly status: "pending" | "in_progress" | "completed" | "skipped" | "failed"
  readonly reason?: string
}

export type DiskStat = {
  readonly totalBytes: number
  readonly freeBytes: number
  readonly bytesToMove: number
}

// =============================================================================
// Service interface
// =============================================================================

export type MoveStatus = "completed" | "failed"

export type PlanStorageService = {
  readonly save: (
    plan: MovePlan,
    sourceDisk: string,
    diskStats: Record<string, DiskStat>,
    path: string
  ) => Effect.Effect<void, PlanStorageError>

  readonly load: (path: string) => Effect.Effect<SerializedPlan, PlanStorageError>

  readonly exists: (path: string) => Effect.Effect<boolean, PlanStorageError>

  /**
   * Update the status of a single move in the plan.
   * Used for progress tracking and resume support.
   */
  readonly updateMoveStatus: (
    path: string,
    sourceAbsPath: string,
    status: MoveStatus,
    error?: string
  ) => Effect.Effect<void, PlanStorageError>

  /**
   * Delete the plan file.
   * Called after all moves complete successfully.
   */
  readonly delete: (path: string) => Effect.Effect<void, PlanStorageError>

  readonly defaultPath: string
}

export class PlanStorageServiceTag extends Context.Service<PlanStorageServiceTag, PlanStorageService>()("PlanStorageService") {}

// =============================================================================
// Serialization
// =============================================================================

const serializeMove = (move: FileMove): SerializedMove => ({
  sourceRelPath: move.file.relativePath,
  sourceDisk: move.file.diskPath,
  targetDisk: move.targetDiskPath,
  destAbsPath: move.destinationPath,
  sizeBytes: move.file.sizeBytes,
  status: move.status,
  reason: move.reason,
})

const serializePlan = (plan: MovePlan, sourceDisk: string, diskStats: Record<string, DiskStat>): SerializedPlan => ({
  version: 3,
  createdAt: new Date().toISOString(),
  sourceDisk,
  // Build moves object keyed by source path - duplicates are impossible
  moves: plan.moves.reduce(
    (acc, move) => ({ ...acc, [move.file.absolutePath]: serializeMove(move) }),
    {} as Record<string, SerializedMove>
  ),
  diskStats,
})

// =============================================================================
// Exports for SQLite implementation (in SqlitePlanStorageService.ts)
// =============================================================================

export { serializePlan }
