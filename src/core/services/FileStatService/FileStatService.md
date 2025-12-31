# FileStatService

Retrieve file metadata and statistics.

## Overview

FileStatService fetches file metadata (size, permissions, timestamps) from the filesystem.

## Service Interface

```typescript
interface FileStatService {
  readonly getStat: (path: string) => Effect<FileStat, FileStatError>;
}

interface FileStat {
  readonly sizeBytes: number;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  // ... other stat fields
}
```

## Usage

```typescript
import { Effect } from "effect";
import { FileStatServiceTag } from "@services/FileStatService";

const program = Effect.gen(function* () {
  const fileStat = yield* FileStatServiceTag;

  const stat = yield* fileStat.getStat("/mnt/disk1/movie.mkv");

  console.log(`Size: ${stat.sizeBytes} bytes`);
  console.log(`Is file: ${stat.isFile}`);
  console.log(`Is directory: ${stat.isDirectory}`);
});
```

## Error Handling

```typescript
const program = Effect.gen(function* () {
  const fileStat = yield* FileStatServiceTag;

  const stat = yield* fileStat.getStat("/path/to/file").pipe(
    Effect.catchTags({
      FileNotFound: () => Effect.fail(new Error("File not found")),
      FilePermissionDenied: () => Effect.fail(new Error("Permission denied"))
    })
  );

  return stat;
});
```

## Common Uses

- Getting file sizes for `FileEntry` creation
- Checking if paths are files or directories
- Verifying file accessibility

## See Also

- [FileEntry](../../domain/FileEntry.md) - Uses file stats
- [ScannerService](../ScannerService/ScannerService.md) - Uses FileStatService
