import { describe, it, expect } from 'vitest';
import { MockReportService } from '@sirius/mock-api';

describe('MockReportService Engine', () => {
  it('retrieves reports, generates reports, and returns valid PDF & SARIF export blobs', async () => {
    const service = new MockReportService();

    // 1. Fetch reports list
    const reports = await service.getReports();
    expect(reports.length).toBeGreaterThan(0);

    // 2. Generate report
    const generated = await service.generateReport({
      projectId: 'prj-finsec-core-01',
      scanId: 'scan-109283',
      type: 'technical',
    });

    expect(generated.id).toBeDefined();
    expect(generated.type).toBe('technical');
    expect(generated.summary?.totalFindings).toBeGreaterThan(0);

    // 3. Download PDF blob
    const pdfBlob = await service.downloadReportPdf(generated.id);
    expect(pdfBlob.type).toBe('application/pdf');
    expect(pdfBlob.size).toBeGreaterThan(0);

    // 4. Download SARIF blob
    const sarifBlob = await service.downloadReportSarif(generated.id);
    expect(sarifBlob.type).toBe('application/sarif+json');
    expect(sarifBlob.size).toBeGreaterThan(0);
  });
});
