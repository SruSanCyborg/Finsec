/**
 * Turning six stages' signals into one graduated answer.
 *
 * The requirement this exists for is that not all actions are treated alike.
 * Blocking everything unusual makes an autonomous agent pointless — an operator
 * asked to approve every routine payment has simply become the agent. Allowing
 * everything technically valid makes it a liability. So the answer has four
 * levels, and most actions should reach the first one:
 *
 *   allow      proceeds untouched, nobody is asked
 *   verify     proceeds after a second factor — a step-up, not a person
 *   constrain  proceeds at a smaller amount that was within the limits
 *   block      does not proceed, and a person is told why
 *
 * The verdict is the **strongest signal raised**, not a weighted score. A score
 * would let three mild signals outvote one categorical refusal, and some of
 * these are categorical: a counterparty on a deny list is not 0.7 of a problem.
 * Where combination genuinely matters it is stated as its own rule below, so it
 * is visible rather than buried in weights nobody can audit.
 */

import { tierRank } from './types.js';
import type { Decision, ProposedAction, Signal, Tier } from './types.js';

/**
 * Pairs that mean more together than apart.
 *
 * Each is a real escalation and each is listed rather than emergent, because an
 * operator has to be able to read why an action was refused and disagree with
 * the reasoning. A learned combiner would be more accurate and would fail this
 * test — and in a control layer, being auditable outranks being subtle.
 */
const COMBINATIONS: Array<{ when: string[]; tier: Tier; says: string; basis: string }> = [
  {
    when: ['behaviour.unseen_counterparty', 'behaviour.amount_outlier'],
    tier: 'block',
    says: 'largest amount this agent has sent, to a counterparty it has never used',
    basis: 'either alone is ordinary; together they are the shape of a drained account',
  },
  {
    // The version that actually shows up. An attacker who has read the policy
    // does not exceed the cap — they sit just under it, which raises no limit
    // breach at all and only 2σ on amount. Paired with a counterparty the agent
    // has never used, that is the drain, and the near-cap sizing is what
    // distinguishes it from a first payment to a new supplier.
    when: ['policy.near_cap', 'behaviour.unseen_counterparty'],
    tier: 'block',
    says: 'an amount sized just under the cap, to a counterparty never used before',
    basis: 'the limit was not breached because it was measured first',
  },
  {
    when: ['behaviour.unseen_counterparty', 'behaviour.unseen_kind', 'behaviour.amount_unusual'],
    tier: 'block',
    says: 'a kind of action this agent has never taken, to a party it has never used, for an unusual amount',
    basis: 'three firsts at once is not a first',
  },
  {
    when: ['manipulation.untrusted_source', 'behaviour.unseen_counterparty'],
    tier: 'block',
    says: 'untrusted content is directing funds somewhere new',
    basis: 'the two halves of an injection that actually pays out',
  },
  {
    when: ['context.new_counterparty', 'policy.quiet_hours'],
    tier: 'constrain',
    says: 'first payment to this counterparty, outside operating hours',
    basis: 'no one is watching, and there is no history to judge it against',
  },
  {
    when: ['context.unaudited_protocol', 'behaviour.amount_outlier'],
    tier: 'block',
    says: 'an unusually large amount into an unaudited contract',
    basis: 'the whole amount is at risk, and the amount is the largest on record',
  },
];

/**
 * The smallest constraint any signal asked for.
 *
 * When several stages each cap the action, the binding one is the lowest — the
 * action has to satisfy all of them, not the most generous.
 */
function constrainedAmount(signals: readonly Signal[], requested: number): number | undefined {
  const caps = signals
    .map((s) => s.constrain_to_paise)
    .filter((v): v is number => typeof v === 'number');
  if (caps.length === 0) return undefined;
  const cap = Math.min(...caps);
  return cap < requested ? Math.max(0, cap) : undefined;
}

export function decide(action: ProposedAction, signals: Signal[]): Decision {
  const all = [...signals];

  for (const combo of COMBINATIONS) {
    if (combo.when.every((id) => all.some((s) => s.id === id))) {
      all.push({
        id: `combination.${combo.when.map((w) => w.split('.')[1]).join('_')}`,
        stage: 'behaviour',
        tier: combo.tier,
        says: combo.says,
        basis: combo.basis,
      });
    }
  }

  let tier: Tier = 'allow';
  for (const signal of all) {
    if (tierRank(signal.tier) > tierRank(tier)) tier = signal.tier;
  }

  const deciding = pickDeciding(all, tier);

  const cap = constrainedAmount(all, action.amount_paise);

  // A constraint only stands if nothing stronger was raised. Cutting a blocked
  // action down to size and letting it through would be the worst of both.
  const constrainApplies = tier === 'constrain' && cap !== undefined;
  const amount = constrainApplies ? (cap as number) : action.amount_paise;

  // `constrain` with nothing to constrain to is really a refusal — say so
  // rather than reporting a reduction that did not happen.
  const finalTier: Tier = tier === 'constrain' && cap === undefined ? 'verify' : tier;

  return {
    action_id: action.id,
    agent_id: action.agent_id,
    at: action.at,
    tier: finalTier,
    amount_paise: amount,
    ...(constrainApplies ? { constrained_from_paise: action.amount_paise } : {}),
    signals: all,
    ...(deciding ? { deciding } : {}),
  };
}

/**
 * Which signal to report as the reason, among those at the deciding tier.
 *
 * Taking the first one found reported a prompt injection as `policy.rate_limit`,
 * because the rate limit happened to be evaluated earlier. Both were true and
 * only one was the story — an operator reading "12 actions already in the last
 * hour" would tune the rate limit and never learn that an email had tried to
 * redirect the payment.
 *
 * So equal-tier signals are ordered by how fundamental they are. Manipulation
 * and identity come first because they say the action should not be happening at
 * all; a limit breach is a fact about size, and gets reported only when nothing
 * deeper is wrong.
 */
const PRECEDENCE = ['manipulation', 'identity', 'intent', 'combination', 'policy', 'context', 'behaviour'];

function pickDeciding(signals: readonly Signal[], tier: Tier): Signal | undefined {
  const candidates = signals.filter((s) => s.tier === tier);
  if (candidates.length === 0) return undefined;

  const rank = (signal: Signal): number => {
    const family = signal.id.startsWith('combination.') ? 'combination' : signal.stage;
    const index = PRECEDENCE.indexOf(family);
    return index === -1 ? PRECEDENCE.length : index;
  };

  return [...candidates].sort((a, b) => rank(a) - rank(b))[0];
}

/** Whether the action goes ahead at all, in whatever size. */
export const proceeds = (decision: Decision): boolean =>
  decision.tier === 'allow' || decision.tier === 'constrain';

/** One-word summary for a machine reading the output. */
export const dispositionOf = (decision: Decision): 'executed' | 'stepped-up' | 'constrained' | 'blocked' =>
  decision.tier === 'allow'
    ? 'executed'
    : decision.tier === 'verify'
      ? 'stepped-up'
      : decision.tier === 'constrain'
        ? 'constrained'
        : 'blocked';
