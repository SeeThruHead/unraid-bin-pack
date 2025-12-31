import { Context, Data, Effect, Layer, pipe } from "effect"
import { FileSystem } from "@effect/platform"
import { DiskStatsServiceTag, DiskStatsServiceLive } from "../DiskStatsService"
import type { Disk } from "@domain/Disk"

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

export interface DiskService {
  readonly getStats: (path: string) => Effect.Effect<Disk, DiskError>
  readonly discover: (paths: string[]) => Effect.Effect<Disk[], DiskError>
  readonly autoDiscover: () => Effect.Effect<string[], DiskError>
}

export class DiskServiceTag extends Context.Tag("DiskService")<DiskServiceTag, DiskService>() {}

interface IOError {
  code?: string
  message?: string
}

const toDiskError = (path: string, error: unknown): DiskError => {
  const ioError = error as IOError
  const code = ioError.code?.toUpperCase()
  const message = String(ioError.message ?? error)

  if (code === "EACCES" || code === "EPERM") {
    return new DiskPermissionDenied({ path })
  }
  if (code === "ENOENT") {
    return new DiskNotFound({ path })
  }
  if (code === "ENOTDIR") {
    return new DiskNotADirectory({ path })
  }

  const lowerMessage = message.toLowerCase()
  if (lowerMessage.includes("eacces") || lowerMessage.includes("permission denied") || lowerMessage.includes("eperm")) {
    return new DiskPermissionDenied({ path })
  }
  if (lowerMessage.includes("enoent") || lowerMessage.includes("no such file")) {
    return new DiskNotFound({ path })
  }

  return new DiskStatsFailed({ path, reason: message })
}

export const DiskServiceLive = Layer.effect(
  DiskServiceTag,
  Effect.gen(function* () {
    const statsService = yield* DiskStatsServiceTag
    const fs = yield* FileSystem.FileSystem

    const validateDiskPath = (path: string): Effect.Effect<void, DiskError> =>
      pipe(
        Effect.gen(function* () {
          const exists = yield* fs.exists(path)
          if (!exists) {
            return yield* Effect.fail(new DiskNotFound({ path }))
          }

          const stat = yield* fs.stat(path)
          if (stat.type !== "Directory") {
            return yield* Effect.fail(new DiskNotADirectory({ path }))
          }

          if (path === "/") {
            return
          }

          const parentPath = path.replace(/\/[^/]+\/?$/, "") || "/"
          const parentStat = yield* fs.stat(parentPath)

          if (stat.dev === parentStat.dev) {
            return yield* Effect.fail(new DiskNotAMountPoint({ path }))
          }
        }),
        Effect.catchAll((e) => {
          if (e instanceof DiskNotFound || e instanceof DiskNotADirectory ||
              e instanceof DiskNotAMountPoint || e instanceof DiskPermissionDenied ||
              e instanceof DiskStatsFailed) {
            return Effect.fail(e)
          }
          return Effect.fail(toDiskError(path, e))
        })
      )

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

export const DiskServiceFullLive = pipe(DiskServiceLive, Layer.provide(DiskStatsServiceLive))
