/**
 * The launcher wordmark.
 *
 * Worth pinning down because it is the first thing anyone sees, and because its
 * fallbacks fire in exactly the situations nobody tests by hand: a terminal
 * without unicode, and one too narrow for a 37-column logo.
 */

import { describe, expect, it } from 'vitest';

import { renderWordmark, wordmarkWidth } from '../src/ui/wordmark.js';
import { AUTHOR, TAGLINE } from '../src/branding.js';

const content = {
  version: '0.4.0',
  tagline: TAGLINE,
  context: 'project demo · authenticated',
  author: AUTHOR,
};

const strip = (s: string) => s.replace(/\[[0-9;]*m/g, '');

describe('wordmarkWidth', () => {
  it('measures the block letters including kerning', () => {
    // S(7) I(2) R(7) I(2) U(7) S(7) + 5 single-space gaps
    expect(wordmarkWidth()).toBe(37);
  });
});

describe('renderWordmark', () => {
  it('draws block letters on a wide unicode terminal', () => {
    const out = strip(renderWordmark(content, { unicode: true, color: false, width: 100 }));
    expect(out).toContain('███████');
    expect(out.split('\n').filter((l) => l.includes('█'))).toHaveLength(5);
  });

  it('aligns the rule to the wordmark exactly', () => {
    const out = strip(renderWordmark(content, { unicode: true, color: false, width: 100 }));
    const rule = out.split('\n').find((l) => l.includes('─'));
    expect(rule?.match(/─+/)?.[0]).toHaveLength(wordmarkWidth());
  });

  it('always credits the author and the tagline', () => {
    const out = strip(renderWordmark(content, { unicode: true, color: false, width: 100 }));
    expect(out).toContain(`powered by ${AUTHOR}`);
    expect(out).toContain(TAGLINE);
  });

  it('falls back to a one-line title on a narrow terminal', () => {
    const out = strip(renderWordmark(content, { unicode: true, color: false, width: 40 }));
    expect(out).not.toContain('█');
    expect(out).toContain('SIRIUS');
    expect(out).toContain('v0.4.0');
  });

  it('falls back to ASCII when the terminal cannot draw blocks', () => {
    const out = strip(renderWordmark(content, { unicode: false, color: false, width: 100 }));
    expect(out).not.toContain('█');
    expect(out).not.toContain('✦');
    expect(out).toContain('* SIRIUS');
  });

  it('emits no escape sequences when color is off', () => {
    const out = renderWordmark(content, { unicode: true, color: false, width: 100 });
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\[/);
  });

  it('emits a truecolor gradient when color is on', () => {
    const out = renderWordmark(content, { unicode: true, color: true, width: 100 });
    const colors = new Set(out.match(/\[38;2;[0-9;]+m/g) ?? []);
    // A gradient means many distinct colors, not one flat fill.
    expect(colors.size).toBeGreaterThan(10);
  });

  it('never exceeds the terminal width', () => {
    for (const width of [40, 60, 80, 120]) {
      const out = strip(renderWordmark(content, { unicode: true, color: false, width }));
      for (const line of out.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(width);
      }
    }
  });
});
