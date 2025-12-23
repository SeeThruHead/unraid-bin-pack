/**
 * GlobService - abstracts file globbing for testability.
 *
 * Live implementation uses Bun.Glob.
 * All errors from Bun.Glob are caught and converted to typed errors.
 */

import { Context, Data, Effect, Layer } from "effect"

// =============================================================================
// Typed errors - all possible failures from Bun.Glob
// =============================================================================

export class GlobNotFound extends Data.TaggedError("GlobNotFound")<{
  readonly path: string
}> {}

export class GlobPermissionDenied extends Data.TaggedError("GlobPermissionDenied")<{
  readonly path: string
}> {}

export class GlobUnknownError extends Data.TaggedError("GlobUnknownError")<{
  readonly path: string
  readonly cause: string
}> {}

export type GlobError = GlobNotFound | GlobPermissionDenied | GlobUnknownError

// =============================================================================
// Service interface
// =============================================================================

export interface GlobService {
  readonly scan: (
    pattern: string,
    cwd: string,
    options?: { onlyFiles?: boolean }
  ) => Effect.Effect<string[], GlobError>
}

export class GlobServiceTag extends Context.Tag("GlobService")<
  GlobServiceTag,
  GlobService
>() {}

// =============================================================================
// Error detection from Bun.Glob errors
// =============================================================================

interface BunError {
  code?: string
  message?: string
}

const toGlobError = (path: string, error: unknown): GlobError => {
  const bunError = error as BunError
  const code = bunError?.code?.toUpperCase()

  if (code === "ENOENT") {
    return new GlobNotFound({ path })
  }

  if (code === "EACCES" || code === "EPERM") {
    return new GlobPermissionDenied({ path })
  }

  // Fallback to message parsing if no code
  const message = (bunError?.message ?? String(error)).toLowerCase()

  if (message.includes("enoent") || message.includes("no such file")) {
    return new GlobNotFound({ path })
  }

  if (message.includes("eacces") || message.includes("permission denied") || message.includes("eperm")) {
    return new GlobPermissionDenied({ path })
  }

  // Catchall for unexpected errors
  return new GlobUnknownError({ path, cause: bunError?.message ?? String(error) })
}

// =============================================================================
// Live implementation (Bun.Glob)
// =============================================================================

export const GlobServiceLive = Layer.succeed(GlobServiceTag, {
  scan: (pattern, cwd, options = {}) =>
    Effect.try({
      try: () => {
        const glob = new Bun.Glob(pattern)
        return Array.from(glob.scanSync({ cwd, onlyFiles: options.onlyFiles ?? true }))
      },
      catch: (error) => toGlobError(cwd, error),
    }),
})
