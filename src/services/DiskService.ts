/**
 * DiskService - high-level disk operations.
 *
 * Exposes typed errors for all failure modes. Callers don't need to know
 * about the underlying infra services (DiskStatsService, FileSystem).
 */

import { Context, Data, Effect, Layer, pipe } from "effect"
import { FileSystem } from "@effect/platform"
import { DiskStatsServiceTag, DiskStatsServiceLive } from "../infra/DiskStatsService"
import type { Disk } from "../domain/Disk"

// =============================================================================
// Service errors - all possible failure modes
// =============================================================================

export class DiskNotFound extends Data.TaggedError("DiskNotFound")<{
  readonly path: string
}> {}

export class DiskNotADirectory extends Data.TaggedError("DiskNotADirectory")<{
  readonly path: string
}> {}

export class DiskNotAMountPoint extends Data.TaggedError("DiskNotAMountPoint")<{
  readonly path: string
}> {}

export class DiskPermissionDenied extends Data.TaggedError("DiskPermissionDenied")<{
  readonly path: string
}> {}

export class DiskStatsFailed extends Data.TaggedError("DiskStatsFailed")<{
  readonly path: string
  readonly reason: string
}> {}

export type DiskError =
  | DiskNotFound
  | DiskNotADirectory
  | DiskNotAMountPoint
  | DiskPermissionDenied
  | DiskStatsFailed

// =============================================================================
// Service interface
// =============================================================================

export interface DiskService {
  readonly getStats: (path: string) => Effect.Effect<Disk, DiskError>
  readonly discover: (paths: string[]) => Effect.Effect<Disk[], DiskError>
  readonly autoDiscover: () => Effect.Effect<string[], DiskError>
}

export class DiskServiceTag extends Context.Tag("DiskService")<DiskServiceTag, DiskService>() {}

// =============================================================================
// Helpers
// =============================================================================

interface IOError {
  code?: string
  message?: string
}

/** Transform any caught error into a DiskError */
const toDiskError = (path: string, error: unknown): DiskError => {
  const ioError = error as IOError
  const code = ioError?.code?.toUpperCase()
  const message = String(ioError?.message ?? error)

  // Check error code first (most reliable)
  if (code === "EACCES" || code === "EPERM") {
    return new DiskPermissionDenied({ path })
  }
  if (code === "ENOENT") {
    return new DiskNotFound({ path })
  }
  if (code === "ENOTDIR") {
    return new DiskNotADirectory({ path })
  }

  // Fallback to message parsing
  const lowerMessage = message.toLowerCase()
  if (lowerMessage.includes("eacces") || lowerMessage.includes("permission denied") || lowerMessage.includes("eperm")) {
    return new DiskPermissionDenied({ path })
  }
  if (lowerMessage.includes("enoent") || lowerMessage.includes("no such file")) {
    return new DiskNotFound({ path })
  }

  return new DiskStatsFailed({ path, reason: message })
}

// =============================================================================
// Live implementation
// =============================================================================

export const DiskServiceLive = Layer.effect(
  DiskServiceTag,
  Effect.gen(function* () {
    const statsService = yield* DiskStatsServiceTag
    const fs = yield* FileSystem.FileSystem

    /**
     * Validate that a path exists, is a directory, and is a mount point.
     * Transforms all infra errors into typed DiskErrors.
     */
    const validateDiskPath = (path: string): Effect.Effect<void, DiskError> =>
      pipe(
        Effect.gen(function* () {
          // Check path exists
          const exists = yield* fs.exists(path)
          if (!exists) {
            return yield* Effect.fail(new DiskNotFound({ path }))
          }

          // Check it's a directory
          const stat = yield* fs.stat(path)
          if (stat.type !== "Directory") {
            return yield* Effect.fail(new DiskNotADirectory({ path }))
          }

          // Root "/" is always a valid mount point
          if (path === "/") {
            return
          }

          // Check it's a mount point (device ID differs from parent)
          const parentPath = path.replace(/\/[^/]+\/?$/, "") || "/"
          const parentStat = yield* fs.stat(parentPath)

          if (stat.dev === parentStat.dev) {
            return yield* Effect.fail(new DiskNotAMountPoint({ path }))
          }
        }),
        // Catch any FileSystem errors and transform to DiskError
        Effect.catchAll((e) => {
          // If it's already a DiskError, pass it through
          if (e instanceof DiskNotFound || e instanceof DiskNotADirectory ||
              e instanceof DiskNotAMountPoint || e instanceof DiskPermissionDenied ||
              e instanceof DiskStatsFailed) {
            return Effect.fail(e)
          }
          return Effect.fail(toDiskError(path, e))
        })
      )

    /**
     * Get stats for a disk, transforming infra errors to service errors.
     */
    const getStats = (path: string): Effect.Effect<Disk, DiskError> =>
      pipe(
        validateDiskPath(path),
        Effect.flatMap(() =>
          pipe(
            statsService.getStats(path),
            Effect.map(({ free, size }) => ({
              path,
              totalBytes: size,
              freeBytes: free,
            })),
            // Transform DiskStatsService errors
            Effect.catchAll((e) => Effect.fail(toDiskError(path, e)))
          )
        )
      )

    return {
      getStats,

      discover: (paths: string[]) =>
        Effect.all(paths.map(getStats), { concurrency: "unbounded" }),

      autoDiscover: () =>
        pipe(
          fs.readDirectory("/mnt"),
          Effect.map((entries) =>
            entries
              .filter((name) => /^disk\d+$/.test(name))
              .map((name) => `/mnt/${name}`)
              .sort((a, b) => {
                // Sort numerically: disk1, disk2, disk10
                const numA = parseInt(a.replace("/mnt/disk", ""), 10)
                const numB = parseInt(b.replace("/mnt/disk", ""), 10)
                return numA - numB
              })
          ),
          Effect.catchAll((e) => Effect.fail(toDiskError("/mnt", e)))
        ),
    }
  })
)

// =============================================================================
// Full live layer (DiskService + DiskStatsService)
// =============================================================================

export const DiskServiceFullLive = pipe(DiskServiceLive, Layer.provide(DiskStatsServiceLive))
