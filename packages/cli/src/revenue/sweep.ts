/**
 * Measuring a model across many batches, and against its own past self.
 *
 * One batch is an anecdote. Every time this model changed during its own
 * development, the honest answer needed eight seeds and a comparison against
 * the previous numbers — and getting them meant writing a throwaway script,
 * three times. A tool whose author keeps improvising the same measurement is a
 * tool missing a command.
 *
 * Two questions, and they are different. **Is it stable?** — run the same
 * evaluation over independently generated batches and report the spread, not
 * just the mean, because a model that wins on five seeds of eight is a
 * different claim from one that wins on all eight. **Did that change help?** —
 * compare against a saved run and report the deltas, including the ones that
 * got worse.
 */

import { DEFAULT_COSTS } from './cost.js';
import type { CostModel } from './cost.js';
import { evaluate } from './evaluate.js';
import type { Evaluation } from './evaluate.js';
import { analyzeBatch } from './features.js';
import { assessBatch, defaultCapacity, fitModel } from './model.js';
import { generateBatch, splitOf } from './synth.js';

export interface SweepRow {
  seed: string;
  precision: number;
  recall: number;
  money_recall: number;
  net_paise: number;
  /** Net of the best capacity-matched heuristic, for the edge. */
  best_heuristic_paise: number;
  /** Net of perfect foresight — the ceiling. */
  ceiling_paise: number;
  forbidden_touched: number;
  heuristic_forbidden_touched: number;
  calibration_error: number;
}

export interface SweepSummary {
  schema: 'sirius.revenue.sweep/v1';
  measured_at: string;
  seeds: string[];
  size: { payments: number; checkouts: number; invoices: number };
  rows: SweepRow[];
  mean: {
    precision: number;
    recall: number;
    money_recall: number;
    calibration_error: number;
    /** Mean of (net / best heuristic − 1). */
    edge: number;
    /** Mean of (net / ceiling). */
    share_of_ceiling: number;
  };
  /** Seeds where the model beat every capacity-matched heuristic. */
  wins: number;
  /** Records nothing may touch that the model touched, summed over the sweep. */
  forbidden_touched: number;
  heuristic_forbidden_touched: number;
}

export interface SweepOptions {
  /** Base seed; each batch is `${base}-${n}`. */
  seed: string;
  count: number;
  payments: number;
  checkouts: number;
  invoices: number;
  costs?: CostModel;
  /** Fraction of the split the agent may act on. */
  capacityShare?: number;
}

/** Runs one batch end to end and returns the evaluation, as the command does. */
export function evaluateSeed(seed: string, options: SweepOptions): Evaluation {
  const generated = generateBatch({
    seed,
    payments: options.payments,
    checkouts: options.checkouts,
    invoices: options.invoices,
  });

  const model = fitModel(generated.records, generated.truth, options.costs ?? DEFAULT_COSTS);
  const context = analyzeBatch(generated.records);
  const heldOut = generated.records.filter((record) => splitOf(record.id) === 'test');

  const capacity = options.capacityShare
    ? {
        max_actions: Math.max(5, Math.ceil(heldOut.length * options.capacityShare)),
        rule: `${Math.round(options.capacityShare * 100)}% of the split`,
      }
    : defaultCapacity(heldOut.length);

  const { assessments } = assessBatch(heldOut, model, { context, capacity });

  return evaluate({
    records: generated.records,
    assessments,
    truth: generated.truth,
    threshold: model.threshold,
    costs: options.costs ?? DEFAULT_COSTS,
    capacity,
  });
}

