import { Context, Data, Effect, Layer, Match, pipe } from "effect"
import { GlobServiceTag, type GlobError } from "../GlobService"
import { FileStatServiceTag, type FileStatError } from "../FileStatService"
import type { FileEntry } from "@domain/FileEntry"

export class ScanPathNotFound extends Data.TaggedError("ScanPathNotFound")<{
  readonly path: string
}> {}

export class ScanPermissionDenied extends Data.TaggedError("ScanPermissionDenied")<{
  readonly path: string
}> {}

export class ScanFailed extends Data.TaggedError("ScanFailed")<{
  readonly path: string
  readonly reason: string
}> {}

export class FileStatFailed extends Data.TaggedError("FileStatFailed")<{
  readonly path: string
  readonly reason: string
}> {}

export type ScannerError = ScanPathNotFound | ScanPermissionDenied | ScanFailed | FileStatFailed

const fromGlobError = Match.typeTags<GlobError>()({
  GlobNotFound: (e) => new ScanPathNotFound({ path: e.path }),
  GlobPermissionDenied: (e) => new ScanPermissionDenied({ path: e.path }),
  GlobUnknownError: (e) => new ScanFailed({ path: e.path, reason: e.cause }),
})

const fromFileStatError = (path: string) =>
  Match.typeTags<FileStatError>()({
    FileNotFound: () => new ScanPathNotFound({ path }),
    FilePermissionDenied: () => new ScanPermissionDenied({ path }),
    FileStatUnknownError: (e) => new FileStatFailed({ path, reason: e.cause }),
  })

export interface ScannerService {
  readonly scanDisk: (
    diskPath: string,
    options?: { excludePatterns?: string[] }
  ) => Effect.Effect<FileEntry[], ScannerError>

  readonly scanAllDisks: (
    diskPaths: readonly string[],
    options?: { excludePatterns?: string[]; concurrency?: number }
  ) => Effect.Effect<FileEntry[], ScannerError>
}

export class ScannerServiceTag extends Context.Tag("ScannerService")<
  ScannerServiceTag,
  ScannerService
>() {}

export const ScannerServiceLive = Layer.effect(
  ScannerServiceTag,
  Effect.gen(function* () {
    const glob = yield* GlobServiceTag
    const fileStat = yield* FileStatServiceTag

    const statFile = (
      diskPath: string,
      relativePath: string
    ): Effect.Effect<FileEntry, ScannerError> => {
      const absolutePath = `${diskPath}/${relativePath}`
      return pipe(
        fileStat.stat(absolutePath),
        Effect.map((stat) => ({
          absolutePath,
          relativePath,
          sizeBytes: stat.size,
          diskPath,
        })),
        Effect.mapError(fromFileStatError(absolutePath))
      )
    }

    const scanDisk: ScannerService["scanDisk"] = (diskPath, options = {}) =>
      pipe(
        glob.scan("**/*", diskPath, { onlyFiles: true }),
        Effect.mapError(fromGlobError),
        Effect.map((paths) => {
          const excludePatterns = options.excludePatterns
          if (!excludePatterns?.length) return paths
          return paths.filter((p) =>
            !excludePatterns.some((pattern) => p.includes(pattern))
          )
        }),
        Effect.flatMap((relativePaths) =>
          Effect.forEach(relativePaths, (relPath) => statFile(diskPath, relPath), {
            concurrency: "unbounded",
          })
        )
      )

    const scanAllDisks: ScannerService["scanAllDisks"] = (
      diskPaths,
      options = {}
    ) =>
      pipe(
        Effect.forEach(
          diskPaths,
          (diskPath) => scanDisk(diskPath, { excludePatterns: options.excludePatterns }),
          { concurrency: options.concurrency ?? "unbounded" }
        ),
        Effect.map((nested) => nested.flat())
      )

    return { scanDisk, scanAllDisks }
  })
)
