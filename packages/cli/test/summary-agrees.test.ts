/**
 * The summary has to be the findings it summarises.
 *
 * This invariant has been broken here once already, and quietly. Suppression
 * withheld a finding from the list and left it in every total, so a suppressed
 * critical stayed in the headline count, kept adding its rupees, and kept
 * dragging the compliance score down — gone from the output and present in the
 * arithmetic.
 *
 * That was fixed at the point it happened. This checks the property itself,
 * over a whole scan, so the next way of breaking it is caught by something that
 * is not the code that broke it.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanDirectory } from '../src/engine/scanner.js';
import type { Finding, Severity, WsFrame } from '../src/domain.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-summary-'));
  mkdirSync(join(dir, 'src'), { recursive: true });

  writeFileSync(
    join(dir, 'src', 'config.py'),
    [
      'STRIPE_KEY = "sk_live_51H8xR2eZvKYlo2Cexam"',
      'TEST_KEY = "sk_test_51H8xR2eZvKYlo2Cexam"',
      'import hashlib',
      'def h(x): return hashlib.md5(x).hexdigest()',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    join(dir, 'src', 'ledger.py'),
    ['def q(cur, uid):', '    cur.execute("SELECT * FROM ledger WHERE id = %s" % uid)'].join('\n'),
    'utf8',
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Runs the engine and returns what it emitted, split into findings and the tail. */
async function scan() {
  const findings: Finding[] = [];
  let completed: (WsFrame & { type: 'scan.completed' }) | undefined;

  for await (const frame of scanDirectory(dir)) {
    if (frame.type === 'finding' && frame.finding) findings.push(frame.finding);
    if (frame.type === 'scan.completed') completed = frame as never;
  }

  return { findings, completed: completed as NonNullable<typeof completed> };
}

describe('a completed scan', () => {
  it('finds something to summarise', async () => {
    const { findings } = await scan();
    expect(findings.length).toBeGreaterThan(2);
  });

  it('counts exactly the findings it emitted', async () => {
    const { findings, completed } = await scan();

    const counted: Partial<Record<Severity, number>> = {};
    for (const finding of findings) {
      counted[finding.severity] = (counted[finding.severity] ?? 0) + 1;
    }

    expect(completed.counts).toEqual(counted);
  });

  it('totals exactly the money it showed', async () => {
    // The headline figure has to be the sum of the lines above it. A total that
    // includes something the user never saw is the version of this bug that
    // already shipped once.
    const { findings, completed } = await scan();
    const sum = findings.reduce((total, finding) => total + (finding.money_at_risk_inr ?? 0), 0);

    expect(completed.money_at_risk_inr).toBe(sum);
  });

  it('scores from those same counts', async () => {
    const { completed } = await scan();
    const { complianceScore } = await import('../src/engine/scanner.js');

    // Two files in the fixture. The score has to be derivable from what was
    // reported, not from anything the report did not mention.
    expect(completed.compliance_score).toBe(complianceScore(completed.counts as never, 2));
  });

  it('agrees with itself about whether anything was found', async () => {
    const { findings, completed } = await scan();
    expect(completed.exit_code).toBe(findings.length > 0 ? 1 : 0);
  });

  it('says nothing was found when nothing was', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'sirius-clean-'));
    try {
      mkdirSync(join(empty, 'src'), { recursive: true });
      writeFileSync(join(empty, 'src', 'ok.py'), 'import os\nKEY = os.environ["KEY"]\n', 'utf8');

      const findings: Finding[] = [];
      let completed: (WsFrame & { type: 'scan.completed' }) | undefined;
      for await (const frame of scanDirectory(empty)) {
        if (frame.type === 'finding' && frame.finding) findings.push(frame.finding);
        if (frame.type === 'scan.completed') completed = frame as never;
      }

      expect(findings).toHaveLength(0);
      expect(completed?.money_at_risk_inr).toBe(0);
      expect(completed?.exit_code).toBe(0);
      // A clean tree scores full marks, or the number means nothing.
      expect(completed?.compliance_score).toBe(100);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('gives every finding it counts a figure and a clause', async () => {
    const { findings } = await scan();
    for (const finding of findings) {
      expect(finding.money_at_risk_inr, finding.rule_id).toBeGreaterThan(0);
      expect(finding.compliance_ref?.length, finding.rule_id).toBeGreaterThan(0);
    }
  });
});
