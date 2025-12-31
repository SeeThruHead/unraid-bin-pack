import { Card, Text, Stack } from '@mantine/core'
import type { ReactNode } from 'react'

interface ConfigCardProps {
  title: string
  children: ReactNode
}

export function ConfigCard({ title, children }: ConfigCardProps) {
  return (
    <Card withBorder>
      <Text fw={500} mb="md">{title}</Text>
      <Stack gap="xs">
        {children}
      </Stack>
    </Card>
  )
}
