/**
 * The brief, and the rule that keeps it honest.
 *
 * It exists because the tool is legible to whoever built it and opaque to
 * everyone else, and everyone else is most of the people who will ever look at
 * it. That makes the document a deliverable rather than a nicety — and a
 * deliverable whose numbers drift from the tool is worse than none, because the
 * first person to run the commands finds a figure that does not reproduce and
 * then doubts the ones that would have.
 *
 * So every figure is asserted to come from a live run, not from prose.
 */

import { describe, expect, it } from 'vitest';

import { collectGuardFacts } from '../src/engine/brief.js';
import { briefToPdf } from '../src/engine/brief-pdf.js';
import { evaluateFeed, tally } from '../src/guard/loop.js';
import { generateFeed } from '../src/guard/synth.js';
import { toWinAnsi } from '../src/engine/pdf.js';

const facts = collectGuardFacts();

describe('the facts behind the brief', () => {
  it('match a run of the engine, rather than being written down', () => {
    const feed = generateFeed();
    const { decisions } = evaluateFeed(feed.actions, feed.agents);
    const counts = tally(decisions);

    expect(facts.actions).toBe(feed.actions.length);
    expect(facts.counts).toEqual(counts);
    expect(facts.autonomy).toBeCloseTo((counts.allow ?? 0) / feed.actions.length, 10);
  });

  it('carries the worked example it claims to', () => {
    // The document says it shows an injected instruction. If the fixture stops
    // containing one, the prose would be describing something that is not there.
    expect(facts.injection, 'a planted injection should be in the feed').toBeDefined();
    expect(facts.injection?.source).toMatch(/email|web/);
    expect(facts.injection?.signals.some((s) => s.tier === 'block')).toBe(true);
  });

  it('reports the ordinary-traffic figure, which is the one that can embarrass it', () => {
    expect(facts.ordinary).toBeGreaterThan(200);
    expect(facts.ordinaryIntervened).toBeLessThanOrEqual(facts.ordinary);
  });
});

describe('the PDF', () => {
  const pdf = briefToPdf({ guard: facts, generatedAt: '2026-08-28T00:00:00.000Z' });
  const text = pdf.toString('latin1');

  it('is a PDF a reader will open', () => {
    expect(text.startsWith('%PDF-1.')).toBe(true);
    expect(text).toContain('xref');
    expect(text).toContain('trailer');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('uses only base-14 fonts, so nothing has to be embedded', () => {
    expect(text).toContain('/Helvetica');
    expect(text).not.toContain('/FontFile');
  });

  it('states the thesis, not just the features', () => {
    // A reader who stops after page one should still have got the point.
    expect(text).toContain('Technical validity is not behavioural legitimacy');
  });

  it('prints the live autonomy figure', () => {
    expect(text).toContain(`${(facts.autonomy * 100).toFixed(1)}%`);
  });

  it('says what it does not do', () => {
    expect(text).toMatch(/simulated/i);
  });
});

describe('characters the base fonts cannot draw', () => {
  it('folds them before measuring, not after', () => {
    // `₹` is one character and `Rs.` is three. Substituting after measurement
    // let a line run past the right margin by two characters for every rupee
    // sign on it — the wrap has to see the text that will actually be drawn.
    expect(toWinAnsi('₹42,00,000')).toBe('Rs.42,00,000');
    expect(toWinAnsi('a — b')).toBe('a - b');
    expect(toWinAnsi('2.1σ')).toBe('2.1sd');
    expect(toWinAnsi('a…b')).toBe('a...b');
  });

  it('leaves ordinary text alone', () => {
    expect(toWinAnsi('BLOCK  wlt-9f2c41  (48000)')).toBe('BLOCK  wlt-9f2c41  (48000)');
  });
});
