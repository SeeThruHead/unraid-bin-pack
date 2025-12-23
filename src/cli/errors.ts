/**
 * Application errors - user-friendly, actionable error messages.
 *
 * Uses Effect's Match for exhaustive, type-safe error handling.
 *
 * Each error explains:
 * 1. What happened
 * 2. Why it matters
 * 3. How to fix it
 */

import { Match } from "effect"

// Import all domain error types for exhaustive matching
import type {
  DiskNotFound,
  DiskNotADirectory,
  DiskNotAMountPoint,
  DiskPermissionDenied,
  DiskStatsFailed,
} from "../services/DiskService"

import type {
  ScanPathNotFound,
  ScanPermissionDenied,
  ScanFailed,
  FileStatFailed,
} from "../services/ScannerService"

import type {
  PlanNotFound,
  PlanPermissionDenied,
  PlanParseError,
  PlanSaveFailed,
  PlanLoadFailed,
} from "../infra/PlanStorageService"

import type {
  TransferSourceNotFound,
  TransferSourcePermissionDenied,
  TransferDestinationPermissionDenied,
  TransferDiskFull,
  TransferBackendUnavailable,
  TransferFailed,
} from "../services/TransferService"

// =============================================================================
// Domain error union - all typed errors from services
// =============================================================================

type DiskError =
  | DiskNotFound
  | DiskNotADirectory
  | DiskNotAMountPoint
  | DiskPermissionDenied
  | DiskStatsFailed

type ScannerError =
  | ScanPathNotFound
  | ScanPermissionDenied
  | ScanFailed
  | FileStatFailed

type PlanStorageError =
  | PlanNotFound
  | PlanPermissionDenied
  | PlanParseError
  | PlanSaveFailed
  | PlanLoadFailed

type TransferError =
  | TransferSourceNotFound
  | TransferSourcePermissionDenied
  | TransferDestinationPermissionDenied
  | TransferDiskFull
  | TransferBackendUnavailable
  | TransferFailed

type DomainError = DiskError | ScannerError | PlanStorageError | TransferError

// =============================================================================
// AppError - formatted user-facing errors
// =============================================================================

export class AppError extends Error {
  readonly _tag = "AppError"

  constructor(
    readonly title: string,
    readonly detail: string,
    readonly suggestion: string
  ) {
    super(`${title}: ${detail}`)
  }

  format(): string {
    return [
      `ERROR: ${this.title}`,
      ``,
      `   ${this.detail}`,
      ``,
      `   Hint: ${this.suggestion}`,
    ].join("\n")
  }
}

// =============================================================================
// Error factories - create AppErrors with consistent messaging
// =============================================================================

const errors = {
  // Disk errors
  diskNotFound: (path: string) =>
    new AppError(
      "Disk not found",
      `The path "${path}" does not exist.`,
      `Make sure the disk is mounted. On Unraid, check that the disk appears in Main > Array Devices.`
    ),

  notAMountPoint: (path: string) =>
    new AppError(
      "Not a mount point",
      `The path "${path}" is a directory but not a separate disk mount.`,
      `Unraid disks should be mounted at /mnt/disk1, /mnt/disk2, etc. Check your disk paths.`
    ),

  notADirectory: (path: string) =>
    new AppError(
      "Not a directory",
      `The path "${path}" exists but is not a directory.`,
      `Disk paths must be directories. Check that you provided the correct path.`
    ),

  diskStatsFailed: (path: string, reason: string) =>
    new AppError(
      "Cannot read disk stats",
      `Failed to get disk information for "${path}": ${reason}`,
      `Check that you have permission to access this path and the disk is healthy.`
    ),

  diskPermissionDenied: (path: string) =>
    new AppError(
      "Permission denied",
      `Cannot access disk at "${path}": permission denied.`,
      `Run the command with appropriate permissions (e.g., sudo) or check that your user has access to this mount point.`
    ),

  // Scanner errors
  scanFailed: (path: string, reason: string) =>
    new AppError(
      "Scan failed",
      `Could not scan files in "${path}": ${reason}`,
      `Check that the path exists and you have read permission.`
    ),

  scanPermissionDenied: (path: string) =>
    new AppError(
      "Permission denied during scan",
      `Cannot read files in "${path}": permission denied.`,
      `Check file permissions or run with elevated privileges.`
    ),

  // Plan errors
  planNotFound: (path: string) =>
    new AppError(
      "No plan found",
      `No plan file exists at "${path}".`,
      `Run 'unraid-bin-pack plan' first to create a plan.`
    ),

  planCorrupted: (path: string, reason: string) =>
    new AppError(
      "Plan file corrupted",
      `Could not read plan from "${path}": ${reason}`,
      `Delete the plan file and run 'unraid-bin-pack plan' to create a fresh plan.`
    ),

  planSaveFailed: (path: string, reason: string) =>
    new AppError(
      "Cannot save plan",
      `Failed to save plan to "${path}": ${reason}`,
      `Check that you have write permission to the directory.`
    ),

  planPermissionDenied: (path: string, operation: "read" | "write") =>
    new AppError(
      "Permission denied",
      `Cannot ${operation} plan file at "${path}": permission denied.`,
      operation === "write"
        ? `Check that you have write permission to the directory, or specify a different path with --plan-file.`
        : `Check that you have read permission to the plan file.`
    ),

  // Transfer errors
  transferFailed: (source: string, destination: string, reason: string) =>
    new AppError(
      "Transfer failed",
      `Could not move "${source}" to "${destination}": ${reason}`,
      `Check disk space, permissions, and that rsync is installed.`
    ),

  backendUnavailable: (reason: string) =>
    new AppError(
      "Transfer backend unavailable",
      reason,
      `Install rsync: On Unraid it should be pre-installed. In Docker, add 'apk add rsync' to your Dockerfile.`
    ),

  sourceNotFound: (path: string) =>
    new AppError(
      "Source file missing",
      `The source file "${path}" no longer exists.`,
      `The file may have been moved or deleted. Run 'unraid-bin-pack plan' to create a fresh plan.`
    ),

  sourcePermissionDenied: (path: string) =>
    new AppError(
      "Cannot read source file",
      `Permission denied for source file "${path}".`,
      `Check that you have read permission on the source files. You may need to run with elevated privileges.`
    ),

  destinationPermissionDenied: (path: string) =>
    new AppError(
      "Cannot write to destination",
      `Permission denied for destination path "${path}".`,
      `Check that you have write permission on the target disks. You may need to run with elevated privileges.`
    ),

  diskFull: (path: string) =>
    new AppError(
      "Disk full",
      `No space left on disk at "${path}".`,
      `Free up space on the target disk or run 'unraid-bin-pack plan' to recompute with current disk states.`
    ),

  // Generic
  unexpected: (message: string) =>
    new AppError(
      "Unexpected error",
      message,
      `If this persists, please report this issue.`
    ),

  permissionDenied: (message: string) =>
    new AppError(
      "Permission denied",
      message,
      `Check that you have the required permissions. You may need to run with elevated privileges.`
    ),
}

