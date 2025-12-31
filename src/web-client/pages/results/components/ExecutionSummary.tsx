import { Card, Stack, Text, Group, ThemeIcon } from "@mantine/core";
import { IconCheck, IconAlertCircle } from "@tabler/icons-react";
import type { DiskProjection } from "../../../types";
import { formatBytesWithPrecision } from "../../../lib/formatters";
import { calculateTotalDataMoved, countAffectedDisks } from "../../../lib/diskCalculations";

interface ExecutionSummaryProps {
  diskProjections: DiskProjection[];
  success: boolean;
}

export function ExecutionSummary({ diskProjections, success }: ExecutionSummaryProps) {
  const totalDataMoved = calculateTotalDataMoved(diskProjections);
  const { sources, destinations } = countAffectedDisks(diskProjections);

  return (
    <Card withBorder padding="md">
      <Stack gap="md">
        <Group gap="sm">
          <ThemeIcon size="lg" variant="light" color={success ? "green" : "red"} radius="xl">
            {success ? <IconCheck size={20} /> : <IconAlertCircle size={20} />}
          </ThemeIcon>
          <div>
            <Text fw={600} size="lg">
              Execution Summary
            </Text>
            <Text size="sm" c="dimmed">
              {success ? "Plan executed successfully" : "Execution failed"}
            </Text>
          </div>
        </Group>

        <Group gap="xl">
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Total Data Moved
            </Text>
            <Text size="lg" fw={600} c="yellow">
              {formatBytesWithPrecision(totalDataMoved, 2)}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Source Disks
            </Text>
            <Text size="lg" fw={600} c="orange">
              {sources}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Destination Disks
            </Text>
            <Text size="lg" fw={600} c="blue">
              {destinations}
            </Text>
          </div>
        </Group>
      </Stack>
    </Card>
  );
}
