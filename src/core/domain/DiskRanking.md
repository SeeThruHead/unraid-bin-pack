# DiskRanking

Rank disks by fullness to prioritize which disks to consolidate first.

## Overview

DiskRanking helps identify which disks are good candidates for consolidation by calculating their usage percentages and sorting them from least full to most full.

## Types

### DiskWithUsage

```typescript
interface DiskWithUsage extends DiskState {
  readonly usedBytes: number   // Calculated used space
  readonly usedPct: number     // Usage percentage (0-100)
}
```

A disk with calculated usage statistics.

## Functions

### `calculateDiskUsage(disk)`

Calculates usage statistics for a disk.

```typescript
const disk = {
  path: '/mnt/disk1',
  totalBytes: 4_000_000_000_000,
  freeBytes: 1_000_000_000_000,
}

const withUsage = calculateDiskUsage(disk)
// {
//   path: '/mnt/disk1',
//   totalBytes: 4000000000000,
//   freeBytes: 1000000000000,
//   usedBytes: 3000000000000,
//   usedPct: 75.0
// }
```

### `hasFilesOnDisk(disk, files)`

Checks if a disk contains any files from the file list.

```typescript
const files = [
  { diskPath: '/mnt/disk1', /* ... */ },
  { diskPath: '/mnt/disk2', /* ... */ },
]

hasFilesOnDisk({ path: '/mnt/disk1', /* ... */ }, files)  // true
hasFilesOnDisk({ path: '/mnt/disk3', /* ... */ }, files)  // false
```

Used to filter out empty disks from consolidation.

### `rankDisksByFullness(disks, files)`

Ranks disks from least full to most full, excluding empty disks.

```typescript
function rankDisksByFullness(
  disks: readonly DiskState[],
  files: readonly FileEntry[]
): readonly DiskWithUsage[]
```

**Process:**
1. Calculate usage for each disk
2. Filter to only disks that have files
3. Sort by usage percentage (ascending)

## Usage Examples

### Basic Ranking

```typescript
import { rankDisksByFullness } from '@domain/DiskRanking'

const disks = [
  {
    path: '/mnt/disk1',
    totalBytes: 4_000_000_000_000,
    freeBytes: 200_000_000_000,  // 95% full
  },
  {
    path: '/mnt/disk2',
    totalBytes: 4_000_000_000_000,
    freeBytes: 2_000_000_000_000,  // 50% full
  },
  {
    path: '/mnt/disk3',
    totalBytes: 4_000_000_000_000,
    freeBytes: 3_800_000_000_000,  // 5% full
  },
]

const files = [
  { diskPath: '/mnt/disk1', /* ... */ },
  { diskPath: '/mnt/disk2', /* ... */ },
  { diskPath: '/mnt/disk3', /* ... */ },
]

const ranked = rankDisksByFullness(disks, files)

ranked.forEach((disk, index) => {
  console.log(`${index + 1}. ${disk.path}: ${disk.usedPct.toFixed(1)}% full`)
})

// Output (least full first):
// 1. /mnt/disk3: 5.0% full
// 2. /mnt/disk2: 50.0% full
// 3. /mnt/disk1: 95.0% full
```

### Finding Consolidation Candidates

```typescript
import { rankDisksByFullness } from '@domain/DiskRanking'

const ranked = rankDisksByFullness(disks, files)

// Least full disks are best candidates to empty completely
const leastFull = ranked[0]
console.log(`Best candidate: ${leastFull?.path} (${leastFull?.usedPct.toFixed(1)}% full)`)

// Most full disks are good targets to receive files
const mostFull = ranked[ranked.length - 1]
console.log(`Best target: ${mostFull?.path} (${mostFull?.usedPct.toFixed(1)}% full)`)
```

### Filtering Empty Disks

```typescript
import { rankDisksByFullness } from '@domain/DiskRanking'

const disks = [
  {
    path: '/mnt/disk1',
    totalBytes: 4_000_000_000_000,
    freeBytes: 1_000_000_000_000,
  },
  {
    path: '/mnt/disk2',
    totalBytes: 4_000_000_000_000,
    freeBytes: 4_000_000_000_000,  // Completely empty
  },
]

const files = [
  { diskPath: '/mnt/disk1', /* ... */ },
  // No files on disk2
]

const ranked = rankDisksByFullness(disks, files)

console.log(`Ranked ${ranked.length} disks`)
// Only disk1 appears in ranking
// disk2 is filtered out because it has no files
```

### Iterating from Least to Most Full

```typescript
import { rankDisksByFullness } from '@domain/DiskRanking'

const ranked = rankDisksByFullness(disks, files)

for (const disk of ranked) {
  console.log(`Processing ${disk.path} (${disk.usedPct.toFixed(1)}% full)`)

  if (disk.usedPct < 20) {
    console.log('  → Good candidate for complete evacuation')
  } else if (disk.usedPct > 80) {
    console.log('  → Good target to receive files')
  }
}
```

## How It Works

### Why Least Full First?

The consolidation strategy prioritizes emptying the least full disks first because:

1. **Easier to empty**: Less data to move
2. **More likely to succeed**: Higher chance of finding space on other disks
3. **Maximizes evacuations**: More disks can be completely emptied
4. **Iterative strategy**: After emptying one disk, move to the next

### Filtering Empty Disks

Disks without files are excluded because:
- They're already empty (nothing to consolidate)
- They're good targets to receive files
- Including them would skew the ranking

## See Also

- [WorldView](./WorldView.md) - Disk and file state
- [SimpleConsolidator](../services/BinPack/SimpleConsolidator.md) - Uses disk ranking
- [Disk](./Disk.md) - Disk utility functions
