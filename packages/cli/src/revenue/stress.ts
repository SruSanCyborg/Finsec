/**
 * What happens when the world stops matching the training data.
 *
 * The honest objection to every result on this surface is that the model was
 * fitted to the same generator that produced the test set, so of course it
 * works. A held-out split answers the weak form of that — same distribution,
 * rows the fit never saw — and says nothing about the form that actually
 * happens to a deployed detector: the traffic mix moves, a different gateway
 * degrades, the portfolio shifts toward mandates, amounts inflate, and the
 * model carries on scoring with the weights it learned last quarter.
 *
 * So the shift is applied to the *generator*, not to the sample. A model is
 * fitted on the world as it was, and then measured on a world that genuinely
 * obeys different rules — against the same capacity-matched heuristics, which
 * are not trained on anything and therefore cannot go stale.
 *
 * Three numbers per scenario, because two of them are the interesting ones:
 *
 *   before      the edge in the world it was fitted to
 *   after       the edge of that same model, unchanged, in the shifted world
 *   retrained   the edge of a model fitted on the shifted world
 *
 * `after` against `before` is how much the shift costs. `after` against
 * `retrained` is how much of that a refit would recover, which is the only
 * number that tells an operator whether to retrain or to redesign. A detector
 * that degrades gracefully and a detector that collapses look identical until
 * somebody runs this.
 *
 * Nothing here is tuned. The scenarios were written down before they were run,
 * and the ones the detector handles badly are reported in the same table as the
 * ones it handles well.
 */

import { DEFAULT_COSTS } from './cost.js';
import type { CostModel } from './cost.js';
import { evaluate } from './evaluate.js';
import type { Evaluation } from './evaluate.js';
import { analyzeBatch } from './features.js';
import { assessBatch, defaultCapacity, fitModel } from './model.js';
import { generateBatch, splitOf } from './synth.js';
import type { DistributionShift } from './synth.js';

/**
 * The worlds, written down before any of them were run.
 *
 * Each is a thing that happens to a payments book in an ordinary year, not an
 * adversary: this surface is defence-only, and a scenario designed to defeat
 * the detector would measure the scenario rather than the detector.
 */
export const SCENARIOS: readonly DistributionShift[] = [
  {
    name: 'no outage',
    what: 'no gateway degradation in the batch at all — the signal the model leans on hardest is simply absent',
    degradation: 'none',
  },
  {
    name: 'mandate-heavy',
    what: 'the book shifts to NACH mandates and away from UPI collect, as a lender’s would',
    rails: { nach_mandate: 6, emandate_upi: 3, upi_collect: 0.3, upi_intent: 0.5 },
  },
  {
    name: 'card-heavy',
    what: 'card share triples and UPI halves, as a cross-border merchant’s would',
    rails: { card: 3, upi_collect: 0.5, upi_intent: 0.5 },
  },
  {
    name: 'larger tickets',
    what: 'median ticket size quadruples and the tail widens — a B2B book rather than a consumer one',
    amount: 4,
    amountSigma: 1.4,
  },
  {
    name: 'harder to recover',
    what: 'the same failures come back three-quarters as often, before any outage or ring floor',
    recovery: 0.75,
  },
  {
    name: 'risk-block wave',
    what: 'issuers tighten: risk blocks and do-not-honor triple across every rail',
    failures: { risk_block: 3, do_not_honor: 3 },
  },
];

export interface StressRow {
  name: string;
  what: string;
  /**
   * Edge over the best runnable heuristic, in the world the model was fitted
   * to. Null when the heuristic nets too little across every seed for a ratio
   * to mean anything.
   */
  edge_before: number | null;
  /** The same model, unchanged, in the shifted world. */
  edge_after: number | null;
  /** A model fitted on the shifted world — what a refit would buy. */
  edge_retrained: number | null;
  /** The rupees behind `edge_after`, summed across seeds. */
  net_after_paise: number;
  heuristic_after_paise: number;
  /** Calibration error of the stale model in the shifted world. */
  calibration_after: number;
  calibration_retrained: number;
  /** Records out of bounds that the stale model touched. Must stay zero. */
  forbidden_touched: number;
  /** Share of the reachable money the stale model still captured. */
  ceiling_after: number;
}

export interface StressReport {
  schema: 'sirius.revenue.stress/v1';
  seeds: string[];
  capacity_share: number;
  rows: StressRow[];
  /** Scenarios where the stale model still beat every runnable heuristic. */
  held: number;
  /** Scenarios where it did not. */
  broke: number;
  worst: string;
}

export interface StressOptions {
  seeds?: number;
  payments?: number;
  checkouts?: number;
  invoices?: number;
  costs?: CostModel;
  /**
   * How much of the batch may be acted on.
   *
   * Deliberately tighter than the 20% default. At 20% the detector and the
   * spreadsheet heuristic are close to level even in the world the model was
   * fitted to, and measuring the decay of an edge that is not there is not
   * measuring anything. At 5% the model has a real advantage to lose, which is
   * what makes "how much survives the shift" a question with an answer.
   */
  capacityShare?: number;
}

