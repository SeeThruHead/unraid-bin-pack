import { Stack, Text, SimpleGrid } from '@mantine/core'
import { DiskCard } from './DiskCard'
import type { DiskResponse } from '../../../types'

interface DiskListProps {
  disks: DiskResponse[]
  selectedDisks: string[]
  onToggleDisk: (diskPath: string, checked: boolean) => void
}

export function DiskList({ disks, selectedDisks, onToggleDisk }: DiskListProps) {
  return (
    <Stack gap="md">
      <div>
        <Text fw={500}>Destination Disks</Text>
        <Text size="sm" c="dimmed">Select which disks to consolidate files into</Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {disks.map((disk) => (
          <DiskCard
            key={disk.path}
            disk={disk}
            checked={selectedDisks.includes(disk.path)}
            onChange={(checked) => onToggleDisk(disk.path, checked)}
          />
        ))}
      </SimpleGrid>
    </Stack>
  )
}
