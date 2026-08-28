/**
 * Reading only part of the output.
 *
 * `sirius rules list | head -1` ended in a Node stack trace. The reader closes
 * the pipe, the next write fails with EPIPE, and an unhandled stream error
 * takes the process down loudly — reachable from nearly every command, since
 * they all write more than one line. Piping into `head`, or quitting `less`
 * early, is a normal thing to do.
 *
 * Driven through a real shell pipeline, because that is the only place the
 * behaviour exists: the CLI's stdout has to *be* the pipe that `head` closes.
 * Building the pipeline inside the test process instead — spawning both and
 * joining them with `.pipe()` — proves nothing, since the test process then
 * holds the CLI's stdout open and EPIPE never happens.
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ENTRY = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-pipe-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Runs `sirius … | head -1` in a shell and returns what the CLI wrote to stderr. */
function runPipedToHead(args: string): Promise<string> {
  const errors = join(dir, 'stderr.txt');
  const command = `'${process.execPath}' --import tsx '${ENTRY}' ${args} 2>'${errors}' | head -1 >/dev/null`;

  return new Promise((resolve) => {
    execFile('/bin/sh', ['-c', command], () => {
      resolve(readFileSync(errors, 'utf8'));
    });
  });
}

describe('a reader that closes the pipe early', () => {
  it('does not make `rules list` print a stack trace', async () => {
    const stderr = await runPipedToHead('rules list');

    expect(stderr).not.toContain('EPIPE');
    expect(stderr).not.toContain('node:internal');
  }, 30_000);

  it('does not make `explain` print a stack trace', async () => {
    const stderr = await runPipedToHead('explain SIR-SEC-001');

    expect(stderr).not.toContain('EPIPE');
    expect(stderr).not.toContain('Unhandled');
  }, 30_000);
});
