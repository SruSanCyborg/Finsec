import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScanConfigView } from '../features/scans/ScanConfigView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('ScanConfigView Component', () => {
  it('renders scan launcher configuration controls', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/scans/new']}>
          <ScanConfigView />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('New Security Scan Launcher')).toBeTruthy();
    expect(await screen.findByText('Severity Gate Threshold')).toBeTruthy();
    expect(await screen.findByText('Fail-On Predicate')).toBeTruthy();
  });
});
