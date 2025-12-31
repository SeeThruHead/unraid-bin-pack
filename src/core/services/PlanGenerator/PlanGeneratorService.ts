import { Context, Effect } from "effect"
import type { FileMove } from "@domain/MovePlan"
import type { DiskStats } from "@domain/Disk"

export interface PlanGeneratorOptions {
  readonly moves: readonly FileMove[]
  readonly sourceDisk: string
  readonly diskStats: Record<string, DiskStats>
  readonly concurrency: number
}

export interface PlanGeneratorService {
  readonly generate: (options: PlanGeneratorOptions) => Effect.Effect<string>
}

export class PlanGeneratorServiceTag extends Context.Tag("PlanGeneratorService")<
  PlanGeneratorServiceTag,
  PlanGeneratorService
>() {}
