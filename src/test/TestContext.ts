/**
 * TestContext - provides mock implementations of all infra services.
 *
 * Usage:
 *   const ctx = createTestContext()
 *   ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
 *   ctx.addFile("/mnt/spillover/movie.mkv", 10_000_000_000)
 *
 *   // Run test with mocked layer
 *   await pipe(
 *     runPlan(options),
 *     Effect.provide(ctx.layer),
 *     Effect.runPromise,
 *   )
 *
 *   // Assert on what was called
 *   expect(ctx.calls.shell).toContain("rsync ...")
 */

import { Effect, Layer } from "effect"
import { FileSystem } from "@effect/platform"

import { DiskStatsServiceTag } from "../infra/DiskStatsService"
import { FileStatServiceTag, FileNotFound, FilePermissionDenied } from "../infra/FileStatService"
import { GlobServiceTag, GlobNotFound, GlobPermissionDenied } from "../infra/GlobService"
import { ShellServiceTag, type ShellResult } from "../infra/ShellService"
import { PlanStorageServiceTag, type SerializedPlan, PlanNotFound, PlanPermissionDenied } from "../infra/PlanStorageService"

// =============================================================================
// Virtual filesystem types
// =============================================================================

export interface VirtualDisk {
  free: number
  total: number
}

export interface VirtualFile {
  size: number
  permissionDenied?: boolean
}

export interface VirtualDiskExtended extends VirtualDisk {
  permissionDenied?: boolean
}

export interface SavedMove {
  sourceAbsPath: string
  sourceRelPath: string
  sourceDisk: string
  targetDisk: string
  destAbsPath: string
  sizeBytes: number
  status: string
}

export interface CallLog {
  diskStats: Array<{ method: "getStats"; path: string }>
  fileStat: Array<{ method: "stat"; path: string }>
  glob: Array<{ method: "scan"; pattern: string; cwd: string }>
  shell: Array<{ method: "exec"; command: string }>
  planStorage: Array<
    | { method: "save"; path: string; moveCount: number; moves: SavedMove[] }
    | { method: "load"; path: string }
    | { method: "exists"; path: string }
    | { method: "updateMoveStatus"; path: string; sourceAbsPath: string; status: "completed" | "failed"; error?: string }
    | { method: "delete"; path: string }
  >
  fileSystem: Array<{ method: string; path: string }>
}

export interface TestContext {
  // Virtual state
  disks: Map<string, VirtualDiskExtended>
  files: Map<string, VirtualFile>
  savedPlan: SerializedPlan | null

  // Call tracking
  calls: CallLog

  // Helpers to set up state
  addDisk: (path: string, stats: VirtualDisk, options?: { permissionDenied?: boolean }) => void
  addFile: (absolutePath: string, sizeBytes: number, options?: { permissionDenied?: boolean }) => void
  setPlan: (plan: SerializedPlan) => void

  // Permission simulation
  denyPermission: (path: string) => void
  denyPlanWrite: () => void
  denyPlanRead: () => void

  // Shell behavior configuration
  shellBehavior: {
    exitCode: number
    stdout: string
    stderr: string
    // Optional: function to determine result based on command
    handler?: (command: string) => ShellResult
  }

  // Plan storage behavior
  planStorageBehavior: {
    denyWrite: boolean
    denyRead: boolean
  }

  // The layer to provide to Effect
  layer: Layer.Layer<
    DiskStatsServiceTag | FileStatServiceTag | GlobServiceTag | ShellServiceTag | PlanStorageServiceTag | FileSystem.FileSystem
  >
}

// =============================================================================
// Create test context
// =============================================================================

