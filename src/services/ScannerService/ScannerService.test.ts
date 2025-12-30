import { describe, expect, test } from "bun:test"
import { Effect, Layer, pipe } from "effect"
import { BunContext } from "@effect/platform-bun"
import { ScannerServiceTag, ScannerServiceLive } from "./ScannerService"
import { GlobServiceTag, GlobServiceLive } from "../GlobService"
import { FileStatServiceTag, FileStatServiceLive } from "../FileStatService"

// =============================================================================
// Stubs for unit testing
// =============================================================================

const StubGlobService = Layer.succeed(GlobServiceTag, {
  scan: (_pattern, cwd) =>
    Effect.succeed(
      cwd === "/mnt/disk1"
        ? ["file1.txt", "dir/file2.txt"]
        : ["other.txt"]
    ),
})

const StubFileStatService = Layer.succeed(FileStatServiceTag, {
  stat: (path: string) =>
    Effect.succeed({
      size: path.includes("file1") ? 1000 : path.includes("file2") ? 2000 : 500,
    }),
})

const TestScannerService = pipe(
  ScannerServiceLive,
  Layer.provide(StubGlobService),
  Layer.provide(StubFileStatService)
)

// =============================================================================
// Unit tests
// =============================================================================

describe("ScannerService (unit tests with stubs)", () => {
  test("scanDisk returns files with correct paths and sizes", async () => {
    const result = await pipe(
      ScannerServiceTag,
      Effect.flatMap((svc) => svc.scanDisk("/mnt/disk1")),
      Effect.provide(TestScannerService),
      Effect.runPromise
    )

    expect(result).toHaveLength(2)

    const [file1, file2] = result
    expect(file1?.absolutePath).toBe("/mnt/disk1/file1.txt")
    expect(file1?.relativePath).toBe("file1.txt")
    expect(file1?.sizeBytes).toBe(1000)
    expect(file1?.diskPath).toBe("/mnt/disk1")

    expect(file2?.absolutePath).toBe("/mnt/disk1/dir/file2.txt")
    expect(file2?.relativePath).toBe("dir/file2.txt")
    expect(file2?.sizeBytes).toBe(2000)
  })

  test("scanAllDisks runs in parallel and flattens results", async () => {
    const result = await pipe(
      ScannerServiceTag,
      Effect.flatMap((svc) => svc.scanAllDisks(["/mnt/disk1", "/mnt/disk2"])),
      Effect.provide(TestScannerService),
      Effect.runPromise
    )

    // disk1 has 2 files, disk2 has 1 file
    expect(result).toHaveLength(3)

    const disk1Files = result.filter((f) => f.diskPath === "/mnt/disk1")
    const disk2Files = result.filter((f) => f.diskPath === "/mnt/disk2")

    expect(disk1Files).toHaveLength(2)
    expect(disk2Files).toHaveLength(1)
  })
})

// =============================================================================
// Integration tests (real filesystem)
// =============================================================================

const RealScannerService = pipe(
  ScannerServiceLive,
  Layer.provide(GlobServiceLive),
  Layer.provide(FileStatServiceLive),
  Layer.provide(BunContext.layer)
)

describe("ScannerService (integration tests)", () => {
  test("scanDisk works on real directory", async () => {
    const result = await pipe(
      ScannerServiceTag,
      Effect.flatMap((svc) => svc.scanDisk("src/domain")),
      Effect.provide(RealScannerService),
      Effect.runPromise
    )

    // Should find at least Disk.ts, Disk.test.ts, FileEntry.ts
    expect(result.length).toBeGreaterThanOrEqual(3)

    const diskTs = result.find((f) => f.relativePath === "Disk.ts")
    expect(diskTs).toBeDefined()
    expect(diskTs?.sizeBytes).toBeGreaterThan(0)
  })
})
