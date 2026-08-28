import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AttackPathsView } from '../features/attack-paths/AttackPathsView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('AttackPathsView Component', () => {
  it('renders Attack Paths & Security Graph layout and summary strip', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/attack-paths']}>
          <Routes>
            <Route path="/attack-paths" element={<AttackPathsView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Attack Paths & Security Graph')).toBeTruthy();
    expect(await screen.findByText('TOTAL PATHS')).toBeTruthy();
    expect(await screen.findByText('CRITICAL PATHS')).toBeTruthy();
  });
});
