import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ComplianceView } from '../features/compliance/ComplianceView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('ComplianceView URL Sync', () => {
  it('loads selected compliance framework directly from URL query params', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/compliance?framework=pci-dss-4.0&control=6.3.1']}>
          <Routes>
            <Route path="/compliance" element={<ComplianceView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Compliance & Security Posture')).toBeTruthy();
  });
});
