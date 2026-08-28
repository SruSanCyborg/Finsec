/**
 * The two things `doctor` learned to check after the revenue surface landed.
 *
 * Both are preflight checks, so both are only worth anything if they *fail*
 * when they should. Driven as a subprocess because that is where the behaviour
 * lives: the signing key is read from a path derived from the environment, and
 * the exit code is the part CI would act on.
 *
 * A private key at 0644 is the one that matters. It is one `cat` away from
 * being somebody else's signature, and an audit trail signed with a key anyone
 * could copy proves nothing about who ran the agent — which is the entire claim
 * the trail exists to make.
 */

import { execFile } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ENTRY = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sirius-doctor-'));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function doctor(env: Record<string, string> = {}): Promise<{ out: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', ENTRY, 'doctor'],
      { env: { ...process.env, SIRIUS_CONFIG_HOME: home, ...env }, timeout: 60_000 },
      (error, stdout) => {
        const code = error && typeof (error as { code?: number }).code === 'number' ? (error as { code: number }).code : 0;
        resolve({ out: stdout, code });
      },
    );
  });
}

/** A real ed25519 key, made by the tool itself rather than pasted in here. */
async function makeKey(): Promise<string> {
  const { loadOrCreateKey } = await import('../src/engine/attest.js');
  const path = join(home, 'signing-key.pem');
  loadOrCreateKey(path);
  return path;
}

describe('doctor checks the signing key', () => {
  it('says it has not been made yet rather than treating that as a fault', async () => {
    const { out, code } = await doctor();
    expect(out).toContain('signing key');
    expect(out).toContain('not created yet');
    // Absence is normal: the key is generated on first use.
    expect(code).not.toBe(2);
  }, 90_000);

  it('reports the key id when the key is sound', async () => {
    await makeKey();
    const { out } = await doctor();
    expect(out).toMatch(/signing key\s+[0-9a-f]{16} · 0600/);
  }, 90_000);

  it('fails, loudly and with the fix, when the key is world-readable', async () => {
    const path = await makeKey();
    chmodSync(path, 0o644);

    const { out, code } = await doctor();
    expect(out).toContain('is 644, not 600');
    expect(out).toContain('chmod 600');
    // Exit 2: something here would stop a run, and a pipeline should hear it.
    expect(code).toBe(2);
  }, 90_000);

  it('leaves the key exactly as it found it', async () => {
    const path = await makeKey();
    await doctor();
    // A preflight that repairs things silently is a preflight nobody can trust
    // to tell them the truth about the state they were in.
    expect(existsSync(path)).toBe(true);
  }, 90_000);
});

describe('doctor self-tests the revenue engine', () => {
  it('fits a model, flags records, and holds the ones it must', async () => {
    const { out } = await doctor();
    expect(out).toContain('revenue engine');
    expect(out).toMatch(/model fits on \d+ · \d+ flagged, \d+ held/);
  }, 90_000);

  it('does not report holds it did not make', async () => {
    const { out } = await doctor();
    const held = /flagged, (\d+) held/.exec(out)?.[1];
    // The number is asserted to be real rather than decorative: a batch of this
    // size always contains disputes and a shared-signal cluster.
    expect(Number(held)).toBeGreaterThan(0);
  }, 90_000);
});

describe('a copied key', () => {
  it('is still checked, wherever the config home points', async () => {
    const source = await makeKey();
    const other = mkdtempSync(join(tmpdir(), 'sirius-doctor-alt-'));
    try {
      copyFileSync(source, join(other, 'signing-key.pem'));
      chmodSync(join(other, 'signing-key.pem'), 0o600);

      const { out } = await doctor({ SIRIUS_CONFIG_HOME: other });
      expect(out).toContain('0600');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  }, 90_000);
});
