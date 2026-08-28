/**
 * What the agent is allowed to do, and when it has to stop.
 *
 * Two halves. `chooseAction` proposes the intervention that fits the failure —
 * a customer with no money in the account on the 3rd of the month needs a wait,
 * not a nudge; an expired card needs an email, not a retry. `check` then puts
 * that proposal through every stopping rule, and any single rule can veto it.
 *
 * The rules are written as data rather than as branches inside the chooser,
 * because they are the part of this feature that has to be *readable by
 * somebody who does not read TypeScript*. Each carries an id, a sentence, and
 * the obligation it comes from. They are configured policy, not legal advice —
 * the frameworks are named so a compliance team knows which of their own rules
 * to check the numbers against, and the numbers are theirs to change.
 *
 * A vetoed action is recorded, not discarded. "The agent did not contact this
 * customer because it had already contacted them twice today" is the sentence
 * an audit needs; silence would leave it indistinguishable from never having
 * looked.
 */

import type { BatchContext } from './features.js';
import type { Channel, Intervention, RiskRecord } from './types.js';

export interface PolicyLimits {
  /** Re-presentments allowed against one mandate before it must stop. */
  mandate_attempts: number;
  /** Retries allowed against one payment, across every rail. */
  payment_attempts: number;
  /** Hours to wait before retrying, by failure class. */
  cooldown_hours: { default: number; insufficient_funds: number };
  /** Local hours during which no message may be sent. */
  quiet_hours: { from: number; to: number };
  /** Messages to one party in a rolling day, and in a rolling week. */
  contacts_per_day: number;
  /** Total the run may spend, in paise. */
  budget_paise: number;
  /**
   * Halt the whole run if realised recovery falls below this share of what was
   * expected, once enough attempts have been made to tell.
   */
  circuit_breaker: { after_attempts: number; min_realised_share: number };
  /** IANA zone the quiet hours are expressed in. */
  timezone: string;
}

export const DEFAULT_LIMITS: PolicyLimits = {
  mandate_attempts: 3,
  payment_attempts: 4,
  cooldown_hours: { default: 6, insufficient_funds: 30 },
  quiet_hours: { from: 21, to: 9 },
  contacts_per_day: 2,
  budget_paise: 50_00_000,
  circuit_breaker: { after_attempts: 40, min_realised_share: 0.25 },
  timezone: 'Asia/Kolkata',
};

/** One stopping rule, in the form it is reported in. */
export interface Rule {
  id: string;
  /** What it stops, in a sentence. */
  says: string;
  /** The obligation behind it. Named at framework level, never invented clauses. */
  basis: string;
}

export const RULES: Record<string, Rule> = {
  dispute_hold: {
    id: 'dispute_hold',
    says: 'no contact and no retry while a dispute or chargeback is open',
    basis: 'card-scheme dispute handling — the case is with the issuer, not the merchant',
  },
  risk_hold: {
    id: 'risk_hold',
    says: 'no retry after the issuer declined on risk grounds',
    basis: 'a retry is a second attempt at something already refused',
  },
  ring_hold: {
    id: 'ring_hold',
    says: 'no automated action on records sharing a device, BIN or network across several parties',
    basis: 'internal: suspected coordinated abuse goes to a human, never to a retry',
  },
  mandate_revoked: {
    id: 'mandate_revoked',
    says: 'never re-present a revoked mandate; ask for fresh authorisation instead',
    basis: 'NPCI e-mandate/NACH rules — debiting on a revoked mandate is an unauthorised debit',
  },
  mandate_cap: {
    id: 'mandate_cap',
    says: 'at most three re-presentments against one mandate in a cycle',
    basis: 'NPCI NACH re-presentment limits',
  },
  retry_cap: {
    id: 'retry_cap',
    says: 'at most four attempts against one payment across all rails',
    basis: 'card-scheme retry limits and gateway decline-ratio monitoring',
  },
  cooldown: {
    id: 'cooldown',
    says: 'wait before retrying — and wait for the salary cycle when the account was empty',
    basis: 'card-scheme retry guidance; a retry into the same empty account is a second decline',
  },
  quiet_hours: {
    id: 'quiet_hours',
    says: 'no SMS, WhatsApp or voice between 21:00 and 09:00 local time',
    basis: 'TRAI commercial-communication timing rules',
  },
  dnd: {
    id: 'dnd',
    says: 'no promotional or transactional push to a party on DND',
    basis: 'TRAI DND registry',
  },
  consent: {
    id: 'consent',
    says: 'no contact on a channel the party has not consented to',
    basis: 'DPDP 2023 §6 — consent is per purpose, per channel, and revocable',
  },
  contact_frequency: {
    id: 'contact_frequency',
    says: 'at most two messages to one party in a rolling day',
    basis: 'internal: the line between collection and harassment is a number, so it is written down',
  },
  budget: {
    id: 'budget',
    says: 'stop when the run has spent its budget',
    basis: 'internal: a bounded agent is one whose worst case is stated in advance',
  },
  circuit_breaker: {
    id: 'circuit_breaker',
    says: 'halt the run if realised recovery falls far below what was expected',
    basis: 'internal: a model that has stopped working should stop acting, not keep spending',
  },
};

