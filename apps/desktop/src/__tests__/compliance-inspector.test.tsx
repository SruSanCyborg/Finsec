import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComplianceControlInspector } from '../features/compliance/ComplianceControlInspector';
import { ComplianceControl } from '@sirius/types';

const mockControl: ComplianceControl = {
  id: '6.3.1',
  frameworkId: 'pci-dss-4.0',
  section: '6.3 Vulnerability Management',
  title: 'Software Architecture Vulnerability Prevention',
  description: 'Bespoke software must be developed securely.',
  status: 'fail',
  affectedFindingIds: ['fnd-88219'],
  evidenceDescription: 'Static Analysis Scan 8F31 identified hardcoded key.',
  evidenceSourceLocation: 'src/middleware/auth.ts:42',
  evidenceScanReference: 'Scan 8F31 (scan-109283)',
  remediationGuidance: 'Rotate private key pair.',
};

describe('ComplianceControlInspector Component', () => {
  it('renders control details, requirement description, evidence provenance, and CTAs', () => {
    render(
      <ComplianceControlInspector
        control={mockControl}
        onNavigateToFinding={() => {}}
        onNavigateToCerebus={() => {}}
        onNavigateToRemediation={() => {}}
      />
    );

    expect(screen.getByText('CONTROL 6.3.1')).toBeTruthy();
    expect(screen.getByText('Software Architecture Vulnerability Prevention')).toBeTruthy();
    expect(screen.getByText('EVIDENCE PROVENANCE')).toBeTruthy();
    expect(screen.getByText('Static Analysis Scan 8F31 identified hardcoded key.')).toBeTruthy();
  });
});
