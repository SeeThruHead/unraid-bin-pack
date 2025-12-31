import { Alert, Text } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";

type ExecutionResult = {
  success: boolean;
  output: string;
  summary?: unknown;
};

interface ExecutionCompleteProps {
  result: ExecutionResult;
}

export function ExecutionComplete({ result }: ExecutionCompleteProps) {
  return (
    <Alert icon={<IconCheck size={16} />} title="Execution Complete" color="green">
      <Text>Plan executed successfully! Check the disk stats above for verification.</Text>
    </Alert>
  );
}
