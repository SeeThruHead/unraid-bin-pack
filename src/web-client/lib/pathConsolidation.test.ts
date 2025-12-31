import { describe, expect, test } from "bun:test";
import { consolidatePaths, expandPaths } from "./pathConsolidation";
import type { PatternResponse } from "../types";

describe("consolidatePaths", () => {
  test("returns parent when parent is explicitly selected", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/Anime", name: "Anime", children: ["Season1", "Season2"] }
    ];
    const checkedPaths = ["/mnt/disk1/Anime"];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual(["/mnt/disk1/Anime"]);
  });

  test("returns parent when all children are selected", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/Anime", name: "Anime", children: ["Season1", "Season2"] }
    ];
    const checkedPaths = ["/mnt/disk1/Anime/Season1", "/mnt/disk1/Anime/Season2"];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual(["/mnt/disk1/Anime"]);
  });

  test("returns only selected children when not all are selected", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/Anime", name: "Anime", children: ["Season1", "Season2", "Season3"] }
    ];
    const checkedPaths = ["/mnt/disk1/Anime/Season1", "/mnt/disk1/Anime/Season3"];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual([
      "/mnt/disk1/Anime/Season1",
      "/mnt/disk1/Anime/Season3"
    ]);
  });

  test("handles pattern with no children", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/Empty", name: "Empty", children: [] }
    ];
    const checkedPaths = ["/mnt/disk1/Empty"];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual(["/mnt/disk1/Empty"]);
  });

  test("handles pattern with no children and not selected", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/Empty", name: "Empty", children: [] }
    ];
    const checkedPaths: string[] = [];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual([]);
  });

  test("handles multiple patterns independently", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/Anime", name: "Anime", children: ["Season1", "Season2"] },
      { pattern: "/mnt/disk1/Movies", name: "Movies", children: ["Action", "Comedy"] },
      { pattern: "/mnt/disk1/TV", name: "TV", children: ["Show1", "Show2", "Show3"] }
    ];
    const checkedPaths = [
      "/mnt/disk1/Anime/Season1",
      "/mnt/disk1/Anime/Season2",
      "/mnt/disk1/Movies",
      "/mnt/disk1/TV/Show1"
    ];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual([
      "/mnt/disk1/Anime",
      "/mnt/disk1/Movies",
      "/mnt/disk1/TV/Show1"
    ]);
  });

  test("prefers parent when both parent and all children are selected", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/Anime", name: "Anime", children: ["Season1", "Season2"] }
    ];
    const checkedPaths = [
      "/mnt/disk1/Anime",
      "/mnt/disk1/Anime/Season1",
      "/mnt/disk1/Anime/Season2"
    ];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual(["/mnt/disk1/Anime"]);
  });

  test("handles empty checked paths", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/Anime", name: "Anime", children: ["Season1", "Season2"] },
      { pattern: "/mnt/disk1/Movies", name: "Movies", children: ["Action"] }
    ];
    const checkedPaths: string[] = [];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual([]);
  });

  test("handles empty patterns", () => {
    const patterns: PatternResponse[] = [];
    const checkedPaths = ["/mnt/disk1/Anime/Season1"];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual([]);
  });

  test("ignores paths not matching any pattern", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/Anime", name: "Anime", children: ["Season1"] }
    ];
    const checkedPaths = ["/mnt/disk1/Anime/Season1", "/mnt/disk1/Random/Path"];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual(["/mnt/disk1/Anime"]);
  });

  test("handles complex real-world scenario", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk8/Anime", name: "Anime", children: ["MyAnime", "SomeAnime"] },
      { pattern: "/mnt/disk8/Movies", name: "Movies", children: ["Action", "Comedy", "Drama"] },
      { pattern: "/mnt/disk8/TV", name: "TV", children: ["Series1", "Series2"] },
      { pattern: "/mnt/disk8/ROMs", name: "ROMs", children: [] }
    ];
    const checkedPaths = [
      "/mnt/disk8/Anime/MyAnime",
      "/mnt/disk8/Anime/SomeAnime",
      "/mnt/disk8/Movies/Action",
      "/mnt/disk8/TV",
      "/mnt/disk8/ROMs"
    ];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual([
      "/mnt/disk8/Anime",
      "/mnt/disk8/Movies/Action",
      "/mnt/disk8/TV",
      "/mnt/disk8/ROMs"
    ]);
  });

  test("maintains order of patterns", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/C", name: "C", children: ["C1"] },
      { pattern: "/mnt/disk1/A", name: "A", children: ["A1"] },
      { pattern: "/mnt/disk1/B", name: "B", children: ["B1"] }
    ];
    const checkedPaths = ["/mnt/disk1/C/C1", "/mnt/disk1/A/A1", "/mnt/disk1/B/B1"];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual([
      "/mnt/disk1/C",
      "/mnt/disk1/A",
      "/mnt/disk1/B"
    ]);
  });

  test("handles single child consolidation", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk1/Single", name: "Single", children: ["OnlyChild"] }
    ];
    const checkedPaths = ["/mnt/disk1/Single/OnlyChild"];

    expect(consolidatePaths(checkedPaths, patterns)).toEqual(["/mnt/disk1/Single"]);
  });
});

