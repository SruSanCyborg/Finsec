/**
 * Measuring across batches, and against a previous run.
 *
 * This exists because its absence was felt three times. Every model change
 * during development needed the same answer — is it better, and on how many
 * batches — and every time that meant a throwaway script. A tool whose author
 * keeps improvising the same measurement is a tool missing a command.
 *
 * The tests that matter here are about honesty rather than arithmetic: that a
 * sweep reports the spread and not only the mean, and that comparing two runs
 * which were not the same experiment says so instead of quietly subtracting
 * them.
 */

import { describe, expect, it } from 'vitest';

import { compare, comparable, evaluateSeed, sweep } from '../src/revenue/sweep.js';
import type { SweepOptions } from '../src/revenue/sweep.js';

const small: SweepOptions = { seed: 'sweep-test', count: 4, payments: 200, checkouts: 60, invoices: 40 };

describe('a sweep', () => {
  const summary = sweep(small);

  it('runs one batch per seed and names them', () => {
    expect(summary.rows).toHaveLength(4);
    expect(summary.seeds).toEqual(['sweep-test-1', 'sweep-test-2', 'sweep-test-3', 'sweep-test-4']);
  });

  it('is reproducible', () => {
    // The whole point of a seeded sweep: the same command gives the same table
    // on any machine, so a reported figure is checkable rather than anecdotal.
    expect(sweep(small).rows).toEqual(summary.rows);
  });

  it('keeps the per-seed rows, not just the mean', () => {
    // A mean edge built from four agreeing batches is a different claim from
    // the same mean built from two wins and two losses, and only the rows say
    // which one you have.
    for (const row of summary.rows) {
      expect(row.precision).toBeGreaterThanOrEqual(0);
      expect(row.ceiling_paise).toBeGreaterThan(0);
    }
    expect(summary.wins).toBeLessThanOrEqual(summary.rows.length);
  });

  it('averages what it says it averages', () => {
    const mean = summary.rows.reduce((sum, row) => sum + row.precision, 0) / summary.rows.length;
    expect(Math.abs(summary.mean.precision - mean)).toBeLessThan(0.0002);
  });

  it('never touches a forbidden record on any batch', () => {
    expect(summary.forbidden_touched).toBe(0);
  });

  it('records what the heuristics touched over the same batches', () => {
    // The comparison the money column cannot make.
    expect(summary.heuristic_forbidden_touched).toBeGreaterThan(0);
  });

  it('cannot exceed the ceiling on any batch', () => {
    for (const row of summary.rows) {
      expect(row.net_paise).toBeLessThanOrEqual(row.ceiling_paise);
    }
  });

  it('honours a tighter capacity share', () => {
    const tight = sweep({ ...small, capacityShare: 0.05 });
    // Acting on fewer records cannot recall more of the money.
    expect(tight.mean.money_recall).toBeLessThan(summary.mean.money_recall);
  });
});

describe('one seed on its own', () => {
  it('is the same run the sweep did', () => {
    const summary = sweep(small);
    const single = evaluateSeed('sweep-test-1', small);
    expect(single.cost.net_paise).toBe(summary.rows[0]?.net_paise);
  });
});

describe('comparing two runs', () => {
  const before = sweep(small);

  it('reports no movement when nothing moved', () => {
    const deltas = compare(before, sweep(small));
    for (const delta of deltas) expect(delta.change).toBe(0);
  });

  it('marks the measures where lower is better', () => {
    const deltas = compare(before, sweep(small));
    const calibration = deltas.find((delta) => delta.name === 'calibration error');
    const forbidden = deltas.find((delta) => delta.name === 'forbidden touched');

    // A table where every arrow means the same thing is a table that will
    // eventually be read wrong.
    expect(calibration?.higherIsBetter).toBe(false);
    expect(forbidden?.higherIsBetter).toBe(false);
    expect(deltas.find((delta) => delta.name === 'recall')?.higherIsBetter).toBe(true);
  });

  it('shows a real change when the run really changed', () => {
    const deltas = compare(before, sweep({ ...small, capacityShare: 0.05 }));
    const recall = deltas.find((delta) => delta.name === 'recall (₹)');
    expect(recall?.change).toBeLessThan(0);
  });

  it('refuses to call two different experiments a comparison', () => {
    // Subtracting a run over other seeds produces a number that reads exactly
    // like a result, which is the dangerous kind of wrong.
    expect(comparable(before, sweep({ ...small, seed: 'other' }))).toMatch(/different seeds/);
    expect(comparable(before, sweep({ ...small, payments: 400 }))).toMatch(/different batch sizes/);
  });

  it('says nothing when the two runs are the same experiment', () => {
    expect(comparable(before, sweep(small))).toBeUndefined();
  });
});
