import { Effect, pipe } from "effect"
import { Console } from "effect"
import { FileSystem } from "@effect/platform"

import type { PlanOptions, ApplyOptions } from "./options"
import { parsePlanOptions, parseDestinationPaths } from "./optionParsing"
import { fromDomainError } from "./errors"
import { interactivePlanPrompts } from "./interactive"

// Import from core library
import {
  createPlan,
  executePlanScript,
  readPlanScript,
  AppLive,
  type PlanConfig,
  type ApplyConfig,
} from "@core"
import { DiskServiceTag } from "@services/DiskService"
import { LoggerServiceTag } from "@services/LoggerService"

/**
 * Error handling wrapper for CLI commands
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

/**
 * Convert CLI PlanOptions to core PlanConfig
 */
const toPlanConfig = (options: PlanOptions): PlanConfig => ({
  src: options.src,
  dest: options.dest,
  minSpace: options.minSpace,
  minFileSize: options.minFileSize,
  pathFilter: options.pathFilter,
  include: options.include,
  exclude: options.exclude,
  minSplitSize: options.minSplitSize,
  moveAsFolderThreshold: options.moveAsFolderThreshold,
  debug: options.debug,
})

/**
 * Run the plan command
 */
export const runPlan = (options: PlanOptions, isInteractive: boolean = false) =>
  Effect.gen(function* () {
    const diskService = yield* DiskServiceTag
    const fs = yield* FileSystem.FileSystem
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

    // Check if plan already exists
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

    // Determine disk paths
    const destinationPaths = parseDestinationPaths(finalOptions.dest)
    const diskPaths = destinationPaths ?? (yield* diskService.autoDiscover())

    if (diskPaths.length === 0) {
      yield* logger.plan.noDisksFound
      return
    }

    // Validate and display disk info
    const allDisks = yield* diskService.discover(diskPaths)

    yield* Effect.forEach(allDisks, (disk) => logger.plan.diskInfo(disk, false), {
      discard: true,
    })

    // Convert CLI options to core config
    const config = toPlanConfig(finalOptions)

    // Call core library to create plan
    const result = yield* createPlan(diskPaths, config)

    if (result.moves.length === 0) {
      yield* logger.plan.noMovesNeeded
      return
    }

    // Display plan stats
    yield* logger.plan.planStats({
      foldersPlaced: 0,
      foldersExploded: undefined,
      movesPlanned: result.stats.movesPlanned,
      skipped: result.stats.skipped,
      totalBytes: result.stats.bytesConsolidated,
    })

    // Save plan script
    yield* logger.plan.savingPlan(parsed.planPath)

    yield* fs.writeFileString(parsed.planPath, result.script)

    // Make executable
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

/**
 * Run the apply command
 */
export const runApply = (options: ApplyOptions) =>
  Effect.gen(function* () {
    const logger = yield* LoggerServiceTag
    const fs = yield* FileSystem.FileSystem

    const defaultPath = "/config/plan.sh"
    const scriptPath = options.planFile ?? defaultPath

    yield* logger.apply.header(options.dryRun)

    // Check if script exists
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

    yield* Console.log(`\n📂 Executing plan script: ${scriptPath}\n`)

    // Convert CLI options to core config
    const config: ApplyConfig = {
      planPath: scriptPath,
      concurrency: options.concurrency,
      dryRun: options.dryRun,
    }

    // Call core library to execute plan
    const result = yield* executePlanScript(scriptPath, config)

    if (options.dryRun) {
      yield* Console.log(`🧪 DRY RUN MODE - showing what would be executed:\n`)
      yield* Console.log(result.output)
      yield* Console.log(`\n✓ Dry run complete\n`)
    } else {
      if (result.success) {
        yield* Console.log(`\n✅ Plan execution complete!\n`)
      } else {
        yield* Console.error(`\n❌ Plan execution failed:\n`)
        yield* Console.error(result.output)
      }
    }
  })

/**
 * Run the show command
 */
export const runShow = (options: { planFile: string | undefined }) =>
  Effect.gen(function* () {
    const planPath = options.planFile ?? "/config/plan.sh"

    // Call core library to read plan
    const scriptContent = yield* readPlanScript(planPath).pipe(
      Effect.catchAll(() =>
        Effect.gen(function* () {
          yield* Console.error(`\nNo plan script found at "${planPath}"`)
          yield* Console.error(`Run 'unraid-bin-pack plan' first to create a plan.\n`)
          return yield* Effect.fail(new Error("Plan not found"))
        })
      )
    )

    yield* Console.log(`\n📄 Plan script at ${planPath}:\n`)
    yield* Console.log(scriptContent)
  })

/**
 * Export the application layer for CLI
 */
export { AppLive }
