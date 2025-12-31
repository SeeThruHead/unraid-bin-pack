# Error Handling

User-friendly error formatting and domain error conversion.

## Overview

The errors module converts domain-level errors (from services) into formatted, actionable error messages with helpful suggestions for users.

## AppError Class

User-facing error with structured formatting.

```typescript
export class AppError extends Error {
  readonly _tag = "AppError"

  constructor(
    readonly title: string,
    readonly detail: string,
    readonly suggestion: string
  )

  format(): string
}
```

### format()

Produces a user-friendly multi-line error message:

```
ERROR: {title}

   {detail}

   Hint: {suggestion}
```

**Example Output:**

```
ERROR: Disk not found

   The path "/mnt/disk1" does not exist.

   Hint: Make sure the disk is mounted. On Unraid, check that
   the disk appears in Main > Array Devices.
```

## Error Conversion

### fromDomainError

Converts any error to AppError with user-friendly formatting.

```typescript
export const fromDomainError = (error: unknown): AppError
```

**Conversion Rules:**
1. If already `AppError`, return as-is
2. If domain error (has `_tag`), match to specific AppError
3. If `Error` with permission keywords, convert to permission error
4. Otherwise, wrap as unexpected error

**Usage:**

```typescript
import { Effect, Console } from 'effect'
import { fromDomainError } from './errors'

const program = myEffect.pipe(
  Effect.catchAll(error => {
    const appError = fromDomainError(error)
    return Console.error(appError.format())
  })
)
```

## Error Factories

### Disk Errors

```typescript
diskNotFound(path: string): AppError
notAMountPoint(path: string): AppError
notADirectory(path: string): AppError
diskStatsFailed(path: string, reason: string): AppError
diskPermissionDenied(path: string): AppError
```

**Examples:**

```typescript
import { diskNotFound, notAMountPoint } from './errors'

// Disk not found
const error1 = diskNotFound('/mnt/disk99')
console.log(error1.format())
// ERROR: Disk not found
//    The path "/mnt/disk99" does not exist.
//    Hint: Make sure the disk is mounted...

// Not a mount point
const error2 = notAMountPoint('/mnt/user')
console.log(error2.format())
// ERROR: Not a mount point
//    The path "/mnt/user" is a directory but not a separate disk mount.
//    Hint: Unraid disks should be mounted at /mnt/disk1, /mnt/disk2, etc...
```

### Scanner Errors

```typescript
scanFailed(path: string, reason: string): AppError
scanPermissionDenied(path: string): AppError
```

**Examples:**

```typescript
import { scanFailed, scanPermissionDenied } from './errors'

const error1 = scanFailed('/mnt/disk1/locked', 'EACCES')
console.log(error1.format())
// ERROR: Scan failed
//    Could not scan files in "/mnt/disk1/locked": EACCES
//    Hint: Check that the path exists and you have read permission.

const error2 = scanPermissionDenied('/mnt/disk1/private')
// ERROR: Permission denied during scan
//    Cannot read files in "/mnt/disk1/private": permission denied.
//    Hint: Check file permissions or run with elevated privileges.
```

### Plan Errors

```typescript
planNotFound(path: string): AppError
planCorrupted(path: string, reason: string): AppError
planSaveFailed(path: string, reason: string): AppError
planPermissionDenied(path: string, operation: "read" | "write"): AppError
```

**Examples:**

```typescript
import { planNotFound, planSaveFailed } from './errors'

const error1 = planNotFound('/config/plan.sh')
// ERROR: No plan found
//    No plan file exists at "/config/plan.sh".
//    Hint: Run 'unraid-bin-pack plan' first to create a plan.

const error2 = planSaveFailed('/readonly/plan.sh', 'EROFS')
// ERROR: Cannot save plan
//    Failed to save plan to "/readonly/plan.sh": EROFS
//    Hint: Check that you have write permission to the directory.
```

### Transfer Errors

```typescript
transferFailed(source: string, destination: string, reason: string): AppError
backendUnavailable(reason: string): AppError
sourceNotFound(path: string): AppError
sourcePermissionDenied(path: string): AppError
destinationPermissionDenied(path: string): AppError
diskFull(path: string): AppError
```

**Examples:**

