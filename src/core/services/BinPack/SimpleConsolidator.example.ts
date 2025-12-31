import { Effect } from 'effect'
import type { WorldView } from '@domain/WorldView'
import type { ConsolidationOptions, ConsolidationResult } from './SimpleConsolidator'
import { consolidateSimple } from './SimpleConsolidator'

/**
 * Example: Basic consolidation to free 100GB
 */
export const basicConsolidation = () => {
  const worldView: WorldView = {
    disks: [
      {
        path: '/mnt/disk1',
        totalBytes: 4_000_000_000_000, // 4TB
        freeBytes: 500_000_000_000,     // 500GB free (87.5% full)
      },
      {
        path: '/mnt/disk2',
        totalBytes: 4_000_000_000_000,
        freeBytes: 3_500_000_000_000,   // 3.5TB free (12.5% full)
      },
    ],
    files: [
      {
        absolutePath: '/mnt/disk1/movies/movie1.mkv',
        relativePath: 'movies/movie1.mkv',
        sizeBytes: 50_000_000_000, // 50GB
        diskPath: '/mnt/disk1',
      },
      {
        absolutePath: '/mnt/disk1/movies/movie2.mkv',
        relativePath: 'movies/movie2.mkv',
        sizeBytes: 60_000_000_000, // 60GB
        diskPath: '/mnt/disk1',
      },
      {
        absolutePath: '/mnt/disk1/tv/show1.mkv',
        relativePath: 'tv/show1.mkv',
        sizeBytes: 20_000_000_000, // 20GB
        diskPath: '/mnt/disk1',
      },
    ],
  }

  const options: ConsolidationOptions = {
    minSpaceBytes: 100_000_000_000, // Free at least 100GB
  }

  return consolidateSimple(worldView, options)
}

/**
 * Example: Consolidation with file size filter
 */
export const consolidationWithSizeFilter = () => {
  const worldView: WorldView = {
    disks: [
      {
        path: '/mnt/disk1',
        totalBytes: 4_000_000_000_000,
        freeBytes: 500_000_000_000,
      },
      {
        path: '/mnt/disk2',
        totalBytes: 4_000_000_000_000,
        freeBytes: 3_000_000_000_000,
      },
    ],
    files: [
      {
        absolutePath: '/mnt/disk1/bigfile.mkv',
        relativePath: 'bigfile.mkv',
        sizeBytes: 100_000_000_000, // 100GB - will be included
        diskPath: '/mnt/disk1',
      },
      {
        absolutePath: '/mnt/disk1/smallfile.txt',
        relativePath: 'smallfile.txt',
        sizeBytes: 1_000_000, // 1MB - will be filtered out
        diskPath: '/mnt/disk1',
      },
    ],
  }

  const options: ConsolidationOptions = {
    minSpaceBytes: 50_000_000_000,
    minFileSizeBytes: 10_000_000_000, // Only move files > 10GB
  }

  return consolidateSimple(worldView, options)
}

/**
 * Example: Consolidation with path prefix filter
 */
export const consolidationWithPathFilter = () => {
  const worldView: WorldView = {
    disks: [
      {
        path: '/mnt/disk1',
        totalBytes: 4_000_000_000_000,
        freeBytes: 500_000_000_000,
      },
      {
        path: '/mnt/disk2',
        totalBytes: 4_000_000_000_000,
        freeBytes: 3_000_000_000_000,
      },
    ],
    files: [
      {
        absolutePath: '/mnt/disk1/movies/action.mkv',
        relativePath: 'movies/action.mkv',
        sizeBytes: 50_000_000_000,
        diskPath: '/mnt/disk1',
      },
      {
        absolutePath: '/mnt/disk1/tv/sitcom.mkv',
        relativePath: 'tv/sitcom.mkv',
        sizeBytes: 30_000_000_000,
        diskPath: '/mnt/disk1',
      },
      {
        absolutePath: '/mnt/disk1/music/album.flac',
        relativePath: 'music/album.flac',
        sizeBytes: 2_000_000_000,
        diskPath: '/mnt/disk1',
      },
    ],
  }

  const options: ConsolidationOptions = {
    minSpaceBytes: 50_000_000_000,
    pathPrefixes: ['/movies', '/tv'], // Only move movies and TV shows
  }

  return consolidateSimple(worldView, options)
}

/**
 * Example: Consolidation from specific source disks
 */
export const consolidationFromSpecificDisks = () => {
  const worldView: WorldView = {
    disks: [
      {
        path: '/mnt/disk1',
        totalBytes: 4_000_000_000_000,
        freeBytes: 500_000_000_000, // 87.5% full
      },
      {
        path: '/mnt/disk2',
        totalBytes: 4_000_000_000_000,
        freeBytes: 600_000_000_000, // 85% full
      },
      {
        path: '/mnt/disk3',
        totalBytes: 4_000_000_000_000,
        freeBytes: 3_500_000_000_000, // 12.5% full
      },
    ],
    files: [
      {
        absolutePath: '/mnt/disk1/file1.mkv',
        relativePath: 'file1.mkv',
        sizeBytes: 50_000_000_000,
        diskPath: '/mnt/disk1',
      },
      {
        absolutePath: '/mnt/disk2/file2.mkv',
        relativePath: 'file2.mkv',
        sizeBytes: 50_000_000_000,
        diskPath: '/mnt/disk2',
      },
    ],
  }

  const options: ConsolidationOptions = {
    minSpaceBytes: 50_000_000_000,
    srcDiskPaths: ['/mnt/disk1'], // Only consolidate from disk1, ignore disk2
  }

  return consolidateSimple(worldView, options)
}

/**
 * Example: Running consolidation and handling results
 */
export const runConsolidation = async () => {
  const program = basicConsolidation()

  const result: ConsolidationResult = await Effect.runPromise(program)

  console.log(`Consolidated ${result.bytesConsolidated} bytes`)
  console.log(`Total moves: ${result.moves.length}`)

  result.moves.forEach(move => {
    console.log(
      `Move ${move.file.relativePath} (${move.file.sizeBytes} bytes) ` +
      `to ${move.targetDiskPath}`
    )
  })

  return result
}
