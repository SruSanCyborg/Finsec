/**
 * What the exit code means when the invocation itself was wrong.
 *
 * The contract is Snyk's: `0` clean, `1` findings at or above the threshold —
 * *action needed, not an error* — `2` a CLI or execution failure, `3` no
 * supported target. A pipeline gates on these, and the README offers
 * `sirius scan … || true` as the escape hatch for teams not ready to block.
 *
 * Two cases broke that, and both were found by running the binary rather than
 * by any unit test, because each one is only wrong in relation to the contract:
 *
 *   A mistyped flag exited 1. `exitOverride()` was applied to the root command
 *   after `buildProgram()` had already constructed the subcommands, so they
 *   kept commander's default `process.exit(1)`. `scan . --sevrity-threshold
 *   high || true` then swallowed the typo and went green having scanned
 *   nothing — the worst possible reading, since the flag that was meant to
 *   tighten the gate silently removed it.
 *
 *   A directory with nothing scannable in it exited 0 and printed
 *   `Compliance 100/100 · PASSED`. Not a gate that passed: a scan that never
 *   happened, reported as a perfect score.
 *
 * These drive the built CLI as a child process, because that is the only place
 * the exit code exists. Calling the command function directly cannot see it.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExitCode } from '../src/domain.js';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

/** Runs the CLI and returns only its exit code. */
function run(args: string[]): number {
  try {
    execFileSync(process.execPath, [cli, ...args], { stdio: 'pipe', env: { ...process.env, SIRIUS_SCAN_PACE: '0' } });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? -1;
  }
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-exit-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('a malformed invocation is a CLI error, not a finding', () => {
  it.each([
    ['an unknown flag on a subcommand', ['scan', '.', '--no-such-flag']],
    ['a flag missing its value', ['scan', '.', '--severity-threshold']],
    ['an unknown flag two levels down', ['revenue', 'detect', '--no-such-flag']],
    ['a missing required argument', ['report', '--verify']],
    ['an unknown command', ['no-such-command']],
  ])('%s exits 2', (_name, args) => {
    // Never 1: that is reserved for "findings at or above threshold", and a
    // pipeline cannot tell a blocked gate from a typo if they share a code.
    expect(run(args)).toBe(ExitCode.CLI_ERROR);
  });

  it.each([
    ['--help', ['--help']],
    ['a subcommand --help', ['scan', '--help']],
    ['--version', ['--version']],
  ])('%s still exits 0', (_name, args) => {
    // The override catches these too; they are successful exits, not failures.
    expect(run(args)).toBe(0);
  });
});

describe('nothing to scan is not a pass', () => {
  it('exits 3 on a directory holding no supported file', () => {
    expect(run(['scan', dir])).toBe(ExitCode.NO_TARGET);
  });

  it('exits 3 when the only files are ones it cannot read', () => {
    writeFileSync(join(dir, 'README.md'), '# notes\n', 'utf8');
    writeFileSync(join(dir, 'logo.png'), 'not really a png', 'utf8');
    expect(run(['scan', dir])).toBe(ExitCode.NO_TARGET);
  });

  it('still exits 3 for a path that does not exist', () => {
    expect(run(['scan', join(dir, 'nope')])).toBe(ExitCode.NO_TARGET);
  });

  it('scans normally as soon as there is one supported file', () => {
    // The guard must not fire on a real tree. A clean Python file is a genuine
    // pass — exit 0 for the right reason, rather than for having looked at
    // nothing.
    writeFileSync(join(dir, 'ok.py'), 'def add(a, b):\n    return a + b\n', 'utf8');
    expect(run(['scan', dir])).toBe(0);
  });

  it('does not count a file that the ignore rules removed', () => {
    // Everything excluded is also nothing scanned, and saying "100/100" there
    // would be the same wrong answer arrived at a different way.
    mkdirSync(join(dir, 'vendor'), { recursive: true });
    writeFileSync(join(dir, 'vendor', 'app.py'), 'x = 1\n', 'utf8');
    writeFileSync(join(dir, '.siriusignore'), 'vendor/\n', 'utf8');
    expect(run(['scan', dir])).toBe(ExitCode.NO_TARGET);
  });
});
