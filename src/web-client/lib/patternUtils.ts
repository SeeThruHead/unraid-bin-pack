export const parseCustomPatterns = (customString: string): string[] =>
  customString ? customString.split(",").map((s) => s.trim()) : [];

export const mergePatterns = (patterns: string[], customPatterns: string): string[] => [
  ...patterns,
  ...parseCustomPatterns(customPatterns)
];

export const togglePattern = (patterns: string[], pattern: string, checked: boolean): string[] =>
  checked ? [...patterns, pattern] : patterns.filter((p) => p !== pattern);

export const joinIfNotEmpty = (arr: string[]): string | undefined =>
  arr.length > 0 ? arr.join(",") : undefined;
