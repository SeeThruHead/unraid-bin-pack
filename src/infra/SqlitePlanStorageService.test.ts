/**
 * Tests for SqlitePlanStorageService.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { Effect, pipe } from "effect"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { PlanStorageServiceTag, type PlanStorageError } from "./PlanStorageService"
import { SqlitePlanStorageService } from "./SqlitePlanStorageService"
import { createMovePlan } from "../domain/MovePlan"

// =============================================================================
// Test fixtures
// =============================================================================

let testDir: string

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "sqlite-plan-test-"))
})

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true })
})

// =============================================================================
// Tests
// =============================================================================

describe("SqlitePlanStorageService", () => {
  const service = SqlitePlanStorageService

  test("save and load round-trip", async () => {
    const planPath = join(testDir, "test-plan.db")
    const testPlan = createMovePlan([
      {
        file: {
          absolutePath: "/mnt/source/file.mkv",
          relativePath: "file.mkv",
          sizeBytes: 1000,
          diskPath: "/mnt/source",
        },
        targetDiskPath: "/mnt/disk1",
        destinationPath: "/mnt/disk1/file.mkv",
        status: "pending" as const,
      },
    ])

    // Save
    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(testPlan, "/mnt/source", {}, planPath)),
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

    // Test behavior: can load what was saved
    expect(loaded.sourceDisk).toBe("/mnt/source")
    expect(Object.keys(loaded.moves)).toHaveLength(1)
    expect(loaded.moves["/mnt/source/file.mkv"]?.status).toBe("pending")
    expect(loaded.diskStats).toBeDefined()
  })

  test("load non-existent file returns PlanNotFound error", async () => {
    const result = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.load(join(testDir, "nonexistent.db"))),
      Effect.provide(service),
      Effect.either,
      Effect.runPromise
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      const error = result.left as PlanStorageError
      expect(error._tag).toBe("PlanNotFound")
    }
  })

  test("exists returns false for non-existent file", async () => {
    const result = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.exists(join(testDir, "nonexistent.db"))),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(result).toBe(false)
  })

  test("exists returns true for existing file", async () => {
    const planPath = join(testDir, "exists-test.db")

    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(createMovePlan([]), "/mnt/source", {}, planPath)),
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

  test("updateMoveStatus updates move atomically", async () => {
    const planPath = join(testDir, "update-status.db")
    const sourceAbsPath = "/mnt/source/file.mkv"
    const testPlan = createMovePlan([
      {
        file: {
          absolutePath: sourceAbsPath,
          relativePath: "file.mkv",
          sizeBytes: 1000,
          diskPath: "/mnt/source",
        },
        targetDiskPath: "/mnt/disk1",
        destinationPath: "/mnt/disk1/file.mkv",
        status: "pending" as const,
      },
    ])

    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(testPlan, "/mnt/source", {}, planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.updateMoveStatus(planPath, sourceAbsPath, "completed")),
      Effect.provide(service),
      Effect.runPromise
    )

    const loaded = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.load(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(loaded.moves[sourceAbsPath]?.status).toBe("completed")
  })

  test("updateMoveStatus records error for failed moves", async () => {
    const planPath = join(testDir, "update-failed.db")
    const sourceAbsPath = "/mnt/source/file.mkv"
    const testPlan = createMovePlan([
      {
        file: {
          absolutePath: sourceAbsPath,
          relativePath: "file.mkv",
          sizeBytes: 1000,
          diskPath: "/mnt/source",
        },
        targetDiskPath: "/mnt/disk1",
        destinationPath: "/mnt/disk1/file.mkv",
        status: "pending" as const,
      },
    ])

    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(testPlan, "/mnt/source", {}, planPath)),
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
    const planPath = join(testDir, "delete-test.db")

    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(createMovePlan([]), "/mnt/source", {}, planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    const existsBefore = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.exists(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )
    expect(existsBefore).toBe(true)

    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.delete(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    const existsAfter = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.exists(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )
    expect(existsAfter).toBe(false)
  })

  test("handles multiple moves efficiently", async () => {
    const planPath = join(testDir, "multi-move.db")
    const moves = Array.from({ length: 100 }, (_, i) => ({
      file: {
        absolutePath: `/mnt/source/file${i}.mkv`,
        relativePath: `file${i}.mkv`,
        sizeBytes: 1000 + i,
        diskPath: "/mnt/source",
      },
      targetDiskPath: "/mnt/disk1",
      destinationPath: `/mnt/disk1/file${i}.mkv`,
      status: "pending" as const,
    }))
    const testPlan = createMovePlan(moves)

    await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.save(testPlan, "/mnt/source", {}, planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    const loaded = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.load(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    expect(Object.keys(loaded.moves)).toHaveLength(100)

    // Update multiple moves
    for (let i = 0; i < 50; i++) {
      await pipe(
        PlanStorageServiceTag,
        Effect.flatMap((svc) =>
          svc.updateMoveStatus(planPath, `/mnt/source/file${i}.mkv`, "completed")
        ),
        Effect.provide(service),
        Effect.runPromise
      )
    }

    const reloaded = await pipe(
      PlanStorageServiceTag,
      Effect.flatMap((svc) => svc.load(planPath)),
      Effect.provide(service),
      Effect.runPromise
    )

    const completed = Object.values(reloaded.moves).filter((m) => m.status === "completed")
    const pending = Object.values(reloaded.moves).filter((m) => m.status === "pending")
    expect(completed).toHaveLength(50)
    expect(pending).toHaveLength(50)
  })
})
