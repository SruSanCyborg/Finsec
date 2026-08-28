/**
 * Batch context, and the features a record is scored on.
 *
 * Two things happen here. First the batch is read as a whole — a payment that
 * looks ordinary on its own is a different record once you know forty others
 * failed on the same gateway in the same nine minutes. Second each record is
 * reduced to a handful of coarse buckets, which is what keeps the model
 * explainable: every feature below can be printed as a sentence a payments
 * person would either agree or disagree with.
 *
 * Buckets, not raw numbers, on purpose. A model that learns a coefficient on
 * `days_overdue = 47` has learned something about this batch; one that learns
 * about `46–90 days` has learned something about receivables.
 */

import type { RiskRecord } from './types.js';

export interface Degradation {
  psp: string;
  rail: string;
  from: string;
  to: string;
  failures: number;
  /** How much worse this window is than the batch's own baseline, as a ratio. */
  lift: number;
  amount_paise: number;
  record_ids: string[];
}

export interface Ring {
  /** What the members share — the reason they are grouped at all. */
  shared: 'device_hash' | 'bin' | 'ip_asn';
  value: string;
  members: number;
  amount_paise: number;
  distinct_parties: number;
  record_ids: string[];
}

export interface BatchContext {
  degradations: Degradation[];
  rings: Ring[];
  /** record id → the degradation it sits inside, for O(1) lookup while scoring. */
  degraded: Map<string, Degradation>;
  ringMembers: Map<string, Ring>;
}

const WINDOW_MINUTES = 30;

/**
 * Finds gateway degradations and abuse rings before anything is scored.
 *
 * The degradation search is a sliding window over each (psp, rail) cell, kept
 * deliberately simple: a cell whose failure count in half an hour is several
 * times its own hourly average is degraded. No seasonality, no forecast — a
 * batch is one afternoon, and a model with more knobs than data is a model
 * fitting noise.
 */
export function analyzeBatch(records: readonly RiskRecord[]): BatchContext {
  const payments = records.filter((record) => record.kind === 'payment');

  const degradations = findDegradations(payments);
  const rings = findRings(records.filter((r) => r.kind !== 'invoice'));

  const degraded = new Map<string, Degradation>();
  for (const degradation of degradations) {
    for (const id of degradation.record_ids) degraded.set(id, degradation);
  }

  const ringMembers = new Map<string, Ring>();
  for (const ring of rings) {
    for (const id of ring.record_ids) ringMembers.set(id, ring);
  }

  return { degradations, rings, degraded, ringMembers };
}

