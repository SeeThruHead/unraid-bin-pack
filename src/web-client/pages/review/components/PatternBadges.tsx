import { Badge, Group } from "@mantine/core";

interface PatternBadgesProps {
  patterns: string[];
  color: string;
}

export function PatternBadges({ patterns, color }: PatternBadgesProps) {
  return (
    <Group gap="xs">
      {patterns.map((pattern, i) => (
        <Badge key={i} color={color} variant="light">
          {pattern}
        </Badge>
      ))}
    </Group>
  );
}
