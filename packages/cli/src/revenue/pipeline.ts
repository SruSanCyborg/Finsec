/**
 * One batch, end to end: load, fit, score, act.
 *
 * Extracted so `recover` and `watch` run the same code rather than two copies
 * that agree until they do not. Everything the two commands need is returned
 * rather than printed, because one of them prints a report and the other prints
 * the difference between two runs.
 *
 * Nothing here writes to disk. The audit trail is a return value; whether it is
 * saved is the caller's decision, and a watch loop re-running on every keystroke
 * should not leave a hundred signed trails behind it.
 */

import type { CostModel } from './cost.js';
import { analyzeBatch } from './features.js';
import type { BatchContext } from './features.js';
import { assessBatch, defaultCapacity, fitModel } from './model.js';
import type { Capacity, Model } from './model.js';
import type { PolicyLimits } from './policy.js';
import { recover } from './recover.js';
import type { RecoveryResult } from './recover.js';
import { loadBatch, loadTruth } from './store.js';
import type { LoadedBatch } from './store.js';
import { splitOf } from './synth.js';
import type { Assessment, GroundTruth, RiskRecord, Split } from './types.js';

export interface PipelineOptions {
  dir: string;
  split: Split | 'all';
  limits: PolicyLimits;
  costs: CostModel;
  /** Explicit capacity, or a fifth of the split. */
  capacity?: Capacity;
  maxSteps?: number;
  /** Skip the recovery run — `detect` does not need it. */
  actOn?: boolean;
  /**
   * A model fitted elsewhere.
   *
   * The command layer owns `--model` and the fitted-model file it writes beside
   * the batch; this layer should not learn about either. Absent, it fits on the
   * batch's own training split.
   */
  model?: Model;
}

export interface PipelineResult {
  batch: LoadedBatch;
  model: Model;
  context: BatchContext;
  /** The records actually in front of the agent — the split being worked. */
  inSplit: RiskRecord[];
  assessments: Assessment[];
  capacity: Capacity;
  truth: ReadonlyMap<string, GroundTruth>;
  /** Absent when `actOn` is false. */
  recovery?: RecoveryResult;
}

export function runBatch(options: PipelineOptions): PipelineResult {
  const batch = loadBatch(options.dir);
  const truth = loadTruth(options.dir);
  const model = options.model ?? fitModel(batch.records, truth, options.costs);

  // The context is built from the whole batch even when one split is being
  // worked: an outage is visible in all the traffic, and a cluster that spans
  // the split is still a cluster. Only the selection is confined.
  const context = analyzeBatch(batch.records);
  const inSplit = batch.records.filter(
    (record) => options.split === 'all' || splitOf(record.id) === options.split,
  );

  const capacity = options.capacity ?? defaultCapacity(inSplit.length);
  const { assessments } = assessBatch(inSplit, model, { context, capacity, costs: options.costs });

  if (options.actOn === false) {
    return { batch, model, context, inSplit, assessments, capacity, truth };
  }

  const recovery = recover({
    records: inSplit,
    assessments,
    truth,
    context,
    batch: batch.dir,
    startedAt: batch.manifest.as_of ? new Date(batch.manifest.as_of) : new Date(),
    limits: options.limits,
    costs: options.costs,
    ...(options.maxSteps ? { maxSteps: options.maxSteps } : {}),
  });

  return { batch, model, context, inSplit, assessments, capacity, truth, recovery };
}

/** The handful of numbers a watch loop compares between runs. */
export interface RunSummary {
  capacity: number;
  floor: number;
  flagged: number;
  held: number;
  actions: number;
  blocked: number;
  blocked_by: Record<string, number>;
  attributable_paise: number;
  spent_paise: number;
  recovered_paise: number;
}

export function summarise(result: PipelineResult): RunSummary {
  const outcome = result.recovery?.outcome;

  return {
    capacity: result.capacity.max_actions,
    floor: result.model.threshold,
    flagged: result.assessments.filter((assessment) => assessment.flagged).length,
    held: result.assessments.filter((assessment) => assessment.evidence[0]?.feature === 'hold').length,
    actions: outcome?.actions_executed ?? 0,
    blocked: outcome?.actions_blocked ?? 0,
    blocked_by: outcome?.blocked_by ?? {},
    attributable_paise: outcome?.attributable_paise ?? 0,
    spent_paise: outcome?.spent_paise ?? 0,
    recovered_paise: outcome?.recovered_paise ?? 0,
  };
}

export interface SummaryChange {
  name: string;
  before: number;
  after: number;
  kind: 'count' | 'money';
  /** True when more of this is better. Refusals read backwards. */
  higherIsBetter: boolean;
}

/**
 * What moved between two runs, and nothing that did not.
 *
 * The point of a watch loop on a policy file: tighten a limit, and see what it
 * bought and what it cost, side by side, rather than reading two reports and
 * holding the difference in your head.
 */
export function changes(before: RunSummary, after: RunSummary): SummaryChange[] {
  const all: SummaryChange[] = [
    { name: 'capacity', before: before.capacity, after: after.capacity, kind: 'count', higherIsBetter: true },
    { name: 'floor', before: before.floor, after: after.floor, kind: 'count', higherIsBetter: false },
    { name: 'acted on', before: before.flagged, after: after.flagged, kind: 'count', higherIsBetter: true },
    { name: 'held', before: before.held, after: after.held, kind: 'count', higherIsBetter: true },
    { name: 'actions taken', before: before.actions, after: after.actions, kind: 'count', higherIsBetter: true },
    { name: 'actions refused', before: before.blocked, after: after.blocked, kind: 'count', higherIsBetter: false },
    {
      name: 'attributable',
      before: before.attributable_paise,
      after: after.attributable_paise,
      kind: 'money',
      higherIsBetter: true,
    },
    { name: 'spent', before: before.spent_paise, after: after.spent_paise, kind: 'money', higherIsBetter: false },
  ];

  const moved = all.filter((change) => change.before !== change.after);

  // Per-rule refusals, so "you tightened the contact limit" reads as
  // `contact_frequency 17 → 26` rather than as a change in a total.
  for (const rule of new Set([...Object.keys(before.blocked_by), ...Object.keys(after.blocked_by)])) {
    const from = before.blocked_by[rule] ?? 0;
    const to = after.blocked_by[rule] ?? 0;
    if (from !== to) {
      moved.push({ name: `  ${rule}`, before: from, after: to, kind: 'count', higherIsBetter: false });
    }
  }

  return moved;
}
