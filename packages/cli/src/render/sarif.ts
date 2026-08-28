/**
 * SARIF 2.1.0 output, for `github/codeql-action/upload-sarif@v3`.
 *
 * The one judgement call the PRD leaves open is the severity collapse: SARIF has
 * three levels and finsec has five (decisions.md D-006). `baselineState` needs
 * no mapping — `new|unchanged|absent` are already SARIF's own tokens, which is
 * evidently why the schema uses them.
 */

import type { Finding, Severity } from '../domain.js';

const SARIF_VERSION = '2.1.0';
const SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';

/** D-006: critical+high → error, medium → warning, low+info → note. */
export function sarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'note';
  }
}

export interface SarifOptions {
  toolVersion: string;
  informationUri?: string;
}

export function buildSarif(findings: readonly Finding[], options: SarifOptions): unknown {
  // One SARIF rule per distinct finsec rule that actually fired, so the GitHub
  // Security tab can group and link them.
  const rules = new Map<string, unknown>();
  for (const finding of findings) {
    if (rules.has(finding.rule_id)) continue;
    rules.set(finding.rule_id, {
      id: finding.rule_id,
      name: finding.rule_id,
      shortDescription: { text: finding.message },
      defaultConfiguration: { level: sarifLevel(finding.severity) },
      properties: {
        category: finding.category,
        'security-severity': securitySeverity(finding.severity),
        tags: ['security', 'compliance', finding.category, ...(finding.compliance_ref ?? [])],
      },
    });
  }

  return {
    $schema: SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'finsec-lint',
            version: options.toolVersion,
            informationUri: options.informationUri ?? 'https://finsec.dev',
            rules: [...rules.values()],
          },
        },
        results: findings.map((finding) => ({
          ruleId: finding.rule_id,
          level: sarifLevel(finding.severity),
          message: { text: finding.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.file },
                region: {
                  startLine: finding.line,
                  ...(finding.end_line ? { endLine: finding.end_line } : {}),
                  ...(finding.col ? { startColumn: finding.col } : {}),
                  ...(finding.snippet ? { snippet: { text: finding.snippet } } : {}),
                },
              },
            },
          ],
          // GitHub uses partialFingerprints to track a finding across commits,
          // which is exactly what our fingerprint is for.
          ...(finding.fingerprint ? { partialFingerprints: { finsecFingerprint: finding.fingerprint } } : {}),
          baselineState: finding.baseline_state ?? 'new',
          properties: {
            severity: finding.severity,
            category: finding.category,
            compliance_ref: finding.compliance_ref ?? [],
            ...(finding.validity ? { validity: finding.validity } : {}),
            ...(finding.money_at_risk_inr ? { money_at_risk_inr: finding.money_at_risk_inr } : {}),
          },
          ...(finding.suppressed
            ? { suppressions: [{ kind: 'external', justification: 'Suppressed by finsec policy' }] }
            : {}),
        })),
      },
    ],
  };
}

/**
 * GitHub reads `security-severity` as a CVSS-style number to bucket alerts.
 * These map onto its own critical/high/medium/low bands.
 */
function securitySeverity(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return '9.5';
    case 'high':
      return '7.5';
    case 'medium':
      return '5.0';
    case 'low':
      return '3.0';
    default:
      return '1.0';
  }
}
