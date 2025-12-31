export const formatBytes = (bytes: number): string => {
  const gb = bytes / 1024 / 1024 / 1024;
  const mb = bytes / 1024 / 1024;

  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }

  return `${mb.toFixed(0)} MB`;
};

export const formatBytesWithPrecision = (bytes: number, precision: number = 1): string => {
  const gb = bytes / 1024 / 1024 / 1024;

  if (gb >= 1) {
    return `${gb.toFixed(precision)} GB`;
  }

  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
};
