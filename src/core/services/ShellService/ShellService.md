# ShellService

Execute shell commands and capture output.

## Overview

ShellService wraps shell command execution with Effect for safe, composable command running.

## Service Interface

```typescript
interface ShellService {
  readonly exec: (command: string) => Effect<ExecResult, ShellError>;
}

interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}
```

## Usage

```typescript
import { Effect } from "effect";
import { ShellServiceTag } from "@services/ShellService";

const program = Effect.gen(function* () {
  const shell = yield* ShellServiceTag;

  const result = yield* shell.exec("ls -la /mnt/disk1");

  console.log(result.stdout);
});
```

## Error Handling

```typescript
const program = Effect.gen(function* () {
  const shell = yield* ShellServiceTag;

  const result = yield* shell.exec("some-command").pipe(
    Effect.catchTag("ShellError", (error) => {
      console.error(`Command failed: ${error.message}`);
      return Effect.succeed({ stdout: "", stderr: "", exitCode: 1 });
    })
  );
});
```

## Common Uses

- Running rsync for file transfers
- Executing chmod to set permissions
- Running disk utility commands
- File system operations

## See Also

- [TransferService](../TransferService/TransferService.md) - Uses ShellService for rsync
- [PlanScriptGenerator](../PlanScriptGenerator/PlanScriptGenerator.md) - Generates shell scripts
