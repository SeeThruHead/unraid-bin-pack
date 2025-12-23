import { describe, expect, test } from "bun:test"
import { Effect, pipe } from "effect"
import {
  TerminalUIServiceTag,
  TerminalUIServiceLive,
  type DiskProgress,
  type OverallProgress,
} from "./TerminalUIService"

describe("TerminalUIService", () => {
  describe("formatDiskLine", () => {
    test("formats running disk progress", async () => {
      const disk: DiskProgress = {
        diskPath: "/mnt/disk1",
        bytesTransferred: 500 * 1024 * 1024, // 500 MB
        totalBytes: 1000 * 1024 * 1024, // 1 GB
        currentFile: "movies/inception.mkv",
        speedBytesPerSec: 100 * 1024 * 1024, // 100 MB/s
        status: "running",
      }

      const line = await pipe(
        TerminalUIServiceTag,
        Effect.map((svc) => svc.formatDiskLine(disk)),
        Effect.provide(TerminalUIServiceLive),
        Effect.runPromise
      )

      expect(line).toContain("disk1")
      expect(line).toContain("50%")
      expect(line).toContain("500.0 MB")
      expect(line).toContain("1000.0 MB") // formatBytes shows MB until >= 1024 MB
      expect(line).toContain("inception.mkv")
    })

    test("formats completed disk", async () => {
      const disk: DiskProgress = {
        diskPath: "/mnt/disk2",
        bytesTransferred: 2000 * 1024 * 1024,
        totalBytes: 2000 * 1024 * 1024,
        currentFile: "",
        speedBytesPerSec: 0,
        status: "done",
      }

      const line = await pipe(
        TerminalUIServiceTag,
        Effect.map((svc) => svc.formatDiskLine(disk)),
        Effect.provide(TerminalUIServiceLive),
        Effect.runPromise
      )

      expect(line).toContain("100%")
      expect(line).toContain("[ok]")
    })

    test("formats error disk", async () => {
      const disk: DiskProgress = {
        diskPath: "/mnt/disk3",
        bytesTransferred: 100 * 1024 * 1024,
        totalBytes: 500 * 1024 * 1024,
        currentFile: "broken.file",
        speedBytesPerSec: 0,
        status: "error",
        error: "Permission denied",
      }

      const line = await pipe(
        TerminalUIServiceTag,
        Effect.map((svc) => svc.formatDiskLine(disk)),
        Effect.provide(TerminalUIServiceLive),
        Effect.runPromise
      )

      expect(line).toContain("[x]")
    })
  })

  describe("formatSummary", () => {
    test("formats overall progress", async () => {
      const progress: OverallProgress = {
        startedAt: Date.now() - 60000, // 1 minute ago
        disks: [
          {
            diskPath: "/mnt/disk1",
            bytesTransferred: 500 * 1024 * 1024,
            totalBytes: 1000 * 1024 * 1024,
            currentFile: "file1.mkv",
            speedBytesPerSec: 100 * 1024 * 1024,
            status: "running",
          },
          {
            diskPath: "/mnt/disk2",
            bytesTransferred: 200 * 1024 * 1024,
            totalBytes: 500 * 1024 * 1024,
            currentFile: "file2.mkv",
            speedBytesPerSec: 50 * 1024 * 1024,
            status: "running",
          },
        ],
      }

      const summary = await pipe(
        TerminalUIServiceTag,
        Effect.map((svc) => svc.formatSummary(progress)),
        Effect.provide(TerminalUIServiceLive),
        Effect.runPromise
      )

      expect(summary).toContain("Total:")
      expect(summary).toContain("700.0 MB")
      expect(summary).toContain("GB") // total size in GB
      expect(summary).toContain("%")
      expect(summary).toContain("Elapsed:")
      expect(summary).toContain("ETA:")
    })
  })
})
