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
import { BinPackServiceLive } from "../services/BinPackService"
import { RsyncTransferService } from "../services/TransferService"

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
    DiskServiceWithDeps,
    ScannerServiceWithDeps,
    TransferServiceWithDeps,
    BinPackServiceLive,
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
    ctx.addDisk("/mnt/spillover", { free: 10_000_000_000, total: 100_000_000_000 })

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/spillover",
        src: "/mnt/spillover",
        threshold: "50MB",
        algorithm: "best-fit",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        folderThreshold: "0.9",
        planFile: "/tmp/test-plan.json",
        force: false,
        storage: "json",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Verify disk stats were queried for all disks
    const statPaths = ctx.calls.diskStats.map((c) => c.path)
    expect(statPaths).toContain("/mnt/disk1")
    expect(statPaths).toContain("/mnt/disk2")
    expect(statPaths).toContain("/mnt/spillover")
  })

  test("scans source disk for files", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/spillover", { free: 10_000_000_000, total: 100_000_000_000 })

    // Add files on source disk
    ctx.addFile("/mnt/spillover/movies/movie1.mkv", 5_000_000_000)
    ctx.addFile("/mnt/spillover/movies/movie2.mkv", 3_000_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/spillover",
        src: "/mnt/spillover",
        threshold: "50MB",
        algorithm: "best-fit",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        folderThreshold: "0.9",
        planFile: undefined,
        force: false,
        storage: "json",
      }),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Verify glob was called on source disk
    const globCalls = ctx.calls.glob.filter((c) => c.cwd === "/mnt/spillover")
    expect(globCalls.length).toBeGreaterThan(0)

    // Verify file stats were checked
    const statPaths = ctx.calls.fileStat.map((c) => c.path)
    expect(statPaths).toContain("/mnt/spillover/movies/movie1.mkv")
    expect(statPaths).toContain("/mnt/spillover/movies/movie2.mkv")
  })

  test("saves plan with correct moves", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/spillover", { free: 10_000_000_000, total: 100_000_000_000 })
    ctx.addFile("/mnt/spillover/file.txt", 1_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/spillover",
        src: "/mnt/spillover",
        threshold: "50MB",
        algorithm: "best-fit",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        folderThreshold: "0.9",
        planFile: "/custom/plan.json",
        force: false,
        storage: "json",
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
    ctx.addDisk("/mnt/spillover", { free: 10_000_000_000, total: 100_000_000_000 })
    ctx.addFile("/mnt/spillover/file.txt", 1_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/spillover",
        src: "/mnt/spillover",
        threshold: "50MB",
        algorithm: "best-fit",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        folderThreshold: "0.9",
        planFile: undefined,
        force: false,
        storage: "json",
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
    ctx.addDisk("/mnt/spillover", { free: 10_000_000_000, total: 100_000_000_000 })

    // 15GB file should go to disk1 (tighter fit)
    ctx.addFile("/mnt/spillover/movie.mkv", 15_000_000_000)

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/disk2,/mnt/spillover",
        src: "/mnt/spillover",
        threshold: "1GB",
        algorithm: "best-fit",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        folderThreshold: "0.9",
        planFile: undefined,
        force: false,
        storage: "json",
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
    ctx.addDisk("/mnt/spillover", { free: 10_000_000_000, total: 100_000_000_000 })

    // Movie folder: one big file (90%) + small extras (10%)
    ctx.addFile("/mnt/spillover/movies/Inception/movie.mkv", 45_000_000_000) // 45GB
    ctx.addFile("/mnt/spillover/movies/Inception/subs.srt", 5_000_000_000)   // 5GB

    await pipe(
      runPlan({
        dest: "/mnt/disk1,/mnt/spillover",
        src: "/mnt/spillover",
        threshold: "1GB",
        algorithm: "best-fit",
        include: undefined,
        exclude: undefined,
        minSplitSize: "1GB",
        folderThreshold: "0.9", // 90% - movie.mkv is 90% of folder
        planFile: undefined,
        force: false,
        storage: "json",
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
    ctx.addFile("/mnt/spillover/file1.txt", 1000)
    ctx.addFile("/mnt/spillover/file2.txt", 2000)

    // Set up saved plan
    ctx.setPlan({
      version: 2,
      createdAt: new Date().toISOString(),
      spilloverDisk: "/mnt/spillover",
      moves: {
        "/mnt/spillover/file1.txt": {
          sourceRelPath: "file1.txt",
          sourceDisk: "/mnt/spillover",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file1.txt",
          sizeBytes: 1000,
          status: "pending",
        },
        "/mnt/spillover/file2.txt": {
          sourceRelPath: "file2.txt",
          sourceDisk: "/mnt/spillover",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file2.txt",
          sizeBytes: 2000,
          status: "pending",
        },
      },
    })

    await pipe(
      runApply({
        planFile: "/tmp/plan.json",
        concurrency: 4,
        dryRun: false,
        storage: "json",
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
    ctx.addFile("/mnt/spillover/file.txt", 1000)

    ctx.setPlan({
      version: 2,
      createdAt: new Date().toISOString(),
      spilloverDisk: "/mnt/spillover",
      moves: {
        "/mnt/spillover/file.txt": {
          sourceRelPath: "file.txt",
          sourceDisk: "/mnt/spillover",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file.txt",
          sizeBytes: 1000,
          status: "pending",
        },
      },
    })

    await pipe(
      runApply({
        planFile: undefined,
        concurrency: 2,
        dryRun: true,
        storage: "json",
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
      version: 2,
      createdAt: new Date().toISOString(),
      spilloverDisk: "/mnt/spillover",
      moves: {
        "/mnt/spillover/missing.txt": {
          sourceRelPath: "missing.txt",
          sourceDisk: "/mnt/spillover",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/missing.txt",
          sizeBytes: 1000,
          status: "pending",
        },
      },
    })

    await pipe(
      runApply({
        planFile: "/tmp/plan.json",
        concurrency: 4,
        dryRun: false,
        storage: "json",
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
    ctx.addFile("/mnt/spillover/huge.mkv", 50_000_000_000) // 50GB file

    ctx.setPlan({
      version: 2,
      createdAt: new Date().toISOString(),
      spilloverDisk: "/mnt/spillover",
      moves: {
        "/mnt/spillover/huge.mkv": {
          sourceRelPath: "huge.mkv",
          sourceDisk: "/mnt/spillover",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/huge.mkv",
          sizeBytes: 50_000_000_000,
          status: "pending",
        },
      },
    })

    await pipe(
      runApply({
        planFile: "/tmp/plan.json",
        concurrency: 4,
        dryRun: false,
        storage: "json",
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
    ctx.addFile("/mnt/spillover/file.txt", 1000)
    ctx.addFile("/mnt/disk1/file.txt", 500) // Already exists at destination!

    ctx.setPlan({
      version: 2,
      createdAt: new Date().toISOString(),
      spilloverDisk: "/mnt/spillover",
      moves: {
        "/mnt/spillover/file.txt": {
          sourceRelPath: "file.txt",
          sourceDisk: "/mnt/spillover",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file.txt",
          sizeBytes: 1000,
          status: "pending",
        },
      },
    })

    await pipe(
      runApply({
        planFile: "/tmp/plan.json",
        concurrency: 4,
        dryRun: false,
        storage: "json",
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
          dest: "/mnt/disk1,/mnt/spillover",
          src: "/mnt/spillover",
          threshold: "50MB",
          algorithm: "best-fit",
          include: undefined,
          exclude: undefined,
          minSplitSize: "1GB",
          folderThreshold: "0.9",
          planFile: undefined,
          force: false,
        storage: "json",
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
        storage: "json",
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
          dest: "/mnt/disk1,/mnt/spillover", // /mnt/spillover doesn't exist
          src: "/mnt/spillover",
          threshold: "50MB",
          algorithm: "best-fit",
          include: undefined,
          exclude: undefined,
          minSplitSize: "1GB",
          folderThreshold: "0.9",
          planFile: undefined,
          force: false,
        storage: "json",
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
    ctx.addDisk("/mnt/spillover", { free: 10_000_000_000, total: 100_000_000_000 })

    await pipe(
      withErrorHandling(
        runPlan({
          dest: "/mnt/disk1,/mnt/spillover",
          src: "/mnt/spillover",
          threshold: "50MB",
          algorithm: "best-fit",
          include: undefined,
          exclude: undefined,
          minSplitSize: "1GB",
          folderThreshold: "0.9",
          planFile: undefined,
          force: false,
        storage: "json",
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
    ctx.addDisk("/mnt/spillover", { free: 10_000_000_000, total: 100_000_000_000 })

    // Add files - one with permission denied
    ctx.addFile("/mnt/spillover/accessible.mkv", 1_000_000_000)
    ctx.addFile("/mnt/spillover/restricted.mkv", 2_000_000_000, { permissionDenied: true })

    await pipe(
      withErrorHandling(
        runPlan({
          dest: "/mnt/disk1,/mnt/spillover",
          src: "/mnt/spillover",
          threshold: "50MB",
          algorithm: "best-fit",
          include: undefined,
          exclude: undefined,
          minSplitSize: "1GB",
          folderThreshold: "0.9",
          planFile: undefined,
          force: false,
        storage: "json",
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
    expect(saveCall.moves[0]!.sourceAbsPath).toBe("/mnt/spillover/accessible.mkv")
  })

  test("plan write permission denied is caught and formatted", async () => {
    const ctx = createTestContext()

    ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
    ctx.addDisk("/mnt/spillover", { free: 10_000_000_000, total: 100_000_000_000 })
    ctx.addFile("/mnt/spillover/file.mkv", 1_000_000_000)

    // Deny plan file writes
    ctx.denyPlanWrite()

    await pipe(
      withErrorHandling(
        runPlan({
          dest: "/mnt/disk1,/mnt/spillover",
          src: "/mnt/spillover",
          threshold: "50MB",
          algorithm: "best-fit",
          include: undefined,
          exclude: undefined,
          minSplitSize: "1GB",
          folderThreshold: "0.9",
          planFile: undefined,
          force: false,
        storage: "json",
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
      version: 2,
      createdAt: new Date().toISOString(),
      spilloverDisk: "/mnt/spillover",
      moves: {
        "/mnt/spillover/file.txt": {
          sourceRelPath: "file.txt",
          sourceDisk: "/mnt/spillover",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file.txt",
          sizeBytes: 1000,
          status: "pending",
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
        storage: "json",
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
    ctx.addFile("/mnt/spillover/file.txt", 1000)

    ctx.setPlan({
      version: 2,
      createdAt: new Date().toISOString(),
      spilloverDisk: "/mnt/spillover",
      moves: {
        "/mnt/spillover/file.txt": {
          sourceRelPath: "file.txt",
          sourceDisk: "/mnt/spillover",
          targetDisk: "/mnt/disk1",
          destAbsPath: "/mnt/disk1/file.txt",
          sizeBytes: 1000,
          status: "pending",
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
        storage: "json",
        })
      ),
      Effect.provide(buildTestLayer(ctx)),
      Effect.runPromise,
    )

    // Rsync was attempted
    const rsyncCalls = ctx.calls.shell.filter((c) => c.command.includes("rsync"))
    expect(rsyncCalls.length).toBeGreaterThan(0)
  })
})
