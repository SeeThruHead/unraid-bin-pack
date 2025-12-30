import { Effect, pipe, Layer } from "effect"
import { Console } from "effect"
import { BunContext } from "@effect/platform-bun"
import { FileSystem } from "@effect/platform"

import type { PlanOptions, ApplyOptions } from "./options"
import { parsePlanOptions, parseDestinationPaths } from "./optionParsing"
import { createMovePlan } from "@domain/MovePlan"
import type { WorldView } from "@domain/WorldView"
import type { Disk } from "@domain/Disk"
import { optimizeMoveChains } from "@domain/MoveOptimization"
import { projectDiskStates, type DiskSnapshot } from "@domain/DiskProjection"
import { consolidateSimple } from "@services/BinPack"
import { DiskServiceTag, DiskServiceFullLive } from "@services/DiskService"
import { ScannerServiceTag, ScannerServiceLive } from "@services/ScannerService"
import { TransferServiceTag, RsyncTransferService } from "@services/TransferService"
import { LoggerServiceTag, LoggerServiceLive } from "@services/LoggerService"
import { GlobServiceLive } from "@services/GlobService"
import { FileStatServiceLive } from "@services/FileStatService"
import { ShellServiceLive } from "@services/ShellService"
import { fromDomainError } from "./errors"
import { interactivePlanPrompts } from "./interactive"
import { PlanGeneratorServiceTag } from "@services/PlanGenerator"
import { BashRsyncPlanGenerator } from "@services/PlanScriptGenerator"

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

    const allFiles = yield* Effect.flatMap(
      Effect.forEach(allDisks, (disk) =>
        scannerService.scanDisk(disk.path, {
          excludePatterns: options.excludePatterns,
        })
      ),
      (fileArrays) => Effect.succeed(fileArrays.flat())
    )

    yield* Effect.forEach(allDisks, (disk) => {
      const filesOnDisk = allFiles.filter(f => f.diskPath === disk.path)
      const totalSize = filesOnDisk.reduce((sum, f) => sum + f.sizeBytes, 0)
      return Effect.logDebug(`File scan: ${disk.path} - ${filesOnDisk.length} files, ${(totalSize / 1024 / 1024).toFixed(1)} MB`)
    }, { discard: true })

    const initialWorldView: WorldView = {
      disks: allDisks.map((disk) => ({
        path: disk.path,
        totalBytes: disk.totalBytes,
        freeBytes: disk.freeBytes,
      })),
      files: allFiles,
    }

    yield* Effect.forEach(initialWorldView.disks, (disk) =>
      Effect.logDebug(`WorldView: ${disk.path} - ${(disk.freeBytes / 1024 / 1024).toFixed(1)} MB free (will reserve ${(options.minSpaceBytes / 1024 / 1024).toFixed(1)} MB for min-space)`)
    , { discard: true })

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

    const optimizedMoves = optimizeMoveChains(result.moves)

    const initialDiskSnapshots: DiskSnapshot[] = allDisks.map((d) => ({
      path: d.path,
      totalBytes: d.totalBytes,
      freeBytes: d.freeBytes,
    }))

    const projection = projectDiskStates(initialDiskSnapshots, optimizedMoves)

    return {
      initialDiskStats: projection.initial,
      finalDiskStats: projection.final,
      moves: optimizedMoves,
      disksEvacuated: projection.evacuatedCount,
    }
  })

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

