# SimpleConsolidator Refactoring Proposal

## Problem: Cognitive Overload

The `SimpleConsolidator.ts` file (~400 lines) handles multiple discrete concepts in one file:

1. File filtering (by size, path)
2. Disk ranking (by fullness)
3. Bucketing strategy (organizing files by size)
4. Sampling strategy (selecting representative files)
5. Combination generation (permutations of files)
6. Scoring strategy (utilization calculation)
7. State management (tracking moves, available space)
8. Main algorithm orchestration

## Discrete Concepts → Separate Modules

### 1. File Filtering Strategy

**Concept**: Filter files based on criteria
**Current**: Inline in main function with logging
**Proposed**: `src/domain/FileFilter.ts`

```typescript
// src/domain/FileFilter.ts
export interface FileFilterCriteria {
  readonly minSizeBytes?: number;
  readonly pathPrefixes?: readonly string[];
}

export const filterFilesBySize = (
  files: readonly FileEntry[],
  minSizeBytes: number
): readonly FileEntry[] => files.filter((file) => file.sizeBytes >= minSizeBytes);

export const filterFilesByPathPrefix = (
  files: readonly FileEntry[],
  pathPrefixes: readonly string[]
): readonly FileEntry[] =>
  files.filter((file) =>
    pathPrefixes.some((prefix) => {
      const diskMatch = file.absolutePath.match(/^\/mnt\/disk\d+(.*)$/);
      if (diskMatch && diskMatch[1]) {
        return diskMatch[1].startsWith(prefix);
      }
      return file.absolutePath.startsWith(prefix);
    })
  );

export const applyFileFilters = (
  files: readonly FileEntry[],
  criteria: FileFilterCriteria
): readonly FileEntry[] => {
  let filtered = files;

  if (criteria.minSizeBytes && criteria.minSizeBytes > 0) {
    filtered = filterFilesBySize(filtered, criteria.minSizeBytes);
  }

  if (criteria.pathPrefixes && criteria.pathPrefixes.length > 0) {
    filtered = filterFilesByPathPrefix(filtered, criteria.pathPrefixes);
  }

  return filtered;
};
```

**Benefits**:

- Pure functions, easy to test
- Clear naming reveals intent
- Can be reused elsewhere
- Path matching logic isolated

---

### 2. Disk Ranking Strategy

**Concept**: Order disks by some criteria
**Current**: `rankDisksByFullness` function (already good!)
**Could extract to**: `src/domain/DiskRanking.ts`

```typescript
// src/domain/DiskRanking.ts
export interface DiskWithUsage extends DiskState {
  readonly usedBytes: number;
  readonly usedPct: number;
}

export const calculateDiskUsage = (disk: DiskState): DiskWithUsage => {
  const usedBytes = disk.totalBytes - disk.freeBytes;
  const usedPct = disk.totalBytes > 0 ? (usedBytes / disk.totalBytes) * 100 : 0;
  return { ...disk, usedBytes, usedPct };
};

export const hasFilesOnDisk = (disk: DiskState, files: readonly FileEntry[]): boolean =>
  files.some((file) => file.diskPath === disk.path);

export const rankDisksByFullness = (
  disks: readonly DiskState[],
  files: readonly FileEntry[]
): readonly DiskWithUsage[] =>
  pipe(
    disks,
    Array.map(calculateDiskUsage),
    Array.filter((disk) => hasFilesOnDisk(disk, files)),
    Array.sort(Order.mapInput(Order.number, (d: DiskWithUsage) => d.usedPct))
  );
```

**Benefits**:

- Each function has single responsibility
- `calculateDiskUsage` is pure and reusable
- `hasFilesOnDisk` clearly named predicate
- Easy to add different ranking strategies later

---

### 3. Bucketing & Sampling Strategy

**Concept**: Organize files into buckets and sample them
**Current**: Scattered across multiple functions
**Proposed**: `src/domain/FileOrderStrategy.ts`

