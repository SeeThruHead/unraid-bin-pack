import { Card, Stack, Text, Group, ThemeIcon } from '@mantine/core'
import { IconCheck, IconAlertCircle } from '@tabler/icons-react'
import type { DiskProjection } from '../../../types'

const formatBytes = (bytes: number): string => {
  const gb = bytes / 1024 / 1024 / 1024
  const mb = bytes / 1024 / 1024

  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`
  }
  return `${mb.toFixed(0)} MB`
}

const calculateTotalDataMoved = (diskProjections: DiskProjection[]): number => {
  return diskProjections.reduce((total, disk) => {
    const moved = Math.abs(disk.freeAfter - disk.currentFree)
    return total + moved
  }, 0)
}

const countAffectedDisks = (diskProjections: DiskProjection[]): { sources: number; destinations: number } => {
  let sources = 0
  let destinations = 0

  diskProjections.forEach((disk) => {
    const diff = disk.freeAfter - disk.currentFree
    if (diff > 1024 * 1024) {
      // More than 1MB freed
      sources++
    } else if (diff < -1024 * 1024) {
      // More than 1MB used
      destinations++
    }
  })

  return { sources, destinations }
}

interface ExecutionSummaryProps {
  diskProjections: DiskProjection[]
  success: boolean
}

export function ExecutionSummary({ diskProjections, success }: ExecutionSummaryProps) {
  const totalDataMoved = calculateTotalDataMoved(diskProjections)
  const { sources, destinations } = countAffectedDisks(diskProjections)

  return (
    <Card withBorder padding="md">
      <Stack gap="md">
        <Group gap="sm">
          <ThemeIcon
            size="lg"
            variant="light"
            color={success ? 'green' : 'red'}
            radius="xl"
          >
            {success ? <IconCheck size={20} /> : <IconAlertCircle size={20} />}
          </ThemeIcon>
          <div>
            <Text fw={600} size="lg">
              Execution Summary
            </Text>
            <Text size="sm" c="dimmed">
              {success ? 'Plan executed successfully' : 'Execution failed'}
            </Text>
          </div>
        </Group>

        <Group gap="xl">
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Total Data Moved
            </Text>
            <Text size="lg" fw={600} c="yellow">
              {formatBytes(totalDataMoved)}
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
  )
}
