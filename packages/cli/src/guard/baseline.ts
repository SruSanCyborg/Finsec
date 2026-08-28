/**
 * What an agent normally does, kept as running aggregates.
 *
 * "Expected behaviour" has to mean something measured, or the behavioural stage
 * is just a second opinion on the policy limits. So the baseline is built from
 * the agent's own history and updated after every decision — which is also what
 * makes this a loop rather than a gate: an action judged unusual today becomes
 * ordinary once the agent has done it a dozen times with good outcomes.
 *
 * Amounts are tracked in **log space**. Payment amounts are heavy-tailed — one
 * ₹40,00,000 settlement among two hundred ₹5,000 invoices would drag a plain
 * mean far above anything typical and make every ordinary payment look small
 * and every large one look normal. In log space the spread is stable, and a
 * z-score means what it says.
 *
 * Welford's method rather than storing the values: it is numerically stable and
 * O(1) in memory, which matters because this runs in front of a live agent and
 * has to answer before the action does.
 */

import { EXPOSURE_WINDOW_DAYS, MIN_HOURS_OBSERVED, MIN_OBSERVATIONS, emptyBaseline } from './types.js';
import type { Baseline, ProposedAction } from './types.js';

/** Paise → log space, guarding the zero. */
const toLog = (paise: number): number => Math.log10(Math.max(1, paise));

/** Standard deviation of log-amount, or undefined while there is too little. */
export function logSigma(baseline: Baseline): number | undefined {
  if (baseline.n < 2) return undefined;
  const variance = baseline.log_m2 / (baseline.n - 1);
  return variance > 0 ? Math.sqrt(variance) : undefined;
}

/**
 * How unusual this amount is for this agent, in standard deviations.
 *
 * Undefined when there is not enough history to say — which the caller must
 * treat as "no opinion", never as "normal".
 */
export function amountDeviation(baseline: Baseline, paise: number): number | undefined {
  if (baseline.n < MIN_OBSERVATIONS) return undefined;
  const sigma = logSigma(baseline);
  if (sigma === undefined || sigma < 1e-9) return undefined;
  return (toLog(paise) - baseline.log_mean) / sigma;
}

/** Whether this counterparty is one the agent has dealt with before. */
export function isKnownCounterparty(baseline: Baseline, id: string): boolean {
  return (baseline.counterparties[id] ?? 0) > 0;
}

/** Whether the agent has ever done this kind of action. */
export function isKnownKind(baseline: Baseline, kind: string): boolean {
  return (baseline.kinds[kind] ?? 0) > 0;
}

/**
 * Whether this hour is one the agent operates in.
 *
 * A share rather than a count, so an agent that runs constantly and one that
 * runs twice a week are judged the same way. An hour holding under 2% of the
 * agent's activity is unusual for it, whatever the absolute number.
 */
export function isUnusualHour(baseline: Baseline, hour: number): boolean {
  // A pattern over the clock needs to have seen the clock. At twelve
  // observations the histogram is three hours wide, so every fourth hour looks
  // unprecedented — which is how the first version flagged 194 of 252 ordinary
  // payments as out-of-hours and would have had an operator approving most of
  // the agent's ordinary work by hand.
  const total = baseline.hours.reduce((sum, n) => sum + n, 0);
  if (total < MIN_HOURS_OBSERVED) return false;

  // Laplace-smoothed: an hour the agent has simply not reached yet is not
  // evidence against it. Only an hour that stays empty while the rest of the
  // clock fills up is.
  const share = ((baseline.hours[hour] ?? 0) + 1) / (total + 24);
  return share < 0.01;
}

/** Spend already committed on the action's calendar day. */
export function spentOn(baseline: Baseline, isoDate: string): number {
  return baseline.spend_by_day[isoDate.slice(0, 10)] ?? 0;
}

/**
 * Concentration on one counterparty inside the rolling window.
 *
 * A window rather than a lifetime total: an agent that pays the same ten
 * vendors every week is doing its job, not concentrating risk, and a limit that
 * cannot tell those apart ends up measuring loyalty.
 */
