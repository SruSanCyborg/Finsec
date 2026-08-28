import {
  ComplianceFramework,
  ComplianceControl,
  ComplianceSummary,
} from '@sirius/types';
import { MOCK_COMPLIANCE_FRAMEWORKS } from './mock-data';

export const MOCK_COMPLIANCE_CONTROLS: ComplianceControl[] = [
  {
    id: '6.3.1',
    frameworkId: 'pci-dss-4.0',
    section: '6.3 Vulnerability Management',
    title: 'Software Architecture Vulnerability Prevention',
    description: 'Bespoke and custom software must be developed securely to prevent vulnerability introduction, including hardcoded credentials, unencrypted payload logs, and improper tokenization.',
    status: 'fail',
    affectedFindingIds: ['fnd-88219', 'fnd-88220'],
    evidenceDescription: 'Static Analysis Scan 8F31 identified hardcoded RSA private key in auth middleware and unencrypted PAN logging in payment service.',
    evidenceSourceLocation: 'src/middleware/auth.ts:42',
    evidenceScanReference: 'Scan 8F31 (scan-109283)',
    remediationGuidance: 'Rotate private key pair, inject secret via Environment KMS, and apply Vault Tokenization to PAN payment loggers.',
    category: 'Vulnerability Management',
    priority: 'high',
  },
  {
    id: '6.4.2',
    frameworkId: 'pci-dss-4.0',
    section: '6.4 Web Application Protection',
    title: 'Automated Technical Solutions for Public Web Applications',
    description: 'Public-facing web applications are protected by automated technical solutions that continually detect and prevent web-based attacks.',
    status: 'pass',
    affectedFindingIds: [],
    evidenceDescription: 'Ingress Web Application Firewall (WAF) rule verification passed without active bypass findings.',
    evidenceScanReference: 'Scan 8F31 (scan-109283)',
    category: 'Application Security',
    priority: 'medium',
  },
  {
    id: '3.5.1',
    frameworkId: 'pci-dss-4.0',
    section: '3.5 Cryptographic Protection',
    title: 'Cryptographic Key Protection & Annual Rotation',
    description: 'Cryptographic keys used to protect cardholder data must be protected against disclosure and misuse, with annual key rotation enforced.',
    status: 'fail',
    affectedFindingIds: ['fnd-88221'],
    evidenceDescription: 'KMS policy inspection revealed rotation interval set to 730 days (violates 365-day annual rotation directive).',
    evidenceSourceLocation: 'infra/kms-policy.json:14',
    evidenceScanReference: 'Scan 8F31 (scan-109283)',
    remediationGuidance: 'Update KMS key policy rotationIntervalDays to 365 or enable AWS KMS automatic annual key rotation.',
    category: 'Cryptographic Protection',
    priority: 'high',
  },
  {
    id: 'CC6.1',
    frameworkId: 'soc2-type2',
    section: 'Logical and Physical Access Controls',
    title: 'Authentication Credentials & Transmission Security',
    description: 'The entity implements logical access security software, infrastructure, and architectures to prevent unauthorized access.',
    status: 'fail',
    affectedFindingIds: ['fnd-88219'],
    evidenceDescription: 'Static Analysis Scan 8F31 identified hardcoded RSA private key in auth middleware.',
    evidenceSourceLocation: 'src/middleware/auth.ts:42',
    evidenceScanReference: 'Scan 8F31 (scan-109283)',
    remediationGuidance: 'Rotate hardcoded keys and enforce Environment KMS secret injection.',
    category: 'Access Control',
    priority: 'high',
  },
  {
    id: 'CC7.2',
    frameworkId: 'soc2-type2',
    section: 'System Operations',
    title: 'Infrastructure & Vulnerability Monitoring',
    description: 'System operational changes and vulnerability monitoring are evaluated continuously.',
    status: 'pass',
    affectedFindingIds: [],
    evidenceDescription: 'Continuous FinSec Core pipeline monitoring active.',
    evidenceScanReference: 'Scan 8F31 (scan-109283)',
    category: 'Monitoring',
    priority: 'low',
  },
];

export class MockComplianceService {
  private frameworks: ComplianceFramework[] = [...MOCK_COMPLIANCE_FRAMEWORKS];
  private controls: ComplianceControl[] = [...MOCK_COMPLIANCE_CONTROLS];

  public async getComplianceSummary(projectId?: string): Promise<ComplianceSummary> {
    return {
      projectId: projectId || 'prj-finsec-core-01',
      overallScore: 72.5,
      trend: 'stable',
      evaluatedCount: 50,
      passingCount: 35,
      failingCount: 13,
      partialCount: 2,
      executiveNarrative: 'Your PCI DSS 4.0 posture is primarily constrained by credential exposure in auth middleware and KMS key rotation violations.',
      lastAuditedAt: new Date().toISOString(),
    };
  }

  public async getComplianceFrameworks(): Promise<ComplianceFramework[]> {
    return this.frameworks;
  }

  public async getComplianceControls(frameworkId?: string): Promise<ComplianceControl[]> {
    if (frameworkId) {
      return this.controls.filter((c) => c.frameworkId === frameworkId);
    }
    return this.controls;
  }

  public async getComplianceControlById(controlId: string): Promise<ComplianceControl | null> {
    return this.controls.find((c) => c.id === controlId) || this.controls[0] || null;
  }
}
