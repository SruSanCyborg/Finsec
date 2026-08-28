/**
 * A synthetic BFSI batch, generated from a causal model rather than sampled noise.
 *
 * The point of generating it this way is that the labels are *consequences* of
 * the record, not a column drawn independently of it. A batch where
 * `recoverable` was rolled at random would let any detector score 50% and no
 * detector score better, and the precision/recall table would be measuring
 * nothing. Here a `network_timeout` inside a degradation window really is
 * recoverable, because the model says the outage ends — and the detector has to
 * work that out from the same fields a real one would see.
 *
 * The noise is deliberate too. Every outcome is a coin weighted by the record,
 * so no feature is a giveaway and a perfect score is impossible. A detector that
 * reported 100% precision here would be evidence of a leak, not of quality.
 *
 * **All institutions named here are fictional.** The rails (UPI, NACH, RuPay)
 * are real infrastructure and their failure modes are real; the banks and
 * gateways are invented, because generating outage records against a real
 * company's name produces a document that reads as a claim about that company.
 */

import { createHash } from 'node:crypto';

import { Rng } from './random.js';
import type {
  Channel,
  FailureCode,
  GroundTruth,
  Intervention,
  Party,
  Rail,
  RiskRecord,
  Split,
} from './types.js';

/** Invented gateways and banks. See the header. */
const PSPS = ['nimbuspay', 'tatva', 'kaveri-pg', 'saral', 'peninsula-gw'] as const;

const RAILS: readonly (readonly [Rail, number])[] = [
  ['upi_collect', 32],
  ['upi_intent', 22],
  ['card', 20],
  ['netbanking', 8],
  ['nach_mandate', 12],
  ['emandate_upi', 6],
];

/** Which failures each rail actually produces. A card cannot fail `mandate_revoked`. */
const FAILURES: Record<Rail, readonly (readonly [FailureCode, number])[]> = {
  upi_collect: [
    ['insufficient_funds', 30],
    ['network_timeout', 22],
    ['authentication_failed', 18],
    ['psp_degraded', 10],
    ['limit_exceeded', 8],
    ['issuer_decline', 8],
    ['risk_block', 4],
  ],
  upi_intent: [
    ['network_timeout', 30],
    ['insufficient_funds', 24],
    ['authentication_failed', 20],
    ['psp_degraded', 12],
    ['issuer_decline', 8],
    ['risk_block', 6],
  ],
  card: [
    ['do_not_honor', 26],
    ['insufficient_funds', 20],
    ['authentication_failed', 16],
    ['card_expired', 14],
    ['issuer_decline', 12],
    ['risk_block', 7],
    ['limit_exceeded', 5],
  ],
  netbanking: [
    ['network_timeout', 34],
    ['authentication_failed', 26],
    ['psp_degraded', 20],
    ['insufficient_funds', 20],
  ],
  nach_mandate: [
    ['insufficient_funds', 46],
    ['mandate_expired', 20],
    ['mandate_revoked', 14],
    ['issuer_decline', 12],
    ['limit_exceeded', 8],
  ],
  emandate_upi: [
    ['insufficient_funds', 40],
    ['mandate_expired', 24],
    ['mandate_revoked', 16],
    ['network_timeout', 12],
    ['authentication_failed', 8],
  ],
};

/**
 * The causal core: how recoverable each failure class is, and by what.
 *
 * These are the model's assumptions, written down where they can be argued
 * with. `risk_block` at 2% is the important one — it is the class where acting
 * is worse than not acting, and a recovery agent that retries it is a recovery
 * agent that helps a fraud attempt succeed.
 */
const RECOVERY_MODEL: Record<
  FailureCode,
  { base: number; selfHeal: number; action: Intervention }
> = {
  insufficient_funds: { base: 0.58, selfHeal: 0.22, action: 'retry_after_cooldown' },
  network_timeout: { base: 0.88, selfHeal: 0.45, action: 'retry_now' },
  psp_degraded: { base: 0.9, selfHeal: 0.38, action: 'switch_rail' },
  authentication_failed: { base: 0.54, selfHeal: 0.3, action: 'retry_now' },
  issuer_decline: { base: 0.34, selfHeal: 0.12, action: 'switch_rail' },
  do_not_honor: { base: 0.26, selfHeal: 0.08, action: 'switch_rail' },
  limit_exceeded: { base: 0.5, selfHeal: 0.2, action: 'retry_after_cooldown' },
  card_expired: { base: 0.42, selfHeal: 0.05, action: 'dunning_email' },
  mandate_expired: { base: 0.68, selfHeal: 0.02, action: 'mandate_reauth' },
  mandate_revoked: { base: 0.05, selfHeal: 0.0, action: 'write_off' },
  risk_block: { base: 0.02, selfHeal: 0.0, action: 'human_review' },
};

