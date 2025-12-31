import { test, expect } from "bun:test";
import {
  createInitEvent,
  createMoveEvent,
  createFailEvent,
  createNoteEvent,
  parseEvent,
  type InitEventData,
  type MoveEventData,
  type FailEventData,
  type NoteEventData
} from "./CompactEventLogger";

test("createInitEvent - creates initial state event", () => {
  const disks = [
    { path: "/mnt/disk1", totalBytes: 1000000, freeBytes: 500000 },
    { path: "/mnt/disk2", totalBytes: 2000000, freeBytes: 1500000 }
  ];

  const event = createInitEvent(disks);

  expect(event).toBe("I|/mnt/disk1:1000000:500000|/mnt/disk2:2000000:1500000");
});

test("createMoveEvent - creates file move event", () => {
  const diskPaths = ["/mnt/disk1", "/mnt/disk2", "/mnt/disk3"];
  const event = createMoveEvent("movie.mkv", "/mnt/disk1", "/mnt/disk2", 1048576, diskPaths);

  expect(event).toBe("M|movie.mkv|0|1|1048576");
});

test("createFailEvent - creates failure event", () => {
  const diskPaths = ["/mnt/disk1", "/mnt/disk2"];
  const event = createFailEvent("large-file.mkv", "/mnt/disk1", "No space available", diskPaths);

  expect(event).toBe("F|large-file.mkv|0|No space available");
});

test("createNoteEvent - creates note event", () => {
  const event = createNoteEvent("Processing disk1: 5 files");

  expect(event).toBe("N|Processing disk1: 5 files");
});

test("parseEvent - parses init event", () => {
  const event = "I|/mnt/disk1:1000000:500000|/mnt/disk2:2000000:1500000";
  const parsed = parseEvent(event);

  expect(parsed.type).toBe("init");
  const data = parsed.data as InitEventData;
  expect(data.disks).toHaveLength(2);
  expect(data.disks[0]).toEqual({
    path: "/mnt/disk1",
    totalBytes: 1000000,
    freeBytes: 500000
  });
});

test("parseEvent - parses move event", () => {
  const event = "M|movie.mkv|0|1|1048576";
  const parsed = parseEvent(event);

  expect(parsed.type).toBe("move");
  const data = parsed.data as MoveEventData;
  expect(data.fileName).toBe("movie.mkv");
  expect(data.fromDiskIdx).toBe(0);
  expect(data.toDiskIdx).toBe(1);
  expect(data.sizeBytes).toBe(1048576);
});

test("parseEvent - parses fail event", () => {
  const event = "F|large-file.mkv|0|No space available";
  const parsed = parseEvent(event);

  expect(parsed.type).toBe("fail");
  const data = parsed.data as FailEventData;
  expect(data.fileName).toBe("large-file.mkv");
  expect(data.fromDiskIdx).toBe(0);
  expect(data.reason).toBe("No space available");
});

test("parseEvent - parses note event", () => {
  const event = "N|Processing disk1: 5 files";
  const parsed = parseEvent(event);

  expect(parsed.type).toBe("note");
  const data = parsed.data as NoteEventData;
  expect(data.message).toBe("Processing disk1: 5 files");
});

test("parseEvent - handles pipes in reason", () => {
  const event = "F|file.mkv|0|Reason with | pipe character";
  const parsed = parseEvent(event);

  expect(parsed.type).toBe("fail");
  const data = parsed.data as FailEventData;
  expect(data.reason).toBe("Reason with | pipe character");
});

test("parseEvent - handles pipes in note message", () => {
  const event = "N|Message with | pipe | characters";
  const parsed = parseEvent(event);

  expect(parsed.type).toBe("note");
  const data = parsed.data as NoteEventData;
  expect(data.message).toBe("Message with | pipe | characters");
});
