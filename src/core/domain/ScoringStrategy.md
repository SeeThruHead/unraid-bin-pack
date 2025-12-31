# ScoringStrategy

Score file combinations to find the best bin-packing solutions.

## Overview

ScoringStrategy provides functions to score file combinations based on how efficiently they use available disk space. Higher scores indicate better space utilization.

## Types

### ScoredCandidate

```typescript
interface ScoredCandidate {
  readonly files: readonly FileEntry[]; // Files in this combination
  readonly totalBytes: number; // Total size of files
  readonly targetDisk: string; // Target disk path
  readonly wastedSpace: number; // Unused space on target
  readonly score: number; // Utilization score (0-1)
}
```

A file combination with its space utilization score.

## Functions

### `calculateUtilizationScore(totalBytes, availableBytes)`

Calculates how efficiently a combination uses available space.

```typescript
const score = calculateUtilizationScore(
  8_000_000_000, // 8GB of files
  10_000_000_000 // 10GB available
);
// Returns: 0.8 (80% utilization)
```

**Formula:** `totalBytes / availableBytes`

**Score range:** 0.0 to 1.0

- **1.0**: Perfect fit (uses all available space)
- **0.8**: Good fit (80% utilization)
- **0.5**: Moderate fit (50% utilization)
- **0.1**: Poor fit (90% wasted space)

### `scoreCombination(files, availableBytes, targetDisk)`

Scores a file combination for a target disk.

```typescript
import { scoreCombination } from "@domain/ScoringStrategy";

const files = [
  { sizeBytes: 3_000_000_000 /* ... */ }, // 3GB
  { sizeBytes: 5_000_000_000 /* ... */ } // 5GB
];

const scored = scoreCombination(
  files,
  10_000_000_000, // 10GB available
  "/mnt/disk2"
);

console.log(scored);
// {
//   files: [file1, file2],
//   totalBytes: 8000000000,
//   targetDisk: '/mnt/disk2',
//   wastedSpace: 2000000000,  // 2GB wasted
//   score: 0.8                 // 80% utilization
// }
```

### `findBestScored(candidates)`

Finds the candidate with the highest score.

```typescript
import { scoreCombination, findBestScored } from "@domain/ScoringStrategy";

const candidates = [
  scoreCombination([file1], 10e9, "/mnt/disk2"), // score: 0.3
  scoreCombination([file1, file2], 10e9, "/mnt/disk2"), // score: 0.8
  scoreCombination([file3], 10e9, "/mnt/disk2") // score: 0.5
];

const best = findBestScored(candidates);
console.log(best?.score); // 0.8
```

Returns `null` if candidates array is empty.

## Usage Examples

### Comparing Combinations

```typescript
import { scoreCombination } from "@domain/ScoringStrategy";

const availableSpace = 100_000_000_000; // 100GB

// Option 1: One large file
const option1 = scoreCombination(
  [{ sizeBytes: 80_000_000_000 /* ... */ }],
  availableSpace,
  "/mnt/disk2"
);

// Option 2: Two medium files
const option2 = scoreCombination(
  [{ sizeBytes: 45_000_000_000 /* ... */ }, { sizeBytes: 45_000_000_000 /* ... */ }],
  availableSpace,
  "/mnt/disk2"
);

console.log(`Option 1: ${option1.score} (${option1.wastedSpace} bytes wasted)`);
console.log(`Option 2: ${option2.score} (${option2.wastedSpace} bytes wasted)`);

// Option 1: 0.8 (20GB wasted)
// Option 2: 0.9 (10GB wasted)
// Option 2 is better!
```

### Finding Best Combination for Multiple Disks

```typescript
import { scoreCombination, findBestScored } from "@domain/ScoringStrategy";

const files = [
  /* file combination to try */
];

const disksWithSpace = [
  { path: "/mnt/disk1", freeBytes: 50_000_000_000 },
  { path: "/mnt/disk2", freeBytes: 100_000_000_000 },
  { path: "/mnt/disk3", freeBytes: 75_000_000_000 }
];

// Score the combination for each disk
const candidates = disksWithSpace.map((disk) => scoreCombination(files, disk.freeBytes, disk.path));

// Find best target disk
const best = findBestScored(candidates);

if (best) {
  console.log(`Best target: ${best.targetDisk}`);
  console.log(`Score: ${best.score}`);
  console.log(`Wasted space: ${best.wastedSpace} bytes`);
}
```

### Filtering Low-Score Combinations

```typescript
import { scoreCombination } from "@domain/ScoringStrategy";

const MIN_SCORE = 0.7; // Require at least 70% utilization

const combinations = [
  /* many file combinations */
];
const availableSpace = 100_000_000_000;

const goodCombinations = combinations
  .map((files) => scoreCombination(files, availableSpace, "/mnt/disk2"))
  .filter((scored) => scored.score >= MIN_SCORE)
  .sort((a, b) => b.score - a.score); // Best first

console.log(`Found ${goodCombinations.length} combinations with score >= ${MIN_SCORE}`);
```

## How It Works

### Utilization vs Wasted Space

Given:

- Available space: 100GB
- File combination: 80GB

**Utilization score:** 80 / 100 = **0.8** (80%)
**Wasted space:** 100 - 80 = **20GB**

Both metrics are useful:

- **Score**: For ranking combinations (higher is better)
- **Wasted space**: For understanding efficiency (lower is better)

### Why Higher Scores Are Better

Higher scores mean:

1. **Less wasted space** on the target disk
2. **More efficient use** of available capacity
3. **Better bin-packing** solution

The goal is to pack files as tightly as possible without overfilling.

### Perfect Score (1.0)

A score of 1.0 means the combination uses ALL available space:

```typescript
scoreCombination(
  [{ sizeBytes: 100_000_000_000 /* ... */ }],
  100_000_000_000, // Exact fit!
  "/mnt/disk2"
);
// score: 1.0, wastedSpace: 0
```

Perfect scores are rare in practice but indicate ideal bin-packing.

## Score Ranges

**Excellent (> 0.9):**

- Very efficient
- Minimal wasted space
- Good bin-packing

**Good (0.7 - 0.9):**

- Acceptable efficiency
- Reasonable space usage
- Worth considering

**Moderate (0.5 - 0.7):**

- Some wasted space
- May not be optimal
- Consider alternatives

**Poor (< 0.5):**

- Lots of wasted space
- Inefficient packing
- Likely better options exist

## See Also

- [FileEntry](./FileEntry.md) - File metadata
- [MoveGenerator](../services/BinPack/MoveGenerator.md) - Uses scoring to find best combinations
- [SimpleConsolidator](../services/BinPack/SimpleConsolidator.md) - Main consumer of scoring
