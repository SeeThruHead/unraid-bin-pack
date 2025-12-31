import type { FileEntry } from "./FileEntry"

const KB = 1024
const MB = 1024 * KB

export interface FileBucket {
  readonly minSize: number
  readonly maxSize: number
  readonly files: readonly FileEntry[]
  readonly avgSize: number
}

export interface BucketRange {
  readonly min: number
  readonly max: number
}

export const DEFAULT_SIZE_BUCKETS: readonly BucketRange[] = [
  { min: 0, max: 100 * KB },
  { min: 100 * KB, max: 1 * MB },
  { min: 1 * MB, max: 10 * MB },
  { min: 10 * MB, max: 100 * MB },
  { min: 100 * MB, max: Infinity },
] as const

const filesInRange = (files: readonly FileEntry[], range: BucketRange): readonly FileEntry[] =>
  files.filter(file => file.sizeBytes >= range.min && file.sizeBytes < range.max)

const calculateAverageSize = (files: readonly FileEntry[]): number =>
  files.length > 0
    ? files.reduce((sum, file) => sum + file.sizeBytes, 0) / files.length
    : 0

export const createFileBucket = (
  files: readonly FileEntry[],
  range: BucketRange
): FileBucket => {
  const bucketFiles = filesInRange(files, range)
  return {
    minSize: range.min,
    maxSize: range.max,
    files: bucketFiles,
    avgSize: calculateAverageSize(bucketFiles),
  }
}

export const groupFilesIntoBuckets = (
  files: readonly FileEntry[],
  bucketRanges: readonly BucketRange[] = DEFAULT_SIZE_BUCKETS
): readonly FileBucket[] =>
  bucketRanges
    .map(range => createFileBucket(files, range))
    .filter(bucket => bucket.files.length > 0)

export const sampleRepresentativeFiles = (bucket: FileBucket): readonly FileEntry[] => {
  const sortedBySize = [...bucket.files].sort((a, b) => a.sizeBytes - b.sizeBytes)

  const indices = {
    smallest: 0,
    median: Math.floor(sortedBySize.length / 2),
    largest: sortedBySize.length - 1,
  }

  return [
    sortedBySize[indices.smallest],
    sortedBySize[indices.median],
    sortedBySize[indices.largest],
  ].filter(Boolean) as FileEntry[]
}

export const sampleFromAllBuckets = (buckets: readonly FileBucket[]): readonly FileEntry[] => {
  const sampledFiles = buckets.flatMap(sampleRepresentativeFiles)

  const uniqueMap = new Map(sampledFiles.map(file => [file.absolutePath, file]))
  return Array.from(uniqueMap.values())
}
