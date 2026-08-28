import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FindingDetailView } from '../features/findings/FindingDetailView';
import { Finding } from '@sirius/types';

const mockFinding: Finding = {
  id: 'fnd-88219',
  projectId: 'prj-finsec-core-01',
  scanId: 'scan-109283',
  ruleId: 'SEC-JWT-004',
  title: 'Hardcoded Provider Signing Key',
  description: 'Hardcoded JWT signing key detected in middleware.',
  severity: 'critical',
  status: 'open',
  filePath: 'src/middleware/auth.ts',
  startLine: 42,
  endLine: 42,
  category: 'secret_leak',
  cweId: 'CWE-798',
  baselineState: 'new',
  secretValidity: { status: 'valid', lastCheckedAt: '2026-08-17T10:00:00Z' },
  moneyAtRiskUSD: 1450000,
  complianceMappings: [{ framework: 'PCI DSS 4.0', controlId: '6.3.1' }],
  createdAt: '2026-08-17T10:00:00Z',
  updatedAt: '2026-08-17T10:00:00Z',
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('FindingDetailView Component', () => {
  it('renders detailed finding metadata, risk, and governance controls', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <FindingDetailView finding={mockFinding} />
      </QueryClientProvider>
    );

    expect(screen.getByText('Hardcoded Provider Signing Key')).toBeTruthy();
    expect(screen.getByText('fnd-88219')).toBeTruthy();
    expect(screen.getByText('src/middleware/auth.ts:42-42')).toBeTruthy();
    expect(screen.getByText('Resolve Finding')).toBeTruthy();
    expect(await screen.findByText('$1.45M')).toBeTruthy();
  });
});

