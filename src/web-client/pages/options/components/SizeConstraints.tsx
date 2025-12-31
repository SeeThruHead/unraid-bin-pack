import { Stack, TextInput } from '@mantine/core'

interface SizeConstraintsProps {
  minSpace: string
  minFileSize: string
  onChangeMinSpace: (value: string) => void
  onChangeMinFileSize: (value: string) => void
}

export function SizeConstraints({ minSpace, minFileSize, onChangeMinSpace, onChangeMinFileSize }: SizeConstraintsProps) {
  return (
    <Stack gap="md">
      <TextInput
        label="Minimum Space"
        description="Minimum free space to maintain on each disk"
        placeholder="50MB"
        value={minSpace}
        onChange={(e) => onChangeMinSpace(e.currentTarget.value)}
      />
      <TextInput
        label="Minimum File Size"
        description="Skip files smaller than this size"
        placeholder="1MB"
        value={minFileSize}
        onChange={(e) => onChangeMinFileSize(e.currentTarget.value)}
      />
    </Stack>
  )
}
