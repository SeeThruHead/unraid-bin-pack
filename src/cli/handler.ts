/**
 * CLI handlers - orchestrate services for plan and apply commands.
 */

import { Effect, pipe, Layer } from "effect"
import { Console } from "effect"
import { BunContext } from "@effect/platform-bun"
import { FileSystem } from "@effect/platform"

import type { PlanOptions, ApplyOptions } from "./options"
import { parseSize, formatSize } from "../lib/parseSize"
import { DiskServiceTag, DiskServiceFullLive } from "../services/DiskService"
import { ScannerServiceTag, ScannerServiceLive } from "../services/ScannerService"
import { BinPackServiceTag, BinPackServiceLive } from "../services/BinPackService"
import { TransferServiceTag, RsyncTransferService } from "../services/TransferService"
import { PlanStorageServiceTag, JsonPlanStorageService } from "../infra/PlanStorageService"
import { GlobServiceLive } from "../infra/GlobService"
import { FileStatServiceLive } from "../infra/FileStatService"
import { ShellServiceLive } from "../infra/ShellService"
import { fromDomainError } from "./errors"

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
// Plan command handler
// =============================================================================

export const runPlan = (options: PlanOptions) =>
  Effect.gen(function* () {
    const diskService = yield* DiskServiceTag
    const scannerService = yield* ScannerServiceTag
    const binPackService = yield* BinPackServiceTag
    const planStorage = yield* PlanStorageServiceTag
    const transferService = yield* TransferServiceTag

    const excludePatterns = options.exclude?.split(",").map((s) => s.trim()) ?? []
    const _includePatterns = options.include?.split(",").map((s) => s.trim()) ?? []
    const planPath = options.planFile ?? planStorage.defaultPath

    // Check for existing partial plan (conflict detection)
    const existingPlan = yield* pipe(
      planStorage.load(planPath),
      Effect.map((plan) => plan as typeof plan | null),
      Effect.catchAll(() => Effect.succeed(null))
    )

    if (existingPlan && !options.force) {
      const moves = Object.values(existingPlan.moves)
      const completed = moves.filter((m) => m.status === "completed").length
      const failed = moves.filter((m) => m.status === "failed").length
      const pending = moves.filter((m) => m.status === "pending").length

      if (completed > 0 || failed > 0) {
        yield* Console.error(`\nWARNING: Existing plan found with partial progress:`)
        yield* Console.error(`   Completed: ${completed}`)
        yield* Console.error(`   Failed: ${failed}`)
        yield* Console.error(`   Pending: ${pending}`)
        yield* Console.error(`\n   To continue the existing plan: unraid-bin-pack apply`)
        yield* Console.error(`   To overwrite with a new plan:  unraid-bin-pack plan --force`)
        return
      }
    }

    // Parse size options
    const thresholdBytes = parseSize(options.threshold)
    const minSplitSizeBytes = parseSize(options.minSplitSize)
    const folderThresholdPct = parseFloat(options.folderThreshold)

    yield* Console.log(`\nUnraid Bin-Pack - Planning`)
    yield* Console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    // Step 1: Discover disks (auto-discover at /mnt/disk* if not specified)
    yield* Console.log(`\nDiscovering disks...`)

    const diskPaths = options.dest
      ? options.dest.split(",").map((s) => s.trim())
      : yield* diskService.autoDiscover()

    if (diskPaths.length === 0) {
      yield* Console.error(`\nERROR: No disks found. Specify --dest or ensure disks exist at /mnt/disk*`)
      return
    }

    const allDisks = yield* diskService.discover(diskPaths)

    // Step 2: Determine source disk (auto-select least full if not specified)
    const srcDiskPath = options.src ?? (() => {
      // Find disk with most free space (least full)
      const sorted = [...allDisks].sort((a, b) => b.freeBytes - a.freeBytes)
      return sorted[0]?.path
    })()

    if (!srcDiskPath) {
      yield* Console.error(`\nERROR: Could not determine source disk`)
      return
    }

    yield* Effect.forEach(allDisks, (disk) => {
      const usedPct = ((disk.totalBytes - disk.freeBytes) / disk.totalBytes * 100).toFixed(1)
      const isSrc = disk.path === srcDiskPath ? " (source)" : ""
      return Console.log(`   ${disk.path}: ${formatSize(disk.freeBytes)} free (${usedPct}% used)${isSrc}`)
    }, { discard: true })

    // Validate source disk
    const srcDisk = allDisks.find((d) => d.path === srcDiskPath)
    if (!srcDisk) {
      yield* Console.error(`\nERROR: Source disk not found: ${srcDiskPath}`)
      yield* Console.error(`   Available: ${allDisks.map((d) => d.path).join(", ")}`)
      return
    }

    const destDisks = allDisks.filter((d) => d.path !== srcDiskPath)
    if (destDisks.length === 0) {
      yield* Console.error(`\nERROR: No destination disks available`)
      return
    }

    // Log parsed options
    yield* Console.log(`\n   Source: ${srcDiskPath}`)
    yield* Console.log(`   Destinations: ${destDisks.map(d => d.path).join(", ")}`)
    yield* Console.log(`   Threshold: ${formatSize(thresholdBytes)}`)
    yield* Console.log(`   Min split size: ${formatSize(minSplitSizeBytes)}`)
    yield* Console.log(`   Folder threshold: ${(folderThresholdPct * 100).toFixed(0)}%`)

    // Step 3: Scan source disk
    yield* Console.log(`\nScanning source disk: ${srcDiskPath}...`)
    const srcFiles = yield* scannerService.scanDisk(srcDiskPath, { excludePatterns })
    yield* Console.log(`   Found ${srcFiles.length} files`)

    if (srcFiles.length === 0) {
      yield* Console.log(`\nNo files on source disk. Already optimized!`)
      return
    }

    // Step 4: Compute moves
    yield* Console.log(`\nComputing optimal placement (${options.algorithm})...`)
    const result = yield* binPackService.computeMoves(destDisks, srcFiles, {
      thresholdBytes,
      algorithm: options.algorithm,
      minSplitSizeBytes: minSplitSizeBytes,
      folderThreshold: folderThresholdPct,
    })

    const { plan, placedFolders, explodedFolders } = result
    const pendingMoves = plan.moves.filter((m) => m.status === "pending")
    const skippedMoves = plan.moves.filter((m) => m.status === "skipped")

    yield* Console.log(`\n   Folders placed as-is: ${placedFolders.length}`)
    if (explodedFolders.length > 0) {
      yield* Console.log(`   Folders split: ${explodedFolders.length}`)
    }
    yield* Console.log(`   Moves planned: ${pendingMoves.length}`)
    yield* Console.log(`   Skipped: ${skippedMoves.length}`)
    yield* Console.log(`   Total: ${formatSize(plan.summary.totalBytes)}`)

    if (pendingMoves.length === 0) {
      yield* Console.log(`\nNo moves needed!`)
      return
    }

    // Step 5: Validate with rsync --dry-run
    yield* Console.log(`\nValidating with rsync --dry-run...`)
    const dryRunReport = yield* transferService.executeAll(plan, {
      dryRun: true,
      concurrency: 1,
      preserveAttrs: true,
      deleteSource: true,
    })
    yield* Console.log(`   ${dryRunReport.successful} moves validated`)

    // Step 6: Save plan
    yield* Console.log(`\nSaving plan to: ${planPath}`)
    yield* planStorage.save(plan, srcDiskPath, planPath)

    // Show summary
    yield* Console.log(`\nMove summary by target disk:`)
    yield* Effect.forEach(
      Array.from(plan.summary.movesPerDisk.entries()),
      ([diskPath, count]) => {
        const bytes = plan.summary.bytesPerDisk.get(diskPath) ?? 0
        return Console.log(`   ${diskPath}: ${count} files (${formatSize(bytes)})`)
      },
      { discard: true }
    )

    yield* Console.log(`\nPlan saved! Run 'unraid-bin-pack apply' to execute.`)
  })

