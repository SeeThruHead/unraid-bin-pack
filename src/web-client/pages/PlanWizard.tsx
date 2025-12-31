import { Route, Switch, useLocation } from 'wouter'
import { Paper, Title, Text, Stack, Button, Group, Stepper } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMutation } from '@tanstack/react-query'
import { hc } from 'hono/client'
import { DisksPage } from './disks'
import { OptionsPage } from './options'
import { ReviewPage } from './review'
import { ResultsPage } from './results'
import type { RpcRoutes } from '../../web-server/rpc'
import type { PlanResponse } from '../types'

const client = hc<RpcRoutes>('/api')

const DEFAULT_FORM_VALUES = {
  destDisks: [] as string[],
  sourceDisk: '',
  pathFilters: [] as string[],
  minSpace: '2MB',
  minFileSize: '15KB',
  include: [] as string[],
  includeCustom: '',
  exclude: ['.DS_Store', '@eaDir', '.Trashes', '.Spotlight-V100'] as string[],
  excludeCustom: '',
  minSplitSize: '100MB',
  moveAsFolderThreshold: '0.9',
  debug: false,
  force: false,
}

const parseCustomPatterns = (customString: string): string[] =>
  customString ? customString.split(',').map((s) => s.trim()) : []

const mergePatterns = (patterns: string[], customPatterns: string): string[] =>
  [...patterns, ...parseCustomPatterns(customPatterns)]

const joinIfNotEmpty = (arr: string[]): string | undefined =>
  arr.length > 0 ? arr.join(',') : undefined

const orUndefined = <T,>(value: T): T | undefined =>
  value || undefined

const ROUTES = ['/', '/options', '/review', '/results'] as const
const STEP_LABELS = ['Select Disks', 'Configure Options', 'Review', 'Results'] as const

export function PlanWizard() {
  const [location, setLocation] = useLocation()
  const activeStep = ROUTES.indexOf(location as typeof ROUTES[number])

  const form = useForm({
    initialValues: DEFAULT_FORM_VALUES,
  })

  const createPlanMutation = useMutation<(PlanResponse & { selectedDiskPaths: string[] }) | { error: string }>({
    mutationFn: async (): Promise<(PlanResponse & { selectedDiskPaths: string[] }) | { error: string }> => {
      const includePatterns = mergePatterns(form.values.include, form.values.includeCustom)
      const excludePatterns = mergePatterns(form.values.exclude, form.values.excludeCustom)

      const diskPaths = form.values.sourceDisk
        ? [...new Set([...form.values.destDisks, form.values.sourceDisk])]
        : form.values.destDisks

      const response = await client.plan.$post({
        json: {
          diskPaths,
          config: {
            src: orUndefined(form.values.sourceDisk),
            dest: joinIfNotEmpty(form.values.destDisks),
            minSpace: form.values.minSpace,
            minFileSize: form.values.minFileSize,
            pathFilter: joinIfNotEmpty(form.values.pathFilters),
            include: joinIfNotEmpty(includePatterns),
            exclude: joinIfNotEmpty(excludePatterns),
            minSplitSize: form.values.minSplitSize,
            moveAsFolderThreshold: form.values.moveAsFolderThreshold,
            debug: form.values.debug,
          }
        }
      })

      const planResponse = (await response.json()) as PlanResponse | { error: string }

      if ('error' in planResponse) {
        return planResponse
      }

      return {
        ...planResponse,
        selectedDiskPaths: diskPaths
      }
    },
    onSuccess: (data) => {
      if (!('error' in data)) {
        setLocation('/results')
      }
    },
  })

  const handleNext = () => {
    const nextIndex = Math.min(activeStep + 1, ROUTES.length - 1)
    setLocation(ROUTES[nextIndex] as string)
  }

  const handleBack = () => {
    const prevIndex = Math.max(activeStep - 1, 0)
    setLocation(ROUTES[prevIndex] as string)
  }

  const handleStepClick = (step: number) => {
    if (step < 3) {
      setLocation(ROUTES[step] as string)
    }
  }

  return (
    <Paper shadow="sm" p="xl" radius="md">
      <Stack gap="xl">
        <div>
          <Title order={1}>Create Consolidation Plan</Title>
          <Text c="dimmed" size="sm">
            Configure your disk consolidation settings below
          </Text>
        </div>

        <Stepper active={activeStep} onStepClick={handleStepClick}>
          {STEP_LABELS.map((label, index) => (
            <Stepper.Step
              key={label}
              label={label}
              description={
                index === 0 ? 'Choose disks to consolidate' :
                index === 1 ? 'Set consolidation parameters' :
                index === 2 ? 'Review your settings' :
                'View and execute plan'
              }
            />
          ))}
        </Stepper>

        <Switch>
          <Route path="/">
            <DisksPage form={form} onNext={handleNext} />
          </Route>
          <Route path="/options">
            <OptionsPage form={form} onNext={handleNext} onBack={handleBack} />
          </Route>
          <Route path="/review">
            <ReviewPage
              form={form}
              onBack={handleBack}
              onCreatePlan={() => createPlanMutation.mutate()}
              isCreatingPlan={createPlanMutation.isPending}
              planError={createPlanMutation.data}
            />
          </Route>
          <Route path="/results">
            <ResultsPage result={createPlanMutation.data ?? null} />
          </Route>
        </Switch>
      </Stack>
    </Paper>
  )
}
