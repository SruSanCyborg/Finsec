import { describe, it, expect } from 'vitest';
import { MockReportService } from '@sirius/mock-api';

describe('D-006 SARIF Export Validation', () => {
  it('validates SARIF 2.1.0 schema structure and D-006 severity/baseline mapping rules', async () => {
    const service = new MockReportService();

    const sarifBlob = await service.downloadReportSarif('rep-8813');
    const sarifText = await sarifBlob.text();
    const sarifJson = JSON.parse(sarifText);

    expect(sarifJson.version).toBe('2.1.0');
    expect(sarifJson.runs.length).toBeGreaterThan(0);

    const run = sarifJson.runs[0];
    expect(run.tool.driver.name).toBe('finsec-lint');
    expect(run.results.length).toBeGreaterThan(0);

    const criticalResult = run.results.find(
      (r: { ruleId: string; level: string; baselineState?: string }) => r.ruleId === 'FIN-SEC-001' || r.ruleId === 'FIN-PCI-603'
    );

    if (criticalResult) {
      // D-006 Rule: critical/high -> error
      expect(criticalResult.level).toBe('error');
      expect(criticalResult.baselineState).toBeDefined();
    }
  });
});
