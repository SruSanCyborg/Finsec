import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CerebusWorkspaceView } from '../features/cerebus/CerebusWorkspaceView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('CerebusWorkspaceView Component', () => {
  it('renders Cerebus AI Analyst workspace layout', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/cerebus?finding=fnd-88219']}>
          <CerebusWorkspaceView />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Cerebus Analyst Workspace')).toBeTruthy();
    expect(await screen.findByText('SECURITY CONTEXT')).toBeTruthy();
  });
});
