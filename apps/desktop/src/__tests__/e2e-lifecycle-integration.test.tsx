import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardView } from '../features/dashboard/DashboardView';
import { FindingsExplorerView } from '../features/findings/FindingsExplorerView';
import { CerebusWorkspaceView } from '../features/cerebus/CerebusWorkspaceView';
import { RemediationWorkspaceView } from '../features/remediation/RemediationWorkspaceView';
import { ComplianceView } from '../features/compliance/ComplianceView';
import { ReportsView } from '../features/reports/ReportsView';
import { SettingsView } from '../features/settings/SettingsView';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('E2E Lifecycle Cross-Surface Integration Suite', () => {
  it('renders DashboardView surface cleanly with unified project context', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<DashboardView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Security Command Dashboard')).toBeTruthy();
  });

  it('renders FindingsExplorerView with unified finding domain contract', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/findings']}>
          <Routes>
            <Route path="/findings" element={<FindingsExplorerView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Findings Explorer')).toBeTruthy();
  });

  it('renders CerebusWorkspaceView surface with finding context', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/cerebus/fnd-88219']}>
          <Routes>
            <Route path="/cerebus/:findingId" element={<CerebusWorkspaceView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Cerebus AI Security Analyst')).toBeTruthy();
  });

  it('renders RemediationWorkspaceView surface with safety gates', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/remediation/fnd-88219']}>
          <Routes>
            <Route path="/remediation/:findingId" element={<RemediationWorkspaceView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Remediation Workspace')).toBeTruthy();
  });

  it('renders ComplianceView posture surface', async () => {
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

    expect(await screen.findByText('Compliance & Security Posture')).toBeTruthy();
  });

  it('renders ReportsView workspace surface', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/reports']}>
          <Routes>
            <Route path="/reports" element={<ReportsView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Reports & Security Evidence')).toBeTruthy();
  });

  it('renders SettingsView workspace surface', async () => {
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
  });
});