export const runPlan = (options: PlanOptions, isInteractive: boolean = false) =>
  Effect.gen(function* () {
    const diskService = yield* DiskServiceTag
    const fs = yield* FileSystem.FileSystem
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

    if (finalOptions.debug) {
      yield* Effect.logInfo("Debug logging enabled")
    }

    const parsed = parsePlanOptions(finalOptions)

    const planExists = yield* pipe(
      fs.access(parsed.planPath),
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false))
    )

    if (planExists && !finalOptions.force) {
      yield* Console.error(`\nERROR: An existing plan file at "${parsed.planPath}" already exists.`)
      yield* Console.error(`\n   Use --force to overwrite it with a new plan.`)
      return
    }

    yield* logger.plan.header

    yield* logger.plan.discoveringDisks

    const destinationPaths = parseDestinationPaths(finalOptions.dest)
    const diskPaths = destinationPaths ?? (yield* diskService.autoDiscover())

    if (diskPaths.length === 0) {
      yield* logger.plan.noDisksFound
      return
    }

    const allDisks = yield* diskService.discover(diskPaths)

    yield* Effect.forEach(allDisks, (disk) => logger.plan.diskInfo(disk, false), {
      discard: true,
    })

    const iterativeResult = yield* buildWorldViewAndPlan(allDisks, {
      excludePatterns: parsed.excludePatterns,
      minSpaceBytes: parsed.minSpaceBytes,
      minFileSizeBytes: parsed.minFileSizeBytes,
      pathPrefixes: parsed.pathPrefixes,
      minSplitSizeBytes: parsed.minSplitSizeBytes,
      moveAsFolderThresholdPct: parsed.moveAsFolderThresholdPct,
      srcDiskPaths: parsed.srcDiskPaths,
      debug: finalOptions.debug,
    })

    const { moves } = iterativeResult
    const pendingMoves = moves.filter((m) => m.status === "pending")
    const skippedMoves = moves.filter((m) => m.status === "skipped")

    if (moves.length === 0) {
      yield* logger.plan.noMovesNeeded
      return
    }

    const plan = createMovePlan(moves)

    yield* logger.plan.planStats({
      foldersPlaced: 0,
      foldersExploded: undefined,
      movesPlanned: pendingMoves.length,
      skipped: skippedMoves.length,
      totalBytes: plan.summary.totalBytes,
    })

    if (pendingMoves.length === 0) {
      yield* logger.plan.noMovesNeeded
      return
    }

    yield* logger.plan.validating
    const dryRunReport = yield* transferService.executeAll(plan, {
      dryRun: true,
      concurrency: 1,
      preserveAttrs: true,
      deleteSource: true,
    })
    yield* logger.plan.validationComplete(dryRunReport.successful)

    yield* logger.plan.savingPlan(parsed.planPath)

    const allDestDiskPaths = new Set(moves.map((m) => m.targetDiskPath))
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

    const primarySourceDisk = parsed.srcDiskPaths?.[0] ?? moves[0]?.file.diskPath ?? "auto"
    const planGenerator = yield* PlanGeneratorServiceTag
    const scriptContent = yield* planGenerator.generate({
      moves: plan.moves,
      sourceDisk: primarySourceDisk,
      diskStats,
      concurrency: 4,
    })

    yield* fs.writeFileString(parsed.planPath, scriptContent)

    yield* pipe(
      Effect.tryPromise({
        try: () => Bun.$`chmod +x ${parsed.planPath}`.quiet(),
        catch: () => null,
      }),
      Effect.catchAll(() => Effect.void)
    )

    yield* logger.plan.planSaved
    yield* Console.log(`\n✓ Plan script saved to ${parsed.planPath}`)
    yield* Console.log(`\nTo execute the plan:`)
    yield* Console.log(`  ${parsed.planPath}`)
    yield* Console.log(`  or: ./unraid-bin-pack apply\n`)
  })

export const runApply = (options: ApplyOptions) =>
  Effect.gen(function* () {
    const logger = yield* LoggerServiceTag
    const fs = yield* FileSystem.FileSystem

    const defaultPath = "/config/plan.sh"
    const scriptPath = options.planFile ?? defaultPath

    yield* logger.apply.header(options.dryRun)

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

    yield* Effect.promise(() => Bun.$`bash ${scriptPath}`.quiet())

    yield* Console.log(`\n✅ Plan execution complete!\n`)
  })

export const runShow = (options: { planFile: string | undefined }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const planPath = options.planFile ?? "/config/plan.sh"

    const exists = yield* pipe(
      fs.access(planPath),
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false))
    )

    if (!exists) {
      yield* Console.error(`\nNo plan script found at "${planPath}"`)
      yield* Console.error(`Run 'unraid-bin-pack plan' first to create a plan.\n`)
      return
    }

    const scriptContent = yield* fs.readFileString(planPath)
    yield* Console.log(`\n📄 Plan script at ${planPath}:\n`)
    yield* Console.log(scriptContent)
  })

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

export const AppLive = createAppLayer()
