/**
 * CLI handlers - orchestrate services for plan and apply commands.
 */

import { Effect, Either, pipe, Layer, Logger, LogLevel } from "effect"
import { Console } from "effect"
import { BunContext } from "@effect/platform-bun"
import { FileSystem } from "@effect/platform"

import type { PlanOptions, ApplyOptions } from "./options"
import { parseSize, formatSize } from "../lib/parseSize"
import { createMovePlan, type FileMove } from "../domain/MovePlan"
import type { WorldView } from "../domain/WorldView"
import type { Disk } from "../domain/Disk"
import { consolidateSimple } from "../services/SimpleConsolidator"
import { DiskServiceTag, DiskServiceFullLive } from "../services/DiskService"
import { ScannerServiceTag, ScannerServiceLive } from "../services/ScannerService"
import { TransferServiceTag, RsyncTransferService } from "../services/TransferService"
import { LoggerServiceTag, LoggerServiceLive } from "../services/LoggerService"
import { PlanStorageServiceTag, type SerializedPlan } from "../infra/PlanStorageService"
import { SqlitePlanStorageService } from "../infra/SqlitePlanStorageService"
import { GlobServiceLive } from "../infra/GlobService"
import { FileStatServiceLive } from "../infra/FileStatService"
import { ShellServiceLive } from "../infra/ShellService"
import { fromDomainError } from "./errors"
import { interactivePlanPrompts } from "./interactive"
import { PlanScriptGenerator } from "../services/PlanScriptGenerator"

// =============================================================================
// Helper: Move chain optimization
// =============================================================================

/**
 * Optimize move chains by consolidating A→B→C into A→C.
 * Detects when a file is moved multiple times and consolidates to direct move.
 * Filters out same-disk moves that would be created by incorrect consolidation.
 */
const optimizeMoveChains = (
  moves: ReadonlyArray<FileMove>
) => {
  // Build a map of destination → source for each move
  // This helps us detect when a destination in one move is a source in another
  const destToSource = new Map<string, string>()
  const sourceToDest = new Map<string, string>()

  for (const move of moves) {
    if (move.status === "pending") {
      destToSource.set(move.destinationPath, move.file.absolutePath)
      sourceToDest.set(move.file.absolutePath, move.destinationPath)
    }
  }

  // Find chains: if destination of move A is source of move B, consolidate
  const optimizedMoves = moves.map((move) => {
    if (move.status !== "pending") return move

    // Check if this move's source was a destination in a previous move
    const originalSource = destToSource.get(move.file.absolutePath)

    if (originalSource) {
      // This is part of a chain! Consolidate: original → final destination
      // Update the source to be the original, keep the final destination
      // Also update diskPath to reflect the original source disk
      const originalDiskPath = originalSource.match(/^(\/mnt\/disk\d+)/)?.[1] ?? move.file.diskPath

      return {
        ...move,
        file: {
          ...move.file,
          absolutePath: originalSource,
          diskPath: originalDiskPath,
        },
      }
    }

    return move
  })

  // Filter out intermediate moves and same-disk moves
  const finalMoves = optimizedMoves.filter((move) => {
    if (move.status !== "pending") return true

    // Skip if destination is a source in another move (intermediate step)
    if (sourceToDest.has(move.destinationPath)) return false

    // Skip if source disk equals target disk (invalid consolidation)
    const sourceDisk = move.file.diskPath
    const targetDisk = move.targetDiskPath
    if (sourceDisk === targetDisk) return false

    return true
  })

  return finalMoves
}

// =============================================================================
// Helper: Iterative disk emptying
// =============================================================================

/**
 * Build a WorldView from disk stats and scan all disks for files.
 * Then use backtracking evacuation to plan moves with consistent state.
 */
