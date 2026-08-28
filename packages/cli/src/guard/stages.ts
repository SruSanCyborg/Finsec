/**
 * The six questions asked of every proposed action.
 *
 * Each stage returns signals rather than a decision. Nothing here decides on its
 * own — `verdict.ts` combines them — because the same fact means different
 * things in combination: a first-time counterparty is routine, a large amount is
 * routine, and a large amount to a first-time counterparty at 3am on an
 * instruction fetched from a web page is not.
 *
 * Every signal carries the limit or obligation it answers to. A control layer
 * that says "blocked: risk" teaches an operator nothing and gets switched off.
 */

import {
  amountDeviation,
  exposureTo,
  isKnownCounterparty,
  isKnownKind,
  isUnusualHour,
  rateBefore,
  spentOn,
} from './baseline.js';
import { MIN_OBSERVATIONS } from './types.js';
import { formatInr } from '../money.js';
import type { Agent, Baseline, ProposedAction, Signal } from './types.js';

const rupees = (paise: number): string => formatInr(Math.round(paise / 100));

// ---------------------------------------------------------------- 1. identity

/**
 * Is this agent allowed to do this kind of thing at all?
 *
 * The cheapest question and the one that must come first: everything after it
 * assumes the actor is who it claims and is operating inside its grant.
 */
export function identityStage(action: ProposedAction, agent: Agent | undefined): Signal[] {
  if (!agent) {
    return [
      {
        id: 'identity.unknown_agent',
        stage: 'identity',
        tier: 'block',
        says: `no agent registered as ${action.agent_id}`,
        basis: 'an unregistered actor has no grant, so there is nothing to authorise against',
      },
    ];
  }

  const signals: Signal[] = [];

  if (!agent.scopes.includes(action.kind)) {
    signals.push({
      id: 'identity.out_of_scope',
      stage: 'identity',
      tier: 'block',
      says: `${action.kind} is outside this agent's grant`,
      basis: `granted: ${agent.scopes.join(', ')}`,
    });
  }

  return signals;
}

// ------------------------------------------------------------------ 2. intent

