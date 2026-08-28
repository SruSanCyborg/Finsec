/**
 * The loop: detect, decide, act, watch what happened, escalate or stop.
 *
 * A record is not one decision. A failed mandate gets a re-presentment; if that
 * fails it gets a request to re-authorise; if that fails it stops. Each step is
 * scheduled at the earliest moment the rules allow — a retry after its cooldown,
 * an SMS after quiet hours end — so the run is a timeline rather than a burst,
 * and "we waited until 09:00" is a thing the trail can show.
 *
 * Three properties this is built around, in the order they matter:
 *
 *   1. It stops. Every record has a step limit, every rule can veto, the budget
 *      is finite, and a circuit breaker halts the whole run if recovery falls
 *      far below what was expected. An agent that spends money needs a stated
 *      worst case, not an intention.
 *   2. It writes down why. Executed, blocked and skipped all produce an entry.
 *   3. It measures itself against doing nothing. The headline is not what came
 *      back; it is what came back that would not have come back anyway.
 */

import { randomUUID } from 'node:crypto';

import { estimatedCost, interventionCost, DEFAULT_COSTS } from './cost.js';
import type { CostModel } from './cost.js';
import { AuditLog } from './audit.js';
import type { AuditTrail } from './audit.js';
import type { BatchContext } from './features.js';
import { isHeld } from './model.js';
import { simulate, withoutIntervention } from './oracle.js';
import {
  chooseAction,
  check,
  emptyState,
  isRetry,
  nextAllowedTime,
  rulesFor,
  DEFAULT_LIMITS,
} from './policy.js';
import type { PolicyLimits } from './policy.js';
import type { Assessment, GroundTruth, Intervention, RiskRecord } from './types.js';

export interface RecoverOptions {
  records: readonly RiskRecord[];
  assessments: readonly Assessment[];
  truth: ReadonlyMap<string, GroundTruth>;
  context: BatchContext;
  batch: string;
  /** The run's virtual "now". Every schedule is relative to it. */
  startedAt: Date;
  limits?: PolicyLimits;
  costs?: CostModel;
  /** How many times one record may be worked before the agent gives up on it. */
  maxSteps?: number;
  /** Simulated unless a caller explicitly says otherwise; nothing supports live yet. */
  mode?: 'simulated';
}

export interface RecoveryResult {
  run_id: string;
  trail: AuditTrail;
  outcome: RecoveryOutcome;
}

export interface RecoveryOutcome {
  records_considered: number;
  records_worked: number;
  actions_executed: number;
  actions_blocked: number;
  /** Blocked action counts by rule, so the binding constraint is visible. */
  blocked_by: Record<string, number>;
  spent_paise: number;
  /** Everything that came back during the run, including what would have anyway. */
  recovered_paise: number;
  /** The honest figure: recovered minus what would have arrived untouched. */
  attributable_paise: number;
  /** What the same records would have returned with no agent at all. */
  counterfactual_paise: number;
  /** attributable − spent. */
  net_paise: number;
  at_risk_paise: number;
  /** Per-intervention tally: how often used, how often it worked, what it returned. */
  by_action: Record<string, { used: number; worked: number; recovered_paise: number }>;
  escalations: number;
  halted?: string;
}

interface Task {
  record: RiskRecord;
  assessment: Assessment;
  step: number;
  at: number;
  /**
   * Times this task has been pushed later rather than attempted.
   *
   * Capped, because a rescheduling loop is the one way this design could fail
   * to terminate: every deferral moves the clock forward, but a rule that keeps
   * finding a reason to wait would keep it moving forward forever. Three
   * deferrals and the record is left for the next run.
   */
  deferrals: number;
}

