# MoveGenerator

Generates optimal file move combinations using bin-packing algorithms with scoring.

## Overview

MoveGenerator finds the best combination of files from a source disk that:
1. Fits within available space on a target disk
2. Maximizes space utilization (highest score)
3. Uses efficient sampling for large file sets

## Functions

### `findBestSingleFile(files, availableBytes, targetDisk)`

Finds the single best file that fits in the available space.

```typescript
function findBestSingleFile(
  files: readonly FileEntry[],
  availableBytes: number,
  targetDisk: string
): ScoredCandidate | null
```

Returns the file that best utilizes the available space, or `null` if no files fit.

**Example:**
```typescript
import { findBestSingleFile } from '@services/BinPack/MoveGenerator'

const files = [
  { sizeBytes: 30_000_000_000, /* ... */ },  // 30GB
  { sizeBytes: 80_000_000_000, /* ... */ },  // 80GB
  { sizeBytes: 50_000_000_000, /* ... */ },  // 50GB
]

const best = findBestSingleFile(files, 100_000_000_000, '/mnt/disk2')

if (best) {
  console.log(`Best file: ${best.totalBytes} bytes`)
  console.log(`Score: ${best.score}`)
  console.log(`Wasted space: ${best.wastedSpace} bytes`)
}
// Best: 80GB file (score 0.8)
```

### `findBestCombinationForDisk(files, availableBytes, targetDisk, maxCombinationSize)`

Finds the best combination of files (up to `maxCombinationSize`) that fits in available space.

```typescript
function findBestCombinationForDisk(
  files: readonly FileEntry[],
  availableBytes: number,
  targetDisk: string,
  maxCombinationSize: number
): ScoredCandidate | null
```

**How it works:**
1. Filters files that fit in available space
2. Finds best single file
3. Groups files into size buckets and samples representatives
4. Generates combinations of 2, 3, ... up to `maxCombinationSize` files
5. Scores all combinations and returns the best

**Example:**
```typescript
import { findBestCombinationForDisk } from '@services/BinPack/MoveGenerator'

const files = [
  { sizeBytes: 30_000_000_000, /* ... */ },  // 30GB
  { sizeBytes: 40_000_000_000, /* ... */ },  // 40GB
  { sizeBytes: 50_000_000_000, /* ... */ },  // 50GB
]

const best = findBestCombinationForDisk(
  files,
  100_000_000_000,  // 100GB available
  '/mnt/disk2',
  5  // Max 5 files per combination
)

if (best) {
  console.log(`Best combination: ${best.files.length} files`)
  console.log(`Total: ${best.totalBytes} bytes`)
  console.log(`Score: ${best.score}`)
}
// Best: 2 files (30GB + 50GB = 80GB, score 0.8)
```

## Usage Examples

### Finding Optimal Move for Disk

```typescript
import { Effect } from 'effect'
import { findBestCombinationForDisk } from '@services/BinPack/MoveGenerator'

const program = Effect.gen(function* () {
  const sourceFiles = [/* files on source disk */]
  const targetDisk = { path: '/mnt/disk2', freeBytes: 500_000_000_000 }

  const best = findBestCombinationForDisk(
    sourceFiles,
    targetDisk.freeBytes,
    targetDisk.path,
    5
  )

  if (best === null) {
    console.log('No valid combinations found')
    return
  }

  console.log(`Found combination of ${best.files.length} files:`)
  best.files.forEach(file => {
    console.log(`  - ${file.relativePath} (${file.sizeBytes} bytes)`)
  })
  console.log(`Total: ${best.totalBytes} bytes`)
  console.log(`Utilization: ${(best.score * 100).toFixed(1)}%`)
  console.log(`Wasted space: ${best.wastedSpace} bytes`)
})
```

### Comparing Different Combination Sizes

```typescript
import { findBestCombinationForDisk } from '@services/BinPack/MoveGenerator'

const sizes = [1, 3, 5, 7]

sizes.forEach(maxSize => {
  const best = findBestCombinationForDisk(
    files,
    availableSpace,
    '/mnt/disk2',
    maxSize
  )

  console.log(`Max size ${maxSize}:`)
  if (best) {
    console.log(`  Files: ${best.files.length}`)
    console.log(`  Score: ${best.score}`)
  } else {
    console.log(`  No valid combinations`)
  }
})
```

### Handling No Valid Combinations

```typescript
import { findBestCombinationForDisk } from '@services/BinPack/MoveGenerator'

const best = findBestCombinationForDisk(files, availableSpace, targetDisk, 5)

if (best === null) {
  console.error('Could not find any file combination that fits!')
  console.error(`Available space: ${availableSpace} bytes`)
  console.error(`Smallest file: ${Math.min(...files.map(f => f.sizeBytes))} bytes`)
}
```

## How It Works

### 1. Initial Filtering

Only files that fit in available space are considered:
```
Available: 100GB
Files: [30GB, 80GB, 120GB, 50GB]
Fitting: [30GB, 80GB, 50GB]  // 120GB excluded
```

### 2. Best Single File

Finds the single file with highest score:
```
30GB → score 0.3
80GB → score 0.8  ← Best single
50GB → score 0.5
```

### 3. Sampling

To handle large file sets efficiently:
- Groups files into size buckets
- Samples 3 representative files per bucket (smallest, median, largest)
- Generates combinations from samples, not all files

**Why?**
- Processing 1000 files with combinations of 5 would create billions of combinations
- Sampling reduces this to ~15 files (3 × 5 buckets)
- Still finds good solutions while being computationally feasible

### 4. Combination Generation

Generates all combinations of size 2, 3, ... up to `maxCombinationSize`:
```
Size 2: [30GB+80GB, 30GB+50GB, 80GB+50GB]
Size 3: [30GB+40GB+50GB, ...]
...
```

### 5. Scoring and Selection

- Scores each combination
- Returns the highest-scoring combination overall (could be single file or multi-file)

## Performance Considerations

### Max Combination Size

**Smaller (1-3):**
- ✅ Very fast
- ✅ Low memory usage
- ❌ May miss optimal solutions

**Medium (4-5):**
- ✅ Good balance
- ✅ Finds good solutions
- ✅ Reasonable performance

**Larger (6-7):**
- ❌ Much slower
- ❌ Higher memory usage
- ✅ More thorough search

**Recommended:** 3-5 for most cases

### File Set Size

- **< 100 files**: Sampling not critical
- **100-1000 files**: Sampling provides good speedup
- **> 1000 files**: Sampling essential for reasonable performance

## See Also

- [ScoringStrategy](../../domain/ScoringStrategy.md) - How combinations are scored
- [FileOrderStrategy](../../domain/FileOrderStrategy.md) - Bucketing and sampling
- [SimpleConsolidator](./SimpleConsolidator.md) - Uses MoveGenerator
- [Combinatorics](../../lib/combinatorics.md) - Combination generation
