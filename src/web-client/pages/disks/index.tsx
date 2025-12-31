import { Stack, LoadingOverlay, Button, Group } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { hc } from "hono/client";
import { DiskList } from "./components/DiskList";
import { SourceDiskSelector } from "./components/SourceDiskSelector";
import { useDestDisks } from "../../store/planStore";
import type { RpcRoutes } from "../../../web-server/rpc";
import type { DiskResponse } from "../../types";

const client = hc<RpcRoutes>("/api");

interface DisksPageProps {
  onNext: () => void;
}

export function DisksPage({ onNext }: DisksPageProps) {
  const [destDisks, setDestDisks] = useDestDisks();

  const { data: disks = [], isLoading } = useQuery<DiskResponse[]>({
    queryKey: ["disks"],
    queryFn: async (): Promise<DiskResponse[]> => {
      const response = await client.disks.$get();
      const data = (await response.json()) as DiskResponse[];
      // Select all disks by default when first loaded
      if (destDisks.length === 0 && data.length > 0) {
        setDestDisks(data.map((d) => d.path));
      }
      return data;
    },
    retry: 2,
    staleTime: 30000
  });

  return (
    <Stack gap="md" mt="md" pos="relative">
      <LoadingOverlay visible={isLoading} />

      <DiskList disks={disks} />

      <SourceDiskSelector disks={disks} />

      <Group justify="flex-end" mt="xl">
        <Button onClick={onNext}>Next</Button>
      </Group>
    </Stack>
  );
}
