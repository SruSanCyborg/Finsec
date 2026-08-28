import { CerebusResponse } from '@sirius/types';
import { MOCK_FINDINGS } from './mock-data';

export class MockCerebusService {
  public async analyzeFinding(findingId: string, _userQuery?: string): Promise<CerebusResponse> {

    const finding = MOCK_FINDINGS.find((f) => f.id === findingId) || MOCK_FINDINGS[0];

    // Simulate short network delay for AI analyst processing
    await new Promise((resolve) => setTimeout(resolve, 600));

    const isKeyLeak = finding.ruleId.includes('JWT') || finding.ruleId.includes('SEC') || finding.category === 'secret_leak';

    if (isKeyLeak) {
      return {
        id: `crb-ans-${Date.now()}`,
        findingId: finding.id,
        message: `I have analyzed finding **${finding.ruleId}** in \`${finding.filePath}:${finding.startLine}\`.`,
        sections: {
          analysis: `The provider signing credential is hardcoded directly in source file \`${finding.filePath}\`. Anyone with read access to the repository can extract this signing key and forge authorization tokens.`,
          impact: `An attacker possessing this verified live signing key can issue arbitrarily signed JWT tokens with administrative claims, completely bypassing authentication and gaining unauthenticated access to downstream APIs.`,
          recommendation: `Remove the hardcoded secret from repository source code immediately. Migrate key loading to runtime environment variable \`PROVIDER_JWT_SIGNING_KEY\` or an AWS Secrets Manager secret store, and rotate the exposed credential key.`,
          references: [
            'PCI DSS 4.0 Requirement 6.3.1 (Software Architecture Security)',
            'SOC 2 CC6.1 (Logical Access & Credential Management Controls)',
            'CWE-798: Use of Hard-coded Credentials',
          ],
        },
        proposedRemediation: {
          title: 'Remediate Hardcoded Credential Exposure',
          summary: 'Extract credential into environment variable and load key via secure runtime provider.',
          steps: [
            'Remove static string literal assignment in auth middleware.',
            'Inject process.env.PROVIDER_JWT_SIGNING_KEY with fallback validation check.',
            'Revoke and rotate exposed provider key in production key vault.',
            'Re-run finsec-lint scanner to verify remediation.',
          ],
          diff: {
            filePath: finding.filePath,
            oldCode: `const authMiddleware = async (req: Request, res: Response) => {\n  const signingKey = "sk_live_9921838194821095"; // CRITICAL SECRET LEAK\n  return jwt.verify(token, signingKey);\n};`,
            newCode: `const authMiddleware = async (req: Request, res: Response) => {\n  const signingKey = process.env.PROVIDER_JWT_SIGNING_KEY;\n  if (!signingKey) throw new Error("PROVIDER_JWT_SIGNING_KEY is required");\n  return jwt.verify(token, signingKey);\n};`,
          },
        },
        proposalStatus: 'ready',
        verifierStatus: 'passed',
        createdAt: new Date().toISOString(),
      };
    }

    return {
      id: `crb-ans-${Date.now()}`,
      findingId: finding.id,
      message: `Analysis complete for security finding **${finding.ruleId}** (${finding.title}).`,
      sections: {
        analysis: `Evaluated vulnerability in file \`${finding.filePath}\` on line ${finding.startLine}. Code pattern violates software architecture policies.`,
        impact: `Potential vulnerability exposure under high-load API request payloads.`,
        recommendation: `Apply strict input sanitization and parameter validation routines on target endpoint handler.`,
        references: ['PCI DSS 4.0 6.3.2', 'OWASP Top 10 Security Architecture Guidelines'],
      },
      proposedRemediation: {
        title: 'Apply Parameter Validation Fix',
        summary: 'Enforce sanitization checks before passing request parameters to service boundary.',
        steps: [
          'Add parameter type & length validation checks.',
          'Re-run automated scan pipeline.',
        ],
      },
      proposalStatus: 'ready',
      verifierStatus: 'passed',
      createdAt: new Date().toISOString(),
    };
  }

  public async askGeneralQuestion(query: string, projectId?: string): Promise<CerebusResponse> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      id: `crb-ans-${Date.now()}`,
      message: `Security Advisor Analysis for query: "${query}"`,
      sections: {
        analysis: `Reviewed workspace security posture for project \`${projectId || 'finsec-core-gateway'}\`.`,
        impact: `Continuous scanning detected 2 active findings requiring immediate remediation attention (1 Critical, 1 High).`,
        recommendation: `Prioritize remediating the Critical secret leak in \`src/middleware/auth.ts\` before preparing deployment release artifacts.`,
      },
      proposalStatus: 'proposed',
      verifierStatus: 'passed',
      createdAt: new Date().toISOString(),
    };
  }
}

