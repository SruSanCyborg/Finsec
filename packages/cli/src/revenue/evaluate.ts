/**
 * Measuring the detector on data it was never fitted on.
 *
 * Four things get reported, and the last two are the ones that make the first
 * two mean anything:
 *
 *   1. the confusion matrix, precision, recall, F1 — the usual table;
 *   2. the same figures weighted by rupees, because a batch's money and its
 *      records are not distributed alike and a model can look good on counts
 *      while missing everything expensive;
 *   3. what being wrong cost, separated into the two ways of being wrong;
 *   4. calibration — whether a record scored 70 comes back 70% of the time.
 *
 * And baselines, because a number with nothing beside it is not a result. They
 * are matched on capacity — given room for sixty-seven interventions today,
 * which sixty-seven? — with the spreadsheet heuristics a team actually uses
 * (biggest first, newest first) and a perfect-foresight ceiling to say how much
 * of the available money was on the table at all.
 */

import { estimatedCost, DEFAULT_COSTS } from './cost.js';
import type { CostModel } from './cost.js';
import { isUplift } from './model.js';
import { splitOf } from './synth.js';
import type { Assessment, GroundTruth, RiskRecord, Split } from './types.js';

export interface ConfusionMatrix {
  true_positive: number;
  false_positive: number;
  true_negative: number;
  false_negative: number;
}

export interface CostBreakdown {
  /** Spent acting on records that did need acting on. */
  spent_on_hits_paise: number;
  /** Spent acting on records that did not. This is the false-positive bill. */
  spent_on_misses_paise: number;
  /** Charged for contacting people who would have paid anyway. */
  annoyance_paise: number;
  /** Recoverable money the detector did not flag. The cost of caution. */
  forgone_paise: number;
  recovered_paise: number;
  /** recovered − everything above it, except forgone (which was never spent). */
  net_paise: number;
}

export interface CalibrationBin {
  from: number;
  to: number;
  count: number;
  predicted: number;
  actual: number;
}

export interface Evaluation {
  split: Split | 'all';
  threshold: number;
  records: number;
  positives: number;
  matrix: ConfusionMatrix;
  precision: number;
  recall: number;
  f1: number;
  /** Rupee-weighted: of the money flagged, how much was really recoverable. */
  money_precision: number;
  /** Of the recoverable money in the batch, how much was flagged. */
  money_recall: number;
  cost: CostBreakdown;
  calibration: CalibrationBin[];
  /** Expected calibration error: mean gap between confidence and reality. */
  calibration_error: number;
  /** The capacity the comparisons are made at, and where it came from. */
  capacity: { max_actions: number; rule: string };
  /** Records in this split that no policy may act on, and how many were. */
  forbidden: { in_population: number; touched: number };
  baselines: Baseline[];
  /** Precision/recall at each threshold, for the curve. */
  curve: { threshold: number; precision: number; recall: number; net_paise: number }[];
}

/**
 * One alternative policy, measured on the same records at the same capacity.
 *
 * Capacity-matched on purpose. "Chase everything" wins on a batch where a
 * retry costs three rupees and a recovery is worth two thousand — it is also a
 * policy no gateway would let a merchant run, so beating it proves nothing.
 * The question a finance team actually faces is: *given room for sixty-seven
 * interventions today, which sixty-seven?* Every baseline below answers that
 * question, except the two that are marked as not fitting.
 */
export interface Baseline {
  name: string;
  note: string;
  flagged: number;
  cost: CostBreakdown;
  /** True when this policy would exceed the capacity it was measured against. */
  over_capacity: boolean;
  /** Records it would have touched that nothing is allowed to touch. */
  harmful_touches: number;
}

export interface EvaluateInput {
  records: readonly RiskRecord[];
  assessments: readonly Assessment[];
  truth: ReadonlyMap<string, GroundTruth>;
  threshold: number;
  split?: Split | 'all';
  costs?: CostModel;
  /** Actions available for this split. Defaults to a fifth of it. */
  capacity?: { max_actions: number; rule: string };
}

