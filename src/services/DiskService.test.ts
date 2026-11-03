import { describe, expect, test } from "bun:test"
import { ByteSize, Effect, FileSystem, Layer, Option, pipe } from "effect"
import { BunServices } from "@effect/platform-bun"
import { DiskServiceTag, DiskServiceLive, DiskServiceFullLive } from "./DiskService"
import { DiskStatsServiceTag } from "../infra/DiskStatsService"

// =============================================================================
// Unit tests with stubbed services
// =============================================================================

const StubDiskStatsService = Layer.succeed(DiskStatsServiceTag, {
  getStats: (path) =>
    Effect.succeed({
      free: path === "/mnt/disk1" ? 100_000_000 : 200_000_000,
      size: 500_000_000,
    }),
})

const directoryInfo = (dev: bigint): FileSystem.File.Info => ({
  type: "Directory",
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev,
  ino: Option.none(),
  mode: 0o755,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(0),
  blksize: Option.none(),
  blocks: Option.none(),
})

const deviceOf = (path: string): bigint => {
  if (path === "/") return 0n
  return path.startsWith("/mnt/") ? 1n : 2n
}

// Mock FileSystem that says all paths exist and are mount points
const StubFileSystem = FileSystem.layerNoop({
  exists: () => Effect.succeed(true),
  stat: (path) => Effect.succeed(directoryInfo(deviceOf(path))),
})

const TestDiskService = pipe(
  DiskServiceLive,
  Layer.provide(Layer.mergeAll(StubDiskStatsService, StubFileSystem))
)

describe("DiskService (unit tests with stub)", () => {
  test("getStats returns disk info for valid mount point", async () => {
    const result = await pipe(
      DiskServiceTag,
      Effect.flatMap((svc) => svc.getStats("/mnt/disk1")),
      Effect.provide(TestDiskService),
      Effect.runPromise
    )

    expect(result.path).toBe("/mnt/disk1")
    expect(result.totalBytes).toBe(500_000_000)
    expect(result.freeBytes).toBe(100_000_000)
  })

  test("discover returns multiple disks in parallel", async () => {
    const result = await pipe(
      DiskServiceTag,
      Effect.flatMap((svc) => svc.discover(["/mnt/disk1", "/mnt/disk2"])),
      Effect.provide(TestDiskService),
      Effect.runPromise
    )

    expect(result).toHaveLength(2)
    const [disk1, disk2] = result
    expect(disk1?.freeBytes).toBe(100_000_000)
    expect(disk2?.freeBytes).toBe(200_000_000)
  })

  test("fails when path does not exist", async () => {
    const NonExistentFs = FileSystem.layerNoop({
      exists: () => Effect.succeed(false),
    })

    const TestLayer = pipe(
      DiskServiceLive,
      Layer.provide(Layer.mergeAll(StubDiskStatsService, NonExistentFs))
    )

    const result = await pipe(
      DiskServiceTag,
      Effect.flatMap((svc) => svc.getStats("/nonexistent")),
      Effect.provide(TestLayer),
      Effect.result,
      Effect.runPromise
    )

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("DiskNotFound")
      expect(result.failure.path).toBe("/nonexistent")
    }
  })
})

// =============================================================================
// Integration tests with real filesystem
// =============================================================================

describe("DiskService (integration tests)", () => {
  test("getStats works on root path", async () => {
    // Root "/" is always a mount point
    const TestLayer = pipe(DiskServiceFullLive, Layer.provide(BunServices.layer))

    const result = await pipe(
      DiskServiceTag,
      Effect.flatMap((svc) => svc.getStats("/")),
      Effect.provide(TestLayer),
      Effect.runPromise
    )

    expect(result.path).toBe("/")
    expect(result.totalBytes).toBeGreaterThan(0)
    expect(result.freeBytes).toBeGreaterThan(0)
    expect(result.freeBytes).toBeLessThanOrEqual(result.totalBytes)
  })

  test("fails on non-mount-point directory", async () => {
    // /tmp is typically NOT a separate mount point on macOS
    const TestLayer = pipe(DiskServiceFullLive, Layer.provide(BunServices.layer))

    const result = await pipe(
      DiskServiceTag,
      Effect.flatMap((svc) => svc.getStats("/tmp")),
      Effect.provide(TestLayer),
      Effect.result,
      Effect.runPromise
    )

    // On most systems, /tmp is not a mount point
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("DiskNotAMountPoint")
      expect(result.failure.path).toBe("/tmp")
    }
  })
})
