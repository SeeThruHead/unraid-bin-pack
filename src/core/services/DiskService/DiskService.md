# DiskService

Disk validation and metadata operations.

## Overview

DiskService provides operations for validating disk paths and retrieving disk information with proper error handling.

## Service Interface

```typescript
interface DiskService {
  readonly validateDiskPath: (path: string) => Effect<void, DiskError>
  readonly getDiskInfo: (path: string) => Effect<DiskState, DiskError>
}
```

## Errors

- `DiskNotFound`: Path doesn't exist
- `DiskNotADirectory`: Path exists but is not a directory
- `DiskNotAMountPoint`: Path is a directory but not a mount point
- `DiskPermissionDenied`: Insufficient permissions to access path
- `DiskStatsFailed`: Could not retrieve disk statistics

## Usage

### Validate Disk Path

```typescript
import { Effect } from 'effect'
import { DiskServiceTag } from '@services/DiskService'

const program = Effect.gen(function* () {
  const diskService = yield* DiskServiceTag

  yield* diskService.validateDiskPath('/mnt/disk1')

  console.log('Disk path is valid')
})
```

### Get Disk Information

```typescript
const program = Effect.gen(function* () {
  const diskService = yield* DiskServiceTag

  const info = yield* diskService.getDiskInfo('/mnt/disk1')

  console.log(`Path: ${info.path}`)
  console.log(`Total: ${info.totalBytes} bytes`)
  console.log(`Free: ${info.freeBytes} bytes`)
})
```

### Handle Errors

```typescript
const program = Effect.gen(function* () {
  const diskService = yield* DiskServiceTag

  const result = yield* diskService.getDiskInfo('/mnt/disk1').pipe(
    Effect.catchTags({
      DiskNotFound: () =>
        Effect.fail(new Error('Disk not found')),
      DiskPermissionDenied: () =>
        Effect.fail(new Error('Permission denied')),
      DiskNotAMountPoint: () =>
        Effect.fail(new Error('Not a valid mount point')),
    })
  )

  return result
})
```

## Validation Rules

A valid disk path must:
1. **Exist** - Path must exist in the filesystem
2. **Be a directory** - Path must be a directory, not a file
3. **Be a mount point** - Path must be a mounted filesystem
4. **Be accessible** - Current user must have read permissions

## See Also

- [DiskStatsService](../DiskStatsService/DiskStatsService.md) - Retrieve disk statistics
- [WorldView](../../domain/WorldView.md) - Uses DiskState
