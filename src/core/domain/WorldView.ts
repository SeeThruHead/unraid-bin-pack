import type { FileEntry } from "./FileEntry";
import type { FileMove } from "./MovePlan";

export interface DiskState {
  readonly path: string;
  readonly totalBytes: number;
  readonly freeBytes: number;
}

export interface WorldView {
  readonly disks: ReadonlyArray<DiskState>;
  readonly files: ReadonlyArray<FileEntry>;
}

export const createWorldView = (
  disks: ReadonlyArray<DiskState>,
  files: ReadonlyArray<FileEntry> = []
): WorldView => ({
  disks,
  files
});

export const addFile =
  (diskPath: string, relativePath: string, sizeBytes: number) =>
  (worldView: WorldView): WorldView => {
    const newFile: FileEntry = {
      diskPath,
      relativePath,
      absolutePath: `${diskPath}/${relativePath}`,
      sizeBytes
    };

    const updatedDisks = worldView.disks.map((disk) =>
      disk.path === diskPath ? { ...disk, freeBytes: disk.freeBytes - sizeBytes } : disk
    );

    return {
      disks: updatedDisks,
      files: [...worldView.files, newFile]
    };
  };

export const removeFile =
  (relativePath: string) =>
  (worldView: WorldView): WorldView => {
    const fileToRemove = worldView.files.find((f) => f.relativePath === relativePath);
    if (!fileToRemove) {
      return worldView;
    }

    const updatedDisks = worldView.disks.map((disk) =>
      disk.path === fileToRemove.diskPath
        ? { ...disk, freeBytes: disk.freeBytes + fileToRemove.sizeBytes }
        : disk
    );

    return {
      disks: updatedDisks,
      files: worldView.files.filter((f) => f.relativePath !== relativePath)
    };
  };

export const moveFile =
  (file: FileEntry, targetDiskPath: string, destinationPath: string) =>
  (worldView: WorldView): WorldView => {
    const updatedDisks = worldView.disks.map((disk) => {
      if (disk.path === file.diskPath) {
        return { ...disk, freeBytes: disk.freeBytes + file.sizeBytes };
      } else if (disk.path === targetDiskPath) {
        return { ...disk, freeBytes: disk.freeBytes - file.sizeBytes };
      }
      return disk;
    });

    const updatedFiles = worldView.files.map((f) => {
      if (f.absolutePath === file.absolutePath) {
        return {
          ...f,
          diskPath: targetDiskPath,
          absolutePath: destinationPath
        };
      }
      return f;
    });

    return {
      disks: updatedDisks,
      files: updatedFiles
    };
  };

export const updateDiskFreeSpace =
  (diskPath: string, deltaBytes: number) =>
  (worldView: WorldView): WorldView => ({
    ...worldView,
    disks: worldView.disks.map((disk) =>
      disk.path === diskPath ? { ...disk, freeBytes: disk.freeBytes + deltaBytes } : disk
    )
  });

export const applyMove = (worldView: WorldView, move: FileMove): WorldView =>
  moveFile(move.file, move.targetDiskPath, move.destinationPath)(worldView);