/**
 * A change in the world the detector was not trained on.
 *
 * The honest objection to any result on synthetic data is that the model was
 * fitted to the same generator that produced the test set, so of course it
 * works. A held-out split answers a weaker version of that — same distribution,
 * unseen rows — and says nothing about the version that actually happens: the
 * traffic mix moves, a different gateway degrades, the portfolio shifts toward
 * mandates, amounts inflate.
 *
 * These knobs perturb the *generator*, not the sample, so a model fitted before
 * the shift meets a world that genuinely obeys different rules. Everything is
 * multiplicative on the existing weights, so a shift describes a direction
 * rather than a replacement, and a shift of 1 is the world unchanged.
 */
export interface DistributionShift {
  /** Short name, used as the row label. */
  name: string;
  /** One sentence a person can disagree with. */
  what: string;
  /** Multipliers on the rail mix. */
  rails?: Partial<Record<Rail, number>>;
  /** Multipliers on the failure mix, applied within whichever rail is chosen. */
  failures?: Partial<Record<FailureCode, number>>;
  /** Multiplier on the median amount. */
  amount?: number;
  /** Spread of the amount distribution; the default is 1.1. */
  amountSigma?: number;
  /** Whether a gateway degradation is injected at all. */
  degradation?: 'none' | 'normal';
  /** Multiplier on how recoverable a failure actually is. */
  recovery?: number;
}

export interface GenerateOptions {
  seed: number | string;
  payments: number;
  checkouts: number;
  invoices: number;
  /** The batch's "now" — every relative time is measured back from this. */
  asOf?: Date;
  /** A world the detector was not trained on. See `DistributionShift`. */
  shift?: DistributionShift;
}

/** Applies multipliers to a weighted table, dropping anything scaled to zero. */
function reweight<T extends string>(
  table: readonly (readonly [T, number])[],
  multipliers: Partial<Record<T, number>> | undefined,
): readonly (readonly [T, number])[] {
  if (!multipliers) return table;
  const scaled = table
    .map(([value, weight]) => [value, weight * (multipliers[value] ?? 1)] as const)
    .filter(([, weight]) => weight > 0);
  return scaled.length > 0 ? scaled : table;
}

export interface GeneratedBatch {
  manifest: BatchManifest;
  records: RiskRecord[];
  truth: Map<string, GroundTruth>;
  /** The injected incidents, so a detector's root-cause claim can be checked. */
  incidents: Incident[];
}

export interface Incident {
  kind: 'psp_degradation' | 'abuse_ring';
  psp?: string;
  rail?: Rail;
  device_hash?: string;
  bin?: string;
  from: string;
  to: string;
  record_ids: string[];
}

export interface BatchManifest {
  schema: 'sirius.batch/v1';
  seed: number | string;
  generated_at: string;
  as_of: string;
  counts: { payments: number; checkouts: number; invoices: number };
  /** Stated in the manifest so nobody has to read the generator to know. */
  split_rule: string;
  incidents: Incident[];
}

/**
 * Which half of the data a record belongs to.
 *
 * Hashed from the id, not drawn at random and not cut by time: the split has to
 * be the same on every machine and every run, and a time cut would put the
 * injected incidents entirely on one side.
 */
export function splitOf(id: string): Split {
  const digest = createHash('sha256').update(id).digest();
  return (digest[0] as number) % 100 < 60 ? 'train' : 'test';
}

