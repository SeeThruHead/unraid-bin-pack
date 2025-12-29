/**
 * Unraid Bin-Pack CLI
 *
 * Consolidates files across Unraid disks using bin-packing algorithms.
 * Moves files from a source disk to fill destination disks efficiently.
 *
 * Commands:
 *   plan  - Scan source disk, compute optimal moves, save plan
 *   apply - Execute the saved plan
 *
 * Example:
 *   $ unraid-bin-pack plan                    # auto-discover disks
 *   $ unraid-bin-pack plan --src /mnt/disk3   # specify source
 *   $ unraid-bin-pack apply
 */

import { Command } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect, Option, Logger, LogLevel } from "effect"

import * as Opts from "./cli/options"
import { runPlan, runApply, runShow, createAppLayer, withErrorHandling } from "./cli/handler"

// =============================================================================
// Plan subcommand
// =============================================================================

const planCommand = Command.make(
  "plan",
  {
    src: Opts.src,
    dest: Opts.dest,
    minSpace: Opts.minSpace,
    minFileSize: Opts.minFileSize,
    pathFilter: Opts.pathFilter,
    include: Opts.include,
    exclude: Opts.exclude,
    minSplitSize: Opts.minSplitSize,
    moveAsFolderThreshold: Opts.moveAsFolderThreshold,
    planFile: Opts.planFile,
    force: Opts.force,
    debug: Opts.debug,
  },
  (opts) =>
    withErrorHandling(
      runPlan({
        src: Option.getOrUndefined(opts.src),
        dest: Option.getOrUndefined(opts.dest),
        minSpace: opts.minSpace,
        minFileSize: opts.minFileSize,
        pathFilter: opts.pathFilter,
        include: Option.getOrUndefined(opts.include),
        exclude: Option.getOrUndefined(opts.exclude),
        minSplitSize: opts.minSplitSize,
        moveAsFolderThreshold: opts.moveAsFolderThreshold,
        planFile: Option.getOrUndefined(opts.planFile),
        force: opts.force,
        debug: opts.debug,
      })
    ).pipe(
      opts.debug ? Effect.provide(Logger.minimumLogLevel(LogLevel.Debug)) : (x => x),
      Effect.provide(createAppLayer())
    )
).pipe(
  Command.withDescription(
    "Scan source disk and compute optimal move plan"
  )
)

// =============================================================================
// Apply subcommand
// =============================================================================

const applyCommand = Command.make(
  "apply",
  {
    planFile: Opts.planFile,
    concurrency: Opts.concurrency,
    dryRun: Opts.dryRun,
  },
  (opts) =>
    withErrorHandling(
      runApply({
        planFile: Option.getOrUndefined(opts.planFile),
        concurrency: opts.concurrency,
        dryRun: opts.dryRun,
      })
    ).pipe(Effect.provide(createAppLayer()))
).pipe(
  Command.withDescription("Execute the saved move plan")
)

// =============================================================================
// Show subcommand
// =============================================================================

const showCommand = Command.make(
  "show",
  {
    planFile: Opts.planFile,
  },
  (opts) =>
    withErrorHandling(
      runShow({
        planFile: Option.getOrUndefined(opts.planFile),
      })
    ).pipe(Effect.provide(createAppLayer()))
).pipe(
  Command.withDescription("Display the saved move plan")
)

// =============================================================================
// Root command
// =============================================================================

const rootCommand = Command.make("unraid-bin-pack", {}).pipe(
  Command.withSubcommands([planCommand, applyCommand, showCommand]),
  Command.withDescription(
    "Consolidate files across Unraid disks using bin-packing"
  )
)

// =============================================================================
// Run CLI
// =============================================================================

const cli = Command.run(rootCommand, {
  name: "unraid-bin-pack",
  version: "0.1.0",
})

cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain)
