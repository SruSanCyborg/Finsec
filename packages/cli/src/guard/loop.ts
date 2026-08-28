/**
 * The continuous loop.
 *
 * The requirement is that security evaluation does not stop when an action is
 * approved: outcomes and changes in behaviour have to be able to influence what
 * happens next. So this is not a filter over a list — it is a fold. Each action
 * is judged against the baseline *as it stands at that moment*, and only then
 * does the baseline move.
 *
 * That ordering is the whole point, and it is easy to get wrong. Judging every
 * action against a baseline built from the entire feed would let an attack teach
 * the profile that the attack is normal before the attack is judged — the
 * evaluation would be reading the future. Folding forwards means the layer sees
 * exactly what a live deployment would see: everything before this action, and
 * nothing after it.
 *
 * The other half is what gets learned. Only actions that actually proceeded are
 * folded in. A blocked action must never move the profile, or an attacker who is
 * refused often enough eventually makes refusal look like the deviation.
 */

import { observe, emptyBaseline } from './baseline.js';
import {
  behaviourStage,
  contextStage,
  identityStage,
  intentStage,
  manipulationStage,
  policyStage,
} from './stages.js';
import { decide, proceeds } from './verdict.js';
import type { Agent, Baseline, Decision, Outcome, ProposedAction } from './types.js';

export interface EvaluateOptions {
  /** Starting baselines, keyed by agent id. Absent agents start empty. */
  baselines?: Record<string, Baseline>;
  /** Outcomes observed for earlier actions, keyed by action id. */
  outcomes?: Record<string, Outcome>;
}

export interface Evaluation {
  decisions: Decision[];
  /** Baselines after the fold — what a live deployment would carry forward. */
  baselines: Record<string, Baseline>;
}

/** Judges one action against the baseline as it stands. Pure. */
export function evaluateAction(
  action: ProposedAction,
  agent: Agent | undefined,
  baseline: Baseline,
): Decision {
  const signals = [
    ...identityStage(action, agent),
    ...intentStage(action, agent),
    ...policyStage(action, agent, baseline),
    ...contextStage(action),
    ...behaviourStage(action, baseline),
    ...manipulationStage(action, agent),
  ];

  return decide(action, signals);
}

/**
 * Folds a feed forwards, updating baselines as it goes.
 *
 * `outcomes` lets a later run correct itself: an action that was allowed and
 * then turned out to be harmful is not folded in, so the profile never learns
 * from it. That is the feedback half of the loop — the same evidence that
 * blocked nothing yesterday can change what happens tomorrow.
 */
export function evaluateFeed(
  actions: readonly ProposedAction[],
  agents: readonly Agent[],
  options: EvaluateOptions = {},
): Evaluation {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const baselines: Record<string, Baseline> = { ...(options.baselines ?? {}) };
  const outcomes = options.outcomes ?? {};
  const decisions: Decision[] = [];

  for (const action of actions) {
    const baseline = baselines[action.agent_id] ?? emptyBaseline(action.agent_id);
    const decision = evaluateAction(action, byId.get(action.agent_id), baseline);
    decisions.push(decision);

    // Learn only from what actually went ahead, and only when the outcome did
    // not later contradict it.
    const outcome = outcomes[action.id];
    const reverted = outcome?.reverted === true;
    if (proceeds(decision) && !reverted) {
      baselines[action.agent_id] = observe(baseline, action, decision.amount_paise);
    } else {
      baselines[action.agent_id] = baseline;
    }
  }

  return { decisions, baselines };
}

/** Counts by tier, for the summary line. */
export function tally(decisions: readonly Decision[]): Record<string, number> {
  const counts: Record<string, number> = { allow: 0, verify: 0, constrain: 0, block: 0 };
  for (const d of decisions) counts[d.tier] = (counts[d.tier] ?? 0) + 1;
  return counts;
}

/** Money that would have moved, and money the layer stopped or trimmed. */
export function moneyMoved(decisions: readonly Decision[], actions: readonly ProposedAction[]) {
  const requested = new Map(actions.map((a) => [a.id, a.amount_paise]));
  let allowed = 0;
  let stopped = 0;
  let trimmed = 0;

  for (const d of decisions) {
    const asked = requested.get(d.action_id) ?? 0;
    if (d.tier === 'block') {
      stopped += asked;
    } else if (d.tier === 'verify') {
      // Held for a step-up: not stopped, not yet moved.
      continue;
    } else {
      allowed += d.amount_paise;
      trimmed += Math.max(0, asked - d.amount_paise);
    }
  }

  return { allowed_paise: allowed, stopped_paise: stopped, trimmed_paise: trimmed };
}
