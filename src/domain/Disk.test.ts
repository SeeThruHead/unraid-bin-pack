import { describe, expect, test } from "bun:test"
import { canFit, usagePercent, usedBytes, type Disk } from "./Disk"

const makeDisk = (total: number, free: number): Disk => ({
  path: "/mnt/disk1",
  totalBytes: total,
  freeBytes: free,
})

describe("Disk", () => {
  test("usedBytes", () => {
    expect(usedBytes(makeDisk(1000, 400))).toBe(600)
  })

  test("usagePercent", () => {
    expect(usagePercent(makeDisk(1000, 250))).toBe(75)
    expect(usagePercent(makeDisk(0, 0))).toBe(0) // edge case
  })

  test("canFit with threshold", () => {
    const disk = makeDisk(1000, 200) // 200 bytes free

    expect(canFit(disk, 100, 50)).toBe(true) // 200-100=100 >= 50
    expect(canFit(disk, 150, 50)).toBe(true) // 200-150=50 >= 50
    expect(canFit(disk, 151, 50)).toBe(false) // 200-151=49 < 50
    expect(canFit(disk, 200, 0)).toBe(true) // exact fit, no threshold
    expect(canFit(disk, 201, 0)).toBe(false) // too big
  })
})
