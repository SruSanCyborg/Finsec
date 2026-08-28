/**
 * The detector: a scorecard fitted on the training half and nothing else.
 *
 * It answers one question, and it is not "will this come back?" — it is **"will
 * this come back *because we acted*?"** A payment the customer would have
 * retried themselves tomorrow is not revenue anybody recovered, and a model
 * trained to predict recovery rather than uplift learns to chase exactly those,
 * because they are the easiest positives in the data. The target here is
 * `recoverable && !self_heals`.
 *
 * The method is naive Bayes on odds: a prior from the base rate, multiplied by
 * one likelihood ratio per feature. Chosen because every step of it can be
 * printed — `failure=psp_degraded ×4.2` is a sentence a payments lead can
 * disagree with, and a disagreement is worth more than a percentage point of
 * AUC nobody can interrogate.
 *
 * The assumption it makes is false, and worth saying out loud: `rail=card` and
 * `failure=card_expired` are not independent, so correlated evidence gets
 * counted twice and the scores are sharper than they deserve. That is why the
 * evaluation reports calibration alongside precision — a model that is wrong
 * about its own confidence should be caught by its own report, not by a user.
 */

import { estimatedCost, DEFAULT_COSTS } from './cost.js';
import type { CostModel } from './cost.js';
import { analyzeBatch, featuresOf } from './features.js';
import type { BatchContext } from './features.js';
import { chooseL2, fitLogistic } from './logistic.js';
import { splitOf } from './synth.js';
import type { Assessment, Evidence, GroundTruth, RecordKind, RiskRecord } from './types.js';

export interface FeatureWeight {
  /** Likelihood ratio: how much more often this appears on uplift than not. */
  lr: number;
  /** Occurrences in training, so a weight fitted on six records is visibly thin. */
  support: number;
}

/**
 * How much of a record actually comes back, given that any of it does.
 *
 * The second half of an expected value, and the half that gets forgotten. A
 * failed payment recovers in full or not at all; a receivable at 120 days
 * settles at a discount, and a steep one. Keyed by kind *and* by the bucket
 * that drives the discount — one number per kind put every invoice at the same
 * 92%, which made the ranking agree with sorting by size and left the model
 * with nothing to add over a spreadsheet.
 *
 * Keys are `kind` and `kind:bucket`, with the coarser one as the fallback, so a
 * bucket the training split never saw degrades to the kind's average instead of
 * to a guess.
 */
export type RecoveryShare = Record<string, number>;

/** The bucket a record's recovery share is keyed by. */
export function shareKeyOf(record: RiskRecord): string {
  if (record.kind === 'invoice') {
    const days = record.days_overdue ?? 0;
    return `invoice:${days <= 15 ? '0-15' : days <= 45 ? '16-45' : days <= 90 ? '46-90' : '90+'}`;
  }
  if (record.kind === 'checkout') return `checkout:${record.drop_off_stage}`;
  return `payment:${record.failure_code}`;
}

/** The fitted share for a record, falling back to its kind, then to all of it. */
export function shareFor(model: Model, record: RiskRecord): number {
  return model.recovery_share?.[shareKeyOf(record)] ?? model.recovery_share?.[record.kind] ?? 1;
}

/**
 * What the agent is allowed to do in one run.
 *
 * The binding constraint on a recovery agent is not the price of an SMS. It is
 * that the card networks watch decline-and-retry ratios, NACH caps
 * re-presentments per mandate, TRAI caps commercial contact, and the humans who
 * handle escalations can only handle so many a day. Without a cap the
 * expected-value arithmetic says to chase every record in the batch — which is
 * arithmetically correct, operationally impossible, and the exact behaviour that
 * gets a merchant's retry privileges revoked.
 */
export interface Capacity {
  /** Most records the agent may act on in this run. */
  max_actions: number;
  /** How that number was arrived at, printed wherever it binds. */
  rule: string;
}

/**
 * A one-line correction for the model's overconfidence.
 *
 * Naive Bayes double-counts correlated evidence — `rail=card` and
 * `failure=card_expired` are the same fact told twice — so its raw scores run
 * hotter than reality: a record it calls 84% comes back 60% of the time. Platt
 * scaling fits two numbers on the training split, `p = sigmoid(a·logodds + b)`,
 * and `a < 1` is the model being told to calm down.
 *
 * Kept as a visible pair of numbers rather than folded into the weights,
 * because "the scores needed shrinking by a third" is a fact about the model
 * that its own report should carry.
 */
export interface Calibration {
  slope: number;
  intercept: number;
}

