import { describe, expect, test } from "bun:test"
import { groupByTopLevelFolder, groupByImmediateFolder, sortBySize } from "./FolderGroup"
import type { FileEntry } from "./FileEntry"

const makeFile = (relativePath: string, sizeBytes: number): FileEntry => ({
  absolutePath: `/mnt/disk/${relativePath}`,
  relativePath,
  sizeBytes,
  diskPath: "/mnt/disk",
})

describe("FolderGroup", () => {
  describe("groupByImmediateFolder", () => {
    test("groups files by immediate parent folder", () => {
      const files: FileEntry[] = [
        makeFile("movies/Inception/movie.mkv", 50_000_000_000),
        makeFile("movies/Inception/extras.mkv", 1_000_000_000),
        makeFile("movies/Matrix/movie.mkv", 40_000_000_000),
        makeFile("anime/show1/season1/ep01.mkv", 500_000_000),
        makeFile("anime/show1/season1/ep02.mkv", 500_000_000),
      ]

      const groups = groupByImmediateFolder(files)

      expect(groups).toHaveLength(3)

      const inceptionGroup = groups.find((g) => g.folderPath === "movies/Inception")
      expect(inceptionGroup?.files).toHaveLength(2)

      const matrixGroup = groups.find((g) => g.folderPath === "movies/Matrix")
      expect(matrixGroup?.files).toHaveLength(1)

      const seasonGroup = groups.find((g) => g.folderPath === "anime/show1/season1")
      expect(seasonGroup?.files).toHaveLength(2)
    })

    test("root-level files go to empty folder", () => {
      const files: FileEntry[] = [
        makeFile("readme.txt", 1000),
        makeFile("config.json", 500),
      ]

      const groups = groupByImmediateFolder(files)

      expect(groups).toHaveLength(1)
      expect(groups[0]?.folderPath).toBe("")
      expect(groups[0]?.files).toHaveLength(2)
    })

    describe("keepTogether heuristics", () => {
      test("small folders are kept together", () => {
        const files: FileEntry[] = [
          makeFile("small-project/a.txt", 100_000_000), // 100MB
          makeFile("small-project/b.txt", 100_000_000),
          makeFile("small-project/c.txt", 100_000_000),
        ]

        const groups = groupByImmediateFolder(files, {
          minSplitSizeBytes: 1024 * 1024 * 1024, // 1GB
          folderThreshold: 0.9,
        })

        expect(groups).toHaveLength(1)
        expect(groups[0]?.keepTogether).toBe(true) // 300MB < 1GB
      })

      test("folders with dominant file are kept together", () => {
        // Movie folder: one big file (90%) + extras (10%)
        const files: FileEntry[] = [
          makeFile("movie/main.mkv", 45_000_000_000), // 45GB
          makeFile("movie/subs.srt", 5_000_000_000),  // 5GB
        ]

        const groups = groupByImmediateFolder(files, {
          minSplitSizeBytes: 1024 * 1024 * 1024, // 1GB
          folderThreshold: 0.9, // 90%
        })

        expect(groups).toHaveLength(1)
        expect(groups[0]?.keepTogether).toBe(true) // 45GB is 90% of 50GB
      })

      test("large folders without dominant file can be split", () => {
        // TV season: many equal-sized episodes
        const files: FileEntry[] = [
          makeFile("anime/season1/ep01.mkv", 500_000_000), // 500MB
          makeFile("anime/season1/ep02.mkv", 500_000_000),
          makeFile("anime/season1/ep03.mkv", 500_000_000),
          makeFile("anime/season1/ep04.mkv", 500_000_000),
        ]

        const groups = groupByImmediateFolder(files, {
          minSplitSizeBytes: 1024 * 1024 * 1024, // 1GB
          folderThreshold: 0.9, // 90%
        })

        expect(groups).toHaveLength(1)
        expect(groups[0]?.totalBytes).toBe(2_000_000_000) // 2GB > 1GB
        expect(groups[0]?.largestFileBytes).toBe(500_000_000) // 25% of total
        expect(groups[0]?.keepTogether).toBe(false) // Can be split
      })
    })
  })

  describe("groupByTopLevelFolder (deprecated)", () => {
    test("groups files by top-level folder", () => {
      const files: FileEntry[] = [
        makeFile("movies/a.mkv", 100),
        makeFile("movies/b.mkv", 200),
        makeFile("anime/show/ep1.mkv", 50),
        makeFile("anime/show/ep2.mkv", 50),
      ]

      const groups = groupByTopLevelFolder(files)

      expect(groups).toHaveLength(2)

      const movies = groups.find((g) => g.folderPath === "movies")
      const anime = groups.find((g) => g.folderPath === "anime")

      expect(movies?.files).toHaveLength(2)
      expect(movies?.totalBytes).toBe(300)

      expect(anime?.files).toHaveLength(2)
      expect(anime?.totalBytes).toBe(100)
    })

    test("handles root-level files (no folder)", () => {
      const files: FileEntry[] = [
        makeFile("readme.txt", 10),
        makeFile("notes.md", 20),
      ]

      const groups = groupByTopLevelFolder(files)

      expect(groups).toHaveLength(1)
      expect(groups[0]?.folderPath).toBe("")
      expect(groups[0]?.totalBytes).toBe(30)
    })

    test("handles mixed root and folder files", () => {
      const files: FileEntry[] = [
        makeFile("readme.txt", 10),
        makeFile("docs/guide.md", 20),
      ]

      const groups = groupByTopLevelFolder(files)

      expect(groups).toHaveLength(2)
      expect(groups.some((g) => g.folderPath === "")).toBe(true)
      expect(groups.some((g) => g.folderPath === "docs")).toBe(true)
    })
  })

  describe("sortBySize", () => {
    test("sorts folders by total size descending", () => {
      const files: FileEntry[] = [
        makeFile("small/a.txt", 10),
        makeFile("large/a.mkv", 1000),
        makeFile("medium/a.mp3", 100),
      ]

      const groups = groupByTopLevelFolder(files)
      const sorted = sortBySize(groups)

      expect(sorted[0]?.folderPath).toBe("large")
      expect(sorted[1]?.folderPath).toBe("medium")
      expect(sorted[2]?.folderPath).toBe("small")
    })
  })
})
