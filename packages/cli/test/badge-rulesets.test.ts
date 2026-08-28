/**
 * The badge, and the ruleset knob that was wired to nothing.
 *
 * Two more things that existed only against a backend. `badge` printed a URL to
 * a hosted SVG and refused to do anything without a project id, so the one
 * artefact a README wants required signing up. And `rulesets:` was scaffolded
 * into every `sirius.yaml` while the engine ran all twelve rules regardless —
 * a knob that erred toward noise, which is why nothing ever caught it.
 */

import { describe, expect, it } from 'vitest';

import { colorForScore, renderBadge, shieldsEndpoint } from '../src/engine/badge.js';
import { categoriesInCatalogue, rulesFor } from '../src/engine/catalog.js';
import { RULES } from '../src/engine/rules.js';

describe('the badge SVG', () => {
  const badge = renderBadge({ label: 'sirius', message: '72/100', color: '#97ca00' });

  it('is a self-contained SVG with no external references', () => {
    expect(badge).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    // Anything fetched at render time is a badge that breaks in an offline
    // README viewer, or leaks a page view to whoever hosts it.
    expect(badge).not.toMatch(/<image|href="http/);
  });

  it('carries the text in both halves, and in the accessible label', () => {
    expect(badge).toContain('>sirius<');
    expect(badge).toContain('>72/100<');
    expect(badge).toContain('aria-label="sirius: 72/100"');
  });

  it('sizes the two halves to their text', () => {
    const narrow = renderBadge({ label: 'sirius', message: '9/100', color: '#97ca00' });
    const wide = renderBadge({ label: 'sirius', message: '100/100', color: '#97ca00' });
    const widthOf = (svg: string) => Number(/<svg[^>]*width="(\d+)"/.exec(svg)?.[1]);

    expect(widthOf(wide)).toBeGreaterThan(widthOf(narrow));
  });

  it('escapes text rather than letting it close a tag', () => {
    const badge = renderBadge({ label: 'sirius', message: '<script>', color: '#e05d44' });
    expect(badge).not.toContain('<script>');
    expect(badge).toContain('&lt;script&gt;');
  });

  it('colors by score, worst to best', () => {
    const scores = [10, 50, 65, 80, 95].map(colorForScore);
    expect(new Set(scores).size).toBe(5);
    expect(colorForScore(95)).not.toBe(colorForScore(10));
  });

  it('says the same thing in the shields payload as in the SVG', () => {
    const input = { label: 'sirius', message: '72/100', color: '#97ca00' };
    expect(JSON.parse(shieldsEndpoint(input))).toEqual({ schemaVersion: 1, ...input });
  });
});

describe('rulesFor', () => {
  it('runs the whole catalogue for the core ruleset', () => {
    expect(rulesFor(['p/fintech-core'])).toHaveLength(RULES.length);
  });

  it('runs the whole catalogue when nothing is named', () => {
    expect(rulesFor([])).toHaveLength(RULES.length);
  });

  it('selects one category', () => {
    const rules = rulesFor(['p/secrets']);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.length).toBeLessThan(RULES.length);
    expect(rules.every((rule) => rule.category === 'secrets')).toBe(true);
  });

  it('unions several, without duplicates', () => {
    const both = rulesFor(['p/secrets', 'p/injection']);
    expect(new Set(both.map((r) => r.id)).size).toBe(both.length);
    expect(both.length).toBe(rulesFor(['p/secrets']).length + rulesFor(['p/injection']).length);
  });

  it('keeps catalogue order, so two equivalent rulesets scan alike', () => {
    expect(rulesFor(['p/injection', 'p/secrets']).map((r) => r.id)).toEqual(
      rulesFor(['p/secrets', 'p/injection']).map((r) => r.id),
    );
  });

  it('refuses an unknown ruleset instead of quietly running everything', () => {
    // The dangerous failure is the silent one: a team believes it narrowed a
    // scan, and got the full catalogue with a typo'd name.
    expect(() => rulesFor(['p/nonsense'])).toThrow(/Unknown ruleset/);
    expect(() => rulesFor(['p/nonsense'])).toThrow(/p\/fintech-core/);
  });

  it('names only categories that actually have rules', () => {
    for (const category of categoriesInCatalogue()) {
      expect(rulesFor([`p/${category}`]).length).toBeGreaterThan(0);
    }
  });
});