export interface Model {
  schema: 'sirius.revenue.model/v1';
  fitted_at: string;
  /** Records the fit saw. Test records were never loaded, let alone used. */
  trained_on: number;
  base_rate: number;
  calibration: Calibration;
  recovery_share: RecoveryShare;
  weights: Record<string, FeatureWeight>;
  /**
   * The floor: the score below which acting is not worth it at any price.
   *
   * A floor, not a cut-off. What actually decides which records get worked is
   * expected value under the capacity cap — see `selection_rule`. An earlier
   * version used this as the whole decision and lost to sorting by amount in a
   * spreadsheet, which is what happens when a model that predicts probability
   * is asked to allocate money without ever multiplying the two together.
   */
  threshold: number;
  threshold_rule: string;
  /** How the weights were fitted, for anyone asking what model this is. */
  fit_rule?: string;
  /** How the records that get worked are chosen from the ones above the floor. */
  selection_rule: string;
  capacity: Capacity;
  train_expected_value_paise: number;
}

/** The target: money that comes back because the agent acted. */
export function isUplift(truth: GroundTruth): boolean {
  return truth.recoverable && !truth.self_heals;
}

/**
 * Fits the weights on the training split.
 *
 * Laplace smoothing on both sides, so a feature seen four times cannot produce
 * an infinite likelihood ratio and drag a record to certainty on its own.
 */
