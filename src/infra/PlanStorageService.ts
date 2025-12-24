/**
 * PlanStorageService - persists move plans to disk for plan/apply workflow.
 */

import { Context, Data, Effect, Layer, Match, pipe } from "effect"
import { FileSystem } from "@effect/platform"
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
// Error detection from @effect/platform errors
// =============================================================================

interface PlatformError {
  code?: string
  message?: string
}

type ErrorKind = "not_found" | "permission_denied" | "unknown"

const detectErrorKind = (error: unknown): { kind: ErrorKind; message: string } => {
  const platformError = error as PlatformError
  const code = platformError?.code?.toUpperCase()
  const message = String(platformError?.message ?? error)
  const lowerMessage = message.toLowerCase()

  // Check code first (most reliable)
  if (code === "ENOENT") {
    return { kind: "not_found", message }
  }
  if (code === "EACCES" || code === "EPERM") {
    return { kind: "permission_denied", message }
  }

  // Fallback to message parsing
  if (lowerMessage.includes("enoent") || lowerMessage.includes("no such file")) {
    return { kind: "not_found", message }
  }
  if (lowerMessage.includes("eacces") || lowerMessage.includes("permission denied") || lowerMessage.includes("eperm")) {
    return { kind: "permission_denied", message }
  }

  return { kind: "unknown", message }
}

// Pattern matchers for error transformation
const matchSaveError = (path: string) =>
  Match.type<{ kind: ErrorKind; message: string }>().pipe(
    Match.when({ kind: "permission_denied" }, () =>
      new PlanPermissionDenied({ path, operation: "write" })
    ),
    Match.orElse(({ message }) => new PlanSaveFailed({ path, reason: message }))
  )

const matchLoadError = (path: string) =>
  Match.type<{ kind: ErrorKind; message: string }>().pipe(
    Match.when({ kind: "not_found" }, () => new PlanNotFound({ path })),
    Match.when({ kind: "permission_denied" }, () =>
      new PlanPermissionDenied({ path, operation: "read" })
    ),
    Match.orElse(({ message }) => new PlanLoadFailed({ path, reason: message }))
  )

const matchDeleteError = (path: string) =>
  Match.type<{ kind: ErrorKind; message: string }>().pipe(
    Match.when({ kind: "not_found" }, () => new PlanNotFound({ path })),
    Match.when({ kind: "permission_denied" }, () =>
      new PlanPermissionDenied({ path, operation: "write" })
    ),
    Match.orElse(({ message }) => new PlanSaveFailed({ path, reason: message }))
  )

// =============================================================================
// Serializable plan format
// =============================================================================

/**
 * Plan format v2: Uses source path as key to prevent duplicates by structure.
 *
 * The moves object is keyed by absolute source path, making it impossible
 * to have duplicate entries for the same file regardless of any bugs in
 * the planning or execution code.
 */
export interface SerializedPlan {
  readonly version: 2
  readonly createdAt: string
  readonly spilloverDisk: string
  /** Moves keyed by absolute source path - prevents duplicates by design */
  readonly moves: Record<string, SerializedMove>
}

interface SerializedMove {
  readonly sourceRelPath: string
  readonly sourceDisk: string
  readonly targetDisk: string
  readonly destAbsPath: string
  readonly sizeBytes: number
  readonly status: "pending" | "in_progress" | "completed" | "skipped" | "failed"
  readonly reason?: string
}

// =============================================================================
// Service interface
// =============================================================================

export type MoveStatus = "completed" | "failed"

export interface PlanStorageService {
  readonly save: (
    plan: MovePlan,
    spilloverDisk: string,
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

export class PlanStorageServiceTag extends Context.Tag("PlanStorageService")<
  PlanStorageServiceTag,
  PlanStorageService
>() {}

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

const serializePlan = (plan: MovePlan, spilloverDisk: string): SerializedPlan => ({
  version: 2,
  createdAt: new Date().toISOString(),
  spilloverDisk,
  // Build moves object keyed by source path - duplicates are impossible
  moves: plan.moves.reduce(
    (acc, move) => ({ ...acc, [move.file.absolutePath]: serializeMove(move) }),
    {} as Record<string, SerializedMove>
  ),
})

// =============================================================================
// JSON file implementation
// =============================================================================

export const JsonPlanStorageService = Layer.effect(
  PlanStorageServiceTag,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const defaultPath = `/mnt/user/appdata/unraid-bin-pack/plan.json`

    /** Transform filesystem errors to typed PlanStorageError */
    const toSaveError = (path: string, error: unknown): PlanStorageError =>
      matchSaveError(path)(detectErrorKind(error))

    const toLoadError = (path: string, error: unknown): PlanStorageError =>
      matchLoadError(path)(detectErrorKind(error))

    const save: PlanStorageService["save"] = (plan, spilloverDisk, path) =>
      pipe(
        Effect.sync(() => serializePlan(plan, spilloverDisk)),
        Effect.flatMap((serialized) =>
          pipe(
            // Ensure directory exists
            fs.makeDirectory(`${path.substring(0, path.lastIndexOf("/"))}`, {
              recursive: true,
            }),
            Effect.catchAll(() => Effect.void), // Ignore if exists
            Effect.flatMap(() =>
              fs.writeFileString(path, JSON.stringify(serialized, null, 2))
            )
          )
        ),
        Effect.mapError((e) => toSaveError(path, e))
      )

    const load: PlanStorageService["load"] = (path) =>
      pipe(
        fs.readFileString(path),
        Effect.flatMap((content) =>
          Effect.try({
            try: () => JSON.parse(content) as SerializedPlan,
            catch: (e) =>
              new PlanParseError({ path, reason: e instanceof Error ? e.message : String(e) }),
          })
        ),
        Effect.mapError((e) => {
          // If it's already a PlanStorageError, pass through
          if (e instanceof PlanNotFound || e instanceof PlanPermissionDenied ||
              e instanceof PlanParseError || e instanceof PlanSaveFailed ||
              e instanceof PlanLoadFailed) {
            return e
          }
          return toLoadError(path, e)
        })
      )

    const exists: PlanStorageService["exists"] = (path) =>
      pipe(
        fs.exists(path),
        Effect.mapError((e) => matchLoadError(path)(detectErrorKind(e)))
      )

    const updateMoveStatus: PlanStorageService["updateMoveStatus"] = (
      path,
      sourceAbsPath,
      status,
      error
    ) =>
      pipe(
        load(path),
        Effect.flatMap((plan) => {
          const move = plan.moves[sourceAbsPath]
          if (!move) {
            return Effect.fail(
              new PlanLoadFailed({ path, reason: `Move not found: ${sourceAbsPath}` }) as PlanStorageError
            )
          }
          const updatedPlan: SerializedPlan = {
            ...plan,
            moves: {
              ...plan.moves,
              [sourceAbsPath]: {
                ...move,
                status,
                reason: error ?? move.reason,
              },
            },
          }
          return pipe(
            fs.writeFileString(path, JSON.stringify(updatedPlan, null, 2)),
            Effect.mapError((e) => toSaveError(path, e))
          )
        }),
        Effect.catchAll((e) => Effect.fail(e as PlanStorageError))
      )

    const deletePlan: PlanStorageService["delete"] = (path) =>
      pipe(
        fs.remove(path),
        Effect.mapError((e) => matchDeleteError(path)(detectErrorKind(e)))
      )

    return { defaultPath, save, load, exists, updateMoveStatus, delete: deletePlan }
  })
)
