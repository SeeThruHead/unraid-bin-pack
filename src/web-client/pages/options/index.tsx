import { Stack, Accordion, Button, Group } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { hc } from "hono/client";
import { PathFilterTree } from "./components/PathFilterTree";
import { SizeConstraints } from "./components/SizeConstraints";
import { FileTypeSelector } from "./components/FileTypeSelector";
import { ExcludePatterns } from "./components/ExcludePatterns";
import { AdvancedOptions } from "./components/AdvancedOptions";
import { useSourceDisk } from "../../store/planStore";
import type { RpcRoutes } from "../../../web-server/rpc";
import type { PatternResponse, DiskResponse } from "../../types";

const client = hc<RpcRoutes>("/api");

const DEFAULT_ACCORDION_VALUES = [
  "path-filters",
  "size-constraints",
  "file-types",
  "exclude-patterns",
  "advanced"
] as const;

interface OptionsPageProps {
  onNext: () => void;
  onBack: () => void;
}

export function OptionsPage({ onNext, onBack }: OptionsPageProps) {
  const [sourceDisk] = useSourceDisk();

  const { data: allDisks = [] } = useQuery<DiskResponse[]>({
    queryKey: ["disks"],
    queryFn: async (): Promise<DiskResponse[]> => {
      const response = await client.disks.$get();
      return (await response.json()) as DiskResponse[];
    }
  });

  // Memoize disksToScan to prevent creating new array on every render
  const disksToScan = useMemo(
    () => (sourceDisk ? [sourceDisk] : allDisks.map((d) => d.path)),
    [sourceDisk, allDisks]
  );

  const { data: patternsData = [], isLoading: loadingPatterns } = useQuery<PatternResponse[]>({
    queryKey: ["scan-patterns", disksToScan],
    queryFn: async (): Promise<PatternResponse[]> => {
      const response = await client["scan-patterns"].$get({
        query: { diskPaths: disksToScan.join(",") }
      });
      return (await response.json()) as PatternResponse[];
    },
    enabled: disksToScan.length > 0,
    retry: 2,
    staleTime: 60000
  });

  // React Query already stabilizes the data reference with staleTime
  const patterns = patternsData;

  return (
    <Stack gap="md" mt="md">
      <Accordion variant="separated" multiple defaultValue={[...DEFAULT_ACCORDION_VALUES]}>
        <Accordion.Item value="path-filters">
          <Accordion.Control>Path Filters</Accordion.Control>
          <Accordion.Panel>
            <PathFilterTree patterns={patterns} loading={loadingPatterns} />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="size-constraints">
          <Accordion.Control>Size Constraints</Accordion.Control>
          <Accordion.Panel>
            <SizeConstraints />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="file-types">
          <Accordion.Control>File Types</Accordion.Control>
          <Accordion.Panel>
            <FileTypeSelector />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="exclude-patterns">
          <Accordion.Control>Exclude Patterns</Accordion.Control>
          <Accordion.Panel>
            <ExcludePatterns />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="advanced">
          <Accordion.Control>Advanced Options</Accordion.Control>
          <Accordion.Panel>
            <AdvancedOptions />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Group justify="space-between" mt="xl">
        <Button variant="default" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Next</Button>
      </Group>
    </Stack>
  );
}
