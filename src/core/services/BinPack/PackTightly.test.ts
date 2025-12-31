/**
 * PackTightly algorithm - TDD approach
 *
 * Algorithm: Find best file combinations to consolidate free space onto
 * as few disks as possible. Process disks from least full to most full,
 * moving files to other disks (excluding already-emptied disks).
 */

import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { packTightly } from "./PackTightly"
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

describe("PackTightly", () => {
  test("should not move files when one disk is full and one has only 2 MB used", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 0 * MB }, // completely full
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 998 * MB }, // 2 MB used, 998 MB free
      ],
      files: [
        createFile("/mnt/disk1", "file1.mkv", 1000),
        createFile("/mnt/disk2", "file2.mkv", 2),
      ],
    }

    const result = await Effect.runPromise(
      packTightly(worldView, { minSpaceBytes: 2 * MB })
    )

    // Should not move files - disk1 is full (can't receive), disk2 only has 2 MB (can't fit on disk1)
    expect(result.moves.length).toBe(0)
  })

  test("should move all data from disk2 and disk3 to disk1", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 502 * MB }, // 498 MB used
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 750 * MB }, // 250 MB used
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 750 * MB }, // 250 MB used
      ],
      files: [
        createFile("/mnt/disk1", "file1.mkv", 498),
        createFile("/mnt/disk2", "file2.mkv", 250),
        createFile("/mnt/disk3", "file3.mkv", 250),
      ],
    }

    const result = await Effect.runPromise(
      packTightly(worldView, { minSpaceBytes: 2 * MB })
    )

    // Should move all 500 MB from disk2 and disk3 to disk1 (which has 500 MB available with 2 MB minSpace)
    expect(result.moves.length).toBe(2)
    expect(result.moves.every(m => m.targetDiskPath === "/mnt/disk1")).toBe(true)
    expect(result.moves.some(m => m.file.diskPath === "/mnt/disk2")).toBe(true)
    expect(result.moves.some(m => m.file.diskPath === "/mnt/disk3")).toBe(true)
  })

  test("should move all from disk3 and partial from disk2 to fill disk1", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 502 * MB }, // 498 MB used
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 600 * MB }, // 400 MB used
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 750 * MB }, // 250 MB used
      ],
      files: [
        createFile("/mnt/disk1", "file1.mkv", 498),
        createFile("/mnt/disk2", "file2a.mkv", 150),
        createFile("/mnt/disk2", "file2b.mkv", 250),
        createFile("/mnt/disk3", "file3.mkv", 250),
      ],
    }

    const result = await Effect.runPromise(
      packTightly(worldView, { minSpaceBytes: 2 * MB })
    )

    // Should move all 250 MB from disk3 + 250 MB from disk2 to disk1
    expect(result.moves.length).toBe(2)
    expect(result.moves.every(m => m.targetDiskPath === "/mnt/disk1")).toBe(true)

    // All of disk3 should move
    expect(result.moves.some(m => m.file.diskPath === "/mnt/disk3")).toBe(true)

    // 250 MB from disk2 should move (the file2b.mkv)
    const disk2Moves = result.moves.filter(m => m.file.diskPath === "/mnt/disk2")
    expect(disk2Moves.length).toBe(1)
    expect(disk2Moves[0]!.file.sizeBytes).toBe(250 * MB)
  })

  test("should respect minSpaceBytes when filling disks", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 100 * MB }, // 900 MB used
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 200 * MB }, // 800 MB used
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 600 * MB }, // 400 MB used
      ],
      files: [
        createFile("/mnt/disk1", "file1.mkv", 900),
        createFile("/mnt/disk2", "file2.mkv", 800),
        createFile("/mnt/disk3", "file3a.mkv", 98),
        createFile("/mnt/disk3", "file3b.mkv", 198),
        createFile("/mnt/disk3", "file3c.mkv", 104),
      ],
    }

    const result = await Effect.runPromise(
      packTightly(worldView, { minSpaceBytes: 2 * MB })
    )

    // Should move 98 MB to disk1 (100 - 2 available) and 198 MB to disk2 (200 - 2 available)
    expect(result.moves.length).toBe(2)
    expect(result.moves.every(m => m.file.diskPath === "/mnt/disk3")).toBe(true)

    const toDisk1 = result.moves.filter(m => m.targetDiskPath === "/mnt/disk1")
    const toDisk2 = result.moves.filter(m => m.targetDiskPath === "/mnt/disk2")

    expect(toDisk1.length).toBe(1)
    expect(toDisk1[0]!.file.sizeBytes).toBe(98 * MB)

    expect(toDisk2.length).toBe(1)
    expect(toDisk2[0]!.file.sizeBytes).toBe(198 * MB)
  })

  test("should process multiple source disks and exclude emptied disks", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 300 * MB }, // 700 MB used
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 900 * MB }, // 100 MB used (emptiest)
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 800 * MB }, // 200 MB used (second emptiest)
        { path: "/mnt/disk4", totalBytes: 1000 * MB, freeBytes: 400 * MB }, // 600 MB used
      ],
      files: [
        createFile("/mnt/disk1", "file1.mkv", 700),
        createFile("/mnt/disk2", "file2.mkv", 100),
        createFile("/mnt/disk3", "file3a.mkv", 198),
        createFile("/mnt/disk3", "file3b.mkv", 2),
        createFile("/mnt/disk4", "file4.mkv", 600),
      ],
    }

    const result = await Effect.runPromise(
      packTightly(worldView, { minSpaceBytes: 2 * MB })
    )

    // Should move 100 MB from disk2 to disk1, then 198 MB from disk3 to disk1, then 2 MB from disk3 to disk4
    expect(result.moves.length).toBe(3)

    // All 100 MB from disk2 should move to disk1
    const disk2Moves = result.moves.filter(m => m.file.diskPath === "/mnt/disk2")
    expect(disk2Moves.length).toBe(1)
    expect(disk2Moves[0]!.targetDiskPath).toBe("/mnt/disk1")

    // disk3 files should move to disk1 (198 MB) and disk4 (2 MB), NOT back to disk2
    const disk3Moves = result.moves.filter(m => m.file.diskPath === "/mnt/disk3")
    expect(disk3Moves.length).toBe(2)
    expect(disk3Moves.some(m => m.targetDiskPath === "/mnt/disk2")).toBe(false) // NOT to disk2!
    expect(disk3Moves.some(m => m.targetDiskPath === "/mnt/disk1" && m.file.sizeBytes === 198 * MB)).toBe(true)
    expect(disk3Moves.some(m => m.targetDiskPath === "/mnt/disk4" && m.file.sizeBytes === 2 * MB)).toBe(true)
  })

  test("should filter files by minimum size", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 500 * MB }, // destination
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 900 * MB }, // source (emptiest)
      ],
      files: [
        createFile("/mnt/disk2", "small.mkv", 10),  // below minimum
        createFile("/mnt/disk2", "large.mkv", 100), // above minimum
      ],
    }

    const result = await Effect.runPromise(
      packTightly(worldView, {
        minSpaceBytes: 2 * MB,
        minFileSizeBytes: 50 * MB  // Only move files >= 50 MB
      })
    )

    // Should only move the large file (100 MB), not the small file (10 MB)
    expect(result.moves.length).toBe(1)
    expect(result.moves[0]!.file.relativePath).toBe("large.mkv")
    expect(result.moves[0]!.file.sizeBytes).toBe(100 * MB)
  })

  test("should filter files by path prefix", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 500 * MB }, // destination
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 700 * MB }, // source (emptiest)
      ],
      files: [
        createFile("/mnt/disk2", "videos/movie.mkv", 100),
        createFile("/mnt/disk2", "photos/pic.jpg", 50),
        createFile("/mnt/disk2", "videos/show.mkv", 150),
      ],
    }

    const result = await Effect.runPromise(
      packTightly(worldView, {
        minSpaceBytes: 2 * MB,
        pathPrefixes: ["/videos/"]  // Only move files in videos/ folder (note: leading slash)
      })
    )

    // Should only move the 2 video files, not the photo
    expect(result.moves.length).toBe(2)
    expect(result.moves.every(m => m.file.relativePath.startsWith("videos/"))).toBe(true)
    expect(result.moves.some(m => m.file.relativePath === "videos/movie.mkv")).toBe(true)
    expect(result.moves.some(m => m.file.relativePath === "videos/show.mkv")).toBe(true)
  })

  test("should only process specified source disks", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 500 * MB }, // destination
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 900 * MB }, // 100 MB used (emptiest)
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 800 * MB }, // 200 MB used (second emptiest)
      ],
      files: [
        createFile("/mnt/disk2", "file2.mkv", 100),
        createFile("/mnt/disk3", "file3.mkv", 200),
      ],
    }

    const result = await Effect.runPromise(
      packTightly(worldView, {
        minSpaceBytes: 2 * MB,
        srcDiskPaths: ["/mnt/disk3"]  // Only move from disk3, not disk2
      })
    )

    // Should only move files from disk3, even though disk2 is emptier
    expect(result.moves.length).toBe(1)
    expect(result.moves[0]!.file.diskPath).toBe("/mnt/disk3")
    expect(result.moves[0]!.targetDiskPath).toBe("/mnt/disk1")
  })

  test("should not move files from disk with no matching files after filtering", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 500 * MB }, // destination
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 900 * MB }, // source with only small files
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 700 * MB }, // source with large files
      ],
      files: [
        createFile("/mnt/disk2", "small1.mkv", 5),
        createFile("/mnt/disk2", "small2.mkv", 10),
        createFile("/mnt/disk3", "large.mkv", 200),
      ],
    }

    const result = await Effect.runPromise(
      packTightly(worldView, {
        minSpaceBytes: 2 * MB,
        minFileSizeBytes: 50 * MB  // Filters out all files from disk2
      })
    )

    // Should only move from disk3, not disk2 (even though disk2 is emptier)
    expect(result.moves.length).toBe(1)
    expect(result.moves[0]!.file.diskPath).toBe("/mnt/disk3")
  })
})
