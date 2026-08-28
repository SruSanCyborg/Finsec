import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BaselinesView } from '../features/governance/BaselinesView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('BaselinesView Component', () => {
  it('renders Repository Baselines workspace and active baseline summary strip', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/baselines']}>
          <Routes>
            <Route path="/baselines" element={<BaselinesView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Repository Baselines & Delta Governance')).toBeTruthy();
    expect(await screen.findByText('CURRENT ACTIVE BASELINE')).toBeTruthy();
    expect(await screen.findByText('NEW FINDINGS')).toBeTruthy();
  });
});
