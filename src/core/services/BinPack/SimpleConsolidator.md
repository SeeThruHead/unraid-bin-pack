# SimpleConsolidator

The `SimpleConsolidator` is the core consolidation service that uses bin-packing algorithms to find optimal file combinations to move between disks. It aims to empty source disks by moving files to target disks with available space.

## Overview

The consolidator:
1. Filters files based on size and path criteria
2. Ranks disks by fullness (least full first)
3. For each source disk, finds optimal file combinations to move
4. Uses bin-packing to maximize space efficiency
5. Returns a set of moves that achieve the minimum space goal

## API

### `consolidateSimple(worldView, options)`

```typescript
function consolidateSimple(
  worldView: WorldView,
  options: ConsolidationOptions
): Effect<ConsolidationResult, never>
```

**Parameters:**

- `worldView`: Current state of disks and files
- `options`: Consolidation configuration

**Returns:**

An Effect that produces a `ConsolidationResult`

### ConsolidationOptions

```typescript
interface ConsolidationOptions {
  readonly minSpaceBytes: number          // Minimum space to free (required)
  readonly minFileSizeBytes?: number      // Only move files >= this size
  readonly pathPrefixes?: readonly string[] // Only move files under these paths
  readonly maxCombinationSize?: number    // Max files per combination (default: 5)
  readonly srcDiskPaths?: readonly string[] // Only consolidate from these disks
}
```

### ConsolidationResult

```typescript
interface ConsolidationResult {
  readonly moves: ReadonlyArray<FileMove>  // File moves to perform
  readonly bytesConsolidated: number       // Total bytes being moved
}
```

## Examples

### Basic Consolidation

Free at least 100GB from the fullest disks:

<<< @/src/services/BinPack/SimpleConsolidator.example.ts#basicConsolidation

### With File Size Filter

Only move files larger than 10GB:

<<< @/src/services/BinPack/SimpleConsolidator.example.ts#consolidationWithSizeFilter

### With Path Filter

Only consolidate specific directories (movies and TV shows):

<<< @/src/services/BinPack/SimpleConsolidator.example.ts#consolidationWithPathFilter

### From Specific Source Disks

Only consolidate from disk1, leave disk2 untouched:

<<< @/src/services/BinPack/SimpleConsolidator.example.ts#consolidationFromSpecificDisks

### Running and Handling Results

<<< @/src/services/BinPack/SimpleConsolidator.example.ts#runConsolidation

## How It Works

### 1. File Filtering

Files are filtered based on:
- **Size**: `minFileSizeBytes` excludes small files
- **Path**: `pathPrefixes` restricts to specific directories
- Both filters are optional

### 2. Disk Ranking

Disks are ranked by fullness (percentage used):
- Least full disks become source candidates (to be emptied)
- Fuller disks become target candidates (to receive files)
- `/mnt/disks` is automatically excluded

### 3. Bin-Packing Algorithm

For each source disk:
1. Generates all possible file combinations (up to `maxCombinationSize`)
2. Filters combinations that fit on available target disks
3. Selects the largest combination that achieves the `minSpaceBytes` goal
4. Updates available space tracking
5. Repeats until goal is met or no more combinations found

### 4. Iterative Emptying

The algorithm processes disks from least full to most full, attempting to completely empty each source disk before moving to the next. This maximizes the number of disks that are fully emptied.

## Configuration Tips

### Minimum Space

- **Too small**: May result in many small moves
- **Too large**: May not find valid combinations
- **Recommended**: Set to 10-20% of source disk capacity

### File Size Filter

- Use `minFileSizeBytes` to avoid moving many small files
- Moving large files is more efficient with rsync
- **Recommended**: 1GB - 10GB depending on your content

### Path Prefixes

- Useful for organizing content by type
- Examples: `/movies`, `/tv`, `/music`, `/documents`
- Paths are relative to disk mount (e.g., `/mnt/disk1/movies` → `/movies`)

### Max Combination Size

- Default: 5 files per combination
- **Smaller**: Faster algorithm, fewer options
- **Larger**: More thorough search, exponentially slower
- **Recommended**: 3-7 files

## See Also

- [WorldView](../../domain/WorldView.md) - Input data structure
- [MovePlan](../../domain/MovePlan.md) - Output structure
- [FileFilter](../../domain/FileFilter.md) - File filtering logic
- [MoveGenerator](./MoveGenerator.md) - Bin-packing implementation
