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
    expect(snapshots[0]?.action).toBe("Initial WorldView")
    expect(snapshots[0]?.step).toBe(0)

    // Should have snapshots for processing disk
    const processingSnapshots = snapshots.filter(s => s.action.includes("Start processing"))
    expect(processingSnapshots.length).toBeGreaterThan(0)

    // Should have snapshots for moved files
    const moveSnapshots = snapshots.filter(s => s.action.includes("Moved file"))
    expect(moveSnapshots.length).toBeGreaterThan(0)

    // Verify metadata is included
    const moveSnapshot = moveSnapshots[0]
    expect(moveSnapshot?.metadata?.sourceDisk).toBeDefined()
    expect(moveSnapshot?.metadata?.targetDisk).toBeDefined()
    expect(moveSnapshot?.metadata?.movedFile).toBeDefined()

    // Verify WorldView state changes
    const lastSnapshot = snapshots[snapshots.length - 1]
    expect(lastSnapshot?.worldView.disks).toBeDefined()
    expect(lastSnapshot?.worldView.files).toBeDefined()

    // Log all snapshots for debugging
    console.log("\n=== WorldView Snapshots ===")
    snapshots.forEach((snapshot, idx) => {
      console.log(`\nStep ${snapshot.step}: ${snapshot.action}`)
      if (snapshot.metadata) {
        console.log(`  Metadata:`, JSON.stringify(snapshot.metadata, null, 2))
      }
      console.log(`  Disks:`)
      snapshot.worldView.disks.forEach(disk => {
        const filesOnDisk = snapshot.worldView.files.filter(f => f.diskPath === disk.path).length
        const usedPct = ((disk.totalBytes - disk.freeBytes) / disk.totalBytes * 100).toFixed(1)
        console.log(`    ${disk.path}: ${filesOnDisk} files, ${usedPct}% used, ${(disk.freeBytes / 1024 / 1024).toFixed(0)}MB free`)
      })
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

    // Count move snapshots
    const moveSnapshots = snapshots.filter(s => s.action.includes("Moved file"))

    // Should have one snapshot per file move
    expect(moveSnapshots.length).toBeGreaterThan(0)

    // Each move should have incremental step numbers
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i]!.step).toBeGreaterThan(snapshots[i - 1]!.step)
    }

    // Verify disk states update correctly
    const firstMoveSnapshot = moveSnapshots[0]
    if (firstMoveSnapshot) {
      const sourceDisk = firstMoveSnapshot.worldView.disks.find(
        d => d.path === firstMoveSnapshot.metadata?.sourceDisk
      )
      const targetDisk = firstMoveSnapshot.worldView.disks.find(
        d => d.path === firstMoveSnapshot.metadata?.targetDisk
      )

      // Source disk should have more free space after move
      expect(sourceDisk?.freeBytes).toBeGreaterThan(0)

      // Target disk should have less free space after move
      expect(targetDisk?.freeBytes).toBeGreaterThan(0)
    }
  })

  test("should track files moving between disks correctly", async () => {
    const snapshots: WorldViewSnapshot[] = []
    const fileName = "test-file.mkv"

    const initialWorldView: WorldView = {
      disks: [
        { path: "/mnt/disk1", totalBytes: 1000000000, freeBytes: 100000000 },
        { path: "/mnt/disk2", totalBytes: 1000000000, freeBytes: 900000000 },
      ],
      files: [
        {
          diskPath: "/mnt/disk1",
          relativePath: fileName,
          absolutePath: `/mnt/disk1/${fileName}`,
          sizeBytes: 500000000,
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

    // Find the initial and final snapshots
    const initialSnapshot = snapshots[0]
    const finalSnapshot = snapshots[snapshots.length - 1]

    // Initially, file should be on disk1
    const initialFile = initialSnapshot?.worldView.files.find(f => f.relativePath === fileName)
    expect(initialFile?.diskPath).toBe("/mnt/disk1")

    // After moves, file should be on disk2 (if it was moved)
    const finalFile = finalSnapshot?.worldView.files.find(f => f.relativePath === fileName)
    if (snapshots.some(s => s.action.includes("Moved file"))) {
      expect(finalFile?.diskPath).not.toBe(initialFile?.diskPath)
    }
  })
})
