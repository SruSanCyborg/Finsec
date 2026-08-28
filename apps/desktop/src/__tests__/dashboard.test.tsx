import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardView } from '../features/dashboard/DashboardView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('DashboardView Component', () => {
  it('renders Security Command Dashboard with core metrics', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardView />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Security Command Dashboard')).toBeTruthy();
    expect(await screen.findByText('Compliance Posture')).toBeTruthy();
    expect(await screen.findByText('Open Vulnerabilities')).toBeTruthy();
    expect(await screen.findByText('Money at Risk')).toBeTruthy();
  });
});
