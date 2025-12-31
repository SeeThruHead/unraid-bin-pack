import { Context, Data, Effect, Layer, pipe } from "effect";
import checkDiskSpace from "check-disk-space";

export class DiskStatsPermissionDenied extends Data.TaggedError("DiskStatsPermissionDenied")<{
  readonly path: string;
}> {}

export class DiskStatsUnknownError extends Data.TaggedError("DiskStatsUnknownError")<{
  readonly path: string;
  readonly cause: string;
}> {}

export type DiskStatsError = DiskStatsPermissionDenied | DiskStatsUnknownError;

export interface DiskStatsService {
  readonly getStats: (
    path: string
  ) => Effect.Effect<{ free: number; size: number }, DiskStatsError>;
}

export class DiskStatsServiceTag extends Context.Tag("DiskStatsService")<
  DiskStatsServiceTag,
  DiskStatsService
>() {}

interface CheckDiskError {
  code?: string;
  message?: string;
}

const toDiskStatsError = (path: string, error: unknown): DiskStatsError => {
  const diskError = error as CheckDiskError;
  const code = diskError.code?.toUpperCase();

  if (code === "EACCES" || code === "EPERM") {
    return new DiskStatsPermissionDenied({ path });
  }

  const message = String(diskError.message ?? error).toLowerCase();

  if (
    message.includes("eacces") ||
    message.includes("permission denied") ||
    message.includes("eperm")
  ) {
    return new DiskStatsPermissionDenied({ path });
  }

  return new DiskStatsUnknownError({ path, cause: String(diskError.message ?? error) });
};

export const DiskStatsServiceLive = Layer.succeed(DiskStatsServiceTag, {
  getStats: (path) =>
    pipe(
      Effect.tryPromise({
        try: () => checkDiskSpace(path),
        catch: (e) => toDiskStatsError(path, e)
      }),
      Effect.map(({ free, size }) => ({ free, size }))
    )
});
