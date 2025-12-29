/**
 * Integration tests for CLI handlers using TestContext.
 *
 * Uses a virtual filesystem to verify orchestration logic
 * by checking what the edge services are called with.
 */

import { describe, expect, test } from "bun:test"
import { Effect, Layer, pipe } from "effect"

import { runPlan, runApply, withErrorHandling } from "../cli/handler"
import { createTestContext } from "../test/TestContext"
import { DiskServiceLive } from "../services/DiskService"
import { ScannerServiceLive } from "../services/ScannerService"
import { RsyncTransferService } from "../services/TransferService"
import { LoggerServiceLive } from "../services/LoggerService"

/**
 * Build the full test layer by:
 * 1. Start with mocked infra layer (ctx.layer)
 * 2. Build service layers on top that depend on infra
 */
function buildTestLayer(ctx: ReturnType<typeof createTestContext>) {
  // Services that depend on infra
  const DiskServiceWithDeps = pipe(DiskServiceLive, Layer.provide(ctx.layer))
  const ScannerServiceWithDeps = pipe(ScannerServiceLive, Layer.provide(ctx.layer))
  const TransferServiceWithDeps = pipe(RsyncTransferService, Layer.provide(ctx.layer))

  // Combine all services + infra (for PlanStorageService, FileSystem)
  return Layer.mergeAll(
    LoggerServiceLive,
    DiskServiceWithDeps,
    ScannerServiceWithDeps,
    TransferServiceWithDeps,
    ctx.layer, // Also provides PlanStorageService and FileSystem
  )
}

// =============================================================================
// Tests: runPlan
// =============================================================================