/** Which channel an intervention speaks on, if it speaks at all. */
export function channelOf(action: Intervention): Channel | undefined {
  switch (action) {
    case 'dunning_email':
    case 'checkout_recovery_link':
    case 'mandate_reauth':
      return 'email';
    case 'dunning_sms':
      return 'sms';
    case 'whatsapp_nudge':
      return 'whatsapp';
    case 'ptp_followup':
      return 'sms';
    default:
      return undefined;
  }
}

const RETRY_ACTIONS = new Set<Intervention>([
  'retry_now',
  'retry_after_cooldown',
  'switch_rail',
  'mandate_represent',
]);

export const isRetry = (action: Intervention): boolean => RETRY_ACTIONS.has(action);

/**
 * The intervention that fits the failure.
 *
 * Deliberately a lookup a payments person can check line by line rather than
 * anything learned. What to do about `card_expired` is not a statistical
 * question — the card is expired, and no number of retries will change that.
 * The model's job was deciding *whether* this record is worth the capacity; the
 * choice of remedy is domain knowledge, and pretending otherwise would hide it
 * where nobody could correct it.
 */
export function chooseAction(record: RiskRecord, context: BatchContext, step: number): Intervention {
  if (record.in_dispute) return 'wait';
  if (context.ringMembers.has(record.id)) return 'human_review';

  if (record.kind === 'checkout') {
    // Second contact goes on a different channel; a second identical email is
    // how a recovery link becomes spam.
    return step === 0 ? 'checkout_recovery_link' : 'whatsapp_nudge';
  }

  if (record.kind === 'invoice') {
    const overdue = record.days_overdue ?? 0;
    if (overdue > 120) return 'human_review';
    if (record.promise_to_pay_at) return 'ptp_followup';
    if (step === 0) return 'dunning_email';
    if (overdue > 45) return 'dunning_sms';
    return 'ptp_followup';
  }

  const degraded = context.degraded.has(record.id);

  switch (record.failure_code) {
    case 'risk_block':
      return 'human_review';
    case 'mandate_revoked':
      // Never a re-presentment. Ask for authorisation again, or stop.
      return step === 0 ? 'mandate_reauth' : 'write_off';
    case 'mandate_expired':
      return 'mandate_reauth';
    case 'card_expired':
      // A retry cannot fix a date. Ask for a new card.
      return 'dunning_email';
    case 'insufficient_funds':
      // The account was empty. The remedy is the salary cycle, not persistence.
      return step === 0 ? 'retry_after_cooldown' : 'dunning_sms';
    case 'network_timeout':
    case 'psp_degraded':
      return degraded ? 'switch_rail' : 'retry_now';
    case 'issuer_decline':
    case 'do_not_honor':
      return step === 0 ? 'switch_rail' : 'dunning_email';
    case 'limit_exceeded':
      return step === 0 ? 'retry_after_cooldown' : 'dunning_sms';
    case 'authentication_failed':
      return step === 0 ? 'retry_now' : 'dunning_sms';
    default:
      return 'wait';
  }
}

export interface PolicyState {
  /** Attempts made by this run, per record. */
  attempts: Map<string, number>;
  /** Contacts made by this run in the last day, per party. */
  contacts: Map<string, number>;
  spent_paise: number;
  /** Set once the circuit breaker has tripped; nothing further executes. */
  halted?: string;
}

export function emptyState(): PolicyState {
  return { attempts: new Map(), contacts: new Map(), spent_paise: 0 };
}

export interface Verdict {
  allowed: boolean;
  /** The rule that stopped it, when one did. */
  rule?: Rule;
  /** What the agent will do instead. Always something, even if it is nothing. */
  detail?: string;
}

/**
 * Puts a proposed action through every stopping rule.
 *
 * Order matters only for which reason gets reported, and the order here is
 * "most serious first" — a disputed record should be refused for the dispute,
 * not for being the third message of the day.
 */
