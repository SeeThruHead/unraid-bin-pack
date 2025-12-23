/**
 * ShellService - wraps shell command execution for testability.
 */

import { Context, Data, Effect, Layer } from "effect"

// =============================================================================
// Errors
// =============================================================================

export class ShellError extends Data.TaggedError("ShellError")<{
  readonly message: string
  readonly command: string
  readonly exitCode?: number
}> {}

// =============================================================================
// Types
// =============================================================================

export interface ShellResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

// =============================================================================
// Service interface
// =============================================================================

export interface ShellService {
  readonly exec: (command: string) => Effect.Effect<ShellResult, ShellError>
}

export class ShellServiceTag extends Context.Tag("ShellService")<
  ShellServiceTag,
  ShellService
>() {}

// =============================================================================
// Live implementation (uses Bun.spawn)
// =============================================================================

export const ShellServiceLive = Layer.succeed(ShellServiceTag, {
  exec: (command) =>
    Effect.tryPromise({
      try: async () => {
        const proc = Bun.spawn(["sh", "-c", command], {
          stdout: "pipe",
          stderr: "pipe",
        })

        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()
        const exitCode = await proc.exited

        return { stdout, stderr, exitCode }
      },
      catch: (e) => new ShellError({ message: `Shell command failed: ${e}`, command }),
    }),
})