export function generateBatch(options: GenerateOptions): GeneratedBatch {
  const rng = new Rng(options.seed);
  const asOf = options.asOf ?? new Date('2026-08-24T18:30:00.000Z');
  const records: RiskRecord[] = [];
  const truth = new Map<string, GroundTruth>();
  const incidents: Incident[] = [];

  // ---- one PSP degradation window, so root-cause analysis has something true
  // to find. Failures inside it are highly recoverable once the window closes,
  // which is exactly the case a per-record retry policy gets wrong.
  const degradedPsp = rng.pick(PSPS);
  const degradedRail = rng.pick(['upi_collect', 'upi_intent', 'netbanking'] as const);
  const degradeStart = new Date(asOf.getTime() - rng.int(6, 20) * 3600_000);
  const degradeEnd = new Date(degradeStart.getTime() + rng.int(35, 90) * 60_000);
  const degradedIds: string[] = [];

  // ---- one abuse ring: records sharing a device and a BIN, none recoverable.
  // Retrying these is not a wasted rupee, it is a retry of somebody else's
  // fraud attempt, which is why the agent must be able to tell them apart.
  const ringDevice = `dev_${hex(rng, 10)}`;
  const ringBin = `4${rng.int(10000, 99999)}`;
  const ringSize = rng.int(6, 14);
  const ringIds: string[] = [];

  for (let i = 0; i < options.payments; i += 1) {
    const inRing = ringIds.length < ringSize && rng.chance(ringSize / options.payments);
    const record = makePayment(rng, asOf, i, {
      ...(options.shift ? { shift: options.shift } : {}),
      degradedPsp,
      degradedRail,
      degradeStart,
      degradeEnd,
      inRing,
      ringDevice,
      ringBin,
    });

    if (inRing) ringIds.push(record.id);
    if (
      record.psp === degradedPsp &&
      record.rail === degradedRail &&
      withinWindow(record.occurred_at, degradeStart, degradeEnd)
    ) {
      degradedIds.push(record.id);
    }

    truth.set(record.id, record.truth as GroundTruth);
    delete record.truth;
    records.push(record);
  }

  // The outage is *injected*, not hoped for. Spreading ordinary traffic across
  // three days and waiting for enough of it to land in one gateway's bad hour
  // produces a batch with no incident in it perhaps four times in five — and an
  // incident nobody can rely on being there is not a fixture, it is a lottery.
  // A world with no gateway outage in it. The detector leans on `degraded`
  // heavily and correctly; the question this answers is what is left when the
  // signal it leans on is simply absent.
  const burst = options.shift?.degradation === 'none' ? 0 : rng.int(22, 38);
  for (let i = 0; i < burst; i += 1) {
    const record = makePayment(rng, asOf, options.payments + i, {
      ...(options.shift ? { shift: options.shift } : {}),
      degradedPsp,
      degradedRail,
      degradeStart,
      degradeEnd,
      inRing: false,
      ringDevice,
      ringBin,
      forceDegraded: true,
    });
    degradedIds.push(record.id);
    truth.set(record.id, record.truth as GroundTruth);
    delete record.truth;
    records.push(record);
  }

  for (let i = 0; i < options.checkouts; i += 1) {
    const record = makeCheckout(rng, asOf, i);
    truth.set(record.id, record.truth as GroundTruth);
    delete record.truth;
    records.push(record);
  }

  for (let i = 0; i < options.invoices; i += 1) {
    const record = makeInvoice(rng, asOf, i);
    truth.set(record.id, record.truth as GroundTruth);
    delete record.truth;
    records.push(record);
  }

  if (degradedIds.length > 0) {
    incidents.push({
      kind: 'psp_degradation',
      psp: degradedPsp,
      rail: degradedRail,
      from: degradeStart.toISOString(),
      to: degradeEnd.toISOString(),
      record_ids: degradedIds,
    });
  }
  if (ringIds.length > 0) {
    incidents.push({
      kind: 'abuse_ring',
      device_hash: ringDevice,
      bin: ringBin,
      from: records[0]?.occurred_at ?? asOf.toISOString(),
      to: asOf.toISOString(),
      record_ids: ringIds,
    });
  }

  // Chronological, because that is how a real batch arrives and it keeps the
  // streaming view honest about time.
  records.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  return {
    records,
    truth,
    incidents,
    manifest: {
      schema: 'sirius.batch/v1',
      seed: options.seed,
      generated_at: new Date().toISOString(),
      as_of: asOf.toISOString(),
      counts: {
        payments: records.filter((record) => record.kind === 'payment').length,
        checkouts: options.checkouts,
        invoices: options.invoices,
      },
      split_rule: 'sha256(id)[0] % 100 < 60 → train, else test',
      incidents,
    },
  };
}

// ---- record builders --------------------------------------------------------

interface PaymentContext {
  degradedPsp: string;
  degradedRail: Rail;
  degradeStart: Date;
  degradeEnd: Date;
  inRing: boolean;
  ringDevice: string;
  ringBin: string;
  /** Place this record inside the outage window rather than anywhere in the batch. */
  forceDegraded?: boolean;
  /** A world the detector was not trained on. */
  shift?: DistributionShift;
}

