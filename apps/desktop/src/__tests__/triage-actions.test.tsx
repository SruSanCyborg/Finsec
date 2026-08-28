import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FindingDetailView } from '../features/findings/FindingDetailView';
import { Finding } from '@sirius/types';

const mockFinding: Finding = {
  id: 'fnd-88219',
  scanId: 'scan-109283',
  projectId: 'prj-finsec-core-01',
  ruleId: 'FIN-SEC-001',
  title: 'Hardcoded JWT Signing Private Key',
  description: 'A static RSA private key was detected.',
  severity: 'critical',
  status: 'open',
  category: 'secret_leak',
  filePath: 'src/middleware/auth.ts',
  startLine: 42,
  endLine: 58,
  moneyAtRiskUSD: 1450000,
  baselineState: 'new',
  suppressionStatus: 'none',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('FindingDetailView Triage Actions', () => {
  it('renders triage action buttons (Resolve Finding, Accept Risk, Suppress) and governance section', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <FindingDetailView finding={mockFinding} />
      </QueryClientProvider>
    );

    expect(screen.getByText('Resolve Finding')).toBeTruthy();
    expect(screen.getByText('Accept Risk')).toBeTruthy();
    expect(screen.getByText('Suppress')).toBeTruthy();
    expect(screen.getByText('Governance Status')).toBeTruthy();
  });
});
