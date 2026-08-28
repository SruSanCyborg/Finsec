/**
 * The line-based renderer: what you get when stdout is not a terminal, and what
 * the full-screen shell captures into its transcript.
 *
 * The PRD mocks up the rich view only, so this layout is a deliberate decision
 * rather than a fallback that fell out of broken box-drawing.
 *
 * Two things drive the design. It stays **one line per finding** so it is
 * grep-friendly and stable to snapshot. And when a line will not fit, it drops
 * the *least* valuable field first: an earlier version truncated from the right
 * and cut off `₹42,00,000 at risk` and `VERIFIED LIVE` — the two strings the
 * whole product is selling. Compliance refs go first, then the message is
 * shortened; the money and the validity are never dropped.
 */

import { wrapText } from '../wrap.js';
import { formatScore } from '../gate.js';
import { formatInr } from '../money.js';
import { EXPOSURE_MODEL } from '../engine/exposure-model.js';
import { SEVERITY_ORDER } from '../domain.js';
import type { Finding, Severity } from '../domain.js';
import type { GateResult } from '../gate.js';
import type { ScanOutcome } from '../ui/ScanView.js';

// Design tokens, duplicated as ANSI because this renderer writes strings rather
// than Ink elements. Kept in sync with ui/theme.ts by hand — there are five.
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
const GREEN = '\u001b[38;5;42m';

const GLYPH: Record<Severity, string> = {
  critical: '✗',
  high: '▲',
  medium: '■',
  low: '○',
  info: '·',
};

export interface RenderOptions {
  color?: boolean;
  unicode?: boolean;
  /** Available columns. Lines are composed to fit rather than being cut. */
  width?: number;
}

/** Width of a string once escape sequences are discounted. */
function visibleLength(text: string): number {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '').length;
}

function paint(text: string, color: string, enabled: boolean): string {
  return enabled ? `${color}${text}${RESET}` : text;
}

/** `["PCI-DSS:8.6.2","DPDP:8"]` → `PCI-DSS 8.6.2 · DPDP §8` */
function formatRefs(refs: readonly string[] | undefined, separator: string): string {
  if (!refs || refs.length === 0) return '';
  return refs
    .map((ref) => {
      const [scheme, clause] = ref.split(':');
      if (!clause) return scheme ?? ref;
      if (scheme === 'DPDP') return `DPDP §${clause}`;
      if (scheme === 'CWE') return `CWE-${clause}`;
      return `${scheme} ${clause}`;
    })
    .join(separator);
}

/**
 * A finding as display lines.
 *
 * With no width constraint (a pipe, a file, grep) this is one line, which keeps
 * the output greppable. With a width it becomes two, because the arithmetic
 * does not work otherwise: at 80 columns the severity, rule id, path and
 * annotation alone total 80 characters, leaving the message negative space. The
 * single-line form was therefore truncating the message to nothing *and* losing
 * the rupee figure off the end.
 *
 *   ✗ CRITICAL  SIR-SEC-001  Hardcoded Stripe secret key
 *      src/config.py:14 · PCI-DSS 8.6.2 · ⚠ VERIFIED LIVE · ₹42,00,000
 *
 * The message gets a whole line, so it is readable; the details get their own,
 * where compliance refs are dropped first if space runs short.
 */
/**
 * The evidence behind one finding: why the rule matched, what it cost, and
 * where that figure came from.
 *
 * Kept separate from the finding line because it is only wanted on demand —
 * the shell hides it behind Ctrl+O. "Why did you flag that, and where did the
 * number come from" should be one keystroke, not a separate command.
 */
