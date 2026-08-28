/**
 * The detector, and the properties that make its numbers worth printing.
 *
 * The interesting tests here are not "does precision equal 0.618". That would
 * pin a figure that should be free to move as the model improves, and it would
 * pass just as happily if the labels leaked. These check the things that would
 * make the whole report a lie: that the same seed gives the same batch, that
 * the model never sees the held-out half, that the target really is uplift and
 * not recovery, and that the agent cannot act more times than it is allowed.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_COSTS } from '../src/revenue/cost.js';
import { evaluate } from '../src/revenue/evaluate.js';
import { analyzeBatch } from '../src/revenue/features.js';
import { assessBatch, defaultCapacity, fitModel, isHeld, isUplift, shareFor } from '../src/revenue/model.js';
import { Rng } from '../src/revenue/random.js';
import { generateBatch, splitOf } from '../src/revenue/synth.js';

const batch = (seed: string | number = 'test-seed') =>
  generateBatch({ seed, payments: 400, checkouts: 120, invoices: 80 });

describe('the generator', () => {
  it('gives the same batch for the same seed', () => {
    const a = batch('abc');
    const b = batch('abc');
    expect(a.records.map((r) => r.id)).toEqual(b.records.map((r) => r.id));
    expect(a.records.map((r) => r.amount_paise)).toEqual(b.records.map((r) => r.amount_paise));
    expect([...a.truth.values()]).toEqual([...b.truth.values()]);
  });

  it('gives a different batch for a different seed', () => {
    expect(batch('abc').records.map((r) => r.amount_paise)).not.toEqual(
      batch('xyz').records.map((r) => r.amount_paise),
    );
  });

  it('keeps every amount an integer number of paise', () => {
    // Rupees as floats is the oldest bug in finance software. The reconciler
    // downstream compares these for exact equality.
    for (const record of batch().records) {
      expect(Number.isInteger(record.amount_paise)).toBe(true);
    }
  });

  it('strips the labels off the records themselves', () => {
    // Leakage has to be impossible by construction, not by discipline.
    for (const record of batch().records) {
      expect(record.truth).toBeUndefined();
    }
  });

  it('injects an outage that is actually there to be found', () => {
    const generated = batch();
    const outage = generated.incidents.find((incident) => incident.kind === 'psp_degradation');
    expect(outage).toBeDefined();
    expect(outage?.record_ids.length).toBeGreaterThan(15);
  });

  it('makes risk-blocked payments essentially unrecoverable', () => {
    // The class where acting is worse than not acting. If the generator made
    // these recoverable, the model would learn to retry fraud attempts.
    const generated = batch();
    const blocked = generated.records.filter((r) => r.failure_code === 'risk_block');
    const recoverable = blocked.filter((r) => generated.truth.get(r.id)?.recoverable).length;

    expect(blocked.length).toBeGreaterThan(5);
    expect(recoverable / blocked.length).toBeLessThan(0.15);
  });

  it('never marks a disputed record recoverable', () => {
    const generated = batch();
    for (const record of generated.records.filter((r) => r.in_dispute)) {
      expect(generated.truth.get(record.id)?.recoverable).toBe(false);
    }
  });
});

describe('the split', () => {
  it('is stable across runs and machines', () => {
    expect(splitOf('pay_00001')).toBe(splitOf('pay_00001'));
  });

  it('puts roughly the intended share on each side', () => {
    const ids = batch().records.map((r) => r.id);
    const test = ids.filter((id) => splitOf(id) === 'test').length;
    expect(test / ids.length).toBeGreaterThan(0.25);
    expect(test / ids.length).toBeLessThan(0.45);
  });
});

describe('the model', () => {
  it('is fitted on the training split alone', () => {
    const generated = batch();
    const model = fitModel(generated.records, generated.truth);
    const training = generated.records.filter((r) => splitOf(r.id) === 'train').length;
    expect(model.trained_on).toBe(training);
  });

  it('targets uplift, not recovery', () => {
    // A record that comes back on its own is not a positive, however large.
    expect(isUplift({ recoverable: true, self_heals: true, best_action: 'wait', recoverable_paise: 999 })).toBe(
      false,
    );
    expect(
      isUplift({ recoverable: true, self_heals: false, best_action: 'retry_now', recoverable_paise: 999 }),
    ).toBe(true);
  });

  it('learns that a gateway outage is recoverable', () => {
    const generated = batch();
    const model = fitModel(generated.records, generated.truth);
    // Being inside the outage window should raise the odds, not lower them.
    expect(model.weights['degraded=true']?.lr).toBeGreaterThan(1);
  });

  it('shrinks its own overconfidence rather than reporting it raw', () => {
    const generated = batch();
    const model = fitModel(generated.records, generated.truth);
    // Naive Bayes double-counts correlated evidence; a slope below 1 is the
    // calibration telling it to calm down.
    expect(model.calibration.slope).toBeGreaterThan(0);
    expect(model.calibration.slope).toBeLessThan(1);
  });

  it('is calibrated better than it would be raw', () => {
    const generated = batch();
    const model = fitModel(generated.records, generated.truth);
    const context = analyzeBatch(generated.records);

    const measure = (m: typeof model) => {
      const { assessments } = assessBatch(generated.records, m, { context });
      return evaluate({
        records: generated.records,
        assessments,
        truth: generated.truth,
        threshold: m.threshold,
      }).calibration_error;
    };

    const raw = { ...model, calibration: { slope: 1, intercept: 0 } };
    expect(measure(model)).toBeLessThanOrEqual(measure(raw));
  });
});

describe('what the agent will act on', () => {
  const generated = batch();
  const model = fitModel(generated.records, generated.truth);
  const context = analyzeBatch(generated.records);

  it('never acts on more records than it has capacity for', () => {
    const capacity = { max_actions: 25, rule: 'test' };
    const { assessments } = assessBatch(generated.records, model, { context, capacity });
    expect(assessments.filter((a) => a.flagged).length).toBeLessThanOrEqual(25);
  });

  it('never acts on a record under dispute', () => {
    const { assessments } = assessBatch(generated.records, model, { context });
    const byId = new Map(generated.records.map((r) => [r.id, r]));

    for (const assessment of assessments.filter((a) => a.flagged)) {
      expect(byId.get(assessment.record_id)?.in_dispute).not.toBe(true);
    }
  });

  it('never acts on a shared-signal cluster, and says why', () => {
    const { assessments } = assessBatch(generated.records, model, { context });
    const ringIds = new Set(context.rings.flatMap((ring) => ring.record_ids));

    expect(ringIds.size).toBeGreaterThan(0);
    for (const assessment of assessments) {
      if (!ringIds.has(assessment.record_id)) continue;
      expect(assessment.flagged).toBe(false);
      expect(isHeld(assessment)).toBe(true);
      expect(assessment.evidence[0]?.detail).toContain('human');
    }
  });

  it('prefers a smaller likely recovery to a larger hopeless one', () => {
    // The whole point of multiplying probability by money: capacity is scarce.
    const capacity = { max_actions: 20, rule: 'test' };
    const { assessments } = assessBatch(generated.records, model, { context, capacity });
    const acted = assessments.filter((a) => a.flagged);
    const ignored = assessments.filter((a) => !a.flagged && !isHeld(a));

    const worstActed = Math.min(...acted.map((a) => a.expected_recovery_paise));
    const bestIgnored = Math.max(...ignored.map((a) => a.expected_recovery_paise));
    expect(worstActed).toBeGreaterThanOrEqual(bestIgnored - 1);
  });

  it('gives every record it acts on a reason a human can read', () => {
    const { assessments } = assessBatch(generated.records, model, { context });
    for (const assessment of assessments.filter((a) => a.flagged)) {
      expect(assessment.evidence.length).toBeGreaterThan(0);
      expect(assessment.evidence[0]?.feature).toBeTruthy();
    }
  });
});

/**
 * Scores the held-out split the way the command does.
 *
 * The capacity has to match the records in front of the agent. Selecting from
 * the whole batch and then measuring one split of it compares an agent that
 * spent its budget elsewhere against baselines that spent all of theirs here —
 * which flatters the baselines and is not a comparison of anything.
 */
