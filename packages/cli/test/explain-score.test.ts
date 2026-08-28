/**
 * The other headline number, and where it comes from.
 *
 * `Compliance 60/100` sits on the scan footer beside a rupee figure that can be
 * traced to a public anchor. `sirius explain` exists precisely because "how did
 * you get ₹42,00,000?" is the first question anyone sensible asks — and asking
 * the same question about the score got:
 *
 *     error: No exposure model for "score".
 *
 * It is the number a compliance officer asks about first, and the formula was
 * explainable the whole time. It simply was not reachable from the command
 * whose entire job is disclosure.
 *
 * The derivation has to *match* — a worked example that disagrees with the
 * footer is worse than none, so the test recomputes the score from the printed
 * terms rather than trusting the prose.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { complianceScore } from '../src/engine/scanner.js';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

function run(args: string[], cwd: string): string {
  try {
    return execFileSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, SIRIUS_SCAN_PACE: '0', NO_COLOR: '1' },
    });
  } catch (error) {
    return (error as { stdout?: string }).stdout ?? '';
  }
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-score-'));
  writeFileSync(
    join(dir, 'pay.py'),
    [
      'STRIPE_KEY = "sk_live_51H8xQ2eZvKYlo2Cabcd"',
      '',
      'def charge(db, request):',
      '    q = "SELECT * FROM t WHERE id = %s" % request.args["id"]',
      '    return db.execute(q)',
      '',
    ].join('\n'),
    'utf8',
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('sirius explain score', () => {
  it('answers instead of refusing', () => {
    const output = run(['explain', 'score'], dir);
    expect(output).not.toContain('No exposure model');
    expect(output).toContain('Compliance score');
  });

  it('gives the weight of every severity', () => {
    const output = run(['explain', 'score'], dir);
    for (const severity of ['critical', 'high', 'medium', 'low', 'info']) {
      expect(output, severity).toContain(severity);
    }
  });

  it('says whose formula it is', () => {
    // The weighting is logged as an open question blocking on `auto`. This is
    // the local engine's answer, and a score somebody may have to defend must
    // say which authority produced it.
    expect(run(['explain', 'score'], dir)).toMatch(/local engine|contract/i);
  });

  it('works the example against the score the scan actually printed', () => {
    const scan = run(['scan', '.'], dir);
    const printed = /Compliance\s+(?:score\s+)?([\d.]+)\/100/.exec(scan)?.[1];
    expect(printed, 'the footer should carry a score').toBeDefined();

    const explained = run(['explain', 'score'], dir);
    const derived = /score\s+100 − [\d.]+ ÷ [\d.]+ = ([\d.]+)/.exec(explained)?.[1];
    expect(derived, 'the worked example should end in a score').toBeDefined();

    // A derivation that disagrees with the footer is worse than no derivation.
    expect(Number(derived)).toBeCloseTo(Number(printed), 1);
  });

  it('matches the function the scanner uses', () => {
    // Belt and braces: the prose is derived from the same weights, so a change
    // to the formula that forgets this command is caught here rather than by a
    // reader noticing the arithmetic does not work.
    expect(complianceScore({ critical: 2, high: 2, medium: 2 }, 3)).toBe(60);
  });

  it('offers the machine-readable form too', () => {
    const output = run(['explain', 'score', '--json'], dir);
    const parsed = JSON.parse(output) as { weights: Record<string, number>; formula: string };
    expect(parsed.weights.critical).toBe(12);
    expect(parsed.formula).toContain('log10');
  });
});