export function renderFindingDetail(finding: Finding, options: RenderOptions = {}): string[] {
  const color = options.color ?? false;
  const unicode = options.unicode ?? true;
  const width = options.width && options.width > 20 ? options.width : 80;
  const lines: string[] = [];

  const label = (text: string) => paint(text.padEnd(10), DIM, color);

  if (finding.snippet) {
    lines.push(`      ${label('source')}${paint(`${finding.file}:${finding.line}`, DIM, color)}`);
    lines.push(`      ${label('')}${finding.snippet}`);
  }

  lines.push(`      ${label('rule')}${paint(`${finding.rule_id} · ${finding.category}`, DIM, color)}`);

  if (finding.compliance_ref?.length) {
    lines.push(`      ${label('clauses')}${paint(finding.compliance_ref.join(', '), DIM, color)}`);
  }

  if (finding.money_at_risk_inr) {
    const model = EXPOSURE_MODEL[finding.rule_id];
    lines.push(
      `      ${label('exposure')}${paint(formatInr(finding.money_at_risk_inr), BOLD, color)}` +
        paint(`  — estimate, not a measurement`, DIM, color),
    );
    if (model) {
      for (const [i, chunk] of wrapText(model.basis, width - 18).entries()) {
        lines.push(`      ${label(i === 0 ? 'basis' : '')}${paint(chunk, DIM, color)}`);
      }
      lines.push(`      ${label('anchor')}${paint(model.anchor, DIM, color)}`);
    }
  }

  if (finding.fix_action) {
    lines.push(
      `      ${label('fix')}${paint(finding.fix_action, GREEN, color)}` +
        paint(`   sirius fix ${finding.rule_id}`, DIM, color),
    );
  }

  if (finding.fingerprint) {
    lines.push(`      ${label('id')}${paint(finding.fingerprint.slice(0, 16), DIM, color)}`);
  }

  return lines.concat(unicode ? [''] : ['']);
}

export function renderFinding(finding: Finding, options: RenderOptions = {}): string[] {
  const color = options.color ?? false;
  const unicode = options.unicode ?? true;
  const width = options.width && options.width > 20 ? options.width : 0;

  if (!width) return [renderFindingLine(finding, options)];

  const sep = unicode ? ' · ' : ' | ';
  const glyph = unicode ? GLYPH[finding.severity] : ' ';
  const indent = '   ';

  const head = paint(`${glyph} ${finding.severity.toUpperCase()}`.padEnd(11), SEVERITY_ANSI[finding.severity], color);
  const rule = paint(finding.rule_id.padEnd(12), BOLD, color);

  const headline = `${head} ${rule} ${fit(finding.message, width - 25, unicode)}`;

  const annotations: string[] = [];
  if (finding.validity === 'verified_live') annotations.push(`${unicode ? '⚠ ' : '! '}VERIFIED LIVE`);
  else if (finding.validity === 'inactive') annotations.push('inactive');
  const money = formatInr(finding.money_at_risk_inr);
  if (money) annotations.push(money);

  const annotation =
    annotations.length > 0
      ? paint(
          annotations.join(sep),
          finding.validity === 'verified_live' ? SEVERITY_ANSI.critical : SEVERITY_ANSI[finding.severity],
          color,
        )
      : '';

  const place = paint(`${finding.file}:${finding.line}`, DIM, color);
  const refs = formatRefs(finding.compliance_ref, sep);
  const refsText = refs ? paint(refs, DIM, color) : '';

  const detail = (withRefs: boolean) =>
    indent + [place, withRefs ? refsText : '', annotation].filter((p) => p !== '').join(sep);

  // Refs are the first thing a reader can live without; the money never goes.
  let second = detail(true);
  if (visibleLength(second) > width) second = detail(false);

  return second.trim() ? [headline, second] : [headline];
}

/** Truncates to `max` columns, appending an ellipsis when it has to. */
function fit(text: string, max: number, unicode: boolean): string {
  if (max < 4 || text.length <= max) return text;
  return text.slice(0, max - 1) + (unicode ? '…' : '.');
}

