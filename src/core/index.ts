import { Effect, Layer, pipe } from "effect";
import { FileSystem } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";

export interface PlanConfig {
  readonly src?: string;
  readonly dest?: string;
  readonly minSpace?: string;
  readonly minFileSize?: string;
  readonly pathFilter?: string;
  readonly include?: string;
  readonly exclude?: string;
  readonly minSplitSize?: string;
  readonly moveAsFolderThreshold?: string;
  readonly debug?: boolean;
}

export interface ApplyConfig {
  readonly planPath: string;
  readonly concurrency: number;
  readonly dryRun: boolean;
}

export type { FileEntry } from "./domain/FileEntry";
export type { FileMove, MovePlan } from "./domain/MovePlan";
export type { WorldView, DiskState } from "./domain/WorldView";
export type { Disk } from "./domain/Disk";
export type { WorldViewSnapshot } from "./services/BinPack/PackTightly";
export type {
  CompactEvent,
  ParsedEvent,
  InitEventData,
  MoveEventData,
  FailEventData,
  NoteEventData
} from "./services/BinPack/CompactEventLogger";
export { parseEvent } from "./services/BinPack/CompactEventLogger";

export type {
  DiskNotFound,
  DiskNotADirectory,
  DiskNotAMountPoint,
  DiskPermissionDenied,
  DiskStatsFailed
} from "./services/DiskService/DiskService";

export type {
  ScanPathNotFound,
  ScanPermissionDenied,
  ScanFailed,
  FileStatFailed
} from "./services/ScannerService/ScannerService";

export type {
  TransferSourceNotFound,
  TransferSourcePermissionDenied,
  TransferDestinationPermissionDenied,
  TransferDiskFull,
  TransferBackendUnavailable,
  TransferFailed
} from "./services/TransferService/TransferService";

import { DiskServiceTag, DiskServiceFullLive } from "./services/DiskService";
import { ScannerServiceTag, ScannerServiceLive } from "./services/ScannerService";
import { RsyncTransferService } from "./services/TransferService";
import { LoggerServiceLive } from "./services/LoggerService";
import { PlanGeneratorServiceTag } from "./services/PlanGenerator";
import { BashRsyncPlanGenerator } from "./services/PlanScriptGenerator";
import { GlobServiceLive } from "./services/GlobService";
import { FileStatServiceLive } from "./services/FileStatService";
import { ShellServiceLive } from "./services/ShellService";

import type { WorldView } from "./domain/WorldView";
import type { DiskSnapshot } from "./domain/DiskProjection";
import { projectDiskStates } from "./domain/DiskProjection";
import { optimizeMoveChains } from "./domain/MoveOptimization";
import { createMovePlan } from "./domain/MovePlan";
import { packTightly } from "./services/BinPack";
import { parseSize } from "./lib/parseSize";

export interface PlanResult {
  readonly script: string;
  readonly stats: {
    readonly bytesConsolidated: number;
    readonly movesPlanned: number;
    readonly skipped: number;
    readonly disksEvacuated: number;
  };
  readonly diskProjections: ReadonlyArray<{
    readonly path: string;
    readonly totalBytes: number;
    readonly currentFree: number;
    readonly freeAfter: number;
    readonly usedPercent: number;
    readonly usedPercentAfter: number;
  }>;
  readonly worldViewSnapshots?: ReadonlyArray<
    import("./services/BinPack/PackTightly").WorldViewSnapshot
  >;
  readonly compactEvents?: ReadonlyArray<
    import("./services/BinPack/CompactEventLogger").CompactEvent
  >;
}

export interface ExecutionResult {
  readonly success: boolean;
  readonly output: string;
}

const parseConfig = (config: PlanConfig) =>
  Effect.gen(function* () {
    const minSpaceBytes = config.minSpace ? yield* parseSize(config.minSpace) : 0;
    const minFileSizeBytes = config.minFileSize ? yield* parseSize(config.minFileSize) : 0;
    const minSplitSizeBytes = config.minSplitSize
      ? yield* parseSize(config.minSplitSize)
      : yield* parseSize("1GB");

    return {
      minSpaceBytes,
      minFileSizeBytes,
      minSplitSizeBytes,
      moveAsFolderThresholdPct: config.moveAsFolderThreshold
        ? parseFloat(config.moveAsFolderThreshold)
        : 0.9,
      excludePatterns: config.exclude?.split(",").map((s) => s.trim()) ?? [],
      pathPrefixes: config.pathFilter?.split(",").map((s) => s.trim()) ?? [],
      srcDiskPaths: config.src?.split(",").map((s) => s.trim()),
      debug: config.debug ?? false
    };
  });

