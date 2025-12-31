# DiskProjection

Project future disk states after applying file moves.

## Overview

DiskProjection calculates what disk space will look like after executing a move plan, helping verify that moves won't overfill disks and showing how many disks will be completely emptied.

## Types

### DiskSnapshot

```typescript
interface DiskSnapshot {
  readonly path: string;
  readonly totalBytes: number;
  readonly freeBytes: number;
}
```

A snapshot of disk state at a point in time.

### DiskProjectionResult

```typescript
interface DiskProjectionResult {
  readonly initial: readonly DiskSnapshot[]; // Disk states before moves
  readonly final: readonly DiskSnapshot[]; // Disk states after moves
  readonly evacuatedCount: number; // Number of disks completely emptied
}
```

## Functions

### `projectDiskStates(initialDisks, moves)`

Projects disk states after applying moves.

```typescript
function projectDiskStates(
  initialDisks: readonly DiskSnapshot[],
  moves: readonly FileMove[]
): DiskProjectionResult;
```

**How it works:**

1. Calculate free space changes per disk from moves
2. Apply changes to initial disk states
3. Count how many disks were completely evacuated (went from having files to empty)

## Usage Examples

### Basic Projection

```typescript
import { projectDiskStates } from "@domain/DiskProjection";
import { createFileMove } from "@domain/MovePlan";

const initialDisks = [
  {
    path: "/mnt/disk1",
    totalBytes: 4_000_000_000_000,
    freeBytes: 500_000_000_000 // 500GB free
  },
  {
    path: "/mnt/disk2",
    totalBytes: 4_000_000_000_000,
    freeBytes: 3_500_000_000_000 // 3.5TB free
  }
];

const moves = [
  createFileMove(
    {
      absolutePath: "/mnt/disk1/bigfile.mkv",
      relativePath: "bigfile.mkv",
      sizeBytes: 100_000_000_000, // 100GB
      diskPath: "/mnt/disk1"
    },
    "/mnt/disk2"
  )
];

const projection = projectDiskStates(initialDisks, moves);

console.log("Initial state:");
projection.initial.forEach((disk) => {
  console.log(`  ${disk.path}: ${disk.freeBytes} bytes free`);
});

console.log("Final state:");
projection.final.forEach((disk) => {
  console.log(`  ${disk.path}: ${disk.freeBytes} bytes free`);
});

console.log(`Evacuated ${projection.evacuatedCount} disk(s)`);

// Output:
// Initial state:
//   /mnt/disk1: 500000000000 bytes free
//   /mnt/disk2: 3500000000000 bytes free
// Final state:
//   /mnt/disk1: 600000000000 bytes free (gained 100GB)
//   /mnt/disk2: 3400000000000 bytes free (lost 100GB)
// Evacuated 0 disk(s)
```

### Checking for Evacuated Disks

```typescript
import { projectDiskStates } from "@domain/DiskProjection";

// disk1 has 100GB of files, disk2 is mostly empty
const initialDisks = [
  {
    path: "/mnt/disk1",
    totalBytes: 4_000_000_000_000,
    freeBytes: 3_900_000_000_000 // 100GB used
  },
  {
    path: "/mnt/disk2",
    totalBytes: 4_000_000_000_000,
    freeBytes: 3_950_000_000_000 // 50GB used
  }
];

// Move all 100GB from disk1 to disk2
const moves = [
  createFileMove(
    {
      absolutePath: "/mnt/disk1/files.tar",
      relativePath: "files.tar",
      sizeBytes: 100_000_000_000,
      diskPath: "/mnt/disk1"
    },
    "/mnt/disk2"
  )
];

const projection = projectDiskStates(initialDisks, moves);

if (projection.evacuatedCount > 0) {
  console.log(`Success! Evacuated ${projection.evacuatedCount} disk(s)`);
  console.log("These disks are now completely empty and can be removed");
}
```

### Verifying Moves Won't Overfill

```typescript
import { projectDiskStates } from "@domain/DiskProjection";

const projection = projectDiskStates(initialDisks, moves);

// Check if any disk will be overfilled
const overfilled = projection.final.some((disk) => disk.freeBytes < 0);

if (overfilled) {
  console.error("ERROR: Move plan would overfill a disk!");
  projection.final.forEach((disk) => {
    if (disk.freeBytes < 0) {
      console.error(`  ${disk.path} would have ${Math.abs(disk.freeBytes)} bytes OVER capacity`);
    }
  });
} else {
  console.log("Move plan is safe - no disks will be overfilled");
}
```

## How It Works

### 1. Calculate Changes

For each move, the projection:

- Adds `fileSize` to source disk free space (file is removed)
- Subtracts `fileSize` from target disk free space (file is added)

### 2. Apply Changes

Creates new disk snapshots with adjusted free space values.

### 3. Count Evacuations

A disk is considered "evacuated" if:

- It had files initially (usedBytes > 0)
- It has no files after moves (usedBytes === 0)

This is the primary goal of consolidation - completely emptying disks.

## See Also

- [MovePlan](./MovePlan.md) - File moves to project
- [WorldView](./WorldView.md) - Initial disk states
- [SimpleConsolidator](../services/BinPack/SimpleConsolidator.md) - Uses projections
