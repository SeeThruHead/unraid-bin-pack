import { Route, Switch, useLocation } from "wouter";
import { Paper, Title, Text, Stack, Stepper } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { hc } from "hono/client";
import { DisksPage } from "./disks";
import { OptionsPage } from "./options";
import { ReviewPage } from "./review";
import { ResultsPage } from "./results";
import { usePlanStore } from "../store/planStore";
import type { RpcRoutes } from "../../web-server/rpc";
import type { PlanResponse } from "../types";
import { throwMutationError } from "../lib/reactQueryUtils";
import { logger } from "../lib/logger";

const client = hc<RpcRoutes>("/api");

const parseCustomPatterns = (customString: string): string[] =>
  customString ? customString.split(",").map((s) => s.trim()) : [];

const mergePatterns = (patterns: string[], customPatterns: string): string[] => [
  ...patterns,
  ...parseCustomPatterns(customPatterns)
];

const joinIfNotEmpty = (arr: string[]): string | undefined =>
  arr.length > 0 ? arr.join(",") : undefined;

const orUndefined = <T,>(value: T): T | undefined => value || undefined;

const ROUTES = ["/", "/options", "/review", "/results"] as const;
const STEP_LABELS = ["Select Disks", "Configure Options", "Review", "Results"] as const;

export function PlanWizard() {
  const [location, setLocation] = useLocation();
  const activeStep = ROUTES.indexOf(location as (typeof ROUTES)[number]);
  const { values } = usePlanStore();

  const createPlanMutation = useMutation<PlanResponse & { selectedDiskPaths: string[] }, Error>({
    mutationFn: async (): Promise<PlanResponse & { selectedDiskPaths: string[] }> => {
      const includePatterns = mergePatterns(values.include, values.includeCustom);
      const excludePatterns = mergePatterns(values.exclude, values.excludeCustom);

      const diskPaths = values.sourceDisk
        ? [...new Set([...values.destDisks, values.sourceDisk])]
        : values.destDisks;

      const response = await client.plan.$post({
        json: {
          diskPaths,
          config: {
            src: orUndefined(values.sourceDisk),
            dest: joinIfNotEmpty(values.destDisks),
            minSpace: values.minSpace,
            minFileSize: values.minFileSize,
            pathFilter: joinIfNotEmpty(values.pathFilters),
            include: joinIfNotEmpty(includePatterns),
            exclude: joinIfNotEmpty(excludePatterns),
            minSplitSize: values.minSplitSize,
            moveAsFolderThreshold: values.moveAsFolderThreshold,
            debug: values.debug
          }
        }
      });

      const planResponse = (await response.json()) as PlanResponse | { error: string };

      if ("error" in planResponse) {
        logger.error("Plan creation failed:", planResponse.error);
        throwMutationError(planResponse.error);
      }

      return {
        ...planResponse,
        selectedDiskPaths: diskPaths
      };
    },
    onSuccess: (data) => {
      logger.log("Plan created successfully:", data);
      setLocation("/results");
    },
    onError: (error) => {
      logger.error("Mutation error:", error);
    }
  });

  useEffect(() => {
    if (location !== "/review" && location !== "/results" && createPlanMutation.data) {
      createPlanMutation.reset();
    }
  }, [location, createPlanMutation]);

  const handleNext = () => {
    const nextIndex = Math.min(activeStep + 1, ROUTES.length - 1);
    setLocation(ROUTES[nextIndex] as string);
  };

  const handleBack = () => {
    const prevIndex = Math.max(activeStep - 1, 0);
    setLocation(ROUTES[prevIndex] as string);
  };

  const handleStepClick = (step: number) => {
    if (step < 3) {
      setLocation(ROUTES[step] as string);
    }
  };

  return (
    <Paper shadow="sm" p="xl" radius="md">
      <Stack gap="xl">
        <div>
          <Title order={1}>Create Consolidation Plan</Title>
          <Text c="dimmed" size="sm">
            Configure your disk consolidation settings below
          </Text>
        </div>

        <Stepper active={activeStep} onStepClick={handleStepClick}>
          {STEP_LABELS.map((label, index) => (
            <Stepper.Step
              key={label}
              label={label}
              description={
                index === 0
                  ? "Choose disks to consolidate"
                  : index === 1
                    ? "Set consolidation parameters"
                    : index === 2
                      ? "Review your settings"
                      : "View and execute plan"
              }
            />
          ))}
        </Stepper>

        <Switch>
          <Route path="/">
            <DisksPage onNext={handleNext} />
          </Route>
          <Route path="/options">
            <OptionsPage onNext={handleNext} onBack={handleBack} />
          </Route>
          <Route path="/review">
            <ReviewPage
              onBack={handleBack}
              onCreatePlan={() => createPlanMutation.mutate()}
              isCreatingPlan={createPlanMutation.isPending}
              planError={createPlanMutation.error?.message}
            />
          </Route>
          <Route path="/results">
            <ResultsPage
              result={createPlanMutation.data ?? null}
              isError={createPlanMutation.isError}
              error={createPlanMutation.error}
            />
          </Route>
        </Switch>
      </Stack>
    </Paper>
  );
}
