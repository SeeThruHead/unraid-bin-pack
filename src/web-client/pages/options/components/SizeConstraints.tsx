import { Stack, TextInput } from "@mantine/core";
import { useMinSpace, useMinFileSize } from "../../../store/planStore";

export function SizeConstraints() {
  const [minSpace, setMinSpace] = useMinSpace();
  const [minFileSize, setMinFileSize] = useMinFileSize();

  return (
    <Stack gap="md">
      <TextInput
        label="Minimum Space"
        description="Minimum free space to maintain on each disk"
        placeholder="50MB"
        value={minSpace}
        onChange={(e) => setMinSpace(e.currentTarget.value)}
      />
      <TextInput
        label="Minimum File Size"
        description="Skip files smaller than this size"
        placeholder="1MB"
        value={minFileSize}
        onChange={(e) => setMinFileSize(e.currentTarget.value)}
      />
    </Stack>
  );
}
