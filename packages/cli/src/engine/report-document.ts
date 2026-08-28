/**
 * The signed report payload, built in one place.
 *
 * `sirius report` built this inline, which was fine while it was the only thing
 * that produced a report. It is not any more: the desktop app downloads the same
 * document over `GET /scans/{id}/report`, and a report signed over one shape by
 * one surface and a slightly different shape by the other cannot be verified by
 * a single `sirius report --verify`. The signature covers these exact bytes, so
 * there has to be exactly one function that decides what they are.
 */

import type { CachedFinding, CachedSummary } from '../session.js';

export interface ReportPayload {
  schema: 'sirius.report/v1';
  scan_id: string;
  scanned_at: string;
  root: string;
  source: string;
  tool: { name: string; version: string };
  summary: {
    findings: number;
    counts: Record<string, number>;
    money_at_risk_inr: number;
    compliance_score: number | null;
    files_scanned: number | null;
  };
  compliance_refs: string[];
  findings: {
    rule_id: string;
    severity: string;
    file: string;
    line: number;
    message?: string | undefined;
    compliance_ref: string[];
    money_at_risk_inr: number;
    fingerprint?: string | undefined;
  }[];
}

export interface BuildReportInput {
  root: string;
  scanId: string;
  scannedAt: string;
  source: string;
  version: string;
  findings: readonly CachedFinding[];
  summary?: CachedSummary | null;
  counts: Record<string, number>;
}

export function buildReportPayload(input: BuildReportInput): ReportPayload {
  return {
    schema: 'sirius.report/v1',
    scan_id: input.scanId,
    scanned_at: input.scannedAt,
    root: input.root,
    source: input.source,
    tool: { name: 'sirius', version: input.version },
    summary: {
      findings: input.findings.length,
      counts: input.counts,
      money_at_risk_inr: input.findings.reduce((sum, f) => sum + (f.money_at_risk_inr ?? 0), 0),
      // The score the scan reported, not one re-derived here. A compliance
      // report that omits the compliance score is an odd document, and one that
      // recomputes it is a second opinion nobody asked for.
      compliance_score: input.summary?.compliance_score ?? null,
      files_scanned: input.summary?.files_scanned ?? null,
    },
    // The clauses are why this is a compliance report and not a bug list.
    compliance_refs: [...new Set(input.findings.flatMap((f) => f.compliance_ref ?? []))].sort(),
    findings: input.findings.map((f) => ({
      rule_id: f.rule_id,
      severity: f.severity,
      file: f.file,
      line: f.line,
      message: f.message,
      compliance_ref: f.compliance_ref ?? [],
      money_at_risk_inr: f.money_at_risk_inr ?? 0,
      fingerprint: f.fingerprint,
    })),
  };
}
