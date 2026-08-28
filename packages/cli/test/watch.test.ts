/**
 * Watch-mode path filtering.
 *
 * The consequential case is the last one: this CLI writes `.sirius-backup`
 * files when it applies a fix, so a watcher that reacts to its own output would
 * re-scan forever.
 */

import { describe, expect, it } from 'vitest';

import { shouldIgnore } from '../src/commands/watch.js';

describe('shouldIgnore', () => {
  it.each([
    'node_modules/react/index.js',
    '.git/HEAD',
    'dist/cli.js',
    'build/output.o',
    '__pycache__/mod.pyc',
    '.venv/lib/python3.12/site.py',
    'src/.sirius/last-scan.json',
    'coverage/lcov.info',
  ])('ignores %s', (path) => {
    expect(shouldIgnore(path)).toBe(true);
  });

  it.each([
    'src/config.py',
    'src/api/transfer.py',
    'requirements.txt',
    'sirius.yaml',
  ])('watches %s', (path) => {
    expect(shouldIgnore(path)).toBe(false);
  });

  it.each([
    'src/.#config.py',
    'src/config.py~',
    'src/.config.py.swp',
    '.DS_Store',
  ])('ignores the editor scratch file %s', (path) => {
    expect(shouldIgnore(path)).toBe(true);
  });

  it('ignores the backups it writes itself, so a fix cannot cause a rescan loop', () => {
    expect(shouldIgnore('src/config.py.sirius-backup')).toBe(true);
  });

  it('honors .siriusignore patterns', () => {
    expect(shouldIgnore('vendor/lib.py', ['vendor'])).toBe(true);
    expect(shouldIgnore('vendor/lib.py', ['vendor/'])).toBe(true);
    expect(shouldIgnore('src/lib.py', ['vendor'])).toBe(false);
  });

  it('does not treat a prefix match as a directory match', () => {
    // "vendored" must not be swallowed by an ignore rule for "vendor".
    expect(shouldIgnore('vendored/lib.py', ['vendor'])).toBe(false);
  });
});
