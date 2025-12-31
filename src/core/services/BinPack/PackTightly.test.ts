import { describe, test, expect } from "bun:test";
import { Effect } from "effect";
import { packTightly } from "./PackTightly";
import type { WorldView } from "@domain/WorldView";
import type { FileEntry } from "@domain/FileEntry";

const MB = 1024 * 1024;

const createFile = (diskPath: string, relativePath: string, sizeMB: number): FileEntry => ({
  diskPath,
  relativePath,
  absolutePath: `${diskPath}/${relativePath}`,
  sizeBytes: sizeMB * MB
});

describe("PackTightly", () => {
  test("should not move files when one disk is full and one has only 2 MB used", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 0 * MB },
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 998 * MB }
      ],
      files: [createFile("/mnt/disk1", "file1.mkv", 1000), createFile("/mnt/disk2", "file2.mkv", 2)]
    };

    const result = await Effect.runPromise(packTightly(worldView, { minSpaceBytes: 2 * MB }));

    expect(result.moves.length).toBe(0);
  });

  test("should move all data from disk2 and disk3 to disk1", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 502 * MB },
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 750 * MB },
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 750 * MB }
      ],
      files: [
        createFile("/mnt/disk1", "file1.mkv", 498),
        createFile("/mnt/disk2", "file2.mkv", 250),
        createFile("/mnt/disk3", "file3.mkv", 250)
      ]
    };

    const result = await Effect.runPromise(packTightly(worldView, { minSpaceBytes: 2 * MB }));

    expect(result.moves.length).toBe(2);
    expect(result.moves.every((m) => m.targetDiskPath === "/mnt/disk1")).toBe(true);
    expect(result.moves.some((m) => m.file.diskPath === "/mnt/disk2")).toBe(true);
    expect(result.moves.some((m) => m.file.diskPath === "/mnt/disk3")).toBe(true);
  });

  test("should move all from disk3 and partial from disk2 to fill disk1", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 502 * MB },
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 600 * MB },
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 750 * MB }
      ],
      files: [
        createFile("/mnt/disk1", "file1.mkv", 498),
        createFile("/mnt/disk2", "file2a.mkv", 150),
        createFile("/mnt/disk2", "file2b.mkv", 250),
        createFile("/mnt/disk3", "file3.mkv", 250)
      ]
    };

    const result = await Effect.runPromise(packTightly(worldView, { minSpaceBytes: 2 * MB }));

    expect(result.moves.length).toBe(2);
    expect(result.moves.every((m) => m.targetDiskPath === "/mnt/disk1")).toBe(true);

    expect(result.moves.some((m) => m.file.diskPath === "/mnt/disk3")).toBe(true);

    const disk2Moves = result.moves.filter((m) => m.file.diskPath === "/mnt/disk2");
    expect(disk2Moves.length).toBe(1);
    expect(disk2Moves[0]!.file.sizeBytes).toBe(250 * MB);
  });

  test("should respect minSpaceBytes when filling disks", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 100 * MB },
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 200 * MB },
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 600 * MB }
      ],
      files: [
        createFile("/mnt/disk1", "file1.mkv", 900),
        createFile("/mnt/disk2", "file2.mkv", 800),
        createFile("/mnt/disk3", "file3a.mkv", 98),
        createFile("/mnt/disk3", "file3b.mkv", 198),
        createFile("/mnt/disk3", "file3c.mkv", 104)
      ]
    };

    const result = await Effect.runPromise(packTightly(worldView, { minSpaceBytes: 2 * MB }));

    expect(result.moves.length).toBe(2);
    expect(result.moves.every((m) => m.file.diskPath === "/mnt/disk3")).toBe(true);

    const toDisk1 = result.moves.filter((m) => m.targetDiskPath === "/mnt/disk1");
    const toDisk2 = result.moves.filter((m) => m.targetDiskPath === "/mnt/disk2");

    expect(toDisk1.length).toBe(1);
    expect(toDisk1[0]!.file.sizeBytes).toBe(98 * MB);

    expect(toDisk2.length).toBe(1);
    expect(toDisk2[0]!.file.sizeBytes).toBe(198 * MB);
  });

  test("should process multiple source disks and exclude emptied disks", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 300 * MB },
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 900 * MB },
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 800 * MB },
        { path: "/mnt/disk4", totalBytes: 1000 * MB, freeBytes: 400 * MB }
      ],
      files: [
        createFile("/mnt/disk1", "file1.mkv", 700),
        createFile("/mnt/disk2", "file2.mkv", 100),
        createFile("/mnt/disk3", "file3a.mkv", 198),
        createFile("/mnt/disk3", "file3b.mkv", 2),
        createFile("/mnt/disk4", "file4.mkv", 600)
      ]
    };

    const result = await Effect.runPromise(packTightly(worldView, { minSpaceBytes: 2 * MB }));

    expect(result.moves.length).toBe(3);

    const disk2Moves = result.moves.filter((m) => m.file.diskPath === "/mnt/disk2");
    expect(disk2Moves.length).toBe(1);
    expect(disk2Moves[0]!.targetDiskPath).toBe("/mnt/disk1");

    const disk3Moves = result.moves.filter((m) => m.file.diskPath === "/mnt/disk3");
    expect(disk3Moves.length).toBe(2);
    expect(disk3Moves.some((m) => m.targetDiskPath === "/mnt/disk2")).toBe(false);
    expect(
      disk3Moves.some((m) => m.targetDiskPath === "/mnt/disk1" && m.file.sizeBytes === 198 * MB)
    ).toBe(true);
    expect(
      disk3Moves.some((m) => m.targetDiskPath === "/mnt/disk4" && m.file.sizeBytes === 2 * MB)
    ).toBe(true);
  });

  test("should filter files by minimum size", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 500 * MB },
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 900 * MB }
      ],
      files: [createFile("/mnt/disk2", "small.mkv", 10), createFile("/mnt/disk2", "large.mkv", 100)]
    };

    const result = await Effect.runPromise(
      packTightly(worldView, {
        minSpaceBytes: 2 * MB,
        minFileSizeBytes: 50 * MB
      })
    );

    expect(result.moves.length).toBe(1);
    expect(result.moves[0]!.file.relativePath).toBe("large.mkv");
    expect(result.moves[0]!.file.sizeBytes).toBe(100 * MB);
  });

  test("should filter files by path prefix", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 500 * MB },
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 700 * MB }
      ],
      files: [
        createFile("/mnt/disk2", "videos/movie.mkv", 100),
        createFile("/mnt/disk2", "photos/pic.jpg", 50),
        createFile("/mnt/disk2", "videos/show.mkv", 150)
      ]
    };

    const result = await Effect.runPromise(
      packTightly(worldView, {
        minSpaceBytes: 2 * MB,
        pathPrefixes: ["/videos/"]
      })
    );

    expect(result.moves.length).toBe(2);
    expect(result.moves.every((m) => m.file.relativePath.startsWith("videos/"))).toBe(true);
    expect(result.moves.some((m) => m.file.relativePath === "videos/movie.mkv")).toBe(true);
    expect(result.moves.some((m) => m.file.relativePath === "videos/show.mkv")).toBe(true);
  });

  test("should only process specified source disks", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 500 * MB },
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 900 * MB },
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 800 * MB }
      ],
      files: [
        createFile("/mnt/disk2", "file2.mkv", 100),
        createFile("/mnt/disk3", "file3.mkv", 200)
      ]
    };

    const result = await Effect.runPromise(
      packTightly(worldView, {
        minSpaceBytes: 2 * MB,
        srcDiskPaths: ["/mnt/disk3"]
      })
    );

    expect(result.moves.length).toBe(1);
    expect(result.moves[0]!.file.diskPath).toBe("/mnt/disk3");
    expect(result.moves[0]!.targetDiskPath).toBe("/mnt/disk1");
  });

  test("should not move files from disk with no matching files after filtering", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000 * MB, freeBytes: 500 * MB },
        { path: "/mnt/disk2", totalBytes: 1000 * MB, freeBytes: 900 * MB },
        { path: "/mnt/disk3", totalBytes: 1000 * MB, freeBytes: 700 * MB }
      ],
      files: [
        createFile("/mnt/disk2", "small1.mkv", 5),
        createFile("/mnt/disk2", "small2.mkv", 10),
        createFile("/mnt/disk3", "large.mkv", 200)
      ]
    };

    const result = await Effect.runPromise(
      packTightly(worldView, {
        minSpaceBytes: 2 * MB,
        minFileSizeBytes: 50 * MB
      })
    );

    expect(result.moves.length).toBe(1);
    expect(result.moves[0]!.file.diskPath).toBe("/mnt/disk3");
  });
});