export function evaluate(input: EvaluateInput): Evaluation {
  const costs = input.costs ?? DEFAULT_COSTS;
  const split = input.split ?? 'test';
  const byId = new Map(input.records.map((record) => [record.id, record]));

  const scored = input.assessments
    .filter((assessment) => split === 'all' || splitOf(assessment.record_id) === split)
    .map((assessment) => {
      const record = byId.get(assessment.record_id) as RiskRecord;
      const label = input.truth.get(assessment.record_id) as GroundTruth;
      return { assessment, record, label, positive: isUplift(label) };
    })
    .filter((row) => row.record && row.label);

  const matrix: ConfusionMatrix = {
    true_positive: 0,
    false_positive: 0,
    true_negative: 0,
    false_negative: 0,
  };

  let flaggedMoney = 0;
  let flaggedRecoverableMoney = 0;
  let totalRecoverableMoney = 0;

  for (const row of scored) {
    const flagged = row.assessment.flagged;
    if (row.positive) totalRecoverableMoney += row.label.recoverable_paise;

    if (flagged && row.positive) matrix.true_positive += 1;
    else if (flagged && !row.positive) matrix.false_positive += 1;
    else if (!flagged && row.positive) matrix.false_negative += 1;
    else matrix.true_negative += 1;

    if (flagged) {
      flaggedMoney += row.record.amount_paise;
      if (row.positive) flaggedRecoverableMoney += row.label.recoverable_paise;
    }
  }

  const precision = ratio(matrix.true_positive, matrix.true_positive + matrix.false_positive);
  const recall = ratio(matrix.true_positive, matrix.true_positive + matrix.false_negative);

  const capacity = input.capacity ?? {
    max_actions: Math.max(10, Math.ceil(scored.length * 0.2)),
    rule: '20% of this split — a stand-in for one cycle of operational headroom',
  };

  return {
    split,
    threshold: input.threshold,
    records: scored.length,
    positives: scored.filter((row) => row.positive).length,
    matrix,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : round((2 * precision * recall) / (precision + recall)),
    money_precision: ratio(flaggedRecoverableMoney, flaggedMoney),
    money_recall: ratio(flaggedRecoverableMoney, totalRecoverableMoney),
    cost: costOf(scored, (row) => row.assessment.flagged, costs),
    calibration: calibrationOf(scored),
    calibration_error: calibrationError(calibrationOf(scored)),
    capacity,
    forbidden: {
      in_population: scored.filter((row) => forbidden(row)).length,
      touched: scored.filter((row) => row.assessment.flagged && forbidden(row)).length,
    },
    baselines: baselinesFor(scored, capacity.max_actions, costs),
    curve: curveOf(scored, costs),
  };
}

/**
 * The alternatives, in the order a sceptic would ask about them.
 *
 * `perfect foresight` is not a policy anyone can run — it is the ceiling, and
 * it belongs here because "we recovered ₹4.8L" means nothing until you know
 * whether ₹5L or ₹50L was available. A detector at 90% of the ceiling and one
 * at 30% read identically without it.
 */
/**
 * Records nothing is allowed to act on, whatever the money says.
 *
 * An open dispute is a regulatory hold on contact. A shared-signal cluster is
 * somebody else's fraud attempt, and retrying it is helping it. A `risk_block`
 * is the issuer having already said no for a reason. These are not low-value
 * records to be traded off — they are outside the trade, and a policy that
 * touches them has failed regardless of what it recovered elsewhere.
 */
function forbidden(row: Row): boolean {
  return (
    Boolean(row.record.in_dispute) ||
    row.record.failure_code === 'risk_block' ||
    row.assessment.evidence[0]?.feature === 'hold'
  );
}

