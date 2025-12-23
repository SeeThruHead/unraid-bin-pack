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
import { Effect, Option } from "effect"

import * as Opts from "./cli/options"
import { runPlan, runApply, AppLive, withErrorHandling } from "./cli/handler"

// =============================================================================
// Plan subcommand
// =============================================================================

const planCommand = Command.make(
  "plan",
  {
    src: Opts.src,
    dest: Opts.dest,
    threshold: Opts.threshold,
    algorithm: Opts.algorithm,
    include: Opts.include,
    exclude: Opts.exclude,
    minSplitSize: Opts.minSplitSize,
    folderThreshold: Opts.folderThreshold,
    planFile: Opts.planFile,
    force: Opts.force,
  },
  (opts) =>
    withErrorHandling(
      runPlan({
        src: Option.getOrUndefined(opts.src),
        dest: Option.getOrUndefined(opts.dest),
        threshold: opts.threshold,
        algorithm: opts.algorithm,
        include: Option.getOrUndefined(opts.include),
        exclude: Option.getOrUndefined(opts.exclude),
        minSplitSize: opts.minSplitSize,
        folderThreshold: opts.folderThreshold,
        planFile: Option.getOrUndefined(opts.planFile),
        force: opts.force,
      })
    ).pipe(Effect.provide(AppLive))
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
    ).pipe(Effect.provide(AppLive))
).pipe(
  Command.withDescription("Execute the saved move plan")
)

// =============================================================================
// Root command
// =============================================================================

const rootCommand = Command.make("unraid-bin-pack", {}).pipe(
  Command.withSubcommands([planCommand, applyCommand]),
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
