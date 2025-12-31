import { Stack, Text, SimpleGrid } from "@mantine/core";
import { DiskCard } from "./DiskCard";
import { useDestDisks } from "../../../store/planStore";
import type { DiskResponse } from "../../../types";

interface DiskListProps {
  disks: DiskResponse[];
}

export function DiskList({ disks }: DiskListProps) {
  const [selectedDisks, setSelectedDisks] = useDestDisks();

  const toggleDisk = (diskPath: string, checked: boolean) => {
    setSelectedDisks(
      checked ? [...selectedDisks, diskPath] : selectedDisks.filter((d) => d !== diskPath)
    );
  };

  return (
    <Stack gap="md">
      <div>
        <Text fw={500}>Destination Disks</Text>
        <Text size="sm" c="dimmed">
          Select which disks to consolidate files into
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {disks.map((disk) => (
          <DiskCard
            key={disk.path}
            disk={disk}
            checked={selectedDisks.includes(disk.path)}
            onChange={(checked) => toggleDisk(disk.path, checked)}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
