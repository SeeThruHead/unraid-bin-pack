# FolderGroup

Group files by folder structure for folder-aware consolidation.

## Overview

FolderGroup helps keep related files together by grouping them by their folder paths. This is useful for maintaining folder structure during consolidation and deciding which folders should stay together.

## Types

### FolderGroup

```typescript
interface FolderGroup {
  readonly folderPath: string; // Folder path (relative)
  readonly files: readonly FileEntry[]; // Files in this folder
  readonly totalBytes: number; // Total size of all files
  readonly largestFileBytes: number; // Size of largest file
  readonly keepTogether: boolean; // Should files stay together?
}
```

### FolderGroupOptions

```typescript
interface FolderGroupOptions {
  readonly minSplitSizeBytes: number; // Min size before allowing folder split
  readonly folderThreshold: number; // Threshold for largest file ratio
}
```

**Defaults:**

- `minSplitSizeBytes`: 1GB
- `folderThreshold`: 0.9 (90%)

## Functions

### `groupByImmediateFolder(files, options?)`

Groups files by their immediate parent folder.

```typescript
import { groupByImmediateFolder } from "@domain/FolderGroup";

const files = [
  {
    relativePath: "movies/action/movie1.mkv",
    sizeBytes: 5_000_000_000
    /* ... */
  },
  {
    relativePath: "movies/action/movie2.mkv",
    sizeBytes: 6_000_000_000
    /* ... */
  },
  {
    relativePath: "movies/comedy/movie3.mkv",
    sizeBytes: 4_000_000_000
    /* ... */
  }
];

const groups = groupByImmediateFolder(files);

// Result:
// [
//   {
//     folderPath: 'movies/action',
//     files: [movie1, movie2],
//     totalBytes: 11000000000,
//     largestFileBytes: 6000000000,
//     keepTogether: true,
//   },
//   {
//     folderPath: 'movies/comedy',
//     files: [movie3],
//     totalBytes: 4000000000,
//     largestFileBytes: 4000000000,
//     keepTogether: true,
//   }
// ]
```

### `groupByTopLevelFolder(files)`

Groups files by their top-level folder only.

```typescript
import { groupByTopLevelFolder } from "@domain/FolderGroup";

const files = [
  { relativePath: "movies/action/movie1.mkv" /* ... */ },
  { relativePath: "movies/comedy/movie2.mkv" /* ... */ },
  { relativePath: "tv/series1/episode1.mkv" /* ... */ }
];

const groups = groupByTopLevelFolder(files);

// Result:
// [
//   { folderPath: 'movies', files: [movie1, movie2], /* ... */ },
//   { folderPath: 'tv', files: [episode1], /* ... */ }
// ]
```

All top-level groups have `keepTogether: true`.

### `sortBySize(folders)`

Sorts folder groups by total size (largest first).

```typescript
import { groupByImmediateFolder, sortBySize } from "@domain/FolderGroup";

const groups = groupByImmediateFolder(files);
const sorted = sortBySize(groups);

sorted.forEach((group) => {
  console.log(`${group.folderPath}: ${group.totalBytes} bytes`);
});
// Largest folders first
```

## Usage Examples

### Keeping Small Folders Together

```typescript
import { groupByImmediateFolder } from "@domain/FolderGroup";

const groups = groupByImmediateFolder(files, {
  minSplitSizeBytes: 1_000_000_000, // 1GB
  folderThreshold: 0.9
});

groups.forEach((group) => {
  if (group.keepTogether) {
    console.log(`Keep ${group.folderPath} together (${group.totalBytes} bytes)`);
  } else {
    console.log(`${group.folderPath} can be split (${group.totalBytes} bytes)`);
  }
});
```

### Analyzing Folder Distribution

```typescript
import { groupByTopLevelFolder, sortBySize } from "@domain/FolderGroup";

const groups = sortBySize(groupByTopLevelFolder(files));

console.log("Top-level folders by size:");
groups.forEach((group, index) => {
  const avgSize = group.totalBytes / group.files.length;
  console.log(`${index + 1}. ${group.folderPath}:`);
  console.log(`   Files: ${group.files.length}`);
  console.log(`   Total: ${group.totalBytes} bytes`);
  console.log(`   Largest: ${group.largestFileBytes} bytes`);
  console.log(`   Average: ${avgSize} bytes`);
});
```

### Folder-Aware Consolidation

```typescript
import { groupByImmediateFolder } from "@domain/FolderGroup";

const groups = groupByImmediateFolder(files);

// Move entire folders together
for (const group of groups) {
  if (group.keepTogether) {
    // Find a disk with enough space for the entire folder
    const targetDisk = findDiskWithSpace(group.totalBytes);

    if (targetDisk) {
      console.log(`Move all ${group.files.length} files from ${group.folderPath} to ${targetDisk}`);
    }
  } else {
    // Folder can be split across disks
    console.log(`${group.folderPath} can be split if needed`);
  }
}
```

## How It Works

### keepTogether Logic

A folder is marked `keepTogether: true` when:

1. **Small folder**: Total size < `minSplitSizeBytes` (default 1GB)
   - OR
2. **Dominated by one file**: Largest file is >= 90% of total folder size

**Why?**

- Small folders are easy to move together
- If one file dominates, the folder is essentially that one file

### Immediate vs Top-Level Grouping

**Immediate folder:**

- `movies/action/movie1.mkv` → folder: `movies/action`
- `movies/action/movie2.mkv` → folder: `movies/action`

**Top-level folder:**

- `movies/action/movie1.mkv` → folder: `movies`
- `tv/series1/episode1.mkv` → folder: `tv`

Use immediate for fine-grained control, top-level for broader organization.

### Empty Folder Paths

Files in the root have empty string as folder path:

- `file.txt` → folder: `""`

## Configuration Examples

### Strict Folder Grouping

Never split folders:

```typescript
const groups = groupByImmediateFolder(files, {
  minSplitSizeBytes: Infinity, // Never allow splits
  folderThreshold: 0
});
// All groups will have keepTogether: true
```

### Loose Folder Grouping

Allow more splitting:

```typescript
const groups = groupByImmediateFolder(files, {
  minSplitSizeBytes: 100_000_000, // Only keep together if < 100MB
  folderThreshold: 0.95 // Only if one file is 95%+ of total
});
// Most groups can be split
```

## See Also

- [FileEntry](./FileEntry.md) - File metadata
- [SimpleConsolidator](../services/BinPack/SimpleConsolidator.md) - Can use folder groups
