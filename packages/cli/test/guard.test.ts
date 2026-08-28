/**
 * The control layer for agents that can move money.
 *
 * Two failures matter here and they pull in opposite directions, so both are
 * asserted. Missing an attack is the obvious one. The other is subtler and is
 * what the whole design is arranged around: a layer that intervenes on ordinary
 * work gets switched off, and an operator asked to approve every routine payment
 * has simply become the agent.
 *
 * So the suite checks the attacks are stopped *and* that the 252 ordinary
 * actions in the fixture proceed untouched. The first version of this engine
 * passed the first half and stepped up 194 of 252 ordinary payments — it would
 * have looked correct in any test that only counted catches.
 */

import { describe, expect, it } from 'vitest';

import { emptyBaseline, observe, amountDeviation, exposureTo, isUnusualHour } from '../src/guard/baseline.js';
import { evaluateAction, evaluateFeed, moneyMoved, tally } from '../src/guard/loop.js';
import { intentOverlap } from '../src/guard/stages.js';
import { decide } from '../src/guard/verdict.js';
import { generateFeed } from '../src/guard/synth.js';
import { GuardTrailLog, verifyGuardTrail } from '../src/guard/trail.js';
import { MIN_OBSERVATIONS } from '../src/guard/types.js';
import type { Agent, ProposedAction } from '../src/guard/types.js';

const feed = generateFeed();
const { decisions } = evaluateFeed(feed.actions, feed.agents);
const byId = new Map(decisions.map((d) => [d.action_id, d]));

/** Every decision for actions planted as `kind`. */
const forPlanted = (kind: string) =>
  Object.entries(feed.truth)
    .filter(([, planted]) => planted === kind)
    .map(([id]) => byId.get(id)!);

describe('the attacks it must stop', () => {
  it.each([
    ['prompt_injection', 'an injected instruction redirecting funds'],
    ['flagged_counterparty', 'a counterparty the operator denied'],
    ['out_of_scope', 'an action outside the agent grant'],
    ['unaudited_protocol', 'an unaudited contract'],
    ['drain_attempt', 'an amount sized just under the cap, to a new counterparty'],
  ])('blocks %s — %s', (kind) => {
    const found = forPlanted(kind);
    expect(found.length, `${kind} should be planted in the fixture`).toBeGreaterThan(0);
    for (const decision of found) {
      expect(decision.tier, `${kind} at ${decision.action_id}`).toBe('block');
    }
  });

  it('trims an over-cap payment instead of refusing it outright', () => {
    // Refusing a ₹82,000 payment when the cap is ₹50,000 throws away the
    // ₹50,000 the agent was entitled to move, and pushes the operator toward
    // raising the cap — the opposite of what a limit is for.
    const [decision] = forPlanted('over_cap');
    expect(decision?.tier).toBe('constrain');
    expect(decision?.amount_paise).toBe(50_000_00);
    expect(decision?.constrained_from_paise).toBe(82_000_00);
  });

  it('reports the manipulation, not whichever block was evaluated first', () => {
    // Asserted directly rather than through the fixture. Once the planted cases
    // were spread across separate days the rate limit stopped coinciding with
    // the injection, so the fixture no longer exercised this at all — reverting
    // the precedence left the suite green. Two block signals, the incidental
    // one first, is the case that matters.
    const action: ProposedAction = {
      id: 'x1',
      agent_id: 'a1',
      at: '2026-08-12T10:41:00.000Z',
      kind: 'transfer',
      amount_paise: 48_000_00,
      counterparty: { id: 'wlt-1', kind: 'wallet' },
      intent: 'settle invoice',
    };

    const decision = decide(action, [
      { id: 'policy.rate_limit', stage: 'policy', tier: 'block', says: '12 actions already in the last hour' },
      { id: 'manipulation.injected_instruction', stage: 'manipulation', tier: 'block', says: 'override of prior instructions' },
    ]);

    expect(decision.tier).toBe('block');
    expect(decision.deciding?.id).toBe('manipulation.injected_instruction');
  });

  it('names manipulation as the reason, not an incidental limit', () => {
    // Both can be true at once. Reporting `policy.rate_limit` for a prompt
    // injection would have an operator tuning a rate limit and never learning
    // that an email tried to redirect the payment.
    for (const decision of forPlanted('prompt_injection')) {
      expect(decision.deciding?.id, decision.action_id).toMatch(/^manipulation\./);
    }
  });
});

