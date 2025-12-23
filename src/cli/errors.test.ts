/**
 * Tests for error handling - verify domain errors are converted to user-friendly messages.
 */

import { describe, expect, test } from "bun:test"
import {
  AppError,
  fromDomainError,
  diskNotFound,
  notAMountPoint,
  notADirectory,
  diskPermissionDenied,
  scanPermissionDenied,
  planNotFound,
  planCorrupted,
  planPermissionDenied,
  sourcePermissionDenied,
  destinationPermissionDenied,
  sourceNotFound,
  diskFull,
  transferFailed,
  backendUnavailable,
} from "./errors"

describe("AppError", () => {
  test("format() produces readable output with title, detail, and suggestion", () => {
    const error = new AppError(
      "Test Error",
      "Something went wrong.",
      "Try doing X instead."
    )

    const formatted = error.format()

    expect(formatted).toContain("ERROR: Test Error")
    expect(formatted).toContain("Something went wrong.")
    expect(formatted).toContain("Hint: Try doing X instead.")
  })
})

describe("Domain error constructors", () => {
  test("diskNotFound creates actionable error", () => {
    const error = diskNotFound("/mnt/disk1")

    expect(error.title).toBe("Disk not found")
    expect(error.detail).toContain("/mnt/disk1")
    expect(error.detail).toContain("does not exist")
    expect(error.suggestion).toContain("mounted")
  })

  test("notAMountPoint creates actionable error", () => {
    const error = notAMountPoint("/home/user/folder")

    expect(error.title).toBe("Not a mount point")
    expect(error.detail).toContain("/home/user/folder")
    expect(error.suggestion).toContain("/mnt/disk")
  })

  test("notADirectory creates actionable error", () => {
    const error = notADirectory("/mnt/disk1/file.txt")

    expect(error.title).toBe("Not a directory")
    expect(error.detail).toContain("/mnt/disk1/file.txt")
    expect(error.detail).toContain("not a directory")
  })

  test("diskPermissionDenied creates actionable error", () => {
    const error = diskPermissionDenied("/mnt/disk1")

    expect(error.title).toBe("Permission denied")
    expect(error.detail).toContain("/mnt/disk1")
    expect(error.suggestion).toContain("sudo")
  })

  test("scanPermissionDenied creates actionable error", () => {
    const error = scanPermissionDenied("/mnt/spillover")

    expect(error.title).toBe("Permission denied during scan")
    expect(error.detail).toContain("/mnt/spillover")
    expect(error.detail).toContain("permission denied")
  })

  test("planPermissionDenied creates actionable error for write", () => {
    const error = planPermissionDenied("/config/plan.json", "write")

    expect(error.title).toBe("Permission denied")
    expect(error.detail).toContain("write")
    expect(error.suggestion).toContain("write permission")
  })

  test("planPermissionDenied creates actionable error for read", () => {
    const error = planPermissionDenied("/config/plan.json", "read")

    expect(error.title).toBe("Permission denied")
    expect(error.detail).toContain("read")
    expect(error.suggestion).toContain("read permission")
  })

  test("sourcePermissionDenied creates actionable error", () => {
    const error = sourcePermissionDenied("/mnt/spillover/file.mkv")

    expect(error.title).toBe("Cannot read source file")
    expect(error.detail).toContain("/mnt/spillover/file.mkv")
    expect(error.suggestion).toContain("read permission")
  })

  test("destinationPermissionDenied creates actionable error", () => {
    const error = destinationPermissionDenied("/mnt/disk1/file.mkv")

    expect(error.title).toBe("Cannot write to destination")
    expect(error.detail).toContain("/mnt/disk1/file.mkv")
    expect(error.suggestion).toContain("write permission")
  })

  test("sourceNotFound creates actionable error", () => {
    const error = sourceNotFound("/mnt/spillover/file.mkv")

    expect(error.title).toBe("Source file missing")
    expect(error.detail).toContain("/mnt/spillover/file.mkv")
    expect(error.detail).toContain("no longer exists")
  })

  test("diskFull creates actionable error", () => {
    const error = diskFull("/mnt/disk1")

    expect(error.title).toBe("Disk full")
    expect(error.detail).toContain("/mnt/disk1")
    expect(error.suggestion).toContain("Free up space")
  })

  test("transferFailed creates actionable error", () => {
    const error = transferFailed(
      "/mnt/spillover/file.mkv",
      "/mnt/disk1/file.mkv",
      "network error"
    )

    expect(error.title).toBe("Transfer failed")
    expect(error.detail).toContain("/mnt/spillover/file.mkv")
    expect(error.detail).toContain("/mnt/disk1/file.mkv")
    expect(error.detail).toContain("network error")
  })

  test("backendUnavailable creates actionable error", () => {
    const error = backendUnavailable("rsync not found")

    expect(error.title).toBe("Transfer backend unavailable")
    expect(error.detail).toContain("rsync not found")
    expect(error.suggestion).toContain("Install rsync")
  })

  test("planNotFound creates actionable error", () => {
    const error = planNotFound("/config/plan.json")

    expect(error.title).toBe("No plan found")
    expect(error.detail).toContain("/config/plan.json")
    expect(error.suggestion).toContain("unraid-bin-pack plan")
  })

  test("planCorrupted creates actionable error", () => {
    const error = planCorrupted("/config/plan.json", "invalid JSON")

    expect(error.title).toBe("Plan file corrupted")
    expect(error.detail).toContain("/config/plan.json")
    expect(error.detail).toContain("invalid JSON")
    expect(error.suggestion).toContain("Delete the plan file")
  })
})

