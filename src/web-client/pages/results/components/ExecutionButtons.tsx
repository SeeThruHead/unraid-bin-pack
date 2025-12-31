import { Card, Stack, Text, Button, Alert, Group } from "@mantine/core";
import { IconPlayerPlay, IconAlertCircle } from "@tabler/icons-react";

interface ExecutionButtonsProps {
  onDryRun: () => void;
  onExecute: () => void;
  error: string | null;
}

export function ExecutionButtons({ onDryRun, onExecute, error }: ExecutionButtonsProps) {
  return (
    <>
      <Card withBorder>
        <Stack gap="md">
          <Text fw={500}>Execute Plan</Text>
          <Text size="sm" c="dimmed">
            Click the button below to execute the consolidation plan. This will start moving files
            according to the plan.
          </Text>
          {error && (
            <Alert icon={<IconAlertCircle size={16} />} title="Execution Error" color="red">
              {error}
            </Alert>
          )}
          <Group gap="md">
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              onClick={onDryRun}
              variant="light"
              color="yellow"
              size="lg"
            >
              Dry Run
            </Button>
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              onClick={onExecute}
              color="yellow"
              size="lg"
            >
              Execute Plan
            </Button>
          </Group>
        </Stack>
      </Card>
      <Text size="sm" c="dimmed" ta="center">
        You can execute this plan from the web UI or run it manually from the command line
      </Text>
    </>
  );
}
