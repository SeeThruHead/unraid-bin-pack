import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import type { WorldViewSnapshot } from "@core";
import type { PlanResponse } from "../types";
import { safeJsonParse } from "../lib/safeJson";
import { logger } from "../lib/logger";

interface PlanConfig {
  diskPaths: string[];
  sourceDisk: string;
  destDisks: string[];
  pathFilters: string[];
  minSpace: string;
  minFileSize: string;
  include: string[];
  exclude: string[];
  minSplitSize: string;
  moveAsFolderThreshold: string;
  debug: boolean;
}

interface PlanCreationOptions {
  onSuccess?: (data: PlanResponse & { selectedDiskPaths: string[] }) => void;
}

export function usePlanCreation(options?: PlanCreationOptions) {
  const [worldViewSnapshots, setWorldViewSnapshots] = useState<WorldViewSnapshot[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const createPlanMutation = useMutation<
    (PlanResponse & { selectedDiskPaths: string[] }) | { error: string },
    Error,
    PlanConfig
  >({
    mutationFn: async (
      config: PlanConfig
    ): Promise<(PlanResponse & { selectedDiskPaths: string[] }) | { error: string }> => {
      setWorldViewSnapshots([]);

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const diskPaths = config.sourceDisk
        ? [...new Set([...config.destDisks, config.sourceDisk])]
        : config.destDisks;

      const params = new URLSearchParams({
        diskPaths: diskPaths.join(","),
        ...(config.sourceDisk && { src: config.sourceDisk }),
        ...(config.destDisks.length > 0 && { dest: config.destDisks.join(",") }),
        minSpace: config.minSpace,
        minFileSize: config.minFileSize,
        ...(config.pathFilters.length > 0 && { pathFilter: config.pathFilters.join(",") }),
        ...(config.include.length > 0 && { include: config.include.join(",") }),
        ...(config.exclude.length > 0 && { exclude: config.exclude.join(",") }),
        minSplitSize: config.minSplitSize,
        moveAsFolderThreshold: config.moveAsFolderThreshold,
        debug: config.debug.toString()
      });

      return new Promise((resolve, reject) => {
        const eventSource = new EventSource(`/api/plan-stream?${params.toString()}`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          const data = safeJsonParse<{ type: string; [key: string]: unknown }>(event.data);
          if (!data) return;

          if (data.type === "worldview") {
            setWorldViewSnapshots((prev) => [
              ...prev,
              {
                step: data.step,
                action: data.action,
                worldView: data.worldView,
                metadata: data.metadata
              } as WorldViewSnapshot
            ]);
          } else if (data.type === "complete") {
            eventSource.close();
            eventSourceRef.current = null;
            resolve({
              ...data.result,
              selectedDiskPaths: diskPaths
            });
          } else if (data.type === "error") {
            eventSource.close();
            eventSourceRef.current = null;
            reject(new Error(data.error as string));
          }
        };

        eventSource.onerror = (error) => {
          logger.error("EventSource error:", error);
          eventSource.close();
          eventSourceRef.current = null;
          reject(new Error("Failed to connect to plan stream"));
        };
      });
    },
    onSuccess: (data) => {
      if (!("error" in data)) {
        options?.onSuccess?.(data);
      }
    }
  });

  return {
    createPlan: createPlanMutation.mutate,
    isPending: createPlanMutation.isPending,
    data: createPlanMutation.data,
    worldViewSnapshots
  };
}
