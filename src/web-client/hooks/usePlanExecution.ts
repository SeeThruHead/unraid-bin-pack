import { useState, useCallback, useRef } from "react";
import { hc } from "hono/client";
import type { RpcRoutes } from "../../web-server/rpc";
import type { DiskProjection, DiskResponse } from "../types";
import { safeJsonParse } from "../lib/safeJson";

const client = hc<RpcRoutes>("/api");

export type ExecutionEvent = {
  message: string;
  timestamp: Date;
};

export type ExecutionResult = {
  success: boolean;
  output: string;
  summary?: unknown;
};

export type ExecutionStatus = "idle" | "executing" | "verifying" | "complete" | "error";

type SSEMessage =
  | { type: "start"; message: string }
  | { type: "progress"; message: string }
  | { type: "complete"; result: ExecutionResult }
  | { type: "error"; error: string };

interface UsePlanExecutionConfig {
  planPath: string;
  concurrency: number;
  diskProjections: DiskProjection[];
  selectedDiskPaths: string[];
  onComplete?: (result: ExecutionResult, dryRun: boolean) => void;
  onVerified?: (diskSpace: DiskResponse[]) => void;
}

interface UsePlanExecutionReturn {
  events: ExecutionEvent[];
  status: ExecutionStatus;
  error: string | null;
  result: ExecutionResult | null;
  execute: (dryRun: boolean) => void;
  reset: () => void;
}

const parseSSEData = safeJsonParse<SSEMessage>;

const addEvent = (events: ExecutionEvent[], message: string): ExecutionEvent[] => [
  ...events,
  { message, timestamp: new Date() }
];

export function usePlanExecution(config: UsePlanExecutionConfig): UsePlanExecutionReturn {
  const { planPath, concurrency, diskProjections, selectedDiskPaths, onComplete, onVerified } =
    config;

  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [status, setStatus] = useState<ExecutionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    setEvents([]);
    setStatus("idle");
    setError(null);
    setResult(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const execute = useCallback(
    (dryRun: boolean) => {
      reset();
      setStatus("executing");
      setEvents([{ message: "Connecting to server...", timestamp: new Date() }]);

      const url = `/api/apply-stream?planPath=${planPath}&concurrency=${concurrency}&dryRun=${dryRun}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = async (event) => {
        const data = parseSSEData(event.data);
        if (!data) return;

        switch (data.type) {
          case "start":
          case "progress":
            setEvents((prev) => addEvent(prev, data.message));
            break;

          case "complete":
            setEvents((prev) => addEvent(prev, "Execution complete!"));
            setResult(data.result);

            if (!dryRun) {
              setStatus("verifying");
              setEvents((prev) => addEvent(prev, "Verifying disk space..."));

              const response = await client["verify-disk-space"].$post({
                json: { diskPaths: selectedDiskPaths }
              });
              const actualDiskSpace = (await response.json()) as DiskResponse[];

              onVerified?.(actualDiskSpace);
              setEvents((prev) => addEvent(prev, "Verification complete!"));
            }

            setStatus("complete");
            onComplete?.(data.result, dryRun);
            eventSource.close();
            break;

          case "error":
            setError(data.error);
            setStatus("error");
            eventSource.close();
            break;
        }
      };

      eventSource.onerror = () => {
        setError("Connection to server lost");
        setStatus("error");
        eventSource.close();
      };
    },
    [planPath, concurrency, diskProjections, selectedDiskPaths, onComplete, onVerified, reset]
  );

  return {
    events,
    status,
    error,
    result,
    execute,
    reset
  };
}