describe('the ordinary work it must leave alone', () => {
  it('allows every routine action in the fixture', () => {
    const ordinary = Object.entries(feed.truth).filter(([, p]) => p === 'none');
    const intervened = ordinary.filter(([id]) => byId.get(id)!.tier !== 'allow');

    expect(ordinary.length).toBeGreaterThan(200);
    // The number PS7 is really about. If this ever climbs, the layer is on its
    // way to being turned off.
    expect(intervened.map(([id]) => `${id}: ${byId.get(id)!.deciding?.says}`)).toEqual([]);
  });

  it('steps up rather than blocking a genuinely new supplier', () => {
    // Onboarding a vendor is ordinary business. A layer that blocks it teaches
    // the operator to widen the allow list until it protects nothing.
    const [decision] = forPlanted('new_vendor');
    expect(decision?.tier).toBe('verify');
  });

  it('steps up an after-hours payment rather than refusing it', () => {
    const [decision] = forPlanted('after_hours');
    expect(decision?.tier).toBe('verify');
  });

  it('leaves most of the feed untouched', () => {
    const counts = tally(decisions);
    const autonomy = (counts.allow ?? 0) / feed.actions.length;
    expect(autonomy).toBeGreaterThan(0.9);
  });
});

describe('the loop', () => {
  it('judges each action against the baseline as it stood, not the final one', () => {
    // Folding the whole feed first would let an attack teach the profile that
    // the attack is normal before the attack is judged — the evaluation would
    // be reading the future.
    const agent = feed.agents[0] as Agent;
    const first = feed.actions.find((a) => a.agent_id === agent.id) as ProposedAction;

    const cold = evaluateAction(first, agent, emptyBaseline(agent.id));
    const learning = cold.signals.find((s) => s.id === 'behaviour.learning');
    expect(learning, 'an unseen agent has no behavioural opinion yet').toBeDefined();
  });

  it('never learns from an action it refused', () => {
    // Otherwise an attacker refused often enough eventually makes the refusal
    // look like the deviation.
    const agent = feed.agents[0] as Agent;
    const blocked = Object.entries(feed.truth)
      .filter(([, p]) => p === 'prompt_injection')
      .map(([id]) => feed.actions.find((a) => a.id === id) as ProposedAction);

    const { baselines } = evaluateFeed(feed.actions, feed.agents);
    const baseline = baselines[agent.id]!;

    for (const action of blocked) {
      expect(
        baseline.counterparties[action.counterparty.id],
        `${action.counterparty.id} must not be on record`,
      ).toBeUndefined();
    }
  });

  it('carries a baseline forward between runs', () => {
    const half = Math.floor(feed.actions.length / 2);
    const first = evaluateFeed(feed.actions.slice(0, half), feed.agents);
    const second = evaluateFeed(feed.actions.slice(half), feed.agents, { baselines: first.baselines });

    const agent = feed.agents[0]!.id;
    expect(second.baselines[agent]!.n).toBeGreaterThan(first.baselines[agent]!.n);
  });

  it('does not fold in an action whose outcome was later reverted', () => {
    const agent = feed.agents[0] as Agent;
    const action = feed.actions.find((a) => a.agent_id === agent.id) as ProposedAction;

    const kept = evaluateFeed([action], feed.agents);
    const dropped = evaluateFeed([action], feed.agents, {
      outcomes: { [action.id]: { action_id: action.id, executed: true, reverted: true } },
    });

    expect(kept.baselines[agent.id]!.n).toBe(1);
    expect(dropped.baselines[agent.id]!.n).toBe(0);
  });
});

