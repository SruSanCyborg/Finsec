/**
 * Rendering for the Threat stage.
 *
 * Detection produces a list. Threat answers the three questions a list cannot:
 * is it reachable, is it live, and how long has it been exposed. This is the
 * section that makes the pipeline legible as Threat → Detection → Response
 * rather than as a linter with extra steps.
 */

import { formatInr } from '../money.js';
import type { AttackPath, Provenance } from '../engine/threat.js';
import type { Finding, Severity } from '../domain.js';
import type { RenderOptions } from './plain.js';
import { wrapText } from '../wrap.js';

const SEVERITY_ANSI: Record<Severity, string> = {
  critical: '\u001b[38;5;203m',
  high: '\u001b[38;5;215m',
  medium: '\u001b[38;5;221m',
  low: '\u001b[38;5;117m',
  info: '\u001b[38;5;245m',
};

const DIM = '\u001b[38;5;244m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

const paint = (text: string, color: string, on: boolean) => (on ? `${color}${text}${RESET}` : text);

/** Re-exported so existing callers and tests keep their import path. */
export const wrap = wrapText;

export interface ThreatReport {
  paths: AttackPath[];
  /** Provenance for leaked credentials, keyed by finding id. */
  provenance: Map<string, Provenance>;
  /** Exposure verdicts, keyed by finding id. */
  exposure: Map<string, { exposure: string; provider?: string; detail?: string }>;
  validated: boolean;
}

export function renderThreatReport(
  findings: readonly Finding[],
  report: ThreatReport,
  options: RenderOptions = {},
): string[] {
  const color = options.color ?? false;
  const unicode = options.unicode ?? true;
  const arrow = unicode ? '→' : '->';
  const bullet = unicode ? '·' : '-';

  const lines: string[] = [];
  const secrets = findings.filter((f) => f.category === 'secrets');

  if (report.paths.length === 0 && report.provenance.size === 0 && report.exposure.size === 0) {
    return lines;
  }

  lines.push('');
  lines.push(paint(`THREAT`, BOLD, color));

  // ---- exposure: is the credential live right now?
  for (const finding of secrets) {
    const verdict = report.exposure.get(finding.id);
    if (!verdict) continue;

    const live = verdict.exposure === 'verified_live';
    const label = live
      ? `${unicode ? '⚠ ' : '! '}LIVE — accepted by ${verdict.provider} right now`
      : verdict.exposure === 'inactive'
        ? `revoked — ${verdict.detail ?? 'provider rejected it'}`
        : `unverified — ${verdict.detail ?? 'no verdict'}`;

    lines.push(
      ` ${paint('exposure', DIM, color)}   ${finding.rule_id}  ` +
        paint(label, live ? SEVERITY_ANSI.critical : DIM, color),
    );
  }

  // ---- archaeology: how long has it been in history?
  //
  // Grouped, not listed. Sixteen secrets introduced by the same commit is one
  // fact about one commit, and printing it sixteen times buries it. Each line
  // names the file, because "SIR-SEC-002 39 days ago" tells a reader nothing
  // they can act on.
  const dated = secrets
    .map((finding) => ({ finding, origin: report.provenance.get(finding.id) }))
    .filter((entry): entry is { finding: Finding; origin: NonNullable<typeof entry.origin> } =>
      Boolean(entry.origin),
    )
    .sort((a, b) => b.origin.ageDays - a.origin.ageDays);

  if (dated.length > 0) {
    const byCommit = new Map<string, typeof dated>();
    for (const entry of dated) {
      byCommit.set(entry.origin.commit, [...(byCommit.get(entry.origin.commit) ?? []), entry]);
    }

    const age = (days: number) =>
      days === 0 ? 'committed today' : days === 1 ? 'in history for 1 day' : `in history for ${days} days`;

    lines.push('');
    for (const [commit, group] of [...byCommit].slice(0, 4)) {
      const first = group[0]!;
      const where =
        group.length === 1
          ? `${first.finding.file}:${first.finding.line}`
          : `${group.length} secrets across ${new Set(group.map((g) => g.finding.file)).size} file(s)`;

      lines.push(
        ` ${paint('in history', DIM, color)} ${paint(where, DIM, color)}`,
      );
      lines.push(
        `            ${paint(
          `${age(first.origin.ageDays)} · added by ${first.origin.author} in ${commit}`,
          DIM,
          color,
        )}`,
      );
    }

    if (byCommit.size > 4) {
      lines.push(` ${paint('', DIM, color)}           ${paint(`+ ${byCommit.size - 4} more commits`, DIM, color)}`);
    }

    // Said once, because it is one lesson, not one per finding.
    if (dated.some((d) => d.origin.ageDays > 0)) {
      lines.push(
        `            ${paint('anyone who cloned the repo already has these. Rotate them —', DIM, color)}`,
      );
      lines.push(`            ${paint('deleting the line does not remove it from history.', DIM, color)}`);
    }
  }

  // ---- attack paths: what can actually be reached?
  for (const path of report.paths) {
    lines.push('');
    lines.push(
      ` ${paint(path.id, BOLD, color)}  ` +
        paint(path.title, SEVERITY_ANSI[path.severity], color) +
        (path.money_at_risk_inr
          ? paint(`   ${formatInr(path.money_at_risk_inr)}`, SEVERITY_ANSI[path.severity], color)
          : ''),
    );

    for (const [index, step] of path.steps.entries()) {
      const connector = index === 0 ? ' ' : arrow;
      lines.push(
        `   ${paint(connector, DIM, color)} ${step.finding.rule_id}  ` +
          paint(`${step.finding.file}:${step.finding.line}`, DIM, color) +
          paint(`  ${step.role}`, DIM, color),
      );
    }

    // Wrapped, not truncated. The narrative is the reason the path matters, and
    // an explanation cut off mid-sentence explains nothing.
    const indent = '     ';
    for (const [index, chunk] of wrap(path.narrative, (options.width ?? 80) - indent.length - 2).entries()) {
      lines.push(`   ${paint(index === 0 ? `${bullet} ${chunk}` : `  ${chunk}`, DIM, color)}`);
    }
  }

  if (!report.validated && secrets.length > 0 && report.exposure.size === 0) {
    lines.push('');
    // Wrapped: this line names the flag that turns on live verification, and
    // it was being cut off exactly where the flag appears.
    const note = wrapText(
      'secrets were not checked against their providers. --validate-secrets asks, read-only.',
      Math.max(24, (options.width ?? 80) - 12),
    );
    for (const [index, chunk] of note.entries()) {
      lines.push(` ${paint(index === 0 ? 'note' : '    ', DIM, color)}       ${paint(chunk, DIM, color)}`);
    }
  }

  return lines;
}
