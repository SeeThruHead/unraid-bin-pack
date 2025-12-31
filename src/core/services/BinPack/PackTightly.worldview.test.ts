/* eslint-disable no-console */
import { describe, test, expect } from "bun:test";
import { Effect, pipe } from "effect";
import { packTightly, type WorldViewSnapshot } from "./PackTightly";
import { createWorldView, addFile } from "@domain/WorldView";

describe("PackTightly WorldView Snapshots", () => {
  test("should emit WorldView snapshots during consolidation", async () => {
    const snapshots: WorldViewSnapshot[] = [];

    const initialWorldView = pipe(
      createWorldView([
        { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 1000000000 },
        { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 1000000000 },
        { path: "/mnt/disk3", totalBytes: 1000000000, freeBytes: 1000000000 }
      ]),
      addFile("/mnt/disk1", "Movies/Movie1.mkv", 500000000),
      addFile("/mnt/disk1", "Movies/Movie2.mkv", 400000000)
    );

    const result = await Effect.runPromise(
      packTightly(initialWorldView, {
        minSpaceBytes: 10000000,
        onWorldViewChange: (snapshot) => {
          snapshots.push(snapshot);
        }
      })
    );

    expect(snapshots.length).toBeGreaterThan(0);

    expect(snapshots[0]?.action).toContain("Start:");
    expect(snapshots[0]?.step).toBe(0);

    const processingSnapshots = snapshots.filter((s) => s.action.includes("Processing"));
    expect(processingSnapshots.length).toBeGreaterThan(0);

    const moveSnapshots = snapshots.filter((s) => s.action.includes("✓") || s.action.includes("→"));
    expect(moveSnapshots.length).toBeGreaterThan(0);

    const moveSnapshot = moveSnapshots[0];
    expect(moveSnapshot?.metadata?.sourceDisk).toBeDefined();
    expect(moveSnapshot?.metadata?.targetDisk).toBeDefined();
    expect(moveSnapshot?.metadata?.movedFile).toBeDefined();
    expect(moveSnapshot?.metadata?.fileSizeMB).toBeDefined();
    expect(moveSnapshot?.metadata?.sourceFreeGB).toBeDefined();
    expect(moveSnapshot?.metadata?.targetFreeGB).toBeDefined();

    console.log("\n=== Slim WorldView Snapshots ===");
    snapshots.forEach((snapshot) => {
      console.log(`\nStep ${snapshot.step}: ${snapshot.action}`);
      if (snapshot.metadata) {
        console.log(`  Metadata:`, JSON.stringify(snapshot.metadata, null, 2));
      }
    });

    console.log("\n=== Final Result ===");
    console.log(`Moves planned: ${result.moves.length}`);
    console.log(`Bytes consolidated: ${(result.bytesConsolidated / 1024 / 1024).toFixed(0)}MB`);
  });

  test("should emit snapshot for each file move", async () => {
    const snapshots: WorldViewSnapshot[] = [];

    const initialWorldView = pipe(
      createWorldView([
        { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 1000000000 },
        { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 1000000000 }
      ]),
      addFile("/mnt/disk1", "file1.mkv", 100000000),
      addFile("/mnt/disk1", "file2.mkv", 150000000),
      addFile("/mnt/disk1", "file3.mkv", 200000000)
    );

    await Effect.runPromise(
      packTightly(initialWorldView, {
        minSpaceBytes: 10000000,
        onWorldViewChange: (snapshot) => {
          snapshots.push(snapshot);
        }
      })
    );

    const moveSnapshots = snapshots.filter((s) => s.action.includes("✓"));

    expect(moveSnapshots.length).toBeGreaterThan(0);

    snapshots.slice(1).forEach((snapshot, i) => {
      expect(snapshot.step).toBeGreaterThan(snapshots[i]!.step);
    });

    const firstMoveSnapshot = moveSnapshots[0];
    if (firstMoveSnapshot?.metadata) {
      expect(firstMoveSnapshot.metadata.sourceFreeGB).toBeGreaterThan(0);
      expect(firstMoveSnapshot.metadata.targetFreeGB).toBeGreaterThan(0);
    }
  });

  test("should show why files can't be moved", async () => {
    const snapshots: WorldViewSnapshot[] = [];

    const initialWorldView = pipe(
      createWorldView([
        { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 1000000000 },
        { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 1000000000 }
      ]),
      addFile("/mnt/disk1", "huge-file.mkv", 800000000),
      addFile("/mnt/disk2", "filler.mkv", 950000000)
    );

    await Effect.runPromise(
      packTightly(initialWorldView, {
        minSpaceBytes: 10000000,
        onWorldViewChange: (snapshot) => {
          snapshots.push(snapshot);
        }
      })
    );

    const cantMoveSnapshots = snapshots.filter((s) => s.action.includes("❌"));
    expect(cantMoveSnapshots.length).toBeGreaterThan(0);

    const cantMove = cantMoveSnapshots[0];
    expect(cantMove?.metadata?.reason).toBeDefined();
    expect(cantMove?.metadata?.reason).toContain("No destination");
  });
});