// =============================================================================
// Apply command handler
// =============================================================================

export const runApply = (options: ApplyOptions) =>
  Effect.gen(function* () {
    const planStorage = yield* PlanStorageServiceTag
    const transferService = yield* TransferServiceTag

    const planPath = options.planFile ?? planStorage.defaultPath

    yield* Console.log(`\nUnraid Bin-Pack - Apply${options.dryRun ? " (DRY RUN)" : ""}`)
    yield* Console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    // Check if plan exists
    const exists = yield* planStorage.exists(planPath)
    if (!exists) {
      yield* Console.error(`\nERROR: No plan found at: ${planPath}`)
      yield* Console.error(`   Run 'unraid-bin-pack plan' first.`)
      return
    }

    // Load plan
    yield* Console.log(`\nLoading plan from: ${planPath}`)
    const savedPlan = yield* planStorage.load(planPath)

    // Get moves by status from Record structure
    const allMoves = Object.entries(savedPlan.moves)
    const pendingMoves = allMoves.filter(([_, m]) => m.status === "pending")
    const failedMoves = allMoves.filter(([_, m]) => m.status === "failed")
    const completedMoves = allMoves.filter(([_, m]) => m.status === "completed")
    // Include both pending and failed moves for execution (retry support)
    const movesToExecute = [...pendingMoves, ...failedMoves]
    const totalBytes = movesToExecute.reduce((sum, [_, m]) => sum + m.sizeBytes, 0)

    yield* Console.log(`   Created: ${savedPlan.createdAt}`)
    yield* Console.log(`   Source: ${savedPlan.spilloverDisk}`)
    if (completedMoves.length > 0) {
      yield* Console.log(`   Already completed: ${completedMoves.length}`)
    }
    if (failedMoves.length > 0) {
      yield* Console.log(`   Retrying failed: ${failedMoves.length}`)
    }
    yield* Console.log(`   To transfer: ${movesToExecute.length} (${formatSize(totalBytes)})`)

    if (movesToExecute.length === 0) {
      yield* Console.log(`\nNo moves remaining in plan!`)
      return
    }

    // =========================================================================
    // Validate plan before execution
    // =========================================================================

    yield* Console.log(`\nValidating plan...`)
    const fs = yield* FileSystem.FileSystem
    const diskService = yield* DiskServiceTag

    // 1. Check source files still exist
    const missingFiles = yield* pipe(
      Effect.forEach(movesToExecute, ([sourcePath, _]) =>
        pipe(
          fs.exists(sourcePath),
          Effect.map((exists) => (exists ? null : sourcePath))
        )
      ),
      Effect.map((results) => results.filter((p): p is string => p !== null))
    )

    if (missingFiles.length > 0) {
      yield* Console.error(`\nERROR: Validation failed: ${missingFiles.length} source files no longer exist`)
      yield* Effect.forEach(missingFiles.slice(0, 5), (path) =>
        Console.error(`   - ${path}`)
      , { discard: true })
      if (missingFiles.length > 5) {
        yield* Console.error(`   ... and ${missingFiles.length - 5} more`)
      }
      yield* Console.error(`\n   Re-run 'unraid-bin-pack plan' to generate a fresh plan.`)
      return
    }
    yield* Console.log(`   All ${movesToExecute.length} source files exist`)

    // 2. Check target disks have enough space
    const bytesNeededPerDisk = movesToExecute.reduce((acc, [_, move]) => {
      acc.set(move.targetDisk, (acc.get(move.targetDisk) ?? 0) + move.sizeBytes)
      return acc
    }, new Map<string, number>())

    const targetDiskPaths = [...bytesNeededPerDisk.keys()]
    const diskStats = yield* diskService.discover(targetDiskPaths)
    const diskFreeMap = new Map(diskStats.map((d) => [d.path, d.freeBytes]))

    const insufficientSpace = Array.from(bytesNeededPerDisk.entries())
      .map(([diskPath, bytesNeeded]) => ({
        disk: diskPath,
        needed: bytesNeeded,
        available: diskFreeMap.get(diskPath) ?? 0,
      }))
      .filter(({ needed, available }) => needed > available)

    if (insufficientSpace.length > 0) {
      yield* Console.error(`\nERROR: Validation failed: Insufficient space on target disks`)
      yield* Effect.forEach(insufficientSpace, ({ disk, needed, available }) =>
        Console.error(`   ${disk}: needs ${formatSize(needed)}, has ${formatSize(available)}`)
      , { discard: true })
      yield* Console.error(`\n   Re-run 'unraid-bin-pack plan' to generate a fresh plan.`)
      return
    }
    yield* Console.log(`   Target disks have sufficient space`)

    // 3. Check for conflicts at destination
    const conflicts = yield* pipe(
      Effect.forEach(movesToExecute, ([_, move]) =>
        pipe(
          fs.exists(move.destAbsPath),
          Effect.map((exists) => (exists ? move.destAbsPath : null))
        )
      ),
      Effect.map((results) => results.filter((p): p is string => p !== null))
    )

    if (conflicts.length > 0) {
      yield* Console.error(`\nERROR: Validation failed: ${conflicts.length} destination paths already exist`)
      yield* Effect.forEach(conflicts.slice(0, 5), (path) =>
        Console.error(`   - ${path}`)
      , { discard: true })
      if (conflicts.length > 5) {
        yield* Console.error(`   ... and ${conflicts.length - 5} more`)
      }
      yield* Console.error(`\n   Re-run 'unraid-bin-pack plan' to generate a fresh plan.`)
      return
    }
    yield* Console.log(`   No conflicts at destinations`)

    yield* Console.log(`   Plan validated successfully`)

    // Convert Record-based plan back to array for transfer service (only moves to execute)
    const movesArray = movesToExecute.map(([sourceAbsPath, m]) => ({
      file: {
        absolutePath: sourceAbsPath,
        relativePath: m.sourceRelPath,
        sizeBytes: m.sizeBytes,
        diskPath: m.sourceDisk,
      },
      targetDiskPath: m.targetDisk,
      destinationPath: m.destAbsPath,
      status: "pending" as const, // Reset failed to pending for retry
      reason: m.reason,
    }))

    const plan = {
      moves: movesArray,
      summary: {
        totalFiles: movesToExecute.length,
        totalBytes,
        movesPerDisk: new Map<string, number>(),
        bytesPerDisk: new Map<string, number>(),
      },
    }

    // Execute
    if (options.dryRun) {
      yield* Console.log(`\nDry run - showing what would be transferred...`)
    } else {
      yield* Console.log(`\nExecuting ${movesToExecute.length} transfers (concurrency: ${options.concurrency})...`)
    }

    const report = yield* transferService.executeAll(plan, {
      dryRun: options.dryRun,
      concurrency: options.concurrency,
      preserveAttrs: true,
      deleteSource: true,
      onProgress: (_completed, _total, _move) => {
        // Progress is logged by TerminalUI in real implementation
      },
    })

    yield* Console.log(`\n${options.dryRun ? "Dry run" : "Transfer"} complete:`)
    yield* Console.log(`   Successful: ${report.successful}`)
    yield* Console.log(`   Failed: ${report.failed}`)
    yield* Console.log(`   Skipped: ${report.skipped}`)

    // Persist progress to plan file (for resume support)
    if (!options.dryRun) {
      yield* Effect.forEach(
        report.results,
        (result) => {
          if (result.success) {
            return planStorage.updateMoveStatus(planPath, result.move.file.absolutePath, "completed")
          } else if (result.error) {
            return planStorage.updateMoveStatus(planPath, result.move.file.absolutePath, "failed", result.error)
          }
          return Effect.void
        },
        { discard: true }
      )

      if (report.failed === 0) {
        yield* Console.log(`\nAll transfers complete!`)
        yield* planStorage.delete(planPath)
        yield* Console.log(`   Plan file cleaned up.`)
      } else {
        yield* Console.log(`\nWARNING: Some transfers failed. Run 'unraid-bin-pack apply' again to retry.`)
      }
    }
  })

// =============================================================================
// Full live layer
// =============================================================================

export const AppLive = pipe(
  Layer.mergeAll(
    DiskServiceFullLive,
    pipe(
      ScannerServiceLive,
      Layer.provide(GlobServiceLive),
      Layer.provide(FileStatServiceLive),
      Layer.provide(BunContext.layer)
    ),
    BinPackServiceLive,
    pipe(RsyncTransferService, Layer.provide(ShellServiceLive)),
    pipe(JsonPlanStorageService, Layer.provide(BunContext.layer))
  )
)
