/**
 * How a revenue run looks on a terminal.
 *
 * Same visual language as `scan` — one line per record, box-drawn panels, the
 * rupee figure never dropped — because this is the same product looking at the
 * other half of the problem. `scan` prices money at risk in the code; this
 * prices it in the ledger, and the two should not look like different tools.
 *
 * The evaluation panel is the one that matters, and it is laid out so the
 * uncomfortable numbers are as prominent as the flattering ones: the
 * false-positive bill sits directly under the recovered figure, and the
 * baselines sit under both. A metrics table you have to scroll to reach the
 * caveats of is a metrics table designed to be quoted out of context.
 */

import { formatInr, formatInrCompact } from '../money.js';
import type { Evaluation } from '../revenue/evaluate.js';
import type { BatchContext } from '../revenue/features.js';
import type { Model } from '../revenue/model.js';
import type { AuditEntry } from '../revenue/audit.js';
import type { RecoveryOutcome } from '../revenue/recover.js';
import type { Assessment, RiskRecord } from '../revenue/types.js';

const DIM = '\u001b[38;5;244m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';
const GREEN = '\u001b[38;5;42m';
const RED = '\u001b[38;5;203m';
const AMBER = '\u001b[38;5;215m';
const BLUE = '\u001b[38;5;117m';
const VIOLET = '\u001b[38;5;141m';

export interface RevenueRenderOptions {
  color?: boolean;
  unicode?: boolean;
  width?: number;
}

export interface Palette {
  dim: (text: string) => string;
  bold: (text: string) => string;
  green: (text: string) => string;
  red: (text: string) => string;
  amber: (text: string) => string;
  blue: (text: string) => string;
  violet: (text: string) => string;
  rupee: (paise: number) => string;
  hr: string;
  bar: (fraction: number, width: number) => string;
  glyph: (name: GlyphName) => string;
  width: number;
}

type GlyphName = 'flag' | 'hold' | 'skip' | 'check' | 'cross' | 'arrow' | 'bullet' | 'warn';

const UNICODE: Record<GlyphName, string> = {
  flag: '◆',
  hold: '⏸',
  skip: '·',
  check: '✓',
  cross: '✗',
  arrow: '→',
  bullet: '•',
  warn: '⚠',
};

const ASCII: Record<GlyphName, string> = {
  flag: '*',
  hold: '=',
  skip: '.',
  check: '+',
  cross: 'x',
  arrow: '->',
  bullet: '-',
  warn: '!',
};

export function paletteFor(options: RevenueRenderOptions = {}): Palette {
  const color = options.color ?? false;
  const unicode = options.unicode ?? false;
  const width = Math.max(60, Math.min(options.width ?? 96, 110));
  const paint = (code: string) => (text: string) => (color ? `${code}${text}${RESET}` : text);
  const glyphs = unicode ? UNICODE : ASCII;

  return {
    dim: paint(DIM),
    bold: paint(BOLD),
    green: paint(GREEN),
    red: paint(RED),
    amber: paint(AMBER),
    blue: paint(BLUE),
    violet: paint(VIOLET),
    rupee: (paise: number) => {
      const rupees = paise / 100;
      const text = formatInr(Math.round(rupees));
      return unicode ? text : text.replace('₹', 'Rs.');
    },
    hr: (unicode ? '─' : '-').repeat(width),
    bar: (fraction: number, barWidth: number) => {
      const filled = Math.max(0, Math.min(barWidth, Math.round(fraction * barWidth)));
      const full = unicode ? '█' : '#';
      const empty = unicode ? '░' : '.';
      return full.repeat(filled) + empty.repeat(barWidth - filled);
    },
    glyph: (name) => glyphs[name],
    width,
  };
}

/** One record, one line. The money and the reason are never the parts dropped. */
export function renderAssessment(
  assessment: Assessment,
  record: RiskRecord,
  palette: Palette,
): string {
  const held = assessment.evidence[0]?.feature === 'hold';
  const mark = held
    ? palette.amber(palette.glyph('hold'))
    : assessment.flagged
      ? palette.violet(palette.glyph('flag'))
      : palette.dim(palette.glyph('skip'));

  const score = held
    ? palette.amber('hold')
    : assessment.flagged
      ? palette.bold(String(assessment.score).padStart(3))
      : palette.dim(String(assessment.score).padStart(3));

  const money = palette.rupee(assessment.amount_paise).padStart(12);
  const reason = held
    ? (assessment.evidence[0]?.detail ?? '')
    : describe(record);

  const id = assessment.record_id.padEnd(11);
  const line = `  ${mark} ${score}  ${id} ${money}  ${palette.dim(reason)}`;
  return line;
}

