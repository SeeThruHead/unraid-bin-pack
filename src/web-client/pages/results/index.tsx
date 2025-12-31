import { useState, useCallback } from "react";
import { Stack, Alert, Accordion, Text, Code, Loader, Center } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { PlanSummary } from "./components/PlanSummary";
import { DiskStatsTable } from "./components/DiskStatsTable";
import { ExecutionPanel } from "./components/ExecutionPanel";
import { ExecutionSummary } from "./components/ExecutionSummary";
import type { PlanResponse, DiskResponse } from "../../types";

type ExecutionResult = {
  success: boolean;
  output: string;
  summary?: unknown;
};

interface ResultsPageProps {
  result: (PlanResponse & { selectedDiskPaths?: string[] }) | null;
}

export function ResultsPage({ result }: ResultsPageProps) {
  const queryClient = useQueryClient();
  const [actualDiskSpace, setActualDiskSpace] = useState<DiskResponse[]>([]);
  const [executionResult, setExecutionResult] = useState<{
    result: ExecutionResult;
    dryRun: boolean;
  } | null>(null);

  const handleExecutionComplete = useCallback(
    (execResult: { result: ExecutionResult; dryRun: boolean }) => {
      setExecutionResult(execResult);
      if (!execResult.dryRun) {
        queryClient.invalidateQueries({ queryKey: ["disks"] });
      }
    },
    [queryClient]
  );

  if (!result) {
    return (
      <Center h={200}>
        <Loader color="yellow" />
      </Center>
    );
  }

  const selectedDiskPaths = result.selectedDiskPaths || [];

  return (
    <Stack gap="lg" mt="md">
      <Alert icon={<IconCheck size={16} />} title="Plan Created Successfully" color="yellow">
        Your consolidation plan has been generated and saved to /config/plan.sh
      </Alert>

      <PlanSummary
        movesPlanned={result.stats.movesPlanned}
        bytesConsolidated={result.stats.bytesConsolidated}
      />

      <Accordion variant="separated" defaultValue="disk-stats">
        <Accordion.Item value="disk-stats">
          <Accordion.Control>
            <Text fw={500}>Disk Stats (Before → After)</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <DiskStatsTable
              diskProjections={result.diskProjections}
              actualDiskSpace={actualDiskSpace.length > 0 ? actualDiskSpace : undefined}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="script">
          <Accordion.Control>
            <Text fw={500}>Plan Script</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Code block>{result.script}</Code>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      {executionResult && !executionResult.dryRun && (
        <ExecutionSummary
          diskProjections={result.diskProjections}
          success={executionResult.result.success}
        />
      )}

      <ExecutionPanel
        diskProjections={result.diskProjections}
        selectedDiskPaths={selectedDiskPaths}
        onVerify={setActualDiskSpace}
        onExecutionComplete={handleExecutionComplete}
      />
    </Stack>
  );
}
