import { Stack, Accordion, Button, Group } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { hc } from 'hono/client'
import { PathFilterTree } from './components/PathFilterTree'
import { SizeConstraints } from './components/SizeConstraints'
import { FileTypeSelector } from './components/FileTypeSelector'
import { ExcludePatterns } from './components/ExcludePatterns'
import { AdvancedOptions } from './components/AdvancedOptions'
import type { RpcRoutes } from '../../../web-server/rpc'
import type { PlanForm, PatternResponse, DiskResponse } from '../../types'

const client = hc<RpcRoutes>('/api')

const DEFAULT_ACCORDION_VALUES = ['path-filters', 'size-constraints', 'file-types', 'exclude-patterns', 'advanced'] as const

interface OptionsPageProps {
  form: PlanForm
  onNext: () => void
  onBack: () => void
}

export function OptionsPage({ form, onNext, onBack }: OptionsPageProps) {
  const { data: allDisks = [] } = useQuery<DiskResponse[]>({
    queryKey: ['disks'],
    queryFn: async (): Promise<DiskResponse[]> => {
      const response = await client.disks.$get()
      return (await response.json()) as DiskResponse[]
    },
  })

  const disksToScan = form.values.sourceDisk
    ? [form.values.sourceDisk]
    : allDisks.map(d => d.path)

  const { data: patterns = [], isLoading: loadingPatterns } = useQuery<PatternResponse[]>({
    queryKey: ['scan-patterns', disksToScan],
    queryFn: async (): Promise<PatternResponse[]> => {
      const response = await client['scan-patterns'].$get({
        query: { diskPaths: disksToScan.join(',') }
      })
      return (await response.json()) as PatternResponse[]
    },
    enabled: disksToScan.length > 0,
    retry: 2,
    staleTime: 60000,
  })

  return (
    <Stack gap="md" mt="md">
      <Accordion
        variant="separated"
        multiple
        defaultValue={[...DEFAULT_ACCORDION_VALUES]}
      >
        <Accordion.Item value="path-filters">
          <Accordion.Control>Path Filters</Accordion.Control>
          <Accordion.Panel>
            <PathFilterTree
              patterns={patterns}
              selectedPaths={form.values.pathFilters}
              loading={loadingPatterns}
              onChange={(paths) => form.setFieldValue('pathFilters', paths)}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="size-constraints">
          <Accordion.Control>Size Constraints</Accordion.Control>
          <Accordion.Panel>
            <SizeConstraints
              minSpace={form.values.minSpace}
              minFileSize={form.values.minFileSize}
              onChangeMinSpace={(value) => form.setFieldValue('minSpace', value)}
              onChangeMinFileSize={(value) => form.setFieldValue('minFileSize', value)}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="file-types">
          <Accordion.Control>File Types</Accordion.Control>
          <Accordion.Panel>
            <FileTypeSelector
              include={form.values.include}
              includeCustom={form.values.includeCustom}
              onChangeInclude={(patterns) => form.setFieldValue('include', patterns)}
              onChangeIncludeCustom={(value) => form.setFieldValue('includeCustom', value)}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="exclude-patterns">
          <Accordion.Control>Exclude Patterns</Accordion.Control>
          <Accordion.Panel>
            <ExcludePatterns
              exclude={form.values.exclude}
              excludeCustom={form.values.excludeCustom}
              onChangeExclude={(patterns) => form.setFieldValue('exclude', patterns)}
              onChangeExcludeCustom={(value) => form.setFieldValue('excludeCustom', value)}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="advanced">
          <Accordion.Control>Advanced Options</Accordion.Control>
          <Accordion.Panel>
            <AdvancedOptions
              minSplitSize={form.values.minSplitSize}
              moveAsFolderThreshold={form.values.moveAsFolderThreshold}
              debug={form.values.debug}
              force={form.values.force}
              onChangeMinSplitSize={(value) => form.setFieldValue('minSplitSize', value)}
              onChangeMoveAsFolderThreshold={(value) => form.setFieldValue('moveAsFolderThreshold', value)}
              onChangeDebug={(checked) => form.setFieldValue('debug', checked)}
              onChangeForce={(checked) => form.setFieldValue('force', checked)}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Group justify="space-between" mt="xl">
        <Button variant="default" onClick={onBack}>Back</Button>
        <Button onClick={onNext}>Next</Button>
      </Group>
    </Stack>
  )
}