/** The detector's net, and the best net a runnable heuristic managed. */
function netsOf(evaluation: Evaluation): { detector: number; heuristic: number } {
  const heuristics = evaluation.baselines.filter(
    (baseline) => baseline.name === 'biggest first' || baseline.name === 'newest first',
  );
  return {
    detector: evaluation.cost.net_paise,
    heuristic: Math.max(0, ...heuristics.map((baseline) => baseline.cost.net_paise)),
  };
}

/**
 * One ratio from the totals, not the mean of four ratios.
 *
 * A mean of per-seed ratios blows up the moment one seed's heuristic nets close
 * to nothing: dividing by a denominator floored at one paise turned a scenario
 * into "+122,293,752%", which is not a result, it is a division. Summing the
 * rupees first and dividing once is both robust and the more honest claim —
 * across these batches the detector netted this much against the heuristic's
 * that much.
 */
function edgeFrom(detector: number, heuristic: number): number | null {
  // Below a lakh across every seed the comparison is noise about small numbers,
  // and a ratio would report it as a landslide either way.
  if (heuristic < 10_000_000) return null;
  return detector / heuristic - 1;
}

/** Scores `world` with `model`, whether or not `model` was fitted to this world. */
function measure(
  world: ReturnType<typeof generateBatch>,
  model: ReturnType<typeof fitModel>,
  costs: CostModel,
  share?: number,
): Evaluation {
  const context = analyzeBatch(world.records);
  const heldOut = world.records.filter((record) => splitOf(record.id) === 'test');
  const capacity = share
    ? {
        max_actions: Math.max(5, Math.round(heldOut.length * share)),
        rule: `${Math.round(share * 100)}% of the split`,
      }
    : defaultCapacity(heldOut.length);
  const { assessments } = assessBatch(heldOut, model, { context, costs, capacity });

  return evaluate({
    records: world.records,
    assessments,
    truth: world.truth,
    threshold: model.threshold,
    costs,
    capacity,
  });
}

export function stress(options: StressOptions = {}): StressReport {
  const costs = options.costs ?? DEFAULT_COSTS;
  const size = {
    payments: options.payments ?? 220,
    checkouts: options.checkouts ?? 60,
    invoices: options.invoices ?? 40,
  };
  const share = options.capacityShare ?? 0.05;
  const seeds = Array.from({ length: options.seeds ?? 4 }, (_, i) => `sirius-stress-${i + 1}`);

  const rows: StressRow[] = [];

  for (const shift of SCENARIOS) {
    const totals = {
      beforeDetector: 0,
      beforeHeuristic: 0,
      afterDetector: 0,
      afterHeuristic: 0,
      retrainedDetector: 0,
      retrainedHeuristic: 0,
    };
    const calAfter: number[] = [];
    const calRetrained: number[] = [];
    const ceilingAfter: number[] = [];
    let forbidden = 0;

    for (const seed of seeds) {
      // The world as it was, and the model fitted to it.
      const home = generateBatch({ seed, ...size });
      const model = fitModel(home.records, home.truth, costs);
      const home0 = netsOf(measure(home, model, costs, share));
      totals.beforeDetector += home0.detector;
      totals.beforeHeuristic += home0.heuristic;

      // The world after the shift. A different seed, so this is not the same
      // sample wearing different weights — it is different traffic.
      const world = generateBatch({ seed: `${seed}-shifted`, ...size, shift });

      const stale = measure(world, model, costs, share);
      const staleNets = netsOf(stale);
      totals.afterDetector += staleNets.detector;
      totals.afterHeuristic += staleNets.heuristic;
      calAfter.push(stale.calibration_error);
      forbidden += stale.forbidden.touched;

      const ceiling =
        stale.baselines.find((baseline) => baseline.name === 'perfect foresight')?.cost.net_paise ?? 0;
      ceilingAfter.push(ceiling > 0 ? stale.cost.net_paise / ceiling : 0);

      // What a refit would have bought, measured rather than assumed.
      const fresh = measure(world, fitModel(world.records, world.truth, costs), costs, share);
      const freshNets = netsOf(fresh);
      totals.retrainedDetector += freshNets.detector;
      totals.retrainedHeuristic += freshNets.heuristic;
      calRetrained.push(fresh.calibration_error);
    }

    const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);

    rows.push({
      name: shift.name,
      what: shift.what,
      edge_before: edgeFrom(totals.beforeDetector, totals.beforeHeuristic),
      edge_after: edgeFrom(totals.afterDetector, totals.afterHeuristic),
      edge_retrained: edgeFrom(totals.retrainedDetector, totals.retrainedHeuristic),
      net_after_paise: totals.afterDetector,
      heuristic_after_paise: totals.afterHeuristic,
      calibration_after: mean(calAfter),
      calibration_retrained: mean(calRetrained),
      forbidden_touched: forbidden,
      ceiling_after: mean(ceilingAfter),
    });
  }

  const held = rows.filter((row) => (row.edge_after ?? 0) > 0).length;
  const worst = rows.reduce(
    (lowest, row) => ((row.edge_after ?? 0) < (lowest.edge_after ?? 0) ? row : lowest),
    rows[0] as StressRow,
  );

  return {
    schema: 'sirius.revenue.stress/v1',
    seeds,
    capacity_share: share,
    rows,
    held,
    broke: rows.length - held,
    worst: worst?.name ?? '',
  };
}
