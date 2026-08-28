/**
 * The plain renderer: what you get when stdout is not a terminal.
 *
 * The PRD mocks up the rich view only, so this layout is a deliberate decision
 * rather than a fallback that fell out of broken box-drawing. One line per
 * finding, grep-friendly, stable enough to snapshot in tests:
 *
 *   CRITICAL FIN-SEC-001 src/config.py:14 Hardcoded Stripe secret key [PCI-DSS:8.6.2, DPDP:8] (VERIFIED LIVE, Rs 42,00,000 at risk)
 */

import { formatScore } from '../gate.js';
import { formatInr } from '../money.js';
import { SEVERITY_ORDER } from '../domain.js';
import type { Finding, Severity } from '../domain.js';
import type { GateResult } from '../gate.js';
import type { ScanOutcome } from '../ui/ScanView.js';

export function renderFindingLine(finding: Finding): string {
  const parts = [
    finding.severity.toUpperCase().padEnd(8),
    finding.rule_id,
    `${finding.file}:${finding.line}`,
    finding.message,
  ];

  const refs = finding.compliance_ref ?? [];
  if (refs.length > 0) parts.push(`[${refs.join(', ')}]`);

  const annotations: string[] = [];
  if (finding.validity === 'verified_live') annotations.push('VERIFIED LIVE');
  else if (finding.validity === 'inactive') annotations.push('inactive');
  const money = formatInr(finding.money_at_risk_inr);
  if (money) annotations.push(`${money} at risk`);
  if (annotations.length > 0) parts.push(`(${annotations.join(', ')})`);

  return parts.join(' ');
}

export interface PlainReportInput {
  outcome: ScanOutcome;
  gate: GateResult;
  counts: Partial<Record<Severity, number>>;
}

export function renderPlainReport({ outcome, gate, counts }: PlainReportInput): string {
  const lines: string[] = [];

  // Most severe first, then by file, so the output is deterministic regardless
  // of the order findings streamed in.
  const sorted = [...outcome.findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity);
    if (bySeverity !== 0) return bySeverity;
    return `${a.file}:${a.line}`.localeCompare(`${b.file}:${b.line}`);
  });

  for (const finding of sorted) lines.push(renderFindingLine(finding));

  if (sorted.length > 0) lines.push('');

  const counted = [...SEVERITY_ORDER]
    .reverse()
    .filter((severity) => (counts[severity] ?? 0) > 0)
    .map((severity) => `${counts[severity]} ${severity}`);
  lines.push(`Findings:   ${counted.length > 0 ? counted.join(', ') : 'none'}`);

  const verifiedLive = outcome.findings.filter((f) => f.validity === 'verified_live').length;
  const inactive = outcome.findings.filter((f) => f.validity === 'inactive').length;
  if (verifiedLive + inactive > 0) {
    lines.push(`Secrets:    ${verifiedLive} verified-live, ${inactive} inactive`);
  }

  const money = formatInr(outcome.moneyAtRisk);
  if (money) lines.push(`Money@risk: ${money}`);
  if (typeof outcome.complianceScore === 'number') {
    lines.push(`Compliance: ${formatScore(outcome.complianceScore)}/100`);
  }
  if (outcome.errors.length > 0) {
    lines.push(`Skipped:    ${outcome.errors.length} file(s) could not be parsed`);
  }

  lines.push(`Gate:       ${gate.predicate} -> ${gate.blocked ? 'BLOCKED' : 'PASSED'} (exit ${gate.exitCode})`);
  for (const reason of gate.reasons) lines.push(`            - ${reason}`);

  return lines.join('\n') + '\n';
}
