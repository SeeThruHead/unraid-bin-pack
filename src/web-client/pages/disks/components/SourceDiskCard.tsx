import { Card, Radio, Text, Group, Stack, ThemeIcon } from '@mantine/core'
import { IconDeviceFloppy, IconRefresh } from '@tabler/icons-react'
import type { DiskResponse } from '../../../types'

const formatBytes = (bytes: number): string =>
  (bytes / 1024 / 1024 / 1024).toFixed(1)

interface SourceDiskCardProps {
  disk?: DiskResponse
  isAuto?: boolean
  checked: boolean
  onChange: () => void
}

export function SourceDiskCard({ disk, isAuto, checked, onChange }: SourceDiskCardProps) {
  const label = isAuto ? 'Auto-select (pack tightly)' : disk!.path
  const icon = isAuto ? <IconRefresh size={20} /> : <IconDeviceFloppy size={20} />
  const freeGB = disk ? formatBytes(disk.freeBytes) : null

  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      style={{ cursor: 'pointer', transition: 'transform 0.1s' }}
      onClick={onChange}
    >
      <Group wrap="nowrap" align="center" gap="sm">
        <Radio
          checked={checked}
          onChange={onChange}
          size="md"
          onClick={(e) => e.stopPropagation()}
        />

        <ThemeIcon size="lg" variant="light" color="blue" radius="md">
          {icon}
        </ThemeIcon>

        <Stack gap={4} style={{ flex: 1 }}>
          <Text fw={500} size="sm">{label}</Text>
          {freeGB && (
            <Text size="xs" c="dimmed">
              {freeGB} GB free
            </Text>
          )}
        </Stack>
      </Group>
    </Card>
  )
}
