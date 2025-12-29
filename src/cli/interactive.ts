/**
 * Interactive prompts for plan command
 * Uses Effect CLI Prompt for user interaction
 */

import { Prompt } from "@effect/cli"
import { Effect, Console } from "effect"
import type { Terminal, QuitException } from "@effect/platform/Terminal"
import type { PlanOptions } from "./options"
import type { Disk } from "../domain/Disk"

/**
 * Run interactive prompts to gather plan options from user.
 * Shows discovered disks and allows customization.
 */
export const interactivePlanPrompts = (
  discoveredDisks: ReadonlyArray<Disk>
): Effect.Effect<PlanOptions, QuitException, Terminal> =>
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
      .slice()
      .sort((a, b) => b.freeBytes - a.freeBytes)[0]

    const srcDefault = leastFullDisk?.path ?? ""
    const srcMessage = leastFullDisk
      ? `Source disk to move files from [${srcDefault} - least full]`
      : "Source disk to move files from"

    const src = yield* Prompt.text({
      message: srcMessage,
      default: srcDefault,
    }).pipe(Effect.map((s) => (s.trim() === "" ? undefined : s.trim())))

    // Destination disks - default to all discovered disks
    const destDefault = discoveredDisks.map(d => d.path).join(",")
    const dest = yield* Prompt.text({
      message: `Destination disks (comma-separated) [all ${discoveredDisks.length} disks]`,
      default: destDefault,
    }).pipe(Effect.map((s) => (s.trim() === "" ? undefined : s.trim())))

    // Min space
    const minSpace = yield* Prompt.text({
      message: "Min free space per disk",
      default: "50MB",
    })

    // Min file size
    const minFileSize = yield* Prompt.text({
      message: "Min file size to move",
      default: "1MB",
    })

    // Path filter
    const pathFilter = yield* Prompt.text({
      message: "Path prefixes to include (comma-separated, empty for all)",
      default: "/media/Movies,/media/TV,/media/Anime",
    })

    // Include patterns
    const include = yield* Prompt.text({
      message: "File patterns to include (e.g., *.mkv,*.mp4, empty for all)",
      default: "",
    }).pipe(Effect.map((s) => (s.trim() === "" ? undefined : s.trim())))

    // Exclude patterns
    const exclude = yield* Prompt.text({
      message: "Patterns to exclude (e.g., .DS_Store,@eaDir, empty for none)",
      default: "",
    }).pipe(Effect.map((s) => (s.trim() === "" ? undefined : s.trim())))

    // Min split size
    const minSplitSize = yield* Prompt.text({
      message: "Min folder size to allow splitting",
      default: "1GB",
    })

    // Move as folder threshold
    const moveAsFolderThreshold = yield* Prompt.text({
      message: "Keep folder together if largest file is % of total (0.0-1.0)",
      default: "0.9",
    })

    // Plan file
    const planFile = yield* Prompt.text({
      message: "Plan file path (empty for default)",
      default: "",
    }).pipe(Effect.map((s) => (s.trim() === "" ? undefined : s.trim())))

    // Force overwrite
    const force = yield* Prompt.confirm({
      message: "Force overwrite existing plan?",
      initial: false,
    })

    // Debug
    const debug = yield* Prompt.confirm({
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
