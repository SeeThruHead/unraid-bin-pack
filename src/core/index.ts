/**
 * Unraid Bin Pack - Core Library
 *
 * Public API for consolidating files across Unraid disks using bin-packing algorithms.
 * This library can be used by CLI, web interfaces, or custom implementations.
 */

import { Effect, Layer, pipe } from "effect"
import { FileSystem } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"

// Re-export configuration types
export interface PlanConfig {
  readonly src?: string
  readonly dest?: string
  readonly minSpace?: string
  readonly minFileSize?: string
  readonly pathFilter?: string
  readonly include?: string
  readonly exclude?: string
  readonly minSplitSize?: string
  readonly moveAsFolderThreshold?: string
  readonly debug?: boolean
}

export interface ApplyConfig {
  readonly planPath: string
  readonly concurrency: number
  readonly dryRun: boolean
}

// Re-export essential domain types
export type { FileEntry } from "./domain/FileEntry"
export type { FileMove, MovePlan } from "./domain/MovePlan"
export type { WorldView, DiskState } from "./domain/WorldView"
export type { Disk } from "./domain/Disk"
export type { WorldViewSnapshot } from "./services/BinPack/PackTightly"

// Re-export error types
export type {
  DiskNotFound,
  DiskNotADirectory,
  DiskNotAMountPoint,
  DiskPermissionDenied,
  DiskStatsFailed,
} from "./services/DiskService/DiskService"

export type {
  ScanPathNotFound,
  ScanPermissionDenied,
  ScanFailed,
  FileStatFailed,
} from "./services/ScannerService/ScannerService"

export type {
  TransferSourceNotFound,
  TransferSourcePermissionDenied,
  TransferDestinationPermissionDenied,
  TransferDiskFull,
  TransferBackendUnavailable,
  TransferFailed,
} from "./services/TransferService/TransferService"

// Import services
import { DiskServiceTag, DiskServiceFullLive } from "./services/DiskService"
import { ScannerServiceTag, ScannerServiceLive } from "./services/ScannerService"
import { TransferServiceTag, RsyncTransferService } from "./services/TransferService"
import { LoggerServiceTag, LoggerServiceLive } from "./services/LoggerService"
import { PlanGeneratorServiceTag } from "./services/PlanGenerator"
import { BashRsyncPlanGenerator } from "./services/PlanScriptGenerator"
import { GlobServiceLive } from "./services/GlobService"
import { FileStatServiceLive } from "./services/FileStatService"
import { ShellServiceLive } from "./services/ShellService"

// Import domain functions
import type { WorldView } from "./domain/WorldView"
import type { DiskSnapshot } from "./domain/DiskProjection"
import { projectDiskStates } from "./domain/DiskProjection"
import { optimizeMoveChains } from "./domain/MoveOptimization"
import { createMovePlan } from "./domain/MovePlan"
import { packTightly } from "./services/BinPack"
import { parseSize } from "./lib/parseSize"

// Result types
export interface PlanResult {
  readonly script: string
  readonly moves: ReadonlyArray<{
    readonly source: string
    readonly destination: string
    readonly sizeBytes: number
  }>
  readonly stats: {
    readonly bytesConsolidated: number
    readonly movesPlanned: number
    readonly skipped: number
    readonly disksEvacuated: number
  }
  readonly diskProjections: ReadonlyArray<{
    readonly path: string
    readonly totalBytes: number
    readonly currentFree: number
    readonly freeAfter: number
    readonly usedPercent: number
    readonly usedPercentAfter: number
  }>
  readonly worldViewSnapshots?: ReadonlyArray<import("./services/BinPack/PackTightly").WorldViewSnapshot>
}

export interface ExecutionResult {
  readonly success: boolean
  readonly output: string
}

/**
 * Parse configuration from string values to typed values
 */
const parseConfig = (config: PlanConfig) => {
  return {
    minSpaceBytes: config.minSpace ? parseSize(config.minSpace) : 0,
    minFileSizeBytes: config.minFileSize ? parseSize(config.minFileSize) : 0,
    minSplitSizeBytes: config.minSplitSize ? parseSize(config.minSplitSize) : parseSize("1GB"),
    moveAsFolderThresholdPct: config.moveAsFolderThreshold
      ? parseFloat(config.moveAsFolderThreshold)
      : 0.9,
    excludePatterns: config.exclude?.split(",").map(s => s.trim()) ?? [],
    pathPrefixes: config.pathFilter?.split(",").map(s => s.trim()) ?? [],
    srcDiskPaths: config.src?.split(",").map(s => s.trim()),
    debug: config.debug ?? false,
  }
}

/**
 * Create a consolidation plan
 *
 * @param diskPaths - Array of disk paths to consolidate (e.g., ['/mnt/disk1', '/mnt/disk2'])
 * @param config - Planning configuration options
 * @returns Effect that produces a PlanResult
 */