function makePayment(rng: Rng, asOf: Date, index: number, ctx: PaymentContext): RiskRecord {
  const id = `pay_${String(index + 1).padStart(5, '0')}`;
  const party = makeParty(rng, `cus_${hex(rng, 8)}`);

  const occurredAt = ctx.forceDegraded
    ? new Date(
        ctx.degradeStart.getTime() +
          rng.int(0, Math.max(1, ctx.degradeEnd.getTime() - ctx.degradeStart.getTime())),
      )
    : new Date(asOf.getTime() - rng.int(5, 72 * 60) * 60_000);
  const rail = ctx.forceDegraded ? ctx.degradedRail : rng.weighted(reweight(RAILS, ctx.shift?.rails));
  const psp = ctx.forceDegraded ? ctx.degradedPsp : rng.pick(PSPS);

  // Inside the degradation window the failure is the outage, not the customer.
  const degraded =
    psp === ctx.degradedPsp &&
    rail === ctx.degradedRail &&
    withinWindow(occurredAt.toISOString(), ctx.degradeStart, ctx.degradeEnd);

  let failure: FailureCode = degraded
    ? rng.weighted([
        ['psp_degraded', 60],
        ['network_timeout', 40],
      ])
    : rng.weighted(reweight(FAILURES[rail], ctx.shift?.failures));

  if (ctx.inRing) failure = rng.weighted([['risk_block', 70], ['do_not_honor', 30]]);

  const attempts = rng.weighted([
    [1, 55],
    [2, 25],
    [3, 12],
    [4, 5],
    [5, 3],
  ]);

  const record: RiskRecord = {
    id,
    kind: 'payment',
    occurred_at: occurredAt.toISOString(),
    amount_paise: rng.amount(
      (rail === 'nach_mandate' ? 4200 : 1850) * (ctx.shift?.amount ?? 1),
      ctx.shift?.amountSigma ?? 1.1,
    ),
    currency: 'INR',
    party,
    rail,
    psp,
    failure_code: failure,
    attempts,
    last_attempt_at: occurredAt.toISOString(),
    ...(rng.chance(0.03) ? { in_dispute: true } : {}),
    signals: {
      device_hash: ctx.inRing ? ctx.ringDevice : `dev_${hex(rng, 10)}`,
      ...(rail === 'card' ? { bin: ctx.inRing ? ctx.ringBin : `${rng.int(400000, 659999)}` } : {}),
      ip_asn: ctx.inRing ? 'AS_ANON_7' : `AS${rng.int(9000, 65000)}`,
    },
  };

  record.truth = truthForPayment(rng, record, degraded, ctx.inRing, ctx.shift);
  return record;
}

function truthForPayment(
  rng: Rng,
  record: RiskRecord,
  degraded: boolean,
  inRing: boolean,
  shift?: DistributionShift,
): GroundTruth {
  const model = RECOVERY_MODEL[record.failure_code as FailureCode];
  let probability = model.base;

  // A world where the same failure comes back less often. Applied first, so the
  // floors below still win: an outage still ends and a ring is still hopeless,
  // whatever the shift says, because those are facts about the mechanism rather
  // than about the rate.
  probability *= shift?.recovery ?? 1;

  // A customer with a long history of paying is more likely to pay this time.
  if (record.party.successful_payments >= 12) probability += 0.1;
  if (record.party.tenure_days > 540) probability += 0.05;
  // Each failed attempt is evidence the obstacle is real, not transient.
  probability -= (record.attempts - 1) * 0.11;
  // The outage ends, and the payment goes through on the next rail or the next
  // attempt. This is the money a per-record policy misses and a batch-level
  // one finds.
  if (degraded) probability = Math.max(probability, 0.86);
  if (inRing) probability = Math.min(probability, 0.02);
  // Last, and unconditionally. A dispute freezes everything, and that is true
  // of a disputed payment inside a gateway outage too. Applied before the
  // outage floor, this read as "the outage ended, so the money comes back" on
  // records nobody was allowed to touch — a generator quietly disagreeing with
  // the policy it exists to test.
  if (record.in_dispute) probability = 0;

  probability = clamp(probability, 0, 0.97);
  const recoverable = rng.chance(probability);
  const selfHeals = recoverable && rng.chance(model.selfHeal);

  return {
    recoverable,
    self_heals: selfHeals,
    best_action: degraded ? 'switch_rail' : model.action,
    recoverable_paise: recoverable ? record.amount_paise : 0,
  };
}

