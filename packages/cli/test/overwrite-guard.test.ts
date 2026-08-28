/**
 * Refusing to destroy the evidence.
 *
 * `revenue gen` and `reconcile --gen` are the only two commands in this surface
 * that destroy anything, and both did it silently: point either at a directory
 * that already held a batch and it was replaced, labels and all. Every figure
 * anybody had reported against that directory became unreproducible from it,
 * and nothing said so.
 *
 * The rule is not "never overwrite" — the generators are deterministic, so
 * rewriting the same seed produces byte-identical files and scripts should be
 * able to do it. What is refused is a regeneration that would *change* what is
 * there.
 *
 * Driven as subprocesses because the guard lives in the command layer, where
 * the exit code is the part a script acts on.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ENTRY = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-guard-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/**
 * Runs the CLI with absolute targets rather than a temporary cwd.
 *
 * `tsx` resolves its loader relative to the working directory, so running from
 * a temp dir fails on module resolution before the command starts — which looks
 * exactly like the guard not firing. Both generators take a path argument, so
 * there is no need to move.
 */
function cli(args: string[]): Promise<{ out: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', ENTRY, ...args],
      { timeout: 90_000, env: { ...process.env, NO_COLOR: '1' } },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: number }).code === 'number' ? (error as { code: number }).code : 0;
        resolve({ out: `${stdout}${stderr}`, code });
      },
    );
  });
}

const seedOf = (batch: string) =>
  String(JSON.parse(readFileSync(join(dir, batch, 'manifest.json'), 'utf8')).seed);

const small = ['--payments', '80', '--checkouts', '20', '--invoices', '15'];

/** The batch and books directories, absolute, inside this test's temp dir. */
const at = (name: string) => join(dir, name);

describe('revenue gen', () => {
  it('writes a batch where there was none', async () => {
    const { code } = await cli(['revenue', 'gen', at('batch'), '--seed', 'first', ...small]);
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'batch', 'truth.jsonl'))).toBe(true);
  });

  it('refuses to replace a batch made from a different seed', async () => {
    await cli(['revenue', 'gen', at('batch'), '--seed', 'first', ...small]);
    const { out, code } = await cli(['revenue', 'gen', at('batch'), '--seed', 'second', ...small]);

    expect(code).not.toBe(0);
    expect(out).toContain('already holds a different batch');
    // The refusal has to name what is there, or the user cannot judge it.
    expect(out).toContain('first');
    expect(seedOf('batch')).toBe('first');
  }, 90_000);

  it('says the labels are the thing at stake', async () => {
    await cli(['revenue', 'gen', at('batch'), '--seed', 'first', ...small]);
    const { out } = await cli(['revenue', 'gen', at('batch'), '--seed', 'second', ...small]);
    expect(out).toContain('truth.jsonl');
  }, 90_000);

  it('offers both ways out', async () => {
    await cli(['revenue', 'gen', at('batch'), '--seed', 'first', ...small]);
    const { out } = await cli(['revenue', 'gen', at('batch'), '--seed', 'second', ...small]);

    expect(out).toMatch(/somewhere else/);
    expect(out).toContain('--force');
  }, 90_000);

  it('allows an identical regeneration, so scripts stay idempotent', async () => {
    await cli(['revenue', 'gen', at('batch'), '--seed', 'first', ...small]);
    const before = readFileSync(join(dir, 'batch', 'records.jsonl'), 'utf8');

    const { code } = await cli(['revenue', 'gen', at('batch'), '--seed', 'first', ...small]);
    expect(code).toBe(0);
    // Deterministic: not merely permitted, but byte-identical.
    expect(readFileSync(join(dir, 'batch', 'records.jsonl'), 'utf8')).toBe(before);
  }, 90_000);

  it('refuses a different size too, not only a different seed', async () => {
    await cli(['revenue', 'gen', at('batch'), '--seed', 'first', ...small]);
    const { code } = await cli(['revenue', 'gen', at('batch'), '--seed', 'first', '--invoices', '40']);
    expect(code).not.toBe(0);
  }, 90_000);

  it('replaces it when told to', async () => {
    await cli(['revenue', 'gen', at('batch'), '--seed', 'first', ...small]);
    const { code } = await cli(['revenue', 'gen', at('batch'), '--seed', 'second', '--force', ...small]);

    expect(code).toBe(0);
    expect(seedOf('batch')).toBe('second');
  }, 90_000);
});

describe('reconcile --gen', () => {
  const books = ['--orders', '60'];

  it('refuses to replace books made from a different seed', async () => {
    await cli(['reconcile', at('books'), '--gen', '--seed', 'alpha', ...books]);
    const { out, code } = await cli(['reconcile', at('books'), '--gen', '--seed', 'beta', ...books]);

    expect(code).not.toBe(0);
    expect(out).toContain('already holds a different set of books');
    expect(out).toContain('alpha');
  }, 90_000);

  it('says links.json is what is at stake', async () => {
    // The only file that can say whether a match was correct rather than merely
    // confident — which is the claim the whole reconciliation report rests on.
    await cli(['reconcile', at('books'), '--gen', '--seed', 'alpha', ...books]);
    const { out } = await cli(['reconcile', at('books'), '--gen', '--seed', 'beta', ...books]);
    expect(out).toContain('links.json');
  }, 90_000);

  it('allows an identical regeneration', async () => {
    await cli(['reconcile', at('books'), '--gen', '--seed', 'alpha', ...books]);
    const before = readFileSync(join(dir, 'books', 'ledger.jsonl'), 'utf8');

    const { code } = await cli(['reconcile', at('books'), '--gen', '--seed', 'alpha', ...books]);
    expect(code).toBe(0);
    expect(readFileSync(join(dir, 'books', 'ledger.jsonl'), 'utf8')).toBe(before);
  }, 90_000);

  it('replaces them when told to', async () => {
    await cli(['reconcile', at('books'), '--gen', '--seed', 'alpha', ...books]);
    const { code } = await cli(['reconcile', at('books'), '--gen', '--seed', 'beta', '--force', ...books]);

    expect(code).toBe(0);
    expect(readFileSync(join(dir, 'books', 'seed.txt'), 'utf8').trim()).toBe('beta:60');
  }, 90_000);
});
