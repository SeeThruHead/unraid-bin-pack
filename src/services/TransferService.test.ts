import { describe, expect, test } from "bun:test"
import { Effect, Layer, pipe } from "effect"
import { TransferServiceTag, RsyncTransferService } from "./TransferService"
import { ShellServiceTag } from "../infra/ShellService"
import type { MovePlan, FileMove } from "../domain/MovePlan"
import type { FileEntry } from "../domain/FileEntry"

// =============================================================================
// Test data factories
// =============================================================================

const makeFile = (relativePath: string, diskPath: string): FileEntry => ({
  absolutePath: `${diskPath}/${relativePath}`,
  relativePath,
  sizeBytes: 100,
  diskPath,
})

const makeMove = (
  relativePath: string,
  fromDisk: string,
  toDisk: string,
  status: "pending" | "skipped" = "pending",
  reason?: string
): FileMove => ({
  file: makeFile(relativePath, fromDisk),
  targetDiskPath: toDisk,
  destinationPath: `${toDisk}/${relativePath}`,
  status,
  reason,
})

const makePlan = (moves: FileMove[]): MovePlan => ({
  moves,
  summary: {
    totalFiles: moves.filter((m) => m.status === "pending").length,
    totalBytes: moves.filter((m) => m.status === "pending").reduce((acc, m) => acc + m.file.sizeBytes, 0),
    movesPerDisk: new Map(),
    bytesPerDisk: new Map(),
  },
})

// =============================================================================
// Stub ShellService
// =============================================================================

const makeStubShellService = (exitCode = 0, stderr = "") =>
  Layer.succeed(ShellServiceTag, {
    exec: (_command) =>
      Effect.succeed({
        stdout: "",
        stderr,
        exitCode,
      }),
  })

// =============================================================================
// Tests
// =============================================================================

describe("RsyncTransferService", () => {
  describe("executeAll", () => {
    test("dry-run returns preview without executing", async () => {
      let execCalled = false
      const StubShell = Layer.succeed(ShellServiceTag, {
        exec: (_command) => {
          execCalled = true
          return Effect.succeed({ stdout: "", stderr: "", exitCode: 0 })
        },
      })

      const TestLayer = pipe(RsyncTransferService, Layer.provide(StubShell))

      const plan = makePlan([
        makeMove("a.txt", "/mnt/disk1", "/mnt/disk2"),
        makeMove("b.txt", "/mnt/disk1", "/mnt/disk2"),
      ])

      const report = await pipe(
        TransferServiceTag,
        Effect.flatMap((svc) =>
          svc.executeAll(plan, {
            dryRun: true,
            concurrency: 4,
            preserveAttrs: true,
            deleteSource: true,
          })
        ),
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      expect(execCalled).toBe(false)
      expect(report.successful).toBe(2)
      expect(report.failed).toBe(0)
      expect(report.skipped).toBe(0)
    })

    test("executes batched transfers per target disk", async () => {
      const executedCommands: string[] = []
      const StubShell = Layer.succeed(ShellServiceTag, {
        exec: (command) => {
          executedCommands.push(command)
          return Effect.succeed({ stdout: "", stderr: "", exitCode: 0 })
        },
      })

      const TestLayer = pipe(RsyncTransferService, Layer.provide(StubShell))

      // Two files going to different target disks = 2 batches
      const plan = makePlan([
        makeMove("a.txt", "/mnt/disk1", "/mnt/disk2"),
        makeMove("b.txt", "/mnt/disk1", "/mnt/disk3"),
      ])

      const report = await pipe(
        TransferServiceTag,
        Effect.flatMap((svc) =>
          svc.executeAll(plan, {
            dryRun: false,
            concurrency: 4,
            preserveAttrs: true,
            deleteSource: true,
          })
        ),
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      // Each batch executes 3 commands: write temp file, rsync, cleanup
      // 2 batches = 6 total commands
      expect(executedCommands).toHaveLength(6)

      // Verify rsync commands are present (start with "rsync")
      const rsyncCommands = executedCommands.filter((c) => c.startsWith("rsync"))
      expect(rsyncCommands).toHaveLength(2)
      expect(rsyncCommands.some((c) => c.includes("/mnt/disk2"))).toBe(true)
      expect(rsyncCommands.some((c) => c.includes("/mnt/disk3"))).toBe(true)

      expect(report.successful).toBe(2)
      expect(report.failed).toBe(0)
    })

    test("handles failed transfers", async () => {
      const StubShell = Layer.succeed(ShellServiceTag, {
        exec: (_command) =>
          Effect.succeed({ stdout: "", stderr: "permission denied", exitCode: 1 }),
      })

      const TestLayer = pipe(RsyncTransferService, Layer.provide(StubShell))

      const plan = makePlan([makeMove("file.txt", "/mnt/disk1", "/mnt/disk2")])

      const report = await pipe(
        TransferServiceTag,
        Effect.flatMap((svc) =>
          svc.executeAll(plan, {
            dryRun: false,
            concurrency: 4,
            preserveAttrs: true,
            deleteSource: true,
          })
        ),
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      expect(report.successful).toBe(0)
      expect(report.failed).toBe(1)
      expect(report.results[0]?.error).toContain("permission denied")
    })

    test("reports skipped moves correctly", async () => {
      const TestLayer = pipe(RsyncTransferService, Layer.provide(makeStubShellService()))

      const plan = makePlan([
        makeMove("ok.txt", "/mnt/disk1", "/mnt/disk2", "pending"),
        makeMove("conflict.txt", "/mnt/disk1", "/mnt/disk2", "skipped", "Conflict"),
      ])

      const report = await pipe(
        TransferServiceTag,
        Effect.flatMap((svc) =>
          svc.executeAll(plan, {
            dryRun: false,
            concurrency: 4,
            preserveAttrs: true,
            deleteSource: true,
          })
        ),
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      expect(report.successful).toBe(1)
      expect(report.skipped).toBe(1)
    })

    test("calls onProgress callback after batch completion", async () => {
      const TestLayer = pipe(RsyncTransferService, Layer.provide(makeStubShellService()))

      // Two files to same target = 1 batch
      const plan = makePlan([
        makeMove("a.txt", "/mnt/disk1", "/mnt/disk2"),
        makeMove("b.txt", "/mnt/disk1", "/mnt/disk2"),
      ])

      const progressCalls: Array<{ completed: number; total: number }> = []

      await pipe(
        TransferServiceTag,
        Effect.flatMap((svc) =>
          svc.executeAll(plan, {
            dryRun: false,
            concurrency: 1,
            preserveAttrs: true,
            deleteSource: true,
            onProgress: (completed, total, _move) => {
              progressCalls.push({ completed, total })
            },
          })
        ),
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      // Progress is called once after all batches complete
      expect(progressCalls).toHaveLength(1)
      expect(progressCalls[0]).toEqual({ completed: 2, total: 2 })
    })
  })
})
