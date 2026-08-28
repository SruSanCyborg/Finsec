/**
 * `.siriusignore`, which was documented, scaffolded, and read by nothing.
 *
 * AGENTS.md lists three suppression layers and this is one of them; `init`
 * writes the file; `ScanEngineOptions.ignorePatterns` declares the field; and
 * `scan` passed the config's `exclude:` into it. The scanner never read it.
 *
 * It hid behind its own defaults. The `.siriusignore` that `init` writes lists
 * `node_modules/`, `vendor/`, `dist/`, `build/` — every one of which is already
 * in the scanner's hardcoded SKIP_DIRS — so the file appeared to work perfectly
 * while any pattern a user added did nothing at all. A feature correct on the
 * values it ships with is the hardest kind to notice is broken, and the only
 * way to catch it is to add a pattern of your own and count.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectFiles } from '../src/engine/scanner.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-ignore-'));
  for (const path of ['src/app.py', 'src/deep/inner.py', 'lib/util.py', 'generated/big.min.js']) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), 'x = 1\n', 'utf8');
  }
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const scanned = (patterns?: string[]): string[] =>
  collectFiles(dir, patterns ? { ignorePatterns: patterns } : {})
    .map((path) => path.slice(dir.length + 1).split('\\').join('/'))
    .sort();

describe('what the scanner collects', () => {
  it('finds everything when nothing is ignored', () => {
    expect(scanned()).toEqual(['generated/big.min.js', 'lib/util.py', 'src/app.py', 'src/deep/inner.py']);
  });

  it('honours a bare directory name, as a .gitignore would', () => {
    expect(scanned(['src'])).toEqual(['generated/big.min.js', 'lib/util.py']);
  });

  it('honours a trailing slash the same way', () => {
    expect(scanned(['src/'])).toEqual(['generated/big.min.js', 'lib/util.py']);
  });

  it('honours a ** glob', () => {
    expect(scanned(['src/**'])).toEqual(['generated/big.min.js', 'lib/util.py']);
  });

  it('matches a bare filename pattern at any depth', () => {
    // `*.min.js` in a .gitignore matches wherever the file is, not only at the
    // root. Anchoring it to the root would silently keep every vendored bundle.
    expect(scanned(['*.min.js'])).toEqual(['lib/util.py', 'src/app.py', 'src/deep/inner.py']);
  });

  it('does not prune a directory whose name merely starts the same way', () => {
    // `src` must not take `src-generated` with it.
    mkdirSync(join(dir, 'src-generated'), { recursive: true });
    writeFileSync(join(dir, 'src-generated', 'out.py'), 'x = 1\n', 'utf8');
    expect(scanned(['src'])).toContain('src-generated/out.py');
  });

  it('takes several patterns together', () => {
    expect(scanned(['src', '*.min.js'])).toEqual(['lib/util.py']);
  });

  it('ignores nothing when given an empty list', () => {
    expect(scanned([])).toHaveLength(4);
  });
});
