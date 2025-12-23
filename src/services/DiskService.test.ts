import { describe, expect, test } from "bun:test"
import { Effect, Layer, pipe } from "effect"
import { FileSystem } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
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

// Mock FileSystem that says all paths exist and are mount points
const StubFileSystem = Layer.succeed(FileSystem.FileSystem, {
  exists: () => Effect.succeed(true),
  stat: (path: string) =>
    Effect.succeed({
      type: "Directory" as const,
      // Use different device IDs for different paths to simulate mount points
      dev: path === "/" ? 0 : path.startsWith("/mnt/") ? 1 : 2,
      size: BigInt(0),
      mtime: new Date(),
      atime: new Date(),
      ino: 0,
      mode: 0o755,
      nlink: 1,
      uid: 0,
      gid: 0,
      rdev: 0,
      blksize: 4096,
      blocks: 0,
      birthtimeMs: Date.now(),
      ctimeMs: Date.now(),
      mtimeMs: Date.now(),
      atimeMs: Date.now(),
    }),
  // Unused methods
  access: () => Effect.succeed(undefined),
  copy: () => Effect.succeed(undefined),
  copyFile: () => Effect.succeed(undefined),
  chmod: () => Effect.succeed(undefined),
  chown: () => Effect.succeed(undefined),
  link: () => Effect.succeed(undefined),
  makeDirectory: () => Effect.succeed(undefined),
  makeTempDirectory: () => Effect.succeed("/tmp"),
  makeTempDirectoryScoped: () => Effect.succeed("/tmp"),
  makeTempFile: () => Effect.succeed("/tmp/file"),
  makeTempFileScoped: () => Effect.succeed("/tmp/file"),
  open: () => Effect.fail(new Error("Not implemented")),
  readDirectory: () => Effect.succeed([]),
  readFile: () => Effect.succeed(new Uint8Array()),
  readFileString: () => Effect.succeed(""),
  readLink: () => Effect.succeed(""),
  realPath: (p: string) => Effect.succeed(p),
  remove: () => Effect.succeed(undefined),
  rename: () => Effect.succeed(undefined),
  sink: () => { throw new Error("Not implemented") },
  stream: () => { throw new Error("Not implemented") },
  symlink: () => Effect.succeed(undefined),
  truncate: () => Effect.succeed(undefined),
  utimes: () => Effect.succeed(undefined),
  watch: () => { throw new Error("Not implemented") },
  writeFile: () => Effect.succeed(undefined),
  writeFileString: () => Effect.succeed(undefined),
} as unknown as FileSystem.FileSystem)

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
    const NonExistentFs = Layer.succeed(FileSystem.FileSystem, {
      ...({} as FileSystem.FileSystem),
      exists: () => Effect.succeed(false),
    } as unknown as FileSystem.FileSystem)

    const TestLayer = pipe(
      DiskServiceLive,
      Layer.provide(Layer.mergeAll(StubDiskStatsService, NonExistentFs))
    )

    const result = await pipe(
      DiskServiceTag,
      Effect.flatMap((svc) => svc.getStats("/nonexistent")),
      Effect.provide(TestLayer),
      Effect.either,
      Effect.runPromise
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("DiskNotFound")
      expect(result.left.path).toBe("/nonexistent")
    }
  })
})

// =============================================================================
// Integration tests with real filesystem
// =============================================================================

describe("DiskService (integration tests)", () => {
  test("getStats works on root path", async () => {
    // Root "/" is always a mount point
    const TestLayer = pipe(DiskServiceFullLive, Layer.provide(BunContext.layer))

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
    const TestLayer = pipe(DiskServiceFullLive, Layer.provide(BunContext.layer))

    const result = await pipe(
      DiskServiceTag,
      Effect.flatMap((svc) => svc.getStats("/tmp")),
      Effect.provide(TestLayer),
      Effect.either,
      Effect.runPromise
    )

    // On most systems, /tmp is not a mount point
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("DiskNotAMountPoint")
      expect(result.left.path).toBe("/tmp")
    }
  })
})