export const createPlan = (diskPaths: string[] | readonly string[], config: PlanConfig) =>
  Effect.gen(function* () {
    const diskService = yield* DiskServiceTag;
    const scannerService = yield* ScannerServiceTag;
    const planGenerator = yield* PlanGeneratorServiceTag;

    const parsed = yield* parseConfig(config);
    yield* Effect.logDebug(`Config: src=${config.src}, dest=${config.dest}`);
    yield* Effect.logDebug(
      `Parsed srcDiskPaths: ${parsed.srcDiskPaths?.join(", ") ?? "undefined"}`
    );

    const allDisks = yield* diskService.discover([...diskPaths]);

    const allFiles = yield* Effect.flatMap(
      Effect.forEach(allDisks, (disk) =>
        scannerService.scanDisk(disk.path, {
          excludePatterns: parsed.excludePatterns
        })
      ),
      (fileArrays) => Effect.succeed(fileArrays.flat())
    );

    const initialWorldView: WorldView = {
      disks: allDisks.map((disk) => ({
        path: disk.path,
        totalBytes: disk.totalBytes,
        freeBytes: disk.freeBytes
      })),
      files: allFiles
    };

    const worldViewSnapshots: import("./services/BinPack/PackTightly").WorldViewSnapshot[] = [];
    const compactEvents: import("./services/BinPack/CompactEventLogger").CompactEvent[] = [];

    const result = yield* packTightly(initialWorldView, {
      minSpaceBytes: parsed.minSpaceBytes,
      minFileSizeBytes: parsed.minFileSizeBytes,
      pathPrefixes: parsed.pathPrefixes,
      srcDiskPaths: parsed.srcDiskPaths,
      onWorldViewChange: (snapshot) => {
        worldViewSnapshots.push(snapshot);
      },
      onCompactEvent: (event) => {
        compactEvents.push(event);
      }
    });

    const optimizedMoves = optimizeMoveChains(result.moves);

    const pendingMoves = optimizedMoves.filter((m) => m.status === "pending");
    const skippedMoves = optimizedMoves.filter((m) => m.status === "skipped");

    const initialDiskSnapshots: DiskSnapshot[] = allDisks.map((d) => ({
      path: d.path,
      totalBytes: d.totalBytes,
      freeBytes: d.freeBytes
    }));
    const projection = projectDiskStates(initialDiskSnapshots, optimizedMoves);

    const plan = createMovePlan(optimizedMoves);
    const allDestDiskPaths = new Set(optimizedMoves.map((m) => m.targetDiskPath));
    const diskStats = Object.fromEntries(
      allDisks
        .filter((disk) => allDestDiskPaths.has(disk.path))
        .map((disk) => [
          disk.path,
          {
            path: disk.path,
            totalBytes: disk.totalBytes,
            freeBytes: disk.freeBytes
          }
        ])
    );

    const primarySourceDisk =
      parsed.srcDiskPaths?.[0] ?? optimizedMoves[0]?.file.diskPath ?? "auto";
    const script = yield* planGenerator.generate({
      moves: plan.moves,
      sourceDisk: primarySourceDisk,
      diskStats,
      concurrency: 4
    });

    const diskProjections = allDisks.map((disk) => {
      const projectedState = projection.final.find((d) => d.path === disk.path);
      const freeAfter = projectedState?.freeBytes ?? disk.freeBytes;
      const usedBefore = disk.totalBytes - disk.freeBytes;
      const usedAfter = disk.totalBytes - freeAfter;

      return {
        path: disk.path,
        totalBytes: disk.totalBytes,
        currentFree: disk.freeBytes,
        freeAfter,
        usedPercent: (usedBefore / disk.totalBytes) * 100,
        usedPercentAfter: (usedAfter / disk.totalBytes) * 100
      };
    });

    const includeSnapshots = parsed.debug;
    const filteredSnapshots = includeSnapshots
      ? worldViewSnapshots.filter((snapshot) => {
          const action = snapshot.action;

          return (
            action.startsWith("Start:") ||
            action.startsWith("Filtered") ||
            action.startsWith("Processing ") ||
            action.startsWith("❌ Can't move") ||
            ((action.includes("✅") || action.includes("⚠️") || action.includes("❌")) &&
              snapshot.metadata?.movedCount !== undefined)
          );
        })
      : undefined;

    return {
      script,
      stats: {
        bytesConsolidated: result.bytesConsolidated,
        movesPlanned: pendingMoves.length,
        skipped: skippedMoves.length,
        disksEvacuated: projection.evacuatedCount
      },
      diskProjections,
      worldViewSnapshots: filteredSnapshots,
      compactEvents
    } satisfies PlanResult;
  });

export const executePlanScript = (scriptPath: string, config: ApplyConfig) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const scriptExists = yield* pipe(
      fs.access(scriptPath),
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false))
    );

    if (!scriptExists) {
      return yield* Effect.fail(new Error(`Plan script not found at ${scriptPath}`));
    }

    if (config.dryRun) {
      const scriptContent = yield* fs.readFileString(scriptPath);
      return {
        success: true,
        output: scriptContent
      } satisfies ExecutionResult;
    }

    const result = yield* Effect.tryPromise({
      try: async () => {
        const proc = Bun.spawn(["bash", scriptPath], {
          stdout: "pipe",
          stderr: "pipe"
        });
        const output = await new Response(proc.stdout).text();
        const error = await new Response(proc.stderr).text();
        await proc.exited;
        return { output, error, exitCode: proc.exitCode };
      },
      catch: (error) => new Error(`Failed to execute plan: ${error}`)
    });

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0 ? result.output : result.error
    } satisfies ExecutionResult;
  });

export const readPlanScript = (scriptPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(scriptPath);
  });

export const createAppLayer = () => {
  return pipe(
    Layer.mergeAll(
      LoggerServiceLive,
      DiskServiceFullLive,
      pipe(
        ScannerServiceLive,
        Layer.provide(GlobServiceLive),
        Layer.provide(FileStatServiceLive),
        Layer.provide(BunContext.layer)
      ),
      pipe(RsyncTransferService, Layer.provide(ShellServiceLive)),
      BashRsyncPlanGenerator
    )
  );
};

export const AppLive = createAppLayer();
