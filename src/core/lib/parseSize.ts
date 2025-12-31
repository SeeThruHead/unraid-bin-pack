import { Effect } from "effect";

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
  tib: 1024 * 1024 * 1024 * 1024
};

export const parseSize = (input: string): Effect.Effect<number, Error> => {
  const trimmed = input.trim().toLowerCase();

  if (/^\d+$/.test(trimmed)) {
    return Effect.succeed(parseInt(trimmed, 10));
  }

  const match = trimmed.match(/^([\d.]+)\s*([a-z]+)$/);
  if (!match) {
    return Effect.fail(
      new Error(`Invalid size format: "${input}". Use formats like: 50MB, 1GB, 1.5TB`)
    );
  }

  const numStr = match[1];
  const unit = match[2];

  if (!numStr || !unit) {
    return Effect.fail(
      new Error(`Invalid size format: "${input}". Use formats like: 50MB, 1GB, 1.5TB`)
    );
  }

  const num = parseFloat(numStr);
  const multiplier = UNITS[unit];

  if (multiplier === undefined) {
    return Effect.fail(new Error(`Unknown size unit: "${unit}". Use: B, KB, MB, GB, TB`));
  }

  return Effect.succeed(Math.floor(num * multiplier));
};

export const formatSize = (bytes: number): string => {
  const absBytes = Math.abs(bytes);
  const sign = bytes < 0 ? "-" : "";

  if (absBytes < 1024) return `${sign}${absBytes} B`;
  if (absBytes < 1024 * 1024) return `${sign}${(absBytes / 1024).toFixed(1)} KB`;
  if (absBytes < 1024 * 1024 * 1024) return `${sign}${(absBytes / 1024 / 1024).toFixed(1)} MB`;
  if (absBytes < 1024 * 1024 * 1024 * 1024)
    return `${sign}${(absBytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${sign}${(absBytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
};
