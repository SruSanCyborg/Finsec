/**
 * The order a scan's output is assembled in.
 *
 * Findings, then the threat report, then the verdict. Each constraint below
 * corresponds to something that was actually wrong in a rehearsal:
 *
 *  - The summary was printed *before* the threat stage, so twenty lines of
 *    attack paths pushed the gate verdict and the total at risk off the top of
 *    the screen. The conclusion has to be the last thing standing.
 *  - Moving it revealed the mirror-image bug in piped output: the threat report
 *    then came before the findings it names by rule id, which reads as
 *    conclusions about evidence not yet shown.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLI = resolve(__dirname, '../dist/cli.js');
const FIXTURE = resolve(__dirname, '../../../contract/fixtures/chaos-repo');

/** Runs a real scan with pacing off, and strips colour. */
function scan(args: string[] = []): string {
  try {
    return execFileSync(process.execPath, [CLI, 'scan', FIXTURE, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SIRIUS_PROJECT_ID: '',
        SIRIUS_SCAN_PACE: '0',
        NO_COLOR: '1',
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    // Exit 1 means findings at or above the threshold, which is the expected
    // outcome here — the output is still on stdout.
    if (typeof error?.stdout === 'string') return error.stdout;
    throw error;
  }
}

const output = scan();
const at = (needle: string) => output.indexOf(needle);

describe('a scan reports findings, then threat, then the verdict', () => {
  it('produces all three sections', () => {
    expect(at('SIR-SEC-001')).toBeGreaterThanOrEqual(0);
    expect(at('THREAT')).toBeGreaterThan(0);
    expect(at('Findings')).toBeGreaterThan(0);
    expect(at('Exit 1')).toBeGreaterThan(0);
  });

  it('lists the findings before the threat report that names them', () => {
    expect(at('SIR-SEC-001')).toBeLessThan(at('THREAT'));
  });

  it('ends with the verdict, not the attack paths', () => {
    expect(at('THREAT')).toBeLessThan(at('Exit 1'));
    expect(at('AP-1')).toBeLessThan(at('Money@risk'));
  });

  it('leaves the gate verdict in the final section', () => {
    const tail = output.slice(at('Findings'));
    expect(tail).toContain('Money@risk');
    expect(tail).toContain('Compliance');
    expect(tail).toContain('BLOCKED');
  });

  it('names what was scanned, with a path that fits', () => {
    // A mock must never be mistakable for a real analysis, and an absolute path
    // elided from the right hides the directory that was actually scanned.
    const scanned = output.split('\n').find((l) => l.includes('Scanned'));
    expect(scanned).toBeDefined();
    expect(scanned).toContain('chaos-repo');
    expect(scanned).toContain('3 files');
    expect(output).toContain('local engine');
  });
});

describe('machine output is unaffected', () => {
  it('--json stays a single valid document', () => {
    const parsed = JSON.parse(scan(['--json']));
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.exit_code).toBe(1);
  });

  it('--json carries no report prose', () => {
    expect(scan(['--json'])).not.toContain('THREAT');
  });
});
