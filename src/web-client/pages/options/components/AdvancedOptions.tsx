import { Stack, TextInput, Switch } from '@mantine/core'

interface AdvancedOptionsProps {
  minSplitSize: string
  moveAsFolderThreshold: string
  debug: boolean
  force: boolean
  onChangeMinSplitSize: (value: string) => void
  onChangeMoveAsFolderThreshold: (value: string) => void
  onChangeDebug: (checked: boolean) => void
  onChangeForce: (checked: boolean) => void
}

export function AdvancedOptions({
  minSplitSize,
  moveAsFolderThreshold,
  debug,
  force,
  onChangeMinSplitSize,
  onChangeMoveAsFolderThreshold,
  onChangeDebug,
  onChangeForce,
}: AdvancedOptionsProps) {
  return (
    <Stack gap="md">
      <TextInput
        label="Minimum Split Size"
        description="Minimum size for folder splitting optimization"
        value={minSplitSize}
        onChange={(e) => onChangeMinSplitSize(e.currentTarget.value)}
      />
      <TextInput
        label="Move as Folder Threshold"
        description="Threshold for moving entire folders (0.0 - 1.0)"
        value={moveAsFolderThreshold}
        onChange={(e) => onChangeMoveAsFolderThreshold(e.currentTarget.value)}
      />
      <Switch
        label="Debug Mode"
        description="Enable verbose logging"
        checked={debug}
        onChange={(e) => onChangeDebug(e.currentTarget.checked)}
      />
      <Switch
        label="Force Mode"
        description="Skip safety checks"
        checked={force}
        onChange={(e) => onChangeForce(e.currentTarget.checked)}
      />
    </Stack>
  )
}
