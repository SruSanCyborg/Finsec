import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FindingsExplorerView } from '../features/findings/FindingsExplorerView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('FindingsExplorerView Component', () => {
  it('renders findings explorer master-detail investigation workspace', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/findings?severity=critical']}>
          <FindingsExplorerView />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Findings Explorer')).toBeTruthy();
    expect(await screen.findByText('Active Filters:')).toBeTruthy();
    expect(await screen.findByText('Severity: CRITICAL')).toBeTruthy();
  });
});
