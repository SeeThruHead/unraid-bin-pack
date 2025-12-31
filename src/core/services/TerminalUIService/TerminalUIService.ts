/* eslint-disable no-console */
import { Context, Effect, Layer } from "effect"

const ANSI = {
  up: (n: number) => `\x1b[${n}A`,
  down: (n: number) => `\x1b[${n}B`,
  clearLine: "\x1b[2K",
  cursorToStart: "\r",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",

  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
} as const

export interface DiskProgress {
  diskPath: string
  bytesTransferred: number
  totalBytes: number
  currentFile: string
  speedBytesPerSec: number
  status: "pending" | "running" | "done" | "error"
  error?: string
}

export interface OverallProgress {
  disks: DiskProgress[]
  startedAt: number
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const formatSpeed = (bytesPerSec: number): string => {
  return `${formatBytes(bytesPerSec)}/s`
}

const formatDuration = (ms: number): string => {
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const hours = Math.floor(mins / 60)
  if (hours > 0) return `${hours}h ${mins % 60}m`
  if (mins > 0) return `${mins}m ${secs % 60}s`
  return `${secs}s`
}

const truncate = (str: string, len: number): string => {
  if (str.length <= len) return str.padEnd(len)
  return "..." + str.slice(-(len - 3))
}

const progressBar = (pct: number, width: number = 20): string => {
  const filled = Math.floor(pct * width)
  const empty = width - filled
  return `${"█".repeat(filled)}${"░".repeat(empty)}`
}

export interface TerminalUIService {
  readonly print: (msg: string) => Effect.Effect<void>
  readonly write: (msg: string) => Effect.Effect<void>
  readonly clear: () => Effect.Effect<void>
  readonly startProgress: (diskCount: number) => Effect.Effect<void>
  readonly updateProgress: (progress: OverallProgress) => Effect.Effect<void>
  readonly endProgress: () => Effect.Effect<void>
  readonly formatDiskLine: (disk: DiskProgress) => string
  readonly formatSummary: (progress: OverallProgress) => string
}

export class TerminalUIServiceTag extends Context.Tag("TerminalUIService")<
  TerminalUIServiceTag,
  TerminalUIService
>() {}

export const TerminalUIServiceLive = Layer.succeed(TerminalUIServiceTag, {
  print: (msg) => Effect.sync(() => console.log(msg)),

  write: (msg) => Effect.sync(() => process.stdout.write(msg)),

  clear: () => Effect.sync(() => console.clear()),

  startProgress: (diskCount) =>
    Effect.sync(() => {
      process.stdout.write(ANSI.hideCursor)
      process.stdout.write("\n".repeat(diskCount + 2))
    }),

  updateProgress: (progress) =>
    Effect.sync(() => {
      const lines = progress.disks.length + 2

      process.stdout.write(ANSI.up(lines))

      progress.disks.forEach((disk) => {
        process.stdout.write(ANSI.clearLine)
        console.log(formatDiskProgressLine(disk))
      })

      process.stdout.write(ANSI.clearLine)
      console.log("")

      process.stdout.write(ANSI.clearLine)
      console.log(formatSummaryLine(progress))
    }),

  endProgress: () =>
    Effect.sync(() => {
      process.stdout.write(ANSI.showCursor)
    }),

  formatDiskLine: formatDiskProgressLine,
  formatSummary: formatSummaryLine,
})

function formatDiskProgressLine(disk: DiskProgress): string {
  const pct = disk.totalBytes > 0 ? disk.bytesTransferred / disk.totalBytes : 0
  const pctStr = `${Math.floor(pct * 100)}%`.padStart(4)
  const bar = progressBar(pct, 12)

  const transferred = formatBytes(disk.bytesTransferred)
  const total = formatBytes(disk.totalBytes)
  const speed = formatSpeed(disk.speedBytesPerSec)

  const diskName = truncate(disk.diskPath.replace("/mnt/", ""), 8)
  const fileName = truncate(disk.currentFile, 30)

  const statusIcon =
    disk.status === "done" ? `${ANSI.green}[ok]${ANSI.reset}` :
    disk.status === "error" ? `${ANSI.red}[x]${ANSI.reset}` :
    disk.status === "running" ? `${ANSI.blue}[>]${ANSI.reset}` :
    `${ANSI.dim}[ ]${ANSI.reset}`

  return `${statusIcon} ${diskName} ${bar} ${pctStr} │ ${transferred}/${total} │ ${speed.padStart(10)} │ ${fileName}`
}

function formatSummaryLine(progress: OverallProgress): string {
  const totalBytes = progress.disks.reduce((sum, d) => sum + d.totalBytes, 0)
  const transferred = progress.disks.reduce((sum, d) => sum + d.bytesTransferred, 0)
  const totalSpeed = progress.disks.reduce((sum, d) => sum + d.speedBytesPerSec, 0)

  const elapsed = Date.now() - progress.startedAt
  const remaining = totalSpeed > 0 ? ((totalBytes - transferred) / totalSpeed) * 1000 : 0

  const pct = totalBytes > 0 ? Math.floor((transferred / totalBytes) * 100) : 0

  return `${ANSI.bold}Total: ${formatBytes(transferred)}/${formatBytes(totalBytes)} (${pct}%) │ ${formatSpeed(totalSpeed)} │ Elapsed: ${formatDuration(elapsed)} │ ETA: ${formatDuration(remaining)}${ANSI.reset}`
}

export const TerminalUIServiceStub = Layer.succeed(TerminalUIServiceTag, {
  print: (_msg) => Effect.void,
  write: (_msg) => Effect.void,
  clear: () => Effect.void,
  startProgress: (_n) => Effect.void,
  updateProgress: (_p) => Effect.void,
  endProgress: () => Effect.void,
  formatDiskLine: () => "",
  formatSummary: () => "",
})