const buildWorldViewAndPlan = (
  allDisks: Disk[],
  options: {
    excludePatterns: string[]
    minSpaceBytes: number
    minFileSizeBytes: number
    pathPrefixes: string[]
    minSplitSizeBytes: number
    moveAsFolderThresholdPct: number
    srcDiskPaths?: string[]
    debug?: boolean
  }
) =>
  Effect.gen(function* () {
    const scannerService = yield* ScannerServiceTag

    // Scan all disks to get all files
    const allFiles = yield* Effect.flatMap(
      Effect.forEach(allDisks, (disk) =>
        scannerService.scanDisk(disk.path, {
          excludePatterns: options.excludePatterns,
        })
      ),
      (fileArrays) => Effect.succeed(fileArrays.flat())
    )

    // Debug: log file scan results
    yield* Effect.forEach(allDisks, (disk) => {
      const filesOnDisk = allFiles.filter(f => f.diskPath === disk.path)
      const totalSize = filesOnDisk.reduce((sum, f) => sum + f.sizeBytes, 0)
      return Effect.logDebug(`File scan: ${disk.path} - ${filesOnDisk.length} files, ${(totalSize / 1024 / 1024).toFixed(1)} MB`)
    }, { discard: true })

    // Build initial WorldView
    // Include ALL disks - consolidator will handle min-space reservation
    const initialWorldView: WorldView = {
      disks: allDisks.map((disk) => ({
        path: disk.path,
        totalBytes: disk.totalBytes,
        freeBytes: disk.freeBytes,
      })),
      files: allFiles,
    }

    // Debug: log WorldView state
    yield* Effect.forEach(initialWorldView.disks, (disk) =>
      Effect.logDebug(`WorldView: ${disk.path} - ${(disk.freeBytes / 1024 / 1024).toFixed(1)} MB free (will reserve ${(options.minSpaceBytes / 1024 / 1024).toFixed(1)} MB for min-space)`)
    , { discard: true })

    // Simple consolidation: work through disks from least full to most full
    // Find best combinations of files that fill destination disks efficiently
    const result = yield* consolidateSimple(
      initialWorldView,
      {
        minSpaceBytes: options.minSpaceBytes,
        minFileSizeBytes: options.minFileSizeBytes,
        pathPrefixes: options.pathPrefixes,
        srcDiskPaths: options.srcDiskPaths,
      }
    )

    yield* Effect.logDebug(`Consolidation complete: ${result.moves.length} moves, ${(result.bytesConsolidated / 1024 / 1024).toFixed(1)} MB consolidated`)

    // Optimize move chains to eliminate redundant intermediate moves
    const optimizedMoves = optimizeMoveChains([...result.moves])

    // Calculate final disk stats by applying moves to initial stats
    const initialDiskStats = allDisks.map(d => ({
      path: d.path,
      totalBytes: d.totalBytes,
      freeBytes: d.freeBytes,
    }))

    const diskFreeChanges = new Map<string, number>()
    for (const move of optimizedMoves) {
      const sourceDisk = move.file.diskPath
      const targetDisk = move.targetDiskPath
      // Source gains free space, target loses free space
      diskFreeChanges.set(sourceDisk, (diskFreeChanges.get(sourceDisk) ?? 0) + move.file.sizeBytes)
      diskFreeChanges.set(targetDisk, (diskFreeChanges.get(targetDisk) ?? 0) - move.file.sizeBytes)
    }

    const finalDiskStats = initialDiskStats.map(d => ({
      ...d,
      freeBytes: d.freeBytes + (diskFreeChanges.get(d.path) ?? 0),
    }))

    // Count how many disks were completely evacuated
    const disksEvacuated = initialDiskStats.filter((initial) => {
      const final = finalDiskStats.find((f) => f.path === initial.path)
      if (!final) return false
      const initialUsed = initial.totalBytes - initial.freeBytes
      const finalUsed = final.totalBytes - final.freeBytes
      return initialUsed > 0 && finalUsed === 0
    }).length

    return {
      initialDiskStats,
      finalDiskStats,
      moves: optimizedMoves,
      disksEvacuated,
    }
  })

// =============================================================================
// Error handling - convert all errors to human-readable messages
// =============================================================================

/**
 * Wrap an effect with user-friendly error handling.
 * Converts all domain errors to AppErrors with actionable messages.
 */
export const withErrorHandling = <A, R>(
  effect: Effect.Effect<A, unknown, R>
): Effect.Effect<void, never, R> =>
  pipe(
    effect,
    Effect.catchAll((error) => {
      const appError = fromDomainError(error)
      return Console.error(`\n${appError.format()}`)
    }),
    Effect.asVoid
  )

// =============================================================================
// Shared display functions
// =============================================================================

/**
 * Display detailed plan summary with disk stats and move list.
 * Used by both plan and show commands for consistent output.
 * Shows ALL disks with before/after states.
 */