function evaluateHeldOut(seed: string | number = 'test-seed') {
  const generated = generateBatch({ seed, payments: 400, checkouts: 120, invoices: 80 });
  const model = fitModel(generated.records, generated.truth);
  const context = analyzeBatch(generated.records);
  const heldOut = generated.records.filter((record) => splitOf(record.id) === 'test');
  const capacity = defaultCapacity(heldOut.length);

  const { assessments } = assessBatch(heldOut, model, { context, capacity });
  return {
    generated,
    model,
    evaluation: evaluate({
      records: generated.records,
      assessments,
      truth: generated.truth,
      threshold: model.threshold,
      costs: DEFAULT_COSTS,
      capacity,
    }),
  };
}

describe('the evaluation', () => {
  const { generated, evaluation } = evaluateHeldOut();

  it('reports only held-out records by default', () => {
    const test = generated.records.filter((r) => splitOf(r.id) === 'test').length;
    expect(evaluation.records).toBe(test);
  });

  it('has a confusion matrix that adds up', () => {
    const { matrix } = evaluation;
    expect(
      matrix.true_positive + matrix.false_positive + matrix.true_negative + matrix.false_negative,
    ).toBe(evaluation.records);
  });

  it('nets out to recovered minus every cost', () => {
    const { cost } = evaluation;
    expect(cost.net_paise).toBe(
      cost.recovered_paise - cost.spent_on_hits_paise - cost.spent_on_misses_paise - cost.annoyance_paise,
    );
  });

  it('charges for chasing people who would have paid anyway', () => {
    // The number that stops a recovery tool claiming credit for self-healing
    // payments. If it is ever zero on a real batch, something is wrong.
    expect(evaluation.cost.annoyance_paise).toBeGreaterThan(0);
  });

  it('measures every baseline at the same capacity, and marks the one that is not', () => {
    for (const baseline of evaluation.baselines) {
      if (baseline.name === 'chase everything') expect(baseline.over_capacity).toBe(true);
      else if (baseline.name !== 'chase nothing') {
        expect(baseline.flagged).toBeLessThanOrEqual(evaluation.capacity.max_actions);
      }
    }
  });

  it('cannot beat perfect foresight', () => {
    const ceiling = evaluation.baselines.find((b) => b.name === 'perfect foresight');
    expect(evaluation.cost.net_paise).toBeLessThanOrEqual(ceiling?.cost.net_paise ?? 0);
  });

  it('is never materially worse on money than the heuristics', () => {
    // Deliberately not "beats them by a wide margin". Measured across eight
    // seeds, expected-value ranking runs level with sorting by amount — which
    // is what should happen when amounts span a hundredfold and probabilities
    // span threefold, because size is then already most of the answer. The
    // guard is against a regression that makes the ranking actively bad, not a
    // claim of a lift the data does not support.
    for (const seed of ['test-seed', 'alpha', 'bravo', 'charlie', 'delta', 'echo']) {
      const run = evaluateHeldOut(seed).evaluation;
      const best = Math.max(
        ...run.baselines
          .filter((b) => b.name === 'biggest first' || b.name === 'newest first')
          .map((b) => b.cost.net_paise),
      );
      expect(run.cost.net_paise, `seed ${seed}`).toBeGreaterThan(best * 0.97);
    }
  });

  it('touches nothing it is forbidden to touch, on any batch', () => {
    // This is where the agent and the heuristics actually differ, and it is a
    // hard invariant rather than an average: one retry of a fraud ring or one
    // dunning message into an open dispute is a failure whatever the recovery
    // column says.
    for (const seed of ['test-seed', 'alpha', 'bravo', 'charlie', 'delta', 'echo']) {
      const run = evaluateHeldOut(seed).evaluation;
      expect(run.forbidden.in_population, `seed ${seed}`).toBeGreaterThan(0);
      expect(run.forbidden.touched, `seed ${seed}`).toBe(0);
    }
  });

  it('leaves the heuristics free to break that rule, and counts it', () => {
    // Not an accusation — a measurement. Sorting by size has no way to know a
    // record is under dispute, which is the argument for having a policy at all.
    const runs = ['test-seed', 'bravo', 'charlie', 'delta'].map((seed) => evaluateHeldOut(seed).evaluation);
    const touched = runs.flatMap((run) =>
      run.baselines.filter((b) => b.name === 'newest first').map((b) => b.harmful_touches),
    );
    expect(touched.some((count) => count > 0)).toBe(true);
  });
});

