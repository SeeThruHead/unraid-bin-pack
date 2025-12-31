import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import type { PlanFormValues } from "../types";

const destDisksAtom = atom<string[]>([]);
const sourceDiskAtom = atom<string>("");
const pathFiltersAtom = atom<string[]>([]);
const minSpaceAtom = atom<string>("2MB");
const minFileSizeAtom = atom<string>("15KB");
const includeAtom = atom<string[]>([]);
const includeCustomAtom = atom<string>("");
const excludeAtom = atom<string[]>([".DS_Store", "@eaDir", ".Trashes", ".Spotlight-V100"]);
const excludeCustomAtom = atom<string>("");
const minSplitSizeAtom = atom<string>("100MB");
const moveAsFolderThresholdAtom = atom<string>("0.9");
const debugAtom = atom<boolean>(false);
const forceAtom = atom<boolean>(false);

const allValuesAtom = atom<PlanFormValues>((get) => ({
  destDisks: get(destDisksAtom),
  sourceDisk: get(sourceDiskAtom),
  pathFilters: get(pathFiltersAtom),
  minSpace: get(minSpaceAtom),
  minFileSize: get(minFileSizeAtom),
  include: get(includeAtom),
  includeCustom: get(includeCustomAtom),
  exclude: get(excludeAtom),
  excludeCustom: get(excludeCustomAtom),
  minSplitSize: get(minSplitSizeAtom),
  moveAsFolderThreshold: get(moveAsFolderThresholdAtom),
  debug: get(debugAtom),
  force: get(forceAtom)
}));

const setAllValuesAtom = atom(null, (get, set, values: Partial<PlanFormValues>) => {
  if (values.destDisks !== undefined) set(destDisksAtom, values.destDisks);
  if (values.sourceDisk !== undefined) set(sourceDiskAtom, values.sourceDisk);
  if (values.pathFilters !== undefined) set(pathFiltersAtom, values.pathFilters);
  if (values.minSpace !== undefined) set(minSpaceAtom, values.minSpace);
  if (values.minFileSize !== undefined) set(minFileSizeAtom, values.minFileSize);
  if (values.include !== undefined) set(includeAtom, values.include);
  if (values.includeCustom !== undefined) set(includeCustomAtom, values.includeCustom);
  if (values.exclude !== undefined) set(excludeAtom, values.exclude);
  if (values.excludeCustom !== undefined) set(excludeCustomAtom, values.excludeCustom);
  if (values.minSplitSize !== undefined) set(minSplitSizeAtom, values.minSplitSize);
  if (values.moveAsFolderThreshold !== undefined)
    set(moveAsFolderThresholdAtom, values.moveAsFolderThreshold);
  if (values.debug !== undefined) set(debugAtom, values.debug);
  if (values.force !== undefined) set(forceAtom, values.force);
});

export function usePlanStore() {
  const allValues = useAtomValue(allValuesAtom);
  const setAllValues = useSetAtom(setAllValuesAtom);

  return {
    values: allValues,
    setValues: setAllValues
  };
}

export function useDestDisks() {
  const [value, setValue] = useAtom(destDisksAtom);
  return [value, setValue] as const;
}

export function useSourceDisk() {
  const [value, setValue] = useAtom(sourceDiskAtom);
  return [value, setValue] as const;
}

export function usePathFilters() {
  const [value, setValue] = useAtom(pathFiltersAtom);
  return [value, setValue] as const;
}

export function useMinSpace() {
  const [value, setValue] = useAtom(minSpaceAtom);
  return [value, setValue] as const;
}

export function useMinFileSize() {
  const [value, setValue] = useAtom(minFileSizeAtom);
  return [value, setValue] as const;
}

export function useInclude() {
  const [value, setValue] = useAtom(includeAtom);
  return [value, setValue] as const;
}

export function useIncludeCustom() {
  const [value, setValue] = useAtom(includeCustomAtom);
  return [value, setValue] as const;
}

export function useExclude() {
  const [value, setValue] = useAtom(excludeAtom);
  return [value, setValue] as const;
}

export function useExcludeCustom() {
  const [value, setValue] = useAtom(excludeCustomAtom);
  return [value, setValue] as const;
}

export function useMinSplitSize() {
  const [value, setValue] = useAtom(minSplitSizeAtom);
  return [value, setValue] as const;
}

export function useMoveAsFolderThreshold() {
  const [value, setValue] = useAtom(moveAsFolderThresholdAtom);
  return [value, setValue] as const;
}

export function useDebug() {
  const [value, setValue] = useAtom(debugAtom);
  return [value, setValue] as const;
}

export function useForce() {
  const [value, setValue] = useAtom(forceAtom);
  return [value, setValue] as const;
}
