import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PolicySettings } from '../features/settings/PolicySettings';
import { WorkspaceSettings } from '@sirius/types';

const mockSettings: WorkspaceSettings = {
  workspaceName: 'SIRIUS FinSec Command Center',
  defaultProjectId: 'prj-finsec-core-01',
  defaultBranch: 'main',
  timezone: 'UTC-5',
  dateFormat: 'YYYY-MM-DD',
  apiEndpoint: 'https://api.finsec.dev/v1',
  environment: 'production',
  apiKeyMasked: '••••••••••••9A1F',
  connectionStatus: 'connected',
  latencyMs: 12,
  policy: {
    severityThreshold: 'high',
    failOn: 'verified-secrets',
  },
  notificationPreferences: {
    criticalAlerts: true,
    scanCompletion: true,
    complianceDegradation: true,
    securityBreach: true,
  },
};

describe('PolicySettings Component', () => {
  it('renders Security Policy gating parameters and threshold selectors', () => {
    render(<PolicySettings settings={mockSettings} onSave={vi.fn()} />);

    expect(screen.getByText('Security Policy & CI Scan Gating')).toBeTruthy();
    expect(screen.getByText('SCAN FAIL SEVERITY THRESHOLD')).toBeTruthy();
    expect(screen.getByText('BUILD FAIL-ON PREDICATE')).toBeTruthy();
  });
});