describe('the generator\'s own randomness', () => {
  it('produces amounts with a long tail rather than a flat spread', () => {
    const rng = new Rng('amounts');
    const amounts = Array.from({ length: 2000 }, () => rng.amount(2000));
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted[1000] as number;
    const top = sorted[1990] as number;
    // A uniform batch would make money-weighted and count-weighted metrics the
    // same number, and hide the distinction the report exists to draw.
    expect(top).toBeGreaterThan(median * 5);
  });
});

/**
 * Explaining one record.
 *
 * The model is a scorecard rather than something with better numbers precisely
 * so this can exist: every step from the base rate to the decision has to print
 * as a sentence somebody can disagree with. These tests check the chain is
 * complete and that the answer key stays out of it.
 */
describe('the evidence behind one record', () => {
  const generated = batch('explain-seed');
  const model = fitModel(generated.records, generated.truth);
  const context = analyzeBatch(generated.records);
  const { assessments } = assessBatch(generated.records, model, { context });
  const flagged = assessments.find((assessment) => assessment.flagged) as (typeof assessments)[number];

  it('gives every scored record a reason for each feature that moved it', () => {
    expect(flagged.evidence.length).toBeGreaterThan(3);
    for (const item of flagged.evidence) {
      expect(item.feature).toBeTruthy();
      // `detail` carries the bucket and the likelihood ratio — "0-15 ×4.03" —
      // which is the part somebody argues with.
      expect(item.detail).toMatch(/×\d/);
    }
  });

  it('orders the evidence by how much it actually moved the score', () => {
    const points = flagged.evidence.map((item) => Math.abs(item.points));
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  it('reconstructs the score from the base rate and the evidence', () => {
    // The arithmetic the explanation prints has to be the arithmetic that ran.
    // Ten points is a doubling of the odds, and the fitted shrink is applied
    // last, so the chain has to close.
    const prior = Math.log(model.base_rate / (1 - model.base_rate));
    const contributions = flagged.evidence.reduce((sum, item) => sum + (item.points / 10) * Math.LN2, 0);
    const logOdds = model.calibration.slope * (prior + contributions) + model.calibration.intercept;
    const reconstructed = Math.round((1 / (1 + Math.exp(-logOdds))) * 100);

    expect(Math.abs(reconstructed - flagged.score)).toBeLessThanOrEqual(1);
  });

  it('puts the hold first when there is one, so nothing below it is read as a score', () => {
    const held = assessments.find((assessment) => isHeld(assessment));
    expect(held?.evidence[0]?.feature).toBe('hold');
    expect(held?.score).toBe(0);
    expect(held?.expected_recovery_paise).toBe(0);
  });

  it('prices a record at probability times what is actually recoverable', () => {
    const byId = new Map(generated.records.map((record) => [record.id, record]));
    const record = byId.get(flagged.record_id) as (typeof generated.records)[number];
    const share = shareFor(model, record);

    const expected = Math.round((flagged.score / 100) * record.amount_paise * share);
    // Rounding at a different point can move this by a rupee or two.
    expect(Math.abs(expected - flagged.expected_recovery_paise)).toBeLessThan(record.amount_paise * 0.02);
  });
});
