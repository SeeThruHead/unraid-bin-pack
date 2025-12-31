# MoveOptimization

Optimize move plans by removing redundant operations and resolving move chains.

## Overview

MoveOptimization eliminates unnecessary file moves that can occur when files are moved multiple times or when source and destination are the same. This reduces transfer time and complexity.

## Functions

### `optimizeMoveChains(moves)`

Resolves move chains and removes redundant moves.

```typescript
function optimizeMoveChains(moves: readonly FileMove[]): readonly FileMove[];
```

**What it does:**

1. **Resolves chains**: If file A moves to B, then B moves to C, optimize to: A moves directly to C
2. **Removes same-disk moves**: Eliminates moves where source === destination
3. **Removes intermediate moves**: Skips moves that become redundant after chain resolution

## Usage Examples

### Resolving Move Chains

```typescript
import { optimizeMoveChains } from "@domain/MoveOptimization";
import { createFileMove } from "@domain/MovePlan";

// File A is on disk1
const fileA = {
  absolutePath: "/mnt/disk1/file.txt",
  relativePath: "file.txt",
  sizeBytes: 1000,
  diskPath: "/mnt/disk1"
};

// Bad plan: file moves disk1 → disk2 → disk3
const unoptimized = [
  createFileMove(fileA, "/mnt/disk2"), // disk1 → disk2
  createFileMove(
    {
      absolutePath: "/mnt/disk2/file.txt",
      relativePath: "file.txt",
      sizeBytes: 1000,
      diskPath: "/mnt/disk2"
    },
    "/mnt/disk3" // disk2 → disk3
  )
];

// Optimize: resolves to single move disk1 → disk3
const optimized = optimizeMoveChains(unoptimized);

console.log(`Reduced ${unoptimized.length} moves to ${optimized.length}`);
// Reduced 2 moves to 1
```

### Removing Same-Disk Moves

```typescript
import { optimizeMoveChains } from "@domain/MoveOptimization";

const moves = [
  // Good move: different disks
  createFileMove({ diskPath: "/mnt/disk1" /* ... */ }, "/mnt/disk2"),

  // Bad move: same disk (will be removed)
  createFileMove(
    { diskPath: "/mnt/disk3" /* ... */ },
    "/mnt/disk3" // source === target!
  )
];

const optimized = optimizeMoveChains(moves);
// Only the first move remains
```

### Optimizing Complex Plans

```typescript
import { optimizeMoveChains } from "@domain/MoveOptimization";
import { createMovePlan } from "@domain/MovePlan";

// Create a complex plan with potential redundancy
const moves = [
  /* many file moves */
];

// Optimize before execution
const optimizedMoves = optimizeMoveChains(moves);

// Create final plan
const plan = createMovePlan(optimizedMoves);

console.log(`Optimized from ${moves.length} to ${optimizedMoves.length} moves`);
console.log(`Will transfer ${plan.summary.totalBytes} bytes`);
```

## How It Works

### 1. Build Move Maps

Creates two maps:

- **destToSource**: Maps destination paths to their source paths
- **sourceToDest**: Maps source paths to their destination paths

### 2. Resolve Chains

For each move, checks if the source file is actually the destination of another move. If so, traces back to find the original source.

**Example:**

```
Original:
  fileA (/disk1) → fileA-temp (/disk2)
  fileA-temp (/disk2) → fileA-final (/disk3)

Optimized:
  fileA (/disk1) → fileA-final (/disk3)
```

### 3. Remove Redundant Moves

Filters out:

- Moves where the destination is the source of another move (intermediate moves)
- Moves where source disk === target disk (same-disk moves)

### 4. Preserve Status

Only `pending` moves are optimized. Moves with status `completed`, `failed`, or `skipped` are preserved as-is.

## Edge Cases

### Skipped/Failed Moves

```typescript
const moves = [
  createFileMove(/* ... */), // pending - will be optimized
  skipMove(createFileMove(/* ... */), "reason") // skipped - preserved as-is
];

const optimized = optimizeMoveChains(moves);
// Skipped move remains unchanged
```

### Circular Moves

Circular move patterns are resolved by finding the ultimate destination:

```
A → B → C → A (circular)
```

The optimizer traces forward until it finds a move that isn't the source of another move.

### Empty Plans

```typescript
const optimized = optimizeMoveChains([]);
// Returns: []
```

## Performance Impact

**Before optimization:**

```
File moves: 100
Transfers needed: 100
Time: ~10 hours (assuming 6min/transfer)
```

**After optimization:**

```
File moves: 75 (25% reduction)
Transfers needed: 75
Time: ~7.5 hours (2.5 hour savings!)
```

Real optimization impact depends on:

- Number of move chains in the plan
- Number of same-disk moves
- File sizes

## See Also

- [MovePlan](./MovePlan.md) - Move plan structure
- [SimpleConsolidator](../services/BinPack/SimpleConsolidator.md) - Generates plans to optimize
- [PlanScriptGenerator](../services/PlanScriptGenerator/PlanScriptGenerator.md) - Executes optimized plans
