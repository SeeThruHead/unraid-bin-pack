import { Stack, Checkbox, TextInput } from '@mantine/core'

const DEFAULT_EXCLUDE_PATTERNS = ['.DS_Store', '@eaDir', '.Trashes', '.Spotlight-V100'] as const

const togglePattern = (patterns: string[], pattern: string, checked: boolean): string[] =>
  checked
    ? [...patterns, pattern]
    : patterns.filter((p) => p !== pattern)

interface ExcludePatternsProps {
  exclude: string[]
  excludeCustom: string
  onChangeExclude: (patterns: string[]) => void
  onChangeExcludeCustom: (value: string) => void
}

export function ExcludePatterns({ exclude, excludeCustom, onChangeExclude, onChangeExcludeCustom }: ExcludePatternsProps) {
  return (
    <Stack gap="md">
      {DEFAULT_EXCLUDE_PATTERNS.map((pattern) => (
        <Checkbox
          key={pattern}
          label={pattern}
          checked={exclude.includes(pattern)}
          onChange={(e) =>
            onChangeExclude(togglePattern(exclude, pattern, e.currentTarget.checked))
          }
        />
      ))}
      <TextInput
        label="Custom Exclude Patterns"
        description="Comma-separated patterns"
        placeholder="*.tmp,*.cache"
        value={excludeCustom}
        onChange={(e) => onChangeExcludeCustom(e.currentTarget.value)}
      />
    </Stack>
  )
}
