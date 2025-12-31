/* eslint-disable functional/no-try-statements */

export function safeJsonParse<T = unknown>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
