/**
 * What happens when the agent actually does something.
 *
 * A simulator, and labelled as one everywhere its numbers surface. Nothing here
 * touches a gateway, sends a message, or moves a rupee — a recovery agent whose
 * first live run is also its first run at all is not a demo, it is an incident.
 *
 * The simulation is deterministic: the outcome of (record, action, attempt) is
 * a hash, not a coin. Re-running a batch reproduces the run exactly, which is
 * what makes "we recovered ₹4.1L" a claim somebody else can check rather than
 * a number that changes when you look again.
 *
 * The model of success is the interesting part. A recoverable record does not
 * come back because it was recoverable — it comes back if the agent picks an
 * action that addresses the actual obstacle. Emailing somebody whose card
 * expired works. Retrying their card does not, however recoverable the record
 * was. That distinction is what makes choosing the intervention worth anything,
 * so the oracle is built to reward it and nothing else.
 */

import { createHash } from 'node:crypto';

import type { GroundTruth, Intervention, RiskRecord } from './types.js';

export interface Outcome {
  recovered: boolean;
  /** Paise actually recovered. Partial on invoices, all-or-nothing on payments. */
  recovered_paise: number;
  /** The probability the draw was made against, so the run can be audited. */
  probability: number;
  /**
   * True when this record would have come back with no intervention at all.
   *
   * Reported separately and subtracted from the headline. Money that was going
   * to arrive anyway is not money the agent recovered, and a recovery tool that
   * counts it is a recovery tool marking its own homework.
   */
  would_have_anyway: boolean;
}

/** How well an action addresses a given obstacle, as a multiplier on the base. */
const FIT: Record<string, number> = {
  exact: 1,
  // Same family as the right answer: a retry when the right answer was a retry
  // on a different rail, an email when the right answer was an SMS.
  near: 0.55,
  // Plausible, but not aimed at the obstacle.
  weak: 0.2,
  // Cannot work: retrying an expired card, messaging about a gateway outage.
  none: 0.02,
};

const RETRIES: readonly Intervention[] = [
  'retry_now',
  'retry_after_cooldown',
  'switch_rail',
  'mandate_represent',
];

const MESSAGES: readonly Intervention[] = [
  'dunning_email',
  'dunning_sms',
  'whatsapp_nudge',
  'checkout_recovery_link',
  'ptp_followup',
  'mandate_reauth',
];

function fitOf(action: Intervention, record: RiskRecord, truth: GroundTruth): number {
  if (action === 'wait' || action === 'write_off') return 0;
  if (action === 'human_review') {
    // A human looking at it recovers some of what an automated action would,
    // eventually. Kept low so the agent cannot escalate its way to a good number.
    return FIT.weak as number;
  }
  if (action === truth.best_action) return FIT.exact as number;

  const sameFamily =
    (RETRIES.includes(action) && RETRIES.includes(truth.best_action)) ||
    (MESSAGES.includes(action) && MESSAGES.includes(truth.best_action));
  if (sameFamily) return FIT.near as number;

  // The cases where the mismatch is not a near miss but a category error.
  if (RETRIES.includes(action)) {
    if (record.failure_code === 'card_expired' || record.failure_code === 'mandate_expired') {
      return FIT.none as number;
    }
    if (record.failure_code === 'mandate_revoked' || record.failure_code === 'risk_block') {
      return FIT.none as number;
    }
  }

  return FIT.weak as number;
}

/**
 * Runs one intervention against one record.
 *
 * `attempt` is part of the hash, so the second attempt on a record is a
 * different draw from the first — otherwise a run could retry its way to
 * certainty by asking the same question twice.
 */
export function simulate(
  record: RiskRecord,
  truth: GroundTruth,
  action: Intervention,
  attempt: number,
): Outcome {
  const wouldHaveAnyway = truth.recoverable && truth.self_heals;

  if (!truth.recoverable) {
    return { recovered: false, recovered_paise: 0, probability: 0, would_have_anyway: false };
  }

  const fit = fitOf(action, record, truth);
  // Each further attempt on the same record is worth less than the last.
  const fatigue = 0.82 ** attempt;
  const probability = Math.min(0.95, fit * fatigue);

  const draw = hashUnit(`${record.id}|${action}|${attempt}`);
  const recovered = draw < probability;

  return {
    recovered,
    recovered_paise: recovered ? truth.recoverable_paise : 0,
    probability: Math.round(probability * 1000) / 1000,
    would_have_anyway: wouldHaveAnyway,
  };
}

/**
 * What a record does when nobody touches it.
 *
 * The counterfactual the whole report is measured against. Without it the
 * agent's number is a gross figure that quietly includes everything that was
 * going to happen anyway.
 */
export function withoutIntervention(record: RiskRecord, truth: GroundTruth): Outcome {
  const recovered = truth.recoverable && truth.self_heals;
  return {
    recovered,
    recovered_paise: recovered ? truth.recoverable_paise : 0,
    probability: recovered ? 1 : 0,
    would_have_anyway: recovered,
  };
}

/** A uniform draw in [0, 1) from a string. Deterministic across machines. */
function hashUnit(seed: string): number {
  const digest = createHash('sha256').update(seed).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}