export function sweep(options: SweepOptions): SweepSummary {
  const seeds = Array.from({ length: options.count }, (_, index) => `${options.seed}-${index + 1}`);
  const rows: SweepRow[] = [];

  for (const seed of seeds) {
    const evaluation = evaluateSeed(seed, options);
    const heuristics = evaluation.baselines.filter(
      (baseline) => baseline.name === 'biggest first' || baseline.name === 'newest first',
    );

    rows.push({
      seed,
      precision: evaluation.precision,
      recall: evaluation.recall,
      money_recall: evaluation.money_recall,
      net_paise: evaluation.cost.net_paise,
      best_heuristic_paise: Math.max(...heuristics.map((b) => b.cost.net_paise)),
      ceiling_paise:
        evaluation.baselines.find((b) => b.name === 'perfect foresight')?.cost.net_paise ?? 0,
      forbidden_touched: evaluation.forbidden.touched,
      heuristic_forbidden_touched: Math.max(...heuristics.map((b) => b.harmful_touches)),
      calibration_error: evaluation.calibration_error,
    });
  }

  const mean = (pick: (row: SweepRow) => number) =>
    round(rows.reduce((sum, row) => sum + pick(row), 0) / Math.max(1, rows.length));

  return {
    schema: 'sirius.revenue.sweep/v1',
    measured_at: new Date().toISOString(),
    seeds,
    size: { payments: options.payments, checkouts: options.checkouts, invoices: options.invoices },
    rows,
    mean: {
      precision: mean((row) => row.precision),
      recall: mean((row) => row.recall),
      money_recall: mean((row) => row.money_recall),
      calibration_error: mean((row) => row.calibration_error),
      edge: mean((row) => row.net_paise / Math.max(1, row.best_heuristic_paise) - 1),
      share_of_ceiling: mean((row) => row.net_paise / Math.max(1, row.ceiling_paise)),
    },
    wins: rows.filter((row) => row.net_paise > row.best_heuristic_paise).length,
    forbidden_touched: rows.reduce((sum, row) => sum + row.forbidden_touched, 0),
    heuristic_forbidden_touched: rows.reduce((sum, row) => sum + row.heuristic_forbidden_touched, 0),
  };
}

export interface Delta {
  name: string;
  before: number;
  after: number;
  change: number;
  /** Whether up is good. Some of these read backwards. */
  higherIsBetter: boolean;
  /** Formatted for display: a share, a rupee figure, or a plain count. */
  kind: 'share' | 'money' | 'count';
}

/**
 * What changed, including what got worse.
 *
 * Calibration error and forbidden touches read backwards — lower is better —
 * and are marked so, because a table where every arrow means the same thing is
 * a table that will eventually be read wrong.
 */
export function compare(before: SweepSummary, after: SweepSummary): Delta[] {
  const delta = (
    name: string,
    pick: (summary: SweepSummary) => number,
    higherIsBetter: boolean,
    kind: Delta['kind'],
  ): Delta => ({
    name,
    before: pick(before),
    after: pick(after),
    change: round(pick(after) - pick(before)),
    higherIsBetter,
    kind,
  });

  return [
    delta('precision', (s) => s.mean.precision, true, 'share'),
    delta('recall', (s) => s.mean.recall, true, 'share'),
    delta('recall (₹)', (s) => s.mean.money_recall, true, 'share'),
    delta('edge over heuristics', (s) => s.mean.edge, true, 'share'),
    delta('share of ceiling', (s) => s.mean.share_of_ceiling, true, 'share'),
    delta('calibration error', (s) => s.mean.calibration_error, false, 'share'),
    delta('seeds won', (s) => s.wins, true, 'count'),
    delta('forbidden touched', (s) => s.forbidden_touched, false, 'count'),
  ];
}

/**
 * Whether the comparison is even meaningful.
 *
 * Two sweeps over different seeds or different batch sizes are two different
 * experiments, and subtracting one from the other produces a number that looks
 * like a result. Checked rather than assumed.
 */
export function comparable(before: SweepSummary, after: SweepSummary): string | undefined {
  if (before.seeds.join(',') !== after.seeds.join(',')) {
    return 'the two runs used different seeds, so the difference is not a comparison';
  }
  if (JSON.stringify(before.size) !== JSON.stringify(after.size)) {
    return 'the two runs used different batch sizes';
  }
  return undefined;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
