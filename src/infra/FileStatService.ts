/**
 * FileStatService - wraps file stat operations for testability.
 *
 * Live implementation uses @effect/platform FileSystem.
 * All errors are caught and converted to typed errors.
 */

import { Context, Data, Effect, FileSystem, Layer, Match, pipe, type PlatformError } from "effect"

// =============================================================================
// Typed errors - all possible failures from fs.stat
// =============================================================================

export class FileNotFound extends Data.TaggedError("FileNotFound")<{
  readonly path: string
}> {}

export class FilePermissionDenied extends Data.TaggedError("FilePermissionDenied")<{
  readonly path: string
}> {}

export class FileStatUnknownError extends Data.TaggedError("FileStatUnknownError")<{
  readonly path: string
  readonly cause: string
}> {}

export type FileStatError = FileNotFound | FilePermissionDenied | FileStatUnknownError

// =============================================================================
// Service interface
// =============================================================================

export type FileStatService = {
  readonly stat: (path: string) => Effect.Effect<{ size: number }, FileStatError>
}

export class FileStatServiceTag extends Context.Service<FileStatServiceTag, FileStatService>()("FileStatService") {}

// =============================================================================
// Error detection from @effect/platform errors
// =============================================================================

const toFileStatError = (path: string, error: PlatformError.PlatformError): FileStatError =>
  Match.value(error.reason._tag).pipe(
    Match.when("NotFound", () => new FileNotFound({ path })),
    Match.when("PermissionDenied", () => new FilePermissionDenied({ path })),
    Match.orElse(() => new FileStatUnknownError({ path, cause: error.message }))
  )

// =============================================================================
// Live implementation (uses @effect/platform FileSystem)
// =============================================================================

export const FileStatServiceLive = Layer.effect(
  FileStatServiceTag,
  pipe(
    FileSystem.FileSystem,
    Effect.map((fs) => ({
      stat: (path: string) =>
        pipe(
          fs.stat(path),
          Effect.mapBoth({
            onSuccess: (s) => ({ size: Number(s.size) }),
            onFailure: (e) => toFileStatError(path, e),
          })
        ),
    }))
  )
)
