/**
 * The two Ink views that carry a number or an argument, at every demo width.
 *
 * `render-width.test.ts` covers the revenue renderers, which build their own
 * strings. These two are React components laid out by Ink's flexbox, and they
 * fail in a way string-assembled output cannot: Ink *shrinks flex children* to
 * make a row fit, so an overflowing row loses characters off the end of a cell
 * rather than wrapping. Nothing throws and nothing looks obviously broken.
 *
 * Both bugs here were found by driving real ptys, not by the 769 tests:
 *
 *   The summary footer clipped the money. At 64 columns `₹89,30,000` rendered
 *   as `₹89,30,00` — the headline figure of the whole product, silently wrong
 *   by a factor of ten and still looking like a rupee amount. A truncated
 *   sentence is obvious; a truncated number is not.
 *
 *   The Cerebus panel was a hard 62 columns whatever the terminal was, and
 *   elided its rows to fit. It cut `re-ran SIR-SEC-001, no match — nothing
 *   would select it again` at "noth…", on a 120-column terminal with fifty
 *   columns to spare. That clause is the security argument the panel exists to
 *   make, and the conclusion of a sentence is always at the end.
 */

import { EventEmitter } from 'node:events';
import { render } from 'ink';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { CerebusPanel } from '../src/ui/FixView.js';
import { Summary } from '../src/ui/Summary.js';
import { glyphsFor } from '../src/ui/theme.js';
import { formatInr } from '../src/money.js';
import { stripAnsi } from '../src/ui/kit.js';
import type { Capabilities } from '../src/ui/theme.js';

const WIDTHS = [56, 60, 64, 68, 80, 100, 120];

const capabilitiesAt = (width: number): Capabilities =>
  ({ width, color: false, unicode: true, tty: true }) as Capabilities;

/**
 * Renders at a chosen terminal width.
 *
 * `ink-testing-library` cannot be used here: its fake stdout hard-codes
 * `columns = 100`, so every width in this file would have laid out at 100 and
 * the whole suite would have passed against the unfixed code. That was not
 * hypothetical — the first version of this file did exactly that, and only
 * caught it by deliberately reverting the fix and watching it stay green.
 *
 * Ink measures the terminal by reading `stdout.columns`, so the width under
 * test has to come from there and nowhere else.
 */
class FakeStdout extends EventEmitter {
  frames: string[] = [];
  constructor(readonly columns: number) {
    super();
  }
  write = (frame: string): void => {
    this.frames.push(frame);
  };
  get lastFrame(): string {
    return this.frames.at(-1) ?? '';
  }
}

const draw = (node: React.ReactElement, width: number): string => {
  const stdout = new FakeStdout(width);
  const instance = render(node, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  // The frame is read before unmounting: unmount writes a final empty frame,
  // and reading after it returns a blank string that would pass nothing.
  const frame = stdout.frames.filter((each) => each.trim().length > 0).at(-1) ?? '';
  instance.unmount();
  return stripAnsi(frame);
};

describe('the summary footer never shortens money', () => {
  // The demo's two figures: the finding's own, and the total across all six.
  it.each([
    ['the headline total', 8_930_000],
    ['a single finding', 4_200_000],
    ['a crore, where the grouping is widest', 12_34_56_789],
  ])('prints %s in full at every width', (_name, amount) => {
    const expected = formatInr(amount);

    for (const width of WIDTHS) {
      const output = draw(
        <Summary
          findings={[]}
          counts={{ critical: 2, high: 2, medium: 2 }}
          complianceScore={60}
          moneyAtRisk={amount}
          gate={{ blocked: true, exitCode: 1, predicate: 'severity≥high, fail-on=all', reasons: [] } as never}
          glyphs={glyphsFor(capabilitiesAt(width))}
          capabilities={capabilitiesAt(width)}
        />,
        width,
      );

      // The whole figure, digits and grouping intact. `₹89,30,00` would pass a
      // "contains ₹" check and a "mentions 89" check; only the full string
      // catches it.
      expect(output, `${expected} at ${width} columns`).toContain(expected);
    }
  });

  it('keeps the compliance score, moving it to its own row when it must', () => {
    for (const width of WIDTHS) {
      const output = draw(
        <Summary
          findings={[]}
          counts={{ critical: 2 }}
          complianceScore={60}
          moneyAtRisk={8_930_000}
          gate={{ blocked: true, exitCode: 1, predicate: 'severity≥high', reasons: [] } as never}
          glyphs={glyphsFor(capabilitiesAt(width))}
          capabilities={capabilitiesAt(width)}
        />,
        width,
      );

      // Narrow terminals stack it rather than squeezing its neighbour, so the
      // label differs — the number must survive either way.
      expect(output, `score at ${width} columns`).toContain('60/100');
    }
  });
});

describe('the Cerebus panel keeps the clause that makes its argument', () => {
  const suggestion = {
    action: 'env_lookup',
    target: 'STRIPE_KEY',
    verifier_status: 'pass',
    stages: [
      { name: 'template selector', detail: 'env_lookup → target STRIPE_KEY', real: true },
      { name: 'diff builder', detail: 'template: env_lookup', real: true },
      { name: 'verifier', detail: 're-ran SIR-SEC-001, no match — nothing would select it again', real: true },
      { name: 'applicability', detail: 'machine-applicable — applied without asking', real: true },
    ],
  } as never;

  it.each(WIDTHS)('says what the verifier concluded at %i columns', (width) => {
    const output = draw(
      <CerebusPanel
        ruleId="SIR-SEC-001"
        suggestion={suggestion}
        glyphs={glyphsFor(capabilitiesAt(width))}
        capabilities={capabilitiesAt(width)}
      />,
      width,
    );

    // Wrapping puts a line break — and the box's own border — inside the
    // sentence, so the borders come out before the whitespace is collapsed.
    // Without that, `applied without │ asking` fails a check that the words
    // survived, when in fact they did.
    const flat = output.replace(/[│|]/g, ' ').replace(/\s+/g, ' ');
    expect(flat, `verifier verdict at ${width}`).toContain('would select it again');
    expect(flat, `applicability at ${width}`).toContain('applied without asking');
    expect(flat, `PASS at ${width}`).toMatch(/PASS/);
  });

  it('never draws a line wider than the terminal', () => {
    for (const width of WIDTHS) {
      const output = draw(
        <CerebusPanel
          ruleId="SIR-SEC-001"
          suggestion={suggestion}
          glyphs={glyphsFor(capabilitiesAt(width))}
          capabilities={capabilitiesAt(width)}
        />,
        width,
      );

      for (const line of output.split('\n')) {
        // A box drawn wider than the terminal wraps into the row below and
        // stops being a box, which is the failure this panel started with.
        expect(line.length, `"${line}" at ${width} columns`).toBeLessThanOrEqual(width);
      }
    }
  });
});
