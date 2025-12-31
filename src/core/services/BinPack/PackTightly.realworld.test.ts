/* eslint-disable no-console */
import { describe, test, expect } from "bun:test";
import { Effect, Logger, LogLevel } from "effect";
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

describe("PackTightly - Real World Scenario", () => {
  test("should consolidate VM disks to empty disk1 and disk8", async () => {
    const worldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 974 * MB, freeBytes: 213 * MB },
        { path: "/mnt/disk2", totalBytes: 974 * MB, freeBytes: 159 * MB },
        { path: "/mnt/disk3", totalBytes: 974 * MB, freeBytes: 136 * MB },
        { path: "/mnt/disk4", totalBytes: 974 * MB, freeBytes: 94 * MB },
        { path: "/mnt/disk5", totalBytes: 974 * MB, freeBytes: 60 * MB },
        { path: "/mnt/disk6", totalBytes: 974 * MB, freeBytes: 32 * MB },
        { path: "/mnt/disk7", totalBytes: 974 * MB, freeBytes: 24 * MB },
        { path: "/mnt/disk8", totalBytes: 974 * MB, freeBytes: 295 * MB }
      ],
      files: [
        createFile("/mnt/disk1", "/Anime/file1.mkv", 344),
        createFile("/mnt/disk1", "/Movies/file2.mkv", 115),
        createFile("/mnt/disk1", "/Roms/file3.bin", 4),
        createFile("/mnt/disk1", "/TV/file4.mkv", 233),

        createFile("/mnt/disk2", "/Anime/file5.mkv", 376),
        createFile("/mnt/disk2", "/Movies/file6.mkv", 139),
        createFile("/mnt/disk2", "/Roms/file7.bin", 4),
        createFile("/mnt/disk2", "/TV/file8.mkv", 232),

        createFile("/mnt/disk3", "/Anime/file9.mkv", 373),
        createFile("/mnt/disk3", "/Movies/file10.mkv", 142),
        createFile("/mnt/disk3", "/Roms/file11.bin", 5),
        createFile("/mnt/disk3", "/TV/file12.mkv", 254),

        createFile("/mnt/disk4", "/Anime/file13.mkv", 348),
        createFile("/mnt/disk4", "/Movies/file14.mkv", 171),
        createFile("/mnt/disk4", "/Roms/file15.bin", 5),
        createFile("/mnt/disk4", "/TV/file16.mkv", 291),

        createFile("/mnt/disk5", "/Anime/file17.mkv", 390),
        createFile("/mnt/disk5", "/Movies/file18.mkv", 174),
        createFile("/mnt/disk5", "/Roms/file19.bin", 6),
        createFile("/mnt/disk5", "/TV/file20.mkv", 280),

        createFile("/mnt/disk6", "/Anime/file21.mkv", 378),
        createFile("/mnt/disk6", "/Movies/file22.mkv", 158),
        createFile("/mnt/disk6", "/Roms/file23.bin", 4),
        createFile("/mnt/disk6", "/TV/file24.mkv", 338),

        createFile("/mnt/disk7", "/Anime/file25.mkv", 376),
        createFile("/mnt/disk7", "/Movies/file26.mkv", 158),
        createFile("/mnt/disk7", "/Roms/file27.bin", 5),
        createFile("/mnt/disk7", "/TV/file28.mkv", 347),

        createFile("/mnt/disk8", "/Anime/file29.mkv", 249),
        createFile("/mnt/disk8", "/Movies/file30.mkv", 95),
        createFile("/mnt/disk8", "/Roms/file31.bin", 33),
        createFile("/mnt/disk8", "/TV/file32.mkv", 237)
      ]
    };

    const result = await Effect.runPromise(
      packTightly(worldView, { minSpaceBytes: 2 * MB }).pipe(
        Effect.provide(Logger.pretty),
        Logger.withMinimumLogLevel(LogLevel.Debug)
      )
    );

    console.log("\n=== CONSOLIDATION RESULT ===");
    console.log(`Total moves: ${result.moves.length}`);
    console.log(`Bytes consolidated: ${(result.bytesConsolidated / MB).toFixed(0)} MB`);

    const movesBySrc = result.moves.reduce(
      (acc, m) => {
        acc[m.file.diskPath] = (acc[m.file.diskPath] || 0) + m.file.sizeBytes;
        return acc;
      },
      {} as Record<string, number>
    );

    const movesByDest = result.moves.reduce(
      (acc, m) => {
        acc[m.targetDiskPath] = (acc[m.targetDiskPath] || 0) + m.file.sizeBytes;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log("\nData moved FROM each disk:");
    Object.entries(movesBySrc)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([disk, bytes]) => {
        console.log(`  ${disk}: ${(bytes / MB).toFixed(0)} MB moved OFF`);
      });

    console.log("\nData moved TO each disk:");
    Object.entries(movesByDest)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([disk, bytes]) => {
        console.log(`  ${disk}: ${(bytes / MB).toFixed(0)} MB moved ON`);
      });

    expect(movesBySrc["/mnt/disk8"]).toBeGreaterThan(0);

    expect(movesBySrc["/mnt/disk1"]).toBeGreaterThan(0);

    const fullerDisksReceivedData =
      (movesByDest["/mnt/disk5"] || 0) +
      (movesByDest["/mnt/disk6"] || 0) +
      (movesByDest["/mnt/disk7"] || 0);

    expect(fullerDisksReceivedData).toBeGreaterThan(0);
  });
});
