/**
 * DiskStatsService - wraps check-disk-space for testability.
 *
 * Live implementation uses check-disk-space npm package.
 * All errors are caught and converted to typed errors.
 *
 * NOTE: check-disk-space finds the parent mount point for any path,
 * so it rarely fails even for non-existent paths. Path validation
 * should happen at the service layer using FileSystem.
 */

import { Context, Data, Effect, Layer, pipe } from "effect"
import checkDiskSpace from "check-disk-space"

// =============================================================================
// Typed errors - all possible failures from check-disk-space
// =============================================================================

export class DiskStatsPermissionDenied extends Data.TaggedError("DiskStatsPermissionDenied")<{
  readonly path: string
}> {}

export class DiskStatsUnknownError extends Data.TaggedError("DiskStatsUnknownError")<{
  readonly path: string
  readonly cause: string
}> {}

export type DiskStatsError = DiskStatsPermissionDenied | DiskStatsUnknownError

// =============================================================================
// Service interface
// =============================================================================

export interface DiskStatsService {
  readonly getStats: (path: string) => Effect.Effect<{ free: number; size: number }, DiskStatsError>
}

export class DiskStatsServiceTag extends Context.Tag("DiskStatsService")<
  DiskStatsServiceTag,
  DiskStatsService
>() {}

// =============================================================================
// Error detection from check-disk-space errors
// =============================================================================

interface CheckDiskError {
  code?: string
  message?: string
}

const toDiskStatsError = (path: string, error: unknown): DiskStatsError => {
  const diskError = error as CheckDiskError
  const code = diskError?.code?.toUpperCase()

  if (code === "EACCES" || code === "EPERM") {
    return new DiskStatsPermissionDenied({ path })
  }

  // Fallback to message parsing
  const message = String(diskError?.message ?? error).toLowerCase()

  if (message.includes("eacces") || message.includes("permission denied") || message.includes("eperm")) {
    return new DiskStatsPermissionDenied({ path })
  }

  // Catchall - check-disk-space rarely fails, most errors are unexpected
  return new DiskStatsUnknownError({ path, cause: String(diskError?.message ?? error) })
}

// =============================================================================
// Live implementation (check-disk-space)
// =============================================================================

export const DiskStatsServiceLive = Layer.succeed(DiskStatsServiceTag, {
  getStats: (path) =>
    pipe(
      Effect.tryPromise({
        try: () => checkDiskSpace(path),
        catch: (e) => toDiskStatsError(path, e),
      }),
      Effect.map(({ free, size }) => ({ free, size }))
    ),
})