const displayPlanDetails = (
  savedPlan: SerializedPlan
) =>
  Effect.gen(function* () {
    const logger = yield* LoggerServiceTag
    const diskService = yield* DiskServiceTag

    // Get moves by status
    const allMoves = Object.entries(savedPlan.moves)

    // Extract source/target disks from moves
    const getSourceDisk = (sourcePath: string) => {
      const match = sourcePath.match(/^(\/mnt\/disk\d+)/)
      return match?.[1] ?? sourcePath.split("/").slice(0, 3).join("/")
    }

    // Collect all unique disks (both source and destination)
    const allDiskPaths = new Set<string>()
    for (const [sourcePath, move] of allMoves as Array<[string, typeof savedPlan.moves[string]]>) {
      allDiskPaths.add(getSourceDisk(sourcePath))
      allDiskPaths.add(move.targetDisk)
    }

    // Get current disk stats for ALL disks
    const diskStats = yield* diskService.discover([...allDiskPaths])
    const diskStatsMap = new Map(diskStats.map((d) => [d.path, d]))

    // Calculate bytes moving OUT of each disk (pending only)
    const bytesMovingOut = new Map<string, number>()
    // Calculate bytes moving IN to each disk (pending only)
    const bytesMovingIn = new Map<string, number>()

    for (const [sourcePath, move] of allMoves as Array<[string, typeof savedPlan.moves[string]]>) {
      if (move.status === "pending") {
        const sourceDisk = getSourceDisk(sourcePath)
        const targetDisk = move.targetDisk

        bytesMovingOut.set(sourceDisk, (bytesMovingOut.get(sourceDisk) ?? 0) + move.sizeBytes)
        bytesMovingIn.set(targetDisk, (bytesMovingIn.get(targetDisk) ?? 0) + move.sizeBytes)
      }
    }

    yield* logger.show.diskStatsHeader

    // Show ALL disks with before/after states, sorted by path
    const sortedDiskPaths = [...allDiskPaths].sort()
    yield* Effect.forEach(
      sortedDiskPaths,
      (diskPath) =>
        Effect.gen(function* () {
          const stats = diskStatsMap.get(diskPath)
          const movingOut = bytesMovingOut.get(diskPath) ?? 0
          const movingIn = bytesMovingIn.get(diskPath) ?? 0
          const netChange = movingIn - movingOut

          if (stats) {
            const freeAfter = stats.freeBytes - netChange
            const usedPercent = ((stats.totalBytes - stats.freeBytes) / stats.totalBytes) * 100
            const usedPercentAfter = ((stats.totalBytes - freeAfter) / stats.totalBytes) * 100

            yield* logger.show.diskStats({
              diskPath,
              currentFree: stats.freeBytes,
              totalBytes: stats.totalBytes,
              usedPercent,
              netChange,
              freeAfter,
              usedPercentAfter,
            })
          }
        }),
      { discard: true }
    )

    yield* logger.show.movePlanHeader

    // Group moves by SOURCE disk for display
    const movesBySourceDisk = (allMoves as Array<[string, typeof savedPlan.moves[string]]>).reduce((acc, [sourcePath, move]) => {
      const sourceDisk = getSourceDisk(sourcePath)
      if (!acc.has(sourceDisk)) {
        acc.set(sourceDisk, [])
      }
      acc.get(sourceDisk)!.push({ sourcePath, move })
      return acc
    }, new Map<string, Array<{ sourcePath: string; move: typeof savedPlan.moves[string] }>>())

    // Display moves grouped by SOURCE disk
    yield* Effect.forEach(
      Array.from(movesBySourceDisk.entries()),
      ([sourceDisk, moves]) =>
        Effect.gen(function* () {
          const totalBytes = moves.reduce((sum, { move }) => sum + move.sizeBytes, 0)
          yield* logger.show.targetDiskHeader(sourceDisk, moves.length, totalBytes)

          yield* Effect.forEach(
            moves,
            ({ sourcePath, move }) => {
              return logger.show.moveEntry({
                status: move.status as "pending" | "completed" | "failed",
                size: move.sizeBytes,
                sourcePath,
                destPath: move.destAbsPath,
              })
            },
            { discard: true }
          )
        }),
      { discard: true }
    )

    yield* logger.show.separator
  })

// =============================================================================
// Plan command handler
// =============================================================================

