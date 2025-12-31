import { Stack, Checkbox, TextInput } from '@mantine/core'

const VIDEO_PATTERN = '*.{mp4,mkv,avi,mov,wmv,flv,webm,m4v,mpg,mpeg}'

const togglePattern = (patterns: string[], pattern: string, checked: boolean): string[] =>
  checked
    ? [...patterns, pattern]
    : patterns.filter((p) => p !== pattern)

interface FileTypeSelectorProps {
  include: string[]
  includeCustom: string
  onChangeInclude: (patterns: string[]) => void
  onChangeIncludeCustom: (value: string) => void
}

export function FileTypeSelector({ include, includeCustom, onChangeInclude, onChangeIncludeCustom }: FileTypeSelectorProps) {
  return (
    <Stack gap="md">
      <Checkbox
        label="Everything"
        checked={include.length === 0}
        onChange={(e) => e.currentTarget.checked && onChangeInclude([])}
      />
      <Checkbox
        label="Videos"
        checked={include.includes(VIDEO_PATTERN)}
        onChange={(e) =>
          onChangeInclude(togglePattern(include, VIDEO_PATTERN, e.currentTarget.checked))
        }
      />
      <TextInput
        label="Custom Include Patterns"
        description="Comma-separated patterns"
        placeholder="*.pdf,*.doc"
        value={includeCustom}
        onChange={(e) => onChangeIncludeCustom(e.currentTarget.value)}
      />
    </Stack>
  )
}
