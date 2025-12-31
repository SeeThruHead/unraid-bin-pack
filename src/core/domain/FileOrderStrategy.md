# FileOrderStrategy

Strategies for organizing files by size into buckets for efficient consolidation.

## Overview

FileOrderStrategy groups files into size-based buckets and samples representative files from each bucket. This is useful for handling large file sets efficiently by working with representative samples rather than all files.

## Types

### FileBucket

```typescript
interface FileBucket {
  readonly minSize: number;
  readonly maxSize: number;
  readonly files: readonly FileEntry[];
  readonly avgSize: number;
}
```

A bucket containing files within a size range.

### BucketRange

```typescript
interface BucketRange {
  readonly min: number; // Minimum size (inclusive)
  readonly max: number; // Maximum size (exclusive)
}
```

## Default Size Buckets

```typescript
const DEFAULT_SIZE_BUCKETS = [
  { min: 0, max: 100 * KB }, // Tiny files
  { min: 100 * KB, max: 1 * MB }, // Small files
  { min: 1 * MB, max: 10 * MB }, // Medium files
  { min: 10 * MB, max: 100 * MB }, // Large files
  { min: 100 * MB, max: Infinity } // Huge files
];
```

## Functions

### `groupFilesIntoBuckets(files, bucketRanges?)`

Groups files into size-based buckets.

```typescript
import { groupFilesIntoBuckets } from "@domain/FileOrderStrategy";

const files = [
  { sizeBytes: 50_000 /* ... */ }, // 50KB
  { sizeBytes: 500_000 /* ... */ }, // 500KB
  { sizeBytes: 5_000_000 /* ... */ }, // 5MB
  { sizeBytes: 50_000_000 /* ... */ }, // 50MB
  { sizeBytes: 500_000_000 /* ... */ } // 500MB
];

const buckets = groupFilesIntoBuckets(files);

buckets.forEach((bucket) => {
  console.log(
    `Bucket [${bucket.minSize}-${bucket.maxSize}]: ${bucket.files.length} files, avg ${bucket.avgSize} bytes`
  );
});
```

### `sampleRepresentativeFiles(bucket)`

Samples 3 representative files from a bucket: smallest, median, and largest.

```typescript
import { sampleRepresentativeFiles } from "@domain/FileOrderStrategy";

const bucket = {
  minSize: 1_000_000,
  maxSize: 10_000_000,
  files: [
    { sizeBytes: 1_500_000 /* ... */ },
    { sizeBytes: 3_000_000 /* ... */ },
    { sizeBytes: 5_000_000 /* ... */ },
    { sizeBytes: 7_000_000 /* ... */ },
    { sizeBytes: 9_000_000 /* ... */ }
  ],
  avgSize: 5_100_000
};

const samples = sampleRepresentativeFiles(bucket);
// Returns: [smallest (1.5MB), median (5MB), largest (9MB)]
```

### `sampleFromAllBuckets(buckets)`

Samples representative files from all buckets and removes duplicates.

```typescript
import { groupFilesIntoBuckets, sampleFromAllBuckets } from "@domain/FileOrderStrategy";

const files = [
  /* thousands of files */
];

const buckets = groupFilesIntoBuckets(files);
const samples = sampleFromAllBuckets(buckets);

console.log(`Reduced ${files.length} files to ${samples.length} representative samples`);
```

## Usage Examples

### Custom Bucket Ranges

```typescript
import { groupFilesIntoBuckets, type BucketRange } from "@domain/FileOrderStrategy";

// Custom buckets for video files
const videoBuckets: BucketRange[] = [
  { min: 0, max: 1_000_000_000 }, // < 1GB (episodes)
  { min: 1_000_000_000, max: 5_000_000_000 }, // 1-5GB (movies)
  { min: 5_000_000_000, max: 20_000_000_000 }, // 5-20GB (HD movies)
  { min: 20_000_000_000, max: Infinity } // > 20GB (4K movies)
];

const buckets = groupFilesIntoBuckets(videoFiles, videoBuckets);
```

### Analyzing File Distribution

```typescript
import { groupFilesIntoBuckets } from "@domain/FileOrderStrategy";

const buckets = groupFilesIntoBuckets(files);

console.log("File size distribution:");
buckets.forEach((bucket) => {
  const totalSize = bucket.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  console.log(`  ${bucket.minSize}-${bucket.maxSize}:`);
  console.log(`    Files: ${bucket.files.length}`);
  console.log(`    Total: ${totalSize} bytes`);
  console.log(`    Average: ${bucket.avgSize} bytes`);
});
```

### Efficient Sampling for Large Datasets

```typescript
import { groupFilesIntoBuckets, sampleFromAllBuckets } from "@domain/FileOrderStrategy";

// Instead of processing 100,000 files
const allFiles = [
  /* 100,000 files */
];

// Work with ~15 representative samples (3 per bucket × 5 buckets)
const buckets = groupFilesIntoBuckets(allFiles);
const samples = sampleFromAllBuckets(buckets);

// Use samples for quick analysis or optimization
console.log(`Analyzing ${samples.length} samples instead of ${allFiles.length} files`);
```

## How It Works

### Bucketing Strategy

Files are grouped by exponential size ranges:

1. Tiny (< 100KB): Config files, scripts
2. Small (100KB - 1MB): Documents, images
3. Medium (1-10MB): Large documents, small videos
4. Large (10-100MB): Video clips, ISOs
5. Huge (> 100MB): Movies, large archives

This provides good distribution across typical file sizes.

### Sampling Strategy

For each bucket, samples 3 files:

1. **Smallest**: Lower bound representative
2. **Median**: Typical file in bucket
3. **Largest**: Upper bound representative

This gives a good representation of the bucket's size range.

### Empty Bucket Filtering

Buckets with no files are automatically filtered out, so you only get buckets that actually contain files.

## See Also

- [FileEntry](./FileEntry.md) - File metadata
- [FileFilter](./FileFilter.md) - File filtering
- [SimpleConsolidator](../services/BinPack/SimpleConsolidator.md) - Uses file strategies
