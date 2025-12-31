# ScannerService

The `ScannerService` scans disk paths and discovers all files, creating a collection of `FileEntry` objects.

## Service Interface

```typescript
interface ScannerService {
  readonly scanDisk: (
    diskPath: string,
    options?: { excludePatterns?: string[] }
  ) => Effect<FileEntry[], ScannerError>

  readonly scanAllDisks: (
    diskPaths: readonly string[],
    options?: { excludePatterns?: string[]; concurrency?: number }
  ) => Effect<FileEntry[], ScannerError>
}
```

## Methods

### `scanDisk(diskPath, options?)`

Scans a single disk and returns all files found.

**Parameters:**
- `diskPath`: Mount point to scan (e.g., `/mnt/disk1`)
- `options.excludePatterns`: Optional glob patterns to exclude (e.g., `['**/*.tmp']`)

**Returns:**
- `Effect<FileEntry[], ScannerError>`

**Errors:**
- `ScanPathNotFound`: Disk path doesn't exist
- `ScanPermissionDenied`: Insufficient permissions
- `ScanFailed`: Other scan failures
- `FileStatFailed`: Unable to stat a file

### `scanAllDisks(diskPaths, options?)`

Scans multiple disks and combines all files into a single array.

**Parameters:**
- `diskPaths`: Array of disk mount points
- `options.excludePatterns`: Optional glob patterns to exclude
- `options.concurrency`: Max concurrent disk scans (default: unlimited)

**Returns:**
- `Effect<FileEntry[], ScannerError>`

## Examples

### Scan Single Disk

<<< @/src/services/ScannerService/ScannerService.example.ts#scanSingleDisk

### Scan Multiple Disks

<<< @/src/services/ScannerService/ScannerService.example.ts#scanMultipleDisks

### With Exclude Patterns

<<< @/src/services/ScannerService/ScannerService.example.ts#scanWithExcludes

### With Concurrency Control

<<< @/src/services/ScannerService/ScannerService.example.ts#scanWithConcurrency

### Error Handling

<<< @/src/services/ScannerService/ScannerService.example.ts#handleScanErrors

## How It Works

1. **Glob Discovery**: Uses `GlobService` to find all files under the disk path
2. **File Stats**: Uses `FileStatService` to get metadata for each file
3. **Path Parsing**: Extracts relative paths and disk paths
4. **Filtering**: Applies exclude patterns if specified
5. **Aggregation**: Combines results from all disks

## Exclude Patterns

Exclude patterns use glob syntax:

- `**/*.tmp` - All .tmp files recursively
- `**/node_modules/**` - All node_modules directories
- `*.log` - Log files in root only
- `cache/**` - Everything in cache directory

## Concurrency

When scanning multiple disks:

- **No limit** (default): All disks scanned in parallel
- **`concurrency: 1`**: Sequential scanning (slowest, lowest resource usage)
- **`concurrency: 2-4`**: Balanced approach for most systems

## Service Tag

Access the service via dependency injection:

```typescript
import { ScannerServiceTag } from '@services/ScannerService'

const program = Effect.gen(function* () {
  const scanner = yield* ScannerServiceTag
  const files = yield* scanner.scanDisk('/mnt/disk1')
  return files
})
```

## See Also

- [FileEntry](../../domain/FileEntry.md) - Output structure
- [GlobService](../GlobService/GlobService.md) - File discovery
- [FileStatService](../FileStatService/FileStatService.md) - File metadata