export function renderFindingLine(finding: Finding, options: RenderOptions = {}): string {
  const color = options.color ?? false;
  const unicode = options.unicode ?? true;
  const width = options.width && options.width > 20 ? options.width : 0;
  const sep = unicode ? ' · ' : ' | ';

  const glyph = unicode ? GLYPH[finding.severity] : ' ';
  const severity = `${glyph} ${finding.severity.toUpperCase()}`.padEnd(11);
  const head = paint(severity, SEVERITY_ANSI[finding.severity], color);
  const rule = paint(finding.rule_id.padEnd(12), BOLD, color);
  const location = paint(`${finding.file}:${finding.line}`, DIM, color);

  // The parts that must survive: a live secret and a rupee figure are the
  // findings a person acts on first.
  const annotations: string[] = [];
  if (finding.validity === 'verified_live') annotations.push(`${unicode ? '⚠ ' : '! '}VERIFIED LIVE`);
  else if (finding.validity === 'inactive') annotations.push('inactive');
  const money = formatInr(finding.money_at_risk_inr);
  if (money) annotations.push(money);

  const annotation =
    annotations.length > 0
      ? paint(
          annotations.join(sep),
          finding.validity === 'verified_live' ? SEVERITY_ANSI.critical : SEVERITY_ANSI[finding.severity],
          color,
        )
      : '';

  const refs = formatRefs(finding.compliance_ref, sep);
  const refsText = refs ? paint(refs, DIM, color) : '';

  // Compose widest-first, then shed the least valuable part until it fits.
  const assemble = (message: string, withRefs: boolean, place = location) =>
    [head, rule, place, message, withRefs ? refsText : '', annotation]
      .filter((part) => part !== '')
      .join('  ');

  // No width constraint (a pipe, a file, a test): emit everything.
  if (!width) return assemble(finding.message, true);

  const ellipsis = unicode ? '…' : '.';
  const basename = finding.file.split('/').pop() ?? finding.file;
  const shortPlace = paint(`${basename}:${finding.line}`, DIM, color);

  /**
   * Fits the message into whatever the rest of the layout leaves.
   *
   * Measured with a one-character stand-in rather than an empty string: an empty
   * message is filtered out of the join along with its separator, understating
   * the layout by two columns. That is what let lines overflow, so the terminal
   * truncated the rupee figure off the end — the one thing that must never be
   * cut.
   */
  const fitMessage = (place: string): string | null => {
    const budget = width - (visibleLength(assemble('x', false, place)) - 1);
    if (budget < 4) return null;
    const message =
      budget >= finding.message.length ? finding.message : finding.message.slice(0, budget - 1) + ellipsis;
    return assemble(message, false, place);
  };

  // Shed the least valuable thing first, and stop at the first fit.
  const candidates = [
    assemble(finding.message, true), // everything
    assemble(finding.message, false), // minus compliance refs
    fitMessage(location), // minus part of the message
    fitMessage(shortPlace), // minus the directory path too
    assemble('', false, shortPlace), // severity, rule, file, annotation
  ];

  for (const candidate of candidates) {
    if (candidate !== null && visibleLength(candidate) <= width) return candidate;
  }

  // Narrower than the irreducible line. Keep the glyph and drop the severity
  // word, which is the only remaining redundancy — the colour already says it.
  const terse = [
    paint(glyph, SEVERITY_ANSI[finding.severity], color),
    paint(finding.rule_id, BOLD, color),
    shortPlace,
    annotation,
  ]
    .filter((part) => part !== '')
    .join(' ');

  return terse;
}

export interface PlainReportInput {
  outcome: ScanOutcome;
  gate: GateResult;
  counts: Partial<Record<Severity, number>>;
  /** Set when findings were streamed as they arrived, so only the summary is wanted. */
  findingsAlreadyPrinted?: boolean;
  options?: RenderOptions;
  /** Where the findings came from. Ambiguity here is how a mock passes for a scan. */
  source?: string;
  /** What was scanned, so "what did it even look at?" has an answer on screen. */
  target?: string;
}

/**
 * The findings, most severe first, then by file — deterministic regardless of
 * the order they streamed in.
 *
 * Separate from the report because the threat stage reasons about these
 * findings and has to be printed after them, while the summary is the
 * conclusion and has to be printed after *that*.
 */
export function renderFindingList(
  findings: readonly Finding[],
  options: RenderOptions = {},
): string[] {
  const sorted = [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity);
    if (bySeverity !== 0) return bySeverity;
    return `${a.file}:${a.line}`.localeCompare(`${b.file}:${b.line}`);
  });

  const lines: string[] = [];
  for (const finding of sorted) lines.push(...renderFinding(finding, options));
  return lines;
}


/**
 * Rewrites a path relative to the working directory, or under `~`.
 *
 * `contract/fixtures/chaos-repo` says everything the absolute path does and
 * fits on a line.
 */
function shortenPath(target: string): string {
  const cwd = process.cwd();
  if (target === cwd) return '.';
  if (target.startsWith(cwd + '/')) return target.slice(cwd.length + 1);

  const home = process.env.HOME;
  if (home && target.startsWith(home + '/')) return `~/${target.slice(home.length + 1)}`;
  return target;
}

