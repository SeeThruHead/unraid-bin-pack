# LoggerService

Structured logging service for the application.

## Overview

LoggerService provides logging with different severity levels. Built on Effect's logging system.

## Service Interface

```typescript
interface LoggerService {
  readonly debug: (message: string) => Effect<void>;
  readonly info: (message: string) => Effect<void>;
  readonly warn: (message: string) => Effect<void>;
  readonly error: (message: string) => Effect<void>;
}
```

## Usage

```typescript
import { Effect } from "effect";
import { LoggerServiceTag } from "@services/LoggerService";

const program = Effect.gen(function* () {
  const logger = yield* LoggerServiceTag;

  yield* logger.info("Starting consolidation");
  yield* logger.debug("Found 100 files");
  yield* logger.warn("Disk almost full");
  yield* logger.error("Transfer failed");
});
```

## Log Levels

- **debug**: Detailed diagnostic information
- **info**: General informational messages
- **warn**: Warning messages about potential issues
- **error**: Error messages for failures

## Integration with Effect

Uses Effect's built-in logging, which means:

- Logs are structured
- Can be filtered by level
- Integrate with Effect's runtime configuration

## See Also

- Effect logging documentation
