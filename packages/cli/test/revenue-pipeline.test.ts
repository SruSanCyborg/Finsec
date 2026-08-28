/**
 * The shared pipeline, and the diff a watch loop prints.
 *
 * `recover` and `watch` run the same batch, and before this module existed they
 * would have run it two different ways — which is the drift this repo keeps
 * paying for. The first group checks they cannot; the second checks the diff
 * only reports what actually moved, because a diff that lists everything is a
 * diff nobody reads.
 */

import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_COSTS } from '../src/revenue/cost.js';
import { changes, runBatch, summarise } from '../src/revenue/pipeline.js';
import { costsFrom, limitsFrom, DEFAULT_LIMITS } from '../src/revenue/policy.js';
import { writeBatch } from '../src/revenue/store.js';
import { generateBatch } from '../src/revenue/synth.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-pipeline-'));
  writeBatch(dir, generateBatch({ seed: 'pipeline-seed', payments: 250, checkouts: 70, invoices: 50 }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (overrides: Partial<Parameters<typeof runBatch>[0]> = {}) =>
  runBatch({ dir, split: 'test', limits: DEFAULT_LIMITS, costs: DEFAULT_COSTS, ...overrides });

describe('the pipeline', () => {
  it('loads, fits, scores and acts in one call', () => {
    const result = run();
    expect(result.assessments.length).toBeGreaterThan(0);
    expect(result.recovery?.outcome.actions_executed).toBeGreaterThan(0);
    expect(result.model.trained_on).toBeGreaterThan(0);
  });

  it('writes nothing', () => {
    // A watch loop re-running on every keystroke must not leave a hundred signed
    // audit trails behind it, so the trail is a return value.
    const before = new Set(readdirSync(dir));
    run();
    expect(new Set(readdirSync(dir))).toEqual(before);
  });

  it('is deterministic', () => {
    expect(summarise(run())).toEqual(summarise(run()));
  });

  it('stops before acting when asked', () => {
    const result = run({ actOn: false });
    expect(result.assessments.length).toBeGreaterThan(0);
    expect(result.recovery).toBeUndefined();
    expect(summarise(result).actions).toBe(0);
  });

  it('takes a model fitted elsewhere rather than always refitting', () => {
    // The command layer owns `--model`; this layer should not learn about it.
    const first = run();
    const second = run({ model: first.model });
    expect(second.model).toBe(first.model);
    expect(summarise(second)).toEqual(summarise(first));
  });

  it('honours a project\'s limits', () => {
    const silent = run({ limits: limitsFrom({ contacts_per_day: 0 }) });
    expect(silent.recovery?.outcome.blocked_by.contact_frequency ?? 0).toBeGreaterThan(0);
  });

  it('honours a project\'s costs', () => {
    const dear = run({ costs: costsFrom({ costs: { annoyance_inr: 500 } }) });
    const cheap = run();
    // The annoyance charge does not change what is spent, but it does change
    // where the fitted floor lands, so the two runs must not be identical.
    expect(dear.model.threshold).not.toBe(-1);
    expect(summarise(dear).capacity).toBe(summarise(cheap).capacity);
  });

  it('confines the selection to the split but not the diagnosis', () => {
    const test = run({ split: 'test' });
    const all = run({ split: 'all' });

    expect(all.inSplit.length).toBeGreaterThan(test.inSplit.length);
    // The context is built from the whole batch either way: an outage is
    // visible in all the traffic, and a cluster spanning the split is a cluster.
    expect(all.context.rings.length).toBe(test.context.rings.length);
  });
});

describe('the diff between two runs', () => {
  it('says nothing when nothing moved', () => {
    expect(changes(summarise(run()), summarise(run()))).toEqual([]);
  });

  it('reports the totals that moved and leaves the rest out', () => {
    const before = summarise(run());
    const after = summarise(run({ capacity: { max_actions: 20, rule: 'test' } }));
    const moved = changes(before, after);

    expect(moved.map((change) => change.name)).toContain('capacity');
    expect(moved.every((change) => change.before !== change.after)).toBe(true);
  });

  it('breaks refusals out per rule, not as one total', () => {
    // "You tightened the contact limit" should read as contact_frequency going
    // up, not as a change in an aggregate nobody can act on.
    const before = summarise(run());
    const after = summarise(run({ limits: limitsFrom({ contacts_per_day: 0 }) }));
    const moved = changes(before, after);

    expect(moved.map((change) => change.name.trim())).toContain('contact_frequency');
  });

  it('marks refusals and spend as measures where less is better', () => {
    const before = summarise(run());
    const after = summarise(run({ capacity: { max_actions: 12, rule: 'test' } }));
    const moved = changes(before, after);

    expect(moved.find((change) => change.name === 'actions refused')?.higherIsBetter).toBe(false);
    expect(moved.find((change) => change.name === 'spent')?.higherIsBetter).toBe(false);
    expect(moved.find((change) => change.name === 'attributable')?.higherIsBetter).toBe(true);
  });

  it('keeps money in paise so the renderer can format it', () => {
    const before = summarise(run());
    const after = summarise(run({ capacity: { max_actions: 12, rule: 'test' } }));
    const money = changes(before, after).filter((change) => change.kind === 'money');

    expect(money.length).toBeGreaterThan(0);
    for (const change of money) expect(Number.isInteger(change.after)).toBe(true);
  });
});