```typescript
import {
  transferFailed,
  backendUnavailable,
  diskFull
} from './errors'

const error1 = transferFailed(
  '/mnt/disk1/file.mkv',
  '/mnt/disk2/file.mkv',
  'Connection refused'
)
// ERROR: Transfer failed
//    Could not move "/mnt/disk1/file.mkv" to "/mnt/disk2/file.mkv": Connection refused
//    Hint: Check disk space, permissions, and that rsync is installed.

const error2 = backendUnavailable('rsync: command not found')
// ERROR: Transfer backend unavailable
//    rsync: command not found
//    Hint: Install rsync: On Unraid it should be pre-installed...

const error3 = diskFull('/mnt/disk2')
// ERROR: Disk full
//    No space left on disk at "/mnt/disk2".
//    Hint: Free up space on the target disk or run 'unraid-bin-pack plan'...
```

### Generic Errors

```typescript
unexpected(message: string): AppError
permissionDenied(message: string): AppError
```

**Examples:**

```typescript
import { unexpected, permissionDenied } from './errors'

const error1 = unexpected('Out of memory')
// ERROR: Unexpected error
//    Out of memory
//    Hint: If this persists, please report this issue.

const error2 = permissionDenied('EACCES: permission denied')
// ERROR: Permission denied
//    EACCES: permission denied
//    Hint: Check that you have the required permissions...
```

## Domain Error Types

### Type Aliases

```typescript
type DiskError =
  | DiskNotFound
  | DiskNotADirectory
  | DiskNotAMountPoint
  | DiskPermissionDenied
  | DiskStatsFailed

type ScannerError =
  | ScanPathNotFound
  | ScanPermissionDenied
  | ScanFailed
  | FileStatFailed

type TransferError =
  | TransferSourceNotFound
  | TransferSourcePermissionDenied
  | TransferDestinationPermissionDenied
  | TransferDiskFull
  | TransferBackendUnavailable
  | TransferFailed

type DomainError = DiskError | ScannerError | TransferError
```

## Pattern Matching

Uses `Effect.Match` for type-safe domain error conversion:

```typescript
const matchDomainError = Match.typeTags<DomainError>()({
  DiskNotFound: (e) => errors.diskNotFound(e.path),
  DiskNotADirectory: (e) => errors.notADirectory(e.path),
  DiskNotAMountPoint: (e) => errors.notAMountPoint(e.path),
  // ... all error types
})
```

## Permission Detection

Automatically detects permission errors from generic error messages:

```typescript
const isPermissionError = (message: string): boolean =>
  message.toLowerCase().includes("permission denied") ||
  message.toLowerCase().includes("eacces") ||
  message.toLowerCase().includes("operation not permitted") ||
  message.toLowerCase().includes("eperm")
```

## Usage in Handlers

### withErrorHandling Wrapper

```typescript
import { Effect, Console } from 'effect'
import { fromDomainError } from './errors'

export const withErrorHandling = <A, R>(
  effect: Effect<A, unknown, R>
): Effect<void, never, R> =>
  effect.pipe(
    Effect.catchAll(error => {
      const appError = fromDomainError(error)
      return Console.error(`\n${appError.format()}`)
    }),
    Effect.asVoid
  )
```

**Usage:**

```typescript
import { runPlan, withErrorHandling, AppLive } from './handler'

const program = runPlan(options).pipe(
  withErrorHandling,
  Effect.provide(AppLive)
)

// Any error becomes formatted AppError output
Effect.runPromise(program)
```

### Direct Usage

```typescript
import { Effect } from 'effect'
import { diskNotFound } from './errors'

const validateDisk = (path: string) =>
  Effect.gen(function* () {
    const exists = yield* checkDiskExists(path)

    if (!exists) {
      return yield* Effect.fail(diskNotFound(path))
    }

    return path
  })
```

## Error Message Guidelines

All error messages follow this structure:

1. **Title:** Brief, clear problem statement
2. **Detail:** Specific information about what went wrong
3. **Suggestion:** Actionable hint for resolving the issue

**Good Example:**

```
ERROR: Disk not found

   The path "/mnt/disk1" does not exist.

   Hint: Make sure the disk is mounted. On Unraid, check that
   the disk appears in Main > Array Devices.
```

**Why it works:**
- Title is scannable
- Detail includes the specific path
- Suggestion tells user exactly what to check

## See Also

- [handler.md](./handler.md) - Uses withErrorHandling wrapper
- [DiskService](../services/DiskService/DiskService.md) - Disk validation errors
- [ScannerService](../services/ScannerService/ScannerService.md) - File scanning errors
- [TransferService](../services/TransferService/TransferService.md) - Transfer errors
