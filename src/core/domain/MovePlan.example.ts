import type { FileMove, MovePlan } from './MovePlan'
import { createFileMove, skipMove, createMovePlan, computeSummary } from './MovePlan'
import type { FileEntry } from './FileEntry'

/**
 * Example: Creating a simple file move
 */
export const simpleFileMove = (): FileMove => {
  const file: FileEntry = {
    absolutePath: '/mnt/disk1/movies/movie1.mkv',
    relativePath: 'movies/movie1.mkv',
    sizeBytes: 10_000_000_000, // 10GB
    diskPath: '/mnt/disk1',
  }

  return createFileMove(file, '/mnt/disk2')
}

/**
 * Example: Creating a complete move plan
 */
export const basicMovePlan = (): MovePlan => {
  const files: FileEntry[] = [
    {
      absolutePath: '/mnt/disk1/movies/movie1.mkv',
      relativePath: 'movies/movie1.mkv',
      sizeBytes: 10_000_000_000,
      diskPath: '/mnt/disk1',
    },
    {
      absolutePath: '/mnt/disk1/movies/movie2.mkv',
      relativePath: 'movies/movie2.mkv',
      sizeBytes: 15_000_000_000,
      diskPath: '/mnt/disk1',
    },
    {
      absolutePath: '/mnt/disk2/tv/show1.mkv',
      relativePath: 'tv/show1.mkv',
      sizeBytes: 5_000_000_000,
      diskPath: '/mnt/disk2',
    },
  ]

  const moves = [
    createFileMove(files[0]!, '/mnt/disk3'), // Move movie1 to disk3
    createFileMove(files[1]!, '/mnt/disk3'), // Move movie2 to disk3
    createFileMove(files[2]!, '/mnt/disk1'), // Move show1 to disk1
  ]

  return createMovePlan(moves)
}

/**
 * Example: Skipping moves with reasons
 */
export const movePlanWithSkips = (): MovePlan => {
  const file: FileEntry = {
    absolutePath: '/mnt/disk1/protected/important.mkv',
    relativePath: 'protected/important.mkv',
    sizeBytes: 50_000_000_000,
    diskPath: '/mnt/disk1',
  }

  const move = createFileMove(file, '/mnt/disk2')
  const skippedMove = skipMove(move, 'Not enough space on target disk')

  return createMovePlan([skippedMove])
}

/**
 * Example: Analyzing a move plan summary
 */
export const analyzeSummary = () => {
  const plan = basicMovePlan()
  const { summary } = plan

  console.log(`Total files to move: ${summary.totalFiles}`)
  console.log(`Total bytes to move: ${summary.totalBytes}`)

  summary.movesPerDisk.forEach((count, disk) => {
    const bytes = summary.bytesPerDisk.get(disk) ?? 0
    console.log(`${disk}: ${count} files, ${bytes} bytes`)
  })
}
