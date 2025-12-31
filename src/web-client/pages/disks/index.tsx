import { Stack, LoadingOverlay, Button, Group } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { hc } from 'hono/client'
import { DiskList } from './components/DiskList'
import { SourceDiskSelector } from './components/SourceDiskSelector'
import type { RpcRoutes } from '../../../web-server/rpc'
import type { PlanForm, DiskResponse } from '../../types'

const client = hc<RpcRoutes>('/api')

const toggleDisk = (currentDisks: string[], diskPath: string, checked: boolean): string[] =>
  checked
    ? [...currentDisks, diskPath]
    : currentDisks.filter((d) => d !== diskPath)

interface DisksPageProps {
  form: PlanForm
  onNext: () => void
}

export function DisksPage({ form, onNext }: DisksPageProps) {
  const { data: disks = [], isLoading } = useQuery<DiskResponse[]>({
    queryKey: ['disks'],
    queryFn: async (): Promise<DiskResponse[]> => {
      const response = await client.disks.$get()
      const data = (await response.json()) as DiskResponse[]
      // Select all disks by default when first loaded
      if (form.values.destDisks.length === 0 && data.length > 0) {
        form.setFieldValue('destDisks', data.map(d => d.path))
      }
      return data
    },
    retry: 2,
    staleTime: 30000,
  })

  return (
    <Stack gap="md" mt="md" pos="relative">
      <LoadingOverlay visible={isLoading} />

      <DiskList
        disks={disks}
        selectedDisks={form.values.destDisks}
        onToggleDisk={(diskPath, checked) =>
          form.setFieldValue('destDisks', toggleDisk(form.values.destDisks, diskPath, checked))
        }
      />

      <SourceDiskSelector
        disks={disks}
        selectedSource={form.values.sourceDisk}
        onChange={(source) => form.setFieldValue('sourceDisk', source)}
      />

      <Group justify="flex-end" mt="xl">
        <Button onClick={onNext}>Next</Button>
      </Group>
    </Stack>
  )
}
