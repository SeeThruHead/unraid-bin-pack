import type { FileEntry } from './FileEntry'
import type { FileFilterCriteria } from './FileFilter'
import { filterFilesBySize, filterFilesByPathPrefix, applyFileFilters } from './FileFilter'

/**
 * Example files for filtering
 */
const exampleFiles: FileEntry[] = [
  {
    absolutePath: '/mnt/disk1/movies/action.mkv',
    relativePath: 'movies/action.mkv',
    sizeBytes: 50_000_000_000, // 50GB
    diskPath: '/mnt/disk1',
  },
  {
    absolutePath: '/mnt/disk1/movies/comedy.mkv',
    relativePath: 'movies/comedy.mkv',
    sizeBytes: 30_000_000_000, // 30GB
    diskPath: '/mnt/disk1',
  },
  {
    absolutePath: '/mnt/disk1/tv/sitcom.mkv',
    relativePath: 'tv/sitcom.mkv',
    sizeBytes: 5_000_000_000, // 5GB
    diskPath: '/mnt/disk1',
  },
  {
    absolutePath: '/mnt/disk1/music/album.flac',
    relativePath: 'music/album.flac',
    sizeBytes: 500_000_000, // 500MB
    diskPath: '/mnt/disk1',
  },
  {
    absolutePath: '/mnt/disk1/documents/file.pdf',
    relativePath: 'documents/file.pdf',
    sizeBytes: 10_000_000, // 10MB
    diskPath: '/mnt/disk1',
  },
]

/**
 * Example: Filter by minimum size
 */
export const filterBySize = () => {
  const minSize = 10_000_000_000 // 10GB

  const filtered = filterFilesBySize(exampleFiles, minSize)

  // Returns: action.mkv (50GB), comedy.mkv (30GB)
  // Excludes: sitcom.mkv (5GB), album.flac (500MB), file.pdf (10MB)

  return filtered
}

/**
 * Example: Filter by path prefix
 */
export const filterByPath = () => {
  const pathPrefixes = ['/movies', '/tv']

  const filtered = filterFilesByPathPrefix(exampleFiles, pathPrefixes)

  // Returns: action.mkv, comedy.mkv, sitcom.mkv
  // Excludes: album.flac, file.pdf

  return filtered
}

/**
 * Example: Apply multiple filters
 */
export const applyMultipleFilters = () => {
  const criteria: FileFilterCriteria = {
    minSizeBytes: 10_000_000_000, // 10GB
    pathPrefixes: ['/movies'],     // Only movies
  }

  const filtered = applyFileFilters(exampleFiles, criteria)

  // Returns: action.mkv (50GB), comedy.mkv (30GB)
  // Combines both filters: large files in /movies

  return filtered
}

/**
 * Example: No filters (returns all files)
 */
export const noFilters = () => {
  const criteria: FileFilterCriteria = {}

  const filtered = applyFileFilters(exampleFiles, criteria)

  // Returns all 5 files unchanged

  return filtered
}
