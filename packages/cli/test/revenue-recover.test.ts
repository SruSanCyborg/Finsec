/**
 * The recovery loop, and the promises it makes about what it will not do.
 *
 * Most of these are refusals. That is deliberate: the recovered figure is the
 * part of an agent that sells itself, and the part that needs testing is
 * everything it declined to do on the way there. A run that collects well and
 * messages someone at 03:00 on a channel they never consented to has not done
 * well, and no revenue number redeems it.
 *
 * The last group is about the trail. An audit trail that cannot detect its own
 * alteration is a log file with extra steps.
 */

import { describe, expect, it } from 'vitest';

import { verifyTrail } from '../src/revenue/audit.js';
import { analyzeBatch } from '../src/revenue/features.js';
import { assessBatch, defaultCapacity, fitModel } from '../src/revenue/model.js';
import {
  channelOf,
  check,
  chooseAction,
  costsFrom,
  describeOverrides,
  emptyState,
  inQuietHours,
  limitsFrom,
  rulesFor,
  DEFAULT_LIMITS,
} from '../src/revenue/policy.js';
import { recover } from '../src/revenue/recover.js';
import { generateBatch, splitOf } from '../src/revenue/synth.js';
import type { RiskRecord } from '../src/revenue/types.js';

function run(seed = 'recover-seed', overrides: Partial<Parameters<typeof recover>[0]> = {}) {
  const generated = generateBatch({ seed, payments: 350, checkouts: 100, invoices: 70 });
  const model = fitModel(generated.records, generated.truth);
  const context = analyzeBatch(generated.records);
  const inSplit = generated.records.filter((record) => splitOf(record.id) === 'test');
  const capacity = defaultCapacity(inSplit.length);
  const { assessments } = assessBatch(inSplit, model, { context, capacity });

  const result = recover({
    records: inSplit,
    assessments,
    truth: generated.truth,
    context,
    batch: 'test-batch',
    startedAt: new Date('2026-08-24T18:30:00.000Z'),
    ...overrides,
  });

  return { generated, context, inSplit, assessments, result };
}

const party = (overrides: Partial<RiskRecord['party']> = {}): RiskRecord['party'] => ({
  id: 'cus_1',
  tenure_days: 400,
  successful_payments: 10,
  failed_payments: 1,
  consent: { email: true, sms: true, whatsapp: true, voice: true },
  contacts_24h: 0,
  dnd: false,
  ...overrides,
});

const payment = (overrides: Partial<RiskRecord> = {}): RiskRecord => ({
  id: 'pay_1',
  kind: 'payment',
  occurred_at: '2026-08-20T10:00:00.000Z',
  amount_paise: 250000,
  currency: 'INR',
  party: party(),
  rail: 'card',
  psp: 'nimbuspay',
  failure_code: 'do_not_honor',
  attempts: 1,
  last_attempt_at: '2026-08-20T10:00:00.000Z',
  ...overrides,
});

const emptyContext = analyzeBatch([]);
const noon = new Date('2026-08-24T06:30:00.000Z'); // 12:00 IST
const night = new Date('2026-08-24T19:30:00.000Z'); // 01:00 IST

describe('choosing what to do', () => {
  it('asks for a new card rather than retrying an expired one', () => {
    // No number of retries changes a date, and the model's probability has
    // nothing to say about it — this is domain knowledge, kept where it can be
    // corrected.
    expect(chooseAction(payment({ failure_code: 'card_expired' }), emptyContext, 0)).toBe('dunning_email');
  });

  it('waits for the salary cycle when the account was empty', () => {
    expect(chooseAction(payment({ failure_code: 'insufficient_funds' }), emptyContext, 0)).toBe(
      'retry_after_cooldown',
    );
  });

  it('asks for fresh authorisation on a revoked mandate, and never re-presents it', () => {
    const revoked = payment({ failure_code: 'mandate_revoked', rail: 'nach_mandate' });
    expect(chooseAction(revoked, emptyContext, 0)).toBe('mandate_reauth');
    expect(chooseAction(revoked, emptyContext, 1)).toBe('write_off');
  });

  it('sends a risk block to a human', () => {
    expect(chooseAction(payment({ failure_code: 'risk_block' }), emptyContext, 0)).toBe('human_review');
  });

  it('switches rail during a gateway outage rather than hammering the same one', () => {
    const record = payment({ failure_code: 'network_timeout' });
    const context = {
      ...emptyContext,
      degraded: new Map([[record.id, {} as never]]),
    };
    expect(chooseAction(record, context, 0)).toBe('switch_rail');
  });

  it('escalates to a different channel rather than repeating itself', () => {
    const record = payment({ kind: 'checkout', drop_off_stage: 'payment' });
    expect(chooseAction(record, emptyContext, 0)).not.toBe(chooseAction(record, emptyContext, 1));
  });
});

