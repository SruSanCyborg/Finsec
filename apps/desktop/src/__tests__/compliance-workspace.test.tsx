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

describe('ComplianceView Component', () => {
  it('renders Compliance & Security Posture workspace layout and hero score', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/compliance']}>
          <Routes>
            <Route path="/compliance" element={<ComplianceView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText(/Compliance & Security Posture/i)).toBeTruthy();
    expect(await screen.findByText(/EXECUTIVE POSTURE SUMMARY/i)).toBeTruthy();
  });
});
