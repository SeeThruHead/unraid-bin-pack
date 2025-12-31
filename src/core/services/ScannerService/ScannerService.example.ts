import { Effect } from 'effect'
import { ScannerServiceTag } from './ScannerService'

/**
 * Example: Scan a single disk
 */
export const scanSingleDisk = Effect.gen(function* () {
  const scanner = yield* ScannerServiceTag

  // Scan a single disk and get all files
  const files = yield* scanner.scanDisk('/mnt/disk1')

  console.log(`Found ${files.length} files on /mnt/disk1`)

  return files
})

/**
 * Example: Scan multiple disks
 */
export const scanMultipleDisks = Effect.gen(function* () {
  const scanner = yield* ScannerServiceTag

  const diskPaths = ['/mnt/disk1', '/mnt/disk2', '/mnt/disk3']

  // Scan all disks and combine results
  const files = yield* scanner.scanAllDisks(diskPaths)

  console.log(`Found ${files.length} total files across ${diskPaths.length} disks`)

  return files
})

/**
 * Example: Scan with exclude patterns
 */
export const scanWithExcludes = Effect.gen(function* () {
  const scanner = yield* ScannerServiceTag

  // Exclude .tmp files and node_modules
  const files = yield* scanner.scanDisk('/mnt/disk1', {
    excludePatterns: ['**/*.tmp', '**/node_modules/**'],
  })

  return files
})

/**
 * Example: Scan with concurrency control
 */
export const scanWithConcurrency = Effect.gen(function* () {
  const scanner = yield* ScannerServiceTag

  const diskPaths = [
    '/mnt/disk1',
    '/mnt/disk2',
    '/mnt/disk3',
    '/mnt/disk4',
  ]

  // Scan disks with max 2 concurrent scans
  const files = yield* scanner.scanAllDisks(diskPaths, {
    concurrency: 2,
  })

  return files
})

/**
 * Example: Handle scan errors
 */
export const handleScanErrors = Effect.gen(function* () {
  const scanner = yield* ScannerServiceTag

  const result = yield* scanner.scanDisk('/mnt/disk1').pipe(
    Effect.catchTags({
      ScanPathNotFound: (error) =>
        Effect.succeed({
          message: `Path not found: ${error.path}`,
          files: [],
        }),
      ScanPermissionDenied: (error) =>
        Effect.succeed({
          message: `Permission denied: ${error.path}`,
          files: [],
        }),
      ScanFailed: (error) =>
        Effect.succeed({
          message: `Scan failed: ${error.reason}`,
          files: [],
        }),
    })
  )

  return result
})
