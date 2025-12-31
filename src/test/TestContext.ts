import { Effect, Layer } from "effect";
import { FileSystem } from "@effect/platform";

import { DiskStatsServiceTag } from "@services/DiskStatsService";
import { FileStatServiceTag, FileNotFound, FilePermissionDenied } from "@services/FileStatService";
import { GlobServiceTag, GlobNotFound, GlobPermissionDenied } from "@services/GlobService";
import { ShellServiceTag, type ShellResult } from "@services/ShellService";

export interface VirtualDisk {
  free: number;
  total: number;
}

export interface VirtualFile {
  size: number;
  permissionDenied?: boolean;
}

export interface VirtualDiskExtended extends VirtualDisk {
  permissionDenied?: boolean;
}

export interface CallLog {
  diskStats: Array<{ method: "getStats"; path: string }>;
  fileStat: Array<{ method: "stat"; path: string }>;
  glob: Array<{ method: "scan"; pattern: string; cwd: string }>;
  shell: Array<{ method: "exec"; command: string }>;
  fileSystem: Array<{ method: string; path: string }>;
}

export interface TestContext {
  disks: Map<string, VirtualDiskExtended>;
  files: Map<string, VirtualFile>;
  calls: CallLog;
  addDisk: (path: string, stats: VirtualDisk, options?: { permissionDenied?: boolean }) => void;
  addFile: (
    absolutePath: string,
    sizeBytes: number,
    options?: { permissionDenied?: boolean }
  ) => void;
  denyPermission: (path: string) => void;
  shellBehavior: {
    exitCode: number;
    stdout: string;
    stderr: string;
    handler?: (command: string) => ShellResult;
  };
  layer: Layer.Layer<
    | DiskStatsServiceTag
    | FileStatServiceTag
    | GlobServiceTag
    | ShellServiceTag
    | FileSystem.FileSystem
  >;
}