```typescript
// src/domain/FileOrderStrategy.ts
const KB = 1024;
const MB = 1024 * KB;

export interface FileBucket {
  readonly minSize: number;
  readonly maxSize: number;
  readonly files: readonly FileEntry[];
  readonly avgSize: number;
}

export interface BucketRange {
  readonly min: number;
  readonly max: number;
}

export const DEFAULT_SIZE_BUCKETS: readonly BucketRange[] = [
  { min: 0, max: 100 * KB },
  { min: 100 * KB, max: 1 * MB },
  { min: 1 * MB, max: 10 * MB },
  { min: 10 * MB, max: 100 * MB },
  { min: 100 * MB, max: Infinity }
] as const;

const filesInRange = (files: readonly FileEntry[], range: BucketRange) =>
  files.filter((file) => file.sizeBytes >= range.min && file.sizeBytes < range.max);

const calculateAverageSize = (files: readonly FileEntry[]): number =>
  files.length > 0 ? files.reduce((sum, file) => sum + file.sizeBytes, 0) / files.length : 0;

export const createFileBucket = (files: readonly FileEntry[], range: BucketRange): FileBucket => ({
  minSize: range.min,
  maxSize: range.max,
  files: filesInRange(files, range),
  avgSize: calculateAverageSize(filesInRange(files, range))
});

export const groupFilesIntoBuckets = (
  files: readonly FileEntry[],
  bucketRanges: readonly BucketRange[] = DEFAULT_SIZE_BUCKETS
): readonly FileBucket[] =>
  bucketRanges
    .map((range) => createFileBucket(files, range))
    .filter((bucket) => bucket.files.length > 0);

// Sampling Strategy
export const sampleRepresentativeFiles = (bucket: FileBucket): readonly FileEntry[] => {
  const sortedBySize = [...bucket.files].sort((a, b) => a.sizeBytes - b.sizeBytes);

  const indices = {
    smallest: 0,
    median: Math.floor(sortedBySize.length / 2),
    largest: sortedBySize.length - 1
  };

  return [
    sortedBySize[indices.smallest],
    sortedBySize[indices.median],
    sortedBySize[indices.largest]
  ].filter(Boolean) as FileEntry[];
};

export const sampleFromAllBuckets = (buckets: readonly FileBucket[]): readonly FileEntry[] => {
  const sampledFiles = buckets.flatMap(sampleRepresentativeFiles);

  // Deduplicate by absolute path
  const uniqueMap = new Map(sampledFiles.map((file) => [file.absolutePath, file]));
  return Array.from(uniqueMap.values());
};
```

**Benefits**:

- Bucketing strategy completely isolated
- Sampling logic clear and testable
- Can easily change bucket ranges or sampling strategy
- Each function does one thing

---

### 4. Combination Generation

**Concept**: Generate k-sized combinations
**Current**: Generic helper function
**Could extract to**: `src/lib/combinatorics.ts`

```typescript
// src/lib/combinatorics.ts
export const generateCombinations = <T>(
  array: readonly T[],
  k: number
): readonly (readonly T[])[] => {
  if (k === 0) return [[]];
  if (k > array.length) return [];
  if (k === 1) return array.map((item) => [item]);

  const results: T[][] = [];

  const backtrack = (start: number, current: T[]) => {
    if (current.length === k) {
      results.push([...current]);
      return;
    }

    for (let i = start; i < array.length; i++) {
      current.push(array[i]!);
      backtrack(i + 1, current);
      current.pop();
    }
  };

  backtrack(0, []);
  return results;
};
```

**Benefits**:

- Generic utility, usable anywhere
- Well-known algorithm pattern
- Easy to test in isolation

---

### 5. Scoring Strategy

**Concept**: How to score file combinations
**Current**: Inline calculation
**Proposed**: `src/domain/ScoringStrategy.ts`

