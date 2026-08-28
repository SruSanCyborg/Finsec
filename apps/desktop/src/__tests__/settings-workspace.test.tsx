import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsView } from '../features/settings/SettingsView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('SettingsView Component', () => {
  it('renders Settings & Integrations Workspace shell and sidebar navigation', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/settings/general']}>
          <Routes>
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/settings/:section" element={<SettingsView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Settings & Integrations Workspace')).toBeTruthy();
    expect(await screen.findByText('General Workspace Settings')).toBeTruthy();
  });
});
