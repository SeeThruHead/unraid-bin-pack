import { Card, Stack, Alert, Button, Text } from "@mantine/core";
import { IconCheck, IconPlayerPlay } from "@tabler/icons-react";

type ExecutionResult = {
  success: boolean;
  output: string;
  summary?: unknown;
};

interface DryRunCompleteProps {
  result: ExecutionResult;
  onExecuteReal: () => void;
}

export function DryRunComplete({ result, onExecuteReal }: DryRunCompleteProps) {
  return (
    <Card withBorder>
      <Stack gap="md">
        <Alert icon={<IconCheck size={16} />} title="Dry Run Complete" color="blue">
          <Text>Dry run completed successfully! No files were actually moved.</Text>
        </Alert>
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          onClick={onExecuteReal}
          color="yellow"
          size="lg"
        >
          Execute Plan (For Real)
        </Button>
      </Stack>
    </Card>
  );
}
