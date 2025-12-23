import { describe, expect, test } from "bun:test"
import { Effect, pipe } from "effect"
import { BinPackServiceTag, BinPackServiceLive, type BinPackResult } from "./BinPackService"
import type { Disk } from "../domain/Disk"
import type { FileEntry } from "../domain/FileEntry"

// =============================================================================
// Test data factories
// =============================================================================

const makeDisk = (path: string, totalBytes: number, freeBytes: number): Disk => ({
  path,
  totalBytes,
  freeBytes,
})

const makeFile = (
  relativePath: string,
  sizeBytes: number,
  diskPath: string
): FileEntry => ({
  absolutePath: `${diskPath}/${relativePath}`,
  relativePath,
  sizeBytes,
  diskPath,
})

// =============================================================================
// Tests
// =============================================================================

describe("BinPackService (hybrid folder+file packing)", () => {
  const run = (effect: Effect.Effect<BinPackResult, never, BinPackServiceTag>) =>
    pipe(effect, Effect.provide(BinPackServiceLive), Effect.runPromise)

  describe("folder-level packing (pass 1)", () => {
    test("places entire folders on best-fit disk", async () => {
      const disks: Disk[] = [
        makeDisk("/mnt/disk1", 1000, 500), // 500 free
        makeDisk("/mnt/disk2", 1000, 300), // 300 free - tighter fit for 250
      ]

      // Two folders: movies (250 bytes) and photos (100 bytes)
      const spilloverFiles: FileEntry[] = [
        makeFile("movies/a.mkv", 150, "/mnt/spillover"),
        makeFile("movies/b.mkv", 100, "/mnt/spillover"),
        makeFile("photos/pic.jpg", 100, "/mnt/spillover"),
      ]

      const result = await run(
        Effect.flatMap(BinPackServiceTag, (svc) =>
          svc.computeMoves(disks, spilloverFiles, {
            thresholdBytes: 50,
            algorithm: "best-fit",
          })
        )
      )

      // Movies folder (250 bytes) should go to disk2 (300 free - tightest fit)
      // Photos folder (100 bytes) should go to disk2 as well (50 left after movies)
      expect(result.placedFolders).toHaveLength(2)
      expect(result.explodedFolders).toHaveLength(0)

      const movieMoves = result.plan.moves.filter((m) =>
        m.file.relativePath.startsWith("movies/")
      )
      expect(movieMoves.every((m) => m.targetDiskPath === "/mnt/disk2")).toBe(true)
    })

    test("keeps folder files together on same disk", async () => {
      const disks: Disk[] = [makeDisk("/mnt/disk1", 2000, 1000)]

      const spilloverFiles: FileEntry[] = [
        makeFile("anime/ep01.mkv", 100, "/mnt/spillover"),
        makeFile("anime/ep02.mkv", 100, "/mnt/spillover"),
        makeFile("anime/ep03.mkv", 100, "/mnt/spillover"),
        makeFile("anime/ep04.mkv", 100, "/mnt/spillover"),
      ]

      const result = await run(
        Effect.flatMap(BinPackServiceTag, (svc) =>
          svc.computeMoves(disks, spilloverFiles, {
            thresholdBytes: 50,
            algorithm: "best-fit",
          })
        )
      )

      // All anime files should go to the same disk
      const animeMoves = result.plan.moves.filter((m) => m.status === "pending")
      expect(animeMoves).toHaveLength(4)
      const targetDisks = new Set(animeMoves.map((m) => m.targetDiskPath))
      expect(targetDisks.size).toBe(1) // All on same disk
    })
  })

  describe("file-level packing (pass 2)", () => {
    test("explodes folders that don't fit and packs individual files", async () => {
      const disks: Disk[] = [
        makeDisk("/mnt/disk1", 1000, 200), // Only 200 free
        makeDisk("/mnt/disk2", 1000, 150), // Only 150 free
      ]

      // One folder with 500 bytes total - won't fit on any disk as a whole
      // Files are evenly sized so no single file dominates (keepTogether = false)
      const spilloverFiles: FileEntry[] = [
        makeFile("big-folder/a.txt", 100, "/mnt/spillover"),
        makeFile("big-folder/b.txt", 100, "/mnt/spillover"),
        makeFile("big-folder/c.txt", 100, "/mnt/spillover"),
        makeFile("big-folder/d.txt", 100, "/mnt/spillover"),
        makeFile("big-folder/e.txt", 100, "/mnt/spillover"),
      ]

      const result = await run(
        Effect.flatMap(BinPackServiceTag, (svc) =>
          svc.computeMoves(disks, spilloverFiles, {
            thresholdBytes: 50,
            algorithm: "best-fit",
            // Allow small folders to be split for testing
            minSplitSizeBytes: 0,
            folderThreshold: 0.9,
          })
        )
      )

      // Folder couldn't fit as a whole
      expect(result.placedFolders).toHaveLength(0)
      expect(result.explodedFolders).toHaveLength(1)

      // Individual files should be distributed across disks
      const pendingMoves = result.plan.moves.filter((m) => m.status === "pending")
      const disk1Moves = pendingMoves.filter((m) => m.targetDiskPath === "/mnt/disk1")
      const disk2Moves = pendingMoves.filter((m) => m.targetDiskPath === "/mnt/disk2")

      // disk1 (200 free) can fit 1 file (100 bytes), leaving 100 > 50 threshold
      // disk2 (150 free) can fit 1 file (100 bytes), leaving 50 = threshold
      expect(disk1Moves.length).toBeGreaterThan(0)
      expect(disk2Moves.length).toBeGreaterThan(0)
    })

    test("skips files that can't fit anywhere", async () => {
      const disks: Disk[] = [makeDisk("/mnt/disk1", 1000, 100)] // Only 100 free

      // Root-level file (no folder) that's too big to fit
      const spilloverFiles: FileEntry[] = [
        makeFile("huge-file.mkv", 500, "/mnt/spillover"), // Too big
      ]

      const result = await run(
        Effect.flatMap(BinPackServiceTag, (svc) =>
          svc.computeMoves(disks, spilloverFiles, {
            thresholdBytes: 50,
            algorithm: "best-fit",
            // Allow small folders to be split for testing
            minSplitSizeBytes: 0,
            folderThreshold: 0.9,
          })
        )
      )

      expect(result.plan.moves).toHaveLength(1)
      expect(result.plan.moves[0]?.status).toBe("skipped")
      // Root-level file with keepTogether still results in "Folder must stay together"
      // because the empty "" folder is treated as keepTogether (single file = 100% of total)
      expect(result.plan.moves[0]?.reason).toMatch(/(No disk has enough space|Folder must stay together)/)
    })

    test("skips keepTogether folders that don't fit", async () => {
      const disks: Disk[] = [makeDisk("/mnt/disk1", 1000, 100)] // Only 100 free

      // Movie-like folder: one big file dominates
      const spilloverFiles: FileEntry[] = [
        makeFile("movie/movie.mkv", 450, "/mnt/spillover"),
        makeFile("movie/subs.srt", 50, "/mnt/spillover"),
      ]

      const result = await run(
        Effect.flatMap(BinPackServiceTag, (svc) =>
          svc.computeMoves(disks, spilloverFiles, {
            thresholdBytes: 50,
            algorithm: "best-fit",
            minSplitSizeBytes: 0,
            folderThreshold: 0.9, // 90% threshold - movie.mkv is 90% of folder
          })
        )
      )

      // Folder should be kept together and skipped
      expect(result.plan.moves).toHaveLength(2)
      expect(result.plan.moves.every((m) => m.status === "skipped")).toBe(true)
      expect(result.plan.moves[0]?.reason).toContain("Folder must stay together")
    })
  })

  describe("first-fit algorithm", () => {
    test("places on first disk that fits (not tightest)", async () => {
      const disks: Disk[] = [
        makeDisk("/mnt/disk1", 1000, 500), // First disk, plenty of room
        makeDisk("/mnt/disk2", 1000, 250), // Tighter fit
      ]

      const spilloverFiles: FileEntry[] = [
        makeFile("folder/file.txt", 200, "/mnt/spillover"),
      ]

      const result = await run(
        Effect.flatMap(BinPackServiceTag, (svc) =>
          svc.computeMoves(disks, spilloverFiles, {
            thresholdBytes: 50,
            algorithm: "first-fit",
          })
        )
      )

      // First-fit should use disk1 (first that fits), not disk2 (tightest)
      expect(result.plan.moves[0]?.targetDiskPath).toBe("/mnt/disk1")
    })
  })

  describe("root-level files", () => {
    test("handles files in root (no folder)", async () => {
      const disks: Disk[] = [makeDisk("/mnt/disk1", 1000, 500)]

      const spilloverFiles: FileEntry[] = [
        makeFile("root-file.txt", 100, "/mnt/spillover"),
        makeFile("another-root.txt", 100, "/mnt/spillover"),
      ]

      const result = await run(
        Effect.flatMap(BinPackServiceTag, (svc) =>
          svc.computeMoves(disks, spilloverFiles, {
            thresholdBytes: 50,
            algorithm: "best-fit",
          })
        )
      )

      // Root files should be grouped as empty folder ""
      expect(result.placedFolders.some((f) => f.folderPath === "")).toBe(true)
      expect(result.plan.moves.filter((m) => m.status === "pending")).toHaveLength(2)
    })
  })
})