// =============================================================================
// Pattern matching for domain errors
// =============================================================================

const matchDomainError = Match.typeTags<DomainError>()({
  // Disk errors
  DiskNotFound: (e) => errors.diskNotFound(e.path),
  DiskNotADirectory: (e) => errors.notADirectory(e.path),
  DiskNotAMountPoint: (e) => errors.notAMountPoint(e.path),
  DiskPermissionDenied: (e) => errors.diskPermissionDenied(e.path),
  DiskStatsFailed: (e) => errors.diskStatsFailed(e.path, e.reason),

  // Scanner errors
  ScanPathNotFound: (e) => errors.scanFailed(e.path, "Path does not exist"),
  ScanPermissionDenied: (e) => errors.scanPermissionDenied(e.path),
  ScanFailed: (e) => errors.scanFailed(e.path, e.reason),
  FileStatFailed: (e) => errors.scanFailed(e.path, e.reason),

  // Plan storage errors
  PlanNotFound: (e) => errors.planNotFound(e.path),
  PlanPermissionDenied: (e) => errors.planPermissionDenied(e.path, e.operation),
  PlanParseError: (e) => errors.planCorrupted(e.path, e.reason),
  PlanSaveFailed: (e) => errors.planSaveFailed(e.path, e.reason),
  PlanLoadFailed: (e) => errors.planCorrupted(e.path, e.reason),

  // Transfer errors
  TransferSourceNotFound: (e) => errors.sourceNotFound(e.path),
  TransferSourcePermissionDenied: (e) => errors.sourcePermissionDenied(e.path),
  TransferDestinationPermissionDenied: (e) => errors.destinationPermissionDenied(e.path),
  TransferDiskFull: (e) => errors.diskFull(e.path),
  TransferBackendUnavailable: (e) => errors.backendUnavailable(e.reason),
  TransferFailed: (e) => errors.transferFailed(e.source, e.destination, e.reason),
})

// =============================================================================
// Type guard for domain errors
// =============================================================================

const isDomainError = (e: unknown): e is DomainError =>
  typeof e === "object" &&
  e !== null &&
  "_tag" in e &&
  typeof (e as { _tag: unknown })._tag === "string"

// Helper to detect permission-related error messages
const isPermissionError = (message: string): boolean =>
  message.toLowerCase().includes("permission denied") ||
  message.toLowerCase().includes("eacces") ||
  message.toLowerCase().includes("operation not permitted") ||
  message.toLowerCase().includes("eperm")

// =============================================================================
// Main conversion function
// =============================================================================

export const fromDomainError = (error: unknown): AppError => {
  // Already an AppError
  if (error instanceof AppError) {
    return error
  }

  // Typed domain error - use exhaustive pattern matching
  if (isDomainError(error)) {
    try {
      return matchDomainError(error)
    } catch {
      // Fall through to generic handling if tag not matched
      // (handles legacy error types during migration)
    }
  }

  // Standard Error
  if (error instanceof Error) {
    return isPermissionError(error.message)
      ? errors.permissionDenied(error.message)
      : errors.unexpected(error.message)
  }

  // Unknown
  return errors.unexpected(String(error))
}

// =============================================================================
// Re-export error factories for direct use
// =============================================================================

export const {
  diskNotFound,
  notAMountPoint,
  notADirectory,
  diskStatsFailed,
  diskPermissionDenied,
  scanFailed,
  scanPermissionDenied,
  planNotFound,
  planCorrupted,
  planSaveFailed,
  planPermissionDenied,
  transferFailed,
  backendUnavailable,
  sourceNotFound,
  sourcePermissionDenied,
  destinationPermissionDenied,
  diskFull,
  unexpected,
  permissionDenied,
} = errors