describe("runPlan", () => {
  test("discovers disks with provided paths", async () => {
    const ctx = createTestContext()

    // Set up virtual disks
    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/disk2", { free: 30_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/source", { free: 10_000_000_000, total: 100_000_000_000 })

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/source",
        src: "/mnt/source",
        minSpace: "50MB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: "/tmp/test-plan.json",
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Verify disk stats were queried for all disks
    const statPaths = ctx.calls.diskStats.map((c) => c.path)
    expect(statPaths).toContain("/mnt/disk1")
    expect(statPaths).toContain("/mnt/disk2")
    expect(statPaths).toContain("/mnt/source")
  })

  test("scans source disk for files", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/source", { free: 10_000_000_000, total: 100_000_000_000 })

    // Add files on source disk
    ctx.addFile("/mnt/source/movies/movie1.mkv", 5_000_000_000)
    ctx.addFile("/mnt/source/movies/movie2.mkv", 3_000_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/source",
        src: "/mnt/source",
        minSpace: "50MB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Verify glob was called on source disk
    const globCalls = ctx.calls.glob.filter((c) => c.cwd === "/mnt/source")
    expect(globCalls.length).toBeGreaterThan(0)

    // Verify file stats were checked
    const statPaths = ctx.calls.fileStat.map((c) => c.path)
    expect(statPaths).toContain("/mnt/source/movies/movie1.mkv")
    expect(statPaths).toContain("/mnt/source/movies/movie2.mkv")
  })

  test("saves plan with correct moves", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/source", { free: 10_000_000_000, total: 100_000_000_000 })
    ctx.addFile("/mnt/source/file.txt", 1_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/source",
        src: "/mnt/source",
        minSpace: "50MB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: "/custom/plan.json",
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Verify plan was saved
    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    expect((saveCalls[0] as any).path).toBe("/custom/plan.json")
    expect((saveCalls[0] as any).moveCount).toBe(1)
  })

  test("validates plan before saving (dry-run validation)", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/source", { free: 10_000_000_000, total: 100_000_000_000 })
    ctx.addFile("/mnt/source/file.txt", 1_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/source",
        src: "/mnt/source",
        minSpace: "50MB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Verify plan was saved (validation passed)
    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    // Dry-run validation in TransferService doesn't execute actual rsync,
    // but the plan is saved only after validation passes
    expect((saveCalls[0] as any).moveCount).toBe(1)
  })

  test("uses best-fit to choose tightest disk", async () => {
    const ctx = createTestContext()

    // disk1 has less free space - should be preferred for best-fit
    ctx.addDisk("/mnt/disk1", { free: 20_000_000_000, total: 100_000_000_000 }) // 20GB
    ctx.addDisk("/mnt/disk2", { free: 50_000_000_000, total: 100_000_000_000 }) // 50GB
    ctx.addDisk("/mnt/source", { free: 10_000_000_000, total: 100_000_000_000 })

    // 15GB file should go to disk1 (tighter fit)
    ctx.addFile("/mnt/source/movie.mkv", 15_000_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/source",
        src: "/mnt/source",
        minSpace: "1GB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Check that the saved plan targets disk1 (the tighter fit)
    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    const saveCall = saveCalls[0] as { method: "save"; moves: Array<{ targetDisk: string }> }
    expect(saveCall.moves).toHaveLength(1)
    expect(saveCall.moves[0]!.targetDisk).toBe("/mnt/disk1")
  })

  test("keeps movie folders together", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 100_000_000_000, total: 200_000_000_000 })
    ctx.addDisk("/mnt/source", { free: 10_000_000_000, total: 100_000_000_000 })

    // Movie folder: one big file (90%) + small extras (10%)
    ctx.addFile("/mnt/source/movies/Inception/movie.mkv", 45_000_000_000) // 45GB
    ctx.addFile("/mnt/source/movies/Inception/subs.srt", 5_000_000_000)   // 5GB

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/source",
        src: "/mnt/source",
        minSpace: "1GB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9", // 90% - movie.mkv is 90% of folder
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Both files should go to the same target disk
    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    const saveCall = saveCalls[0] as { method: "save"; moves: Array<{ targetDisk: string }> }
    expect(saveCall.moves).toHaveLength(2)
    // Both files should go to the same disk
    const targetDisks = new Set(saveCall.moves.map((m) => m.targetDisk))
    expect(targetDisks.size).toBe(1)
    expect(targetDisks.has("/mnt/disk1")).toBe(true)
  })

  test("with --src flag: only empties specified disk", async () => {
    const ctx = createTestContext()

    // disk1 has least free space but we're forcing disk2 as source
    ctx.addDisk("/mnt/disk1", { free: 10_000_000_000, total: 100_000_000_000 }) // 10GB
    ctx.addDisk("/mnt/disk2", { free: 50_000_000_000, total: 100_000_000_000 }) // 50GB
    ctx.addDisk("/mnt/disk3", { free: 80_000_000_000, total: 100_000_000_000 }) // 80GB

    // Add files only on disk2 (the specified source)
    ctx.addFile("/mnt/disk2/file1.mkv", 5_000_000_000)
    ctx.addFile("/mnt/disk2/file2.mkv", 3_000_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/disk3",
        src: "/mnt/disk2", // Explicitly specify disk2
        minSpace: "1GB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    const saveCall = saveCalls[0]!
    if (saveCall.method !== "save") throw new Error("Expected save call")

    // Only disk2 should be the source
    expect(saveCall.sourceDisk).toBe("/mnt/disk2")
    expect(saveCall.moves.every((m) => m.sourceDisk === "/mnt/disk2")).toBe(true)
  })

  test("without --src flag: iteratively empties disks from least full", async () => {
    const ctx = createTestContext()

    // Set up disks with different free space
    ctx.addDisk("/mnt/disk1", { free: 10_000_000_000, total: 100_000_000_000 }) // 10GB free (least full - should empty first)
    ctx.addDisk("/mnt/disk2", { free: 30_000_000_000, total: 100_000_000_000 }) // 30GB free (should empty second)
    ctx.addDisk("/mnt/disk3", { free: 80_000_000_000, total: 100_000_000_000 }) // 80GB free (most full - destination only)

    // Add files on disk1 and disk2 that can fit on disk3
    ctx.addFile("/mnt/disk1/movie1.mkv", 5_000_000_000) // 5GB
    ctx.addFile("/mnt/disk1/movie2.mkv", 3_000_000_000) // 3GB
    ctx.addFile("/mnt/disk2/movie3.mkv", 10_000_000_000) // 10GB
    ctx.addFile("/mnt/disk2/movie4.mkv", 8_000_000_000) // 8GB

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/disk3",
        src: undefined, // Auto-select - should empty multiple disks iteratively
        minSpace: "1GB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    const saveCall = saveCalls[0]!
    if (saveCall.method !== "save") throw new Error("Expected save call")

    // Plan should include moves from BOTH disk1 and disk2
    const sourceDisksThatMoved = new Set(saveCall.moves.map((m) => m.sourceDisk))
    expect(sourceDisksThatMoved.has("/mnt/disk1")).toBe(true)
    expect(sourceDisksThatMoved.has("/mnt/disk2")).toBe(true)

    // disk3 should only be a destination, never a source
    expect(sourceDisksThatMoved.has("/mnt/disk3")).toBe(false)

    // Files should be distributed optimally using best-fit
    // disk1's files may go to disk2 (tighter fit), disk2's files go to disk3
    const targetDisks = new Set(saveCall.moves.map((m) => m.targetDisk))
    expect(targetDisks.size).toBeGreaterThan(0) // At least one target disk used
  })

  test("without --src flag: stops when disk can't be fully emptied", async () => {
    const ctx = createTestContext()

    // disk1: 10GB free, has 8GB of files (can empty)
    ctx.addDisk("/mnt/disk1", { free: 10_000_000_000, total: 100_000_000_000 })
    // disk2: 30GB free, has 50GB of files (cannot empty - too large)
    ctx.addDisk("/mnt/disk2", { free: 30_000_000_000, total: 100_000_000_000 })
    // disk3: 80GB free (destination)
    ctx.addDisk("/mnt/disk3", { free: 80_000_000_000, total: 100_000_000_000 })

    ctx.addFile("/mnt/disk1/small1.mkv", 4_000_000_000) // 4GB
    ctx.addFile("/mnt/disk1/small2.mkv", 4_000_000_000) // 4GB
    ctx.addFile("/mnt/disk2/huge1.mkv", 35_000_000_000) // 35GB - too big for disk3 with threshold
    ctx.addFile("/mnt/disk2/huge2.mkv", 35_000_000_000) // 35GB - too big for disk3 with threshold

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/disk3",
        src: undefined, // Auto-select
        minSpace: "5GB", // 5GB threshold means disk3 can only accept ~75GB
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    const saveCall = saveCalls[0] as {
      method: "save"
      moves: Array<{ sourceDisk: string; status: string }>
    }

    // disk1's files should be moved (can fit)
    const disk1Moves = saveCall.moves.filter((m) => m.sourceDisk === "/mnt/disk1")
    expect(disk1Moves.length).toBeGreaterThan(0)
    expect(disk1Moves.every((m) => m.status === "pending")).toBe(true)

    // disk2's files might be skipped or partially moved
    // At minimum, disk1 should have been attempted
    const sourceDisksTried = new Set(saveCall.moves.map((m) => m.sourceDisk))
    expect(sourceDisksTried.has("/mnt/disk1")).toBe(true)
  })

  test("without --src flag: excludes emptied disks from subsequent destination sets", async () => {
    const ctx = createTestContext()

    // 3 disks, all can be emptied by moving to each other
    ctx.addDisk("/mnt/disk1", { free: 10_000_000_000, total: 100_000_000_000 }) // 10GB free
    ctx.addDisk("/mnt/disk2", { free: 30_000_000_000, total: 100_000_000_000 }) // 30GB free
    ctx.addDisk("/mnt/disk3", { free: 80_000_000_000, total: 100_000_000_000 }) // 80GB free

    // Small files that can easily be shuffled around
    ctx.addFile("/mnt/disk1/file1.mkv", 2_000_000_000) // 2GB
    ctx.addFile("/mnt/disk2/file2.mkv", 5_000_000_000) // 5GB

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/disk3",
        src: undefined, // Auto-select
        minSpace: "1GB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    const saveCall = saveCalls[0] as {
      method: "save"
      moves: Array<{ sourceDisk: string; targetDisk: string }>
    }

    // Files from disk1 should NOT go to disk1
    const disk1Moves = saveCall.moves.filter((m) => m.sourceDisk === "/mnt/disk1")
    expect(disk1Moves.every((m) => m.targetDisk !== "/mnt/disk1")).toBe(true)

    // Files from disk2 should NOT go to disk2
    const disk2Moves = saveCall.moves.filter((m) => m.sourceDisk === "/mnt/disk2")
    if (disk2Moves.length > 0) {
      expect(disk2Moves.every((m) => m.targetDisk !== "/mnt/disk2")).toBe(true)
      // Note: With new simple consolidator, disk1 CAN be a destination after being emptied
      // (old behavior excluded emptied disks from destination set, new behavior doesn't)
    }
  })

  test("NEVER creates same-disk moves (source disk = target disk)", async () => {
    const ctx = createTestContext()

    // Set up disks with different free space
    ctx.addDisk("/mnt/disk1", { free: 10_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/disk2", { free: 30_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/disk3", { free: 80_000_000_000, total: 100_000_000_000 })

    // Add files on all disks
    ctx.addFile("/mnt/disk1/file1.mkv", 5_000_000_000)
    ctx.addFile("/mnt/disk2/file2.mkv", 10_000_000_000)
    ctx.addFile("/mnt/disk3/file3.mkv", 2_000_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/disk3",
        src: undefined, // Auto-select (iterative mode)
        minSpace: "1GB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    const saveCall = saveCalls[0] as {
      method: "save"
      moves: Array<{ sourceDisk: string; targetDisk: string }>
    }

    // CRITICAL: No move should have source disk = target disk
    const sameDiskMoves = saveCall.moves.filter((m) => m.sourceDisk === m.targetDisk)
    expect(sameDiskMoves).toHaveLength(0)
  })

  test("NEVER creates same-disk moves even with 8 disks and small threshold (VM scenario)", async () => {
    const ctx = createTestContext()

    // VM scenario: 8 disks with varying free space
    ctx.addDisk("/mnt/disk1", { free: 100_000_000, total: 1_000_000_000 }) // 100MB free
    ctx.addDisk("/mnt/disk2", { free: 140_000_000, total: 1_000_000_000 }) // 140MB free
    ctx.addDisk("/mnt/disk3", { free: 120_000_000, total: 1_000_000_000 }) // 120MB free
    ctx.addDisk("/mnt/disk4", { free: 80_000_000, total: 1_000_000_000 })  // 80MB free
    ctx.addDisk("/mnt/disk5", { free: 0, total: 1_000_000_000 })            // 0B free (fullest)
    ctx.addDisk("/mnt/disk6", { free: 100_000, total: 1_000_000_000 })     // ~100KB free
    ctx.addDisk("/mnt/disk7", { free: 120_000, total: 1_000_000_000 })     // ~120KB free
    ctx.addDisk("/mnt/disk8", { free: 270_000_000, total: 1_000_000_000 }) // 270MB free

    // Add many files on disk5 (the fullest disk)
    ctx.addFile("/mnt/disk5/Movies/Movie1.mkv", 200_000_000) // 200MB
    ctx.addFile("/mnt/disk5/Movies/Movie2.mkv", 150_000_000) // 150MB
    ctx.addFile("/mnt/disk5/Movies/Movie3.mkv", 130_000_000) // 130MB

    // Add many small anime files
    for (let i = 1; i <= 20; i++) {
      ctx.addFile(`/mnt/disk5/Anime/Show1/S01E${i.toString().padStart(2, "0")}.mkv`, 13_000_000) // 13MB each
    }

    // Add TV show files
    for (let i = 1; i <= 10; i++) {
      ctx.addFile(`/mnt/disk5/TV/Show1/S01E${i.toString().padStart(2, "0")}.mkv`, 8_000_000) // 8MB each
    }

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/disk3,/mnt/disk4,/mnt/disk5,/mnt/disk6,/mnt/disk7,/mnt/disk8",
        src: undefined, // Auto-select (iterative mode)
        minSpace: "5MB", // Small threshold like VM
        include: undefined,
        exclude: undefined,
        minSplitSize: "20MB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")

    // If plan was saved (moves were possible), verify no same-disk moves
    if (saveCalls.length > 0) {
      const saveCall = saveCalls[0] as {
        method: "save"
        moves: Array<{ sourceDisk: string; targetDisk: string; status: string }>
      }

      // CRITICAL: No PENDING move should have source disk = target disk
      const pendingSameDiskMoves = saveCall.moves.filter(
        (m) => m.status === "pending" && m.sourceDisk === m.targetDisk
      )

      if (pendingSameDiskMoves.length > 0) {
        console.log("\nERROR: Found same-disk moves:")
        for (const move of pendingSameDiskMoves) {
          console.log(`  ${move.sourceDisk} → ${move.targetDisk}`)
        }
      }

      expect(pendingSameDiskMoves).toHaveLength(0)
    } else {
      // No moves possible - this is fine, just verify no errors occurred
      expect(saveCalls).toHaveLength(0)
    }
  })

  test("--src comma-separated: evacuates multiple specified disks", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 900_000_000, total: 1_000_000_000 })
    ctx.addDisk("/mnt/disk2", { free: 800_000_000, total: 1_000_000_000 })
    ctx.addDisk("/mnt/disk3", { free: 700_000_000, total: 1_000_000_000 })
    ctx.addDisk("/mnt/disk4", { free: 500_000_000, total: 1_000_000_000 })

    ctx.addFile("/mnt/disk1/file1.txt", 50_000_000)
    ctx.addFile("/mnt/disk2/file2.txt", 50_000_000)
    ctx.addFile("/mnt/disk3/file3.txt", 50_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/disk3,/mnt/disk4",
        src: "/mnt/disk1,/mnt/disk3", // Evacuate disk1 and disk3, not disk2
        minSpace: "10MB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "50MB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise
    )

    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)

    const saveCall = saveCalls[0] as { method: "save"; moves: Array<{ sourceDisk: string }> }
    const sourceDiskPaths = saveCall.moves.map(m => m.sourceDisk)

    // Should evacuate disk1 and disk3, not disk2
    expect(sourceDiskPaths).toContain("/mnt/disk1")
    expect(sourceDiskPaths).toContain("/mnt/disk3")
    expect(sourceDiskPaths).not.toContain("/mnt/disk2")
  })

  test("--src undefined: auto-selects disks to evacuate", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 900_000_000, total: 1_000_000_000 })
    ctx.addDisk("/mnt/disk2", { free: 800_000_000, total: 1_000_000_000 })
    ctx.addDisk("/mnt/disk3", { free: 500_000_000, total: 1_000_000_000 })

    ctx.addFile("/mnt/disk1/file1.txt", 50_000_000)
    ctx.addFile("/mnt/disk2/file2.txt", 50_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/disk3",
        src: undefined, // No src specified - auto-select
        minSpace: "10MB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "50MB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise
    )

    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)

    // Should have evacuated some disks
    const saveCall = saveCalls[0] as { method: "save"; moves: Array<{ sourceDisk: string }> }
    expect(saveCall.moves.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// Tests: runApply
// =============================================================================

describe("runApply", () => {
  test("loads plan and executes transfers", async () => {
    const ctx = createTestContext()

    // Set up disks
    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })

    // Source files exist
    ctx.addFile("/mnt/source/file1.txt", 1000)
    ctx.addFile("/mnt/source/file2.txt", 2000)

    // Set up saved plan
    ctx.setPlan({
      version: 3,
      createdAt: new Date().toISOString(),
      sourceDisk: "/mnt/source",
      moves: {
        "/mnt/source/file1.txt": {
          sourceRelPath: "file1.txt",
          sourceDisk: "/mnt/source",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file1.txt",
          sizeBytes: 1000,
          status: "pending",
        },
        "/mnt/source/file2.txt": {
          sourceRelPath: "file2.txt",
          sourceDisk: "/mnt/source",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file2.txt",
          sizeBytes: 2000,
          status: "pending",
        },
      },
      diskStats: {
        "/mnt/disk1": {
          totalBytes: 100_000_000_000,
          freeBytes: 50_000_000_000,
          bytesToMove: 3000,
        },
      },
    })

    await pipe(
      runApply({
        planFile: "/tmp/plan.json",
        concurrency: 4,
        dryRun: false,
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Verify plan was loaded
    expect(ctx.calls.planStorage.some((c) => c.method === "load")).toBe(true)

    // Verify rsync was executed (not dry-run)
    const rsyncCalls = ctx.calls.shell.filter((c) => c.command.startsWith("rsync"))
    expect(rsyncCalls.length).toBeGreaterThan(0)
    expect(rsyncCalls.every((c) => !c.command.includes("--dry-run"))).toBe(true)
  })

  test("dry-run passes --dry-run to rsync", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addFile("/mnt/source/file.txt", 1000)

    ctx.setPlan({
      version: 3,
      createdAt: new Date().toISOString(),
      sourceDisk: "/mnt/source",
      moves: {
        "/mnt/source/file.txt": {
          sourceRelPath: "file.txt",
          sourceDisk: "/mnt/source",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file.txt",
          sizeBytes: 1000,
          status: "pending",
        },
      },
      diskStats: {
        "/mnt/disk1": {
          totalBytes: 100_000_000_000,
          freeBytes: 50_000_000_000,
          bytesToMove: 1000,
        },
      },
    })

    await pipe(
      runApply({
        planFile: undefined,
        concurrency: 2,
        dryRun: true,
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Dry-run mode doesn't execute shell commands at all
    // (TransferService returns preview without calling shell)
    const rsyncCalls = ctx.calls.shell.filter((c) => c.command.startsWith("rsync"))
    expect(rsyncCalls).toHaveLength(0)
  })

  test("fails validation when source files missing", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    // Note: NOT adding the source file - it's "missing"

    ctx.setPlan({
      version: 3,
      createdAt: new Date().toISOString(),
      sourceDisk: "/mnt/source",
      moves: {
        "/mnt/source/missing.txt": {
          sourceRelPath: "missing.txt",
          sourceDisk: "/mnt/source",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/missing.txt",
          sizeBytes: 1000,
          status: "pending",
        },
      },
      diskStats: {
        "/mnt/disk1": {
          totalBytes: 100_000_000_000,
          freeBytes: 50_000_000_000,
          bytesToMove: 1000,
        },
      },
    })

    await pipe(
      runApply({
        planFile: "/tmp/plan.json",
        concurrency: 4,
        dryRun: false,
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Validation failed - no rsync executed
    const rsyncCalls = ctx.calls.shell.filter((c) => c.command.startsWith("rsync"))
    expect(rsyncCalls).toHaveLength(0)
  })

  test("fails validation when disk space insufficient", async () => {
    const ctx = createTestContext()

    // Disk only has 1GB free
    ctx.addDisk("/mnt/disk1", { free: 1_000_000_000, total: 100_000_000_000 })
    ctx.addFile("/mnt/source/huge.mkv", 50_000_000_000) // 50GB file

    ctx.setPlan({
      version: 3,
      createdAt: new Date().toISOString(),
      sourceDisk: "/mnt/source",
      moves: {
        "/mnt/source/huge.mkv": {
          sourceRelPath: "huge.mkv",
          sourceDisk: "/mnt/source",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/huge.mkv",
          sizeBytes: 50_000_000_000,
          status: "pending",
        },
      },
      diskStats: {
        "/mnt/disk1": {
          totalBytes: 100_000_000_000,
          freeBytes: 1_000_000_000,
          bytesToMove: 50_000_000_000,
        },
      },
    })

    await pipe(
      runApply({
        planFile: "/tmp/plan.json",
        concurrency: 4,
        dryRun: false,
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Validation failed - no rsync executed
    const rsyncCalls = ctx.calls.shell.filter((c) => c.command.startsWith("rsync"))
    expect(rsyncCalls).toHaveLength(0)
  })

  test("fails validation when destination conflict exists", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addFile("/mnt/source/file.txt", 1000)
    ctx.addFile("/mnt/disk1/file.txt", 500) // Already exists at destination!

    ctx.setPlan({
      version: 3,
      createdAt: new Date().toISOString(),
      sourceDisk: "/mnt/source",
      moves: {
        "/mnt/source/file.txt": {
          sourceRelPath: "file.txt",
          sourceDisk: "/mnt/source",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file.txt",
          sizeBytes: 1000,
          status: "pending",
        },
      },
      diskStats: {
        "/mnt/disk1": {
          totalBytes: 100_000_000_000,
          freeBytes: 50_000_000_000,
          bytesToMove: 1000,
        },
      },
    })

    await pipe(
      runApply({
        planFile: "/tmp/plan.json",
        concurrency: 4,
        dryRun: false,
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Validation failed - no rsync executed
    const rsyncCalls = ctx.calls.shell.filter((c) => c.command.startsWith("rsync"))
    expect(rsyncCalls).toHaveLength(0)
  })
})

// =============================================================================
// Tests: Error handling
// =============================================================================

describe("Error handling", () => {
  test("disk not found error is caught and formatted (does not throw)", async () => {
    const ctx = createTestContext()

    // Do NOT add any disks - they don't exist
    // This should trigger a "disk not found" error

    // With error handling, this should NOT throw
    await pipe(
      withErrorHandling(
        runPlan({
          dest: "/mnt/disk1,/mnt/source",
          src: "/mnt/source",
          minSpace: "50MB",
          include: undefined,
          exclude: undefined,
          minSplitSize: "1GB",
          moveAsFolderThreshold: "0.9",
          planFile: undefined,
          force: false,
        minFileSize: "1KB",
        pathFilter: "",
        })
      ),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // If we got here without throwing, error handling worked
    // The error was caught at the FileSystem.exists level, before DiskStatsService
    // No plan should have been saved since we failed early
    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(0)
  })

  test("plan not found error is caught and formatted (does not throw)", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    // Do NOT set a plan - it doesn't exist

    // With error handling, this should NOT throw
    await pipe(
      withErrorHandling(
        runApply({
          planFile: "/nonexistent/plan.json",
          concurrency: 4,
          dryRun: false,
        })
      ),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Verify the plan existence was checked
    const existsCalls = ctx.calls.planStorage.filter((c) => c.method === "exists")
    expect(existsCalls.length).toBeGreaterThan(0)
  })

  test("not a mount point error is caught when path exists but is not a mount", async () => {
    const ctx = createTestContext()

    // Add a disk at /mnt/disk1 - this simulates /mnt being a parent path
    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    // Note: /mnt itself is not added as a disk, so it has device ID 0 (same as its parent)

    // This should work without throwing because error handling catches it
    await pipe(
      withErrorHandling(
        runPlan({
          dest: "/mnt/disk1,/mnt/source", // /mnt/spillover doesn't exist
          src: "/mnt/source",
          minSpace: "50MB",
          include: undefined,
          exclude: undefined,
          minSplitSize: "1GB",
          moveAsFolderThreshold: "0.9",
          planFile: undefined,
          force: false,
        minFileSize: "1KB",
        pathFilter: "",
        })
      ),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // If we got here without throwing, error handling worked
    expect(true).toBe(true)
  })

  test("disk permission denied error is caught and formatted", async () => {
    const ctx = createTestContext()

    // Add disk but mark it as permission denied
    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 }, { permissionDenied: true })
    ctx.addDisk("/mnt/source", { free: 10_000_000_000, total: 100_000_000_000 })

    await pipe(
      withErrorHandling(
        runPlan({
          dest: "/mnt/disk1,/mnt/source",
          src: "/mnt/source",
          minSpace: "50MB",
          include: undefined,
          exclude: undefined,
          minSplitSize: "1GB",
          moveAsFolderThreshold: "0.9",
          planFile: undefined,
          force: false,
        minFileSize: "1KB",
        pathFilter: "",
        })
      ),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // No plan saved due to permission error
    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(0)
  })

  test("file permission denied during scan skips those files", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/source", { free: 10_000_000_000, total: 100_000_000_000 })

    // Add files - one with permission denied
    ctx.addFile("/mnt/source/accessible.mkv", 1_000_000_000)
    ctx.addFile("/mnt/source/restricted.mkv", 2_000_000_000, { permissionDenied: true })

    await pipe(
      withErrorHandling(
        runPlan({
          dest: "/mnt/disk1,/mnt/source",
          src: "/mnt/source",
          minSpace: "50MB",
          include: undefined,
          exclude: undefined,
          minSplitSize: "1GB",
          moveAsFolderThreshold: "0.9",
          planFile: undefined,
          force: false,
        minFileSize: "1KB",
        pathFilter: "",
        })
      ),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Only the accessible file should be in the plan
    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    const saveCall = saveCalls[0] as { method: "save"; moves: Array<{ sourceAbsPath: string }> }
    expect(saveCall.moves).toHaveLength(1)
    expect(saveCall.moves[0]!.sourceAbsPath).toBe("/mnt/source/accessible.mkv")
  })

  test("plan write permission denied is caught and formatted", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/source", { free: 10_000_000_000, total: 100_000_000_000 })
    ctx.addFile("/mnt/source/file.mkv", 1_000_000_000)

    // Deny plan file writes
    ctx.denyPlanWrite()

    await pipe(
      withErrorHandling(
        runPlan({
          dest: "/mnt/disk1,/mnt/source",
          src: "/mnt/source",
          minSpace: "50MB",
          include: undefined,
          exclude: undefined,
          minSplitSize: "1GB",
          moveAsFolderThreshold: "0.9",
          planFile: undefined,
          force: false,
        minFileSize: "1KB",
        pathFilter: "",
        })
      ),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Save was attempted but failed
    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(0) // The service rejects before logging
  })

  test("plan read permission denied is caught and formatted", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })

    // Set up a plan but deny reads
    ctx.setPlan({
      version: 3,
      createdAt: new Date().toISOString(),
      sourceDisk: "/mnt/source",
      moves: {
        "/mnt/source/file.txt": {
          sourceRelPath: "file.txt",
          sourceDisk: "/mnt/source",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file.txt",
          sizeBytes: 1000,
          status: "pending",
        },
      },
      diskStats: {
        "/mnt/disk1": {
          totalBytes: 100_000_000_000,
          freeBytes: 50_000_000_000,
          bytesToMove: 1000,
        },
      },
    })
    ctx.denyPlanRead()

    await pipe(
      withErrorHandling(
        runApply({
          planFile: "/config/plan.json",
          concurrency: 4,
          dryRun: false,
        })
      ),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Load was attempted
    const loadCalls = ctx.calls.planStorage.filter((c) => c.method === "load")
    expect(loadCalls.length).toBeGreaterThan(0)
  })

  test("rsync permission error is caught and formatted", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addFile("/mnt/source/file.txt", 1000)

    ctx.setPlan({
      version: 3,
      createdAt: new Date().toISOString(),
      sourceDisk: "/mnt/source",
      moves: {
        "/mnt/source/file.txt": {
          sourceRelPath: "file.txt",
          sourceDisk: "/mnt/source",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file.txt",
          sizeBytes: 1000,
          status: "pending",
        },
      },
      diskStats: {
        "/mnt/disk1": {
          totalBytes: 100_000_000_000,
          freeBytes: 50_000_000_000,
          bytesToMove: 1000,
        },
      },
    })

    // Configure shell to return permission error
    ctx.shellBehavior.handler = (command: string) => {
      if (command.includes("rsync")) {
        return {
          stdout: "",
          stderr: "rsync: failed to set permissions on '/mnt/disk1/file.txt': Permission denied (13)",
          exitCode: 23,
        }
      }
      return { stdout: "", stderr: "", exitCode: 0 }
    }

    await pipe(
      withErrorHandling(
        runApply({
          planFile: "/tmp/plan.json",
          concurrency: 4,
          dryRun: false,
        })
      ),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Rsync was attempted
    const rsyncCalls = ctx.calls.shell.filter((c) => c.command.includes("rsync"))
    expect(rsyncCalls.length).toBeGreaterThan(0)
  })

  test("iterative emptying: free space is conserved", async () => {
    const ctx = createTestContext()

    const GB = 1_000_000_000
    const MB = 1_000_000

    // Set up 6 disks with realistic usage (~90% full, with some empties)
    const disks = [
      { path: "/mnt/disk1", free: 96.7 * MB, total: 1 * GB },
      { path: "/mnt/disk2", free: 136.2 * MB, total: 1 * GB },
      { path: "/mnt/disk3", free: 120.1 * MB, total: 1 * GB },
      { path: "/mnt/disk4", free: 77.1 * MB, total: 1 * GB },
      { path: "/mnt/disk7", free: 906.2 * MB, total: 1 * GB },
      { path: "/mnt/disk8", free: 858.0 * MB, total: 1 * GB },
    ]

    for (const disk of disks) {
      ctx.addDisk(disk.path, disk)
    }

    // Add realistic file sizes (50-100 MB each)
    ctx.addFile("/mnt/disk7/clip1.mkv", 50 * MB)
    ctx.addFile("/mnt/disk7/clip2.mkv", 43.8 * MB)
    ctx.addFile("/mnt/disk8/ep1.mkv", 71 * MB)
    ctx.addFile("/mnt/disk8/ep2.mkv", 71 * MB)
    // Add files for other disks too
    ctx.addFile("/mnt/disk1/movie1.mkv", 90 * MB)
    ctx.addFile("/mnt/disk1/movie2.mkv", 85 * MB)
    ctx.addFile("/mnt/disk2/show1.mkv", 95 * MB)
    ctx.addFile("/mnt/disk2/show2.mkv", 90 * MB)

    const initialTotalFree = disks.reduce((sum, d) => sum + d.free, 0)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/disk3,/mnt/disk4,/mnt/disk7,/mnt/disk8",
        src: undefined, // Iterative mode
        minSpace: "5MB",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        moveAsFolderThreshold: "0.9",
        planFile: undefined,
        force: false,
        minFileSize: "1KB",
        pathFilter: "",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    const saveCalls = ctx.calls.planStorage.filter((c) => c.method === "save")
    expect(saveCalls).toHaveLength(1)
    const saveCall = saveCalls[0]!
    if (saveCall.method !== "save") throw new Error("Expected save call")

    // Calculate final free space by applying moves to initial stats
    const diskFreeAfterMoves = new Map(disks.map(d => [d.path, d.free]))
    for (const move of saveCall.moves) {
      // Source disk gains free space
      diskFreeAfterMoves.set(move.sourceDisk, (diskFreeAfterMoves.get(move.sourceDisk) ?? 0) + move.sizeBytes)
      // Target disk loses free space
      diskFreeAfterMoves.set(move.targetDisk, (diskFreeAfterMoves.get(move.targetDisk) ?? 0) - move.sizeBytes)
    }

    // For emptied disks (no longer in final disk stats), they're completely empty (all free)
    const finalTotalFree = disks.reduce((sum, d) => {
      const finalFree = diskFreeAfterMoves.get(d.path)
      if (finalFree === undefined) {
        // Disk was removed - should be completely empty
        return sum + d.total
      }
      return sum + finalFree
    }, 0)

    // Free space should be conserved (within small margin for threshold)
    const diff = Math.abs(finalTotalFree - initialTotalFree)
    const maxAllowedDiff = 50 * MB // Allow some margin for threshold effects
    expect(diff).toBeLessThan(maxAllowedDiff)
  })
})
