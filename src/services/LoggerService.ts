/**
 * LoggerService - formatted console output for plan, apply, and show commands
 */

import { Context, Effect, Layer, Console } from "effect"
import type { Disk } from "../domain/Disk"
import { formatSize } from "../lib/parseSize"

// =============================================================================
// Service interface
// =============================================================================

export interface LoggerService {
  readonly plan: {
    readonly header: Effect.Effect<void>
    readonly discoveringDisks: Effect.Effect<void>
    readonly noDisksFound: Effect.Effect<void>
    readonly diskInfo: (disk: Disk, isFinal: boolean) => Effect.Effect<void>
    readonly existingPlanWarning: (stats: { completed: number; failed: number; pending: number }) => Effect.Effect<void>
    readonly validating: Effect.Effect<void>
    readonly validationComplete: (successful: number) => Effect.Effect<void>
    readonly planStats: (stats: { movesPlanned?: number; skipped?: number; totalBytes: number; totalMoves?: number; disksEvacuated?: number; foldersPlaced?: number; foldersExploded?: number }) => Effect.Effect<void>
    readonly noMovesNeeded: Effect.Effect<void>
    readonly savingPlan: (path: string) => Effect.Effect<void>
    readonly planSaved: Effect.Effect<void>
  }
  readonly apply: {
    readonly header: (dryRun: boolean) => Effect.Effect<void>
    readonly loadingPlan: (path: string) => Effect.Effect<void>
    readonly noPlanFound: (path: string) => Effect.Effect<void>
    readonly planInfo: (stats: { createdAt: string; source?: string; alreadyCompleted?: number; retryingFailed?: number; toTransfer?: number; totalBytes?: number; pending?: number; completed?: number; failed?: number }) => Effect.Effect<void>
    readonly noMovesRemaining: Effect.Effect<void>
    readonly validatingPlan: Effect.Effect<void>
    readonly allSourceFilesExist: (count?: number) => Effect.Effect<void>
    readonly missingSourceFiles: (files: ReadonlyArray<string>, count?: number) => Effect.Effect<void>
    readonly noConflicts: Effect.Effect<void>
    readonly conflicts: (conflicts: ReadonlyArray<string>, count?: number) => Effect.Effect<void>
    readonly sufficientSpace: Effect.Effect<void>
    readonly insufficientSpace: (moves: ReadonlyArray<{ disk: string; needed: number; available: number }>) => Effect.Effect<void>
    readonly diskStatsChanged: Effect.Effect<void>
    readonly diskStatsChangedWarning: (changes: ReadonlyArray<{ disk: string; before: number; after: number }>) => Effect.Effect<void>
    readonly planValidated: Effect.Effect<void>
    readonly dryRunMode: Effect.Effect<void>
    readonly executing: (count: number, concurrency: number) => Effect.Effect<void>
    readonly transferStats: (successful: number, failed: number, skipped?: number) => Effect.Effect<void>
    readonly transferComplete: (dryRun: boolean) => Effect.Effect<void>
    readonly allComplete: Effect.Effect<void>
    readonly someFailedRetry: Effect.Effect<void>
    readonly planDeleted: Effect.Effect<void>
  }
  readonly show: {
    readonly header: Effect.Effect<void>
    readonly loadingPlan: (path: string) => Effect.Effect<void>
    readonly noPlanFound: (path: string) => Effect.Effect<void>
    readonly planInfo: (stats: { sourceDisk?: string; source?: string; createdAt: string; totalMoves?: number; pending: number; completed: number; failed: number }) => Effect.Effect<void>
    readonly diskStatsHeader: Effect.Effect<void>
    readonly diskStats: (stats: { diskPath: string; currentFree: number; totalBytes: number; usedPercent: number; netChange: number; freeAfter: number; usedPercentAfter: number }) => Effect.Effect<void>
    readonly movePlanHeader: Effect.Effect<void>
    readonly targetDiskHeader: (disk: string, count: number, totalBytes: number) => Effect.Effect<void>
    readonly moveEntry: (entry: { status: "pending" | "completed" | "failed"; size: number; sourcePath: string; destPath: string }) => Effect.Effect<void>
    readonly separator: Effect.Effect<void>
  }
}

