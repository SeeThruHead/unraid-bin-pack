import { Card, Checkbox, Text, Group, Stack, Progress, ThemeIcon } from "@mantine/core";
import { IconDeviceFloppy } from "@tabler/icons-react";
import type { DiskResponse } from "../../../types";
import { calculateUsedPercent } from "../../../lib/diskCalculations";

const formatGB = (bytes: number): string => (bytes / 1024 / 1024 / 1024).toFixed(1);

interface DiskCardProps {
  disk: DiskResponse;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function DiskCard({ disk, checked, onChange }: DiskCardProps) {
  const usedPercent = calculateUsedPercent(disk.totalBytes, disk.freeBytes);
  const freeGB = formatGB(disk.freeBytes);

  return (
    <Card
      withBorder
      padding="md"
      radius="md"
      style={{ cursor: "pointer", transition: "transform 0.1s" }}
      onClick={() => onChange(!checked)}
    >
      <Group wrap="nowrap" align="center" gap="md">
        <Checkbox
          checked={checked}
          onChange={(e) => {
            e.stopPropagation();
            onChange(e.currentTarget.checked);
          }}
          size="md"
        />

        <ThemeIcon size="xl" variant="light" color="yellow" radius="md">
          <IconDeviceFloppy size={24} />
        </ThemeIcon>

        <Stack gap="xs" style={{ flex: 1 }}>
          <Text fw={600} size="sm">
            {disk.path}
          </Text>

          <Progress
            value={usedPercent}
            color={usedPercent > 90 ? "red" : usedPercent > 75 ? "yellow" : "blue"}
            size="sm"
          />

          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {freeGB} GB free
            </Text>
            <Text size="xs" c="dimmed">
              {usedPercent.toFixed(1)}% used
            </Text>
          </Group>
        </Stack>
      </Group>
    </Card>
  );
}
