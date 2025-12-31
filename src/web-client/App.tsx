import { MantineProvider, AppShell, Title, Container } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PlanWizard } from './pages/PlanWizard'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={{
          primaryColor: 'yellow',
          colors: {
            dark: [
              '#C1C2C5',
              '#A6A7AB',
              '#909296',
              '#5c5f66',
              '#373A40',
              '#2C2E33',
              '#25262b',
              '#1A1B1E',
              '#141517',
              '#101113',
            ],
          },
        }}
        defaultColorScheme="dark"
      >
        <AppShell header={{ height: 60 }} padding="md">
          <AppShell.Header>
            <Container size="xl" h="100%" style={{ display: 'flex', alignItems: 'center' }}>
              <Title order={2}>Unraid Bin Pack</Title>
            </Container>
          </AppShell.Header>
          <AppShell.Main>
            <Container size="xl">
              <PlanWizard />
            </Container>
          </AppShell.Main>
        </AppShell>
      </MantineProvider>
    </QueryClientProvider>
  )
}

export default App
