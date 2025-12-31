import { parseSize } from "@lib/parseSize"

export const splitCommaSeparated = (value: string | undefined): string[] =>
  value ? value.split(",").map((s) => s.trim()).filter((s) => s.length > 0) : []

export interface ParsedPlanOptions {
  readonly excludePatterns: string[]
  readonly includePatterns: string[]
  readonly minSpaceBytes: number
  readonly minFileSizeBytes: number
  readonly minSplitSizeBytes: number
  readonly moveAsFolderThresholdPct: number
  readonly pathPrefixes: string[]
  readonly srcDiskPaths?: string[]
  readonly planPath: string
}

export const parsePlanOptions = (options: {
  exclude?: string
  include?: string
  minSpace?: string
  minFileSize?: string
  minSplitSize?: string
  moveAsFolderThreshold?: string
  pathFilter?: string
  src?: string
  planFile?: string
}): ParsedPlanOptions => ({
  excludePatterns: splitCommaSeparated(options.exclude),
  includePatterns: splitCommaSeparated(options.include),
  minSpaceBytes: parseSize(options.minSpace ?? "50MB"),
  minFileSizeBytes: parseSize(options.minFileSize ?? "1MB"),
  minSplitSizeBytes: parseSize(options.minSplitSize ?? "1GB"),
  moveAsFolderThresholdPct: parseFloat(options.moveAsFolderThreshold ?? "0.9"),
  pathPrefixes: splitCommaSeparated(options.pathFilter),
  srcDiskPaths: options.src ? splitCommaSeparated(options.src) : undefined,
  planPath: options.planFile ?? "/config/plan.sh",
})

export const parseDestinationPaths = (dest: string | undefined): string[] | undefined =>
  dest ? splitCommaSeparated(dest) : undefined