export function check(
  action: Intervention,
  record: RiskRecord,
  context: BatchContext,
  state: PolicyState,
  at: Date,
  limits: PolicyLimits = DEFAULT_LIMITS,
  costPaise = 0,
): Verdict {
  if (state.halted) {
    return { allowed: false, rule: RULES.circuit_breaker as Rule, detail: state.halted };
  }

  // Doing nothing is always permitted and costs nothing.
  if (action === 'wait' || action === 'write_off') return { allowed: true };

  // The budget comes before everything else that costs money — including
  // `human_review`, which is the most expensive action here by two orders of
  // magnitude. It was exempt at first, on the reasoning that a human looking at
  // something is always allowed; a run with a ₹50 budget then spent ₹510 of
  // analyst time. An unbounded escape hatch is not a bounded agent.
  if (state.spent_paise + costPaise > limits.budget_paise) {
    return deny('budget', 'the run has spent its budget');
  }

  // Handing a record to a human contacts nobody and retries nothing, so the
  // holds below do not apply to it — a shared-signal cluster is precisely what
  // human review is *for*, and blocking it there would leave the agent with
  // nowhere to put the records it must not touch itself.
  if (action === 'human_review') return { allowed: true };

  if (record.in_dispute) return deny('dispute_hold', 'a dispute is open on this record');
  if (context.ringMembers.has(record.id)) {
    return deny('ring_hold', 'this record is part of a shared-signal cluster');
  }
  if (record.failure_code === 'risk_block') {
    return deny('risk_hold', 'the issuer declined this on risk grounds');
  }

  if (isRetry(action)) {
    if (record.failure_code === 'mandate_revoked') {
      return deny('mandate_revoked', 'the mandate was revoked by the payer');
    }

    const attempts = (record.attempts ?? 0) + (state.attempts.get(record.id) ?? 0);
    const isMandate = record.rail === 'nach_mandate' || record.rail === 'emandate_upi';

    if (isMandate && attempts >= limits.mandate_attempts) {
      return deny('mandate_cap', `${attempts} re-presentments already made against this mandate`);
    }
    if (attempts >= limits.payment_attempts) {
      return deny('retry_cap', `${attempts} attempts already made against this payment`);
    }

    const since = hoursSince(record.last_attempt_at ?? record.occurred_at, at);
    const required =
      record.failure_code === 'insufficient_funds'
        ? limits.cooldown_hours.insufficient_funds
        : limits.cooldown_hours.default;
    if (since < required) {
      return deny(
        'cooldown',
        `${since.toFixed(1)}h since the last attempt, ${required}h required` +
          (record.failure_code === 'insufficient_funds' ? ' — the account was empty' : ''),
      );
    }
  }

  const channel = channelOf(action);
  if (channel) {
    if (!record.party.consent[channel]) {
      return deny('consent', `no consent on file for ${channel}`);
    }
    if (record.party.dnd && channel !== 'email') {
      return deny('dnd', 'the party is on the DND registry');
    }

    const contacts = record.party.contacts_24h + (state.contacts.get(record.party.id) ?? 0);
    if (contacts >= limits.contacts_per_day) {
      return deny('contact_frequency', `${contacts} messages already sent to this party today`);
    }

    if (channel !== 'email' && inQuietHours(at, limits)) {
      const hour = String(localHour(at, limits.timezone)).padStart(2, '0');
      return deny('quiet_hours', `${hour}:00 local is inside quiet hours`);
    }
  }

  return { allowed: true };
}

function deny(id: keyof typeof RULES, detail: string): Verdict {
  return { allowed: false, rule: RULES[id] as Rule, detail };
}

function hoursSince(iso: string, at: Date): number {
  return (at.getTime() - Date.parse(iso)) / 3600_000;
}

/** The hour of the day in the policy's timezone, not the machine's. */
export function localHour(at: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(at);
  return Number.parseInt(formatted, 10);
}

export function inQuietHours(at: Date, limits: PolicyLimits = DEFAULT_LIMITS): boolean {
  const hour = localHour(at, limits.timezone);
  const { from, to } = limits.quiet_hours;
  // The window crosses midnight, so it is a union rather than a range.
  return from > to ? hour >= from || hour < to : hour >= from && hour < to;
}

/**
 * The next moment this action could be taken, when a rule says not yet.
 *
 * Returning a time rather than a refusal is what turns a stopping rule into a
 * schedule: the run does not abandon a record because it is 02:00, it comes
 * back at 09:00.
 */
export function nextAllowedTime(
  action: Intervention,
  record: RiskRecord,
  at: Date,
  limits: PolicyLimits = DEFAULT_LIMITS,
): Date {
  let when = at;

  if (isRetry(action)) {
    const required =
      record.failure_code === 'insufficient_funds'
        ? limits.cooldown_hours.insufficient_funds
        : limits.cooldown_hours.default;
    const earliest = Date.parse(record.last_attempt_at ?? record.occurred_at) + required * 3600_000;
    if (earliest > when.getTime()) when = new Date(earliest);
  }

  const channel = channelOf(action);
  if (channel && channel !== 'email') {
    while (inQuietHours(when, limits)) when = new Date(when.getTime() + 3600_000);
  }

  return when;
}
