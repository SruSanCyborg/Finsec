/**
 * Live secret validation.
 *
 * `--validate-secrets` was dead on arrival, and the reason is worth keeping:
 * it probed the *finding's snippet*, which is redacted (`sk_live_51H8…`) before
 * it ever leaves the engine. Every probe therefore saw a truncated literal and
 * returned `unknown`. The feature could not verify anything, and said so in
 * words vague enough ("no verdict") that it looked like the provider's fault.
 *
 * The provider is injected here rather than called. A test that reaches
 * api.stripe.com fails on a plane, and a test suite that carries a real
 * credential to make itself pass has recreated the very problem this tool
 * exists to find.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkExposure, checkExposureAt, extractCredential } from '../src/engine/threat.js';

// Shaped like a real Stripe test key: the pattern requires 16+ chars after the
// prefix. Not a credential — it authenticates to nothing.
const KEY = 'sk_test_00000000000000000000';

let dir: string;

const respond = (status: number) =>
  vi.fn(async () => new Response(status === 200 ? '{}' : '', { status })) as unknown as typeof fetch;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-validate-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'config.py'), `import os\n\nSTRIPE_KEY = "${KEY}"\n`, 'utf8');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the credential is read from the file, not from the finding', () => {
  it('validates a full literal held in the file', async () => {
    const fetchImpl = respond(200);
    const verdict = await checkExposureAt(join(dir, 'src', 'config.py'), 3, { fetchImpl });

    expect(verdict.exposure).toBe('verified_live');
    expect(verdict.provider).toBe('stripe');
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('cannot validate a redacted snippet — which is why it reads the file', async () => {
    // Exactly what the finding carries, and exactly what used to be probed.
    const verdict = await checkExposure('STRIPE_KEY = "sk_live_51H8…"', { fetchImpl: respond(200) });

    expect(verdict.exposure).toBe('unknown');
  });

  it('reports a missing file without claiming the key is dead', async () => {
    const verdict = await checkExposureAt(join(dir, 'nope.py'), 1, { fetchImpl: respond(200) });
    expect(verdict.exposure).toBe('unknown');
  });

  it('reports a vanished line without claiming the key is dead', async () => {
    const verdict = await checkExposureAt(join(dir, 'src', 'config.py'), 999, { fetchImpl: respond(200) });
    expect(verdict.exposure).toBe('unknown');
  });
});

describe('verdicts', () => {
  const at = (fetchImpl: typeof fetch) =>
    checkExposureAt(join(dir, 'src', 'config.py'), 3, { fetchImpl });

  it('200 means the credential is live', async () => {
    expect((await at(respond(200))).exposure).toBe('verified_live');
  });

  it.each([401, 403])('%d means the credential is not accepted', async (status) => {
    expect((await at(respond(status))).exposure).toBe('inactive');
  });

  it.each([429, 500, 503])('%d is inconclusive, never "dead"', async (status) => {
    // Calling a live key dead because the provider rate-limited us is the one
    // error that actually costs money.
    expect((await at(respond(status))).exposure).toBe('unknown');
  });

  it('a network failure is inconclusive, never "dead"', async () => {
    const failing = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.stripe.com');
    }) as unknown as typeof fetch;

    const verdict = await at(failing);
    expect(verdict.exposure).toBe('unknown');
    expect(verdict.detail).toContain('ENOTFOUND');
  });
});

describe('probes stay read-only', () => {
  it('never issues anything but a GET', async () => {
    const seen: RequestInit[] = [];
    const spy = vi.fn(async (_url: string, init: RequestInit) => {
      seen.push(init);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await checkExposureAt(join(dir, 'src', 'config.py'), 3, { fetchImpl: spy });

    // Validating someone's credential must not mutate their account.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe('GET');
  });

  it('recognises a Stripe test key, so a live demo needs no live key', async () => {
    const found = extractCredential(`STRIPE_KEY = "${KEY}"`);
    expect(found?.probe.name).toBe('stripe');
    expect(found?.value).toBe(KEY);
  });
});

describe('the figure follows the verdict', () => {
  it('drops sharply once the provider refuses the credential', async () => {
    const { estimateExposure } = await import('../src/engine/exposure-model.js');

    const unchecked = estimateExposure({ ruleId: 'SIR-SEC-001', severity: 'critical' });
    const refused = estimateExposure({
      ruleId: 'SIR-SEC-001',
      severity: 'critical',
      confirmedInactive: true,
    });

    // Quoting a transaction ceiling for a key the provider has just refused
    // overstates the exposure. What remains is disclosure and rotation.
    expect(refused.amount).toBeLessThan(unchecked.amount);
    expect(refused.factors.join(' ')).toContain('refused');
  });

  it('never zeroes it — the key was still published', async () => {
    const { estimateExposure } = await import('../src/engine/exposure-model.js');
    const refused = estimateExposure({
      ruleId: 'SIR-SEC-001',
      severity: 'critical',
      confirmedInactive: true,
    });

    expect(refused.amount).toBeGreaterThan(0);
  });

  it('a live credential still doubles it', async () => {
    const { estimateExposure } = await import('../src/engine/exposure-model.js');

    const unchecked = estimateExposure({ ruleId: 'SIR-SEC-001', severity: 'critical' });
    const live = estimateExposure({ ruleId: 'SIR-SEC-001', severity: 'critical', verifiedLive: true });

    expect(live.amount).toBeGreaterThan(unchecked.amount);
  });
});
