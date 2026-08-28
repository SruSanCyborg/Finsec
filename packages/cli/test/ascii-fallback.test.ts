/**
 * `SIRIUS_ASCII=1` means ASCII.
 *
 * AGENTS.md names this the projector safety net and lists `₹` as the first
 * character it protects: "Both must survive the presentation machine's terminal
 * font (`₹`, braille spinner, box drawing) — there's an ASCII fallback behind
 * `SIRIUS_ASCII=1`."
 *
 * It was not true of the scan beat. `money.ts` hardcoded `₹` and knew nothing
 * about the terminal, so a scan under the flag still emitted nine of them.
 * Prose punctuation — `—`, `…`, `·`, `§`, `≥` — never went near the glyph table
 * either. Only the revenue renderer honoured the flag, via `palette.rupee`, so
 * one variable meant two different things in the two demo beats.
 *
 * The part that made it hard to notice: `doctor`'s glyph self-test rendered
 * `Rs.42,00,000` through a *third* code path, and so cheerfully vouched for a
 * fallback the command it was vouching for did not have. A check that does not
 * exercise the thing it certifies certifies nothing.
 *
 * Two directions are asserted, because either alone is passable by doing
 * nothing: under the flag no non-ASCII byte survives, and without it the rupee
 * sign is still there — a fallback that applied always would quietly cost the
 * India-relevance the figures are for.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatInr, formatInrCompact } from '../src/money.js';
import { toAscii } from '../src/ui/kit.js';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

function run(args: string[], env: Record<string, string> = {}): string {
  try {
    return execFileSync(process.execPath, [cli, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, SIRIUS_SCAN_PACE: '0', SIRIUS_REVENUE_PACE: '0', ...env },
    });
  } catch (error) {
    // A scan that finds things exits 1; its stdout is still the output.
    return (error as { stdout?: string }).stdout ?? '';
  }
}

/** Every byte outside printable 7-bit ASCII, deduplicated. */
const nonAscii = (text: string): string[] => [...new Set(text.match(/[^\x20-\x7e\n\r\t]/g) ?? [])];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-ascii-'));
  writeFileSync(
    join(dir, 'pay.py'),
    ['STRIPE_KEY = "sk_live_51H8xQ2eZvKYlo2Cabcd"', '', 'def charge(db, request):',
      '    q = "SELECT * FROM t WHERE id = %s" % request.args["id"]', '    return db.execute(q)', ''].join('\n'),
    'utf8',
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the formatter', () => {
  it('writes Rs. under the flag and ₹ without it', () => {
    const before = process.env.SIRIUS_ASCII;
    try {
      process.env.SIRIUS_ASCII = '1';
      expect(formatInr(4_200_000)).toBe('Rs.42,00,000');
      expect(formatInrCompact(4_200_000)).toBe('Rs.42L');

      delete process.env.SIRIUS_ASCII;
      expect(formatInr(4_200_000)).toBe('₹42,00,000');
      expect(formatInrCompact(4_200_000)).toBe('₹42L');
    } finally {
      if (before === undefined) delete process.env.SIRIUS_ASCII;
      else process.env.SIRIUS_ASCII = before;
    }
  });

  it('keeps the Indian grouping, which is the point of the figure', () => {
    // The fallback may change the symbol. It may not change the number: 2-2-3
    // grouping is the India-relevance argument the whole pitch rests on.
    const before = process.env.SIRIUS_ASCII;
    try {
      process.env.SIRIUS_ASCII = '1';
      expect(formatInr(8_930_000)).toBe('Rs.89,30,000');
      expect(formatInr(1_23_45_678)).toBe('Rs.1,23,45,678');
    } finally {
      if (before === undefined) delete process.env.SIRIUS_ASCII;
      else process.env.SIRIUS_ASCII = before;
    }
  });
});

describe('the transliteration', () => {
  it('never makes a line longer than it was', () => {
    // A replacement that grows the string would push a fitted table over the
    // edge on exactly the narrow terminal that asked for ASCII.
    for (const source of ['—', '…', '·', '§', '≥', '≤', '→', '₹', '“q”', "‘q’"]) {
      expect(toAscii(source).length, source).toBeLessThanOrEqual(source.length + 2);
    }
  });

  it('leaves ordinary text alone', () => {
    expect(toAscii('SIR-SEC-001 src/config.py:14')).toBe('SIR-SEC-001 src/config.py:14');
  });
});

describe('the commands the demo actually runs', () => {
  it('emits no non-ASCII byte from a scan', () => {
    const output = run(['scan', dir], { SIRIUS_ASCII: '1' });
    expect(output).not.toBe('');
    expect(nonAscii(output), 'characters that survived the fallback').toEqual([]);
  });

  it('emits no non-ASCII byte from doctor', () => {
    // The diagnostic that vouches for the fallback has to hold to it, or its
    // glyph self-test is certifying a path it does not use.
    const output = run(['doctor'], { SIRIUS_ASCII: '1' });
    expect(nonAscii(output)).toEqual([]);
  });

  it('still prints ₹ when nothing asked for ASCII', () => {
    const output = run(['scan', dir]);
    expect(output).toContain('₹');
  });
});
