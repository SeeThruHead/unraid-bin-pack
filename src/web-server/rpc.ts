import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Effect, Layer, pipe } from "effect";
import { BunContext } from "@effect/platform-bun";
import {
  createPlan,
  executePlanScript,
  readPlanScript,
  AppLive,
  type PlanConfig,
  type ApplyConfig
} from "@core";
import { DiskServiceTag } from "@services/DiskService";
import type { Dirent } from "fs";
import type { promises as fsPromises } from "fs";
import type { DiskResponse, SSEStreamAPI } from "./types";

const WebLive = AppLive.pipe(Layer.provideMerge(BunContext.layer));

interface DiskInfo {
  path: string;
  totalBytes: number;
  freeBytes: number;
}

const formatDiskResponse = (d: DiskInfo): DiskResponse => ({
  path: d.path,
  totalBytes: d.totalBytes,
  freeBytes: d.freeBytes,
  totalGB: d.totalBytes / 1024 / 1024 / 1024,
  freeGB: d.freeBytes / 1024 / 1024 / 1024,
  usedPct: ((d.totalBytes - d.freeBytes) / d.totalBytes) * 100
});

const isHiddenDir = (name: string): boolean => name.startsWith(".");

const sortByName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name);

const discoverDisks = Effect.gen(function* () {
  const diskService = yield* DiskServiceTag;
  const paths = yield* diskService.autoDiscover();
  const disks = yield* diskService.discover([...paths]);
  return disks.map(formatDiskResponse);
}).pipe(
  Effect.catchAll(() => Effect.succeed([])),
  Effect.provide(WebLive)
);

const readDirSafe = (fs: typeof fsPromises, path: string): Effect.Effect<Dirent[]> =>
  pipe(
    Effect.tryPromise(() => fs.readdir(path, { withFileTypes: true })),
    Effect.catchAll(() => Effect.succeed([] as Dirent[]))
  );

const readSubdirs = (fs: typeof fsPromises, diskPath: string, dirName: string) =>
  pipe(
    readDirSafe(fs, `${diskPath}/${dirName}`),
    Effect.map((entries) =>
      entries.filter((e) => e.isDirectory() && !isHiddenDir(e.name)).map((e) => e.name)
    )
  );

const scanDiskForPatterns = (fs: typeof fsPromises, diskPath: string) =>
  pipe(
    readDirSafe(fs, diskPath),
    Effect.map((entries) => entries.filter((e) => e.isDirectory() && !isHiddenDir(e.name))),
    Effect.flatMap((dirs) =>
      Effect.all(
        dirs.map((dir) =>
          pipe(
            readSubdirs(fs, diskPath, dir.name),
            Effect.map((children) => ({
              pattern: `/${dir.name}`,
              name: dir.name,
              children
            }))
          )
        )
      )
    )
  );

const mergePatternChildren = (
  patterns: Array<{ pattern: string; name: string; children: string[] }>
) => {
  const grouped = new Map<string, Array<{ pattern: string; name: string; children: string[] }>>();

  patterns.forEach((p) => {
    const existing = grouped.get(p.pattern);
    if (existing) {
      existing.push(p);
    } else {
      grouped.set(p.pattern, [p]);
    }
  });

  return Array.from(grouped.entries())
    .map(([pattern, nodes]) => ({
      pattern,
      name: nodes[0]?.name || "",
      children: Array.from(new Set(nodes.flatMap((n) => n.children))).sort()
    }))
    .sort(sortByName);
};

const scanPatternsForPaths = (diskPaths: string[]) =>
  Effect.gen(function* () {
    if (diskPaths.length === 0) {
      return [];
    }

    const fs = yield* Effect.promise(() => import("fs/promises"));
    const allPatterns = yield* Effect.all(diskPaths.map((path) => scanDiskForPatterns(fs, path)));

    return mergePatternChildren(allPatterns.flat());
  }).pipe(
    Effect.catchAll(() => Effect.succeed([])),
    Effect.provide(WebLive)
  );

