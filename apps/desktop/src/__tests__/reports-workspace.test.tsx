import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsView } from '../features/reports/ReportsView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('ReportsView Component', () => {
  it('renders Reports & Security Evidence workspace and landing table', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/reports']}>
          <Routes>
            <Route path="/reports" element={<ReportsView />} />
            <Route path="/reports/:reportId" element={<ReportsView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Reports & Security Evidence')).toBeTruthy();
    expect(await screen.findByText('Generate Security Report')).toBeTruthy();
  });
});
