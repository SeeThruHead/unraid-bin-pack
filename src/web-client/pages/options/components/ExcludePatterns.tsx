import { Stack, Checkbox, TextInput } from "@mantine/core";
import { useExclude, useExcludeCustom } from "../../../store/planStore";

const DEFAULT_EXCLUDE_PATTERNS = [".DS_Store", "@eaDir", ".Trashes", ".Spotlight-V100"] as const;

const togglePattern = (patterns: string[], pattern: string, checked: boolean): string[] =>
  checked ? [...patterns, pattern] : patterns.filter((p) => p !== pattern);

export function ExcludePatterns() {
  const [exclude, setExclude] = useExclude();
  const [excludeCustom, setExcludeCustom] = useExcludeCustom();

  return (
    <Stack gap="md">
      {DEFAULT_EXCLUDE_PATTERNS.map((pattern) => (
        <Checkbox
          key={pattern}
          label={pattern}
          checked={exclude.includes(pattern)}
          onChange={(e) => setExclude(togglePattern(exclude, pattern, e.currentTarget.checked))}
        />
      ))}
      <TextInput
        label="Custom Exclude Patterns"
        description="Comma-separated patterns"
        placeholder="*.tmp,*.cache"
        value={excludeCustom}
        onChange={(e) => setExcludeCustom(e.currentTarget.value)}
      />
    </Stack>
  );
}
