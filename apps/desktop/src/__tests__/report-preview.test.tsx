import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportPreview } from '../features/reports/ReportPreview';
import { Report } from '@sirius/types';

const mockReport: Report = {
  id: 'rep-8812',
  projectId: 'prj-finsec-core-01',
  scanId: 'scan-109283',
  type: 'executive',
  title: 'Executive Financial Security & Risk Report',
  status: 'ready',
  generatedAt: new Date().toISOString(),
  createdBy: 'Shivam Pandey (Lead DevSecOps)',
  summary: {
    overallScore: 72.5,
    totalFindings: 43,
    criticalCount: 3,
    highCount: 12,
    mediumCount: 28,
    moneyAtRiskUSD: 1450000,
    passedControlsCount: 35,
    failedControlsCount: 13,
  },
};

describe('ReportPreview Component', () => {
  it('renders structured document preview surface and posture sections', () => {
    render(<ReportPreview report={mockReport} />);

    expect(screen.getByText('Executive Summary')).toBeTruthy();
    expect(screen.getByText('1. EXECUTIVE SECURITY POSTURE & FINANCIAL EXPOSURE')).toBeTruthy();
    expect(screen.getByText('72.5 / 100')).toBeTruthy();
  });
});
