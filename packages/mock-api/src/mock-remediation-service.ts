import { FixProposal, FixApplicationResult, Finding } from '@sirius/types';
import { MOCK_FINDINGS } from './mock-data';

export class MockRemediationService {
  private findings: Finding[] = [...MOCK_FINDINGS];

  public async getFixProposal(findingId: string): Promise<FixProposal> {
    const finding = this.findings.find((f) => f.id === findingId) || this.findings[0];

    // Simulate network latency for fix retrieval & core verifier validation
    await new Promise((resolve) => setTimeout(resolve, 400));

    return {
      id: `fix-prop-${finding.id}`,
      findingId: finding.id,
      projectId: finding.projectId,
      title: `Remediate ${finding.title}`,
      summary: `Migrate hardcoded credential to process.env.PROVIDER_JWT_SIGNING_KEY in ${finding.filePath}.`,
      proposalStatus: 'ready',
      verifierStatus: 'passed',
      verifierMessage: 'Core scanner static verifier passed all compliance rules and safety checks.',
      diff: {
        filePath: finding.filePath,
        oldCode: `const authMiddleware = async (req: Request, res: Response) => {\n  const signingKey = "sk_live_9921838194821095"; // CRITICAL SECRET LEAK\n  return jwt.verify(token, signingKey);\n};`,
        newCode: `const authMiddleware = async (req: Request, res: Response) => {\n  const signingKey = process.env.PROVIDER_JWT_SIGNING_KEY;\n  if (!signingKey) throw new Error("PROVIDER_JWT_SIGNING_KEY is required");\n  return jwt.verify(token, signingKey);\n};`,
        additionsCount: 4,
        deletionsCount: 2,
      },
      steps: [
        'Create atomic backup copy of target source file.',
        'Extract static credential literal into process.env.PROVIDER_JWT_SIGNING_KEY.',
        'Re-run finsec-lint static analyzer to confirm rule SEC-JWT-004 resolution.',
        'Re-verify repository posture before finalizing patch application.',
      ],
      verificationChecks: [
        { name: 'Static Analysis Rule SEC-JWT-004', status: 'pass', message: 'Rule check passed with 0 violations.' },
        { name: 'Secret Scanner Verification', status: 'pass', message: 'No hardcoded credentials detected in target patch.' },
        { name: 'PCI DSS 4.0 6.3.1 Compliance Check', status: 'pass', message: 'Software architecture policy compliant.' },
        { name: 'Regression Suite Pre-Check', status: 'pass', message: 'No side effects on authorization middleware.' },
      ],
      isStaleFile: false,
      createdAt: new Date().toISOString(),
    };
  }

  public async applyFixProposal(findingId: string): Promise<FixApplicationResult> {
    const finding = this.findings.find((f) => f.id === findingId);

    // Simulate multi-stage patch application & re-verification pipeline over ~1000ms
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (finding) {
      finding.status = 'fixed';
    }


    return {
      success: true,
      status: 'applied',
      backupCreated: true,
      reverified: true,
      message: 'Patch applied cleanly. Atomic backup created at .sirius/backups/auth.ts.bak. Re-verification passed with 0 security violations.',
      appliedAt: new Date().toISOString(),
    };
  }

  public async rejectFixProposal(_findingId: string, _reason?: string): Promise<{ success: boolean }> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { success: true };
  }
}
