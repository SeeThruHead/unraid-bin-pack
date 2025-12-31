import { Table, Text, Badge } from "@mantine/core";
import type { DiskProjection, DiskResponse } from "../../../types";
import { formatBytes } from "../../../lib/formatters";
import { calculateDataMoved as calcDataMoved } from "../../../lib/diskCalculations";

const formatDiskSpace = (freeBytes: number, totalBytes: number): JSX.Element => {
  const gb = totalBytes / 1024 / 1024 / 1024;
  const totalFormatted =
    gb >= 1 ? `${gb.toFixed(0)} GB` : `${(totalBytes / 1024 / 1024).toFixed(0)} MB`;

  return (
    <span>
      <Text component="span" c="yellow" fw={700}>
        {formatBytes(freeBytes)}
      </Text>{" "}
      free of{" "}
      <Text component="span" c="dimmed">
        {totalFormatted}
      </Text>
    </span>
  );
};

const calculateDataMovedWithDirection = (
  currentFree: number,
  freeAfter: number
): { amount: number; direction: "ON" | "OFF" | "NONE" } => {
  const diff = calcDataMoved(currentFree, freeAfter);

  if (Math.abs(diff) < 1024 * 1024) {
    // Less than 1MB
    return { amount: 0, direction: "NONE" };
  }

  if (diff > 0) {
    // Free space increased = data moved OFF
    return { amount: diff, direction: "OFF" };
  } else {
    // Free space decreased = data moved ON
    return { amount: Math.abs(diff), direction: "ON" };
  }
};

interface DiskStatsTableProps {
  diskProjections: DiskProjection[];
  actualDiskSpace?: DiskResponse[];
}

export function DiskStatsTable({ diskProjections, actualDiskSpace }: DiskStatsTableProps) {
  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Disk</Table.Th>
          <Table.Th>Before</Table.Th>
          <Table.Th>After</Table.Th>
          <Table.Th>Data Moved</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {diskProjections.map((disk) => {
          const actual = actualDiskSpace?.find((a) => a.path === disk.path);
          const verified =
            actual && Math.abs(actual.freeBytes - disk.freeAfter) < 1024 * 1024 * 100; // Within 100MB
          const dataMoved = calculateDataMovedWithDirection(disk.currentFree, disk.freeAfter);

          return (
            <Table.Tr key={disk.path}>
              <Table.Td>
                <Text fw={500}>{disk.path}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{formatDiskSpace(disk.currentFree, disk.totalBytes)}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {actual
                    ? formatDiskSpace(actual.freeBytes, disk.totalBytes)
                    : formatDiskSpace(disk.freeAfter, disk.totalBytes)}
                </Text>
              </Table.Td>
              <Table.Td>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Text size="sm">
                    <Text
                      component="span"
                      c={
                        dataMoved.direction === "ON"
                          ? "blue"
                          : dataMoved.direction === "OFF"
                            ? "orange"
                            : "dimmed"
                      }
                      fw={dataMoved.direction === "NONE" ? 400 : 600}
                    >
                      {formatBytes(dataMoved.amount)}
                    </Text>{" "}
                    <Text component="span" c="dimmed">
                      {dataMoved.direction === "NONE" ? "OFF" : dataMoved.direction}
                    </Text>
                  </Text>
                  {verified && (
                    <Badge color="green" size="sm">
                      Verified
                    </Badge>
                  )}
                </div>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
