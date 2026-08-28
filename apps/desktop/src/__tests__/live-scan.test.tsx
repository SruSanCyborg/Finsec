import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScanDetailView } from '../features/scans/ScanDetailView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('ScanDetailView Component', () => {
  it('renders live scan command deck for scan ID', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/scans/scan-109283']}>
          <Routes>
            <Route path="/scans/:scanId" element={<ScanDetailView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Scan Analysis Summary')).toBeTruthy();
    expect(await screen.findByText('Live Analysis Console')).toBeTruthy();
    expect(await screen.findByText('Live Findings Stream')).toBeTruthy();
  });
});
