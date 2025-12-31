# Combinatorics

Generate combinations of elements from an array.

## Overview

The combinatorics module provides a utility function for generating all possible k-element combinations from an array, used in bin-packing to explore different file groupings.

## Function

### generateCombinations

Generates all possible k-element combinations from an array.

```typescript
export const generateCombinations = <T>(
  array: readonly T[],
  k: number
): readonly (readonly T[])[] => { ... }
```

**Parameters:**
- `array` - The source array to generate combinations from
- `k` - The size of each combination (number of elements to select)

**Returns:**
- Array of all possible k-element combinations
- Each combination is an array of k elements
- Empty array if k > array.length

**Algorithm:**
- Uses backtracking for efficient combination generation
- Time complexity: O(C(n,k)) where C(n,k) = n!/(k!(n-k)!)
- Space complexity: O(k) for recursion stack

## Usage Examples

### Basic Combinations

```typescript
import { generateCombinations } from '@lib/combinatorics'

// Choose 2 from 4
const items = ['A', 'B', 'C', 'D']
const pairs = generateCombinations(items, 2)

console.log(pairs)
// [
//   ['A', 'B'],
//   ['A', 'C'],
//   ['A', 'D'],
//   ['B', 'C'],
//   ['B', 'D'],
//   ['C', 'D']
// ]
```

### File Combinations

```typescript
import { generateCombinations } from '@lib/combinatorics'
import type { FileEntry } from '@domain/FileEntry'

const files: FileEntry[] = [
  { path: '/file1.mkv', sizeBytes: 1000000, diskPath: '/mnt/disk1' },
  { path: '/file2.mkv', sizeBytes: 2000000, diskPath: '/mnt/disk1' },
  { path: '/file3.mkv', sizeBytes: 3000000, diskPath: '/mnt/disk1' },
]

// Try all 2-file combinations for bin-packing
const combinations = generateCombinations(files, 2)

combinations.forEach(combo => {
  const totalSize = combo.reduce((sum, f) => sum + f.sizeBytes, 0)
  console.log(`Combo size: ${totalSize} bytes`)
})
// Combo size: 3000000 bytes (file1 + file2)
// Combo size: 4000000 bytes (file1 + file3)
// Combo size: 5000000 bytes (file2 + file3)
```

### Edge Cases

```typescript
import { generateCombinations } from '@lib/combinatorics'

// k = 0 returns empty combination
generateCombinations([1, 2, 3], 0)
// [[]]

// k = 1 returns individual elements
generateCombinations([1, 2, 3], 1)
// [[1], [2], [3]]

// k > array.length returns empty array
generateCombinations([1, 2], 3)
// []

// k = array.length returns full array
generateCombinations([1, 2, 3], 3)
// [[1, 2, 3]]
```

## Performance

### Complexity

The number of combinations grows factorially:
- C(n, k) = n! / (k! * (n-k)!)
- C(10, 2) = 45
- C(10, 5) = 252
- C(20, 5) = 15,504
- C(100, 5) = 75,287,520

### Practical Limits

For bin-packing:
- k=2: Efficient up to ~1000 files (500,000 combinations)
- k=3: Efficient up to ~100 files (161,700 combinations)
- k=4: Efficient up to ~50 files (230,300 combinations)
- k=5: Efficient up to ~30 files (142,506 combinations)

**Recommendation:** Use sampling for large file sets to avoid generating millions of combinations.

## Use in Bin-Packing

### MoveGenerator

The MoveGenerator service uses this for exploring file combinations:

```typescript
import { generateCombinations } from '@lib/combinatorics'
import { scoreCombination } from '@domain/ScoringStrategy'

const findBestCombination = (
  files: FileEntry[],
  k: number,
  availableBytes: number
) => {
  const combinations = generateCombinations(files, k)

  return combinations
    .filter(combo => {
      const totalSize = combo.reduce((sum, f) => sum + f.sizeBytes, 0)
      return totalSize <= availableBytes
    })
    .map(combo => ({
      files: combo,
      score: scoreCombination(combo, availableBytes)
    }))
    .sort((a, b) => b.score - a.score)[0]
}
```

## See Also

- [MoveGenerator](../services/BinPack/MoveGenerator.md) - Uses generateCombinations for bin-packing
- [FileOrderStrategy](../domain/FileOrderStrategy.md) - Sampling to reduce combinations
- [ScoringStrategy](../domain/ScoringStrategy.md) - Scoring combinations
