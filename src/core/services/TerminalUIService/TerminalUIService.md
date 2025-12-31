# TerminalUIService

Interactive terminal UI for prompts and selections.

## Overview

TerminalUIService provides interactive CLI features like prompts, confirmations, and selections using @effect/cli.

## Service Interface

```typescript
interface TerminalUIService {
  readonly prompt: (message: string) => Effect<string>;
  readonly confirm: (message: string) => Effect<boolean>;
  readonly select: <T>(message: string, choices: Choice<T>[]) => Effect<T>;
}

interface Choice<T> {
  readonly label: string;
  readonly value: T;
}
```

## Usage

### Text Input

```typescript
import { Effect } from "effect";
import { TerminalUIServiceTag } from "@services/TerminalUIService";

const program = Effect.gen(function* () {
  const ui = yield* TerminalUIServiceTag;

  const diskPath = yield* ui.prompt("Enter disk path:");
  console.log(`You entered: ${diskPath}`);
});
```

### Confirmation

```typescript
const program = Effect.gen(function* () {
  const ui = yield* TerminalUIServiceTag;

  const confirmed = yield* ui.confirm("Execute transfer plan?");

  if (confirmed) {
    console.log("Executing...");
  } else {
    console.log("Cancelled");
  }
});
```

### Selection

```typescript
const program = Effect.gen(function* () {
  const ui = yield* TerminalUIServiceTag;

  const algorithm = yield* ui.select("Choose consolidation algorithm:", [
    { label: "Simple (recommended)", value: "simple" },
    { label: "Advanced", value: "advanced" },
    { label: "Custom", value: "custom" }
  ]);

  console.log(`Selected: ${algorithm}`);
});
```

## See Also

- [Interactive](../../cli/interactive.md) - Uses TerminalUIService
- @effect/cli documentation