export function recover(options: RecoverOptions): RecoveryResult {
  const limits = options.limits ?? DEFAULT_LIMITS;
  // The rules as this run's limits state them. Writing the built-in wording
  // into a trail produced under a project's own policy would put a sentence in
  // the audit record that contradicts the limit actually enforced.
  const rules = rulesFor(limits);
  const costs = options.costs ?? DEFAULT_COSTS;
  const maxSteps = options.maxSteps ?? 3;
  const runId = randomUUID().slice(0, 8);

  const log = new AuditLog(runId, options.batch, options.startedAt.toISOString(), 'simulated');
  const state = emptyState();
  const byId = new Map(options.records.map((record) => [record.id, record]));

  const outcome: RecoveryOutcome = {
    records_considered: options.assessments.length,
    records_worked: 0,
    actions_executed: 0,
    actions_blocked: 0,
    blocked_by: {},
    spent_paise: 0,
    recovered_paise: 0,
    attributable_paise: 0,
    counterfactual_paise: 0,
    net_paise: 0,
    at_risk_paise: options.assessments.reduce((sum, a) => sum + a.amount_paise, 0),
    by_action: {},
    escalations: 0,
  };

  // What these records return if the agent never runs. Computed up front, on
  // the same set, so the comparison is not assembled after the fact from
  // whatever makes the run look best.
  for (const assessment of options.assessments) {
    const record = byId.get(assessment.record_id);
    const label = options.truth.get(assessment.record_id);
    if (!record || !label) continue;
    outcome.counterfactual_paise += withoutIntervention(record, label).recovered_paise;
  }

  // The queue is ordered by time, so the run reads as a timeline. Ties break on
  // expected value: with limited capacity the valuable record goes first.
  const queue: Task[] = [];
  for (const assessment of options.assessments) {
    const record = byId.get(assessment.record_id);
    if (!record) continue;
    if (!assessment.flagged) {
      // Recorded, not silently dropped: "considered and left alone" is a
      // decision, and an audit that cannot show it cannot show diligence either.
      log.append({
        at: options.startedAt.toISOString(),
        record_id: record.id,
        step: 0,
        action: 'wait',
        disposition: 'skipped',
        ...(isHeld(assessment)
          ? {
              rule_id: heldRule(assessment),
              rule_says: rules[heldRule(assessment)]?.says,
              rule_basis: rules[heldRule(assessment)]?.basis,
              detail: assessment.evidence[0]?.detail,
            }
          : { detail: `score ${assessment.score} — below the line for this run's capacity` }),
      });
      continue;
    }
    queue.push({ record, assessment, step: 0, at: options.startedAt.getTime(), deferrals: 0 });
  }

  const worked = new Set<string>();
  let executedSoFar = 0;
  let expectedSoFar = 0;
  let realisedSoFar = 0;

  while (queue.length > 0) {
    queue.sort((a, b) => a.at - b.at || b.assessment.expected_recovery_paise - a.assessment.expected_recovery_paise);
    const task = queue.shift() as Task;
    const at = new Date(task.at);
    const label = options.truth.get(task.record.id);

    const action = chooseAction(task.record, options.context, task.step);
    const cost = interventionCost(action, costs);
    const verdict = check(action, task.record, options.context, state, at, limits, cost);

    if (!verdict.allowed) {
      outcome.actions_blocked += 1;
      const ruleId = verdict.rule?.id ?? 'unknown';
      outcome.blocked_by[ruleId] = (outcome.blocked_by[ruleId] ?? 0) + 1;

      log.append({
        at: at.toISOString(),
        record_id: task.record.id,
        step: task.step,
        action,
        disposition: 'blocked',
        rule_id: ruleId,
        rule_says: verdict.rule?.says,
        rule_basis: verdict.rule?.basis,
        detail: verdict.detail,
      });

      // Some rules are a "not yet" rather than a "no". Reschedule those once,
      // at the first moment they allow, and let the step limit end it.
      if ((ruleId === 'cooldown' || ruleId === 'quiet_hours') && task.deferrals < 3) {
        const when = nextAllowedTime(action, task.record, at, limits);
        if (when.getTime() > at.getTime()) {
          // The step is not advanced — waiting is not an attempt — but the
          // deferral count is, which is what guarantees the loop ends.
          queue.push({ ...task, at: when.getTime(), deferrals: task.deferrals + 1 });
          continue;
        }
      }
      continue;
    }

    if (action === 'wait' || action === 'write_off') {
      log.append({
        at: at.toISOString(),
        record_id: task.record.id,
        step: task.step,
        action,
        disposition: 'skipped',
        detail: action === 'write_off' ? 'nothing further is worth attempting' : 'left alone deliberately',
      });
      continue;
    }

    // ---- execute (simulated)
    worked.add(task.record.id);
    state.spent_paise += cost;
    outcome.spent_paise += cost;
    outcome.actions_executed += 1;
    executedSoFar += 1;

    if (isRetry(action)) state.attempts.set(task.record.id, (state.attempts.get(task.record.id) ?? 0) + 1);
    const channel = action !== 'human_review';
    if (channel) state.contacts.set(task.record.party.id, (state.contacts.get(task.record.party.id) ?? 0) + 1);

    const result = label
      ? simulate(task.record, label, action, task.step)
      : { recovered: false, recovered_paise: 0, probability: 0, would_have_anyway: false };

    const tally = (outcome.by_action[action] ??= { used: 0, worked: 0, recovered_paise: 0 });
    tally.used += 1;

    expectedSoFar += task.assessment.expected_recovery_paise;
    if (result.recovered) {
      tally.worked += 1;
      tally.recovered_paise += result.recovered_paise;
      outcome.recovered_paise += result.recovered_paise;
      realisedSoFar += result.recovered_paise;
      if (!result.would_have_anyway) outcome.attributable_paise += result.recovered_paise;
    }

    log.append({
      at: at.toISOString(),
      record_id: task.record.id,
      step: task.step,
      action,
      disposition: 'executed',
      because: task.assessment.evidence.slice(0, 2).map((e) => `${e.feature}: ${e.detail}`),
      cost_paise: cost,
      recovered_paise: result.recovered_paise,
      ...(result.would_have_anyway ? { self_healed: true } : {}),
      detail: `simulated outcome at p=${result.probability}`,
    });

    // ---- circuit breaker, checked on realised money rather than on a count
    if (
      executedSoFar >= limits.circuit_breaker.after_attempts &&
      expectedSoFar > 0 &&
      realisedSoFar / expectedSoFar < limits.circuit_breaker.min_realised_share
    ) {
      state.halted =
        `realised ${(realisedSoFar / expectedSoFar).toFixed(2)}× of expected after ${executedSoFar} attempts — ` +
        `below the ${limits.circuit_breaker.min_realised_share}× floor`;
      outcome.halted = state.halted;
      log.append({
        at: at.toISOString(),
        record_id: '-',
        step: 0,
        action: 'wait',
        disposition: 'blocked',
        rule_id: rules.circuit_breaker?.id,
        rule_says: rules.circuit_breaker?.says,
        rule_basis: rules.circuit_breaker?.basis,
        detail: state.halted,
      });
      break;
    }

    // ---- escalate, if there is anywhere left to go
    if (!result.recovered && task.step + 1 < maxSteps) {
      const next = chooseAction(task.record, options.context, task.step + 1);
      if (next !== 'wait' && next !== 'write_off') {
        outcome.escalations += 1;
        const when = nextAllowedTime(next, task.record, new Date(at.getTime() + 3600_000), limits);
        queue.push({ ...task, step: task.step + 1, at: when.getTime(), deferrals: 0 });
      }
    }
  }

  outcome.records_worked = worked.size;
  outcome.net_paise = outcome.attributable_paise - outcome.spent_paise;

  return { run_id: runId, trail: log.seal(), outcome };
}

function heldRule(assessment: Assessment): string {
  const detail = assessment.evidence[0]?.detail ?? '';
  if (detail.includes('dispute')) return 'dispute_hold';
  if (detail.includes('risk grounds')) return 'risk_hold';
  return 'ring_hold';
}

/** What the run would have cost had it acted on everything it considered. */
export function fullSweepCost(assessments: readonly Assessment[], costs: CostModel = DEFAULT_COSTS): number {
  return assessments.reduce((sum, assessment) => sum + estimatedCost(assessment.kind, costs), 0);
}
