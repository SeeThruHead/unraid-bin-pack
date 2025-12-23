/**
 * Integration tests for infra services using real IO.
 *
 * These tests verify that:
 * 1. Real IO operations produce errors with predictable structure
 * 2. Our error detection logic works with actual error formats
 * 3. Mocks can be trusted to match real behavior
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { Effect, Layer, pipe } from "effect"
import { BunContext } from "@effect/platform-bun"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { GlobServiceTag, GlobServiceLive, type GlobError } from "./GlobService"
import { FileStatServiceTag, FileStatServiceLive, type FileStatError } from "./FileStatService"
import { DiskStatsServiceTag, DiskStatsServiceLive } from "./DiskStatsService"
import { PlanStorageServiceTag, JsonPlanStorageService, type PlanStorageError } from "./PlanStorageService"
import { createMovePlan } from "../domain/MovePlan"

// =============================================================================
// Test fixtures
// =============================================================================

let testDir: string

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "infra-test-"))

  // Create test files
  await mkdir(join(testDir, "subdir"))
  await writeFile(join(testDir, "file1.txt"), "hello")
  await writeFile(join(testDir, "file2.txt"), "world")
  await writeFile(join(testDir, "subdir", "nested.txt"), "nested")
})

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true })
})

// =============================================================================
// GlobService integration tests
// =============================================================================

describe("GlobService (real IO)", () => {
  const service = pipe(GlobServiceLive)

  test("scan finds files in directory", async () => {
    const result = await pipe(
      GlobServiceTag,
      Effect.flatMap((svc) => svc.scan("**/*", testDir, { onlyFiles: true })),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(result).toContain("file1.txt")
    expect(result).toContain("file2.txt")
    expect(result).toContain("subdir/nested.txt")
  })

  test("scan with pattern filter", async () => {
    const result = await pipe(
      GlobServiceTag,
      Effect.flatMap((svc) => svc.scan("*.txt", testDir, { onlyFiles: true })),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(result).toContain("file1.txt")
    expect(result).toContain("file2.txt")
    expect(result).not.toContain("subdir/nested.txt")
  })

  test("scan on non-existent path returns GlobNotFound error", async () => {
    const result = await pipe(
      GlobServiceTag,
      Effect.flatMap((svc) => svc.scan("**/*", "/nonexistent/path/xyz", { onlyFiles: true })),
      Effect.provide(service),
      Effect.either,
      Effect.runPromise
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      const error = result.left as GlobError
      expect(error._tag).toBe("GlobNotFound")
      if (error._tag === "GlobNotFound") {
        expect(error.path).toBe("/nonexistent/path/xyz")
      }
    }
  })
})

// =============================================================================
// FileStatService integration tests
// =============================================================================

