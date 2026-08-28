/**
 * The compliance report, laid out as a page.
 *
 * Separate from `pdf.ts` on purpose: that file knows how to put text on paper
 * and nothing about sirius, this one knows what a compliance report says and
 * nothing about xref tables. The split is what keeps the PDF writer testable
 * against strings rather than against a scan.
 *
 * What goes on the page is decided by who reads it. A compliance report is read
 * by somebody deciding whether to sign off, so it opens with the score, the
 * money and the counts, then names every clause the findings touch — the
 * clauses being why this is a compliance report and not a bug list — and only
 * then lists the findings themselves.
 */

import { RULE, renderPdf } from './pdf.js';
import type { Block } from './pdf.js';

interface ReportDocument {
  scan_id: string;
  scanned_at?: string;
  root: string;
  source?: string;
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
    /** Optional on the wire: a finding without one still belongs on the page. */
    message?: string | undefined;
    compliance_ref: string[];
    money_at_risk_inr: number;
    fingerprint?: string;
  }[];
  attestation: {
    algorithm: string;
    key_id: string;
    signed_at: string;
    payload_sha256: string;
  };
}

/** Indian grouping, as everywhere else. The symbol becomes `Rs.` in WinAnsi. */
const rupees = (paise: number): string => `Rs.${new Intl.NumberFormat('en-IN').format(paise)}`;

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

export function reportToPdf(document: ReportDocument): Buffer {
  const blocks: Block[] = [];

  const line = (text: string, extra: Partial<Block & { text: string }> = {}): void => {
    blocks.push({ text, ...extra } as Block);
  };

  // ---- masthead
  line('Compliance report', { size: 22, bold: true });
  line(`${document.tool.name} v${document.tool.version}`, { size: 9, grey: 0.45 });
  blocks.push(RULE);

  line(document.root, { size: 10, spaceBefore: 4 });
  line(
    `scan ${document.scan_id} · ${document.source ?? 'local'} engine` +
      (document.scanned_at ? ` · ${document.scanned_at}` : ''),
    { size: 9, grey: 0.45 },
  );

  // ---- the three numbers somebody signs off against
  const score = document.summary.compliance_score;
  line('Summary', { size: 13, bold: true, spaceBefore: 20 });
  blocks.push(RULE);

  line(score === null ? 'Compliance score  not reported' : `Compliance score  ${Math.round(score)}/100`, {
    size: 11,
    bold: true,
    spaceBefore: 4,
  });
  line(`Money at risk  ${rupees(document.summary.money_at_risk_inr)}`, { size: 11, bold: true });
  line(
    `${document.summary.findings} finding${document.summary.findings === 1 ? '' : 's'}` +
      (document.summary.files_scanned !== null ? ` across ${document.summary.files_scanned} files` : ''),
    { size: 10, grey: 0.3 },
  );

  const counts = SEVERITY_ORDER.filter((severity) => (document.summary.counts[severity] ?? 0) > 0)
    .map((severity) => `${document.summary.counts[severity]} ${severity}`)
    .join(' · ');
  if (counts) line(counts, { size: 10, grey: 0.3 });

  // A figure this size deserves the sentence that qualifies it. An estimate
  // presented as a measurement is the way a report like this misleads.
  line(
    'Money at risk is an order-of-magnitude estimate for prioritisation, not an actuarial ' +
      'figure. Run `sirius explain <rule>` for the derivation of any single number.',
    { size: 8.5, grey: 0.5, spaceBefore: 10 },
  );

  // ---- the clauses, which are the point of the document
  if (document.compliance_refs.length > 0) {
    line('Clauses engaged', { size: 13, bold: true, spaceBefore: 20 });
    blocks.push(RULE);
    line(document.compliance_refs.join('   ·   '), { size: 10, spaceBefore: 4 });
  }

  // ---- the findings
  line('Findings', { size: 13, bold: true, spaceBefore: 20 });
  blocks.push(RULE);

  if (document.findings.length === 0) {
    line('No findings at or above the configured threshold.', { size: 10, spaceBefore: 4 });
  }

  const ordered = [...document.findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  for (const finding of ordered) {
    line(`${finding.severity.toUpperCase()}   ${finding.rule_id}`, {
      size: 10,
      bold: true,
      spaceBefore: 12,
    });
    if (finding.message) line(finding.message, { size: 10 });
    line(`${finding.file}:${finding.line}`, { size: 9, grey: 0.4 });

    const detail = [
      finding.compliance_ref.join(' · '),
      finding.money_at_risk_inr > 0 ? rupees(finding.money_at_risk_inr) : '',
    ]
      .filter(Boolean)
      .join('     ');
    if (detail) line(detail, { size: 9, grey: 0.4 });
  }

  // ---- provenance
  line('Provenance', { size: 13, bold: true, spaceBefore: 24 });
  blocks.push(RULE);
  line(`Signed ${document.attestation.algorithm} · key ${document.attestation.key_id}`, {
    size: 9,
    grey: 0.35,
    spaceBefore: 4,
  });
  line(`Signed at ${document.attestation.signed_at}`, { size: 9, grey: 0.35 });
  line(`Payload SHA-256 ${document.attestation.payload_sha256}`, { size: 8, grey: 0.35 });

  // The honest limit of this artefact, on the artefact.
  line(
    'The signature covers the report payload, not this PDF. A verifier needs that payload ' +
      'byte for byte: run `sirius report --format json` for the file it can check, and ' +
      '`sirius report --verify <file>` to check it. The digest above is the same one, so the ' +
      'two can be compared by eye.',
    { size: 8.5, grey: 0.5, spaceBefore: 10 },
  );

  return renderPdf(blocks, { title: `sirius compliance report ${document.scan_id}` });
}