function makeCheckout(rng: Rng, asOf: Date, index: number): RiskRecord {
  const id = `chk_${String(index + 1).padStart(5, '0')}`;
  const party = makeParty(rng, `cus_${hex(rng, 8)}`);
  const stage = rng.weighted([
    ['cart', 42],
    ['address', 18],
    ['payment', 26],
    ['otp', 14],
  ] as const);

  const record: RiskRecord = {
    id,
    kind: 'checkout',
    occurred_at: new Date(asOf.getTime() - rng.int(10, 48 * 60) * 60_000).toISOString(),
    amount_paise: rng.amount(2600),
    currency: 'INR',
    party,
    attempts: stage === 'otp' || stage === 'payment' ? rng.int(1, 2) : 0,
    drop_off_stage: stage,
    signals: { device_hash: `dev_${hex(rng, 10)}`, ip_asn: `AS${rng.int(9000, 65000)}` },
  };

  // Intent rises the further they got. Someone who reached OTP had their phone
  // in their hand; someone who left at the cart was browsing.
  const intent = { cart: 0.16, address: 0.3, payment: 0.52, otp: 0.66 }[stage];
  const probability = clamp(intent + (party.successful_payments > 6 ? 0.12 : 0), 0, 0.9);
  const recoverable = rng.chance(probability);

  record.truth = {
    recoverable,
    // A large share of abandoned carts come back on their own within a day, and
    // a recovery tool that counts those is a recovery tool inflating its numbers.
    self_heals: recoverable && rng.chance(stage === 'otp' ? 0.42 : 0.3),
    best_action: 'checkout_recovery_link',
    recoverable_paise: recoverable ? record.amount_paise : 0,
  };
  return record;
}

function makeInvoice(rng: Rng, asOf: Date, index: number): RiskRecord {
  const id = `inv_${String(index + 1).padStart(5, '0')}`;
  const party = makeParty(rng, `acc_${hex(rng, 8)}`);
  const daysOverdue = rng.weighted([
    [rng.int(1, 15), 34],
    [rng.int(16, 45), 30],
    [rng.int(46, 90), 22],
    [rng.int(91, 210), 14],
  ]);
  const brokenPromises = rng.weighted([
    [0, 62],
    [1, 24],
    [2, 10],
    [3, 4],
  ]);

  const dueAt = new Date(asOf.getTime() - daysOverdue * 86400_000);
  const record: RiskRecord = {
    id,
    kind: 'invoice',
    occurred_at: dueAt.toISOString(),
    amount_paise: rng.amount(48000, 0.9),
    currency: 'INR',
    party,
    attempts: rng.int(0, 3),
    due_at: dueAt.toISOString(),
    days_overdue: daysOverdue,
    broken_promises: brokenPromises,
    ...(rng.chance(0.22)
      ? { promise_to_pay_at: new Date(asOf.getTime() + rng.int(1, 12) * 86400_000).toISOString() }
      : {}),
  };

  // Collectability decays with age and with every promise already broken. The
  // decay is the well-known one: a receivable at 90 days is worth far less than
  // the same rupee at 30.
  let probability = 0.92 * Math.exp(-daysOverdue / 70) - brokenPromises * 0.12;
  if (record.promise_to_pay_at) probability += 0.18;
  if (party.tenure_days > 720) probability += 0.06;
  probability = clamp(probability, 0.02, 0.95);

  const recoverable = rng.chance(probability);
  // Partial settlement is the norm on aged receivables: they pay most of it.
  const share = recoverable ? (daysOverdue > 90 ? 0.55 + rng.next() * 0.35 : 0.85 + rng.next() * 0.15) : 0;

  record.truth = {
    recoverable,
    self_heals: recoverable && rng.chance(0.18),
    best_action: daysOverdue > 120 ? 'human_review' : record.promise_to_pay_at ? 'ptp_followup' : 'dunning_email',
    recoverable_paise: Math.round(record.amount_paise * share),
  };
  return record;
}

function makeParty(rng: Rng, id: string): Party {
  const tenure = rng.int(1, 1400);
  const successes = Math.round(Math.max(0, (tenure / 45) * (0.4 + rng.next())));
  const consent: Record<Channel, boolean> = {
    email: rng.chance(0.93),
    sms: rng.chance(0.74),
    whatsapp: rng.chance(0.58),
    // Voice consent is rarer and is the channel with the sharpest rules, so a
    // batch where everyone consented would let the policy engine off the hook.
    voice: rng.chance(0.31),
  };

  return {
    id,
    tenure_days: tenure,
    successful_payments: successes,
    failed_payments: rng.int(0, Math.max(1, Math.round(successes * 0.3))),
    consent,
    contacts_24h: rng.weighted([
      [0, 72],
      [1, 18],
      [2, 7],
      [3, 3],
    ]),
    dnd: rng.chance(0.08),
  };
}

// ---- helpers ----------------------------------------------------------------

function withinWindow(iso: string, from: Date, to: Date): boolean {
  const at = Date.parse(iso);
  return at >= from.getTime() && at <= to.getTime();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hex(rng: Rng, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += '0123456789abcdef'[rng.int(0, 15)];
  return out;
}
