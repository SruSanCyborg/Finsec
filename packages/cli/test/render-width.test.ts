/**
 * Output that fits the terminal it is printed on.
 *
 * The revenue renderers assembled every table from `padEnd`/`padStart` at the
 * call site, and none of them knew how wide the terminal was. `revenue eval`
 * reached 217 columns — a paragraph of explanation on one unwrapped line — and
 * the comparison table reached 176, with the numbers a reader came for pushed
 * off the right edge by the sentence explaining them.
 *
 * On a wide developer terminal that is invisible. On the projector it wraps,
 * and a wrapped table is not a table. This is the check that keeps it fixed,
 * because nothing else about the output would fail when it breaks: the text is
 * all still there, just in the wrong place.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_COSTS } from '../src/revenue/cost.js';
import { evaluate, capacityCurve } from '../src/revenue/evaluate.js';
import { analyzeBatch } from '../src/revenue/features.js';
import { assessBatch, defaultCapacity, fitModel } from '../src/revenue/model.js';
import { generateBatch, splitOf } from '../src/revenue/synth.js';
import { stress } from '../src/revenue/stress.js';
import { paletteFor, renderAssessment, renderEvaluation, renderStress } from '../src/render/revenue.js';
import { stripAnsi, visibleWidth } from '../src/ui/kit.js';

/** Every width a demo might actually run at, plus one cruelly narrow one. */
const WIDTHS = [60, 80, 100, 120];

const batch = generateBatch({ seed: 'width-test', payments: 200, checkouts: 50, invoices: 30 });
const model = fitModel(batch.records, batch.truth, DEFAULT_COSTS);
const context = analyzeBatch(batch.records);
const heldOut = batch.records.filter((record) => splitOf(record.id) === 'test');
const capacity = defaultCapacity(heldOut.length);
const { assessments } = assessBatch(heldOut, model, { context, capacity });

const evaluation = evaluate({
  records: batch.records,
  assessments,
  truth: batch.truth,
  threshold: model.threshold,
  capacity,
});

const curve = capacityCurve({
  records: heldOut,
  model,
  context,
  truth: batch.truth,
  threshold: model.threshold,
});

const report = stress({ seeds: 1, payments: 140, checkouts: 40, invoices: 25 });

/** The offending lines, so a failure names them instead of just counting. */
function tooWide(rendered: string, width: number): string[] {
  return rendered
    .split('\n')
    .filter((line) => visibleWidth(line) > width)
    .map((line) => `${visibleWidth(line)}: ${stripAnsi(line).slice(0, 60)}`);
}

describe('the streaming detect rows fit too', () => {
  // A held record's reason is a full sentence — "the issuer refused this on
  // risk grounds, a retry is a second attempt at a refusal" — and it ran the
  // row to 118 columns. These are the lines that scroll past during the demo,
  // so a wrap here turns a stream into a mess.
  const byId = new Map(batch.records.map((record) => [record.id, record]));

  for (const width of [60, 80, 120]) {
    it(`renders every assessment inside ${width} columns`, () => {
      const palette = paletteFor({ color: false, unicode: true, width });
      const wide = assessments
        .map((assessment) => renderAssessment(assessment, byId.get(assessment.record_id)!, palette))
        .filter((line) => visibleWidth(line) > width);
      expect(wide).toEqual([]);
    });
  }
});

describe('every revenue view fits the terminal', () => {
  for (const width of WIDTHS) {
    it(`renders the evaluation inside ${width} columns`, () => {
      const palette = paletteFor({ color: false, unicode: true, width });
      expect(tooWide(renderEvaluation(evaluation, model, palette, curve), width)).toEqual([]);
    });

    it(`renders the stress report inside ${width} columns`, () => {
      const palette = paletteFor({ color: false, unicode: true, width });
      expect(tooWide(renderStress(report, palette), width)).toEqual([]);
    });
  }

  it('fits in colour too, where the escape bytes do not count', () => {
    // The failure mode this exists for: padding a coloured cell pads the escape
    // sequence, so the column drifts on screen while a piped transcript — which
    // is what every other test reads — looks perfectly aligned.
    const palette = paletteFor({ color: true, unicode: true, width: 80 });
    expect(tooWide(renderEvaluation(evaluation, model, palette, curve), 80)).toEqual([]);
    expect(tooWide(renderStress(report, palette), 80)).toEqual([]);
  });

  it('still says the things that matter at the narrowest width', () => {
    // Fitting is not the goal on its own — a table that fits by deleting its
    // own findings has not been fixed.
    const palette = paletteFor({ color: false, unicode: true, width: 60 });
    const rendered = stripAnsi(renderEvaluation(evaluation, model, palette, curve));
    expect(rendered).toContain('INFEASIBLE');
    expect(rendered).toContain('this detector');
    expect(rendered).toContain('perfect foresight');
  });
});
