# WorldView

The `WorldView` represents the current state of your disk array and files at a point in time. It's the primary input to the consolidation algorithms.

## Types

### DiskState

Represents the state of a single disk.

```typescript
interface DiskState {
  readonly path: string; // Mount path (e.g., '/mnt/disk1')
  readonly totalBytes: number; // Total disk capacity in bytes
  readonly freeBytes: number; // Available space in bytes
}
```

### WorldView

The complete view of all disks and files.

```typescript
interface WorldView {
  readonly disks: ReadonlyArray<DiskState>; // All disks in the array
  readonly files: ReadonlyArray<FileEntry>; // All files across all disks
}
```

## Usage

### Creating a Basic WorldView

<<< @/src/domain/WorldView.example.ts#basicWorldView

This creates a simple WorldView with:

- 2 disks (disk1 is 87.5% full, disk2 is 12.5% full)
- 3 files totaling 30GB on disk1

### Multiple Disks with Various Files

<<< @/src/domain/WorldView.example.ts#multiDiskWorldView

This example shows a more complex scenario with:

- 3 disks at different fullness levels
- Files of various sizes
- Different file types across disks

## How It's Used

The `WorldView` is typically created by the `ScannerService`, which:

1. Scans specified disk paths
2. Reads disk stats (total/free space)
3. Discovers all files and their metadata
4. Assembles everything into a WorldView

The consolidation algorithms then use the WorldView to:

- Identify which disks are fullest (best candidates for emptying)
- Find which files can be moved
- Calculate optimal file combinations for bin-packing

## See Also

- [FileEntry](./FileEntry.md) - Individual file metadata
- [ScannerService](../services/ScannerService/ScannerService.md) - Creates WorldView from disk scans
- [SimpleConsolidator](../services/BinPack/SimpleConsolidator.md) - Uses WorldView for consolidation
