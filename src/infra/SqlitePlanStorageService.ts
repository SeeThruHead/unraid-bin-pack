/**
 * SqlitePlanStorageService - SQLite-based plan storage for concurrent-safe progress tracking.
 *
 * Uses Bun's built-in SQLite for:
 * - Atomic per-move status updates (no read-modify-write races)
 * - Transaction support for batch operations
 * - Efficient queries for pending/completed/failed moves
 */

import { Database } from "bun:sqlite"
import { Effect, Layer, Match, pipe } from "effect"
import {
  PlanStorageServiceTag,
  type PlanStorageService,
  type SerializedPlan,
  PlanNotFound,
  PlanPermissionDenied,
  PlanSaveFailed,
  PlanLoadFailed,
  type PlanStorageError,
} from "./PlanStorageService"

// =============================================================================
// Database schema
// =============================================================================

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS plan_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL DEFAULT 2,
    created_at TEXT NOT NULL,
    spillover_disk TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS moves (
    source_abs_path TEXT PRIMARY KEY,
    source_rel_path TEXT NOT NULL,
    source_disk TEXT NOT NULL,
    target_disk TEXT NOT NULL,
    dest_abs_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed')),
    reason TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_moves_status ON moves(status);
`

// =============================================================================
// Error detection
// =============================================================================

const detectErrorKind = (
  error: unknown
): { kind: "not_found" | "permission_denied" | "unknown"; message: string } => {
  const message = error instanceof Error ? error.message : String(error)
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.includes("enoent") || lowerMessage.includes("no such file")) {
    return { kind: "not_found", message }
  }
  if (
    lowerMessage.includes("eacces") ||
    lowerMessage.includes("permission denied") ||
    lowerMessage.includes("eperm")
  ) {
    return { kind: "permission_denied", message }
  }

  return { kind: "unknown", message }
}

type ErrorKind = "not_found" | "permission_denied" | "unknown"

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
// SQLite implementation
// =============================================================================

export const SqlitePlanStorageService = Layer.succeed(
  PlanStorageServiceTag,
  (() => {
    const defaultPath = `/mnt/user/appdata/unraid-bin-pack/plan.db`

    const openDb = (path: string): Effect.Effect<Database, PlanStorageError> =>
      Effect.try({
        try: () => {
          const db = new Database(path, { create: true })
          db.exec(SCHEMA)
          return db
        },
        catch: (e) => matchSaveError(path)(detectErrorKind(e)),
      })

    const save: PlanStorageService["save"] = (plan, spilloverDisk, path) =>
      pipe(
        openDb(path),
        Effect.flatMap((db) =>
          Effect.try({
            try: () => {
              db.transaction(() => {
                // Clear existing data
                db.run("DELETE FROM plan_meta")
                db.run("DELETE FROM moves")

                // Insert plan metadata
                db.run(
                  "INSERT INTO plan_meta (id, version, created_at, spillover_disk) VALUES (1, 2, ?, ?)",
                  [new Date().toISOString(), spilloverDisk]
                )

                // Insert moves
                const insertMove = db.prepare(`
                  INSERT INTO moves (source_abs_path, source_rel_path, source_disk, target_disk, dest_abs_path, size_bytes, status, reason)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `)

                for (const move of plan.moves) {
                  insertMove.run(
                    move.file.absolutePath,
                    move.file.relativePath,
                    move.file.diskPath,
                    move.targetDiskPath,
                    move.destinationPath,
                    move.file.sizeBytes,
                    move.status,
                    move.reason ?? null
                  )
                }
              })()
              db.close()
            },
            catch: (e) => new PlanSaveFailed({ path, reason: String(e) }),
          })
        )
      )

    const load: PlanStorageService["load"] = (path) =>
      Effect.try({
        try: () => {
          // Check if file exists first
          const file = Bun.file(path)
          if (file.size === 0) {
            throw new PlanNotFound({ path })
          }

          const db = new Database(path, { readonly: true })

          const meta = db.query("SELECT * FROM plan_meta WHERE id = 1").get() as {
            version: number
            created_at: string
            spillover_disk: string
          } | null

          if (!meta) {
            db.close()
            throw new PlanLoadFailed({ path, reason: "No plan metadata found" })
          }

          const rows = db.query("SELECT * FROM moves").all() as Array<{
            source_abs_path: string
            source_rel_path: string
            source_disk: string
            target_disk: string
            dest_abs_path: string
            size_bytes: number
            status: string
            reason: string | null
          }>

          db.close()

          const moves: SerializedPlan["moves"] = {}
          for (const row of rows) {
            moves[row.source_abs_path] = {
              sourceRelPath: row.source_rel_path,
              sourceDisk: row.source_disk,
              targetDisk: row.target_disk,
              destAbsPath: row.dest_abs_path,
              sizeBytes: row.size_bytes,
              status: row.status as "pending" | "in_progress" | "completed" | "skipped" | "failed",
              reason: row.reason ?? undefined,
            }
          }

          return {
            version: 2 as const,
            createdAt: meta.created_at,
            spilloverDisk: meta.spillover_disk,
            moves,
          }
        },
        catch: (e) => {
          // Pass through our typed errors
          if (e instanceof PlanNotFound || e instanceof PlanLoadFailed) return e
          return matchLoadError(path)(detectErrorKind(e))
        },
      })

    const exists: PlanStorageService["exists"] = (path) =>
      Effect.try({
        try: () => {
          const file = Bun.file(path)
          return file.size > 0
        },
        catch: () => false,
      }).pipe(Effect.catchAll(() => Effect.succeed(false)))

    const updateMoveStatus: PlanStorageService["updateMoveStatus"] = (
      path,
      sourceAbsPath,
      status,
      error
    ) =>
      Effect.try({
        try: () => {
          const db = new Database(path)
          const result = db.run(
            "UPDATE moves SET status = ?, reason = COALESCE(?, reason) WHERE source_abs_path = ?",
            [status, error ?? null, sourceAbsPath]
          )
          db.close()

          if (result.changes === 0) {
            throw new PlanLoadFailed({ path, reason: `Move not found: ${sourceAbsPath}` })
          }
        },
        catch: (e) => {
          if (e instanceof PlanLoadFailed) return e
          return matchDeleteError(path)(detectErrorKind(e))
        },
      })

    const deletePlan: PlanStorageService["delete"] = (path) =>
      Effect.try({
        try: () => {
          const file = Bun.file(path)
          if (file.size > 0) {
            require("fs").unlinkSync(path)
          }
        },
        catch: (e) => matchDeleteError(path)(detectErrorKind(e)),
      })

    return {
      defaultPath,
      save,
      load,
      exists,
      updateMoveStatus,
      delete: deletePlan,
    }
  })()
)