function findDegradations(payments: readonly RiskRecord[]): Degradation[] {
  const cells = new Map<string, RiskRecord[]>();
  for (const payment of payments) {
    const key = `${payment.psp}|${payment.rail}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(payment);
    else cells.set(key, [payment]);
  }

  const found: Degradation[] = [];

  for (const [key, cell] of cells) {
    if (cell.length < 8) continue;
    const sorted = [...cell].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const first = Date.parse(sorted[0]!.occurred_at);
    const last = Date.parse(sorted[sorted.length - 1]!.occurred_at);
    const spanMinutes = Math.max(1, (last - first) / 60_000);
    // The cell's own ordinary rate, expressed per window. Floored, because a
    // quiet cell has a baseline near zero and dividing by it turns any two
    // arrivals into an infinite spike. The floor is what makes the absolute
    // guard below (at least six failures) do the real work.
    const perWindow = Math.max((sorted.length / spanMinutes) * WINDOW_MINUTES, 0.5);

    let best: { start: number; end: number; members: RiskRecord[] } | undefined;
    for (let i = 0; i < sorted.length; i += 1) {
      const start = Date.parse(sorted[i]!.occurred_at);
      const members: RiskRecord[] = [];
      for (let j = i; j < sorted.length; j += 1) {
        if (Date.parse(sorted[j]!.occurred_at) - start > WINDOW_MINUTES * 60_000) break;
        members.push(sorted[j]!);
      }
      if (!best || members.length > best.members.length) {
        best = { start, end: start + WINDOW_MINUTES * 60_000, members };
      }
    }

    if (!best) continue;
    const lift = best.members.length / perWindow;
    // Three times the cell's own rate, and enough records that the ratio is not
    // an accident of two arrivals landing together.
    if (lift < 3 || best.members.length < 6) continue;

    found.push({
      psp: key.split('|')[0] as string,
      rail: key.split('|')[1] as string,
      from: new Date(best.start).toISOString(),
      to: new Date(best.end).toISOString(),
      failures: best.members.length,
      lift: Math.round(lift * 10) / 10,
      amount_paise: best.members.reduce((sum, r) => sum + r.amount_paise, 0),
      record_ids: best.members.map((r) => r.id),
    });
  }

  return found.sort((a, b) => b.amount_paise - a.amount_paise);
}

/**
 * Groups records that share infrastructure across several different customers.
 *
 * One person on one device is a customer. Nine customers on one device is a
 * pattern, and the response to it is never "retry the payment" — it is to stop
 * touching it and put it in front of a human. Defensive by construction: the
 * output is a hold, never an action against anybody.
 */
function findRings(records: readonly RiskRecord[]): Ring[] {
  const found: Ring[] = [];

  for (const shared of ['device_hash', 'bin', 'ip_asn'] as const) {
    const groups = new Map<string, RiskRecord[]>();
    for (const record of records) {
      const value = record.signals?.[shared];
      if (!value) continue;
      const bucket = groups.get(value);
      if (bucket) bucket.push(record);
      else groups.set(value, [record]);
    }

    for (const [value, members] of groups) {
      const parties = new Set(members.map((m) => m.party.id));
      // The shared signal alone means nothing — a family shares a device, a
      // bank shares a BIN with a million cards. It is the *number of distinct
      // parties* behind one signal that is the anomaly.
      if (members.length < 5 || parties.size < 4) continue;

      found.push({
        shared,
        value,
        members: members.length,
        distinct_parties: parties.size,
        amount_paise: members.reduce((sum, r) => sum + r.amount_paise, 0),
        record_ids: members.map((r) => r.id),
      });
    }
  }

  // The same cluster usually trips several signals at once — one device, one
  // network, one BIN, the same twelve records. Reporting it three times would
  // treble the apparent number of incidents without adding a fact, so identical
  // member sets collapse to the single strongest signal.
  const deduped = new Map<string, Ring>();
  for (const ring of found.sort((a, b) => b.distinct_parties - a.distinct_parties)) {
    const key = [...ring.record_ids].sort().join(',');
    if (!deduped.has(key)) deduped.set(key, ring);
  }

  return [...deduped.values()].sort((a, b) => b.distinct_parties - a.distinct_parties);
}

/**
 * The record as the model sees it: a set of `name=bucket` strings.
 *
 * Everything is categorical, including the numbers, and nothing here is the
 * amount. Whether money comes back and how much money it is are two different
 * questions; mixing them makes a large hopeless invoice outrank a small certain
 * one, which is exactly the mistake the expected-value stage exists to avoid.
 */
export function featuresOf(record: RiskRecord, context: BatchContext): string[] {
  const features: string[] = [`kind=${record.kind}`];

  if (record.kind === 'payment') {
    features.push(`failure=${record.failure_code}`);
    features.push(`rail=${record.rail}`);
    features.push(`attempts=${bucketAttempts(record.attempts)}`);
    features.push(`degraded=${context.degraded.has(record.id)}`);
  }

  if (record.kind === 'checkout') {
    features.push(`stage=${record.drop_off_stage}`);
  }

  if (record.kind === 'invoice') {
    features.push(`overdue=${bucketOverdue(record.days_overdue ?? 0)}`);
    features.push(`broken_promises=${Math.min(record.broken_promises ?? 0, 2)}`);
    features.push(`has_ptp=${Boolean(record.promise_to_pay_at)}`);
  }

  features.push(`tenure=${bucketTenure(record.party.tenure_days)}`);
  features.push(`history=${bucketHistory(record.party.successful_payments)}`);
  features.push(`ring=${context.ringMembers.has(record.id)}`);
  features.push(`dispute=${Boolean(record.in_dispute)}`);

  return features;
}

const bucketAttempts = (n: number): string => (n <= 1 ? '1' : n === 2 ? '2' : '3+');

const bucketTenure = (days: number): string =>
  days < 90 ? 'new' : days < 365 ? 'established' : 'long';

const bucketHistory = (successes: number): string =>
  successes < 3 ? 'thin' : successes < 12 ? 'some' : 'strong';

const bucketOverdue = (days: number): string =>
  days <= 15 ? '0-15' : days <= 45 ? '16-45' : days <= 90 ? '46-90' : '90+';
