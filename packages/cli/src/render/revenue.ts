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
import type { CapacityPoint, Evaluation } from '../revenue/evaluate.js';
import type { StressReport } from '../revenue/stress.js';
import { note, padVisible, table, truncate, visibleWidth, plural } from '../ui/kit.js';
import type { BatchContext } from '../revenue/features.js';
import type { Model } from '../revenue/model.js';
import type { AuditEntry } from '../revenue/audit.js';
import type { RecoveryOutcome } from '../revenue/recover.js';
import type { SummaryChange } from '../revenue/pipeline.js';
import type { Delta, SweepSummary } from '../revenue/sweep.js';
import type { Assessment, Intervention, RiskRecord } from '../revenue/types.js';

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
      // Rounded to the rupee, an SMS costs "₹0" — which reads as free, and free
      // is the one thing an intervention is not. So a small amount that is not
      // a whole number of rupees keeps its paise. Everything else is grouped and
      // whole: nobody reading a lakh figure wants two decimals, and a ₹49
      // record should not sprout them just because a ₹0.18 cost needs them.
      const fractional = Math.abs(rupees % 1) > 1e-9;
      const text =
        fractional && Math.abs(rupees) < 100 ? `₹${rupees.toFixed(2)}` : formatInr(Math.round(rupees));
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

  // The column the list is actually sorted by.
  //
  // Records are ranked on expected recovery — score × amount × recovery share —
  // and it appeared nowhere on screen. Neither visible column was monotonic
  // (67, 46, 55, 41 … / ₹3.25L, ₹1.40L, ₹1.08L, ₹1.41L), so to anyone seeing it
  // for the first time the list looked scrambled, on the beat where the ranking
  // *is* the argument. A sort key the reader cannot see is indistinguishable
  // from no sort at all.
  const expected = held ? padVisible('', 11) : palette.dim(palette.rupee(assessment.expected_recovery_paise).padStart(11));

  const reason = held
    ? (assessment.evidence[0]?.detail ?? '')
    : describe(record);

  const id = padVisible(assessment.record_id, 11);
  // The reason is the only variable-length part of the row, so it is the part
  // that gives way. A held record's explanation is a full sentence and ran the
  // line to 118 columns; on a narrow terminal that wraps into the next record
  // and the stream stops looking like a stream.
  const head = `  ${mark} ${score}  ${id} ${money} ${expected}  `;
  return head + palette.dim(truncate(reason, Math.max(0, palette.width - visibleWidth(head))));
}

/**
 * The header for the assessment rows.
 *
 * There were no column headers at all: an unlabelled leading number sat three
 * words from `room for 67` in the line above, and the first row's score was
 * also 67 — two unrelated 67s that read as one.
 */
export function assessmentHeader(palette: Palette): string {
  // Built from the same widths as the row above it, in the same order: two
  // spaces, the mark, a space and a three-wide score come to seven columns, so
  // `  SCORE` sits exactly over them. A header that is close but not aligned is
  // worse than none — it makes the reader distrust the columns that *are*
  // right.
  const head =
    `  SCORE  ${padVisible('RECORD', 11)} ${'AMOUNT'.padStart(12)} ${'EXPECTED'.padStart(11)}  WHY`;
  return palette.dim(truncate(head, palette.width));
}

