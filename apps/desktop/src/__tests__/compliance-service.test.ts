import { describe, it, expect } from 'vitest';
import { MockComplianceService } from '@sirius/mock-api';

describe('MockComplianceService Engine', () => {
  it('retrieves compliance summary and framework control details', async () => {
    const service = new MockComplianceService();

    const summary = await service.getComplianceSummary();
    expect(summary.overallScore).toBe(72.5);
    expect(summary.evaluatedCount).toBe(50);

    const frameworks = await service.getComplianceFrameworks();
    expect(frameworks.length).toBeGreaterThan(0);

    const controls = await service.getComplianceControls('pci-dss-4.0');
    expect(controls.length).toBeGreaterThan(0);

    const firstControl = controls[0];
    expect(firstControl.id).toBe('6.3.1');
    expect(firstControl.status).toBe('fail');
    expect(firstControl.evidenceScanReference).toContain('Scan 8F31');
  });
});
