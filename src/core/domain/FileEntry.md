# FileEntry

A `FileEntry` represents metadata about a single file on disk.

## Type

```typescript
interface FileEntry {
  readonly absolutePath: string; // Full path including disk mount
  readonly relativePath: string; // Path relative to disk mount
  readonly sizeBytes: number; // File size in bytes
  readonly diskPath: string; // Mount point of containing disk
}
```

## Fields

### `absolutePath`

The complete file path including the disk mount point.

Example: `/mnt/disk1/movies/action/movie1.mkv`

### `relativePath`

The path relative to the disk mount, used for constructing destination paths when moving files.

Example: `movies/action/movie1.mkv`

This ensures files maintain their directory structure when moved to other disks.

### `sizeBytes`

File size in bytes. Used by the bin-packing algorithm to find optimal file combinations.

### `diskPath`

The mount point of the disk containing this file.

Example: `/mnt/disk1`

## Usage

File entries are typically created by the `ScannerService` when scanning disks:

```typescript
import { Effect } from "effect";
import { ScannerServiceTag } from "@services/ScannerService";

const program = Effect.gen(function* () {
  const scanner = yield* ScannerServiceTag;

  // Scan disk and get all file entries
  const worldView = yield* scanner.scan(["/mnt/disk1", "/mnt/disk2"]);

  worldView.files.forEach((file) => {
    console.log(`${file.relativePath}: ${file.sizeBytes} bytes`);
  });
});
```

## See Also

- [WorldView](./WorldView.md) - Contains collections of FileEntry
- [ScannerService](../services/ScannerService/ScannerService.md) - Creates FileEntry objects
- [FileFilter](./FileFilter.md) - Filters FileEntry collections
