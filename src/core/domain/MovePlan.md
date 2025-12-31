# MovePlan

A `MovePlan` represents a set of file moves from source disks to target disks, along with a summary of the planned operations.

## Types

### MoveStatus

```typescript
type MoveStatus = "pending" | "in_progress" | "completed" | "skipped" | "failed";
```

### FileMove

Represents a single file move operation.

```typescript
interface FileMove {
  readonly file: FileEntry; // The file to move
  readonly targetDiskPath: string; // Destination disk path
  readonly destinationPath: string; // Full destination path
  readonly status: MoveStatus; // Current status
  readonly reason?: string; // Optional reason (for skipped/failed)
}
```

### MovePlan

The complete plan with summary statistics.

```typescript
interface MovePlan {
  readonly moves: readonly FileMove[];
  readonly summary: MoveSummary;
}

interface MoveSummary {
  readonly totalFiles: number; // Total pending files
  readonly totalBytes: number; // Total bytes to move
  readonly movesPerDisk: ReadonlyMap<string, number>; // File count per disk
  readonly bytesPerDisk: ReadonlyMap<string, number>; // Bytes per disk
}
```

## Creating Moves

### Simple File Move

<<< @/src/domain/MovePlan.example.ts#simpleFileMove

### Complete Move Plan

<<< @/src/domain/MovePlan.example.ts#basicMovePlan

### Skipping Moves

<<< @/src/domain/MovePlan.example.ts#movePlanWithSkips

## Functions

### `createFileMove(file, targetDiskPath)`

Creates a new file move with "pending" status.

```typescript
const move = createFileMove(file, "/mnt/disk2");
// {
//   file: {...},
//   targetDiskPath: '/mnt/disk2',
//   destinationPath: '/mnt/disk2/movies/movie1.mkv',
//   status: 'pending'
// }
```

### `skipMove(move, reason)`

Marks a move as skipped with a reason.

```typescript
const skipped = skipMove(move, "Insufficient space");
// { ...move, status: 'skipped', reason: 'Insufficient space' }
```

### `computeSummary(moves)`

Computes statistics for a set of moves (only counts "pending" moves).

```typescript
const summary = computeSummary(moves);
// {
//   totalFiles: 2,
//   totalBytes: 25000000000,
//   movesPerDisk: Map { '/mnt/disk3' => 2 },
//   bytesPerDisk: Map { '/mnt/disk3' => 25000000000 }
// }
```

### `createMovePlan(moves)`

Creates a complete move plan with auto-computed summary.

<<< @/src/domain/MovePlan.example.ts#analyzeSummary

## See Also

- [FileEntry](./FileEntry.md) - File metadata structure
- [PlanScriptGenerator](../services/PlanScriptGenerator/PlanScriptGenerator.md) - Generates bash scripts from MovePlans
- [TransferService](../services/TransferService/TransferService.md) - Executes MovePlans
