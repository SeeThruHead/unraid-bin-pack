import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { packTightly, type WorldViewSnapshot } from "./PackTightly"
import type { WorldView } from "@domain/WorldView"
import type { FileEntry } from "@domain/FileEntry"

describe("PackTightly WorldView Snapshots", () => {
  test("should emit WorldView snapshots during consolidation", async () => {
    const snapshots: WorldViewSnapshot[] = []

    const initialWorldView: WorldView = {
      disks: [
        {
          path: "/mnt/disk1",
          totalBytes: 1000000000, // 1GB
          freeBytes: 100000000,    // 100MB free
        },
        {
          path: "/mnt/disk2",
          totalBytes: 1000000000,
          freeBytes: 800000000,    // 800MB free
        },
        {
          path: "/mnt/disk3",
          totalBytes: 1000000000,
          freeBytes: 950000000,    // 950MB free
        },
      ],
      files: [
        {
          diskPath: "/mnt/disk1",
          relativePath: "Movies/Movie1.mkv",
          absolutePath: "/mnt/disk1/Movies/Movie1.mkv",
          sizeBytes: 500000000, // 500MB
        },
        {
          diskPath: "/mnt/disk1",
          relativePath: "Movies/Movie2.mkv",
          absolutePath: "/mnt/disk1/Movies/Movie2.mkv",
          sizeBytes: 400000000, // 400MB
        },
      ],
    }

    const result = await Effect.runPromise(
      packTightly(initialWorldView, {
        minSpaceBytes: 10000000, // 10MB min space
        onWorldViewChange: (snapshot) => {
          snapshots.push(snapshot)
        },
      })
    )

    // Verify snapshots were emitted
    expect(snapshots.length).toBeGreaterThan(0)

    // First snapshot should be initial state
    expect(snapshots[0]?.action).toContain("Start:")
    expect(snapshots[0]?.step).toBe(0)

    // Should have snapshots for processing disk
    const processingSnapshots = snapshots.filter(s => s.action.includes("Processing"))
    expect(processingSnapshots.length).toBeGreaterThan(0)

    // Should have snapshots for moved files (using new format with ✓ or →)
    const moveSnapshots = snapshots.filter(s => s.action.includes("✓") || s.action.includes("→"))
    expect(moveSnapshots.length).toBeGreaterThan(0)

    // Verify metadata is included
    const moveSnapshot = moveSnapshots[0]
    expect(moveSnapshot?.metadata?.sourceDisk).toBeDefined()
    expect(moveSnapshot?.metadata?.targetDisk).toBeDefined()
    expect(moveSnapshot?.metadata?.movedFile).toBeDefined()
    expect(moveSnapshot?.metadata?.fileSizeMB).toBeDefined()
    expect(moveSnapshot?.metadata?.sourceFreeGB).toBeDefined()
    expect(moveSnapshot?.metadata?.targetFreeGB).toBeDefined()

    // Log all snapshots for debugging
    console.log("\n=== Slim WorldView Snapshots ===")
    snapshots.forEach((snapshot) => {
      console.log(`\nStep ${snapshot.step}: ${snapshot.action}`)
      if (snapshot.metadata) {
        console.log(`  Metadata:`, JSON.stringify(snapshot.metadata, null, 2))
      }
    })

    console.log("\n=== Final Result ===")
    console.log(`Moves planned: ${result.moves.length}`)
    console.log(`Bytes consolidated: ${(result.bytesConsolidated / 1024 / 1024).toFixed(0)}MB`)
  })

  test("should emit snapshot for each file move", async () => {
    const snapshots: WorldViewSnapshot[] = []

    const initialWorldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 200000000 },
        { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 900000000 },
      ],
      files: [
        {
          diskPath: "/mnt/disk1",
          relativePath: "file1.mkv",
          absolutePath: "/mnt/disk1/file1.mkv",
          sizeBytes: 100000000,
        },
        {
          diskPath: "/mnt/disk1",
          relativePath: "file2.mkv",
          absolutePath: "/mnt/disk1/file2.mkv",
          sizeBytes: 150000000,
        },
        {
          diskPath: "/mnt/disk1",
          relativePath: "file3.mkv",
          absolutePath: "/mnt/disk1/file3.mkv",
          sizeBytes: 200000000,
        },
      ],
    }

    await Effect.runPromise(
      packTightly(initialWorldView, {
        minSpaceBytes: 10000000,
        onWorldViewChange: (snapshot) => {
          snapshots.push(snapshot)
        },
      })
    )

    // Count move snapshots (new format uses ✓)
    const moveSnapshots = snapshots.filter(s => s.action.includes("✓"))

    // Should have one snapshot per file move
    expect(moveSnapshots.length).toBeGreaterThan(0)

    // Each move should have incremental step numbers
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i]!.step).toBeGreaterThan(snapshots[i - 1]!.step)
    }

    // Verify metadata includes free space info
    const firstMoveSnapshot = moveSnapshots[0]
    if (firstMoveSnapshot?.metadata) {
      expect(firstMoveSnapshot.metadata.sourceFreeGB).toBeGreaterThan(0)
      expect(firstMoveSnapshot.metadata.targetFreeGB).toBeGreaterThan(0)
    }
  })

  test("should show why files can't be moved", async () => {
    const snapshots: WorldViewSnapshot[] = []

    const initialWorldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 100000000 },
        { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 50000000 }, // Not enough space
      ],
      files: [
        {
          diskPath: "/mnt/disk1",
          relativePath: "huge-file.mkv",
          absolutePath: "/mnt/disk1/huge-file.mkv",
          sizeBytes: 800000000, // Too big for disk2
        },
      ],
    }

    await Effect.runPromise(
      packTightly(initialWorldView, {
        minSpaceBytes: 10000000,
        onWorldViewChange: (snapshot) => {
          snapshots.push(snapshot)
        },
      })
    )

    // Should have a "can't move" snapshot with reason
    const cantMoveSnapshots = snapshots.filter(s => s.action.includes("❌"))
    expect(cantMoveSnapshots.length).toBeGreaterThan(0)

    const cantMove = cantMoveSnapshots[0]
    expect(cantMove?.metadata?.reason).toBeDefined()
    expect(cantMove?.metadata?.reason).toContain("No destination")
  })
})
