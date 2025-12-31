import { Card, Group, Text } from '@mantine/core'

const formatBytes = (bytes: number): string => {
  const gb = bytes / 1024 / 1024 / 1024
  const mb = bytes / 1024 / 1024

  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`
  }
  return `${mb.toFixed(0)} MB`
}

interface PlanSummaryProps {
  movesPlanned: number
  bytesConsolidated: number
}

export function PlanSummary({ movesPlanned, bytesConsolidated }: PlanSummaryProps) {
  return (
    <Card withBorder>
      <Text fw={500} size="lg" mb="md">Plan Summary</Text>
      <Group grow>
        <div>
          <Text size="sm" c="dimmed">Files to Move</Text>
          <Text size="xl" fw={700} c="yellow">{movesPlanned}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">Total Data Size</Text>
          <Text size="xl" fw={700} c="yellow">{formatBytes(bytesConsolidated)}</Text>
        </div>
      </Group>
    </Card>
  )
}
