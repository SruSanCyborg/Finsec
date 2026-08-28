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
  for (const finding of secrets) {
    const origin = report.provenance.get(finding.id);
    if (!origin) continue;

    const age =
      origin.ageDays === 0
        ? 'today'
        : origin.ageDays === 1
          ? '1 day ago'
          : `${origin.ageDays} days ago`;

    lines.push(
      ` ${paint('leaked', DIM, color)}     ${finding.rule_id}  ` +
        paint(`${age} in ${origin.commit} by ${origin.author}`, DIM, color),
    );
    if (origin.ageDays > 0) {
      lines.push(
        `           ${paint(`in every clone since — rotating the key is the fix, deleting the line is not`, DIM, color)}`,
      );
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

    lines.push(`   ${paint(bullet + ' ' + path.narrative, DIM, color)}`);
  }

  if (!report.validated && secrets.length > 0 && report.exposure.size === 0) {
    lines.push('');
    lines.push(
      ` ${paint('note', DIM, color)}       secrets were not checked against their providers. ` +
        paint('--validate-secrets', BOLD, color) +
        paint(' asks, read-only.', DIM, color),
    );
  }

  return lines;
}
