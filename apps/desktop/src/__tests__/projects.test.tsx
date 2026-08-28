import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectsGridView } from '../features/projects/ProjectsGridView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('ProjectsGridView Component', () => {
  it('renders projects list and filters by search query', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/projects']}>
          <ProjectsGridView />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Projects & Workspaces')).toBeTruthy();
    expect(await screen.findByText('finsec-core-gateway')).toBeTruthy();

    const searchInput = screen.getByPlaceholderText('Search by project name or repo URL...');
    fireEvent.change(searchInput, { target: { value: 'key-vault' } });

    expect(screen.getByText('key-vault-service')).toBeTruthy();
    expect(screen.queryByText('finsec-core-gateway')).toBeNull();
  });
});
