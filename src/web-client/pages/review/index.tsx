import { Stack, Text, Badge, Group, Button, Alert, Accordion, Paper } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { ConfigCard } from './components/ConfigCard'
import { PatternBadges } from './components/PatternBadges'
import { WorldViewAudit } from './components/WorldViewAudit'
import type { PlanForm, PlanResponse } from '../../types'
import type { WorldViewSnapshot } from '@core'

const parseCustomPatterns = (customString: string): string[] =>
  customString ? customString.split(',').map((s) => s.trim()) : []

const mergePatterns = (patterns: string[], customPatterns: string): string[] =>
  [...patterns, ...parseCustomPatterns(customPatterns)]

interface ReviewPageProps {
  form: PlanForm
  onBack: () => void
  onCreatePlan: () => void
  isCreatingPlan: boolean
  planError?: PlanResponse | { error: string } | null
  worldViewSnapshots: WorldViewSnapshot[]
}

export function ReviewPage({ form, onBack, onCreatePlan, isCreatingPlan, planError, worldViewSnapshots }: ReviewPageProps) {
  const includePatterns = mergePatterns(form.values.include, form.values.includeCustom)
  const excludePatterns = mergePatterns(form.values.exclude, form.values.excludeCustom)

  return (
    <Stack gap="md" mt="md">
      {planError && 'error' in planError && (
        <Alert icon={<IconAlertCircle size={16} />} title="Plan Creation Failed" color="red">
          {planError.error}
        </Alert>
      )}

      <ConfigCard title="Disk Configuration">
        <Text size="sm" c="dimmed">Destination Disks:</Text>
        <Group gap="xs" mb="md">
          {form.values.destDisks.map((disk) => (
            <Badge key={disk} color="yellow" variant="light">{disk}</Badge>
          ))}
        </Group>

        <Text size="sm" c="dimmed">Source Disk:</Text>
        <Badge color="blue" variant="light">
          {form.values.sourceDisk || 'Auto-select (iterative emptying)'}
        </Badge>
      </ConfigCard>

      {form.values.pathFilters.length > 0 && (
        <ConfigCard title="Path Filters">
          <PatternBadges patterns={form.values.pathFilters} color="grape" />
        </ConfigCard>
      )}

      <ConfigCard title="Size Constraints">
        <Text size="sm"><Text span fw={500}>Minimum Space:</Text> {form.values.minSpace}</Text>
        <Text size="sm"><Text span fw={500}>Minimum File Size:</Text> {form.values.minFileSize}</Text>
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
        <Text size="sm"><Text span fw={500}>Min Split Size:</Text> {form.values.minSplitSize}</Text>
        <Text size="sm"><Text span fw={500}>Move as Folder Threshold:</Text> {form.values.moveAsFolderThreshold}</Text>
        {form.values.debug && <Badge color="orange">Debug Mode Enabled</Badge>}
        {form.values.force && <Badge color="red">Force Mode Enabled</Badge>}
      </ConfigCard>

      {worldViewSnapshots.length > 0 && (
        <Paper p="md" withBorder>
          <Text size="lg" fw={600} mb="md">WorldView Audit Trail</Text>
          <Text size="sm" c="dimmed" mb="md">
            Live algorithm state changes during plan creation
          </Text>
          <WorldViewAudit snapshots={worldViewSnapshots} />
        </Paper>
      )}

      <Group justify="space-between" mt="xl">
        <Button variant="default" onClick={onBack}>Back</Button>
        <Button onClick={onCreatePlan} loading={isCreatingPlan}>
          {isCreatingPlan ? 'Creating Plan...' : 'Create Plan'}
        </Button>
      </Group>
    </Stack>
  )
}
