import { Context, Data, Effect, Layer, pipe } from "effect";
import { FileSystem } from "@effect/platform";

export class FileNotFound extends Data.TaggedError("FileNotFound")<{
  readonly path: string;
}> {}

export class FilePermissionDenied extends Data.TaggedError("FilePermissionDenied")<{
  readonly path: string;
}> {}

export class FileStatUnknownError extends Data.TaggedError("FileStatUnknownError")<{
  readonly path: string;
  readonly cause: string;
}> {}

export type FileStatError = FileNotFound | FilePermissionDenied | FileStatUnknownError;

export interface FileStatService {
  readonly stat: (path: string) => Effect.Effect<{ size: number }, FileStatError>;
}

export class FileStatServiceTag extends Context.Tag("FileStatService")<
  FileStatServiceTag,
  FileStatService
>() {}

interface PlatformError {
  code?: string;
  message?: string;
  _tag?: string;
}

const toFileStatError = (path: string, error: unknown): FileStatError => {
  const platformError = error as PlatformError;
  const code = platformError.code?.toUpperCase();

  if (code === "ENOENT") {
    return new FileNotFound({ path });
  }

  if (code === "EACCES" || code === "EPERM") {
    return new FilePermissionDenied({ path });
  }

  const message = String(platformError.message ?? error).toLowerCase();

  if (message.includes("enoent") || message.includes("no such file")) {
    return new FileNotFound({ path });
  }

  if (
    message.includes("eacces") ||
    message.includes("permission denied") ||
    message.includes("eperm")
  ) {
    return new FilePermissionDenied({ path });
  }

  return new FileStatUnknownError({ path, cause: String(platformError.message ?? error) });
};

export const FileStatServiceLive = Layer.effect(
  FileStatServiceTag,
  pipe(
    FileSystem.FileSystem,
    Effect.map((fs) => ({
      stat: (path: string) =>
        pipe(
          fs.stat(path),
          Effect.map((s) => ({ size: Number(s.size) })),
          Effect.mapError((e) => toFileStatError(path, e))
        )
    }))
  )
);
