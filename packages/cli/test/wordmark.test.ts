/**
 * The launcher wordmark.
 *
 * Worth pinning down because it is the first thing anyone sees, and because its
 * fallbacks fire in exactly the situations nobody tests by hand: a terminal
 * without unicode, one too narrow for a 37-column logo, and one that cannot do
 * 24-bit colour.
 */

import { describe, expect, it } from 'vitest';

import { gradientAt, renderWordmark, toAnsi256, wordmarkWidth } from '../src/ui/wordmark.js';
import { AUTHOR, TAGLINE } from '../src/branding.js';

const ESC = '\u001b';
const content = {
  version: '0.4.0',
  tagline: TAGLINE,
  context: 'project demo · authenticated',
  author: AUTHOR,
};

const strip = (s: string) => s.split(ESC).map((part, i) => (i === 0 ? part : part.replace(/^\[[0-9;]*m/, ''))).join('');

describe('wordmarkWidth', () => {
  it('measures the block letters including kerning', () => {
    // S(7) I(2) R(7) I(2) U(7) S(7) + 5 single-space gaps
    expect(wordmarkWidth()).toBe(37);
  });
});

describe('gradientAt', () => {
  it('starts on the token green', () => {
    expect(gradientAt(0)).toEqual({ r: 0x04, g: 0xb5, b: 0x75 });
  });

  it('passes through the token blue at the midpoint', () => {
    expect(gradientAt(0.5)).toEqual({ r: 0x5a, g: 0xc8, b: 0xfa });
  });

  it('ends on the token violet', () => {
    expect(gradientAt(1)).toEqual({ r: 0x7c, g: 0x3a, b: 0xed });
  });

  it('interpolates between stops rather than stepping', () => {
    const quarter = gradientAt(0.25);
    expect(quarter).not.toEqual(gradientAt(0));
    expect(quarter).not.toEqual(gradientAt(0.5));
  });

  it('clamps out-of-range input instead of extrapolating', () => {
    expect(gradientAt(-1)).toEqual(gradientAt(0));
    expect(gradientAt(2)).toEqual(gradientAt(1));
    expect(gradientAt(Number.NaN)).toEqual(gradientAt(0));
  });

  it('never lands on grey — every stop stays saturated', () => {
    // The earlier near-white start quantised to grey on 256-colour terminals,
    // which is what made five of six letters look dead.
    for (let t = 0; t <= 1; t += 0.05) {
      const { r, g, b } = gradientAt(t);
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      expect(spread).toBeGreaterThan(60);
    }
  });
});

describe('toAnsi256', () => {
  it('maps the gradient stops to distinct cube indices', () => {
    const indices = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const { r, g, b } = gradientAt(t);
      return toAnsi256(r, g, b);
    });
    expect(new Set(indices).size).toBe(indices.length);
  });

  it('stays inside the 6x6x6 cube', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const { r, g, b } = gradientAt(t);
      const index = toAnsi256(r, g, b);
      expect(index).toBeGreaterThanOrEqual(16);
      expect(index).toBeLessThanOrEqual(231);
    }
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
  });

  it('falls back to ASCII when the terminal cannot draw blocks', () => {
    const out = strip(renderWordmark(content, { unicode: false, color: false, width: 100 }));
    expect(out).not.toContain('█');
    expect(out).not.toContain('✦');
    expect(out).toContain('* SIRIUS');
  });

  it('emits no escape sequences when color is off', () => {
    expect(renderWordmark(content, { unicode: true, color: false, width: 100 })).not.toContain(ESC);
  });

  it('emits a many-stepped gradient in whichever colour depth is available', () => {
    const out = renderWordmark(content, { unicode: true, color: true, width: 100 });
    // 38;2 is truecolor, 38;5 the 256-colour cube. Either is fine; a flat fill
    // is not.
    const colors = new Set(out.match(/\[38;[25];[0-9;]+m/g) ?? []);
    expect(colors.size).toBeGreaterThan(5);
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
