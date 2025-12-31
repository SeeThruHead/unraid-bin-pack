import { Stack, Text, Badge, Group, Button, Alert } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { ConfigCard } from "./components/ConfigCard";
import { PatternBadges } from "./components/PatternBadges";
import { usePlanStore } from "../../store/planStore";
import type { PlanResponse } from "../../types";

const parseCustomPatterns = (customString: string): string[] =>
  customString ? customString.split(",").map((s) => s.trim()) : [];

const mergePatterns = (patterns: string[], customPatterns: string): string[] => [
  ...patterns,
  ...parseCustomPatterns(customPatterns)
];

interface ReviewPageProps {
  onBack: () => void;
  onCreatePlan: () => void;
  isCreatingPlan: boolean;
  planError?: string | null;
}

export function ReviewPage({ onBack, onCreatePlan, isCreatingPlan, planError }: ReviewPageProps) {
  const { values } = usePlanStore();
  const includePatterns = mergePatterns(values.include, values.includeCustom);
  const excludePatterns = mergePatterns(values.exclude, values.excludeCustom);

  return (
    <Stack gap="md" mt="md">
      {planError && (
        <Alert icon={<IconAlertCircle size={16} />} title="Plan Creation Failed" color="red">
          {planError}
        </Alert>
      )}

      <ConfigCard title="Disk Configuration">
        <Text size="sm" c="dimmed">
          Destination Disks:
        </Text>
        <Group gap="xs" mb="md">
          {values.destDisks.map((disk) => (
            <Badge key={disk} color="yellow" variant="light">
              {disk}
            </Badge>
          ))}
        </Group>

        <Text size="sm" c="dimmed">
          Source Disk:
        </Text>
        <Badge color="blue" variant="light">
          {values.sourceDisk || "Auto-select (iterative emptying)"}
        </Badge>
      </ConfigCard>

      {values.pathFilters.length > 0 && (
        <ConfigCard title="Path Filters">
          <PatternBadges patterns={values.pathFilters} color="grape" />
        </ConfigCard>
      )}

      <ConfigCard title="Size Constraints">
        <Text size="sm">
          <Text span fw={500}>
            Minimum Space:
          </Text>{" "}
          {values.minSpace}
        </Text>
        <Text size="sm">
          <Text span fw={500}>
            Minimum File Size:
          </Text>{" "}
          {values.minFileSize}
        </Text>
      </ConfigCard>

      {includePatterns.length > 0 && (
        <ConfigCard title="Include Patterns">
          <PatternBadges patterns={includePatterns} color="green" />
        </ConfigCard>
      )}

      {excludePatterns.length > 0 && (
        <ConfigCard title="Exclude Patterns">
          <PatternBadges patterns={excludePatterns} color="red" />
        </ConfigCard>
      )}

      <ConfigCard title="Advanced Options">
        <Text size="sm">
          <Text span fw={500}>
            Min Split Size:
          </Text>{" "}
          {values.minSplitSize}
        </Text>
        <Text size="sm">
          <Text span fw={500}>
            Move as Folder Threshold:
          </Text>{" "}
          {values.moveAsFolderThreshold}
        </Text>
        {values.debug && <Badge color="orange">Debug Mode Enabled</Badge>}
        {values.force && <Badge color="red">Force Mode Enabled</Badge>}
      </ConfigCard>

      <Group justify="space-between" mt="xl">
        <Button variant="default" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onCreatePlan} loading={isCreatingPlan}>
          {isCreatingPlan ? "Creating Plan..." : "Create Plan"}
        </Button>
      </Group>
    </Stack>
  );
}
