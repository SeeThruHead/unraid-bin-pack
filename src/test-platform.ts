import { BunContext, BunRuntime } from "@effect/platform-bun";
import { FileSystem, Path, Command as ShellCommand } from "@effect/platform";
import { Console, Duration, Effect, pipe } from "effect";

const test1_getFileSystem = pipe(
  FileSystem.FileSystem,
  Effect.tap(() => Console.log("[ok] Test 1: Got FileSystem service"))
);

const test2_getPath = pipe(
  Path.Path,
  Effect.tap(() => Console.log("[ok] Test 2: Got Path service"))
);

const test3_exists = pipe(
  FileSystem.FileSystem,
  Effect.flatMap((fs) => fs.exists(".")),
  Effect.tap((exists) => Console.log(`[ok] Test 3: Current dir exists = ${exists}`))
);

const test4_readDir = pipe(
  FileSystem.FileSystem,
  Effect.flatMap((fs) => fs.readDirectory(".")),
  Effect.tap((entries) =>
    Console.log(`[ok] Test 4: Read directory, found ${entries.length} entries`)
  )
);

const test5_stat = pipe(
  FileSystem.FileSystem,
  Effect.flatMap((fs) => fs.stat("package.json")),
  Effect.tap((stat) => Console.log(`[ok] Test 5: Stat package.json, size = ${stat.size} bytes`))
);

const test6_pathJoin = pipe(
  Path.Path,
  Effect.map((path) => path.join("foo", "bar", "baz.txt")),
  Effect.tap((joined) => Console.log(`[ok] Test 6: Path.join = ${joined}`))
);

const test7_listMethods = pipe(
  FileSystem.FileSystem,
  Effect.map((fs) => Object.keys(fs).sort()),
  Effect.tap((methods) => Console.log(`[ok] Test 7: FileSystem methods: ${methods.join(", ")}`))
);

const test8_shellCommand = pipe(
  ShellCommand.make("echo", "hello from shell"),
  ShellCommand.string,
  Effect.map((s) => s.trim()),
  Effect.tap((result) => Console.log(`[ok] Test 8: Shell command output: ${result}`))
);

const test9_dfCommand = pipe(
  ShellCommand.make("df", "-k", "."),
  ShellCommand.string,
  Effect.map((s) => s.trim().split("\n")),
  Effect.tap((lines) =>
    Console.log(`[ok] Test 9: df command works\n  Header: ${lines[0]}\n  Data:   ${lines[1]}`)
  )
);

const test10_bunGlob = pipe(
  Effect.sync(() => Array.from(new Bun.Glob("*.json").scanSync("."))),
  Effect.tap((matches) =>
    Console.log(`[ok] Test 10: Bun.Glob found ${matches.length} json files: ${matches.join(", ")}`)
  )
);

const test11_parallel = pipe(
  Effect.all(
    [
      pipe(Effect.sleep("50 millis"), Effect.as("task1")),
      pipe(Effect.sleep("50 millis"), Effect.as("task2")),
      pipe(Effect.sleep("50 millis"), Effect.as("task3"))
    ],
    { concurrency: "unbounded" }
  ),
  Effect.timed,
  Effect.tap(([duration, _results]) =>
    Console.log(
      `[ok] Test 11: Parallel execution of 3x50ms tasks took ${Duration.toMillis(duration)}ms (should be ~50ms, not 150ms)`
    )
  )
);

const test12_parallelStats = pipe(
  FileSystem.FileSystem,
  Effect.flatMap((fs) =>
    pipe(
      Effect.all(
        ["package.json", "tsconfig.json", "bun.lockb"].map((file) =>
          pipe(
            fs.stat(file),
            Effect.map((s) => ({ file, size: s.size }))
          )
        ),
        { concurrency: "unbounded" }
      ),
      Effect.timed
    )
  ),
  Effect.tap(([duration, results]) =>
    Console.log(
      `[ok] Test 12: Parallel stat of ${results.length} files took ${Duration.toMillis(duration)}ms`
    )
  )
);

const main = pipe(
  Console.log("=== Testing @effect/platform-bun primitives ===\n"),
  Effect.andThen(test1_getFileSystem),
  Effect.andThen(test2_getPath),
  Effect.andThen(test3_exists),
  Effect.andThen(test4_readDir),
  Effect.andThen(test5_stat),
  Effect.andThen(test6_pathJoin),
  Effect.andThen(test7_listMethods),
  Effect.andThen(test8_shellCommand),
  Effect.andThen(test9_dfCommand),
  Effect.andThen(test10_bunGlob),
  Effect.andThen(test11_parallel),
  Effect.andThen(test12_parallelStats),
  Effect.andThen(Console.log("\n=== All tests passed! ==="))
);

pipe(main, Effect.provide(BunContext.layer), BunRuntime.runMain);
