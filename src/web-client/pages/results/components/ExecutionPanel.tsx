import { useState, useCallback } from "react";
import type { DiskProjection, DiskResponse } from "../../../types";
import { usePlanExecution } from "../../../hooks/usePlanExecution";
import type { ExecutionResult } from "../../../hooks/usePlanExecution";
import { DryRunComplete } from "./DryRunComplete";
import { ExecutionComplete } from "./ExecutionComplete";
import { ExecutionButtons } from "./ExecutionButtons";
import { ExecutionProgress } from "./ExecutionProgress";

interface ExecutionPanelProps {
  diskProjections: DiskProjection[];
  selectedDiskPaths: string[];
  onVerify: (actualDiskSpace: DiskResponse[]) => void;
  onExecutionComplete: (result: { result: ExecutionResult; dryRun: boolean }) => void;
}

export function ExecutionPanel({
  diskProjections,
  selectedDiskPaths,
  onVerify,
  onExecutionComplete
}: ExecutionPanelProps) {
  const [dryRunResult, setDryRunResult] = useState<ExecutionResult | null>(null);
  const [realExecutionResult, setRealExecutionResult] = useState<ExecutionResult | null>(null);

  const { events, status, error, result, execute, reset } = usePlanExecution({
    planPath: "/config/plan.sh",
    concurrency: 4,
    diskProjections,
    selectedDiskPaths,
    onComplete: useCallback(
      (executionResult: ExecutionResult, dryRun: boolean) => {
        if (dryRun) {
          setDryRunResult(executionResult);
        } else {
          setRealExecutionResult(executionResult);
        }
        onExecutionComplete({ result: executionResult, dryRun });
      },
      [onExecutionComplete]
    ),
    onVerified: useCallback(
      (diskSpace: DiskResponse[]) => {
        onVerify(diskSpace);
      },
      [onVerify]
    )
  });

  const handleDryRun = useCallback(() => {
    onVerify([]);
    execute(true);
  }, [execute, onVerify]);

  const handleExecute = useCallback(() => {
    onVerify([]);
    execute(false);
  }, [execute, onVerify]);

  const handleExecuteReal = useCallback(() => {
    setDryRunResult(null);
    reset();
    handleExecute();
  }, [reset, handleExecute]);

  const isExecuting = status === "executing" || status === "verifying";
  const hasCompleted = dryRunResult || realExecutionResult;

  return (
    <>
      {dryRunResult && <DryRunComplete result={dryRunResult} onExecuteReal={handleExecuteReal} />}
      {realExecutionResult && <ExecutionComplete result={realExecutionResult} />}
      {!hasCompleted && !isExecuting && (
        <ExecutionButtons onDryRun={handleDryRun} onExecute={handleExecute} error={error} />
      )}
      {events.length > 0 && hasCompleted && <ExecutionProgress events={events} executing={false} />}
      {isExecuting && !hasCompleted && <ExecutionProgress events={events} executing={true} />}
    </>
  );
}