describe('the stopping rules', () => {
  const allowed = (record: RiskRecord, action: Parameters<typeof check>[0], at = noon) =>
    check(action, record, emptyContext, emptyState(), at, DEFAULT_LIMITS, 0);

  it('refuses contact on a channel with no consent', () => {
    const record = payment({ party: party({ consent: { email: true, sms: false, whatsapp: true, voice: true } }) });
    const verdict = allowed(record, 'dunning_sms');
    expect(verdict.allowed).toBe(false);
    expect(verdict.rule?.id).toBe('consent');
    expect(verdict.rule?.basis).toContain('DPDP');
  });

  it('refuses SMS at one in the morning, and allows it at noon', () => {
    expect(allowed(payment(), 'dunning_sms', night).allowed).toBe(false);
    expect(allowed(payment(), 'dunning_sms', night).rule?.id).toBe('quiet_hours');
    expect(allowed(payment(), 'dunning_sms', noon).allowed).toBe(true);
  });

  it('still allows email at night, because quiet hours are about interruption', () => {
    expect(allowed(payment(), 'dunning_email', night).allowed).toBe(true);
  });

  it('refuses a party on DND anything but email', () => {
    const record = payment({ party: party({ dnd: true }) });
    expect(allowed(record, 'dunning_sms').rule?.id).toBe('dnd');
    expect(allowed(record, 'dunning_email').allowed).toBe(true);
  });

  it('refuses a third message in a day', () => {
    const record = payment({ party: party({ contacts_24h: 2 }) });
    expect(allowed(record, 'dunning_sms').rule?.id).toBe('contact_frequency');
  });

  it('refuses a fourth re-presentment against a mandate', () => {
    const record = payment({ rail: 'nach_mandate', failure_code: 'insufficient_funds', attempts: 3 });
    const verdict = allowed(record, 'mandate_represent');
    expect(verdict.allowed).toBe(false);
    expect(verdict.rule?.id).toBe('mandate_cap');
    expect(verdict.rule?.basis).toContain('NACH');
  });

  it('refuses to retry a revoked mandate at any attempt count', () => {
    const record = payment({ rail: 'nach_mandate', failure_code: 'mandate_revoked', attempts: 0 });
    expect(allowed(record, 'mandate_represent').rule?.id).toBe('mandate_revoked');
  });

  it('refuses to retry what the issuer refused on risk grounds', () => {
    expect(allowed(payment({ failure_code: 'risk_block' }), 'retry_now').rule?.id).toBe('risk_hold');
  });

  it('refuses anything at all while a dispute is open', () => {
    const record = payment({ in_dispute: true });
    expect(allowed(record, 'retry_now').rule?.id).toBe('dispute_hold');
    expect(allowed(record, 'dunning_email').rule?.id).toBe('dispute_hold');
  });

  it('refuses a retry inside its cooldown, and waits longer when the account was empty', () => {
    const recent = payment({ last_attempt_at: '2026-08-24T05:30:00.000Z' });
    expect(allowed(recent, 'retry_now', noon).rule?.id).toBe('cooldown');

    // Six hours is enough for an ordinary decline and nowhere near enough for
    // an empty account, which needs the salary cycle.
    const sixHoursAgo = payment({ last_attempt_at: '2026-08-24T00:00:00.000Z' });
    expect(allowed(sixHoursAgo, 'retry_now', noon).allowed).toBe(true);
    expect(allowed({ ...sixHoursAgo, failure_code: 'insufficient_funds' }, 'retry_now', noon).rule?.id).toBe(
      'cooldown',
    );
  });

  it('knows which interventions speak and which do not', () => {
    expect(channelOf('dunning_sms')).toBe('sms');
    expect(channelOf('retry_now')).toBeUndefined();
    expect(channelOf('human_review')).toBeUndefined();
  });

  it('reads quiet hours in the policy timezone, not the machine one', () => {
    // 19:30Z is 01:00 in Kolkata. A machine in UTC must still call it night.
    expect(inQuietHours(night)).toBe(true);
    expect(inQuietHours(noon)).toBe(false);
  });
});

