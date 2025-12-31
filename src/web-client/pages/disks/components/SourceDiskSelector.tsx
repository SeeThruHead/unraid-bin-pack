import { Stack, Text, SimpleGrid, Tooltip } from "@mantine/core";
import { SourceDiskCard } from "./SourceDiskCard";
import { useSourceDisk } from "../../../store/planStore";
import type { DiskResponse } from "../../../types";

interface SourceDiskSelectorProps {
  disks: DiskResponse[];
}

export function SourceDiskSelector({ disks }: SourceDiskSelectorProps) {
  const [selectedSource, setSelectedSource] = useSourceDisk();

  return (
    <Stack gap="md" mt="xl">
      <div>
        <Text fw={500}>Source Disk (Optional)</Text>
        <Text size="sm" c="dimmed">
          Select a specific disk to move files from, or use auto-select to pack tightly
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        <Tooltip
          label="Automatically empties the least full disks by moving files onto the fullest disks, maximizing the number of completely free disks"
          multiline
          w={300}
        >
          <div>
            <SourceDiskCard
              isAuto
              checked={selectedSource === ""}
              onChange={() => setSelectedSource("")}
            />
          </div>
        </Tooltip>
        {disks.map((disk) => (
          <SourceDiskCard
            key={disk.path}
            disk={disk}
            checked={selectedSource === disk.path}
            onChange={() => setSelectedSource(disk.path)}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
