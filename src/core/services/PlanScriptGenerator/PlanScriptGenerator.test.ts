/**
 * BashRsyncPlanGenerator tests - generates executable bash scripts with rsync
 */

import { describe, test, expect } from "bun:test"
import { Effect, pipe } from "effect"
import type { FileMove } from "@domain/MovePlan"
import type { DiskStats } from "@domain/Disk"
import { BashRsyncPlanGenerator } from "./PlanScriptGenerator"
import { PlanGeneratorServiceTag, type PlanGeneratorOptions } from "../PlanGenerator/PlanGeneratorService"

// Test helper
const generate = (options: PlanGeneratorOptions) =>
  pipe(
    Effect.gen(function* () {
      const generator = yield* PlanGeneratorServiceTag
      return yield* generator.generate(options)
    }),
    Effect.provide(BashRsyncPlanGenerator),
    Effect.runSync
  )

describe("BashRsyncPlanGenerator", () => {
  test("generates executable bash script with shebang", () => {
    const moves: FileMove[] = [
      {
        file: {
          absolutePath: "/mnt/disk1/test.mkv",
          relativePath: "test.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk2",
        destinationPath: "/mnt/disk2/test.mkv",
        status: "pending",
      },
    ]

    const diskStats: Record<string, DiskStats> = {
      "/mnt/disk1": { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 500000000 },
      "/mnt/disk2": { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 900000000 },
    }

    const result = generate({
      moves,
      sourceDisk: "/mnt/disk1",
      diskStats,
      concurrency: 4,
    })

    expect(result).toContain("#!/bin/bash")
    expect(result).toContain("set -e")
  })

  test("generates rsync command with correct flags", () => {
    const moves: FileMove[] = [
      {
        file: {
          absolutePath: "/mnt/disk1/movie.mkv",
          relativePath: "movie.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 5000000000,
        },
        targetDiskPath: "/mnt/disk2",
        destinationPath: "/mnt/disk2/movie.mkv",
        status: "pending",
      },
    ]

    const diskStats: Record<string, DiskStats> = {
      "/mnt/disk1": { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 100000000 },
      "/mnt/disk2": { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 900000000 },
    }

    const result = generate({
      moves,
      sourceDisk: "/mnt/disk1",
      diskStats,
      concurrency: 4,
    })

    expect(result).toContain("rsync -a --remove-source-files")
    expect(result).toContain("/mnt/disk1/")
    expect(result).toContain("/mnt/disk2/")
  })

  test("batches moves by target disk", () => {
    const moves: FileMove[] = [
      {
        file: {
          absolutePath: "/mnt/disk1/file1.mkv",
          relativePath: "file1.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk2",
        destinationPath: "/mnt/disk2/file1.mkv",
        status: "pending",
      },
      {
        file: {
          absolutePath: "/mnt/disk1/file2.mkv",
          relativePath: "file2.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk2", // Same target - should batch
        destinationPath: "/mnt/disk2/file2.mkv",
        status: "pending",
      },
      {
        file: {
          absolutePath: "/mnt/disk1/file3.mkv",
          relativePath: "file3.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk3", // Different target - separate batch
        destinationPath: "/mnt/disk3/file3.mkv",
        status: "pending",
      },
    ]

    const diskStats: Record<string, DiskStats> = {
      "/mnt/disk1": { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 100000000 },
      "/mnt/disk2": { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 900000000 },
      "/mnt/disk3": { path: "/mnt/disk3", totalBytes: 1000000000, freeBytes: 900000000 },
    }

    const result = generate({
      moves,
      sourceDisk: "/mnt/disk1",
      diskStats,
      concurrency: 4,
    })

    // Should have 2 rsync commands (one per target disk)
    const rsyncCommands = result.match(/^\s*rsync /gm)
    expect(rsyncCommands?.length).toBe(2)

    // Both files to disk2 should be in same batch
    expect(result).toContain("file1.mkv")
    expect(result).toContain("file2.mkv")
    expect(result).toContain("file3.mkv")
  })

  test("adds concurrency control with background processes and wait", () => {
    const moves: FileMove[] = [
      {
        file: {
          absolutePath: "/mnt/disk1/file1.mkv",
          relativePath: "file1.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk2",
        destinationPath: "/mnt/disk2/file1.mkv",
        status: "pending",
      },
      {
        file: {
          absolutePath: "/mnt/disk1/file2.mkv",
          relativePath: "file2.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk3",
        destinationPath: "/mnt/disk3/file2.mkv",
        status: "pending",
      },
    ]

    const diskStats: Record<string, DiskStats> = {
      "/mnt/disk1": { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 100000000 },
      "/mnt/disk2": { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 900000000 },
      "/mnt/disk3": { path: "/mnt/disk3", totalBytes: 1000000000, freeBytes: 900000000 },
    }

    const result = generate({
      moves,
      sourceDisk: "/mnt/disk1",
      diskStats,
      concurrency: 4,
    })

    // Should have & for background execution
    expect(result).toContain("&")
    // Should have wait to synchronize
    expect(result).toContain("wait")
  })

  test("includes metadata header with plan info", () => {
    const moves: FileMove[] = [
      {
        file: {
          absolutePath: "/mnt/disk8/movie.mkv",
          relativePath: "movie.mkv",
          diskPath: "/mnt/disk8",
          sizeBytes: 5000000000,
        },
        targetDiskPath: "/mnt/disk1",
        destinationPath: "/mnt/disk1/movie.mkv",
        status: "pending",
      },
    ]

    const diskStats: Record<string, DiskStats> = {
      "/mnt/disk8": { path: "/mnt/disk8", totalBytes: 1000000000, freeBytes: 100000000 },
      "/mnt/disk1": { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 900000000 },
    }

    const result = generate({
      moves,
      sourceDisk: "/mnt/disk8",
      diskStats,
      concurrency: 4,
    })

    expect(result).toContain("# Source disk: /mnt/disk8")
    expect(result).toContain("# Total files: 1")
    expect(result).toMatch(/# Total size: \d+/)
    expect(result).toMatch(/# Generated: \d{4}-\d{2}-\d{2}/)
  })

  test("uses files-from with heredoc for file lists", () => {
    const moves: FileMove[] = [
      {
        file: {
          absolutePath: "/mnt/disk1/Movies/Movie1.mkv",
          relativePath: "Movies/Movie1.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk2",
        destinationPath: "/mnt/disk2/Movies/Movie1.mkv",
        status: "pending",
      },
      {
        file: {
          absolutePath: "/mnt/disk1/TV/Show1.mkv",
          relativePath: "TV/Show1.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk2",
        destinationPath: "/mnt/disk2/TV/Show1.mkv",
        status: "pending",
      },
    ]

    const diskStats: Record<string, DiskStats> = {
      "/mnt/disk1": { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 100000000 },
      "/mnt/disk2": { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 900000000 },
    }

    const result = generate({
      moves,
      sourceDisk: "/mnt/disk1",
      diskStats,
      concurrency: 4,
    })

    // Should use --files-from with process substitution
    expect(result).toContain("--files-from=<(cat <<'EOF'")
    expect(result).toContain("Movies/Movie1.mkv")
    expect(result).toContain("TV/Show1.mkv")
    expect(result).toContain("EOF")
  })

  test("skips files with status other than pending", () => {
    const moves: FileMove[] = [
      {
        file: {
          absolutePath: "/mnt/disk1/pending.mkv",
          relativePath: "pending.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk2",
        destinationPath: "/mnt/disk2/pending.mkv",
        status: "pending",
      },
      {
        file: {
          absolutePath: "/mnt/disk1/completed.mkv",
          relativePath: "completed.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk2",
        destinationPath: "/mnt/disk2/completed.mkv",
        status: "completed",
      },
      {
        file: {
          absolutePath: "/mnt/disk1/skipped.mkv",
          relativePath: "skipped.mkv",
          diskPath: "/mnt/disk1",
          sizeBytes: 1000000,
        },
        targetDiskPath: "/mnt/disk2",
        destinationPath: "/mnt/disk2/skipped.mkv",
        status: "skipped",
        reason: "Too small",
      },
    ]

    const diskStats: Record<string, DiskStats> = {
      "/mnt/disk1": { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 100000000 },
      "/mnt/disk2": { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 900000000 },
    }

    const result = generate({
      moves,
      sourceDisk: "/mnt/disk1",
      diskStats,
      concurrency: 4,
    })

    // Should only include pending file
    expect(result).toContain("pending.mkv")
    expect(result).not.toContain("completed.mkv")
    expect(result).not.toContain("skipped.mkv")
  })
})
