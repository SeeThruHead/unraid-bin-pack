import { Stack, TextInput, Switch } from "@mantine/core";
import {
  useMinSplitSize,
  useMoveAsFolderThreshold,
  useDebug,
  useForce
} from "../../../store/planStore";

export function AdvancedOptions() {
  const [minSplitSize, setMinSplitSize] = useMinSplitSize();
  const [moveAsFolderThreshold, setMoveAsFolderThreshold] = useMoveAsFolderThreshold();
  const [debug, setDebug] = useDebug();
  const [force, setForce] = useForce();

  return (
    <Stack gap="md">
      <TextInput
        label="Minimum Split Size"
        description="Minimum size for folder splitting optimization"
        value={minSplitSize}
        onChange={(e) => setMinSplitSize(e.currentTarget.value)}
      />
      <TextInput
        label="Move as Folder Threshold"
        description="Threshold for moving entire folders (0.0 - 1.0)"
        value={moveAsFolderThreshold}
        onChange={(e) => setMoveAsFolderThreshold(e.currentTarget.value)}
      />
      <Switch
        label="Debug Mode"
        description="Enable verbose logging"
        checked={debug}
        onChange={(e) => setDebug(e.currentTarget.checked)}
      />
      <Switch
        label="Force Mode"
        description="Skip safety checks"
        checked={force}
        onChange={(e) => setForce(e.currentTarget.checked)}
      />
    </Stack>
  );
}