/** The record in one phrase: what it is and why it is here. */
function describe(record: RiskRecord): string {
  if (record.kind === 'payment') {
    return `${record.rail} ${record.failure_code} · attempt ${record.attempts} · ${record.psp}`;
  }
  if (record.kind === 'checkout') {
    return `abandoned at ${record.drop_off_stage}`;
  }
  return `${record.days_overdue}d overdue${record.broken_promises ? ` · ${plural(record.broken_promises, 'broken promise')}` : ''}${
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
        `${palette.glyph('arrow')} ${palette.green(truncate('these are worth retrying on another rail, not chasing the customer', Math.max(0, palette.width - 26)))}`,
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
export function renderEvaluation(
  evaluation: Evaluation,
  model: Model,
  palette: Palette,
  capacity: readonly CapacityPoint[] = [],
): string {
  /** Room left for the sentence beside a money column, once the money has it. */
  const gloss = Math.max(0, palette.width - 41);

  /** Prose, wrapped to the terminal rather than trusting it to be wide. */
  const prose = (text: string, indent = 4): string[] =>
    note(text, { indent, width: palette.width }).map((line) => palette.dim(line));

  const { matrix, cost } = evaluation;
  const lines: string[] = [];
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  lines.push('');
  lines.push(palette.hr);
  lines.push(
    ` ${palette.bold('HELD-OUT EVALUATION')}${palette.dim(
      truncate(
        `   ${evaluation.records} records · split=${evaluation.split} · threshold ${evaluation.threshold}`,
        Math.max(0, palette.width - 21),
      ),
    )}`,
  );
  lines.push(palette.hr);
  lines.push('');
  lines.push(
    palette.dim(
      `  target: money that comes back BECAUSE the agent acted`,
    ),
  );
  lines.push(
    ...prose(`the model was fitted on ${model.trained_on} training records and has never seen these.`, 2),
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
  //
  // The bar is fixed at 24 columns and the label at 18, so the trailing
  // sentence decides the line's length — and these ran past a hundred columns.
  // The bar narrows on a narrow terminal and the sentence is what gets cut,
  // because a meter you can read and a number you can read are the point; the
  // gloss beside them is not.
  const barWidth = Math.max(10, Math.min(24, palette.width - 56));
  const metric = (label: string, value: number, gloss: string) => {
    const head = `  ${padVisible(label, 18)}${palette.bold(padVisible(pct(value), 6, 'right'))}  ${palette.violet(
      palette.bar(value, barWidth),
    )}  `;
    return head + palette.dim(truncate(gloss, Math.max(0, palette.width - visibleWidth(head))));
  };

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
      palette.dim(truncate('the false-positive bill', gloss)),
  );
  lines.push(
    `    ${palette.amber('annoyance')}          ${palette.amber(('-' + palette.rupee(cost.annoyance_paise)).padStart(14))}  ` +
      palette.dim(truncate('charged for chasing people who would have paid anyway', gloss)),
  );
  lines.push(`    ${palette.dim('─'.repeat(46))}`);
  lines.push(
    `    ${palette.bold('net')}                ${(cost.net_paise >= 0 ? palette.green : palette.red)(
      palette.bold(palette.rupee(cost.net_paise).padStart(14)),
    )}`,
  );
  lines.push(
    `    ${palette.dim('forgone')}            ${palette.dim(palette.rupee(cost.forgone_paise).padStart(14))}  ` +
      palette.dim(truncate('recoverable money it decided not to chase', gloss)),
  );
  lines.push('');

  // ---- baselines, matched on capacity
  lines.push(
    `  ${palette.bold('AGAINST THE ALTERNATIVES')}`,
  );
  lines.push(
    ...note(
      `same records, same costs, same room to act (${evaluation.capacity.max_actions} interventions)`,
      { indent: 2, width: palette.width },
    ).map((line) => palette.dim(line)),
  );
  lines.push('');

  const best = Math.max(
    cost.net_paise,
    ...evaluation.baselines.filter((b) => b.feasible).map((b) => b.cost.net_paise),
  );


  // Laid out as a table rather than assembled per row.
  //
  // Every row used to carry its own explanation on the same line, which put the
  // longest one at 176 columns — the numbers a reader came for pushed off the
  // right edge of the terminal by the sentence explaining them. The notes now
  // sit under their row, wrapped to the terminal, and the money column is
  // never the thing that gives way.
  interface Row {
    marker: string;
    name: string;
    money: string;
    touched: string;
    acted: string;
    notes: string[];
    self?: boolean;
  }

  const collected: Row[] = [];

  const touchedCell = (harm: number): string =>
    harm === 0
      ? palette.green(`${palette.glyph('check')} none`)
      : palette.red(`${palette.glyph('cross')} ${harm}`);

  for (const baseline of evaluation.baselines) {
    const feasible = baseline.feasible;
    const paint = feasible ? (baseline.cost.net_paise >= best ? palette.amber : palette.dim) : palette.dim;

    collected.push({
      marker: ' ',
      name: feasible ? baseline.name : palette.dim(baseline.name),
      money: feasible
        ? paint(palette.bold(palette.rupee(baseline.cost.net_paise)))
        : palette.dim(palette.bold('INFEASIBLE')),
      touched: touchedCell(baseline.harmful_touches),
      // The reason a policy does not fit is a sentence, and a sentence in a
      // column is what squeezed the names into ellipses. It belongs in the
      // notes with the rest of the prose.
      acted: feasible ? String(baseline.flagged) : palette.dim('—'),
      notes: feasible
        ? [baseline.note]
        : [
            `${baseline.infeasible_because ?? 'over capacity'} — ${baseline.note}`,
            `${palette.rupee(baseline.cost.net_paise)} is what it would net if those limits did not exist`,
          ],
    });

    if (baseline.name === 'newest first') {
      collected.push({
        marker: palette.violet(palette.glyph('arrow')),
        name: palette.violet('this detector'),
        money: palette.green(palette.bold(palette.rupee(cost.net_paise))),
        touched: touchedCell(evaluation.forbidden.touched),
        acted: String(matrix.true_positive + matrix.false_positive),
        notes: [shareOfCeiling(cost.net_paise, evaluation)],
        self: true,
      });
    }
  }

  const rendered = table(
    [
      { header: '' },
      { header: 'POLICY', flex: true, min: 14 },
      { header: 'NET', align: 'right' },
      { header: 'OUT OF BOUNDS' },
      { header: 'ACTED ON' },
    ],
    collected.map((row) => [row.marker, row.name, row.money, row.touched, row.acted]),
    { indent: 3, width: palette.width, header: palette.dim },
  );

  // The header line, then each row followed by its own notes.
  lines.push(rendered[0] as string);
  collected.forEach((row, index) => {
    lines.push(rendered[index + 1] as string);
    for (const text of row.notes) {
      // Hung two columns under the policy name, so a note reads as belonging to
      // the row above rather than as another row.
      for (const wrapped of note(text, { indent: 9, width: palette.width })) {
        lines.push(palette.dim(wrapped));
      }
    }
  });

  lines.push('');
  lines.push(
    ...prose(
      `${evaluation.forbidden.in_population} records in this split are out of bounds — open disputes, ` +
        `issuer risk blocks, and shared-signal clusters. They are not low-value records to be traded ` +
        `off; they are outside the trade, and the count above is how often each policy forgot that.`,
    ),
  );
  lines.push('');

  // ---- how the edge moves with capacity
  if (capacity.length > 0) {
    lines.push(
      `  ${palette.bold('AND HOW MUCH ROOM THERE IS TO ACT')}`,
    );
    lines.push(...prose('the same detector and the same batch, against the best heuristic a team could actually run', 2));
    lines.push('');

    const rows = capacity.map((point) => {
      const edge = `${point.edge >= 0 ? '+' : ''}${(point.edge * 100).toFixed(1)}%`;
      const paint = point.edge >= 0.05 ? palette.green : point.edge > 0 ? palette.amber : palette.red;
      return [
        `${Math.round(point.share * 100)}%`,
        palette.dim(`${point.acted_on}/${point.max_actions}`),
        paint(palette.bold(edge)),
        palette.dim(point.best_runnable),
        point.heuristic_forbidden_touched > 0
          ? palette.red(`${palette.glyph('cross')} ${point.heuristic_forbidden_touched}`)
          : palette.dim(palette.glyph('skip')),
      ];
    });

    lines.push(
      ...table(
        [
          { header: 'CAPACITY', align: 'right' },
          { header: 'USED', align: 'right' },
          { header: 'EDGE', align: 'right' },
          { header: 'VERSUS', flex: true, min: 12 },
          { header: 'ITS BREACHES', align: 'right' },
        ],
        rows,
        { indent: 5, width: palette.width, header: palette.dim },
      ),
    );

    lines.push('');
    lines.push(
      ...prose(
        'With room to work a fifth of the batch you can afford to be roughly right — sorting by ' +
          'amount collects most of the money by accident. The tighter capacity gets, the more every ' +
          'one of the few actions has to be the right one, and that is what the model is for.',
      ),
    );
    lines.push('');
    lines.push(
      ...prose(
        'This is one batch, so read it as an anecdote: on a single seed the edge is often zero, ' +
          'because at tight capacity the highest expected value and the largest amount are frequently ' +
          'the same records. Across eight seeds the mean is +22.9% at 3% and +1.5% at 20%. ' +
          '`sirius revenue sweep --capacity-share 0.03` is that measurement.',
      ),
    );
    lines.push('');
  }

  // ---- calibration
  lines.push(
    `  ${palette.bold('CALIBRATION')}   ${palette.dim(
      `does a score of 70 mean 70%? mean gap ${pct(evaluation.calibration_error)}`,
    )}`,
  );
  for (const bin of evaluation.calibration) {
    const gap = bin.actual - bin.predicted;
    // A thin bin gets no verdict at all. The top of a scorecard is always
    // sparse, and one record that happened to come back reads as "said 88%, was
    // 100%" — which this used to flag exactly like a real miss on a hundred.
    const change = `${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}pp`;
    const verdict = !bin.enough
      ? palette.dim(`${palette.glyph('skip')} too few to say`)
      : Math.abs(gap) < 0.05
        ? `${palette.green(palette.glyph('check'))} ${palette.dim(change)}`
        : `${palette.amber(palette.glyph('warn'))} ${palette.dim(change)}`;

    const row =
      `    ${String(bin.from).padStart(3)}–${String(bin.to).padEnd(3)} ${palette.dim(
        `n=${String(bin.count).padEnd(4)}`,
      )} said ${pct(bin.predicted).padStart(6)}  was ${pct(bin.actual).padStart(6)}  `;

    lines.push((bin.enough ? row : palette.dim(row)) + verdict);
  }

  if (evaluation.calibration_warning) {
    lines.push('');
    // Wrapped, not one long line. This warning is the longest sentence the
    // evaluation prints and it ran to 177 columns, which on a projector is the
    // caveat scrolling off the edge of the claim it qualifies.
    const warning = note(evaluation.calibration_warning, { indent: 6, width: palette.width });
    lines.push(`    ${palette.amber(palette.glyph('warn'))} ${palette.amber(warning[0]?.trimStart() ?? '')}`);
    for (const line of warning.slice(1)) lines.push(palette.amber(line));
  }
  lines.push('');

  // ---- the curve
  lines.push(`  ${palette.bold('OPERATING POINTS')}   ${palette.dim('precision / recall / net, by threshold')}`);
  for (const point of evaluation.curve.filter((p) => p.threshold % 10 === 0 && p.threshold > 0 && p.threshold < 100)) {
    const chosen = Math.abs(point.threshold - evaluation.threshold) <= 5;
    const label = `    ${chosen ? palette.violet(palette.glyph('arrow')) : ' '} ${String(point.threshold).padStart(3)}`;
    // Two bars at a fixed fourteen columns, plus their percentages and a rupee
    // figure, is seventy columns before the label — wider than a narrow
    // terminal and unreadable the moment it wraps. They share what is left.
    const bars = Math.max(6, Math.floor((palette.width - 44) / 2));
    lines.push(
      `${label}  ${palette.violet(palette.bar(point.precision, bars))} ${pct(point.precision).padStart(6)}  ` +
        `${palette.blue(palette.bar(point.recall, bars))} ${pct(point.recall).padStart(6)}  ` +
        `${(point.net_paise >= 0 ? palette.green : palette.red)(padVisible(palette.rupee(point.net_paise), 13, 'right'))}`,
    );
  }
  lines.push('');
  lines.push(
    palette.dim(
      prose(
        `the operating threshold (${model.threshold}) was chosen on the training split alone: ${model.threshold_rule}`,
        2,
      ).join('\n'),
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

  for (const [label, value, gloss] of rows) {
    const emphasis = label === 'net' || label === 'attributable';
    const paint = value < 0 ? palette.amber : emphasis ? palette.green : palette.bold;
    const text = `${value < 0 ? '-' : ''}${palette.rupee(Math.abs(value))}`;
    const head = `  ${palette.dim(padVisible(label, 20))}${paint(
      emphasis ? palette.bold(padVisible(text, 14, 'right')) : padVisible(text, 14, 'right'),
    )}  `;
    lines.push(head + palette.dim(truncate(gloss, Math.max(0, palette.width - visibleWidth(head)))));
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
        `    ${palette.amber(padVisible(String(count), 4, 'right'))}  ${palette.bold(padVisible(id, 20))}` +
          palette.dim(truncate(rule?.says ?? '', Math.max(0, palette.width - 30))),
      );
      if (rule?.basis) {
        for (const line of note(rule.basis, { indent: 10, width: palette.width })) {
          lines.push(palette.dim(line));
        }
      }
    }
    lines.push('');
  }

  if (outcome.halted) {
    lines.push(`  ${palette.red(palette.glyph('warn'))} ${palette.bold('run halted')} — ${outcome.halted}`);
    lines.push('');
  }

  if (trailPath) {
    // The path is absolute and can be any length — under a temp directory it
    // alone was 150 columns, which put the sentence explaining the audit trail
    // out past the right edge of every terminal that will ever run this.
    lines.push(
      ...note(`Every decision above — taken, refused and skipped — is in ${trailPath}, hash-chained and signed.`, {
        indent: 2,
        width: palette.width,
      }).map((line) => palette.dim(line)),
    );
    lines.push(palette.dim(`  Check it with:  sirius revenue audit --verify <file>`));
    lines.push('');
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
  const width = palette.width;

  for (const entry of entries) {
    if (entry.disposition === 'skipped') continue;
    if (lines.length >= limit) break;

    const clock = entry.at.slice(11, 16);
    const id = padVisible(entry.record_id, 12);
    const action = padVisible(entry.action, 22);

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

    // The refusal's reason is a sentence — "4 messages already sent to this
    // party today" — and it is the part that gives way, because the rule that
    // refused is the thing an audience is being shown.
    const head =
      `  ${palette.dim(clock)}  ${id}${palette.amber(action)}` +
      `${palette.amber(palette.glyph('hold'))} ${palette.amber(entry.rule_id ?? 'blocked')} `;
    const room = Math.max(0, width - visibleWidth(head) - 2);
    lines.push(head + palette.dim(truncate(`— ${entry.detail ?? ''}`, room)));
  }

  return lines;
}

export interface RecordExplanation {
  record: RiskRecord;
  assessment: Assessment;
  /** Which split it was scored in — the ranking differs between them. */
  split: string;
  /** Prior odds the scorecard started from, as a probability. */
  baseRate: number;
  /** Slope and intercept of the fitted shrink. */
  calibration: { slope: number; intercept: number };
  /** Records the shrink was fitted on — the reader's cue for how far to trust it. */
  trainedOn: number;
  /** Share of the amount that comes back, for this record's bucket. */
  share: number;
  shareKey: string;
  /** What acting would cost, and what the agent would do. */
  cost_paise: number;
  action: Intervention;
  /** Why the action would or would not be permitted, right now. */
  verdict: { allowed: boolean; rule?: { id: string; says: string; basis: string }; detail?: string };
  capacity: { max_actions: number; rule: string };
  floor: number;
  /** Present only when the batch carries labels. Never used to score. */
  truth?: { recoverable: boolean; self_heals: boolean; best_action: string; recoverable_paise: number };
}

/**
 * One record, and every step between it and the agent's decision.
 *
 * The counterpart to `sirius explain SIR-SEC-001` on the code side, and the
 * reason the model is a scorecard rather than something with better numbers:
 * every line below is a sentence a payments lead can disagree with. A model
 * that cannot be argued with in a meeting does not get used in one.
 *
 * The answer key is printed last, clearly separated, and only when the batch
 * has one. It plays no part in the score — putting it at the bottom rather than
 * beside the evidence is the layout saying so.
 */
export function renderExplanation(explanation: RecordExplanation, palette: Palette): string {
  const { record, assessment, truth } = explanation;
  const lines: string[] = [];
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  lines.push('');
  lines.push(
    `  ${palette.bold(record.id)}   ${palette.bold(palette.rupee(record.amount_paise))}   ` +
      palette.dim(describe(record)),
  );
  lines.push(
    ...note(
      `scored against split=${explanation.split} — capacity and ranking are relative to the records it competed with`,
      { indent: 2, width: palette.width },
    ).map((line) => palette.dim(line)),
  );
  lines.push('');

  // ---- the scorecard, in the order it is computed
  lines.push(`  ${palette.bold('HOW THE SCORE WAS REACHED')}`);
  lines.push(
    `    ${palette.dim('start'.padEnd(22))}${palette.dim(
      `base rate ${pct(explanation.baseRate)} — how often acting pays off at all`,
    )}`,
  );

  for (const item of assessment.evidence) {
    if (item.feature === 'hold') continue;
    const sign = item.points >= 0 ? '+' : '−';
    const paint = item.points >= 0 ? palette.green : palette.amber;
    lines.push(
      `    ${item.feature.padEnd(22)}${paint(`${sign}${Math.abs(item.points).toFixed(1)}`.padStart(6))}  ` +
        palette.dim(item.detail),
    );
  }

  // How far to trust the number below is part of the number. A shrink fitted on
  // a couple of hundred records produces a score that ranks well and means
  // little as a probability, and the reader of a single record has no other way
  // to know that.
  const thin = explanation.trainedOn < 250;
  lines.push(
    `    ${palette.dim('shrink'.padEnd(22))}${palette.dim(
      `×${explanation.calibration.slope} — fitted on ${explanation.trainedOn} training records` +
        (thin ? '' : ', because the model is overconfident'),
    )}`,
  );
  if (thin) {
    lines.push(
      `    ${palette.amber(''.padEnd(22))}${palette.amber(
        'thin — read the score as a ranking, not a probability',
      )}`,
    );
  }
  {
    const head = `    ${palette.bold(padVisible('score', 22))}${palette.bold(
      padVisible(String(assessment.score), 6, 'right'),
    )}  `;
    lines.push(
      head +
        palette.dim(
          truncate('the chance this comes back BECAUSE the agent acts', Math.max(0, palette.width - visibleWidth(head))),
        ),
    );
  }
  lines.push('');

  // ---- the money
  lines.push(`  ${palette.bold('WHAT THAT IS WORTH')}`);
  lines.push(
    `    ${(assessment.score / 100).toFixed(2)} × ${palette.rupee(record.amount_paise)} × ` +
      `${explanation.share} ${palette.dim(`(recovery share for ${explanation.shareKey})`)}`,
  );
  lines.push(
    `      = ${palette.bold(palette.rupee(assessment.expected_recovery_paise))} ${palette.dim(
      `expected, against ${palette.rupee(explanation.cost_paise)} to act`,
    )}`,
  );
  lines.push('');

  // ---- the decision
  const held = assessment.evidence[0]?.feature === 'hold';
  lines.push(`  ${palette.bold('WHAT THE AGENT DOES')}`);

  if (held) {
    lines.push(
      `    ${palette.amber(palette.glyph('hold'))} ${palette.amber('held')} — ${palette.dim(
        assessment.evidence[0]?.detail ?? '',
      )}`,
    );
    lines.push(`    ${palette.dim('no score, no ranking, no action. This one is for a human.')}`);
  } else if (assessment.flagged) {
    lines.push(`    ${palette.violet(palette.glyph('flag'))} ${palette.bold(explanation.action)}`);
    lines.push(
      ...note(
        `inside this run's capacity of ${explanation.capacity.max_actions} (${explanation.capacity.rule})`,
        { indent: 4, width: palette.width },
      ).map((line) => palette.dim(line)),
    );
  } else if (assessment.score < explanation.floor) {
    lines.push(
      `    ${palette.dim(palette.glyph('skip'))} left alone — ${palette.dim(
        `score ${assessment.score} is below the floor of ${explanation.floor}`,
      )}`,
    );
  } else {
    lines.push(
      `    ${palette.dim(palette.glyph('skip'))} left alone — ${palette.dim(
        `above the floor, but ${explanation.capacity.max_actions} records were worth more this run`,
      )}`,
    );
  }

  if (!held) {
    const { verdict } = explanation;
    lines.push(
      verdict.allowed
        ? `    ${palette.green(palette.glyph('check'))} ${palette.dim(
            `${explanation.action} is permitted right now`,
          )}`
        : `    ${palette.amber(palette.glyph('hold'))} ${palette.amber(verdict.rule?.id ?? 'refused')} ` +
            palette.dim(`— ${verdict.detail ?? ''}`),
    );
    if (!verdict.allowed && verdict.rule) {
      lines.push(`        ${palette.dim(verdict.rule.says)}`);
      lines.push(`        ${palette.dim(verdict.rule.basis)}`);
    }
  }

  lines.push('');

  // ---- the answer key, if this batch has one
  if (truth) {
    lines.push(`  ${palette.bold('WHAT ACTUALLY HAPPENS')}   ${palette.dim('from the labels — not used to score')}`);
    const verdictLine = !truth.recoverable
      ? palette.red('not recoverable by anyone')
      : truth.self_heals
        ? palette.amber('recoverable, but it comes back on its own — acting buys nothing')
        : palette.green('recoverable, and only if somebody acts');
    lines.push(`    ${verdictLine}`);
    if (truth.recoverable) {
      lines.push(
        `    ${palette.dim(
          `${palette.rupee(truth.recoverable_paise)} of it, and the action that works is ${truth.best_action}`,
        )}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * The sweep: one row per batch, then the mean, then the spread.
 *
 * The per-seed rows are not decoration. A mean edge of +0.6% built from eight
 * seeds that all agree is a different claim from the same mean built from four
 * wins and four losses, and only the rows show which one you have.
 */
export function renderSweep(summary: SweepSummary, palette: Palette): string {
  const lines: string[] = [];
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

  lines.push('');
  lines.push(palette.hr);
  lines.push(
    ` ${palette.bold('SWEEP')}   ${palette.dim(
      `${summary.seeds.length} independently generated batches · ` +
        `${summary.size.payments + summary.size.checkouts + summary.size.invoices} records each`,
    )}`,
  );
  lines.push(palette.hr);
  lines.push('');

  lines.push(
    `  ${palette.dim('seed'.padEnd(14))}${palette.dim('precision'.padStart(10))}` +
      `${palette.dim('recall'.padStart(9))}${palette.dim('recall ₹'.padStart(10))}` +
      `${palette.dim('vs heuristic'.padStart(14))}${palette.dim('of ceiling'.padStart(12))}` +
      `${palette.dim('touched'.padStart(9))}`,
  );

  for (const row of summary.rows) {
    const edge = row.net_paise / Math.max(1, row.best_heuristic_paise) - 1;
    const ceiling = row.net_paise / Math.max(1, row.ceiling_paise);
    lines.push(
      `  ${row.seed.padEnd(14)}${pct(row.precision).padStart(10)}${pct(row.recall).padStart(9)}` +
        `${pct(row.money_recall).padStart(10)}` +
        `${(edge >= 0 ? palette.green : palette.amber)(signed(edge).padStart(14))}` +
        `${pct(ceiling).padStart(12)}` +
        `${(row.forbidden_touched === 0 ? palette.green : palette.red)(
          String(row.forbidden_touched).padStart(9),
        )}`,
    );
  }

  lines.push('');
  lines.push(
    `  ${palette.bold('mean'.padEnd(14))}${palette.bold(pct(summary.mean.precision).padStart(10))}` +
      `${palette.bold(pct(summary.mean.recall).padStart(9))}` +
      `${palette.bold(pct(summary.mean.money_recall).padStart(10))}` +
      `${palette.bold((summary.mean.edge >= 0 ? palette.green : palette.amber)(signed(summary.mean.edge).padStart(14)))}` +
      `${palette.bold(pct(summary.mean.share_of_ceiling).padStart(12))}` +
      `${palette.bold(
        (summary.forbidden_touched === 0 ? palette.green : palette.red)(
          String(summary.forbidden_touched).padStart(9),
        ),
      )}`,
  );
  lines.push('');

  const wins = `${summary.wins} of ${summary.rows.length}`;
  lines.push(
    ...note(
      `beat every capacity-matched heuristic on ${wins} batches · mean calibration gap ${pct(
        summary.mean.calibration_error,
      )}`,
      { indent: 2, width: palette.width },
    ).map((line) => palette.dim(line)),
  );
  lines.push(
    ...note(
      `over the same batches the heuristics touched ${summary.heuristic_forbidden_touched} records ` +
        `nothing may touch; this touched ${summary.forbidden_touched}`,
      { indent: 2, width: palette.width },
    ).map((line) => palette.dim(line)),
  );
  lines.push('');

  if (summary.wins < summary.rows.length) {
    lines.push(
      ...note(
        `It does not win every batch, and the rows say which. A mean built from disagreement ` +
          `is a weaker claim than the same mean built from agreement.`,
        { indent: 2, width: palette.width },
      ).map((line) => palette.dim(line)),
    );
    lines.push('');
  }

  return lines.join('\n');
}

/** The comparison table: what changed since a saved sweep, including what got worse. */
export function renderComparison(deltas: readonly Delta[], palette: Palette, note?: string): string {
  const lines: string[] = [];

  const format = (value: number, kind: Delta['kind']) =>
    kind === 'share' ? `${(value * 100).toFixed(1)}%` : kind === 'money' ? palette.rupee(value) : String(value);

  lines.push('');
  lines.push(palette.hr);
  lines.push(` ${palette.bold('AGAINST THE SAVED RUN')}`);
  lines.push(palette.hr);
  lines.push('');

  if (note) {
    lines.push(`  ${palette.red(palette.glyph('warn'))} ${palette.amber(note)}`);
    lines.push('');
  }

  let better = 0;
  let worse = 0;

  for (const delta of deltas) {
    const improved = delta.higherIsBetter ? delta.change > 0 : delta.change < 0;
    const unchanged = Math.abs(delta.change) < 1e-9;
    if (!unchanged) improved ? (better += 1) : (worse += 1);

    const paint = unchanged ? palette.dim : improved ? palette.green : palette.red;
    const arrow = unchanged ? palette.glyph('skip') : delta.change > 0 ? '▲' : '▼';
    const changeText =
      delta.kind === 'share'
        ? `${delta.change >= 0 ? '+' : ''}${(delta.change * 100).toFixed(1)}pp`
        : `${delta.change >= 0 ? '+' : ''}${delta.change}`;

    lines.push(
      `  ${delta.name.padEnd(22)}${format(delta.before, delta.kind).padStart(9)} ${palette.dim('→')} ` +
        `${format(delta.after, delta.kind).padStart(9)}   ${paint(`${arrow} ${changeText}`)}` +
        `${delta.higherIsBetter ? '' : palette.dim('   (lower is better)')}`,
    );
  }

  lines.push('');
  lines.push(
    `  ${palette.dim(
      worse === 0 && better === 0
        ? 'nothing moved.'
        : `${better} better, ${worse} worse. A change that improves one number and quietly costs another is the one worth catching.`,
    )}`,
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * What changed between two runs of the same batch.
 *
 * The whole point of watching a policy file: tighten a limit and see what it
 * bought and what it cost side by side, rather than reading two reports and
 * holding the difference in your head. Nothing that stayed the same is printed
 * — a diff that lists everything is a diff nobody reads.
 */
export function renderChanges(moved: readonly SummaryChange[], palette: Palette, reason: string): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(` ${palette.bold('changed')}  ${palette.dim(reason)}`);

  if (moved.length === 0) {
    lines.push(`    ${palette.dim('nothing moved.')}`);
    return lines.join('\n') + '\n';
  }

  const format = (value: number, kind: SummaryChange['kind']) =>
    kind === 'money' ? palette.rupee(value) : String(value);

  for (const change of moved) {
    const delta = change.after - change.before;
    const improved = change.higherIsBetter ? delta > 0 : delta < 0;
    const paint = improved ? palette.green : palette.amber;
    const arrow = delta > 0 ? '▲' : '▼';
    const amount = change.kind === 'money' ? palette.rupee(Math.abs(delta)) : String(Math.abs(delta));

    lines.push(
      `    ${change.name.padEnd(20)}${palette.dim(format(change.before, change.kind).padStart(13))} ` +
        `${palette.dim('→')} ${format(change.after, change.kind).padStart(13)}   ${paint(`${arrow} ${amount}`)}`,
    );
  }

  return lines.join('\n') + '\n';
}

/**
 * The stress report: how much of the edge survives a shifted world.
 *
 * Laid out so the two comparisons a reader actually wants are adjacent —
 * `before` against `after` is what the shift cost, `after` against `retrained`
 * is how much of it a refit would recover. A scenario the detector loses is
 * printed in the same table and the same weight as one it wins, because a
 * robustness report that only lists the survivals is a marketing document.
 */
export function renderStress(report: StressReport, palette: Palette): string {
  const lines: string[] = [''];
  const pct = (value: number | null): string =>
    value === null ? 'n/a' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  const prose = (text: string, indent = 4): string[] =>
    note(text, { indent, width: palette.width }).map((line) => palette.dim(line));

  lines.push(`  ${palette.bold('WHEN THE WORLD STOPS MATCHING THE TRAINING DATA')}`);
  lines.push(
    ...prose(
      `${report.seeds.length} seed${report.seeds.length === 1 ? '' : 's'} · ` +
        `${Math.round(report.capacity_share * 100)}% capacity · the shift is ` +
        'applied to the generator, not the sample, so a model fitted on the world as it was meets one ' +
        'that genuinely obeys different rules. The heuristics it is measured against are not trained ' +
        'on anything, so they cannot go stale.',
      2,
    ),
  );
  lines.push('');

  const rows = report.rows.map((row) => {
    const held = (row.edge_after ?? 0) > 0;
    const paint = held ? palette.green : palette.red;
    return [
      held ? palette.green(palette.glyph('check')) : palette.red(palette.glyph('cross')),
      row.name,
      palette.dim(pct(row.edge_before)),
      paint(palette.bold(pct(row.edge_after))),
      palette.dim(pct(row.edge_retrained)),
      palette.dim(`${(row.ceiling_after * 100).toFixed(0)}%`),
      row.forbidden_touched === 0
        ? palette.green(palette.glyph('check'))
        : palette.red(`${palette.glyph('cross')} ${row.forbidden_touched}`),
    ];
  });

  const rendered = table(
    [
      { header: '' },
      { header: 'WORLD', flex: true, min: 12 },
      { header: 'BEFORE', align: 'right' },
      { header: 'AFTER', align: 'right' },
      { header: 'RETRAINED', align: 'right' },
      { header: 'CEILING', align: 'right' },
      { header: 'CLEAN', align: 'right' },
    ],
    rows,
    { indent: 3, width: palette.width, header: palette.dim },
  );

  lines.push(rendered[0] as string);
  report.rows.forEach((row, index) => {
    lines.push(rendered[index + 1] as string);
    lines.push(...prose(row.what, 7));
  });

  lines.push('');
  lines.push(`    ${palette.bold(`The money edge held in ${report.held} of ${report.rows.length} worlds.`)}`);
  lines.push(...prose(`The worst of them was "${report.worst}".`, 4));

  const clean = report.rows.every((row) => row.forbidden_touched === 0);
  if (clean) {
    lines.push(
      `    ${palette.green(palette.glyph('check'))} ${palette.bold('It touched nothing out of bounds in any of them.')}`,
    );
    lines.push(
      ...prose(
        'The money edge is a preference; that is a rule, and a rule that only holds on the ' +
          'distribution you trained on is not a rule.',
        6,
      ),
    );
  } else {
    lines.push(
      `    ${palette.red(palette.glyph('cross'))} It touched records it must not. That is the failure that matters.`,
    );
  }

  lines.push('');
  lines.push(
    ...prose(
      'Where `retrained` is worse than `after`, refitting on the shifted world did not help — the ' +
        'heuristic is simply better there, and no amount of retraining fixes a model that has nothing ' +
        'to say about a portfolio it was not designed for.',
    ),
  );
  lines.push('');
  return lines.join('\n');
}
