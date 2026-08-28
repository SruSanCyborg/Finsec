/**
 * `--json` output.
 *
 * A stable envelope, because CI scripts will parse it. Findings are passed
 * through as the contract defines them rather than reshaped, so a contract
 * change does not silently alter this surface.
 */

import { countBySeverity } from '../ui/ScanView.js';
import type { Finding, Severity } from '../domain.js';
import type { GateResult } from '../gate.js';
import type { ScanOutcome } from '../ui/ScanView.js';

export interface JsonEnvelope {
  schema_version: 1;
  scan_id: string | null;
  status: 'completed' | 'incomplete';
  findings: Finding[];
  summary: {
    counts: Partial<Record<Severity, number>>;
    total: number;
    verified_live_secrets: number;
    money_at_risk_inr: number | null;
    compliance_score: number | null;
    skipped_files: number;
  };
  gate: {
    severity_threshold: string;
    fail_on: string;
    blocked: boolean;
    reasons: string[];
    /** What the server proposed, when it sent one. Advisory — see D-002. */
    server_exit_code: number | null;
  };
  exit_code: number;
}

export function buildJsonEnvelope(
  scanId: string | null,
  outcome: ScanOutcome,
  gate: GateResult,
  options: { severityThreshold: string; failOn: string },
): JsonEnvelope {
  const counts = Object.keys(outcome.counts).length > 0 ? outcome.counts : countBySeverity(outcome.findings);

  return {
    schema_version: 1,
    scan_id: scanId,
    status: outcome.serverExitCode === null && outcome.complianceScore === null ? 'incomplete' : 'completed',
    findings: outcome.findings,
    summary: {
      counts,
      total: outcome.findings.length,
      verified_live_secrets: outcome.findings.filter((f) => f.validity === 'verified_live').length,
      money_at_risk_inr: outcome.moneyAtRisk,
      compliance_score: outcome.complianceScore,
      skipped_files: outcome.errors.length,
    },
    gate: {
      severity_threshold: options.severityThreshold,
      fail_on: options.failOn,
      blocked: gate.blocked,
      reasons: gate.reasons,
      server_exit_code: outcome.serverExitCode,
    },
    exit_code: gate.exitCode,
  };
}
