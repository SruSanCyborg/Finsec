/**
 * The headline total must equal the findings it summarises.
 *
 * A scan produces two money figures — one per finding, one in the footer — and
 * nothing structural kept them equal. They are computed in different places:
 * the total is accumulated by the engine as it walks the files, the per-finding
 * amounts are open to revision by any later stage.
 *
 * `--validate-secrets` is such a stage. It asks the provider whether a
 * credential works, and reprices the finding when it learns the answer — a
 * refused key stops being quoted at a live key's ceiling. It repriced the
 * finding and left the total alone, so a real run printed six findings summing
 * to ₹53,60,000 under a footer reading ₹89,30,000.
 *
 * Neither number looks wrong on its own, which is why nobody noticed and why
 * the assertion has to be about the *relationship*. This is the invariant, not
 * a regression test for one flag: any future stage that touches an amount and
 * forgets the total fails here.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPolicy, emptyPolicyOutcome } from '../src/engine/policy.js';
import { validateFrames } from '../src/engine/threat.js';
import type { WsFrame } from '../src/api/frames.js';

/** A secrets finding priced at a live key's ceiling, before anyone asked. */
const finding = (id: string, money: number): WsFrame =>
  ({
    type: 'finding',
    finding: {
      rule_id: id,
      category: 'secrets',
      severity: 'critical',
      file: 'pay.py',
      line: 1,
      money_at_risk_inr: money,
      fingerprint: `fp-${id}`,
    },
  }) as unknown as WsFrame;

const completed = (money: number): WsFrame =>
  ({
    type: 'scan.completed',
    counts: { critical: 2 },
    money_at_risk_inr: money,
    compliance_score: 60,
    exit_code: 1,
  }) as unknown as WsFrame;

/**
 * A tree holding the credential the finding points at.
 *
 * Validation re-reads the line rather than trusting the finding's redacted
 * snippet, so a verdict — and therefore a repricing — only happens when the
 * file is really there.
 */
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-money-'));
  writeFileSync(join(dir, 'pay.py'), 'STRIPE_KEY = "sk_live_51H8xQ2eZvKYlo2Cabcd"\n', 'utf8');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function* stream(...frames: WsFrame[]): AsyncGenerator<WsFrame> {
  for (const frame of frames) yield frame;
}

/** Drains a frame stream into the two numbers that must agree. */
async function totals(frames: AsyncIterable<WsFrame>): Promise<{ sum: number; headline: number }> {
  let sum = 0;
  let headline = 0;
  for await (const frame of frames) {
    if (frame.type === 'finding') sum += frame.finding?.money_at_risk_inr ?? 0;
    if (frame.type === 'scan.completed') headline = frame.money_at_risk_inr ?? 0;
  }
  return { sum, headline };
}

describe('the footer total and the findings it summarises', () => {
  it('agree when nothing reprices anything', async () => {
    const { sum, headline } = await totals(
      stream(finding('SIR-SEC-001', 4_200_000), finding('SIR-SEC-002', 1_000_000), completed(5_200_000)),
    );
    expect(headline).toBe(sum);
  });

  it('agree after secret validation reprices a refused key', async () => {
    // The reported case. The provider says the credential is dead, the finding
    // drops from a live key's ceiling to a fraction of it, and the total has to
    // follow it down or the document contradicts itself.
    const source = stream(finding('SIR-SEC-001', 4_200_000), completed(4_200_000));
    const { sum, headline } = await totals(
      validateFrames(source, dir, {
        // No network: report the key dead without leaving the machine.
        fetchImpl: (async () => new Response('', { status: 401 })) as unknown as typeof fetch,
      }),
    );

    expect(sum).toBeLessThan(4_200_000);
    expect(headline).toBe(sum);
  });

  it('agree after a suppression withholds a finding', async () => {
    // The layer that already got this right, pinned so it stays right.
    const outcome = emptyPolicyOutcome();
    const source = stream(finding('SIR-SEC-001', 4_200_000), finding('SIR-SEC-002', 1_000_000), completed(5_200_000));
    const { sum, headline } = await totals(applyPolicy(source, process.cwd(), outcome, {}));

    expect(headline).toBe(sum);
  });

  it('never lets a repricing drive the total below zero', async () => {
    // The correction is a delta, so a bad one could underflow. A negative
    // money-at-risk would render as a nonsense rupee figure in the footer.
    const source = stream(finding('SIR-SEC-001', 4_200_000), completed(0));
    const { headline } = await totals(
      validateFrames(source, dir, {
        fetchImpl: (async () => new Response('', { status: 401 })) as unknown as typeof fetch,
      }),
    );

    expect(headline).toBeGreaterThanOrEqual(0);
  });
});
