import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScansHistoryView } from '../features/scans/ScansHistoryView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('ScansHistoryView Component', () => {
  it('renders scans history list', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/scans']}>
          <ScansHistoryView />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Security Scans')).toBeTruthy();
    expect(await screen.findByText('#scan-109283')).toBeTruthy();
  });
});