/**
 * Does what the agent says it is doing match what it was authorised to do?
 *
 * PS7's phrasing is that a technically valid transaction must not automatically
 * be treated as legitimate behaviour. This is where that is enforced: the agent
 * states an intent, the operator wrote an objective, and the two have to be
 * about the same thing.
 *
 * Deliberately a lexical overlap rather than a model call. The check runs in
 * front of a live agent on every action, and a stage that needs a network round
 * trip to a language model is a stage that fails open under load — which is the
 * worst possible failure mode for a control layer. Overlap is crude and its
 * crudeness is visible in the output, which is better than a confident score
 * nobody can audit.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'from',
  'this', 'that', 'is', 'are', 'be', 'as', 'its', 'it', 'per', 'up', 'via', 'into', 'only',
]);

const words = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );

/** Share of the intent's meaningful words that also appear in the objective. */
export function intentOverlap(intent: string, objective: string): number {
  const a = words(intent);
  const b = words(objective);
  if (a.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / a.size;
}

export function intentStage(action: ProposedAction, agent: Agent | undefined): Signal[] {
  if (!agent) return [];
  const signals: Signal[] = [];

  if (!action.intent || action.intent.trim().length === 0) {
    signals.push({
      id: 'intent.unstated',
      stage: 'intent',
      tier: 'verify',
      says: 'the agent gave no purpose for this action',
      basis: 'an action whose purpose is unstated cannot be checked against the objective',
    });
    return signals;
  }

  const overlap = intentOverlap(action.intent, agent.objective);
  if (overlap < 0.15) {
    signals.push({
      id: 'intent.off_objective',
      stage: 'intent',
      tier: 'block',
      says: `stated purpose does not match the agent's objective`,
      basis: `objective: "${agent.objective}"`,
    });
  } else if (overlap < 0.35) {
    signals.push({
      id: 'intent.weak_match',
      stage: 'intent',
      tier: 'verify',
      says: `stated purpose only loosely matches the objective`,
      basis: `objective: "${agent.objective}"`,
    });
  }

  return signals;
}

// ------------------------------------------------------------------ 3. policy

/**
 * The explicit limits, which are not negotiable and are checked before anything
 * is allowed to touch money.
 *
 * These produce `constrain` rather than `block` where a smaller action would
 * have been fine. Refusing a ₹80,000 transfer outright when the cap is ₹50,000
 * throws away the ₹50,000 the agent was entitled to move, and pushes the
 * operator toward raising the cap — which is the opposite of what a limit is
 * for.
 */
export function policyStage(action: ProposedAction, agent: Agent | undefined, baseline: Baseline): Signal[] {
  if (!agent) return [];
  const signals: Signal[] = [];
  const limits = agent.limits;

  if (action.amount_paise > limits.per_action_paise) {
    signals.push({
      id: 'policy.per_action_cap',
      stage: 'policy',
      tier: 'constrain',
      says: `${rupees(action.amount_paise)} is over the per-action cap`,
      basis: `cap ${rupees(limits.per_action_paise)}`,
      constrain_to_paise: limits.per_action_paise,
    });
  }

  // Sitting just under the ceiling is itself a signal.
  //
  // A cap stops an action that exceeds it and says nothing about one that lands
  // at 99% of it — but that is exactly where a competent attacker aims, because
  // it is the most that can be taken in one move without tripping anything. On
  // its own this is weak (a large legitimate invoice looks the same), so it is
  // raised as `verify` and only becomes decisive in combination.
  const ceiling = limits.per_action_paise;
  if (action.amount_paise <= ceiling && action.amount_paise >= ceiling * 0.9) {
    signals.push({
      id: 'policy.near_cap',
      stage: 'policy',
      tier: 'verify',
      says: `${rupees(action.amount_paise)} is within 10% of the per-action ceiling`,
      basis: `cap ${rupees(ceiling)} — the shape of an action sized to the limit`,
    });
  }

  const spent = spentOn(baseline, action.at);
  const remaining = limits.daily_paise - spent;
  if (action.amount_paise > remaining) {
    signals.push({
      id: 'policy.daily_cap',
      stage: 'policy',
      tier: remaining > 0 ? 'constrain' : 'block',
      says:
        remaining > 0
          ? `only ${rupees(remaining)} left of today's allowance`
          : `today's allowance is spent`,
      basis: `daily ${rupees(limits.daily_paise)}, already ${rupees(spent)}`,
      ...(remaining > 0 ? { constrain_to_paise: remaining } : {}),
    });
  }

  const exposure = exposureTo(baseline, action.counterparty.id, action.at);
  const headroom = limits.exposure_paise - exposure;
  if (action.amount_paise > headroom) {
    signals.push({
      id: 'policy.exposure_cap',
      stage: 'policy',
      tier: headroom > 0 ? 'constrain' : 'block',
      says: `would put ${rupees(exposure + action.amount_paise)} with ${action.counterparty.id}`,
      basis: `exposure limit ${rupees(limits.exposure_paise)} per counterparty`,
      ...(headroom > 0 ? { constrain_to_paise: headroom } : {}),
    });
  }

  if (limits.blocked_counterparties?.includes(action.counterparty.id)) {
    signals.push({
      id: 'policy.counterparty_blocked',
      stage: 'policy',
      tier: 'block',
      says: `${action.counterparty.id} is on this agent's deny list`,
      basis: 'an operator decision, not a risk score',
    });
  }

  if (limits.allowed_counterparties && !limits.allowed_counterparties.includes(action.counterparty.id)) {
    signals.push({
      id: 'policy.counterparty_not_allowed',
      stage: 'policy',
      tier: 'block',
      says: `${action.counterparty.id} is not on this agent's allow list`,
      basis: `permitted: ${limits.allowed_counterparties.join(', ')}`,
    });
  }

  if (action.protocol && limits.allowed_protocols && !limits.allowed_protocols.includes(action.protocol.name)) {
    signals.push({
      id: 'policy.protocol_not_allowed',
      stage: 'policy',
      tier: 'block',
      says: `${action.protocol.name} is not a permitted protocol`,
      basis: `permitted: ${limits.allowed_protocols.join(', ')}`,
    });
  }

  const rate = rateBefore(baseline, action.at);
  if (rate >= limits.max_actions_per_hour) {
    signals.push({
      id: 'policy.rate_limit',
      stage: 'policy',
      tier: 'block',
      says: `${rate} actions already in the last hour`,
      basis: `limit ${limits.max_actions_per_hour} per hour`,
    });
  }

  if (limits.quiet_hours) {
    const hour = new Date(action.at).getUTCHours();
    const { from, to } = limits.quiet_hours;
    const inside = from <= to ? hour >= from && hour < to : hour >= from || hour < to;
    if (inside) {
      signals.push({
        id: 'policy.quiet_hours',
        stage: 'policy',
        tier: 'verify',
        says: `${String(hour).padStart(2, '0')}:00 is inside this agent's quiet hours`,
        basis: `quiet ${String(from).padStart(2, '0')}:00–${String(to).padStart(2, '0')}:00`,
      });
    }
  }

  return signals;
}

// ----------------------------------------------------------------- 4. context

/** How risky are this counterparty, this protocol, and this amount right now? */
export function contextStage(action: ProposedAction): Signal[] {
  const signals: Signal[] = [];
  const cp = action.counterparty;

  if (cp.flags && cp.flags.length > 0) {
    signals.push({
      id: 'context.counterparty_flagged',
      stage: 'context',
      tier: 'block',
      says: `${cp.id} carries ${cp.flags.join(', ')}`,
      basis: 'a flagged counterparty is refused regardless of amount',
    });
  }

  if (cp.reputation !== undefined && cp.reputation < 0.3) {
    signals.push({
      id: 'context.low_reputation',
      stage: 'context',
      tier: 'verify',
      says: `${cp.id} has a weak history (${cp.reputation.toFixed(2)})`,
      basis: 'reputation below 0.30',
    });
  }

  if (!cp.first_seen) {
    signals.push({
      id: 'context.new_counterparty',
      stage: 'context',
      tier: 'verify',
      says: `first time sending to ${cp.id}`,
      basis: 'a counterparty with no history is not yet a known one',
    });
  }

  if (action.protocol && !action.protocol.audited) {
    signals.push({
      id: 'context.unaudited_protocol',
      stage: 'context',
      tier: 'constrain',
      says: `${action.protocol.name} is unaudited`,
      basis: 'unaudited contracts hold the whole amount at risk, not a fee',
    });
  }

  if (action.protocol?.age_days !== undefined && action.protocol.age_days < 30) {
    signals.push({
      id: 'context.young_protocol',
      stage: 'context',
      tier: 'verify',
      says: `${action.protocol.name} is ${action.protocol.age_days} days old`,
      basis: 'under 30 days — too new to have a track record',
    });
  }

  return signals;
}

// --------------------------------------------------------------- 5. behaviour

/**
 * Is this consistent with how the agent has actually behaved?
 *
 * Abstains below `MIN_OBSERVATIONS` rather than guessing. An agent's third
 * action is not anomalous merely because there were only two before it, and a
 * layer that cries wolf in its first week is one an operator turns off — which
 * is the real failure, not a missed signal.
 */
export function behaviourStage(action: ProposedAction, baseline: Baseline): Signal[] {
  if (baseline.n < MIN_OBSERVATIONS) {
    return [
      {
        id: 'behaviour.learning',
        stage: 'behaviour',
        tier: 'allow',
        says: `only ${baseline.n} of ${MIN_OBSERVATIONS} observations — no behavioural opinion yet`,
        basis: 'the stage abstains rather than calling an unknown agent normal',
      },
    ];
  }

  const signals: Signal[] = [];

  const z = amountDeviation(baseline, action.amount_paise);
  if (z !== undefined && z >= 3) {
    signals.push({
      id: 'behaviour.amount_outlier',
      stage: 'behaviour',
      tier: 'constrain',
      says: `${rupees(action.amount_paise)} is ${z.toFixed(1)}σ above this agent's usual`,
      basis: `over ${baseline.n} actions, in log space`,
    });
  } else if (z !== undefined && z >= 2) {
    signals.push({
      id: 'behaviour.amount_unusual',
      stage: 'behaviour',
      tier: 'verify',
      says: `${rupees(action.amount_paise)} is ${z.toFixed(1)}σ above this agent's usual`,
      basis: `over ${baseline.n} actions, in log space`,
    });
  }

  if (!isKnownCounterparty(baseline, action.counterparty.id)) {
    signals.push({
      id: 'behaviour.unseen_counterparty',
      stage: 'behaviour',
      tier: 'verify',
      says: `this agent has never transacted with ${action.counterparty.id}`,
      basis: `${Object.keys(baseline.counterparties).length} counterparties on record`,
    });
  }

  if (!isKnownKind(baseline, action.kind)) {
    signals.push({
      id: 'behaviour.unseen_kind',
      stage: 'behaviour',
      tier: 'verify',
      says: `this agent has never performed a ${action.kind}`,
      basis: `seen: ${Object.keys(baseline.kinds).join(', ') || 'nothing yet'}`,
    });
  }

  const hour = new Date(action.at).getUTCHours();
  if (isUnusualHour(baseline, hour)) {
    signals.push({
      id: 'behaviour.unusual_hour',
      stage: 'behaviour',
      tier: 'verify',
      says: `this agent almost never acts at ${String(hour).padStart(2, '0')}:00`,
      basis: 'under 2% of its actions fall in this hour',
    });
  }

  return signals;
}

// ------------------------------------------------------------ 6. manipulation

/**
 * Is the instruction behind this action trustworthy?
 *
 * The requirement that has no equivalent in conventional payment security: an
 * agent reads things, and some of what it reads is written by whoever wants it
 * to move money. The transaction can be perfectly signed and the agent
 * perfectly obedient — the compromise happened upstream of the signature.
 *
 * Two independent checks, because either alone is easy to defeat:
 *
 *   the *source* — content the agent fetched is not an instruction from its
 *   operator, however imperative it sounds
 *   the *shape* — override phrasing, urgency stacked with secrecy, and
 *   redirection of funds are what injected instructions actually look like
 *
 * The patterns catch the common shapes, not every possible one, and the output
 * quotes what matched so a person can judge it. A confident-looking score with
 * no visible evidence would be worse than useless here.
 */
const OVERRIDE_PATTERNS: Array<{ pattern: RegExp; what: string }> = [
  { pattern: /\b(ignore|disregard|forget|override)\b[^.]{0,40}\b(previous|prior|earlier|above|all)\b/i, what: 'override of prior instructions' },
  { pattern: /\byou are now\b|\bnew (?:instructions?|role|system prompt)\b/i, what: 'role reassignment' },
  { pattern: /\b(do not|don't|never)\b[^.]{0,30}\b(tell|inform|notify|log|report|mention)\b/i, what: 'instruction to conceal' },
  { pattern: /\bwithout\b[^.]{0,20}\b(approval|authorisation|authorization|review|confirmation)\b/i, what: 'instruction to bypass approval' },
  { pattern: /\b(urgent|immediately|right now|asap)\b[^.]{0,60}\b(transfer|send|pay|withdraw|move)\b/i, what: 'urgency attached to a movement of funds' },
  { pattern: /\b(updated|new|corrected|changed)\b[^.]{0,30}\b(account|wallet|address|iban|beneficiary)\b/i, what: 'redirection to a different account' },
  { pattern: /\bsystem\b[^.]{0,20}\b(override|maintenance|migration)\b[^.]{0,40}\b(transfer|send|release)\b/i, what: 'fabricated system authority' },
];

export function manipulationStage(action: ProposedAction, agent: Agent | undefined): Signal[] {
  const instruction = action.instruction;
  if (!instruction) return [];

  const signals: Signal[] = [];
  const trusted = agent?.trusted_sources ?? ['operator'];

  const matched = OVERRIDE_PATTERNS.filter((p) => p.pattern.test(instruction.text));

  if (matched.length > 0) {
    signals.push({
      id: 'manipulation.injected_instruction',
      stage: 'manipulation',
      tier: 'block',
      says: `the instruction contains ${matched.map((m) => m.what).join('; ')}`,
      basis: `source: ${instruction.source}`,
    });
  }

  if (!trusted.includes(instruction.source)) {
    signals.push({
      id: 'manipulation.untrusted_source',
      stage: 'manipulation',
      // Content the agent fetched is not an instruction, so an action driven by
      // it is escalated even when the text looks innocuous.
      tier: matched.length > 0 ? 'block' : 'verify',
      says: `driven by ${instruction.source} content, which this agent may not act on unprompted`,
      basis: `trusted sources: ${trusted.join(', ')}`,
    });
  }

  if (instruction.untrusted && action.amount_paise > 0) {
    signals.push({
      id: 'manipulation.untrusted_content_moves_money',
      stage: 'manipulation',
      tier: 'block',
      says: 'fetched content is asking for money to move',
      basis: 'retrieved text is data, never an instruction to transact',
    });
  }

  return signals;
}