/** Truncates from the left, keeping the end — for paths, the end is the point. */
function elideLeft(text: string, width: number): string {
  if (text.length <= width) return text;
  return `…${text.slice(text.length - width + 1)}`;
}

export function renderPlainReport({
  outcome,
  gate,
  counts,
  findingsAlreadyPrinted = false,
  options = {},
  source,
  target,
}: PlainReportInput): string {
  const color = options.color ?? false;
  const unicode = options.unicode ?? true;
  const rule = (unicode ? '─' : '-').repeat(Math.min(64, Math.max(24, (options.width ?? 64))));

  const lines: string[] = [];

  if (!findingsAlreadyPrinted) {
    lines.push(...renderFindingList(outcome.findings, options));
  }

  if (outcome.findings.length > 0 || findingsAlreadyPrinted) lines.push('');
  lines.push(paint(rule, DIM, color));

  const counted = [...SEVERITY_ORDER]
    .reverse()
    .filter((severity) => (counts[severity] ?? 0) > 0)
    .map((severity) =>
      paint(`${unicode ? GLYPH[severity] : ''} ${counts[severity]} ${severity}`, SEVERITY_ANSI[severity], color),
    );
  lines.push(` ${paint('Findings'.padEnd(11), DIM, color)}${counted.length > 0 ? counted.join('   ') : 'none'}`);

  const verifiedLive = outcome.findings.filter((f) => f.validity === 'verified_live').length;
  const inactive = outcome.findings.filter((f) => f.validity === 'inactive').length;
  if (verifiedLive + inactive > 0) {
    lines.push(
      ` ${paint('Secrets'.padEnd(11), DIM, color)}` +
        paint(`${verifiedLive} verified-live`, verifiedLive > 0 ? SEVERITY_ANSI.critical : DIM, color) +
        paint(`  ${inactive} inactive`, DIM, color),
    );
  }

  const money = formatInr(outcome.moneyAtRisk);
  const scorePart =
    typeof outcome.complianceScore === 'number'
      ? `${paint('     Compliance', DIM, color)} ${paint(`${formatScore(outcome.complianceScore)}/100`, BOLD, color)}`
      : '';
  if (money || scorePart) {
    lines.push(` ${paint('Money@risk'.padEnd(11), DIM, color)}${paint(money || '—', BOLD, color)}${scorePart}`);
  }

  if (outcome.errors.length > 0) {
    lines.push(` ${paint('Skipped'.padEnd(11), DIM, color)}${paint(`${outcome.errors.length} file(s) unparsed`, DIM, color)}`);
  }

  // Say plainly what was examined and where the findings came from. Without
  // either, a replayed fixture and a real analysis look identical — which is
  // exactly how a mock gets mistaken for a scan.
  if (target) {
    const files = outcome.filesScanned;
    const count = typeof files === 'number' && files > 0 ? `${files} file${files === 1 ? '' : 's'} in ` : '';
    // Elided from the left. An absolute path that runs off the right edge keeps
    // `/Applications/Sanjay/personal/…` and loses the directory that was
    // actually scanned, which is the only part the reader needs.
    const room = Math.max(20, (options.width ?? 64) - 13 - count.length);
    const where = elideLeft(shortenPath(target), room);
    lines.push(` ${paint('Scanned'.padEnd(11), DIM, color)}${paint(`${count}${where}`, DIM, color)}`);
  }
  if (source) {
    lines.push(` ${paint('Source'.padEnd(11), DIM, color)}${paint(source, DIM, color)}`);
  }

  const verdict = gate.blocked ? 'BLOCKED' : 'PASSED';
  lines.push(
    ` ${paint(`Exit ${gate.exitCode}`.padEnd(11), DIM, color)}` +
      paint(gate.predicate, DIM, color) +
      paint(` ${unicode ? '→' : '->'} `, DIM, color) +
      paint(verdict, gate.blocked ? SEVERITY_ANSI.critical : GREEN, color),
  );
  for (const reason of gate.reasons) {
    lines.push(` ${' '.repeat(11)}${paint(`${unicode ? '·' : '-'} ${reason}`, DIM, color)}`);
  }

  lines.push(paint(rule, DIM, color));

  return lines.join('\n') + '\n';
}