export function createTestContext(): TestContext {
  const disks = new Map<string, VirtualDiskExtended>();
  const files = new Map<string, VirtualFile>();
  const permissionDeniedPaths = new Set<string>();

  const calls: CallLog = {
    diskStats: [],
    fileStat: [],
    glob: [],
    shell: [],
    fileSystem: []
  };

  const shellBehavior = {
    exitCode: 0,
    stdout: "",
    stderr: "",
    handler: undefined as ((command: string) => ShellResult) | undefined
  };

  const isPermissionDenied = (path: string): boolean => {
    if (permissionDeniedPaths.has(path)) return true;
    const disk = disks.get(path);
    if (disk?.permissionDenied) return true;
    const file = files.get(path);
    if (file?.permissionDenied) return true;
    return false;
  };

  const mockDiskStatsService = Layer.succeed(DiskStatsServiceTag, {
    getStats: (path: string) => {
      calls.diskStats.push({ method: "getStats", path });

      const disk = disks.get(path);
      if (disk) {
        return Effect.succeed({ free: disk.free, size: disk.total });
      }

      return Effect.succeed({ free: 0, size: 0 });
    }
  });

  const mockFileStatService = Layer.succeed(FileStatServiceTag, {
    stat: (path: string) => {
      calls.fileStat.push({ method: "stat", path });

      if (isPermissionDenied(path)) {
        return Effect.fail(new FilePermissionDenied({ path }));
      }

      const file = files.get(path);
      if (!file) {
        return Effect.fail(new FileNotFound({ path }));
      }
      return Effect.succeed({ size: file.size });
    }
  });

  const mockGlobService = Layer.succeed(GlobServiceTag, {
    scan: (pattern: string, cwd: string, _options?: { onlyFiles?: boolean }) => {
      calls.glob.push({ method: "scan", pattern, cwd });

      if (isPermissionDenied(cwd)) {
        return Effect.fail(new GlobPermissionDenied({ path: cwd }));
      }

      if (!disks.has(cwd)) {
        return Effect.fail(new GlobNotFound({ path: cwd }));
      }

      const cwdPrefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
      const matchingFiles = Array.from(files.entries())
        .filter(([absPath, file]) => absPath.startsWith(cwdPrefix) && !file.permissionDenied)
        .map(([absPath]) => absPath.slice(cwdPrefix.length));

      return Effect.succeed(matchingFiles);
    }
  });

  const mockShellService = Layer.succeed(ShellServiceTag, {
    exec: (command: string) => {
      calls.shell.push({ method: "exec", command });

      if (shellBehavior.handler) {
        return Effect.succeed(shellBehavior.handler(command));
      }

      return Effect.succeed({
        stdout: shellBehavior.stdout,
        stderr: shellBehavior.stderr,
        exitCode: shellBehavior.exitCode
      });
    }
  });

  const getDiskDeviceId = (path: string): number => {
    const diskPaths = Array.from(disks.keys());
    const idx = diskPaths.indexOf(path);
    return idx >= 0 ? idx + 1 : 0;
  };

  const mockFileSystem = Layer.succeed(FileSystem.FileSystem, {
    exists: (path: string) => {
      calls.fileSystem.push({ method: "exists", path });
      return Effect.succeed(disks.has(path) || files.has(path));
    },
    access: (path: string) => {
      if (isPermissionDenied(path)) {
        return Effect.fail(new Error(`EACCES: permission denied, access '${path}'`));
      }
      return Effect.succeed(undefined);
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
      calls.fileSystem.push({ method: "readDirectory", path });
      const entries = Array.from(disks.keys())
        .filter((diskPath) => {
          const parent = diskPath.replace(/\/[^/]+\/?$/, "") || "/";
          return parent === path;
        })
        .map((diskPath) => diskPath.split("/").pop() || "");
      return Effect.succeed(entries);
    },
    readFile: () => Effect.succeed(new Uint8Array()),
    readFileString: () => Effect.succeed(""),
    readLink: () => Effect.succeed(""),
    realPath: (path: string) => Effect.succeed(path),
    remove: () => Effect.succeed(undefined),
    rename: () => Effect.succeed(undefined),
    sink: () => Effect.fail(new Error("Not implemented")),
    stat: (path: string) => {
      calls.fileSystem.push({ method: "stat", path });

      if (isPermissionDenied(path)) {
        return Effect.fail(new Error(`EACCES: permission denied, stat '${path}'`));
      }

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
          atimeMs: Date.now()
        });
      }

      const isParentOfDisk = Array.from(disks.keys()).some((diskPath) =>
        diskPath.startsWith(path + "/")
      );
      if (isParentOfDisk || path === "/") {
        return Effect.succeed({
          type: "Directory" as const,
          size: BigInt(0),
          mtime: new Date(),
          atime: new Date(),
          dev: 0,
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
          atimeMs: Date.now()
        });
      }

      const file = files.get(path);
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
          atimeMs: Date.now()
        });
      }

      return Effect.fail(new Error(`Path not found: ${path}`));
    },
    stream: () => Effect.fail(new Error("Not implemented")),
    symlink: () => Effect.succeed(undefined),
    truncate: () => Effect.succeed(undefined),
    utimes: () => Effect.succeed(undefined),
    watch: () => Effect.fail(new Error("Not implemented")),
    writeFile: () => Effect.succeed(undefined),
    writeFileString: () => Effect.succeed(undefined)
  } as unknown as FileSystem.FileSystem);

  const layer = Layer.mergeAll(
    mockDiskStatsService,
    mockFileStatService,
    mockGlobService,
    mockShellService,
    mockFileSystem
  );

  return {
    disks,
    files,
    calls,
    shellBehavior,

    addDisk(path: string, stats: VirtualDisk, options?: { permissionDenied?: boolean }) {
      disks.set(path, { ...stats, permissionDenied: options?.permissionDenied });
    },

    addFile(absolutePath: string, sizeBytes: number, options?: { permissionDenied?: boolean }) {
      files.set(absolutePath, { size: sizeBytes, permissionDenied: options?.permissionDenied });
    },

    denyPermission(path: string) {
      permissionDeniedPaths.add(path);
    },

    layer
  };
}

export function relativePath(absPath: string, diskPath: string): string {
  const prefix = diskPath.endsWith("/") ? diskPath : `${diskPath}/`;
  if (absPath.startsWith(prefix)) {
    return absPath.slice(prefix.length);
  }
  return absPath;
}