describe('a whole run', () => {
  const { result, generated, inSplit } = run();

  it('terminates', () => {
    expect(result.outcome.actions_executed).toBeGreaterThan(0);
  });

  it('reports what it recovered separately from what would have arrived anyway', () => {
    const { outcome } = result;
    expect(outcome.attributable_paise).toBeLessThanOrEqual(outcome.recovered_paise);
    expect(outcome.counterfactual_paise).toBeGreaterThan(0);
  });

  it('nets attributable recovery against what it spent', () => {
    const { outcome } = result;
    expect(outcome.net_paise).toBe(outcome.attributable_paise - outcome.spent_paise);
  });

  it('never touches a record under dispute or in a cluster', () => {
    const byId = new Map(inSplit.map((record) => [record.id, record]));
    const executed = result.trail.entries.filter((entry) => entry.disposition === 'executed');

    for (const entry of executed) {
      const record = byId.get(entry.record_id);
      expect(record?.in_dispute).not.toBe(true);
      expect(record?.failure_code).not.toBe('risk_block');
    }
  });

  it('never sends on a channel without consent', () => {
    const byId = new Map(inSplit.map((record) => [record.id, record]));
    for (const entry of result.trail.entries.filter((e) => e.disposition === 'executed')) {
      const channel = channelOf(entry.action);
      if (!channel) continue;
      expect(byId.get(entry.record_id)?.party.consent[channel], entry.record_id).toBe(true);
    }
  });

  it('records the records it decided to leave alone', () => {
    // The half of an audit trail that is usually missing: "considered, and
    // deliberately not acted on" has to be distinguishable from "never seen".
    const skipped = result.trail.entries.filter((entry) => entry.disposition === 'skipped');
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped.every((entry) => Boolean(entry.detail || entry.rule_id))).toBe(true);
  });

  it('attaches a rule and its basis to everything it refused', () => {
    const blocked = result.trail.entries.filter((entry) => entry.disposition === 'blocked');
    expect(blocked.length).toBeGreaterThan(0);
    for (const entry of blocked) {
      expect(entry.rule_id).toBeTruthy();
      expect(entry.rule_says).toBeTruthy();
    }
  });

  it('gives every executed action the evidence that selected the record', () => {
    for (const entry of result.trail.entries.filter((e) => e.disposition === 'executed')) {
      expect(entry.because?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('stays inside its budget', () => {
    const tight = run('recover-seed', { limits: { ...DEFAULT_LIMITS, budget_paise: 5000 } }).result;
    expect(tight.outcome.spent_paise).toBeLessThanOrEqual(5000);
    expect(tight.outcome.blocked_by.budget ?? 0).toBeGreaterThan(0);
  });

  it('halts when recovery falls far below what was expected', () => {
    const halted = run('recover-seed', {
      limits: {
        ...DEFAULT_LIMITS,
        circuit_breaker: { after_attempts: 5, min_realised_share: 0.99 },
      },
    }).result;

    expect(halted.outcome.halted).toBeTruthy();
    expect(halted.outcome.actions_executed).toBeLessThan(result.outcome.actions_executed);
  });

  it('produces the same numbers when run again', () => {
    // The run id is fresh each time; nothing else may be.
    const again = run().result;
    expect(again.outcome.recovered_paise).toBe(result.outcome.recovered_paise);
    expect(again.outcome.attributable_paise).toBe(result.outcome.attributable_paise);
    expect(again.outcome.actions_executed).toBe(result.outcome.actions_executed);
  });

  it('leaves the batch it read untouched', () => {
    expect(generated.records.some((record) => record.truth !== undefined)).toBe(false);
  });
});

describe('the audit trail', () => {
  const { result } = run();

  it('verifies as written', () => {
    const verification = verifyTrail(JSON.parse(JSON.stringify(result.trail)));
    expect(verification.ok).toBe(true);
    if (verification.ok) expect(verification.entries).toBe(result.trail.entries.length);
  });

  it('says it was simulated, in the document itself', () => {
    expect(result.trail.mode).toBe('simulated');
  });

  it('catches an altered entry, and says which one', () => {
    const tampered = JSON.parse(JSON.stringify(result.trail));
    const target = tampered.entries.findIndex((entry: { recovered_paise?: number }) => entry.recovered_paise);
    tampered.entries[target].recovered_paise *= 10;

    const verification = verifyTrail(tampered);
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.brokenAt).toBe(tampered.entries[target].seq);
  });

  it('catches a deleted entry', () => {
    // The failure a plain log cannot detect: removing the inconvenient line.
    const tampered = JSON.parse(JSON.stringify(result.trail));
    tampered.entries.splice(10, 1);
    expect(verifyTrail(tampered).ok).toBe(false);
  });

  it('catches reordering', () => {
    const tampered = JSON.parse(JSON.stringify(result.trail));
    [tampered.entries[4], tampered.entries[5]] = [tampered.entries[5], tampered.entries[4]];
    expect(verifyTrail(tampered).ok).toBe(false);
  });

  it('catches an entry appended after signing', () => {
    const tampered = JSON.parse(JSON.stringify(result.trail));
    const last = tampered.entries[tampered.entries.length - 1];
    tampered.entries.push({ ...last, seq: last.seq + 1, prev_hash: last.hash });
    expect(verifyTrail(tampered).ok).toBe(false);
  });
});

/**
 * A project's own policy.
 *
 * Every rule in policy.ts was described as "configured policy, not legal advice
 * — the numbers are a compliance team's to change", and for three commits the
 * only way to change one was to edit TypeScript. A limit nobody can set is not
 * policy, it is a constant with a good comment.
 */
describe('limits from sirius.yaml', () => {
  it('falls back to the defaults when the file says nothing', () => {
    expect(limitsFrom(undefined)).toEqual(DEFAULT_LIMITS);
    expect(limitsFrom({})).toEqual(DEFAULT_LIMITS);
  });

  it('takes only the numbers the project pinned', () => {
    const limits = limitsFrom({ contacts_per_day: 1 });
    expect(limits.contacts_per_day).toBe(1);
    // Everything else inherits, so a team can pin the one number it argues
    // about without restating the other twelve.
    expect(limits.mandate_attempts).toBe(DEFAULT_LIMITS.mandate_attempts);
    expect(limits.quiet_hours).toEqual(DEFAULT_LIMITS.quiet_hours);
  });

  it('reads rupees from the file and stores paise', () => {
    // What somebody types in a config file, versus what everything below the
    // formatter uses.
    expect(limitsFrom({ budget_inr: 2500 }).budget_paise).toBe(250000);
    expect(costsFrom({ costs: { annoyance_inr: 400 } }).annoyance_paise).toBe(40000);
  });

  it('binds at the point of decision', () => {
    // Asserted here rather than on a whole run: most parties in a batch are
    // contacted once, so whether one seed happens to produce a second contact
    // is luck. Whether the limit is *applied* is not.
    const record = payment({ party: party({ contacts_24h: 1 }) });
    const at = new Date('2026-08-24T06:30:00.000Z');

    const under = (limits: typeof DEFAULT_LIMITS) =>
      check('dunning_sms', record, emptyContext, emptyState(), at, limits, 0);

    expect(under(limitsFrom({ contacts_per_day: 2 })).allowed).toBe(true);
    expect(under(limitsFrom({ contacts_per_day: 1 })).rule?.id).toBe('contact_frequency');
  });

  it('binds across a whole run too', () => {
    // A policy of "no messages at all" is the unambiguous version: every
    // contact the agent proposes has to come back refused.
    const silent = run('policy-seed', { limits: limitsFrom({ contacts_per_day: 0 }) }).result;
    const normal = run('policy-seed').result;

    expect(silent.outcome.blocked_by.contact_frequency ?? 0).toBeGreaterThan(
      normal.outcome.blocked_by.contact_frequency ?? 0,
    );
    // And nothing that speaks may have been executed.
    for (const entry of silent.trail.entries.filter((e) => e.disposition === 'executed')) {
      expect(channelOf(entry.action)).toBeUndefined();
    }
  });

  it('names what the project moved, and says nothing when it moved nothing', () => {
    expect(describeOverrides(DEFAULT_LIMITS)).toEqual([]);
    const moved = describeOverrides(limitsFrom({ contacts_per_day: 1, mandate_attempts: 2 }));
    expect(moved.join(' ')).toContain('contacts/day');
    expect(moved.join(' ')).toContain('mandate attempts');
  });
});

/**
 * The rules quote the limits actually in force.
 *
 * With a static table, a run under `contacts_per_day: 1` refused an action and
 * explained it with "at most two messages to one party in a rolling day" — the
 * report contradicting the policy it had just enforced. `rule_says` is what an
 * auditor reads out of the trail months later.
 */
describe('what the rules say', () => {
  it('quotes the project\'s own contact limit', () => {
    expect(rulesFor(limitsFrom({ contacts_per_day: 1 })).contact_frequency?.says).toContain('at most 1');
    expect(rulesFor().contact_frequency?.says).toContain('at most 2');
  });

  it('quotes the project\'s own quiet hours, with its timezone', () => {
    const says = rulesFor(limitsFrom({ quiet_hours: { from: 20, to: 10 }, timezone: 'Asia/Kolkata' }))
      .quiet_hours?.says;
    expect(says).toContain('20:00');
    expect(says).toContain('10:00');
    expect(says).toContain('Asia/Kolkata');
  });

  it('never changes the basis, only the numbers', () => {
    // The obligation behind a rule is not a project's to edit; the threshold is.
    const mine = rulesFor(limitsFrom({ mandate_attempts: 2 }));
    expect(mine.mandate_cap?.basis).toBe(rulesFor().mandate_cap?.basis);
    expect(mine.mandate_cap?.says).not.toBe(rulesFor().mandate_cap?.says);
  });

  it('writes the enforced wording into the audit trail, not the built-in one', () => {
    const tight = run('policy-seed', { limits: limitsFrom({ contacts_per_day: 1 }) }).result;
    const blocked = tight.trail.entries.find((entry) => entry.rule_id === 'contact_frequency');
    expect(blocked?.rule_says).toContain('at most 1');
  });
});
