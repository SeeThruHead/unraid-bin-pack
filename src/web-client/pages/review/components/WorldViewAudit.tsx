import { Stack, Text, Paper, Badge, Group, Accordion, ScrollArea, Code } from '@mantine/core'
import type { WorldViewSnapshot } from '@core'

interface WorldViewAuditProps {
  snapshots: WorldViewSnapshot[]
}

const formatBytes = (bytes: number): string => {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

export function WorldViewAudit({ snapshots }: WorldViewAuditProps) {
  if (snapshots.length === 0) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed" size="sm">No WorldView snapshots yet...</Text>
      </Paper>
    )
  }

  return (
    <ScrollArea h={600} type="auto">
      <Accordion variant="separated">
        {snapshots.map((snapshot, index) => (
          <Accordion.Item key={snapshot.step} value={`step-${snapshot.step}`}>
            <Accordion.Control>
              <Group gap="xs">
                <Badge size="sm" variant="light" color="blue">
                  Step {snapshot.step}
                </Badge>
                <Text size="sm" fw={500}>{snapshot.action}</Text>
                {snapshot.metadata?.movedFile && (
                  <Badge size="xs" color="green">File Moved</Badge>
                )}
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                {/* Metadata */}
                {snapshot.metadata && (
                  <Paper p="sm" withBorder bg="gray.0">
                    <Text size="xs" fw={600} mb="xs">Metadata:</Text>
                    <Stack gap={4}>
                      {snapshot.metadata.sourceDisk && (
                        <Text size="xs">
                          <Text span fw={500}>Source Disk:</Text> {snapshot.metadata.sourceDisk}
                        </Text>
                      )}
                      {snapshot.metadata.targetDisk && (
                        <Text size="xs">
                          <Text span fw={500}>Target Disk:</Text> {snapshot.metadata.targetDisk}
                        </Text>
                      )}
                      {snapshot.metadata.movedFile && (
                        <Text size="xs">
                          <Text span fw={500}>Moved File:</Text> {snapshot.metadata.movedFile}
                        </Text>
                      )}
                      {snapshot.metadata.movedCount !== undefined && (
                        <Text size="xs">
                          <Text span fw={500}>Moves:</Text> {snapshot.metadata.movedCount} / {snapshot.metadata.totalFilesOnDisk}
                        </Text>
                      )}
                    </Stack>
                  </Paper>
                )}

                {/* Disk States */}
                <div>
                  <Text size="xs" fw={600} mb="xs">Disk States:</Text>
                  <Stack gap={4}>
                    {snapshot.worldView.disks.map((disk) => {
                      const usedPct = ((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100
                      const filesOnDisk = snapshot.worldView.files.filter(f => f.diskPath === disk.path).length

                      return (
                        <Paper key={disk.path} p="xs" withBorder>
                          <Group justify="space-between" gap="xs">
                            <Text size="xs" fw={500}>{disk.path}</Text>
                            <Group gap="xs">
                              <Badge size="xs" variant="light" color={filesOnDisk === 0 ? "green" : "blue"}>
                                {filesOnDisk} files
                              </Badge>
                              <Badge size="xs" variant="light" color={usedPct > 80 ? "red" : usedPct > 50 ? "yellow" : "green"}>
                                {usedPct.toFixed(1)}% used
                              </Badge>
                              <Text size="xs" c="dimmed">
                                {formatBytes(disk.freeBytes)} free
                              </Text>
                            </Group>
                          </Group>
                        </Paper>
                      )
                    })}
                  </Stack>
                </div>

                {/* Files Summary */}
                <div>
                  <Text size="xs" fw={600} mb="xs">Files by Disk:</Text>
                  <Code block style={{ fontSize: '10px', maxHeight: '200px', overflow: 'auto' }}>
                    {snapshot.worldView.disks.map((disk) => {
                      const filesOnDisk = snapshot.worldView.files.filter(f => f.diskPath === disk.path)
                      return `${disk.path}: ${filesOnDisk.length} files\n${filesOnDisk.map(f => `  - ${f.relativePath} (${formatBytes(f.sizeBytes)})`).join('\n')}`
                    }).join('\n\n')}
                  </Code>
                </div>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </ScrollArea>
  )
}
