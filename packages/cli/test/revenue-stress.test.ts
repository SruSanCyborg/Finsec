/**
 * The stress report, and the properties that make it worth printing.
 *
 * The point of this surface is to answer the objection that the model was
 * fitted to the same generator that produced its test set. That answer is only
 * worth anything if the shift is real, the comparison is fair, and the losses
 * are reported as loudly as the wins — so those are what is asserted here,
 * rather than any particular figure, which should be free to move.
 */

import { describe, expect, it } from 'vitest';

import { SCENARIOS, stress } from '../src/revenue/stress.js';
import { generateBatch } from '../src/revenue/synth.js';

const small = { seeds: 2, payments: 160, checkouts: 45, invoices: 30 };

describe('the shift is applied to the world, not the sample', () => {
  it('changes the traffic mix when asked to', () => {
    const base = generateBatch({ seed: 'shift', payments: 200, checkouts: 40, invoices: 25 });
    const shifted = generateBatch({
      seed: 'shift',
      payments: 200,
      checkouts: 40,
      invoices: 25,
      shift: { name: 'x', what: 'x', rails: { nach_mandate: 6, upi_collect: 0.3 } },
    });

    const mandates = (batch: typeof base) =>
      batch.records.filter((record) => record.rail === 'nach_mandate').length;

    expect(mandates(shifted)).toBeGreaterThan(mandates(base) * 2);
  });

  it('can remove the gateway outage the detector leans on', () => {
    const withOutage = generateBatch({ seed: 'shift', payments: 200, checkouts: 40, invoices: 25 });
    const without = generateBatch({
      seed: 'shift',
      payments: 200,
      checkouts: 40,
      invoices: 25,
      shift: { name: 'x', what: 'x', degradation: 'none' },
    });

    const degraded = (batch: typeof withOutage) =>
      batch.records.filter((record) => record.failure_code === 'psp_degraded').length;

    expect(degraded(without)).toBeLessThan(degraded(withOutage));
    expect(without.incidents.filter((i) => i.kind === 'psp_degradation')[0]?.record_ids ?? []).toHaveLength(0);
  });

  it('leaves the world unchanged when the shift says nothing', () => {
    const plain = generateBatch({ seed: 'shift', payments: 120, checkouts: 30, invoices: 20 });
    const noop = generateBatch({
      seed: 'shift',
      payments: 120,
      checkouts: 30,
      invoices: 20,
      shift: { name: 'x', what: 'x' },
    });
    expect(noop.records.map((r) => r.id)).toEqual(plain.records.map((r) => r.id));
    expect(noop.records.map((r) => r.amount_paise)).toEqual(plain.records.map((r) => r.amount_paise));
  });
});

describe('the report', () => {
  const report = stress(small);

  it('runs every scenario that was written down', () => {
    expect(report.rows.map((row) => row.name)).toEqual(SCENARIOS.map((s) => s.name));
  });

  it('never reports a ratio built on a denominator of nothing', () => {
    // A mean of per-seed ratios turned one scenario into "+122,293,752%",
    // because a single seed's heuristic netted close to zero and the division
    // was floored at one paise. Totals are summed first and divided once, and
    // when the total is still too small to divide by, the answer is null rather
    // than a landslide.
    for (const row of report.rows) {
      for (const edge of [row.edge_before, row.edge_after, row.edge_retrained]) {
        if (edge === null) continue;
        expect(Number.isFinite(edge)).toBe(true);
        expect(Math.abs(edge)).toBeLessThan(10);
      }
    }
  });

  it('shows the rupees behind the ratio', () => {
    // So a reader can check the division rather than take it.
    for (const row of report.rows) {
      expect(row.net_after_paise).toBeGreaterThanOrEqual(0);
      expect(row.heuristic_after_paise).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts the worlds it lost as well as the ones it won', () => {
    expect(report.held + report.broke).toBe(report.rows.length);
    // The worst scenario is named, not buried. A robustness report that only
    // lists survivals is a marketing document.
    expect(report.rows.map((row) => row.name)).toContain(report.worst);
  });

  it('keeps the compliance property in every world', () => {
    // This is the claim that has to survive the shift. The money edge is a
    // preference; not touching a disputed record is a rule, and a rule that
    // only holds on the distribution you trained on is not a rule.
    for (const row of report.rows) {
      expect(row.forbidden_touched, `${row.name} touched records it must not`).toBe(0);
    }
  });

  it('is deterministic', () => {
    // Six scenarios × two seeds × three fits is thirty-six model fits, so this
    // one gets a longer clock than vitest's default five seconds — it failed on
    // the timeout first, which reads exactly like the non-determinism it is
    // testing for.
    const again = stress(small);
    expect(again.rows.map((row) => row.edge_after)).toEqual(report.rows.map((row) => row.edge_after));
    expect(again.rows.map((row) => row.net_after_paise)).toEqual(
      report.rows.map((row) => row.net_after_paise),
    );
  }, 30_000);
});
