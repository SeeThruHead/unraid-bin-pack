/**
 * SimpleConsolidator tests - TDD approach
 *
 * Algorithm: Work through disks from least full to most full, finding the
 * best COMBINATIONS of files that fill destination disks efficiently.
 */

import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { consolidateSimple } from "./SimpleConsolidator"
import type { WorldView } from "@domain/WorldView"
import type { FileEntry } from "@domain/FileEntry"

const MB = 1024 * 1024

const createFile = (
  diskPath: string,
  relativePath: string,
  sizeMB: number
): FileEntry => ({
  diskPath,
  relativePath,
  absolutePath: `${diskPath}/${relativePath}`,
  sizeBytes: sizeMB * MB,
})

describe("SimpleConsolidator", () => {
  test("should prefer combination that fills space better", async () => {
    // Source disk (least full) has 3 files
    // Destination has 545MB free
    // Should pick 345MB + 200MB (perfect fit) over 540MB (wastes 5MB)
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 545 * MB }, // destination
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 100 * MB }, // source (least full)
      ],
      files: [
        createFile("/mnt/disk2", "file1.mkv", 540), // single file option
        createFile("/mnt/disk2", "file2.mkv", 345), // combo option
        createFile("/mnt/disk2", "file3.mkv", 200), // combo option
      ],
    }

    const result = await Effect.runPromise(
      consolidateSimple(worldView, { minSpaceBytes: 0 })
    )

    // Should move file2 + file3 (545MB) instead of just file1 (540MB)
    expect(result.moves.length).toBe(2)
    expect(result.moves.some((m) => m.file.relativePath === "file2.mkv")).toBe(true)
    expect(result.moves.some((m) => m.file.relativePath === "file3.mkv")).toBe(true)
  })

  test("should work through disks from least full to most full", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 800 * MB }, // destination
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 100 * MB }, // source 1 (least full)
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 50 * MB },  // source 2 (more full)
      ],
      files: [
        createFile("/mnt/disk2", "file1.mkv", 50),
        createFile("/mnt/disk3", "file2.mkv", 30),
      ],
    }

    const result = await Effect.runPromise(
      consolidateSimple(worldView, { minSpaceBytes: 0 })
    )

    // Should process disk2 first (least full), then disk3
    expect(result.moves.length).toBe(2)
    expect(result.moves[0]!.file.diskPath).toBe("/mnt/disk2")
  })

  test("should respect minSpaceBytes reservation", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 150 * MB }, // destination
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 50 * MB },  // source
      ],
      files: [
        createFile("/mnt/disk2", "file1.mkv", 100),
      ],
    }

    const result = await Effect.runPromise(
      consolidateSimple(worldView, { minSpaceBytes: 100 * MB })
    )

    // Should NOT move file because 150MB - 100MB file - 100MB minSpace = -50MB
    expect(result.moves.length).toBe(0)
  })

  test("should move files to multiple destinations if needed", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 100 * MB }, // dest 1
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 100 * MB }, // dest 2
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 50 * MB },  // source
      ],
      files: [
        createFile("/mnt/disk3", "file1.mkv", 80),
        createFile("/mnt/disk3", "file2.mkv", 80),
      ],
    }

    const result = await Effect.runPromise(
      consolidateSimple(worldView, { minSpaceBytes: 0 })
    )

    // Should move both files to different destinations
    expect(result.moves.length).toBe(2)
    const destinations = new Set(result.moves.map((m) => m.targetDiskPath))
    expect(destinations.size).toBe(2) // Used 2 different destinations
  })

  test("should handle case where no files can be moved", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 10 * MB },  // no space
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 100 * MB }, // source
      ],
      files: [
        createFile("/mnt/disk2", "file1.mkv", 500), // too big
      ],
    }

    const result = await Effect.runPromise(
      consolidateSimple(worldView, { minSpaceBytes: 0 })
    )

    expect(result.moves.length).toBe(0)
  })

  test("should not move files to source disk", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 900 * MB }, // source with lots of space
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 100 * MB }, // destination
      ],
      files: [
        createFile("/mnt/disk1", "file1.mkv", 50),
      ],
    }

    const result = await Effect.runPromise(
      consolidateSimple(worldView, { minSpaceBytes: 0 })
    )

    // Should move to disk2, not keep on disk1 even though disk1 has more space
    expect(result.moves.length).toBe(1)
    expect(result.moves[0]!.targetDiskPath).toBe("/mnt/disk2")
  })

  test("should find multi-file combination across iterations", async () => {
    // After moving some files, should re-evaluate combinations
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 300 * MB }, // destination
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 100 * MB }, // source
      ],
      files: [
        createFile("/mnt/disk2", "file1.mkv", 100),
        createFile("/mnt/disk2", "file2.mkv", 100),
        createFile("/mnt/disk2", "file3.mkv", 100),
      ],
    }

    const result = await Effect.runPromise(
      consolidateSimple(worldView, { minSpaceBytes: 0 })
    )

    // Should move all 3 files (3 * 100MB = 300MB fits perfectly)
    expect(result.moves.length).toBe(3)
  })
})