export class LoggerServiceTag extends Context.Tag("LoggerService")<
  LoggerServiceTag,
  LoggerService
>() {}

// =============================================================================
// Implementation
// =============================================================================

export const LoggerServiceLive = Layer.succeed(
  LoggerServiceTag,
  {
    plan: {
      header: Console.log("\n📦 Unraid Bin-Pack - Plan\n"),
      discoveringDisks: Console.log("🔍 Discovering disks..."),
      noDisksFound: Console.error("❌ No disks found"),
      diskInfo: (disk, isFinal) => {
        const used = disk.totalBytes - disk.freeBytes
        const usedPct = ((used / disk.totalBytes) * 100).toFixed(1)
        const prefix = isFinal ? "  →" : "   "
        return Console.log(
          `${prefix} ${disk.path}: ${formatSize(used)}/${formatSize(disk.totalBytes)} (${usedPct}% full, ${formatSize(disk.freeBytes)} free)`
        )
      },
      existingPlanWarning: (stats) =>
        Effect.gen(function* () {
          yield* Console.log("\n⚠️  Existing plan file found with partial progress:")
          yield* Console.log(`   Completed: ${stats.completed}`)
          yield* Console.log(`   Failed: ${stats.failed}`)
          yield* Console.log(`   Pending: ${stats.pending}`)
          yield* Console.log("\n   Use --force to overwrite it with a new plan.\n")
        }),
      validating: Console.log("\n✓ Validating plan..."),
      validationComplete: (successful) =>
        Console.log(`✓ Validation complete - ${successful} moves validated\n`),
      planStats: (stats) =>
        Effect.gen(function* () {
          yield* Console.log(`\n📊 Plan Summary:`)
          if (stats.movesPlanned !== undefined) yield* Console.log(`   Moves planned: ${stats.movesPlanned}`)
          if (stats.skipped !== undefined) yield* Console.log(`   Skipped: ${stats.skipped}`)
          if (stats.totalMoves !== undefined) yield* Console.log(`   Total moves: ${stats.totalMoves}`)
          yield* Console.log(`   Total data: ${formatSize(stats.totalBytes)}`)
          if (stats.disksEvacuated !== undefined) yield* Console.log(`   Disks to evacuate: ${stats.disksEvacuated}`)
        }),
      noMovesNeeded: Console.log("\n✓ No moves needed - all disks adequately filled\n"),
      savingPlan: (path) => Console.log(`\n💾 Saving plan to ${path}...`),
      planSaved: Console.log("✓ Plan saved\n"),
    },
    apply: {
      header: (dryRun) =>
        Console.log(dryRun ? "\n🧪 Unraid Bin-Pack - Apply (DRY RUN)\n" : "\n▶️  Unraid Bin-Pack - Apply\n"),
      loadingPlan: (path) => Console.log(`📂 Loading plan from ${path}...`),
      noPlanFound: (path) => Console.error(`\n❌ No plan file found at ${path}\n   Run 'plan' command first.\n`),
      planInfo: (stats) =>
        Effect.gen(function* () {
          yield* Console.log(`\n📋 Plan status:`)
          yield* Console.log(`   Pending: ${stats.pending}`)
          yield* Console.log(`   Completed: ${stats.completed}`)
          yield* Console.log(`   Failed: ${stats.failed}`)
        }),
      noMovesRemaining: Console.log("\n✓ No moves remaining to execute\n"),
      validatingPlan: Console.log("\n🔍 Validating plan..."),
      allSourceFilesExist: (count?) => Console.log(`✓ All source files exist${count ? ` (${count})` : ""}`),
      missingSourceFiles: (files, count?) =>
        Effect.gen(function* () {
          yield* Console.error(`\n❌ Missing source files (${files.length}):`)
          for (const file of files.slice(0, 10)) {
            yield* Console.error(`   ${file}`)
          }
          if (files.length > 10) {
            yield* Console.error(`   ... and ${files.length - 10} more`)
          }
          yield* Console.error("")
        }),
      noConflicts: Console.log("✓ No file conflicts detected"),
      conflicts: (conflicts, count?) =>
        Effect.gen(function* () {
          yield* Console.error(`\n❌ File conflicts detected (${conflicts.length}):`)
          for (const file of conflicts.slice(0, 10)) {
            yield* Console.error(`   ${file}`)
          }
          if (conflicts.length > 10) {
            yield* Console.error(`   ... and ${conflicts.length - 10} more`)
          }
          yield* Console.error("")
        }),
      sufficientSpace: Console.log("✓ Sufficient disk space available"),
      insufficientSpace: (moves) =>
        Effect.gen(function* () {
          yield* Console.error(`\n❌ Insufficient disk space:`)
          for (const move of moves) {
            yield* Console.error(
              `   ${move.disk}: need ${formatSize(move.needed)}, only ${formatSize(move.available)} available`
            )
          }
          yield* Console.error("")
        }),
      diskStatsChanged: Console.log("⚠️  Disk stats have changed since plan was created"),
      diskStatsChangedWarning: (changes) =>
        Effect.gen(function* () {
          yield* Console.log("   Changed disks:")
          for (const change of changes) {
            yield* Console.log(
              `   ${change.disk}: ${formatSize(change.before)} → ${formatSize(change.after)} free`
            )
          }
        }),
      planValidated: Console.log("✓ Plan validated\n"),
      dryRunMode: Console.log("🧪 DRY RUN MODE - no files will be moved\n"),
      executing: (count, concurrency) =>
        Console.log(`\n📤 Transferring ${count} files (concurrency: ${concurrency})...\n`),
      transferStats: (successful, failed, skipped?) =>
        Console.log(`\n   ✓ ${successful} successful, ❌ ${failed} failed${skipped ? `, ⏭️  ${skipped} skipped` : ""}`),
      transferComplete: (dryRun) =>
        Console.log(dryRun ? "\n✓ Dry run complete\n" : "\n✓ Transfer complete\n"),
      allComplete: Console.log("✅ All moves completed successfully!\n"),
      someFailedRetry: Console.log("\n⚠️  Some moves failed. Run 'apply' again to retry failed moves.\n"),
      planDeleted: Console.log("🗑️  Plan deleted\n"),
    },
    show: {
      header: Console.log("\n📋 Unraid Bin-Pack - Show Plan\n"),
      loadingPlan: (path) => Console.log(`📂 Loading plan from ${path}...`),
      noPlanFound: (path) => Console.error(`\n❌ No plan file found at ${path}\n`),
      planInfo: (stats) =>
        Effect.gen(function* () {
          yield* Console.log(`\nSource disk: ${stats.sourceDisk}`)
          yield* Console.log(`Status: ${stats.pending} pending, ${stats.completed} completed, ${stats.failed} failed\n`)
        }),
      diskStatsHeader: Console.log("📊 Disk Stats (Before → After):\n"),
      diskStats: (stats) => {
        const beforeUsed = stats.totalBytes - stats.currentFree
        const afterUsed = stats.totalBytes - stats.freeAfter
        return Console.log(
          `   ${stats.diskPath}: ${formatSize(beforeUsed)}/${formatSize(stats.totalBytes)} (${stats.usedPercent.toFixed(1)}%) → ${formatSize(afterUsed)}/${formatSize(stats.totalBytes)} (${stats.usedPercentAfter.toFixed(1)}%)`
        )
      },
      movePlanHeader: Console.log("\n📦 Move Plan:\n"),
      targetDiskHeader: (disk, count, totalBytes) =>
        Console.log(`\n → ${disk} (${count} files, ${formatSize(totalBytes)}):`),
      moveEntry: (entry) => {
        const statusIcon = entry.status === "pending" ? "⏳" : entry.status === "completed" ? "✓" : "❌"
        return Console.log(
          `   ${statusIcon} ${formatSize(entry.size)}: ${entry.sourcePath} → ${entry.destPath}`
        )
      },
      separator: Console.log("\n" + "=".repeat(80) + "\n"),
    },
  }
)
