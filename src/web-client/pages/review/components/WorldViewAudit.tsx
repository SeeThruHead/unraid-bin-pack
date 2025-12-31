import { Stack, Text, Paper, Group, Code, CopyButton, ActionIcon, Tooltip } from '@mantine/core'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import type { WorldViewSnapshot } from '@core'

interface WorldViewAuditProps {
  snapshots: WorldViewSnapshot[]
}

export function WorldViewAudit({ snapshots }: WorldViewAuditProps) {
  if (snapshots.length === 0) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed" size="sm">No WorldView snapshots yet...</Text>
      </Paper>
    )
  }

  const jsonString = JSON.stringify(snapshots, null, 2)

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          {snapshots.length} WorldView snapshots collected
        </Text>
        <CopyButton value={jsonString}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied!' : 'Copy JSON'}>
              <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>

      <Code block style={{ fontSize: '11px', maxHeight: '600px', overflow: 'auto' }}>
        {jsonString}
      </Code>
    </Stack>
  )
}