export function createTestContext(): TestContext {
  const disks = new Map<string, VirtualDiskExtended>()
  const files = new Map<string, VirtualFile>()
  const permissionDeniedPaths = new Set<string>()
  let savedPlan: SerializedPlan | null = null

  const calls: CallLog = {
    diskStats: [],
    fileStat: [],
    glob: [],
    shell: [],
    planStorage: [],
    fileSystem: [],
  }

  const shellBehavior = {
    exitCode: 0,
    stdout: "",
    stderr: "",
    handler: undefined as ((command: string) => ShellResult) | undefined,
  }

  const planStorageBehavior = {
    denyWrite: false,
    denyRead: false,
  }

  // Helper to check if a path has permission denied
  const isPermissionDenied = (path: string): boolean => {
    if (permissionDeniedPaths.has(path)) return true
    const disk = disks.get(path)
    if (disk?.permissionDenied) return true
    const file = files.get(path)
    if (file?.permissionDenied) return true
    return false
  }

  // ---------------------------------------------------------------------------
  // Mock DiskStatsService
  // ---------------------------------------------------------------------------
  // NOTE: The real check-disk-space library never fails for non-existent paths.
  // It finds the parent mount point and returns its stats.
  // Validation (path exists, is directory, is mount point) happens in DiskService
  // using FileSystem, before DiskStatsService is called.
  // This mock returns stats for any path in the disks map. For paths not in the
  // map, it simulates the real behavior by returning stats from the parent mount.
  const mockDiskStatsService = Layer.succeed(DiskStatsServiceTag, {
    getStats: (path: string) => {
      calls.diskStats.push({ method: "getStats", path })

      const disk = disks.get(path)
      if (disk) {
        return Effect.succeed({ free: disk.free, size: disk.total })
      }

      // Simulate real check-disk-space behavior: find parent mount point
      // For paths not in the map, return a default (like the real library does)
      // This rarely happens because DiskService validates first using FileSystem
      return Effect.succeed({ free: 0, size: 0 })
    },
  })

  // ---------------------------------------------------------------------------
  // Mock FileStatService
  // ---------------------------------------------------------------------------
  // Uses the actual error classes so TypeScript enforces correctness.
  const mockFileStatService = Layer.succeed(FileStatServiceTag, {
    stat: (path: string) => {
      calls.fileStat.push({ method: "stat", path })

      // Check permission first
      if (isPermissionDenied(path)) {
        return Effect.fail(new FilePermissionDenied({ path }))
      }

      const file = files.get(path)
      if (!file) {
        return Effect.fail(new FileNotFound({ path }))
      }
      return Effect.succeed({ size: file.size })
    },
  })

  // ---------------------------------------------------------------------------
  // Mock GlobService
  // ---------------------------------------------------------------------------
  // Uses the actual error classes so TypeScript enforces correctness.
  const mockGlobService = Layer.succeed(GlobServiceTag, {
    scan: (pattern: string, cwd: string, _options?: { onlyFiles?: boolean }) => {
      calls.glob.push({ method: "scan", pattern, cwd })

      // Check if the cwd itself has permission denied
      if (isPermissionDenied(cwd)) {
        return Effect.fail(new GlobPermissionDenied({ path: cwd }))
      }

      // Check if cwd exists (is a disk path)
      if (!disks.has(cwd)) {
        return Effect.fail(new GlobNotFound({ path: cwd }))
      }

      // Return files that match the cwd prefix (excluding permission-denied files)
      const cwdPrefix = cwd.endsWith("/") ? cwd : `${cwd}/`
      const matchingFiles = Array.from(files.entries())
        .filter(([absPath, file]) => absPath.startsWith(cwdPrefix) && !file.permissionDenied)
        .map(([absPath]) => absPath.slice(cwdPrefix.length))

      return Effect.succeed(matchingFiles)
    },
  })

  // ---------------------------------------------------------------------------
  // Mock ShellService
  // ---------------------------------------------------------------------------
  const mockShellService = Layer.succeed(ShellServiceTag, {
    exec: (command: string) => {
      calls.shell.push({ method: "exec", command })

      if (shellBehavior.handler) {
        return Effect.succeed(shellBehavior.handler(command))
      }

      return Effect.succeed({
        stdout: shellBehavior.stdout,
        stderr: shellBehavior.stderr,
        exitCode: shellBehavior.exitCode,
      })
    },
  })

  // ---------------------------------------------------------------------------
  // Mock PlanStorageService
  // ---------------------------------------------------------------------------
  // Uses the actual error classes so TypeScript enforces correctness.
  const mockPlanStorageService = Layer.succeed(PlanStorageServiceTag, {
    defaultPath: "/mock/default-plan.json",

    save: (plan, _spilloverDisk, path) => {
      // Check for write permission
      if (planStorageBehavior.denyWrite) {
        return Effect.fail(new PlanPermissionDenied({ path, operation: "write" }))
      }

      const moves: SavedMove[] = plan.moves.map((m) => ({
        sourceAbsPath: m.file.absolutePath,
        sourceRelPath: m.file.relativePath,
        sourceDisk: m.file.diskPath,
        targetDisk: m.targetDiskPath,
        destAbsPath: m.destinationPath,
        sizeBytes: m.file.sizeBytes,
        status: m.status,
      }))
      calls.planStorage.push({ method: "save", path, moveCount: plan.moves.length, moves })
      return Effect.succeed(undefined)
    },

    load: (path: string) => {
      calls.planStorage.push({ method: "load", path })

      // Check for read permission
      if (planStorageBehavior.denyRead) {
        return Effect.fail(new PlanPermissionDenied({ path, operation: "read" }))
      }

      if (savedPlan) {
        return Effect.succeed(savedPlan)
      }
      return Effect.fail(new PlanNotFound({ path }))
    },

    exists: (path: string) => {
      calls.planStorage.push({ method: "exists", path })
      return Effect.succeed(savedPlan !== null)
    },

    updateMoveStatus: (path: string, sourceAbsPath: string, status: "completed" | "failed", error?: string) => {
      calls.planStorage.push({ method: "updateMoveStatus", path, sourceAbsPath, status, error })
      return Effect.succeed(undefined)
    },

    delete: (path: string) => {
      calls.planStorage.push({ method: "delete", path })
      return Effect.succeed(undefined)
    },
  })

  // ---------------------------------------------------------------------------
  // Mock FileSystem (for validation in apply and disk validation)
  // ---------------------------------------------------------------------------

  // Helper to get a unique device ID for each disk (simulates mount points)
  const getDiskDeviceId = (path: string): number => {
    const diskPaths = Array.from(disks.keys())
    const idx = diskPaths.indexOf(path)
    // Each disk gets its own device ID (starting from 1)
    // Parent paths (like /mnt) get device ID 0
    return idx >= 0 ? idx + 1 : 0
  }

  const mockFileSystem = Layer.succeed(FileSystem.FileSystem, {
    exists: (path: string) => {
      calls.fileSystem.push({ method: "exists", path })
      // Check if it's a disk path or a file path
      return Effect.succeed(disks.has(path) || files.has(path))
    },
    access: (path: string) => {
      if (isPermissionDenied(path)) {
        return Effect.fail(new Error(`EACCES: permission denied, access '${path}'`))
      }
      return Effect.succeed(undefined)
    },
    copy: () => Effect.succeed(undefined),
    copyFile: () => Effect.succeed(undefined),
    chmod: () => Effect.succeed(undefined),
    chown: () => Effect.succeed(undefined),
    link: () => Effect.succeed(undefined),
    makeDirectory: () => Effect.succeed(undefined),
    makeTempDirectory: () => Effect.succeed("/tmp/mock"),
    makeTempDirectoryScoped: () => Effect.succeed("/tmp/mock"),
    makeTempFile: () => Effect.succeed("/tmp/mock/file"),
    makeTempFileScoped: () => Effect.succeed("/tmp/mock/file"),
    open: () => Effect.fail(new Error("Not implemented")),
    readDirectory: (path: string) => {
      calls.fileSystem.push({ method: "readDirectory", path })
      // Return disk names that are children of this path (as strings)
      const entries = Array.from(disks.keys())
        .filter((diskPath) => {
          const parent = diskPath.replace(/\/[^/]+\/?$/, "") || "/"
          return parent === path
        })
        .map((diskPath) => diskPath.split("/").pop() || "")
      return Effect.succeed(entries)
    },
    readFile: () => Effect.succeed(new Uint8Array()),
    readFileString: () => Effect.succeed(""),
    readLink: () => Effect.succeed(""),
    realPath: (path: string) => Effect.succeed(path),
    remove: () => Effect.succeed(undefined),
    rename: () => Effect.succeed(undefined),
    sink: () => { throw new Error("Not implemented") },
    stat: (path: string) => {
      calls.fileSystem.push({ method: "stat", path })

      // Check permission first
      if (isPermissionDenied(path)) {
        return Effect.fail(new Error(`EACCES: permission denied, stat '${path}'`))
      }

      // Check if it's a disk (directory)
      if (disks.has(path)) {
        return Effect.succeed({
          type: "Directory" as const,
          size: BigInt(0),
          mtime: new Date(),
          atime: new Date(),
          dev: getDiskDeviceId(path),
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
        })
      }

      // Check if it's a parent path like /mnt (for mount point validation)
      const isParentOfDisk = Array.from(disks.keys()).some((diskPath) =>
        diskPath.startsWith(path + "/")
      )
      if (isParentOfDisk || path === "/") {
        return Effect.succeed({
          type: "Directory" as const,
          size: BigInt(0),
          mtime: new Date(),
          atime: new Date(),
          dev: 0, // Parent always has device ID 0
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
        })
      }

      // Check if it's a file
      const file = files.get(path)
      if (file) {
        return Effect.succeed({
          type: "File" as const,
          size: BigInt(file.size),
          mtime: new Date(),
          atime: new Date(),
          dev: 0,
          ino: 0,
          mode: 0o644,
          nlink: 1,
          uid: 0,
          gid: 0,
          rdev: 0,
          blksize: 4096,
          blocks: Math.ceil(file.size / 512),
          birthtimeMs: Date.now(),
          ctimeMs: Date.now(),
          mtimeMs: Date.now(),
          atimeMs: Date.now(),
        })
      }

      return Effect.fail(new Error(`Path not found: ${path}`))
    },
    stream: () => { throw new Error("Not implemented") },
    symlink: () => Effect.succeed(undefined),
    truncate: () => Effect.succeed(undefined),
    utimes: () => Effect.succeed(undefined),
    watch: () => { throw new Error("Not implemented") },
    writeFile: () => Effect.succeed(undefined),
    writeFileString: () => Effect.succeed(undefined),
  } as unknown as FileSystem.FileSystem)

  // ---------------------------------------------------------------------------
  // Combined layer
  // ---------------------------------------------------------------------------
  const layer = Layer.mergeAll(
    mockDiskStatsService,
    mockFileStatService,
    mockGlobService,
    mockShellService,
    mockPlanStorageService,
    mockFileSystem,
  )

  return {
    disks,
    files,
    get savedPlan() { return savedPlan },
    calls,
    shellBehavior,
    planStorageBehavior,

    addDisk(path: string, stats: VirtualDisk, options?: { permissionDenied?: boolean }) {
      disks.set(path, { ...stats, permissionDenied: options?.permissionDenied })
    },

    addFile(absolutePath: string, sizeBytes: number, options?: { permissionDenied?: boolean }) {
      files.set(absolutePath, { size: sizeBytes, permissionDenied: options?.permissionDenied })
    },

    setPlan(plan: SerializedPlan) {
      savedPlan = plan
    },

    denyPermission(path: string) {
      permissionDeniedPaths.add(path)
    },

    denyPlanWrite() {
      planStorageBehavior.denyWrite = true
    },

    denyPlanRead() {
      planStorageBehavior.denyRead = true
    },

    layer,
  }
}

// =============================================================================
// Helper to extract relative path from absolute
// =============================================================================

export function relativePath(absPath: string, diskPath: string): string {
  const prefix = diskPath.endsWith("/") ? diskPath : `${diskPath}/`
  if (absPath.startsWith(prefix)) {
    return absPath.slice(prefix.length)
  }
  return absPath
}

// =============================================================================
// Re-export for convenience
// =============================================================================

export type { SerializedPlan } from "../infra/PlanStorageService"
