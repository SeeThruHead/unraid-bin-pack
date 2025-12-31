import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Effect, Layer, pipe } from "effect";
import { BunContext } from "@effect/platform-bun";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GlobServiceTag, GlobServiceLive, type GlobError } from "@services/GlobService";
import {
  FileStatServiceTag,
  FileStatServiceLive,
  type FileStatError
} from "@services/FileStatService";
import { DiskStatsServiceTag, DiskStatsServiceLive } from "@services/DiskStatsService";

const testDirState = { value: "" };
const getTestDir = () => testDirState.value;

beforeAll(async () => {
  testDirState.value = await mkdtemp(join(tmpdir(), "infra-test-"));

  await mkdir(join(getTestDir(), "subdir"));
  await writeFile(join(getTestDir(), "file1.txt"), "hello");
  await writeFile(join(getTestDir(), "file2.txt"), "world");
  await writeFile(join(getTestDir(), "subdir", "nested.txt"), "nested");
});

afterAll(async () => {
  await rm(getTestDir(), { recursive: true, force: true });
});

describe("GlobService (real IO)", () => {
  const service = pipe(GlobServiceLive);

  test("scan finds files in directory", async () => {
    const result = await pipe(
      GlobServiceTag,
      Effect.flatMap((svc) => svc.scan("**/*", getTestDir(), { onlyFiles: true })),
      Effect.provide(service),
      Effect.runPromise
    );

    expect(result).toContain("file1.txt");
    expect(result).toContain("file2.txt");
    expect(result).toContain("subdir/nested.txt");
  });

  test("scan with pattern filter", async () => {
    const result = await pipe(
      GlobServiceTag,
      Effect.flatMap((svc) => svc.scan("*.txt", getTestDir(), { onlyFiles: true })),
      Effect.provide(service),
      Effect.runPromise
    );

    expect(result).toContain("file1.txt");
    expect(result).toContain("file2.txt");
    expect(result).not.toContain("subdir/nested.txt");
  });

  test("scan on non-existent path returns GlobNotFound error", async () => {
    const result = await pipe(
      GlobServiceTag,
      Effect.flatMap((svc) => svc.scan("**/*", "/nonexistent/path/xyz", { onlyFiles: true })),
      Effect.provide(service),
      Effect.either,
      Effect.runPromise
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      const error = result.left as GlobError;
      expect(error._tag).toBe("GlobNotFound");
      if (error._tag === "GlobNotFound") {
        expect(error.path).toBe("/nonexistent/path/xyz");
      }
    }
  });
});

describe("FileStatService (real IO)", () => {
  const service = pipe(FileStatServiceLive, Layer.provide(BunContext.layer));

  test("stat returns size for existing file", async () => {
    const result = await pipe(
      FileStatServiceTag,
      Effect.flatMap((svc) => svc.stat(join(getTestDir(), "file1.txt"))),
      Effect.provide(service),
      Effect.runPromise
    );

    expect(result.size).toBe(5);
  });

  test("stat on non-existent file returns FileNotFound error", async () => {
    const result = await pipe(
      FileStatServiceTag,
      Effect.flatMap((svc) => svc.stat(join(getTestDir(), "nonexistent.txt"))),
      Effect.provide(service),
      Effect.either,
      Effect.runPromise
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      const error = result.left as FileStatError;
      expect(error._tag).toBe("FileNotFound");
    }
  });
});

describe("DiskStatsService (real IO)", () => {
  const service = DiskStatsServiceLive;

  test("getStats returns stats for root", async () => {
    const result = await pipe(
      DiskStatsServiceTag,
      Effect.flatMap((svc) => svc.getStats("/")),
      Effect.provide(service),
      Effect.runPromise
    );

    expect(result.free).toBeGreaterThan(0);
    expect(result.size).toBeGreaterThan(0);
    expect(result.free).toBeLessThanOrEqual(result.size);
  });

  test("getStats returns stats even for non-existent paths (finds parent mount)", async () => {
    const result = await pipe(
      DiskStatsServiceTag,
      Effect.flatMap((svc) => svc.getStats("/nonexistent/path/xyz")),
      Effect.provide(service),
      Effect.runPromise
    );

    expect(result.free).toBeGreaterThan(0);
    expect(result.size).toBeGreaterThan(0);
  });
});

describe("GlobService typed errors with real IO", () => {
  const service = pipe(GlobServiceLive);

  test("real Bun.Glob ENOENT produces GlobNotFound error", async () => {
    const result = await pipe(
      GlobServiceTag,
      Effect.flatMap((svc) => svc.scan("**/*", "/nonexistent/path/xyz", { onlyFiles: true })),
      Effect.provide(service),
      Effect.either,
      Effect.runPromise
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      const error = result.left as GlobError;
      expect(error._tag).toBe("GlobNotFound");
      if (error._tag === "GlobNotFound") {
        expect(error.path).toBe("/nonexistent/path/xyz");
      }
    }
  });
});

describe("FileStatService typed errors with real IO", () => {
  const service = pipe(FileStatServiceLive, Layer.provide(BunContext.layer));

  test("real fs.stat ENOENT produces FileNotFound error", async () => {
    const result = await pipe(
      FileStatServiceTag,
      Effect.flatMap((svc) => svc.stat("/nonexistent/path/that/does/not/exist")),
      Effect.provide(service),
      Effect.either,
      Effect.runPromise
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      const error = result.left as FileStatError;
      expect(error._tag).toBe("FileNotFound");
      if (error._tag === "FileNotFound") {
        expect(error.path).toBe("/nonexistent/path/that/does/not/exist");
      }
    }
  });
});
