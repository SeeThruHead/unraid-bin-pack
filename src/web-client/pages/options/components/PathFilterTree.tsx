import { Stack, Text, Group, Button, Card, Checkbox, TextInput, SimpleGrid } from "@mantine/core";
import { IconFolder } from "@tabler/icons-react";
import { useMemo, useCallback, memo, useState } from "react";
import type { PatternResponse } from "../../../types";
import { usePathFilters } from "../../../store/planStore";

interface PathFilterTreeProps {
  patterns: PatternResponse[];
  loading: boolean;
}

export const PathFilterTree = memo(function PathFilterTree({
  patterns,
  loading
}: PathFilterTreeProps) {
  const [selectedPaths, setSelectedPaths] = usePathFilters();
  const [customFilter, setCustomFilter] = useState("");

  // Get unique top-level folders only
  const topLevelFolders = useMemo(() => {
    const folders = new Set<string>();
    for (const pattern of patterns) {
      folders.add(pattern.pattern);
    }
    return Array.from(folders).sort();
  }, [patterns]);

  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);

  const handleToggle = useCallback(
    (folder: string) => {
      const newSelected = new Set(selectedPaths);
      if (newSelected.has(folder)) {
        newSelected.delete(folder);
      } else {
        newSelected.add(folder);
      }
      setSelectedPaths(Array.from(newSelected));
    },
    [selectedPaths, setSelectedPaths]
  );

  const handleCheckAll = useCallback(() => {
    setSelectedPaths(topLevelFolders);
  }, [topLevelFolders, setSelectedPaths]);

  const handleCheckNone = useCallback(() => {
    setSelectedPaths([]);
  }, [setSelectedPaths]);

  const handleAddCustom = useCallback(() => {
    if (customFilter.trim()) {
      const newSelected = new Set(selectedPaths);
      newSelected.add(customFilter.trim());
      setSelectedPaths(Array.from(newSelected));
      setCustomFilter("");
    }
  }, [customFilter, selectedPaths, setSelectedPaths]);

  if (loading) {
    return <Text>Loading...</Text>;
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Select top-level folders to consolidate
      </Text>
      {topLevelFolders.length > 0 && (
        <>
          <Group gap="xs" mb="md">
            <Button size="xs" variant="light" onClick={handleCheckAll}>
              Check All
            </Button>
            <Button size="xs" variant="light" onClick={handleCheckNone}>
              Check None
            </Button>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
            {topLevelFolders.map((folder) => (
              <Card
                key={folder}
                padding="sm"
                withBorder
                style={{ cursor: "pointer" }}
                onClick={() => handleToggle(folder)}
              >
                <Group gap="sm" wrap="nowrap">
                  <Checkbox
                    checked={selectedSet.has(folder)}
                    onChange={() => handleToggle(folder)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <IconFolder size={20} />
                  <Text size="sm" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {folder}
                  </Text>
                </Group>
              </Card>
            ))}
          </SimpleGrid>

          <TextInput
            label="Custom Path Filter"
            description="Add a custom path pattern (e.g., /mnt/user/CustomFolder)"
            placeholder="/mnt/user/CustomFolder"
            value={customFilter}
            onChange={(e) => setCustomFilter(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
            rightSection={
              <Button size="xs" onClick={handleAddCustom} disabled={!customFilter.trim()}>
                Add
              </Button>
            }
            rightSectionWidth={60}
          />
        </>
      )}
    </Stack>
  );
});