describe('the baseline', () => {
  const agent = 'a1';
  const action = (amount: number, at: string, cp = 'v1'): ProposedAction => ({
    id: `x-${at}`,
    agent_id: agent,
    at,
    kind: 'payment',
    amount_paise: amount,
    counterparty: { id: cp, kind: 'vendor' },
    intent: 'pay',
  });

  it('has no opinion until it has seen enough', () => {
    let baseline = emptyBaseline(agent);
    for (let i = 0; i < MIN_OBSERVATIONS - 1; i += 1) {
      baseline = observe(baseline, action(10_000_00, `2026-08-0${(i % 9) + 1}T10:00:00.000Z`), 10_000_00);
    }
    expect(amountDeviation(baseline, 90_00_000_00)).toBeUndefined();
  });

  it('measures amounts in log space, so one large payment does not reset normal', () => {
    // A plain mean would be dragged up by a single settlement and every
    // ordinary payment would then look small.
    let baseline = emptyBaseline(agent);
    for (let i = 0; i < 40; i += 1) {
      baseline = observe(baseline, action(5_000_00, `2026-08-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`), 5_000_00);
    }
    baseline = observe(baseline, action(50_00_000_00, '2026-08-20T10:00:00.000Z'), 50_00_000_00);

    // A typical payment is still typical after the outlier.
    const z = amountDeviation(baseline, 5_000_00);
    expect(Math.abs(z ?? 99)).toBeLessThan(1);
  });

  it('does not call an hour unusual before it has seen the clock', () => {
    // The bug that stepped up 194 of 252 ordinary payments: at twelve
    // observations the histogram is three hours wide, so every fourth hour
    // looks unprecedented.
    let baseline = emptyBaseline(agent);
    for (let i = 0; i < 20; i += 1) {
      baseline = observe(baseline, action(5_000_00, `2026-08-03T09:${String(i % 60).padStart(2, '0')}:00.000Z`), 5_000_00);
    }
    expect(isUnusualHour(baseline, 15)).toBe(false);
  });

  it('measures concentration over a window, not over all time', () => {
    // Accumulating forever made the limit measure loyalty: an agent paying the
    // same vendor every week breached its own exposure cap doing its job.
    let baseline = emptyBaseline(agent);
    baseline = observe(baseline, action(1_00_000_00, '2026-08-01T10:00:00.000Z'), 1_00_000_00);
    baseline = observe(baseline, action(1_00_000_00, '2026-08-02T10:00:00.000Z'), 1_00_000_00);

    expect(exposureTo(baseline, 'v1', '2026-08-03T10:00:00.000Z')).toBe(2_00_000_00);
    // Three weeks later the same payments are outside the window.
    expect(exposureTo(baseline, 'v1', '2026-08-25T10:00:00.000Z')).toBe(0);
  });
});

describe('intent against the authorised objective', () => {
  it('scores a matching purpose highly', () => {
    expect(
      intentOverlap('settle approved vendor invoice within budget', 'settle approved vendor invoices and payroll within budget'),
    ).toBeGreaterThan(0.5);
  });

  it('scores an unrelated purpose near zero', () => {
    expect(
      intentOverlap('purchase cryptocurrency for speculative trading', 'settle approved vendor invoices and payroll within budget'),
    ).toBeLessThan(0.15);
  });
});

describe('the decision trail', () => {
  /**
   * A trail holding both kinds of decision.
   *
   * The first forty decisions are all routine — the refusals come later in the
   * feed — so a slice off the front had nothing to tamper with and the tamper
   * test was asserting against an empty fixture.
   */
  const sample = [...decisions.filter((d) => d.tier === 'allow').slice(0, 20), ...decisions.filter((d) => d.tier !== 'allow')];

  const build = () => {
    const log = new GuardTrailLog('run-1', 'feed', '2026-08-28T00:00:00.000Z');
    const byAction = new Map(feed.actions.map((a) => [a.id, a]));
    for (const decision of sample) {
      log.append(decision, byAction.get(decision.action_id)?.amount_paise ?? 0);
    }
    return log;
  };

  it('verifies a trail it wrote', () => {
    const result = verifyGuardTrail(build().seal());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries).toBe(sample.length);
  });

  it('catches a refusal rewritten as an approval', () => {
    // The entry somebody has a reason to edit: an action that was blocked, made
    // to look as though it was allowed all along.
    const trail = build().seal();
    const blocked = trail.entries.find((e) => e.tier === 'block');
    expect(blocked, 'the fixture should contain a refusal').toBeDefined();
    blocked!.tier = 'allow';

    const result = verifyGuardTrail(trail);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('altered');
  });

  it('catches a decision removed from the middle', () => {
    const trail = build().seal();
    trail.entries.splice(10, 1);
    expect(verifyGuardTrail(trail).ok).toBe(false);
  });

  it('records the allowed decisions too, not only the refusals', () => {
    // The interesting case is an action that was allowed and turned out badly.
    // A trail holding only refusals cannot answer for it.
    const trail = build().seal();
    expect(trail.entries.some((e) => e.tier === 'allow')).toBe(true);
  });

  it('refuses a trail signed by a different key when one is required', () => {
    const trail = build().seal();
    const result = verifyGuardTrail(trail, 'deadbeefdeadbeef');
    expect(result.ok).toBe(false);
  });
});

describe('what the run reports', () => {
  it('adds up: allowed money never exceeds what was asked for', () => {
    const money = moneyMoved(decisions, feed.actions);
    const asked = feed.actions.reduce((sum, a) => sum + a.amount_paise, 0);
    expect(money.allowed_paise).toBeLessThanOrEqual(asked);
    expect(money.allowed_paise + money.stopped_paise + money.trimmed_paise).toBeLessThanOrEqual(asked);
  });

  it('counts every action exactly once', () => {
    const counts = tally(decisions);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(feed.actions.length);
  });
});