export function fitModel(
  records: readonly RiskRecord[],
  truth: ReadonlyMap<string, GroundTruth>,
  costs: CostModel = DEFAULT_COSTS,
  capacity?: Capacity,
): Model {
  const context = analyzeBatch(records);
  const training = records.filter((record) => splitOf(record.id) === 'train');

  let positives = 0;
  const positiveCounts = new Map<string, number>();
  const negativeCounts = new Map<string, number>();

  for (const record of training) {
    const label = truth.get(record.id);
    if (!label) continue;
    const uplift = isUplift(label);
    if (uplift) positives += 1;

    for (const feature of featuresOf(record, context)) {
      const counts = uplift ? positiveCounts : negativeCounts;
      counts.set(feature, (counts.get(feature) ?? 0) + 1);
    }
  }

  const negatives = training.length - positives;

  // What a recovered record is actually worth, from the labels: once per kind,
  // and once per bucket within the kind. Buckets with too little support fall
  // back to the kind rather than reporting an average of four records as if it
  // were a rate.
  const share: RecoveryShare = {};
  const recovered = training
    .map((record) => ({ record, label: truth.get(record.id) }))
    .filter((row): row is { record: RiskRecord; label: GroundTruth } => Boolean(row.label) && isUplift(row.label as GroundTruth));

  const meanShare = (rows: typeof recovered) =>
    round(
      rows.reduce((sum, row) => sum + row.label.recoverable_paise / row.record.amount_paise, 0) / rows.length,
      3,
    );

  for (const kind of ['payment', 'checkout', 'invoice'] as const) {
    const rows = recovered.filter((row) => row.record.kind === kind);
    if (rows.length > 0) share[kind] = meanShare(rows);
  }

  const buckets = new Map<string, typeof recovered>();
  for (const row of recovered) {
    const key = shareKeyOf(row.record);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  for (const [key, rows] of buckets) {
    if (rows.length >= 12) share[key] = meanShare(rows);
  }

  // The weights are fitted jointly, not counted per feature.
  //
  // This was Naive Bayes: each feature's weight was P(f|uplift)/P(f|not),
  // estimated independently. `rail` and `failure_code` are strongly correlated,
  // so that counted one fact twice — and once the interactions were named
  // explicitly it counted the same fact three times, which is the opposite of
  // what naming them was for. Logistic regression learns one set of
  // coefficients over the whole feature space, so a correlated pair shares the
  // weight instead of each claiming all of it.
  //
  // Nothing downstream changes. A coefficient is a contribution to the
  // log-odds, exactly as log(likelihood ratio) was, so `exp(coefficient)` goes
  // into the same `lr` field, `scoreRecord` sums the same logs, and the
  // evidence ladder still reads "×2.4".
  const rows = training
    .map((record) => ({ record, label: truth.get(record.id) }))
    .filter((row): row is { record: RiskRecord; label: GroundTruth } => Boolean(row.label))
    .map((row) => ({ features: featuresOf(row.record, context), label: isUplift(row.label) }));

  const l2 = chooseL2(rows);
  const fit = fitLogistic(rows, { l2 });

  const weights: Record<string, FeatureWeight> = {};
  for (const [feature, coefficient] of fit.coefficients) {
    const withUplift = positiveCounts.get(feature) ?? 0;
    const without = negativeCounts.get(feature) ?? 0;
    weights[feature] = {
      // Bounded before exponentiating: a coefficient of 40 is a feature seen
      // twice, and `Infinity` in the ladder is not evidence.
      lr: round(Math.exp(Math.min(Math.max(coefficient, -8), 8)), 4),
      support: withUplift + without,
    };
  }

  // The intercept is the answer with no features, which is what `base_rate`
  // means to `scoreRecord` — it turns it straight back into log-odds.
  const baseRate = 1 / (1 + Math.exp(-fit.intercept));
  const limit = capacity ?? defaultCapacity(training.length);
  const fitNote =
    `logistic regression, L2 ${l2} chosen on a fold of the training half · ` +
    `${fit.iterations} iterations${fit.converged ? '' : ' (iteration cap)'} · ` +
    `train log-loss ${fit.log_loss.toFixed(4)}`;

  const uncalibrated: Model = {
    schema: 'sirius.revenue.model/v1',
    fitted_at: new Date().toISOString(),
    trained_on: training.length,
    base_rate: round(baseRate, 4),
    calibration: { slope: 1, intercept: 0 },
    recovery_share: share,
    weights,
    threshold: 50,
    threshold_rule: '',
    selection_rule: '',
    capacity: limit,
    train_expected_value_paise: 0,
  };

  const calibration = refitCalibration(uncalibrated, training, truth, context);

  const draft: Model = {
    schema: 'sirius.revenue.model/v1',
    fitted_at: new Date().toISOString(),
    trained_on: training.length,
    base_rate: round(baseRate, 4),
    calibration,
    recovery_share: share,
    weights,
    threshold: 50,
    threshold_rule: '',
    selection_rule: '',
    capacity: limit,
    train_expected_value_paise: 0,
  };

  const chosen = chooseFloor(draft, training, truth, context, costs);
  return {
    ...draft,
    fit_rule: fitNote,
    threshold: chosen.floor,
    threshold_rule:
      'the lowest score at which acting still paid for itself on the training split, ' +
      'counting the annoyance of chasing someone who would have paid anyway',
    selection_rule:
      `above the floor, records are ranked by expected value — probability × recoverable amount − cost — ` +
      `and worked down to the capacity limit (${limit.max_actions}: ${limit.rule})`,
    train_expected_value_paise: chosen.value,
  };
}

/**
 * Fits the shrink by gradient descent on log-loss over the training split.
 *
 * Two parameters, two hundred steps, no library. Deterministic, so the same
 * batch produces the same model on any machine — which is the property that
 * makes a reported metric checkable rather than anecdotal.
 */
export function refitCalibration(
  model: Model,
  training: readonly RiskRecord[],
  truth: ReadonlyMap<string, GroundTruth>,
  context: BatchContext,
): Calibration {
  const rows = training
    .map((record) => ({ label: truth.get(record.id), logOdds: logOddsOf(record, model, context) }))
    .filter((row): row is { label: GroundTruth; logOdds: number } => Boolean(row.label))
    .map((row) => ({ y: isUplift(row.label) ? 1 : 0, x: row.logOdds }));

  if (rows.length < 30) return { slope: 1, intercept: 0 };

  const identity: Calibration = { slope: 1, intercept: 0 };

  // Kept only if it helps, measured on rows it was not fitted to.
  //
  // Platt scaling was a clear win over Naive Bayes, which double-counts
  // correlated evidence and is reliably over-confident — the slope came out
  // below 1 and the fit pulled it back. A regularised logistic fit is close to
  // calibrated already, and squeezing a second sigmoid onto it made expected
  // calibration error *worse* on held-out records: 8.9% against 6.6% raw. A
  // calibration step that decalibrates is worth nothing, and shipping it
  // because it is called calibration is how a report earns the word without
  // the property.
  //
  // The comparison has to be on rows outside the fit. Scoring both on a fifth
  // that was itself part of the fit picks the fitted curve every time — it was
  // trained to fit those rows — which is the first way this was written and it
  // changed nothing at all.
  const fold = rows.filter((_, index) => index % 5 !== 0);
  const check = rows.filter((_, index) => index % 5 === 0);
  if (check.length < 20) return plattOn(rows);

  const candidate = plattOn(fold);
  if (calibrationErrorOn(check, candidate) > calibrationErrorOn(check, identity)) return identity;

  // It helps, so refit on everything — the fold existed to make the choice, not
  // to be the model.
  return plattOn(rows);
}

/** Two-parameter Platt scaling of a log-odds score, by gradient descent. */
function plattOn(rows: readonly { y: number; x: number }[]): Calibration {
  let slope = 1;
  let intercept = 0;
  const rate = 0.05;

  for (let step = 0; step < 200; step += 1) {
    let gradSlope = 0;
    let gradIntercept = 0;
    for (const row of rows) {
      const p = 1 / (1 + Math.exp(-(slope * row.x + intercept)));
      const error = p - row.y;
      gradSlope += error * row.x;
      gradIntercept += error;
    }
    slope -= (rate * gradSlope) / rows.length;
    intercept -= (rate * gradIntercept) / rows.length;
  }

  return { slope: round(slope, 4), intercept: round(intercept, 4) };
}

/** Expected calibration error: the gap between confidence and reality. */
function calibrationErrorOn(
  rows: readonly { y: number; x: number }[],
  calibration: Calibration,
): number {
  const bins = new Map<number, { sum: number; hits: number; n: number }>();
  for (const row of rows) {
    const p = 1 / (1 + Math.exp(-(calibration.slope * row.x + calibration.intercept)));
    const bin = Math.min(4, Math.floor(p * 5));
    const cell = bins.get(bin) ?? { sum: 0, hits: 0, n: 0 };
    cell.sum += p;
    cell.hits += row.y;
    cell.n += 1;
    bins.set(bin, cell);
  }

  let error = 0;
  for (const cell of bins.values()) {
    error += (cell.n / rows.length) * Math.abs(cell.hits / cell.n - cell.sum / cell.n);
  }
  return error;
}

/** The raw scorecard total, before calibration. */
function logOddsOf(record: RiskRecord, model: Model, context: BatchContext): number {
  const prior = Math.min(Math.max(model.base_rate, 0.001), 0.999);
  let logOdds = Math.log(prior / (1 - prior));
  for (const feature of featuresOf(record, context)) {
    const weight = model.weights[feature];
    if (weight) logOdds += Math.log(weight.lr);
  }
  return logOdds;
}

/**
 * A day's worth of room, when nobody has said otherwise.
 *
 * A fifth of the batch is a stand-in for a real operations limit, and it is
 * printed everywhere it binds so that it reads as the assumption it is.
 */
export function defaultCapacity(records: number): Capacity {
  return {
    max_actions: Math.max(10, Math.ceil(records * 0.2)),
    rule: '20% of the batch — a stand-in for one cycle of operational headroom',
  };
}

/**
 * Sweeps every threshold and keeps the one worth the most money in training.
 *
 * Not F1. F1 treats a missed ₹80,000 invoice and a needless ₹49 SMS as
 * commensurable, and they are not — the whole reason to have a cost model is to
 * refuse that trade. The chosen operating point is the one a finance team would
 * choose if it read the same table.
 */
function chooseFloor(
  model: Model,
  training: readonly RiskRecord[],
  truth: ReadonlyMap<string, GroundTruth>,
  context: BatchContext,
  costs: CostModel,
): { floor: number; value: number } {
  // Score once, not once per candidate floor: the sweep is otherwise quadratic
  // in the batch and this runs on every command.
  const scored = training
    .map((record) => ({
      record,
      label: truth.get(record.id),
      score: scoreRecord(record, model, context).score,
    }))
    .filter((row): row is { record: RiskRecord; label: GroundTruth; score: number } => Boolean(row.label));

  let best = { floor: 0, value: -Infinity };

  for (let floor = 0; floor <= 90; floor += 1) {
    let value = 0;
    for (const row of scored) {
      if (row.score < floor) continue;
      value -= estimatedCost(row.record.kind, costs);
      if (isUplift(row.label)) value += row.label.recoverable_paise * costs.margin;
      // Acting on a record that would have healed anyway buys nothing and costs
      // the customer's patience, which the cost model prices.
      else if (row.label.self_heals) value -= costs.annoyance_paise;
    }
    if (value > best.value) best = { floor, value: Math.round(value) };
  }

  return best;
}

/** Score one record, and say why. */
export function scoreRecord(
  record: RiskRecord,
  model: Model,
  context: BatchContext,
): { score: number; probability: number; evidence: Evidence[] } {
  const prior = Math.min(Math.max(model.base_rate, 0.001), 0.999);
  let logOdds = Math.log(prior / (1 - prior));
  const evidence: Evidence[] = [];

  for (const feature of featuresOf(record, context)) {
    const weight = model.weights[feature];
    if (!weight) continue;
    const contribution = Math.log(weight.lr);
    logOdds += contribution;

    const [name, value] = feature.split('=');
    evidence.push({
      feature: name as string,
      detail: `${value} ${'×'}${weight.lr.toFixed(2)}${weight.support < 15 ? ` (thin: ${weight.support})` : ''}`,
      // Points are a readable rendering of the same number, not a second model:
      // ten points is a doubling of the odds.
      points: round((contribution / Math.LN2) * 10, 1),
    });
  }

  // The evidence above is the model's reasoning and is reported raw; the score
  // is what the model is willing to stand behind after being told how often it
  // has been wrong before.
  const calibration = model.calibration ?? { slope: 1, intercept: 0 };
  const probability = 1 / (1 + Math.exp(-(calibration.slope * logOdds + calibration.intercept)));
  evidence.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  return { score: Math.round(probability * 100), probability, evidence };
}

/**
 * Scores a whole batch.
 *
 * Two records get a decision the model never gets to overrule, because being
 * confident about them is not the same as being allowed to act: an open dispute
 * is a regulatory hold, and a ring member is a case for a human. Both are
 * dropped to a score of zero with the reason attached, so the audit trail shows
 * a decision rather than an absence.
 */
export function assessBatch(
  records: readonly RiskRecord[],
  model: Model,
  options: { context?: BatchContext; costs?: CostModel; capacity?: Capacity } = {},
): { assessments: Assessment[]; context: BatchContext; capacity: Capacity } {
  const context = options.context ?? analyzeBatch(records);
  const costs = options.costs ?? DEFAULT_COSTS;
  const capacity = options.capacity ?? model.capacity ?? defaultCapacity(records.length);
  const assessments: Assessment[] = [];

  for (const record of records) {
    const { score, probability, evidence } = scoreRecord(record, model, context);

    const held = holdReason(record, context);

    const expected = held ? 0 : Math.round(probability * record.amount_paise * shareFor(model, record));

    assessments.push({
      record_id: record.id,
      kind: record.kind,
      score: held ? 0 : score,
      // Set below, once every record has been scored: which ones get worked is
      // a decision about the batch, not about any single record in it.
      flagged: false,
      amount_paise: record.amount_paise,
      expected_recovery_paise: expected,
      evidence: held ? [{ feature: 'hold', detail: held, points: 0 }, ...evidence] : evidence,
    });
  }

  select(assessments, model, capacity, costs);
  return { assessments, context, capacity };
}

/**
 * Records the agent is not allowed to act on, and why.
 *
 * These are hard holds, not low scores. The difference matters: a low score is
 * a record the agent would work if it had more room, and a hold is one it would
 * not work at any price. Written as one function so the list is somewhere a
 * reviewer can read it rather than spread through the scoring.
 *
 * `risk_block` was missing from this list at first, and the evaluation caught
 * it — the detector was retrying a payment the issuer had already refused on
 * risk grounds. A low probability is not a prohibition, and treating the two as
 * the same is how a recovery agent ends up making a second attempt at
 * something somebody else's fraud controls had already stopped.
 */
function holdReason(record: RiskRecord, context: BatchContext): string | undefined {
  if (record.in_dispute) return 'an open dispute: contact is on hold until it closes';
  if (context.ringMembers.has(record.id)) {
    return 'shares a device or BIN with several other parties: for a human, not a retry';
  }
  if (record.failure_code === 'risk_block') {
    return 'the issuer refused this on risk grounds — a retry is a second attempt at a refusal';
  }
  return undefined;
}

/**
 * Chooses which records get worked, given room for only so many.
 *
 * Rank by expected value — probability times what is actually recoverable,
 * less what acting costs — and work down until the capacity is used up. The
 * floor is applied first, so a hopeless ₹8,00,000 invoice cannot buy its way
 * into the queue on size alone.
 *
 * Ranking by score instead, which is what this did first, loses to sorting by
 * amount in a spreadsheet: a model that knows the probability but never
 * multiplies it by the money is not allocating anything, it is sorting.
 */
function select(
  assessments: Assessment[],
  model: Model,
  capacity: Capacity,
  costs: CostModel,
): void {
  const eligible = assessments
    .filter((assessment) => assessment.score >= model.threshold && !isHeld(assessment))
    .map((assessment) => ({
      assessment,
      value: assessment.expected_recovery_paise - estimatedCost(assessment.kind, costs),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  for (const row of eligible.slice(0, capacity.max_actions)) {
    row.assessment.flagged = true;
  }
}

/** A record the agent has refused to touch, for a stated reason. */
export function isHeld(assessment: Assessment): boolean {
  return assessment.evidence[0]?.feature === 'hold';
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