export const createPlan = (
  diskPaths: string[] | readonly string[],
  config: PlanConfig
) =>
  Effect.gen(function* () {
    const diskService = yield* DiskServiceTag
    const scannerService = yield* ScannerServiceTag
    const planGenerator = yield* PlanGeneratorServiceTag

    // Parse configuration
    const parsed = parseConfig(config)
    yield* Effect.logDebug(`Config: src=${config.src}, dest=${config.dest}`)
    yield* Effect.logDebug(`Parsed srcDiskPaths: ${parsed.srcDiskPaths?.join(", ") ?? "undefined"}`)

    // Validate and get disk information
    const allDisks = yield* diskService.discover([...diskPaths])

    // Scan all files
    const allFiles = yield* Effect.flatMap(
      Effect.forEach(allDisks, (disk) =>
        scannerService.scanDisk(disk.path, {
          excludePatterns: parsed.excludePatterns,
        })
      ),
      (fileArrays) => Effect.succeed(fileArrays.flat())
    )

    // Build WorldView
    const initialWorldView: WorldView = {
      disks: allDisks.map((disk) => ({
        path: disk.path,
        totalBytes: disk.totalBytes,
        freeBytes: disk.freeBytes,
      })),
      files: allFiles,
    }

    // Collect WorldView snapshots for debugging
    const worldViewSnapshots: import("./services/BinPack/PackTightly").WorldViewSnapshot[] = []

    // Run consolidation algorithm (PackTightly - consolidates free space onto fewer disks)
    const result = yield* packTightly(initialWorldView, {
      minSpaceBytes: parsed.minSpaceBytes,
      minFileSizeBytes: parsed.minFileSizeBytes,
      pathPrefixes: parsed.pathPrefixes,
      srcDiskPaths: parsed.srcDiskPaths,
      onWorldViewChange: (snapshot) => {
        worldViewSnapshots.push(snapshot)
      },
    })

    // Optimize move chains
    const optimizedMoves = optimizeMoveChains(result.moves)

    // Calculate statistics
    const pendingMoves = optimizedMoves.filter((m) => m.status === "pending")
    const skippedMoves = optimizedMoves.filter((m) => m.status === "skipped")

    // Project final disk states
    const initialDiskSnapshots: DiskSnapshot[] = allDisks.map((d) => ({
      path: d.path,
      totalBytes: d.totalBytes,
      freeBytes: d.freeBytes,
    }))
    const projection = projectDiskStates(initialDiskSnapshots, optimizedMoves)

    // Generate plan script
    const plan = createMovePlan(optimizedMoves)
    const allDestDiskPaths = new Set(optimizedMoves.map((m) => m.targetDiskPath))
    const diskStats = Object.fromEntries(
      allDisks
        .filter((disk) => allDestDiskPaths.has(disk.path))
        .map((disk) => [
          disk.path,
          {
            path: disk.path,
            totalBytes: disk.totalBytes,
            freeBytes: disk.freeBytes,
          },
        ])
    )

    const primarySourceDisk = parsed.srcDiskPaths?.[0] ?? optimizedMoves[0]?.file.diskPath ?? "auto"
    const script = yield* planGenerator.generate({
      moves: plan.moves,
      sourceDisk: primarySourceDisk,
      diskStats,
      concurrency: 4,
    })

    // Calculate disk projections for display
    const diskProjections = allDisks.map((disk) => {
      const projectedState = projection.final.find(d => d.path === disk.path)
      const freeAfter = projectedState?.freeBytes ?? disk.freeBytes
      const usedBefore = disk.totalBytes - disk.freeBytes
      const usedAfter = disk.totalBytes - freeAfter

      return {
        path: disk.path,
        totalBytes: disk.totalBytes,
        currentFree: disk.freeBytes,
        freeAfter,
        usedPercent: (usedBefore / disk.totalBytes) * 100,
        usedPercentAfter: (usedAfter / disk.totalBytes) * 100,
      }
    })

    return {
      script,
      moves: pendingMoves.map(m => ({
        source: m.file.absolutePath,
        destination: `${m.targetDiskPath}/${m.file.relativePath}`,
        sizeBytes: m.file.sizeBytes,
      })),
      stats: {
        bytesConsolidated: result.bytesConsolidated,
        movesPlanned: pendingMoves.length,
        skipped: skippedMoves.length,
        disksEvacuated: projection.evacuatedCount,
      },
      diskProjections,
      worldViewSnapshots,
    } satisfies PlanResult
  })

/**
 * Execute a plan script
 *
 * @param scriptPath - Path to the plan script
 * @param config - Execution configuration
 * @returns Effect that produces an ExecutionResult
 */
export const executePlanScript = (
  scriptPath: string,
  config: ApplyConfig
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    // Check if script exists
    const scriptExists = yield* pipe(
      fs.access(scriptPath),
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false))
    )

    if (!scriptExists) {
      return yield* Effect.fail(
        new Error(`Plan script not found at ${scriptPath}`)
      )
    }

    if (config.dryRun) {
      // Just read and return the script
      const scriptContent = yield* fs.readFileString(scriptPath)
      return {
        success: true,
        output: scriptContent,
      } satisfies ExecutionResult
    }

    // Execute the script
    const result = yield* Effect.tryPromise({
      try: async () => {
        const proc = Bun.spawn(["bash", scriptPath], {
          stdout: "pipe",
          stderr: "pipe",
        })
        const output = await new Response(proc.stdout).text()
        const error = await new Response(proc.stderr).text()
        await proc.exited
        return { output, error, exitCode: proc.exitCode }
      },
      catch: (error) => new Error(`Failed to execute plan: ${error}`),
    })

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0 ? result.output : result.error,
    } satisfies ExecutionResult
  })

/**
 * Read a plan script
 *
 * @param scriptPath - Path to the plan script
 * @returns Effect that produces the script content as a string
 */
export const readPlanScript = (scriptPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readFileString(scriptPath)
  })

/**
 * Create the application layer with all required services
 *
 * This layer must be provided when running the core library functions.
 */
export const createAppLayer = () => {
  return pipe(
    Layer.mergeAll(
      LoggerServiceLive,
      DiskServiceFullLive,
      pipe(
        ScannerServiceLive,
        Layer.provide(GlobServiceLive),
        Layer.provide(FileStatServiceLive),
        Layer.provide(BunContext.layer)
      ),
      pipe(RsyncTransferService, Layer.provide(ShellServiceLive)),
      BashRsyncPlanGenerator
    )
  )
}

/**
 * The application layer - provide this when running core library functions
 */
export const AppLive = createAppLayer()