export const runPlan = (options: PlanOptions, isInteractive: boolean = false) =>
  Effect.gen(function* () {
    const diskService = yield* DiskServiceTag
    const scannerService = yield* ScannerServiceTag
    const planStorage = yield* PlanStorageServiceTag
    const transferService = yield* TransferServiceTag
    const logger = yield* LoggerServiceTag

    // Interactive mode: discover disks first, then prompt for options
    let finalOptions = options
    if (isInteractive) {
      const discoveredDisks = yield* diskService.autoDiscover().pipe(
        Effect.flatMap(paths => diskService.discover(paths))
      )

      if (discoveredDisks.length === 0) {
        yield* Console.error("\n❌ No disks found at /mnt/disk*\n")
        return
      }

      finalOptions = yield* interactivePlanPrompts(discoveredDisks)
    }

    // Set log level based on debug flag
    if (finalOptions.debug) {
      yield* Effect.logInfo("Debug logging enabled")
    }

    const excludePatterns = finalOptions.exclude?.split(",").map((s) => s.trim()) ?? []
    const _includePatterns = finalOptions.include?.split(",").map((s) => s.trim()) ?? []
    const planPath = finalOptions.planFile ?? planStorage.defaultPath

    // Check for existing partial plan (conflict detection)
    const planExists = yield* planStorage.exists(planPath)

    if (planExists && !finalOptions.force) {
      // Try to load the plan
      const loadResult = yield* pipe(
        planStorage.load(planPath),
        Effect.either
      )

      if (Either.isLeft(loadResult)) {
        // Plan exists but can't be loaded (incompatible schema, corrupt, etc.)
        yield* Console.error(`\nERROR: An existing plan file at "${planPath}" cannot be loaded.`)
        yield* Console.error(`   This may be an old or incompatible plan format.`)
        yield* Console.error(`\n   Use --force to overwrite it with a new plan.`)
        return
      }

      // Plan loaded successfully - check if it has progress
      const existingPlan = loadResult.right
      const moves = Object.values(existingPlan.moves)
      const completed = moves.filter((m) => m.status === "completed").length
      const failed = moves.filter((m) => m.status === "failed").length
      const pending = moves.filter((m) => m.status === "pending").length

      if (completed > 0 || failed > 0) {
        yield* logger.plan.existingPlanWarning({ completed, failed, pending })
        return
      }
    }

    // Parse size options (provide defaults if not specified)
    const minSpaceBytes = parseSize(finalOptions.minSpace ?? "50MB")
    const minFileSizeBytes = parseSize(finalOptions.minFileSize ?? "1MB")
    const minSplitSizeBytes = parseSize(finalOptions.minSplitSize ?? "1GB")
    const moveAsFolderThresholdPct = parseFloat(finalOptions.moveAsFolderThreshold ?? "0.9")

    // Parse path filter (comma-separated list of path prefixes)
    const pathPrefixes = finalOptions.pathFilter
      ? finalOptions.pathFilter.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
      : []

    yield* logger.plan.header

    // Step 1: Discover disks (auto-discover at /mnt/disk* if not specified)
    yield* logger.plan.discoveringDisks

    const diskPaths = finalOptions.dest
      ? finalOptions.dest.split(",").map((s) => s.trim())
      : yield* diskService.autoDiscover()

    if (diskPaths.length === 0) {
      yield* logger.plan.noDisksFound
      return
    }

    const allDisks = yield* diskService.discover(diskPaths)

    yield* Effect.forEach(allDisks, (disk) => logger.plan.diskInfo(disk, false), {
      discard: true,
    })

    // Parse --src as comma-separated list if provided
    const srcDiskPaths = finalOptions.src
      ? finalOptions.src.split(",").map((s) => s.trim())
      : undefined

    // Run backtracking evacuation with WorldView (single code path)
    const iterativeResult = yield* buildWorldViewAndPlan(allDisks, {
      excludePatterns,
      minSpaceBytes,
      minFileSizeBytes,
      pathPrefixes,
      minSplitSizeBytes,
      moveAsFolderThresholdPct,
      srcDiskPaths,
      debug: finalOptions.debug,
    })

    const { moves } = iterativeResult
    const pendingMoves = moves.filter((m) => m.status === "pending")
    const skippedMoves = moves.filter((m) => m.status === "skipped")

    if (moves.length === 0) {
      yield* logger.plan.noMovesNeeded
      return
    }

    // Create plan from accumulated moves
    const plan = createMovePlan(moves)

    yield* logger.plan.planStats({
      foldersPlaced: 0, // TODO: Track folder stats in WorldView
      foldersExploded: undefined,
      movesPlanned: pendingMoves.length,
      skipped: skippedMoves.length,
      totalBytes: plan.summary.totalBytes,
    })

    if (pendingMoves.length === 0) {
      yield* logger.plan.noMovesNeeded
      return
    }

    // Validate with rsync --dry-run
    yield* logger.plan.validating
    const dryRunReport = yield* transferService.executeAll(plan, {
      dryRun: true,
      concurrency: 1,
      preserveAttrs: true,
      deleteSource: true,
    })
    yield* logger.plan.validationComplete(dryRunReport.successful)

    // Save plan
    yield* logger.plan.savingPlan(planPath)

    // Compute disk stats - include all destination disks
    const allDestDiskPaths = new Set(moves.map((m) => m.targetDiskPath))
    const diskStats = Object.fromEntries(
      allDisks
        .filter((disk) => allDestDiskPaths.has(disk.path))
        .map((disk) => [
          disk.path,
          {
            totalBytes: disk.totalBytes,
            freeBytes: disk.freeBytes,
            bytesToMove: plan.summary.bytesPerDisk.get(disk.path) ?? 0,
          },
        ])
    )

    // If --force and plan exists, delete it first
    if (finalOptions.force && planExists) {
      yield* pipe(
        planStorage.delete(planPath),
        Effect.catchAll(() => Effect.void)
      )
    }

    // Generate bash script
    const fs = yield* FileSystem.FileSystem

    const primarySourceDisk = srcDiskPaths?.[0] ?? moves[0]?.file.diskPath ?? "auto"
    const scriptContent = yield* PlanScriptGenerator.generate({
      moves: plan.moves,
      sourceDisk: primarySourceDisk,
      diskStats,
      concurrency: 4, // Default concurrency
    })

    // Write script to file (convert .db to .sh for backward compatibility)
    const scriptPath = planPath.endsWith('.db') ? planPath.replace('.db', '.sh') : planPath
    yield* fs.writeFileString(scriptPath, scriptContent)

    // Make script executable (ignore errors in test/mock environment)
    try {
      await Bun.$`chmod +x ${scriptPath}`.quiet()
    } catch {
      // Ignore chmod errors - script still works with `bash script.sh`
    }

    yield* logger.plan.planSaved
    yield* Console.log(`\n✓ Plan script saved to ${scriptPath}`)
    yield* Console.log(`\nTo execute the plan:`)
    yield* Console.log(`  ${scriptPath}`)
    yield* Console.log(`  or: ./unraid-bin-pack apply\n`)
  })

