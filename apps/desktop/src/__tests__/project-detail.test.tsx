import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectDetailView } from '../features/projects/ProjectDetailView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('ProjectDetailView Component', () => {
  it('renders project detail view for selected project ID', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/projects/prj-finsec-core-01']}>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectDetailView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('finsec-core-gateway')).toBeTruthy();
    expect(await screen.findByText('Compliance Posture')).toBeTruthy();
    expect(await screen.findByText('Recent AST Scans')).toBeTruthy();
  });
});
