# TransferService

Executes file transfers from MovePlans using rsync.

## Overview

TransferService executes moves directly without generating a bash script. It runs rsync commands for each file move and tracks progress.

## Service Interface

```typescript
interface TransferService {
  readonly execute: (plan: MovePlan) => Effect<TransferResult, TransferError>;
}
```

## Usage

```typescript
import { Effect } from "effect";
import { TransferServiceTag } from "@services/TransferService";

const program = Effect.gen(function* () {
  const transferService = yield* TransferServiceTag;

  const result = yield* transferService.execute(movePlan);

  console.log(`Transferred ${result.filesTransferred} files`);
  console.log(`Total bytes: ${result.bytesTransferred}`);
});
```

## Vs PlanScriptGenerator

**TransferService:**

- Executes moves directly from code
- Provides programmatic progress tracking
- Good for automated workflows

**PlanScriptGenerator:**

- Generates bash script for manual execution
- User can review before running
- Good for manual verification

## See Also

- [MovePlan](../../domain/MovePlan.md) - Input structure
- [PlanScriptGenerator](../PlanScriptGenerator/PlanScriptGenerator.md) - Alternative approach
- [ShellService](../ShellService/ShellService.md) - Executes rsync commands