```typescript
// src/domain/ScoringStrategy.ts
export interface ScoredCandidate {
  readonly files: readonly FileEntry[];
  readonly totalBytes: number;
  readonly targetDisk: string;
  readonly wastedSpace: number;
  readonly score: number;
}

export const calculateUtilizationScore = (totalBytes: number, availableBytes: number): number =>
  totalBytes / availableBytes;

export const scoreCombination = (
  files: readonly FileEntry[],
  availableBytes: number,
  targetDisk: string
): ScoredCandidate => {
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const wastedSpace = availableBytes - totalBytes;
  const score = calculateUtilizationScore(totalBytes, availableBytes);

  return {
    files,
    totalBytes,
    targetDisk,
    wastedSpace,
    score
  };
};

export const findBestScored = (candidates: readonly ScoredCandidate[]): ScoredCandidate | null =>
  candidates.length === 0
    ? null
    : candidates.reduce((best, current) => (current.score > best.score ? current : best));
```

**Benefits**:

- Scoring logic in one place
- Easy to change scoring algorithm
- Can add weighted scoring, penalties, etc.
- Pure functions

---

### 6. Move Candidate Generation

**Concept**: Find valid file combinations for a destination
**Current**: `findBestCombinationForDisk` (complex, mixes concerns)
**Proposed**: Break into pipeline stages

```typescript
// src/services/MoveGenerator.ts
import { sampleFromAllBuckets, groupFilesIntoBuckets } from "../domain/FileOrderStrategy";
import { scoreCombination, findBestScored, type ScoredCandidate } from "../domain/ScoringStrategy";
import { generateCombinations } from "../lib/combinatorics";

const filesThatFit = (files: readonly FileEntry[], maxSize: number) =>
  files.filter((file) => file.sizeBytes <= maxSize);

const combinationsThatFit = (combinations: readonly (readonly FileEntry[])[], maxSize: number) =>
  combinations.filter((combo) => combo.reduce((sum, f) => sum + f.sizeBytes, 0) <= maxSize);

export const findBestSingleFile = (
  files: readonly FileEntry[],
  availableBytes: number,
  targetDisk: string
): ScoredCandidate | null => {
  const fitting = filesThatFit(files, availableBytes);
  const scored = fitting.map((file) => scoreCombination([file], availableBytes, targetDisk));
  return findBestScored(scored);
};

export const findBestCombination = (
  files: readonly FileEntry[],
  availableBytes: number,
  targetDisk: string,
  maxCombinationSize: number
): ScoredCandidate | null => {
  const fitting = filesThatFit(files, availableBytes);
  if (fitting.length === 0) return null;

  // Try single files first
  const bestSingle = findBestSingleFile(fitting, availableBytes, targetDisk);

  // Sample from buckets for combination search
  const buckets = groupFilesIntoBuckets(fitting);
  const sampledFiles = sampleFromAllBuckets(buckets);

  // Try combinations of increasing size
  const allCandidates: ScoredCandidate[] = bestSingle ? [bestSingle] : [];

  for (let size = 2; size <= Math.min(maxCombinationSize, sampledFiles.length); size++) {
    const combinations = generateCombinations(sampledFiles, size);
    const fittingCombos = combinationsThatFit(combinations, availableBytes);
    const scored = fittingCombos.map((combo) =>
      scoreCombination(combo, availableBytes, targetDisk)
    );
    allCandidates.push(...scored);
  }

  return findBestScored(allCandidates);
};
```

**Benefits**:

- Clear pipeline: filter → sample → generate → score → select
- Each step is a named function
- Easy to understand flow
- Can test each stage independently

---

### 7. Main Algorithm (Simplified)

**Current**: 200+ lines of imperative code
**Proposed**: High-level orchestration with clear stages

