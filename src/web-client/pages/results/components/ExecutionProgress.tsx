import { Card, Stack, Text, Progress, Timeline } from "@mantine/core";
import type { ExecutionEvent } from "../../../hooks/usePlanExecution";

interface ExecutionProgressProps {
  events: ExecutionEvent[];
  executing?: boolean;
}

export function ExecutionProgress({ events, executing = true }: ExecutionProgressProps) {
  return (
    <Card withBorder>
      <Stack gap="md">
        <Text fw={500}>{executing ? "Execution in Progress" : "Event Log"}</Text>
        {executing && <Progress value={100} animated color="yellow" />}
        <Timeline active={events.length - 1} bulletSize={24} lineWidth={2} color="yellow">
          {events.map((event, index) => (
            <Timeline.Item key={index} title={event.message}>
              <Text size="xs" c="dimmed">
                {event.timestamp.toLocaleTimeString()}
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>
      </Stack>
    </Card>
  );
}