describe("expandPaths", () => {
  test("expands parent path to include all children", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk8/Anime", name: "Anime", children: ["Season1", "Season2"] }
    ];
    const consolidatedPaths = ["/mnt/disk8/Anime"];

    expect(expandPaths(consolidatedPaths, patterns)).toEqual([
      "/mnt/disk8/Anime",
      "/mnt/disk8/Anime/Season1",
      "/mnt/disk8/Anime/Season2"
    ]);
  });

  test("keeps individual child paths as-is", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk8/Anime", name: "Anime", children: ["Season1", "Season2", "Season3"] }
    ];
    const consolidatedPaths = ["/mnt/disk8/Anime/Season1", "/mnt/disk8/Anime/Season3"];

    expect(expandPaths(consolidatedPaths, patterns)).toEqual([
      "/mnt/disk8/Anime/Season1",
      "/mnt/disk8/Anime/Season3"
    ]);
  });

  test("handles mixed parent and child selections", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk8/Anime", name: "Anime", children: ["Season1", "Season2"] },
      { pattern: "/mnt/disk8/Movies", name: "Movies", children: ["Action", "Comedy"] },
      { pattern: "/mnt/disk8/TV", name: "TV", children: ["Show1", "Show2"] }
    ];
    const consolidatedPaths = ["/mnt/disk8/Anime", "/mnt/disk8/Movies/Action", "/mnt/disk8/TV"];

    expect(expandPaths(consolidatedPaths, patterns)).toEqual([
      "/mnt/disk8/Anime",
      "/mnt/disk8/Anime/Season1",
      "/mnt/disk8/Anime/Season2",
      "/mnt/disk8/Movies/Action",
      "/mnt/disk8/TV",
      "/mnt/disk8/TV/Show1",
      "/mnt/disk8/TV/Show2"
    ]);
  });

  test("handles empty consolidated paths", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk8/Anime", name: "Anime", children: ["Season1"] }
    ];
    const consolidatedPaths: string[] = [];

    expect(expandPaths(consolidatedPaths, patterns)).toEqual([]);
  });

  test("roundtrip: consolidate then expand returns correct tree state", () => {
    const patterns: PatternResponse[] = [
      { pattern: "/mnt/disk8/TV", name: "TV", children: ["Show1", "Show2", "Show3"] }
    ];
    const initialChecked = ["/mnt/disk8/TV"];

    const expanded = expandPaths(initialChecked, patterns);
    expect(expanded).toEqual([
      "/mnt/disk8/TV",
      "/mnt/disk8/TV/Show1",
      "/mnt/disk8/TV/Show2",
      "/mnt/disk8/TV/Show3"
    ]);

    const consolidated = consolidatePaths(expanded, patterns);
    expect(consolidated).toEqual(["/mnt/disk8/TV"]);
  });
});
