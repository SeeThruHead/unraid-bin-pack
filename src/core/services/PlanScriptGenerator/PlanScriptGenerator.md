# PlanScriptGenerator

Generates executable bash scripts from MovePlans using rsync.

## Overview

PlanScriptGenerator converts a `MovePlan` into a bash script that can be executed to perform the file transfers. The script uses rsync with parallel execution for efficient transfers.

## Service Interface

```typescript
interface PlanGeneratorService {
  readonly generate: (options: PlanGeneratorOptions) => Effect<string>
}

interface PlanGeneratorOptions {
  readonly moves: readonly FileMove[]
  readonly sourceDisk: string
  readonly concurrency: number
}
```

## Generated Script Features

- **Parallel execution**: Runs multiple rsync operations concurrently
- **Progress comments**: Shows which batch is being transferred
- **Safety**: Uses `set -e` to exit on errors
- **Cleanup**: Uses `--remove-source-files` to delete source after successful transfer
- **Batching**: Groups files by target disk for efficiency

## Usage Examples

### Basic Script Generation

```typescript
import { Effect } from 'effect'
import { PlanGeneratorServiceTag } from '@services/PlanGenerator'

const program = Effect.gen(function* () {
  const generator = yield* PlanGeneratorServiceTag

  const script = yield* generator.generate({
    moves: [
      {
        file: {
          absolutePath: '/mnt/disk1/movie.mkv',
          relativePath: 'movie.mkv',
          sizeBytes: 10_000_000_000,
          diskPath: '/mnt/disk1',
        },
        targetDiskPath: '/mnt/disk2',
        destinationPath: '/mnt/disk2/movie.mkv',
        status: 'pending',
      },
    ],
    sourceDisk: '/mnt/disk1',
    concurrency: 4,
  })

  console.log(script)
})
```

### Save Script to File

```typescript
import { Effect } from 'effect'
import { FileSystem } from '@effect/platform'
import { PlanGeneratorServiceTag } from '@services/PlanGenerator'

const program = Effect.gen(function* () {
  const generator = yield* PlanGeneratorServiceTag
  const fs = yield* FileSystem.FileSystem

  const script = yield* generator.generate({
    moves: plan.moves,
    sourceDisk: '/mnt/disk1',
    concurrency: 4,
  })

  yield* fs.writeFileString('plan.sh', script)
  yield* fs.chmod('plan.sh', 0o755)  // Make executable

  console.log('Script saved to plan.sh')
})
```

### Execute Generated Script

```typescript
import { Effect } from 'effect'
import { PlanGeneratorServiceTag } from '@services/PlanGenerator'
import { ShellServiceTag } from '@services/ShellService'

const program = Effect.gen(function* () {
  const generator = yield* PlanGeneratorServiceTag
  const shell = yield* ShellServiceTag

  // Generate script
  const script = yield* generator.generate({
    moves: plan.moves,
    sourceDisk: '/mnt/disk1',
    concurrency: 2,
  })

  // Save to file
  yield* Effect.promise(() =>
    Bun.write('plan.sh', script)
  )

  // Execute
  yield* shell.exec('chmod +x plan.sh && ./plan.sh')

  console.log('Transfer complete!')
})
```

## Generated Script Format

### Header

```bash
#!/bin/bash
#
# Unraid Bin-Pack Plan
# Generated: 2025-12-29
#
# Source disk: /mnt/disk1
# Total files: 10
# Total size: 50.0 GB
# Concurrency: 4
#

set -e
```

### Batch Commands

Files are grouped by target disk:

```bash
# Batch 1: /mnt/disk1 -> /mnt/disk2 (5 files, 25.0 GB)
rsync -a --remove-source-files --files-from=<(cat <<'EOF'
movies/action.mkv
movies/comedy.mkv
tv/series1.mkv
EOF
) "/mnt/disk1/" "/mnt/disk2/" &

# Batch 2: /mnt/disk1 -> /mnt/disk3 (5 files, 25.0 GB)
rsync -a --remove-source-files --files-from=<(cat <<'EOF'
docs/file1.pdf
docs/file2.pdf
EOF
) "/mnt/disk1/" "/mnt/disk3/" &

wait
```

## How It Works

### 1. Batch Grouping

Files are grouped by target disk to minimize rsync invocations:

```
Moves:
  file1.mkv -> /mnt/disk2
  file2.mkv -> /mnt/disk2
  file3.mkv -> /mnt/disk3

Batches:
  Batch 1 (disk2): [file1.mkv, file2.mkv]
  Batch 2 (disk3): [file3.mkv]
```

### 2. Parallel Execution

Each batch runs as a background job (`&`), then `wait` ensures all complete before the script exits.

**Concurrency** parameter determines max parallel transfers (though this implementation runs all batches concurrently).

### 3. File List Format

Uses `--files-from` with heredoc for clean file list handling:
- No need to escape special characters in filenames
- Easy to read and debug
- Efficient for large file lists

### 4. Rsync Flags

- `-a`: Archive mode (preserves permissions, timestamps, etc.)
- `--remove-source-files`: Deletes source files after successful transfer
- `--files-from`: Read file list from stdin

## Safety Features

### Exit on Error

`set -e` ensures the script stops if any rsync command fails, preventing partial transfers.

### Source File Removal

`--remove-source-files` only removes files after successful transfer. If rsync fails, source files remain intact.

### Trailing Slashes

The script ensures source and target paths have trailing slashes for correct rsync behavior.

## Skipped Moves

Moves with status !== 'pending' are excluded from the generated script:

```typescript
const moves = [
  { status: 'pending', /* ... */ },    // ✅ Included
  { status: 'skipped', /* ... */ },    // ❌ Excluded
  { status: 'completed', /* ... */ },  // ❌ Excluded
]
```

## Empty Plans

If no pending moves exist, generates a minimal script:

```bash
#!/bin/bash
exit 0
```

## See Also

- [MovePlan](../../domain/MovePlan.md) - Input structure
- [TransferService](../TransferService/TransferService.md) - Alternative: execute directly
- [ShellService](../ShellService/ShellService.md) - Execute generated scripts
