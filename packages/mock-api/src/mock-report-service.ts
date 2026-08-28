import { Report, ReportType } from '@sirius/types';
import { MOCK_REPORTS, MOCK_FINDINGS } from './mock-data';

export class MockReportService {
  private reports: Report[] = [...MOCK_REPORTS];

  public async getReports(projectId?: string): Promise<Report[]> {
    if (projectId) {
      return this.reports.filter((r) => r.projectId === projectId);
    }
    return this.reports;
  }

  public async getReportById(reportId: string): Promise<Report | null> {
    return this.reports.find((r) => r.id === reportId) || null;
  }

  public async generateReport(params: {
    projectId: string;
    scanId: string;
    type: ReportType;
    frameworkId?: string;
  }): Promise<Report> {
    await new Promise((resolve) => setTimeout(resolve, 600));

    const titleMap: Record<ReportType, string> = {
      executive: 'Executive Financial Security & Risk Report',
      technical: 'Technical Security & SARIF Audit Assessment',
      compliance: 'Compliance & Regulatory Audit Evidence Report',
    };

    const newReport: Report = {
      id: `rep-${Date.now().toString().slice(-4)}`,
      projectId: params.projectId,
      scanId: params.scanId,
      type: params.type,
      title: `${titleMap[params.type]} (${new Date().toLocaleDateString()})`,
      status: 'ready',
      format: params.type === 'technical' ? 'sarif' : 'pdf',
      frameworkId: params.frameworkId,
      generatedAt: new Date().toISOString(),
      createdBy: 'Shivam Pandey (Lead DevSecOps)',
      downloadUrl: `/api/v1/reports/rep-${Date.now()}/download`,
      verificationStatus: 'verified',
      summary: {
        overallScore: 72.5,
        totalFindings: MOCK_FINDINGS.length,
        criticalCount: MOCK_FINDINGS.filter((f) => f.severity === 'critical').length,
        highCount: MOCK_FINDINGS.filter((f) => f.severity === 'high').length,
        mediumCount: MOCK_FINDINGS.filter((f) => f.severity === 'medium').length,
        moneyAtRiskUSD: 1450000,
        passedControlsCount: 35,
        failedControlsCount: 13,
      },
      verification: {
        isVerified: true,
        signature: `0x${Date.now().toString(16)}...${params.scanId.slice(-4)}`,
        verifiedAt: new Date().toISOString(),
        verifierCertificate: 'FinSec Security Assurance CA-2026',
      },
    };

    this.reports.unshift(newReport);
    return newReport;
  }

  public async downloadReportPdf(reportId: string): Promise<Blob> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const report = await this.getReportById(reportId);
    const content = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length 120>>stream\nBT\n/F1 14 Tf\n50 750 Td\n(SIRIUS Security Intelligence Report: ${report?.title || reportId}) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000222 00000 n \n0000000287 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n450\n%%EOF`;
    return new Blob([content], { type: 'application/pdf' });
  }

  public async downloadReportSarif(_reportId: string): Promise<Blob> {

    await new Promise((resolve) => setTimeout(resolve, 300));

    // D-006 Mapping Rules:
    // critical/high -> SARIF level "error"
    // medium -> SARIF level "warning"
    // low/info -> SARIF level "note"
    // baseline_state -> SARIF baselineState ("new", "unchanged", "absent")
    const sarifObj = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'finsec-lint',
              version: '1.4.0',
              informationUri: 'https://sirius.finsec.dev',
              rules: MOCK_FINDINGS.map((f) => ({
                id: f.ruleId,
                shortDescription: { text: f.title },
                fullDescription: { text: f.description },
                defaultConfiguration: {
                  level: f.severity === 'critical' || f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'note',
                },
              })),
            },
          },
          results: MOCK_FINDINGS.map((f) => ({
            ruleId: f.ruleId,
            level: f.severity === 'critical' || f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'note',
            message: { text: f.description },
            baselineState: f.baselineState || 'new',
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: f.filePath },
                  region: { startLine: f.startLine, endLine: f.endLine },
                },
              },
            ],
          })),
        },
      ],
    };

    return new Blob([JSON.stringify(sarifObj, null, 2)], { type: 'application/sarif+json' });
  }
}