function baselinesFor(rows: readonly Row[], capacity: number, costs: CostModel): Baseline[] {
  const topBy = (rank: (row: Row) => number): Set<string> =>
    new Set(
      [...rows]
        .sort((a, b) => rank(b) - rank(a))
        .slice(0, capacity)
        .map((row) => row.record.id),
    );

  const biggest = topBy((row) => row.record.amount_paise);
  const oldest = topBy((row) => -Date.parse(row.record.occurred_at));
  const oracle = topBy((row) => (row.positive ? row.label.recoverable_paise : -1));

  const harm = (acts: (row: Row) => boolean) => rows.filter((row) => acts(row) && forbidden(row)).length;

  const policy = (
    name: string,
    note: string,
    acts: (row: Row) => boolean,
    flagged: number,
    overCapacity = false,
  ): Baseline => ({
    name,
    note,
    flagged,
    cost: costOf(rows, acts, costs),
    over_capacity: overCapacity,
    harmful_touches: harm(acts),
  });

  const k = Math.min(capacity, rows.length);

  return [
    policy(
      'chase everything',
      'no model at all — and far past what any gateway or contact rule allows',
      () => true,
      rows.length,
      rows.length > capacity,
    ),
    policy('chase nothing', 'what the money does when left alone', () => false, 0),
    policy(
      'biggest first',
      'the spreadsheet heuristic: sort by amount, work down the list',
      (row) => biggest.has(row.record.id),
      k,
    ),
    policy(
      'newest first',
      'the queue heuristic: work the freshest failures',
      (row) => oldest.has(row.record.id),
      k,
    ),
    policy(
      'perfect foresight',
      'the ceiling — the best possible choice of the same number of records',
      (row) => oracle.has(row.record.id),
      k,
    ),
  ];
}

type Row = {
  assessment: Assessment;
  record: RiskRecord;
  label: GroundTruth;
  positive: boolean;
};

function costOf(rows: readonly Row[], acts: (row: Row) => boolean, costs: CostModel): CostBreakdown {
  const breakdown: CostBreakdown = {
    spent_on_hits_paise: 0,
    spent_on_misses_paise: 0,
    annoyance_paise: 0,
    forgone_paise: 0,
    recovered_paise: 0,
    net_paise: 0,
  };

  for (const row of rows) {
    const spend = estimatedCost(row.record.kind, costs);
    if (acts(row)) {
      if (row.positive) {
        breakdown.spent_on_hits_paise += spend;
        breakdown.recovered_paise += Math.round(row.label.recoverable_paise * costs.margin);
      } else {
        breakdown.spent_on_misses_paise += spend;
        if (row.label.self_heals) breakdown.annoyance_paise += costs.annoyance_paise;
      }
    } else if (row.positive) {
      breakdown.forgone_paise += Math.round(row.label.recoverable_paise * costs.margin);
    }
  }

  breakdown.net_paise =
    breakdown.recovered_paise -
    breakdown.spent_on_hits_paise -
    breakdown.spent_on_misses_paise -
    breakdown.annoyance_paise;

  return breakdown;
}

/**
 * Does a score of 70 mean 70%?
 *
 * Naive Bayes is famously overconfident — it double-counts correlated evidence
 * — so this table is where that shows up. Printing it next to precision is the
 * difference between a model that reports its own weakness and one that waits
 * to be caught.
 */
function calibrationOf(rows: readonly Row[]): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  for (let from = 0; from < 100; from += 20) {
    const to = from + 20;
    const inBin = rows.filter((row) => row.assessment.score >= from && row.assessment.score < to);
    if (inBin.length === 0) continue;
    bins.push({
      from,
      to,
      count: inBin.length,
      predicted: round(inBin.reduce((sum, row) => sum + row.assessment.score / 100, 0) / inBin.length),
      actual: round(inBin.filter((row) => row.positive).length / inBin.length),
    });
  }
  return bins;
}

function calibrationError(bins: readonly CalibrationBin[]): number {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  if (total === 0) return 0;
  return round(
    bins.reduce((sum, bin) => sum + (bin.count / total) * Math.abs(bin.predicted - bin.actual), 0),
  );
}

function curveOf(rows: readonly Row[], costs: CostModel): Evaluation['curve'] {
  const curve: Evaluation['curve'] = [];
  for (let threshold = 0; threshold <= 100; threshold += 5) {
    const acts = (row: Row) => row.assessment.score >= threshold && row.assessment.score > 0;
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const row of rows) {
      if (acts(row) && row.positive) tp += 1;
      else if (acts(row)) fp += 1;
      else if (row.positive) fn += 1;
    }
    curve.push({
      threshold,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
      net_paise: costOf(rows, acts, costs).net_paise,
    });
  }
  return curve;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
