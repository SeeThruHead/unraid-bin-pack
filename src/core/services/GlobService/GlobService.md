# GlobService

File discovery using glob patterns.

## Overview

GlobService finds files matching glob patterns, used for discovering all files on a disk.

## Service Interface

```typescript
interface GlobService {
  readonly glob: (
    pattern: string,
    options?: GlobOptions
  ) => Effect<string[], GlobError>
}

interface GlobOptions {
  readonly cwd?: string
  readonly ignore?: string[]
}
```

## Usage

### Basic File Search

```typescript
import { Effect } from 'effect'
import { GlobServiceTag } from '@services/GlobService'

const program = Effect.gen(function* () {
  const globService = yield* GlobServiceTag

  // Find all .mkv files
  const files = yield* globService.glob('**/*.mkv', {
    cwd: '/mnt/disk1'
  })

  console.log(`Found ${files.length} video files`)
  files.forEach(file => console.log(file))
})
```

### With Exclusions

```typescript
const program = Effect.gen(function* () {
  const globService = yield* GlobServiceTag

  const files = yield* globService.glob('**/*', {
    cwd: '/mnt/disk1',
    ignore: ['**/*.tmp', '**/node_modules/**']
  })

  console.log(`Found ${files.length} files (excluding .tmp and node_modules)`)
})
```

## Glob Patterns

- `**/*` - All files recursively
- `**/*.mkv` - All .mkv files recursively
- `*.txt` - All .txt files in root only
- `movies/**/*` - All files under movies directory
- `**/*.{mkv,mp4}` - All .mkv and .mp4 files

## Error Handling

```typescript
const program = Effect.gen(function* () {
  const globService = yield* GlobServiceTag

  const files = yield* globService.glob('**/*', { cwd: '/mnt/disk1' }).pipe(
    Effect.catchTags({
      GlobNotFound: () => Effect.succeed([]),
      GlobPermissionDenied: error => {
        console.error(`Permission denied: ${error.path}`)
        return Effect.succeed([])
      },
    })
  )

  return files
})
```

## See Also

- [ScannerService](../ScannerService/ScannerService.md) - Uses GlobService