// =============================================================================
// Apply command handler
// =============================================================================

export const runApply = (options: ApplyOptions) =>
  Effect.gen(function* () {
    const logger = yield* LoggerServiceTag
    const fs = yield* FileSystem.FileSystem

    // Determine script path
    const defaultPath = "/config/plan.sh"
    let scriptPath = options.planFile ?? defaultPath

    // Convert .db paths to .sh for backward compatibility
    if (scriptPath.endsWith('.db')) {
      scriptPath = scriptPath.replace('.db', '.sh')
    }

    yield* logger.apply.header(options.dryRun)

    // Check if plan script exists
    const scriptExists = yield* pipe(
      fs.access(scriptPath),
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false))
    )

    if (!scriptExists) {
      yield* Console.log(`\n❌ No plan script found at ${scriptPath}`)
      yield* Console.log(`   Run 'plan' command first.\n`)
      return
    }

    // Execute the plan script
    yield* Console.log(`\n📂 Executing plan script: ${scriptPath}\n`)

    if (options.dryRun) {
      yield* Console.log(`🧪 DRY RUN MODE - showing what would be executed:\n`)
      const scriptContent = yield* fs.readFileString(scriptPath)
      yield* Console.log(scriptContent)
      yield* Console.log(`\n✓ Dry run complete\n`)
      return
    }

    // Execute the script
    const result = yield* Effect.promise(() => Bun.$`bash ${scriptPath}`.quiet())

    yield* Console.log(`\n✅ Plan execution complete!\n`)
  })

// =============================================================================
// Show command handler
// =============================================================================

export const runShow = (options: { planFile: string | undefined }) =>
  Effect.gen(function* () {
    const logger = yield* LoggerServiceTag
    const planStorage = yield* PlanStorageServiceTag
    const diskService = yield* DiskServiceTag

    const planPath = options.planFile ?? planStorage.defaultPath

    yield* logger.show.header

    // Check if plan exists
    const exists = yield* planStorage.exists(planPath)
    if (!exists) {
      yield* logger.show.noPlanFound(planPath)
      return
    }

    // Load plan
    yield* logger.show.loadingPlan(planPath)
    const savedPlan = yield* planStorage.load(planPath)

    // Get moves by status
    const allMoves = Object.entries(savedPlan.moves)
    const pendingMoves = allMoves.filter(([_, m]) => m.status === "pending")
    const completedMoves = allMoves.filter(([_, m]) => m.status === "completed")
    const failedMoves = allMoves.filter(([_, m]) => m.status === "failed")

    yield* logger.show.planInfo({
      createdAt: savedPlan.createdAt,
      source: savedPlan.sourceDisk,
      totalMoves: allMoves.length,
      pending: pendingMoves.length,
      completed: completedMoves.length,
      failed: failedMoves.length,
    })

    // Display detailed plan summary (reuses same display logic as plan command)
    yield* displayPlanDetails(savedPlan)
  })

// =============================================================================
// Full live layer
// =============================================================================

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
      SqlitePlanStorageService
    )
  )
}

// Default layer for backwards compatibility
export const AppLive = createAppLayer()
