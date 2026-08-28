import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttackPathInspector } from '../features/attack-paths/AttackPathInspector';
import { AttackPath } from '@sirius/types';

const mockPath: AttackPath = {
  id: 'ap-001',
  projectId: 'prj-finsec-core-01',
  title: 'Exposed Provider Credential to Payment Ledger Exfiltration',
  description: 'An attacker extracts credentials and accesses transaction APIs.',
  severity: 'critical',
  entryNodeId: 'node-entry-cred',
  targetNodeId: 'node-asset-ledger',
  entryLabel: 'Exposed Provider Credential',
  targetLabel: 'Financial Payment Ledger',
  nodeCount: 5,
  findingCount: 2,
  financialExposureUSD: 1450000,
  estimatedExploitabilityScore: 9.8,
  findingIds: ['fnd-88219'],
  nodes: [],
  edges: [],
};

describe('AttackPathInspector Component', () => {
  it('renders path details, entry point, target asset, and financial exposure section', () => {
    render(
      <AttackPathInspector
        attackPath={mockPath}
        selectedNode={null}
        onNavigateToFinding={() => {}}
        onNavigateToCerebus={() => {}}
      />
    );

    expect(screen.getByText('ATTACK PATH INSPECTOR')).toBeTruthy();
    expect(screen.getByText('Exposed Provider Credential')).toBeTruthy();
    expect(screen.getByText('Financial Payment Ledger')).toBeTruthy();
    expect(screen.getByText('ESTIMATED ASSET EXPOSURE')).toBeTruthy();
  });
});
