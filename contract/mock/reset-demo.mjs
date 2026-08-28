#!/usr/bin/env node
/**
 * Restores `demo/` to a pristine copy of the chaos repo, for rehearsing.
 *
 * It replaces files **in place** and never removes the directory itself. That
 * matters: deleting a directory a shell is currently sitting in leaves that
 * shell with a dangling working directory, and every command run from it then
 * fails with an opaque `uv_cwd` error until the user cds out and back.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = join(ROOT, 'contract', 'fixtures', 'chaos-repo', 'src');
const DEMO = join(ROOT, 'demo');
const DEMO_SRC = join(DEMO, 'src');

// Artifacts a rehearsal leaves behind, all safe to remove.
const LEAVINGS = [/\.sirius-backup$/, /\.sarif$/, /^sirius-report-.*\.json$/, /^\.env\.example$/];

mkdirSync(DEMO_SRC, { recursive: true });

// Clear the scan cache so `fix` and `triage` do not resolve against a stale scan.
rmSync(join(DEMO, '.sirius'), { recursive: true, force: true });

let removed = 0;
for (const dir of [DEMO, DEMO_SRC]) {
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (!statSync(path).isFile()) continue;
    if (LEAVINGS.some((pattern) => pattern.test(entry))) {
      rmSync(path, { force: true });
      removed += 1;
    }
  }
}

// Overwrite the sources, restoring the planted findings at their known lines.
cpSync(SOURCE, DEMO_SRC, { recursive: true, force: true });

console.log(`demo/ reset${removed ? ` (${removed} leftover file${removed === 1 ? '' : 's'} removed)` : ''}`);
console.log('  the directory itself was kept, so any shell sitting in it still works');