/** The record in one phrase: what it is and why it is here. */
function describe(record: RiskRecord): string {
  if (record.kind === 'payment') {
    return `${record.rail} ${record.failure_code} · attempt ${record.attempts} · ${record.psp}`;
  }
  if (record.kind === 'checkout') {
    return `abandoned at ${record.drop_off_stage}`;
  }
  return `${record.days_overdue}d overdue${record.broken_promises ? ` · ${record.broken_promises} broken promise(s)` : ''}${
    record.promise_to_pay_at ? ' · PTP on file' : ''
  }`;
}

/** The diagnosis: what the batch looks like as a whole rather than record by record. */
export function renderIncidents(context: BatchContext, palette: Palette): string {
  if (context.degradations.length === 0 && context.rings.length === 0) return '';

  const lines: string[] = ['', palette.bold('  DIAGNOSIS'), ''];

  for (const degradation of context.degradations) {
    lines.push(
      `  ${palette.amber(palette.glyph('warn'))} ${palette.bold('gateway degradation')}  ` +
        `${degradation.psp} ${palette.dim('/')} ${degradation.rail}`,
    );
    lines.push(
      `      ${degradation.failures} failures in 30 min ${palette.dim(`(${degradation.lift}× this cell's own rate)`)} · ` +
        palette.bold(palette.rupee(degradation.amount_paise)),
    );
    lines.push(
      `      ${palette.dim(`${clock(degradation.from)}–${clock(degradation.to)}`)} ` +
        `${palette.glyph('arrow')} ${palette.green('these are worth retrying on another rail, not chasing the customer')}`,
    );
    lines.push('');
  }

  for (const ring of context.rings) {
    lines.push(
      `  ${palette.red(palette.glyph('warn'))} ${palette.bold('shared-signal cluster')}  ` +
        `${ring.members} records, ${ring.distinct_parties} parties, one ${ring.shared}`,
    );
    lines.push(
      `      ${palette.dim(ring.value)} · ${palette.bold(palette.rupee(ring.amount_paise))} ` +
        `${palette.glyph('arrow')} ${palette.amber('held for review — never auto-retried')}`,
    );
    lines.push('');
  }

  return lines.join('\n');
}

/** The evaluation panel: the numbers, including the ones that hurt. */
export function renderEvaluation(evaluation: Evaluation, model: Model, palette: Palette): string {
  const { matrix, cost } = evaluation;
  const lines: string[] = [];
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  lines.push('');
  lines.push(palette.hr);
  lines.push(
    ` ${palette.bold('HELD-OUT EVALUATION')}   ${palette.dim(
      `${evaluation.records} records · split=${evaluation.split} · threshold ${evaluation.threshold}`,
    )}`,
  );
  lines.push(palette.hr);
  lines.push('');
  lines.push(
    palette.dim(
      `  target: money that comes back BECAUSE the agent acted (recoverable and not self-healing).`,
    ),
  );
  lines.push(
    palette.dim(`  the model was fitted on ${model.trained_on} training records and has never seen these.`),
  );
  lines.push('');

  // ---- confusion matrix
  const cell = (n: number) => String(n).padStart(5);
  lines.push(`  ${palette.dim('                 acted        left alone')}`);
  lines.push(
    `  ${palette.dim('recoverable  ')}${palette.green(cell(matrix.true_positive))}  ${palette.dim('hit ')}   ` +
      `${palette.red(cell(matrix.false_negative))}  ${palette.dim('missed')}`,
  );
  lines.push(
    `  ${palette.dim('would not    ')}${palette.amber(cell(matrix.false_positive))}  ${palette.dim('wasted')}   ` +
      `${palette.dim(cell(matrix.true_negative))}  ${palette.dim('correctly ignored')}`,
  );
  lines.push('');

  // ---- headline metrics with bars
  const metric = (label: string, value: number, note: string) =>
    `  ${label.padEnd(18)}${palette.bold(pct(value).padStart(6))}  ${palette.violet(
      palette.bar(value, 24),
    )}  ${palette.dim(note)}`;

  lines.push(metric('precision', evaluation.precision, 'of what it acted on, this much needed it'));
  lines.push(metric('recall', evaluation.recall, 'of what needed acting on, it found this much'));
  lines.push(metric('F1', evaluation.f1, 'the usual harmonic mean, for comparison'));
  lines.push('');
  lines.push(
    metric('precision (₹)', evaluation.money_precision, 'the same, weighted by rupees rather than rows'),
  );
  lines.push(metric('recall (₹)', evaluation.money_recall, 'of the recoverable money, this much was flagged'));
  lines.push('');

  // ---- the bill
  lines.push(`  ${palette.bold('WHAT IT COST')}`);
  lines.push(
    `    ${palette.green('recovered')}          ${palette.bold(palette.rupee(cost.recovered_paise).padStart(14))}`,
  );
  lines.push(
    `    ${palette.dim('spent on hits')}      ${palette.dim(('-' + palette.rupee(cost.spent_on_hits_paise)).padStart(14))}`,
  );
  lines.push(
    `    ${palette.amber('spent on misses')}    ${palette.amber(('-' + palette.rupee(cost.spent_on_misses_paise)).padStart(14))}  ` +
      palette.dim('the false-positive bill'),
  );
  lines.push(
    `    ${palette.amber('annoyance')}          ${palette.amber(('-' + palette.rupee(cost.annoyance_paise)).padStart(14))}  ` +
      palette.dim('charged for chasing people who would have paid anyway'),
  );
  lines.push(`    ${palette.dim('─'.repeat(46))}`);
  lines.push(
    `    ${palette.bold('net')}                ${(cost.net_paise >= 0 ? palette.green : palette.red)(
      palette.bold(palette.rupee(cost.net_paise).padStart(14)),
    )}`,
  );
  lines.push(
    `    ${palette.dim('forgone')}            ${palette.dim(palette.rupee(cost.forgone_paise).padStart(14))}  ` +
      palette.dim('recoverable money it decided not to chase'),
  );
  lines.push('');

  // ---- baselines, matched on capacity
  lines.push(
    `  ${palette.bold('AGAINST THE ALTERNATIVES')}   ${palette.dim(
      `net rupees, same records, same costs, same room to act (${evaluation.capacity.max_actions} interventions)`,
    )}`,
  );

  const best = Math.max(
    cost.net_paise,
    ...evaluation.baselines.filter((b) => !b.over_capacity).map((b) => b.cost.net_paise),
  );

  const row = (
    name: string,
    net: number,
    flagged: number,
    note: string,
    options: { self?: boolean; over?: boolean; harm?: number } = {},
  ) => {
    const paint = options.self
      ? palette.green
      : options.over
        ? palette.dim
        : net >= best
          ? palette.amber
          : palette.dim;
    const marker = options.self ? palette.violet(palette.glyph('arrow')) : ' ';
    const count = options.over ? `${flagged} acted on — over capacity` : `${flagged} acted on`;
    const harm =
      options.harm === undefined
        ? ''
        : options.harm === 0
          ? palette.green(`  ${palette.glyph('check')} touched none it must not`)
          : palette.red(`  ${palette.glyph('cross')} touched ${options.harm} it must not`);
    return `   ${marker} ${name.padEnd(19)}${paint(palette.bold(palette.rupee(net).padStart(13)))}${harm}  ${palette.dim(
      `${count} · ${note}`,
    )}`;
  };

  for (const baseline of evaluation.baselines) {
    lines.push(
      row(baseline.name, baseline.cost.net_paise, baseline.flagged, baseline.note, {
        over: baseline.over_capacity,
        harm: baseline.harmful_touches,
      }),
    );
    if (baseline.name === 'newest first') {
      lines.push(
        row(
          'this detector',
          cost.net_paise,
          matrix.true_positive + matrix.false_positive,
          shareOfCeiling(cost.net_paise, evaluation),
          { self: true, harm: evaluation.forbidden.touched },
        ),
      );
    }
  }
  lines.push('');
  lines.push(
    palette.dim(
      `    ${evaluation.forbidden.in_population} records in this split are out of bounds — open disputes, ` +
        `issuer risk blocks,\n    and shared-signal clusters. They are not low-value records to be traded ` +
        `off; they are\n    outside the trade, and the count above is how often each policy forgot that.`,
    ),
  );
  lines.push('');

  // ---- calibration
  lines.push(
    `  ${palette.bold('CALIBRATION')}   ${palette.dim(
      `does a score of 70 mean 70%? mean gap ${pct(evaluation.calibration_error)}`,
    )}`,
  );
  for (const bin of evaluation.calibration) {
    const gap = bin.actual - bin.predicted;
    const arrow = Math.abs(gap) < 0.05 ? palette.green(palette.glyph('check')) : palette.amber(palette.glyph('warn'));
    lines.push(
      `    ${String(bin.from).padStart(3)}–${String(bin.to).padEnd(3)} ${palette.dim(
        `n=${String(bin.count).padEnd(4)}`,
      )} said ${pct(bin.predicted).padStart(6)}  was ${pct(bin.actual).padStart(6)}  ${arrow} ${palette.dim(
        `${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}pp`,
      )}`,
    );
  }
  lines.push('');

  // ---- the curve
  lines.push(`  ${palette.bold('OPERATING POINTS')}   ${palette.dim('precision / recall / net, by threshold')}`);
  for (const point of evaluation.curve.filter((p) => p.threshold % 10 === 0 && p.threshold > 0 && p.threshold < 100)) {
    const chosen = Math.abs(point.threshold - evaluation.threshold) <= 5;
    const label = `    ${chosen ? palette.violet(palette.glyph('arrow')) : ' '} ${String(point.threshold).padStart(3)}`;
    lines.push(
      `${label}  ${palette.violet(palette.bar(point.precision, 14))} ${pct(point.precision).padStart(6)}  ` +
        `${palette.blue(palette.bar(point.recall, 14))} ${pct(point.recall).padStart(6)}  ` +
        `${(point.net_paise >= 0 ? palette.green : palette.red)(palette.rupee(point.net_paise).padStart(13))}`,
    );
  }
  lines.push('');
  lines.push(
    palette.dim(
      `  the operating threshold (${model.threshold}) was chosen on the training split alone: ${model.threshold_rule}`,
    ),
  );
  lines.push('');

  return lines.join('\n');
}

/** Where the detector sits between doing nothing and perfect foresight. */
function shareOfCeiling(net: number, evaluation: Evaluation): string {
  const ceiling = evaluation.baselines.find((b) => b.name === 'perfect foresight')?.cost.net_paise ?? 0;
  const heuristic = Math.max(
    ...evaluation.baselines
      .filter((b) => b.name === 'biggest first' || b.name === 'newest first')
      .map((b) => b.cost.net_paise),
    0,
  );

  const share = ceiling > 0 ? `${Math.round((net / ceiling) * 100)}% of what was reachable` : 'nothing was reachable';
  const delta = net - heuristic;
  const versus =
    delta === 0
      ? 'level with the heuristics'
      : `${formatInrCompact(Math.abs(delta) / 100)} ${delta > 0 ? 'ahead of' : 'behind'} the best heuristic`;

  return `${share} · ${versus}`;
}

function clock(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * The recovery run: the timeline, the money, and everything that was refused.
 *
 * The refusals get as much room as the recoveries. A recovery agent's most
 * important property is not what it manages to collect — it is that it stopped
 * where it was supposed to stop, and the only way to show that is to print it.
 */
export function renderRecovery(
  outcome: RecoveryOutcome,
  rules: Record<string, { says: string; basis: string }>,
  palette: Palette,
  trailPath?: string,
): string {
  const lines: string[] = [];
  const pct = (value: number, of: number) => (of === 0 ? '—' : `${Math.round((value / of) * 100)}%`);

  lines.push('');
  lines.push(palette.hr);
  lines.push(
    ` ${palette.bold('RECOVERY RUN')}   ${palette.dim(
      `${outcome.records_considered} records considered · ${outcome.records_worked} worked · ` +
        `${outcome.actions_executed} actions · simulated`,
    )}`,
  );
  lines.push(palette.hr);
  lines.push('');

  // ---- the money, as a waterfall from what was at stake to what was kept
  const rows: [string, number, string][] = [
    ['at risk', outcome.at_risk_paise, 'the money these records represent'],
    ['recovered', outcome.recovered_paise, 'came back during the run'],
    [
      'would have anyway',
      -(outcome.recovered_paise - outcome.attributable_paise),
      'the same records recover this much untouched',
    ],
    ['attributable', outcome.attributable_paise, 'recovered because the agent acted'],
    ['spent', -outcome.spent_paise, 'retries, messages and review time'],
    ['net', outcome.net_paise, 'attributable less what it cost'],
  ];

  for (const [label, value, note] of rows) {
    const emphasis = label === 'net' || label === 'attributable';
    const paint = value < 0 ? palette.amber : emphasis ? palette.green : palette.bold;
    const text = `${value < 0 ? '-' : ''}${palette.rupee(Math.abs(value))}`;
    lines.push(
      `  ${palette.dim(label.padEnd(20))}${paint(emphasis ? palette.bold(text.padStart(14)) : text.padStart(14))}  ` +
        palette.dim(note),
    );
    if (label === 'would have anyway' || label === 'spent') {
      lines.push(`  ${palette.dim('─'.repeat(36))}`);
    }
  }

  lines.push('');
  lines.push(
    `  ${palette.dim('with no agent at all, these records return')} ${palette.bold(
      palette.rupee(outcome.counterfactual_paise),
    )}${palette.dim('.')}`,
  );
  lines.push('');

  // ---- what worked
  const actions = Object.entries(outcome.by_action).sort((a, b) => b[1].recovered_paise - a[1].recovered_paise);
  if (actions.length > 0) {
    lines.push(`  ${palette.bold('WHAT IT DID')}   ${palette.dim('and how often it worked')}`);
    for (const [action, tally] of actions) {
      const rate = tally.used === 0 ? 0 : tally.worked / tally.used;
      lines.push(
        `    ${action.padEnd(24)}${palette.dim(String(tally.used).padStart(4))} used  ` +
          `${palette.violet(palette.bar(rate, 12))} ${pct(tally.worked, tally.used).padStart(4)}  ` +
          `${palette.green(palette.rupee(tally.recovered_paise).padStart(13))}`,
      );
    }
    lines.push('');
  }

  // ---- what it refused to do
  const blocked = Object.entries(outcome.blocked_by).sort((a, b) => b[1] - a[1]);
  if (blocked.length > 0) {
    lines.push(
      `  ${palette.bold('WHERE IT STOPPED')}   ${palette.dim(
        `${outcome.actions_blocked} proposed actions were refused by a rule`,
      )}`,
    );
    for (const [id, count] of blocked) {
      const rule = rules[id];
      lines.push(
        `    ${palette.amber(String(count).padStart(4))}  ${palette.bold(id.padEnd(20))}${palette.dim(
          rule?.says ?? '',
        )}`,
      );
      if (rule?.basis) lines.push(`          ${palette.dim(rule.basis)}`);
    }
    lines.push('');
  }

  if (outcome.halted) {
    lines.push(`  ${palette.red(palette.glyph('warn'))} ${palette.bold('run halted')} — ${outcome.halted}`);
    lines.push('');
  }

  if (trailPath) {
    lines.push(
      palette.dim(
        `  Every decision above — taken, refused and skipped — is in ${trailPath},\n` +
          `  hash-chained and signed. Check it with:  sirius revenue audit --verify <file>\n`,
      ),
    );
  }

  return lines.join('\n');
}

/**
 * The recovery run as a timeline, one line per decision.
 *
 * The summary panel says what happened; this says it *happening*, which is a
 * different thing to watch. It is also where the refusals stop being a count in
 * a table and become the thing on screen — a message not sent at midnight, a
 * fourth re-presentment declined — which is the argument the whole surface is
 * making.
 *
 * Skipped records are left out. There are three hundred of them, they are all
 * "considered and left alone", and they belong in the trail rather than on a
 * screen somebody is reading in real time.
 */
export function renderRecoveryLog(
  entries: readonly AuditEntry[],
  palette: Palette,
  limit = 120,
): string[] {
  const lines: string[] = [];

  for (const entry of entries) {
    if (entry.disposition === 'skipped') continue;
    if (lines.length >= limit) break;

    const clock = entry.at.slice(11, 16);
    const id = entry.record_id.padEnd(12);
    const action = entry.action.padEnd(22);

    if (entry.disposition === 'executed') {
      const recovered = entry.recovered_paise ?? 0;
      lines.push(
        `  ${palette.dim(clock)}  ${id}${palette.violet(action)}` +
          (recovered > 0
            ? `${palette.green(palette.glyph('check'))} ${palette.green(palette.rupee(recovered))}`
            : `${palette.dim(palette.glyph('skip'))} ${palette.dim('no recovery')}`),
      );
      continue;
    }

    lines.push(
      `  ${palette.dim(clock)}  ${id}${palette.amber(action)}` +
        `${palette.amber(palette.glyph('hold'))} ${palette.amber(entry.rule_id ?? 'blocked')} ` +
        palette.dim(`— ${entry.detail ?? ''}`),
    );
  }

  return lines;
}
