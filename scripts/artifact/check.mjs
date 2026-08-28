/**
 * Fails when the committed metrics no longer match a live run.
 *
 * The page is generated now, which stops it being *typed* wrong — it does not
 * stop it being *stale*. Change the model, forget to run `pnpm artifact`, and
 * the published figures quietly describe a build nobody can run. That is the
 * same failure as before wearing a different hat.
 *
 * So this re-collects and diffs. It names every field that moved rather than
 * saying "out of date", because the diff is the useful part: it is a list of
 * exactly which claims a change altered, which is worth reading before deciding
 * whether the change was wanted.
 *
 * `generated_at` is excluded — it moves on every run by design, and comparing it
 * would make this always fail.
 *
 * Usage: node scripts/artifact/check.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const committedPath = join(here, 'metrics.json');

const stage = mkdtempSync(join(tmpdir(), 'sirius-artifact-check-'));
const freshPath = join(stage, 'metrics.json');

try {
  execFileSync(process.execPath, [join(here, 'collect.mjs'), freshPath], { stdio: 'pipe' });

  const committed = JSON.parse(readFileSync(committedPath, 'utf8'));
  const fresh = JSON.parse(readFileSync(freshPath, 'utf8'));

  const drift = [];

  /** Walks both trees together, recording every leaf that disagrees. */
  const compare = (a, b, path = '') => {
    if (path === 'generated_at') return;

    if (Array.isArray(a) || Array.isArray(b)) {
      const left = Array.isArray(a) ? a : [];
      const right = Array.isArray(b) ? b : [];
      if (left.length !== right.length) {
        drift.push({ path, before: `${left.length} items`, after: `${right.length} items` });
        return;
      }
      left.forEach((item, index) => compare(item, right[index], `${path}[${index}]`));
      return;
    }

    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        compare(a[key], b[key], path ? `${path}.${key}` : key);
      }
      return;
    }

    if (a !== b) drift.push({ path, before: a, after: b });
  };

  compare(committed, fresh);

  if (drift.length === 0) {
    process.stdout.write('The published page matches a live run.\n');
    process.exit(0);
  }

  process.stdout.write(`${drift.length} figure(s) on the published page no longer match a live run:\n\n`);
  for (const item of drift.slice(0, 30)) {
    process.stdout.write(`  ${item.path}\n      was ${JSON.stringify(item.before)} → now ${JSON.stringify(item.after)}\n`);
  }
  if (drift.length > 30) process.stdout.write(`  … and ${drift.length - 30} more\n`);

  process.stdout.write('\nRegenerate with:  pnpm artifact\n');
  process.stdout.write('Then republish the page so the numbers on it are the ones this build produces.\n');
  // Exit 1, not 2: stale figures are a finding, not a broken tool.
  process.exit(1);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