export function exposureTo(baseline: Baseline, counterpartyId: string, at: string): number {
  const days = baseline.exposure_by_day[counterpartyId];
  if (!days) return 0;
  const cutoff = Date.parse(`${at.slice(0, 10)}T00:00:00.000Z`) - EXPOSURE_WINDOW_DAYS * 86_400_000;
  let total = 0;
  for (const [day, paise] of Object.entries(days)) {
    if (Date.parse(`${day}T00:00:00.000Z`) >= cutoff) total += paise;
  }
  return total;
}

/** Actions in the hour preceding `at`. */
export function rateBefore(baseline: Baseline, at: string): number {
  const cutoff = Date.parse(at) - 60 * 60 * 1000;
  return baseline.recent.filter((stamp) => Date.parse(stamp) >= cutoff).length;
}

/**
 * Folds one action into the baseline.
 *
 * Called only for actions that actually went ahead. A blocked action must not
 * teach the agent's profile that it is normal — otherwise an attacker who is
 * refused often enough eventually makes the refusal look like the deviation.
 * That is the poisoning path, and not learning from refusals closes it.
 */
export function observe(baseline: Baseline, action: ProposedAction, amountPaise: number): Baseline {
  const next: Baseline = {
    ...baseline,
    counterparties: { ...baseline.counterparties },
    kinds: { ...baseline.kinds },
    hours: [...baseline.hours],
    spend_by_day: { ...baseline.spend_by_day },
    exposure_by_day: Object.fromEntries(
      Object.entries(baseline.exposure_by_day).map(([cp, days]) => [cp, { ...days }]),
    ),
    recent: [...baseline.recent],
  };

  // Welford, in log space.
  const x = toLog(amountPaise);
  next.n += 1;
  const delta = x - next.log_mean;
  next.log_mean += delta / next.n;
  next.log_m2 += delta * (x - next.log_mean);

  const cp = action.counterparty.id;
  next.counterparties[cp] = (next.counterparties[cp] ?? 0) + 1;
  next.kinds[action.kind] = (next.kinds[action.kind] ?? 0) + 1;

  const when = new Date(action.at);
  const hour = when.getUTCHours();
  next.hours[hour] = (next.hours[hour] ?? 0) + 1;

  const day = action.at.slice(0, 10);
  next.spend_by_day[day] = (next.spend_by_day[day] ?? 0) + amountPaise;

  const forCp = next.exposure_by_day[cp] ?? {};
  forCp[day] = (forCp[day] ?? 0) + amountPaise;
  // Drop days that have fallen out of the window, so this stays bounded in
  // front of a long-running agent.
  const windowStart = Date.parse(`${day}T00:00:00.000Z`) - EXPOSURE_WINDOW_DAYS * 86_400_000;
  next.exposure_by_day[cp] = Object.fromEntries(
    Object.entries(forCp).filter(([d]) => Date.parse(`${d}T00:00:00.000Z`) >= windowStart),
  );

  // Only the last hour is ever consulted, so the list is trimmed rather than
  // grown forever — this runs in front of a live agent.
  const cutoff = Date.parse(action.at) - 60 * 60 * 1000;
  next.recent = [...next.recent.filter((stamp) => Date.parse(stamp) >= cutoff), action.at];

  next.updated_at = action.at;
  return next;
}

/** Discharges concentration against a counterparty when an action settles. */
export function settle(baseline: Baseline, counterpartyId: string, day: string, amountPaise: number): Baseline {
  const days = { ...(baseline.exposure_by_day[counterpartyId] ?? {}) };
  const key = day.slice(0, 10);
  days[key] = Math.max(0, (days[key] ?? 0) - amountPaise);
  return {
    ...baseline,
    exposure_by_day: { ...baseline.exposure_by_day, [counterpartyId]: days },
  };
}

export { emptyBaseline };
