import { Schema } from "@effect/schema";

export type CompactEvent = string;

export interface EventLoggerState {
  readonly diskPaths: ReadonlyArray<string>;
  readonly events: ReadonlyArray<CompactEvent>;
}

export const createInitEvent = (
  disks: ReadonlyArray<{ path: string; totalBytes: number; freeBytes: number }>
): CompactEvent => {
  const diskEntries = disks.map((d) => `${d.path}:${d.totalBytes}:${d.freeBytes}`).join("|");
  return `I|${diskEntries}`;
};

export const createMoveEvent = (
  fileName: string,
  fromDiskPath: string,
  toDiskPath: string,
  sizeBytes: number,
  diskPaths: ReadonlyArray<string>
): CompactEvent => {
  const fromIdx = diskPaths.indexOf(fromDiskPath);
  const toIdx = diskPaths.indexOf(toDiskPath);
  return `M|${fileName}|${fromIdx}|${toIdx}|${sizeBytes}`;
};

export const createFailEvent = (
  fileName: string,
  fromDiskPath: string,
  reason: string,
  diskPaths: ReadonlyArray<string>
): CompactEvent => {
  const fromIdx = diskPaths.indexOf(fromDiskPath);
  return `F|${fileName}|${fromIdx}|${reason}`;
};

export const createNoteEvent = (message: string): CompactEvent => {
  return `N|${message}`;
};

export interface ParsedEvent {
  readonly type: "init" | "move" | "fail" | "note";
  readonly data: unknown;
}

export interface InitEventData {
  readonly disks: ReadonlyArray<{
    readonly path: string;
    readonly totalBytes: number;
    readonly freeBytes: number;
  }>;
}

export interface MoveEventData {
  readonly fileName: string;
  readonly fromDiskIdx: number;
  readonly toDiskIdx: number;
  readonly sizeBytes: number;
}

export interface FailEventData {
  readonly fileName: string;
  readonly fromDiskIdx: number;
  readonly reason: string;
}

export interface NoteEventData {
  readonly message: string;
}

const DiskSchema = Schema.Struct({
  path: Schema.String,
  totalBytes: Schema.Number,
  freeBytes: Schema.Number
});

const InitEventDataSchema = Schema.Struct({
  disks: Schema.Array(DiskSchema)
});

const MoveEventDataSchema = Schema.Struct({
  fileName: Schema.String,
  fromDiskIdx: Schema.Number,
  toDiskIdx: Schema.Number,
  sizeBytes: Schema.Number
});

const FailEventDataSchema = Schema.Struct({
  fileName: Schema.String,
  fromDiskIdx: Schema.Number,
  reason: Schema.String
});

const NoteEventDataSchema = Schema.Struct({
  message: Schema.String
});

export const parseEvent = (event: CompactEvent): ParsedEvent => {
  const [type, ...parts] = event.split("|");

  switch (type) {
    case "I": {
      const disks = parts
        .map((diskStr) => {
          const [path, totalBytes, freeBytes] = diskStr.split(":");
          if (!path || !totalBytes || !freeBytes) {
            return null;
          }
          return {
            path,
            totalBytes: Number(totalBytes),
            freeBytes: Number(freeBytes)
          };
        })
        .filter((disk): disk is NonNullable<typeof disk> => disk !== null);
      const validated = Schema.decodeUnknownSync(InitEventDataSchema)({ disks });
      return { type: "init", data: validated };
    }

    case "M": {
      const [fileName, fromIdx, toIdx, sizeBytes] = parts;
      if (!fileName || !fromIdx || !toIdx || !sizeBytes) {
        const fallback = Schema.decodeUnknownSync(NoteEventDataSchema)({
          message: "Invalid move event"
        });
        return { type: "note", data: fallback };
      }
      const validated = Schema.decodeUnknownSync(MoveEventDataSchema)({
        fileName,
        fromDiskIdx: Number(fromIdx),
        toDiskIdx: Number(toIdx),
        sizeBytes: Number(sizeBytes)
      });
      return { type: "move", data: validated };
    }

    case "F": {
      const [fileName, fromIdx, ...reasonParts] = parts;
      if (!fileName || !fromIdx) {
        const fallback = Schema.decodeUnknownSync(NoteEventDataSchema)({
          message: "Invalid fail event"
        });
        return { type: "note", data: fallback };
      }
      const validated = Schema.decodeUnknownSync(FailEventDataSchema)({
        fileName,
        fromDiskIdx: Number(fromIdx),
        reason: reasonParts.join("|")
      });
      return { type: "fail", data: validated };
    }

    case "N": {
      const validated = Schema.decodeUnknownSync(NoteEventDataSchema)({ message: parts.join("|") });
      return { type: "note", data: validated };
    }

    default: {
      const validated = Schema.decodeUnknownSync(NoteEventDataSchema)({
        message: `Unknown event type: ${type}`
      });
      return { type: "note", data: validated };
    }
  }
};
