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
import { assessBatch, isUplift } from './model.js';
import type { Model } from './model.js';
import type { BatchContext } from './features.js';
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
  /**
   * Whether this bin holds enough records to mean anything.
   *
   * The top bin is almost always thin — a scorecard puts few records above 80 —
   * and a single record that came back turns into "said 88%, was 100%", which
   * the report was flagging with the same warning as a real twelve-point miss
   * on a hundred records. A rate computed on one observation is not a finding.
   */
  enough: boolean;
}

/** Below this, a bin is reported but not read as evidence of anything. */
export const CALIBRATION_MIN_BIN = 20;

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
  /**
   * Set when the confidence is not worth much, with the reason.
   *
   * Measured rather than guessed: the mean gap runs about 15% on a 185-record
   * batch and about 5% on a 2,150-record one. A model that is unreliable about
   * its own confidence and does not say so is the thing this surface promised
   * not to ship.
   */
  calibration_warning?: string;
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
  /**
   * Whether a team could actually run this.
   *
   * Capacity is the line. You cannot perform more interventions than you have
   * room for, so a policy over capacity is not a worse choice — it is not a
   * choice, and its rupee figure describes a world with no gateway limits, no
   * NACH caps and no TRAI contact rules. Printing that figure beside the
   * others invites the one comparison this whole surface exists to refuse.
   *
   * Forbidden touches are deliberately *not* part of this. A policy that
   * contacts a disputed record can be run — it is a compliance failure, not an
   * impossibility — and folding the two together would let us mark the
   * spreadsheet heuristic infeasible over a single touch, which is the
   * self-serving version of the same trick.
   */
  feasible: boolean;
  /** Why not, when it is not. */
  infeasible_because?: string;
  /** An upper bound rather than a policy anyone could follow. */
  bound?: boolean;
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
    ...warningFor(scored.length, calibrationError(calibrationOf(scored))),
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
    options: { overCapacity?: boolean; bound?: boolean } = {},
  ): Baseline => ({
    name,
    note,
    flagged,
    cost: costOf(rows, acts, costs),
    over_capacity: options.overCapacity ?? false,
    harmful_touches: harm(acts),
    feasible: !options.overCapacity,
    ...(options.overCapacity
      ? {
          infeasible_because: `${(flagged / Math.max(1, capacity)).toFixed(1)}× the ${capacity} interventions available`,
        }
      : {}),
    ...(options.bound ? { bound: true } : {}),
  });

  const k = Math.min(capacity, rows.length);

  return [
    policy(
      'chase everything',
      'no model at all — and far past what any gateway or contact rule allows',
      () => true,
      rows.length,
      { overCapacity: rows.length > capacity },
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
      { bound: true },
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
      enough: inBin.length >= CALIBRATION_MIN_BIN,
    });
  }
  return bins;
}

/**
 * Whether to distrust the confidence, in the words the report prints.
 *
 * Two separate reasons, worth telling apart: too few records to fit a shrink
 * on, and a gap wide enough to matter however it was fitted.
 */
function warningFor(records: number, error: number): { calibration_warning?: string } {
  if (records < 250) {
    return {
      calibration_warning:
        `${records} held-out records is thin for a calibration — the mean gap runs about 15% at this ` +
        `size and about 5% at ten times it. Read the scores as a ranking, not as probabilities.`,
    };
  }
  if (error > 0.08) {
    return {
      calibration_warning: `the mean gap between confidence and outcome is ${(error * 100).toFixed(
        1,
      )}% — wider than a score should imply.`,
    };
  }
  return {};
}

function calibrationError(bins: readonly CalibrationBin[]): number {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  if (total === 0) return 0;
  return round(
    bins.reduce((sum, bin) => sum + (bin.count / total) * Math.abs(bin.predicted - bin.actual), 0),
  );
}

/**
 * How the detector's edge over the best runnable heuristic moves with capacity.
 *
 * Reported at several capacities rather than one, because a single number
 * invites "so your model is worth 1%", and the honest answer is "at the capacity
 * you happened to measure, yes — here is the rest of the curve." Across eight
 * seeds the mean edge is +20.4% at 3% capacity and +1.1% at 20%: with room to
 * work a fifth of the batch, sorting by amount collects most of the money by
 * accident, and the model earns its keep only when actions are scarce.
 *
 * On any *single* batch the edge is frequently zero, because at tight capacity
 * the highest expected value and the largest amount are often the same records.
 * That is not a bug and it is not hidden — `revenue sweep` exists because one
 * batch is an anecdote (D-026), and this curve is the anecdote.
 */
export interface CapacityPoint {
  share: number;
  max_actions: number;
  /** How many the detector actually worked. It may use fewer than it has. */
  acted_on: number;
  detector_net_paise: number;
  best_runnable_net_paise: number;
  best_runnable: string;
  edge: number;
  forbidden_touched: number;
  heuristic_forbidden_touched: number;
}

export function capacityCurve(args: {
  /** The records in the split being evaluated — the same ones `evaluate` sees. */
  records: readonly RiskRecord[];
  model: Model;
  context: BatchContext;
  truth: ReadonlyMap<string, GroundTruth>;
  threshold: number;
  split?: Split | 'all';
  costs?: CostModel;
  shares?: readonly number[];
}): CapacityPoint[] {
  const shares = args.shares ?? [0.03, 0.05, 0.1, 0.2, 0.4];
  const points: CapacityPoint[] = [];

  for (const share of shares) {
    const max = Math.max(1, Math.round(args.records.length * share));
    const capacity = { max_actions: max, rule: `${Math.round(share * 100)}% of the batch` };

    // Re-assessed, not re-sliced. `select()` decides which records get worked
    // *given the room available*, so an assessment made at one capacity is a
    // different decision from one made at another. Reusing a single set of
    // assessments across the curve compared a detector acting on twenty-two
    // records against a heuristic held to three, and reported the difference as
    // a seventy-one percent edge. It was the same twenty-two records every time.
    const { assessments } = assessBatch(args.records, args.model, {
      context: args.context,
      ...(args.costs ? { costs: args.costs } : {}),
      capacity,
    });

    const at = evaluate({
      records: args.records,
      assessments,
      truth: args.truth,
      threshold: args.threshold,
      ...(args.split ? { split: args.split } : {}),
      ...(args.costs ? { costs: args.costs } : {}),
      capacity,
    });

    // Against what a team could actually have run instead — never a policy that
    // does not fit, and never the ceiling, which nobody can follow.
    const runnable = at.baselines.filter((b) => b.feasible && !b.bound && b.flagged > 0);
    const best = runnable.reduce(
      (winner, b) => (b.cost.net_paise > winner.cost.net_paise ? b : winner),
      runnable[0] as Baseline,
    );

    points.push({
      share,
      max_actions: max,
      acted_on: at.matrix.true_positive + at.matrix.false_positive,
      detector_net_paise: at.cost.net_paise,
      best_runnable_net_paise: best?.cost.net_paise ?? 0,
      best_runnable: best?.name ?? 'none',
      edge: best && best.cost.net_paise > 0 ? at.cost.net_paise / best.cost.net_paise - 1 : 0,
      forbidden_touched: at.forbidden.touched,
      heuristic_forbidden_touched: best?.harmful_touches ?? 0,
    });
  }
  return points;
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
