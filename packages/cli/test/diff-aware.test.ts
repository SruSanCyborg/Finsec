/**
 * `--diff`, which was accepted, stored, echoed, and wired to nothing.
 *
 * The flag is documented as "only report findings absent from the baseline". It
 * was parsed into the config, reported back in the JSON envelope as
 * `diff_aware`, and acted on by no code at all — so a scan of an unchanged tree
 * against its own baseline reported every finding it had already accepted and
 * exited 1. That is the opposite of the promise, and it is the same shape as
 * `--ruleset`, which was also wired to nothing: a flag that errs toward *more*
 * output is never caught by a missing result.
 *
 * The second half of this is the part that has bitten before. Withholding a
 * finding from the list while leaving it in the totals is a bug this surface
 * has already shipped once, so the counts, the money and the score are asserted
 * alongside the list rather than trusted to follow it.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPolicy, emptyPolicyOutcome } from '../src/engine/policy.js';
import { scanDirectory } from '../src/engine/scanner.js';
import { saveBaseline } from '../src/engine/store.js';
import type { Finding, WsFrame } from '../src/domain.js';

let dir: string;

const KEY = 'STRIPE_KEY = "sk_live_51H8xR2eZvKYlo2Cexam"';
const WEAK = ['import hashlib', 'def digest(x):', '    return hashlib.md5(x).hexdigest()'].join('\n');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-diff-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'config.py'), `${KEY}\n`, 'utf8');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Runs a scan through the policy layer, as the command does. */
async function scan(options: { diffOnly?: boolean } = {}) {
  const outcome = emptyPolicyOutcome();
  const findings: Finding[] = [];
  let completed: (WsFrame & { type: 'scan.completed' }) | undefined;

  for await (const frame of applyPolicy(scanDirectory(dir), dir, outcome, options)) {
    if (frame.type === 'finding' && frame.finding) findings.push(frame.finding);
    if (frame.type === 'scan.completed') completed = frame as never;
  }
  return { findings, completed: completed as NonNullable<typeof completed>, outcome };
}

describe('with a baseline covering everything', () => {
  beforeEach(async () => {
    const { findings } = await scan();
    expect(findings.length).toBeGreaterThan(0);
    saveBaseline(dir, 'test', findings.map((finding) => finding.fingerprint as string));
  });

  it('reports everything without --diff, marked unchanged', () => {
    // The default is to annotate, not to hide: `baseline_state` is SARIF's own
    // vocabulary and a finding you accepted is still a finding.
    return scan().then(({ findings }) => {
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every((f) => f.baseline_state === 'unchanged')).toBe(true);
    });
  });

  it('reports nothing with --diff', async () => {
    const { findings } = await scan({ diffOnly: true });
    expect(findings).toEqual([]);
  });

  it('takes the withheld findings out of the totals too', async () => {
    // The half that has been wrong before. A list that shrinks while the count
    // and the money do not is worse than no filtering at all.
    const { completed, outcome } = await scan({ diffOnly: true });
    expect(completed.counts).toEqual({});
    expect(completed.money_at_risk_inr).toBe(0);
    expect(completed.compliance_score).toBe(100);
    expect(completed.exit_code).toBe(0);
    expect(outcome.withheldAsUnchanged).toBeGreaterThan(0);
  });

  it('reports only what the baseline does not have', async () => {
    writeFileSync(join(dir, 'src', 'hash.py'), `${WEAK}\n`, 'utf8');

    const { findings, completed } = await scan({ diffOnly: true });
    expect(findings.map((f) => f.rule_id)).toEqual(['SIR-SEC-040']);
    expect(findings[0]?.baseline_state).toBe('new');

    // And the totals describe the one new finding, not the whole tree.
    expect(completed.counts).toEqual({ medium: 1 });
    expect(completed.money_at_risk_inr).toBe(findings[0]?.money_at_risk_inr);
  });
});

describe('with no baseline at all', () => {
  it('changes nothing, because everything is new', async () => {
    const plain = await scan();
    const diffed = await scan({ diffOnly: true });
    expect(diffed.findings.map((f) => f.rule_id)).toEqual(plain.findings.map((f) => f.rule_id));
    expect(diffed.completed.money_at_risk_inr).toBe(plain.completed.money_at_risk_inr);
  });
});