describe("FileStatService (real IO)", () => {
  const service = pipe(FileStatServiceLive, Layer.provide(BunContext.layer))

  test("stat returns size for existing file", async () => {
    const result = await pipe(
      FileStatServiceTag,
      Effect.flatMap((svc) => svc.stat(join(testDir, "file1.txt"))),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(result.size).toBe(5) // "hello" is 5 bytes
  })

  test("stat on non-existent file returns FileNotFound error", async () => {
    const result = await pipe(
      FileStatServiceTag,
      Effect.flatMap((svc) => svc.stat(join(testDir, "nonexistent.txt"))),
      Effect.provide(service),
      Effect.either,
      Effect.runPromise
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      const error = result.left as FileStatError
      expect(error._tag).toBe("FileNotFound")
    }
  })
})

// =============================================================================
// DiskStatsService integration tests
// =============================================================================

describe("DiskStatsService (real IO)", () => {
  const service = DiskStatsServiceLive

  test("getStats returns stats for root", async () => {
    const result = await pipe(
      DiskStatsServiceTag,
      Effect.flatMap((svc) => svc.getStats("/")),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(result.free).toBeGreaterThan(0)
    expect(result.size).toBeGreaterThan(0)
    expect(result.free).toBeLessThanOrEqual(result.size)
  })

  test("getStats returns stats even for non-existent paths (finds parent mount)", async () => {
    // check-disk-space finds the parent mount point, so this doesn't fail
    const result = await pipe(
      DiskStatsServiceTag,
      Effect.flatMap((svc) => svc.getStats("/nonexistent/path/xyz")),
      Effect.provide(service),
      Effect.runPromise
    )

    // Should return stats from root mount
    expect(result.free).toBeGreaterThan(0)
    expect(result.size).toBeGreaterThan(0)
  })
})

// =============================================================================
// PlanStorageService integration tests
// =============================================================================

describe("PlanStorageService (real IO)", () => {
  const service = pipe(JsonPlanStorageService, Layer.provide(BunContext.layer))

  test("save and load round-trip", async () => {
    const planPath = join(testDir, "test-plan.json")
    const testPlan = createMovePlan([
      {
        file: {
          absolutePath: "/mnt/spillover/file.mkv",
          relativePath: "file.mkv",
          sizeBytes: 1000,
          diskPath: "/mnt/spillover",
        },
        targetDiskPath: "/mnt/disk1",
        destinationPath: "/mnt/disk1/file.mkv",
        status: "pending" as const,
      },
    ])

    // Save
    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(testPlan, "/mnt/spillover", planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    // Load
    const loaded = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.load(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(loaded.version).toBe(2)
    expect(loaded.spilloverDisk).toBe("/mnt/spillover")
    expect(Object.keys(loaded.moves)).toHaveLength(1)
  })

  test("load non-existent file returns PlanStorageError", async () => {
    const result = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.load(join(testDir, "nonexistent-plan.json"))),
      Effect.provide(service),
      Effect.either,
      Effect.runPromise
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      const error = result.left as PlanStorageError
      // Should be PlanNotFound (typed error)
      expect(error._tag).toBe("PlanNotFound")
    }
  })

  test("exists returns false for non-existent file", async () => {
    const result = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.exists(join(testDir, "nonexistent-plan.json"))),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(result).toBe(false)
  })

  test("exists returns true for existing file", async () => {
    const planPath = join(testDir, "exists-test-plan.json")

    // Create file first
    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(createMovePlan([]), "/mnt/spillover", planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    const result = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.exists(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(result).toBe(true)
  })

  test("updateMoveStatus updates move and persists to file", async () => {
    const planPath = join(testDir, "update-status-test.json")
    const sourceAbsPath = "/mnt/spillover/file.mkv"
    const testPlan = createMovePlan([
      {
        file: {
          absolutePath: sourceAbsPath,
          relativePath: "file.mkv",
          sizeBytes: 1000,
          diskPath: "/mnt/spillover",
        },
        targetDiskPath: "/mnt/disk1",
        destinationPath: "/mnt/disk1/file.mkv",
        status: "pending" as const,
      },
    ])

    // Save initial plan
    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(testPlan, "/mnt/spillover", planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    // Update move status to completed
    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.updateMoveStatus(planPath, sourceAbsPath, "completed")),
      Effect.provide(service),
      Effect.runPromise
    )

    // Reload and verify
    const loaded = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.load(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(loaded.moves[sourceAbsPath]?.status).toBe("completed")
  })

  test("updateMoveStatus records error for failed moves", async () => {
    const planPath = join(testDir, "update-failed-test.json")
    const sourceAbsPath = "/mnt/spillover/file.mkv"
    const testPlan = createMovePlan([
      {
        file: {
          absolutePath: sourceAbsPath,
          relativePath: "file.mkv",
          sizeBytes: 1000,
          diskPath: "/mnt/spillover",
        },
        targetDiskPath: "/mnt/disk1",
        destinationPath: "/mnt/disk1/file.mkv",
        status: "pending" as const,
      },
    ])

    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(testPlan, "/mnt/spillover", planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.updateMoveStatus(planPath, sourceAbsPath, "failed", "disk full")),
      Effect.provide(service),
      Effect.runPromise
    )

    const loaded = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.load(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(loaded.moves[sourceAbsPath]?.status).toBe("failed")
    expect(loaded.moves[sourceAbsPath]?.reason).toBe("disk full")
  })

  test("delete removes plan file", async () => {
    const planPath = join(testDir, "delete-test.json")

    // Create file
    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(createMovePlan([]), "/mnt/spillover", planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    // Verify it exists
    const existsBefore = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.exists(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )
    expect(existsBefore).toBe(true)

    // Delete it
    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.delete(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    // Verify it's gone
    const existsAfter = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.exists(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )
    expect(existsAfter).toBe(false)
  })
})

// =============================================================================
// Error type verification with real IO
// =============================================================================

describe("GlobService typed errors with real IO", () => {
  const service = pipe(GlobServiceLive)

  test("real Bun.Glob ENOENT produces GlobNotFound error", async () => {
    const result = await pipe(
      GlobServiceTag,
      Effect.flatMap((svc) => svc.scan("**/*", "/nonexistent/path/xyz", { onlyFiles: true })),
      Effect.provide(service),
      Effect.either,
      Effect.runPromise
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      const error = result.left as GlobError
      expect(error._tag).toBe("GlobNotFound")
      if (error._tag === "GlobNotFound") {
        expect(error.path).toBe("/nonexistent/path/xyz")
      }
    }
  })
})

describe("FileStatService typed errors with real IO", () => {
  const service = pipe(FileStatServiceLive, Layer.provide(BunContext.layer))

  test("real fs.stat ENOENT produces FileNotFound error", async () => {
    const result = await pipe(
      FileStatServiceTag,
      Effect.flatMap((svc) => svc.stat("/nonexistent/path/that/does/not/exist")),
      Effect.provide(service),
      Effect.either,
      Effect.runPromise
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      const error = result.left as FileStatError
      expect(error._tag).toBe("FileNotFound")
      if (error._tag === "FileNotFound") {
        expect(error.path).toBe("/nonexistent/path/that/does/not/exist")
      }
    }
  })
})
