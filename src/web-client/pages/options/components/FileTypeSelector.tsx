import { Stack, Checkbox, TextInput } from "@mantine/core";
import { useInclude, useIncludeCustom } from "../../../store/planStore";

const VIDEO_PATTERN = "*.{mp4,mkv,avi,mov,wmv,flv,webm,m4v,mpg,mpeg}";

const togglePattern = (patterns: string[], pattern: string, checked: boolean): string[] =>
  checked ? [...patterns, pattern] : patterns.filter((p) => p !== pattern);

export function FileTypeSelector() {
  const [include, setInclude] = useInclude();
  const [includeCustom, setIncludeCustom] = useIncludeCustom();

  return (
    <Stack gap="md">
      <Checkbox
        label="Everything"
        checked={include.length === 0}
        onChange={(e) => e.currentTarget.checked && setInclude([])}
      />
      <Checkbox
        label="Videos"
        checked={include.includes(VIDEO_PATTERN)}
        onChange={(e) => setInclude(togglePattern(include, VIDEO_PATTERN, e.currentTarget.checked))}
      />
      <TextInput
        label="Custom Include Patterns"
        description="Comma-separated patterns"
        placeholder="*.pdf,*.doc"
        value={includeCustom}
        onChange={(e) => setIncludeCustom(e.currentTarget.value)}
      />
    </Stack>
  );
}
