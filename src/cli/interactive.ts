import { Prompt } from "@effect/cli"
import { Effect, Console } from "effect"
import type { Terminal, QuitException } from "@effect/platform/Terminal"
import type { PlanOptions } from "./options"
import type { Disk } from "../domain/Disk"
import { selectDirectoriesEffect } from "./treeSelect"

export const interactivePlanPrompts = (
  discoveredDisks: ReadonlyArray<Disk>
): Effect.Effect<PlanOptions, QuitException, Terminal> =>
  Effect.gen(function* () {
    yield* Console.log("\n📦 Unraid Bin-Pack - Interactive Plan Setup\n")

    yield* Console.log("🔍 Discovered disks:")
    for (const disk of discoveredDisks) {
      const usedGB = ((disk.totalBytes - disk.freeBytes) / 1024 / 1024 / 1024).toFixed(1)
      const totalGB = (disk.totalBytes / 1024 / 1024 / 1024).toFixed(1)
      const freeGB = (disk.freeBytes / 1024 / 1024 / 1024).toFixed(1)
      const usedPct = (((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100).toFixed(1)
      yield* Console.log(`   ${disk.path}: ${usedGB}/${totalGB} GB used (${usedPct}%), ${freeGB} GB free`)
    }
    yield* Console.log("")

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

    const destDefault = discoveredDisks.map(d => d.path).join(",")
    const dest = yield* Prompt.text({
      message: `Destination disks (comma-separated) [all ${discoveredDisks.length} disks]`,
      default: destDefault,
    }).pipe(Effect.map((s) => (s.trim() === "" ? undefined : s.trim())))

    const minSpace = yield* Prompt.text({
      message: "Min free space per disk",
      default: "50MB",
    })

    const minFileSize = yield* Prompt.text({
      message: "Min file size to move",
      default: "1MB",
    })

    const selectedDirs = yield* selectDirectoriesEffect(
      discoveredDisks.map((d) => d.path)
    ).pipe(Effect.orDie)

    const pathFilter = selectedDirs.length > 0 ? selectedDirs.join(",") : ""

    if (selectedDirs.length > 0) {
      yield* Console.log(`\n✓ Selected paths: ${selectedDirs.join(", ")}\n`)
    } else {
      yield* Console.log("\n✓ All paths included\n")
    }

    const include = yield* Prompt.text({
      message: "File patterns to include (e.g., *.mkv,*.mp4, empty for all)",
      default: "",
    }).pipe(Effect.map((s) => (s.trim() === "" ? undefined : s.trim())))

    const exclude = yield* Prompt.text({
      message: "Patterns to exclude",
      default: ".DS_Store,@eaDir,.Trashes,.Spotlight-V100",
    })

    const minSplitSize = yield* Prompt.text({
      message: "Min folder size to allow splitting",
      default: "1GB",
    })

    const moveAsFolderThreshold = yield* Prompt.text({
      message: "Keep folder together if largest file is % of total (0.0-1.0)",
      default: "0.9",
    })

    const planFile = yield* Prompt.text({
      message: "Plan script path [/config/plan.sh]",
      default: "/config/plan.sh",
    }).pipe(Effect.map((s) => (s.trim() === "" || s.trim() === "/config/plan.sh" ? undefined : s.trim())))

    const force = yield* Prompt.confirm({
      message: "Force overwrite existing plan?",
      initial: false,
    })

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
