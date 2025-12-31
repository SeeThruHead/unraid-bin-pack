import type { WorldView, DiskState } from './WorldView'
import type { FileEntry } from './FileEntry'

/**
 * Example: Creating a basic WorldView
 */
export const basicWorldView = (): WorldView => {
  const disks: DiskState[] = [
    {
      path: '/mnt/disk1',
      totalBytes: 4_000_000_000_000, // 4TB
      freeBytes: 500_000_000_000,     // 500GB free (87.5% full)
    },
    {
      path: '/mnt/disk2',
      totalBytes: 4_000_000_000_000, // 4TB
      freeBytes: 3_500_000_000_000,   // 3.5TB free (12.5% full)
    },
  ]

  const files: FileEntry[] = [
    {
      absolutePath: '/mnt/disk1/movies/movie1.mkv',
      relativePath: 'movies/movie1.mkv',
      sizeBytes: 10_000_000_000, // 10GB
      diskPath: '/mnt/disk1',
    },
    {
      absolutePath: '/mnt/disk1/movies/movie2.mkv',
      relativePath: 'movies/movie2.mkv',
      sizeBytes: 15_000_000_000, // 15GB
      diskPath: '/mnt/disk1',
    },
    {
      absolutePath: '/mnt/disk1/tv/show1.mkv',
      relativePath: 'tv/show1.mkv',
      sizeBytes: 5_000_000_000, // 5GB
      diskPath: '/mnt/disk1',
    },
  ]

  return { disks, files }
}

/**
 * Example: WorldView with multiple disks and various file sizes
 */
export const multiDiskWorldView = (): WorldView => {
  const disks: DiskState[] = [
    {
      path: '/mnt/disk1',
      totalBytes: 4_000_000_000_000,
      freeBytes: 200_000_000_000, // 95% full
    },
    {
      path: '/mnt/disk2',
      totalBytes: 4_000_000_000_000,
      freeBytes: 1_000_000_000_000, // 75% full
    },
    {
      path: '/mnt/disk3',
      totalBytes: 4_000_000_000_000,
      freeBytes: 3_800_000_000_000, // 5% full
    },
  ]

  const files: FileEntry[] = [
    // Large files on disk1 (good candidates for moving)
    {
      absolutePath: '/mnt/disk1/bigfile1.mkv',
      relativePath: 'bigfile1.mkv',
      sizeBytes: 50_000_000_000, // 50GB
      diskPath: '/mnt/disk1',
    },
    {
      absolutePath: '/mnt/disk1/bigfile2.iso',
      relativePath: 'bigfile2.iso',
      sizeBytes: 40_000_000_000, // 40GB
      diskPath: '/mnt/disk1',
    },
    // Smaller files on disk2
    {
      absolutePath: '/mnt/disk2/medium1.mkv',
      relativePath: 'medium1.mkv',
      sizeBytes: 20_000_000_000, // 20GB
      diskPath: '/mnt/disk2',
    },
    // Very small files on disk3
    {
      absolutePath: '/mnt/disk3/small1.txt',
      relativePath: 'small1.txt',
      sizeBytes: 1_000_000, // 1MB
      diskPath: '/mnt/disk3',
    },
  ]

  return { disks, files }
}
