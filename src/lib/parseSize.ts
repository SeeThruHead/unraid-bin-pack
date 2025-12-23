/**
 * Parse human-readable file sizes to bytes.
 *
 * Supports:
 *   - Raw bytes: "1024", "52428800"
 *   - KB/KiB: "100KB", "100K", "100KiB"
 *   - MB/MiB: "50MB", "50M", "50MiB"
 *   - GB/GiB: "1GB", "1G", "1GiB"
 *   - TB/TiB: "2TB", "2T", "2TiB"
 *
 * Case-insensitive. Spaces optional.
 *
 * @example
 *   parseSize("50MB")  // 52428800
 *   parseSize("1GB")   // 1073741824
 *   parseSize("1.5GB") // 1610612736
 *   parseSize("1024")  // 1024 (raw bytes)
 */

const UNITS: Record<string, number> = {
  b: 1,
  k: 1024,
  kb: 1024,
  kib: 1024,
  m: 1024 * 1024,
  mb: 1024 * 1024,
  mib: 1024 * 1024,
  g: 1024 * 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  gib: 1024 * 1024 * 1024,
  t: 1024 * 1024 * 1024 * 1024,
  tb: 1024 * 1024 * 1024 * 1024,
  tib: 1024 * 1024 * 1024 * 1024,
}

export const parseSize = (input: string): number => {
  const trimmed = input.trim().toLowerCase()

  // Try raw number first
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10)
  }

  // Match number (with optional decimal) and unit
  const match = trimmed.match(/^([\d.]+)\s*([a-z]+)$/)
  if (!match) {
    throw new Error(`Invalid size format: "${input}". Use formats like: 50MB, 1GB, 1.5TB`)
  }

  const numStr = match[1]
  const unit = match[2]

  // These are guaranteed to exist by the regex pattern, but TypeScript doesn't know
  if (!numStr || !unit) {
    throw new Error(`Invalid size format: "${input}". Use formats like: 50MB, 1GB, 1.5TB`)
  }

  const num = parseFloat(numStr)
  const multiplier = UNITS[unit]

  if (multiplier === undefined) {
    throw new Error(`Unknown size unit: "${unit}". Use: B, KB, MB, GB, TB`)
  }

  return Math.floor(num * multiplier)
}

/**
 * Format bytes as human-readable string.
 */
export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`
}
