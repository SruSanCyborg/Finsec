import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuppressionsView } from '../features/governance/SuppressionsView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('SuppressionsView Component', () => {
  it('renders Finding Suppressions Policy workspace and data table', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/suppressions']}>
          <Routes>
            <Route path="/suppressions" element={<SuppressionsView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Finding Suppressions Policy')).toBeTruthy();
    expect(await screen.findByText('Create Suppression Policy')).toBeTruthy();
  });
});
