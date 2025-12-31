import type { DiskProjection } from "../types";

export const calculateDataMoved = (currentFree: number, freeAfter: number): number => {
  return freeAfter - currentFree;
};

export const calculateTotalDataMoved = (diskProjections: DiskProjection[]): number => {
  return (
    diskProjections.reduce((total, disk) => {
      const dataMoved = calculateDataMoved(disk.currentFree, disk.freeAfter);
      return total + Math.abs(dataMoved);
    }, 0) / 2
  );
};

export const countAffectedDisks = (
  diskProjections: DiskProjection[]
): { sources: number; destinations: number } => {
  return diskProjections.reduce(
    (counts, disk) => {
      const dataMoved = calculateDataMoved(disk.currentFree, disk.freeAfter);
      if (dataMoved > 1024 * 1024) {
        return { ...counts, sources: counts.sources + 1 };
      } else if (dataMoved < -1024 * 1024) {
        return { ...counts, destinations: counts.destinations + 1 };
      }
      return counts;
    },
    { sources: 0, destinations: 0 }
  );
};

export const calculateUsedPercent = (total: number, free: number): number => {
  return ((total - free) / total) * 100;
};