```typescript
// src/services/SimpleConsolidator.ts (refactored)
import { applyFileFilters } from "../domain/FileFilter";
import { rankDisksByFullness } from "../domain/DiskRanking";
import { findBestCombination } from "./MoveGenerator";

export const consolidateSimple = (
  worldView: WorldView,
  options: ConsolidationOptions
): Effect.Effect<ConsolidationResult, never> =>
  Effect.gen(function* () {
    // Stage 1: Prepare data
    const filteredFiles = applyFileFilters(worldView.files, {
      minSizeBytes: options.minFileSizeBytes,
      pathPrefixes: options.pathPrefixes
    });

    const rankedDisks = rankDisksByFullness(worldView.disks, filteredFiles).filter(
      (d) => !options.srcDiskPaths || options.srcDiskPaths.includes(d.path)
    );

    // Stage 2: Initialize tracking
    const availableSpace = new Map(worldView.disks.map((d) => [d.path, d.freeBytes]));
    const movedFiles = new Set<string>();
    const allMoves: FileMove[] = [];

    // Stage 3: Process each source disk
    for (const sourceDisk of rankedDisks) {
      const diskMoves = yield* processSourceDisk(
        sourceDisk,
        filteredFiles,
        availableSpace,
        movedFiles,
        options
      );
      allMoves.push(...diskMoves);
    }

    return {
      moves: allMoves,
      bytesConsolidated: allMoves.reduce((sum, m) => sum + m.file.sizeBytes, 0)
    };
  });

const processSourceDisk = (
  sourceDisk: DiskWithUsage,
  allFiles: readonly FileEntry[],
  availableSpace: Map<string, number>,
  movedFiles: Set<string>,
  options: ConsolidationOptions
): Effect.Effect<FileMove[], never> =>
  Effect.gen(function* () {
    const moves: FileMove[] = [];
    let remainingFiles = allFiles.filter(
      (f) => f.diskPath === sourceDisk.path && !movedFiles.has(f.absolutePath)
    );

    while (remainingFiles.length > 0) {
      const bestMove = findBestCombination(remainingFiles, availableSpace, options);

      if (!bestMove) break;

      // Create and track moves
      const newMoves = bestMove.files.map((f) => createFileMove(f, bestMove.targetDisk));
      moves.push(...newMoves);

      // Update state
      newMoves.forEach((m) => {
        movedFiles.add(m.file.absolutePath);
        const current = availableSpace.get(bestMove.targetDisk) ?? 0;
        availableSpace.set(bestMove.targetDisk, current - m.file.sizeBytes);
      });

      remainingFiles = remainingFiles.filter((f) => !movedFiles.has(f.absolutePath));
    }

    return moves;
  });
```

---

## Proposed File Structure

```
src/
├── domain/
│   ├── FileFilter.ts          # Pure file filtering logic
│   ├── DiskRanking.ts         # Disk ranking strategies
│   ├── FileOrderStrategy.ts   # Bucketing & sampling
│   └── ScoringStrategy.ts     # Scoring algorithms
├── services/
│   ├── MoveGenerator.ts       # Candidate generation
│   └── SimpleConsolidator.ts  # Main orchestration (100 lines instead of 400)
└── lib/
    └── combinatorics.ts       # Generic combination generation
```

## Benefits Summary

1. **Reduced Cognitive Load**: Each file < 150 lines, focused on one concept
2. **Better Testability**: Pure functions easy to test in isolation
3. **Reusability**: Filtering, ranking, bucketing can be used elsewhere
4. **Clarity**: Function names reveal intent without comments
5. **Extensibility**: Easy to add new strategies (ranking, scoring, bucketing)
6. **Composition**: Main algorithm is clear pipeline of stages

## Migration Strategy

1. Extract pure functions first (FileFilter, DiskRanking, ScoringStrategy)
2. Extract generic utilities (combinatorics)
3. Extract domain logic (FileOrderStrategy)
4. Refactor MoveGenerator to use extracted pieces
5. Simplify SimpleConsolidator to orchestrate
6. Run tests after each extraction to ensure correctness

---

**This refactoring follows the principle: "Programs must be written for people to read, and only incidentally for machines to execute."** - Abelson & Sussman
