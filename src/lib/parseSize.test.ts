import { describe, expect, test } from "bun:test"
import { parseSize, formatSize } from "./parseSize"

describe("parseSize", () => {
  test("parses raw bytes", () => {
    expect(parseSize("1024")).toBe(1024)
    expect(parseSize("52428800")).toBe(52428800)
  })

  test("parses KB", () => {
    expect(parseSize("1KB")).toBe(1024)
    expect(parseSize("1K")).toBe(1024)
    expect(parseSize("1KiB")).toBe(1024)
    expect(parseSize("100kb")).toBe(102400)
  })

  test("parses MB", () => {
    expect(parseSize("1MB")).toBe(1024 * 1024)
    expect(parseSize("1M")).toBe(1024 * 1024)
    expect(parseSize("50MB")).toBe(50 * 1024 * 1024)
    expect(parseSize("50mb")).toBe(50 * 1024 * 1024)
  })

  test("parses GB", () => {
    expect(parseSize("1GB")).toBe(1024 * 1024 * 1024)
    expect(parseSize("1G")).toBe(1024 * 1024 * 1024)
    expect(parseSize("2GB")).toBe(2 * 1024 * 1024 * 1024)
  })

  test("parses TB", () => {
    expect(parseSize("1TB")).toBe(1024 * 1024 * 1024 * 1024)
    expect(parseSize("1T")).toBe(1024 * 1024 * 1024 * 1024)
  })

  test("parses decimals", () => {
    expect(parseSize("1.5GB")).toBe(Math.floor(1.5 * 1024 * 1024 * 1024))
    expect(parseSize("0.5MB")).toBe(Math.floor(0.5 * 1024 * 1024))
  })

  test("handles spaces", () => {
    expect(parseSize("  50MB  ")).toBe(50 * 1024 * 1024)
    expect(parseSize("1 GB")).toBe(1024 * 1024 * 1024)
  })

  test("is case-insensitive", () => {
    expect(parseSize("1gb")).toBe(parseSize("1GB"))
    expect(parseSize("1Gb")).toBe(parseSize("1GB"))
  })

  test("throws on invalid format", () => {
    expect(() => parseSize("abc")).toThrow()
    expect(() => parseSize("50XB")).toThrow()
    expect(() => parseSize("")).toThrow()
  })
})

describe("formatSize", () => {
  test("formats bytes", () => {
    expect(formatSize(500)).toBe("500 B")
  })

  test("formats KB", () => {
    expect(formatSize(1024)).toBe("1.0 KB")
    expect(formatSize(1536)).toBe("1.5 KB")
  })

  test("formats MB", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB")
    expect(formatSize(50 * 1024 * 1024)).toBe("50.0 MB")
  })

  test("formats GB", () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe("1.00 GB")
    expect(formatSize(1.5 * 1024 * 1024 * 1024)).toBe("1.50 GB")
  })

  test("formats TB", () => {
    expect(formatSize(1024 * 1024 * 1024 * 1024)).toBe("1.00 TB")
  })
})
