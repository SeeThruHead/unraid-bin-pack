/**
 * Interactive prompts for plan command
 * Uses Effect CLI Prompt for user interaction
 */

import { Effect, Console, type Terminal } from "effect"
import { Prompt } from "effect/cli"
import type { PlanOptions } from "./options"
import type { Disk } from "../domain/Disk"
import { selectDirectoriesEffect } from "./treeSelect"

/**
 * Run interactive prompts to gather plan options from user.
 * Shows discovered disks and allows customization.
 */
export const interactivePlanPrompts = (
  discoveredDisks: ReadonlyArray<Disk>
): Effect.Effect<PlanOptions, Terminal.QuitError, Prompt.Environment> =>
  Effect.gen(function* () {
    yield* Console.log("\n📦 Unraid Bin-Pack - Interactive Plan Setup\n")

    // Show discovered disks
    yield* Console.log("🔍 Discovered disks:")
    for (const disk of discoveredDisks) {
      const usedGB = ((disk.totalBytes - disk.freeBytes) / 1024 / 1024 / 1024).toFixed(1)
      const totalGB = (disk.totalBytes / 1024 / 1024 / 1024).toFixed(1)
      const freeGB = (disk.freeBytes / 1024 / 1024 / 1024).toFixed(1)
      const usedPct = (((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100).toFixed(1)
      yield* Console.log(`   ${disk.path}: ${usedGB}/${totalGB} GB used (${usedPct}%), ${freeGB} GB free`)
    }
    yield* Console.log("")

    // Source disk - show least full as default
    const leastFullDisk = discoveredDisks
      .toSorted((a, b) => b.freeBytes - a.freeBytes)[0]

    const srcDefault = leastFullDisk?.path ?? ""
    const srcMessage = leastFullDisk
      ? `Source disk to move files from [${srcDefault} - least full]`
      : "Source disk to move files from"

    const src = yield* Prompt.String({
      message: srcMessage,
      default: srcDefault,
    }).pipe(Effect.map((s) => (s.trim() === "" ? undefined : s.trim())))

    // Destination disks - default to all discovered disks
    const destDefault = discoveredDisks.map(d => d.path).join(",")
    const dest = yield* Prompt.String({
      message: `Destination disks (comma-separated) [all ${discoveredDisks.length} disks]`,
      default: destDefault,
    }).pipe(Effect.map((s) => (s.trim() === "" ? undefined : s.trim())))

    // Min space
    const minSpace = yield* Prompt.String({
      message: "Min free space per disk",
      default: "50MB",
    })

    // Min file size
    const minFileSize = yield* Prompt.String({
      message: "Min file size to move",
      default: "1MB",
    })

    // Use tree-view to select directories
    const selectedDirs = yield* selectDirectoriesEffect(
      discoveredDisks.map((d) => d.path)
    ).pipe(Effect.orDie)

    const pathFilter = selectedDirs.length > 0 ? selectedDirs.join(",") : ""

    if (selectedDirs.length > 0) {
      yield* Console.log(`\n✓ Selected paths: ${selectedDirs.join(", ")}\n`)
    } else {
      yield* Console.log("\n✓ All paths included\n")
    }

    // Include patterns
    const include = yield* Prompt.String({
      message: "File patterns to include (e.g., *.mkv,*.mp4, empty for all)",
      default: "",
    }).pipe(Effect.map((s) => (s.trim() === "" ? undefined : s.trim())))

    // Exclude patterns
    const exclude = yield* Prompt.String({
      message: "Patterns to exclude",
      default: ".DS_Store,@eaDir,.Trashes,.Spotlight-V100",
    })

    // Min split size
    const minSplitSize = yield* Prompt.String({
      message: "Min folder size to allow splitting",
      default: "1GB",
    })

    // Move as folder threshold
    const moveAsFolderThreshold = yield* Prompt.String({
      message: "Keep folder together if largest file is % of total (0.0-1.0)",
      default: "0.9",
    })

    // Plan file
    const planFile = yield* Prompt.String({
      message: "Plan script path [/config/plan.sh]",
      default: "/config/plan.sh",
    }).pipe(Effect.map((s) => (s.trim() === "" || s.trim() === "/config/plan.sh" ? undefined : s.trim())))

    // Force overwrite
    const force = yield* Prompt.Confirm({
      message: "Force overwrite existing plan?",
      initial: false,
    })

    // Debug
    const debug = yield* Prompt.Confirm({
      message: "Enable debug logging?",
      initial: false,
    })

    yield* Console.log("\n✓ Configuration complete!\n")

    return {
      src,
      dest,
      minSpace,
      minFileSize,
      pathFilter,
      include,
      exclude,
      minSplitSize,
      moveAsFolderThreshold,
      planFile,
      force,
      debug,
    }
  })
