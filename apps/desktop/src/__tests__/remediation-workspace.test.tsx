import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RemediationWorkspaceView } from '../features/remediation/RemediationWorkspaceView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('RemediationWorkspaceView Component', () => {
  it('renders Remediation Workspace layout and safety controls', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/findings/fnd-88219/remediation']}>
          <Routes>
            <Route path="/findings/:findingId/remediation" element={<RemediationWorkspaceView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Remediation Workspace')).toBeTruthy();
    expect(await screen.findByText('HUMAN APPROVAL REQUIRED.')).toBeTruthy();
    expect(await screen.findByText('CORE VERIFIER SECURITY CHECKS')).toBeTruthy();
  });
});