describe("fromDomainError", () => {
  test("passes through AppError unchanged", () => {
    const original = new AppError("Original", "Detail", "Suggestion")

    const result = fromDomainError(original)

    expect(result).toBe(original)
  })

  test("converts standard Error to unexpected error", () => {
    const error = new Error("Something broke")

    const appError = fromDomainError(error)

    expect(appError.title).toBe("Unexpected error")
    expect(appError.detail).toBe("Something broke")
  })

  test("converts permission Error to permission denied", () => {
    const error = new Error("EACCES: permission denied")

    const appError = fromDomainError(error)

    expect(appError.title).toBe("Permission denied")
  })

  test("converts unknown value to unexpected error", () => {
    const appError = fromDomainError("just a string")

    expect(appError.title).toBe("Unexpected error")
    expect(appError.detail).toBe("just a string")
  })
})

// =============================================================================
// Tests for typed service errors
// =============================================================================

describe("fromDomainError with typed DiskService errors", () => {
  test("converts DiskNotFound to diskNotFound", () => {
    const error = { _tag: "DiskNotFound", path: "/mnt/disk1" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Disk not found")
    expect(appError.detail).toContain("/mnt/disk1")
  })

  test("converts DiskNotADirectory to notADirectory", () => {
    const error = { _tag: "DiskNotADirectory", path: "/mnt/disk1/file.txt" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Not a directory")
    expect(appError.detail).toContain("/mnt/disk1/file.txt")
  })

  test("converts DiskNotAMountPoint to notAMountPoint", () => {
    const error = { _tag: "DiskNotAMountPoint", path: "/home/user" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Not a mount point")
    expect(appError.detail).toContain("/home/user")
  })

  test("converts DiskPermissionDenied to diskPermissionDenied", () => {
    const error = { _tag: "DiskPermissionDenied", path: "/mnt/disk1" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Permission denied")
    expect(appError.detail).toContain("/mnt/disk1")
    expect(appError.suggestion).toContain("sudo")
  })

  test("converts DiskStatsFailed to diskStatsFailed", () => {
    const error = { _tag: "DiskStatsFailed", path: "/mnt/disk1", reason: "disk offline" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Cannot read disk stats")
    expect(appError.detail).toContain("disk offline")
  })
})

describe("fromDomainError with typed ScannerService errors", () => {
  test("converts ScanPathNotFound to scanFailed", () => {
    const error = { _tag: "ScanPathNotFound", path: "/mnt/spillover" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Scan failed")
    expect(appError.detail).toContain("Path does not exist")
  })

  test("converts ScanPermissionDenied to scanPermissionDenied", () => {
    const error = { _tag: "ScanPermissionDenied", path: "/mnt/spillover" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Permission denied during scan")
    expect(appError.detail).toContain("/mnt/spillover")
  })

  test("converts ScanFailed to scanFailed", () => {
    const error = { _tag: "ScanFailed", path: "/mnt/spillover", reason: "I/O error" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Scan failed")
    expect(appError.detail).toContain("I/O error")
  })

  test("converts FileStatFailed to scanFailed", () => {
    const error = { _tag: "FileStatFailed", path: "/mnt/spillover/file.mkv", reason: "broken symlink" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Scan failed")
    expect(appError.detail).toContain("broken symlink")
  })
})

describe("fromDomainError with typed TransferService errors", () => {
  test("converts TransferSourceNotFound to sourceNotFound", () => {
    const error = { _tag: "TransferSourceNotFound", path: "/mnt/spillover/file.mkv" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Source file missing")
    expect(appError.detail).toContain("/mnt/spillover/file.mkv")
  })

  test("converts TransferSourcePermissionDenied to sourcePermissionDenied", () => {
    const error = { _tag: "TransferSourcePermissionDenied", path: "/mnt/spillover/file.mkv" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Cannot read source file")
    expect(appError.detail).toContain("/mnt/spillover/file.mkv")
  })

  test("converts TransferDestinationPermissionDenied to destinationPermissionDenied", () => {
    const error = { _tag: "TransferDestinationPermissionDenied", path: "/mnt/disk1/file.mkv" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Cannot write to destination")
    expect(appError.detail).toContain("/mnt/disk1/file.mkv")
  })

  test("converts TransferDiskFull to diskFull", () => {
    const error = { _tag: "TransferDiskFull", path: "/mnt/disk1" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Disk full")
    expect(appError.detail).toContain("/mnt/disk1")
  })

  test("converts TransferBackendUnavailable to backendUnavailable", () => {
    const error = { _tag: "TransferBackendUnavailable", reason: "rsync not installed" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Transfer backend unavailable")
    expect(appError.suggestion).toContain("Install rsync")
  })

  test("converts TransferFailed to transferFailed", () => {
    const error = {
      _tag: "TransferFailed",
      source: "/mnt/spillover/file.mkv",
      destination: "/mnt/disk1/file.mkv",
      reason: "network error",
    }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Transfer failed")
    expect(appError.detail).toContain("network error")
  })
})

describe("fromDomainError with typed PlanStorageService errors", () => {
  test("converts PlanNotFound to planNotFound", () => {
    const error = { _tag: "PlanNotFound", path: "/config/plan.json" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("No plan found")
    expect(appError.detail).toContain("/config/plan.json")
  })

  test("converts PlanPermissionDenied (write) to planPermissionDenied", () => {
    const error = { _tag: "PlanPermissionDenied", path: "/config/plan.json", operation: "write" as const }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Permission denied")
    expect(appError.detail).toContain("write")
    expect(appError.suggestion).toContain("write permission")
  })

  test("converts PlanPermissionDenied (read) to planPermissionDenied", () => {
    const error = { _tag: "PlanPermissionDenied", path: "/config/plan.json", operation: "read" as const }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Permission denied")
    expect(appError.detail).toContain("read")
    expect(appError.suggestion).toContain("read permission")
  })

  test("converts PlanParseError to planCorrupted", () => {
    const error = { _tag: "PlanParseError", path: "/config/plan.json", reason: "Unexpected token" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Plan file corrupted")
    expect(appError.detail).toContain("Unexpected token")
  })

  test("converts PlanSaveFailed to planSaveFailed", () => {
    const error = { _tag: "PlanSaveFailed", path: "/config/plan.json", reason: "disk full" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Cannot save plan")
    expect(appError.detail).toContain("disk full")
  })

  test("converts PlanLoadFailed to planCorrupted", () => {
    const error = { _tag: "PlanLoadFailed", path: "/config/plan.json", reason: "file locked" }
    const appError = fromDomainError(error)

    expect(appError.title).toBe("Plan file corrupted")
    expect(appError.detail).toContain("file locked")
  })
})