const rpc = new Hono()
  .get("/disks", async (c) => c.json(await Effect.runPromise(discoverDisks)))
  .get("/scan-patterns", async (c) => {
    const diskPathsParam = c.req.query("diskPaths") || "";
    const diskPaths = diskPathsParam.split(",").filter((p) => p.trim());
    return c.json(await Effect.runPromise(scanPatternsForPaths(diskPaths)));
  })
  .post("/plan", async (c) => {
    const body = await c.req.json<{ diskPaths: string[]; config: PlanConfig }>();

    const result = await Effect.runPromise(
      pipe(
        createPlan(body.diskPaths, body.config),
        Effect.flatMap((planResult) =>
          Effect.gen(function* () {
            const fs = yield* Effect.promise(() => import("fs/promises"));
            yield* Effect.tryPromise(() =>
              fs.writeFile("/config/plan.sh", planResult.script, "utf-8")
            );
            yield* Effect.tryPromise(() => fs.chmod("/config/plan.sh", 0o755));
            return planResult;
          })
        ),
        Effect.provide(WebLive),
        Effect.catchAll((error) => Effect.succeed({ error: String(error) }))
      )
    );

    return "error" in result ? c.json(result, 500) : c.json(result);
  })
  .post("/apply", async (c) => {
    const body = await c.req.json<ApplyConfig>();

    const result = await Effect.runPromise(
      pipe(
        executePlanScript(body.planPath, body),
        Effect.provide(WebLive),
        Effect.catchAll((error) => Effect.succeed({ error: String(error) }))
      )
    );

    return "error" in result ? c.json(result, 500) : c.json(result);
  })
  .get("/apply-stream", async (c) => {
    const planPath = c.req.query("planPath") || "/config/plan.sh";
    const concurrency = parseInt(c.req.query("concurrency") || "4");
    const dryRun = c.req.query("dryRun") === "true";
    const logFile = "/config/plan.log";

    const writeSSEMessage = (stream: SSEStreamAPI, type: string, data: Record<string, unknown>) =>
      stream.writeSSE({
        data: JSON.stringify({ type, ...data })
      });

    return streamSSE(c, async (stream) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            writeSSEMessage(stream, "start", { message: "Starting plan execution..." })
          );

          const fs = yield* Effect.promise(() => import("fs/promises"));

          const pollLogFile = (position: number): Promise<number> =>
            fs
              .stat(logFile)
              .then((stats) => {
                if (stats.size > position) {
                  return fs
                    .open(logFile, "r")
                    .then((fileHandle) => {
                      const buffer = Buffer.alloc(stats.size - position);
                      return fileHandle
                        .read(buffer, 0, buffer.length, position)
                        .then(() => fileHandle.close().then(() => buffer));
                    })
                    .then((buffer) => {
                      const newContent = buffer.toString();
                      const lines = newContent.split("\n").filter((line) => line.trim());
                      return Promise.all(
                        lines.map((line) => writeSSEMessage(stream, "progress", { message: line }))
                      ).then(() => stats.size);
                    });
                }
                return position;
              })
              .catch(() => position);

          const startPolling = (
            initialPosition: number
          ): { stop: () => void; getPosition: () => Promise<number> } => {
            const state = { position: initialPosition, stopped: false };

            const poll = (): void => {
              if (!state.stopped) {
                void pollLogFile(state.position).then((newPosition) => {
                  state.position = newPosition;
                });
              }
            };

            const intervalId = setInterval(poll, 200);

            return {
              stop: () => {
                state.stopped = true;
                clearInterval(intervalId);
              },
              getPosition: () => Promise.resolve(state.position)
            };
          };

          const polling = startPolling(0);

          const execResult = yield* pipe(
            executePlanScript(planPath, { planPath, concurrency, dryRun }),
            Effect.provide(WebLive)
          );

          yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 300)));
          polling.stop();

          const finalPosition = yield* Effect.promise(polling.getPosition);

          yield* pipe(
            Effect.gen(function* () {
              const stats = yield* Effect.tryPromise(() => fs.stat(logFile));
              if (stats.size > finalPosition) {
                const fileHandle = yield* Effect.tryPromise(() => fs.open(logFile, "r"));
                const buffer = Buffer.alloc(stats.size - finalPosition);
                yield* Effect.tryPromise(() =>
                  fileHandle.read(buffer, 0, buffer.length, finalPosition)
                );
                yield* Effect.tryPromise(() => fileHandle.close());

                const newContent = buffer.toString();
                const lines = newContent.split("\n").filter((line: string) => line.trim());

                for (const line of lines) {
                  yield* Effect.promise(() =>
                    writeSSEMessage(stream, "progress", { message: line })
                  );
                }
              }
            }),
            Effect.catchAll(() => Effect.void)
          );

          yield* Effect.promise(() => writeSSEMessage(stream, "complete", { result: execResult }));
        }).pipe(
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.promise(() =>
                writeSSEMessage(stream, "error", { error: String(error) })
              );
            })
          )
        )
      );
    });
  })
  .get("/show", async (c) =>
    c.json({
      script: await Effect.runPromise(
        pipe(
          readPlanScript("/config/plan.sh"),
          Effect.catchAll(() => Effect.succeed("No plan script found at /config/plan.sh")),
          Effect.provide(WebLive)
        )
      )
    })
  )
  .post("/verify-disk-space", async (c) => {
    const body = await c.req.json<{ diskPaths: string[] }>();

    const result = await Effect.runPromise(
      pipe(
        Effect.gen(function* () {
          const diskService = yield* DiskServiceTag;
          const disks = yield* diskService.discover(body.diskPaths);
          return disks.map(formatDiskResponse);
        }),
        Effect.provide(WebLive),
        Effect.catchAll((error) => Effect.succeed({ error: String(error) }))
      )
    );

    return "error" in result ? c.json(result, 500) : c.json(result);
  });

export type RpcRoutes = typeof rpc;
export default rpc;
