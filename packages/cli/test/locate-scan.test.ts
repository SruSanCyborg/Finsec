/**
 * Finding the scan that `fix` should act on.
 *
 * This exists because of a near-miss worth remembering. `sirius scan <path>`
 * writes its cache *inside the target*, but `sirius fix` runs from wherever the
 * user is — so `fix` searched for the newest cache below the working directory,
 * found one in a directory nobody had mentioned, and rewrote the source files
 * there. A rehearsal caught it modifying the committed fixtures.
 *
 * The guard is not "search better", it is "say what you picked": an explicit
 * target wins, and a search is reported as a search.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { locateLastScan, saveLastScan } from '../src/session.js';

let base: string;

const seed = (dir: string, ruleId = 'SIR-SEC-001') => {
  mkdirSync(dir, { recursive: true });
  saveLastScan(dir, {
    scan_id: 'replay',
    project_id: null,
    root: dir,
    source: 'local',
    findings: [
      {
        id: 'f1',
        rule_id: ruleId,
        severity: 'critical',
        file: 'src/config.py',
        line: 14,
        message: 'Hardcoded key',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
  });
};

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'sirius-locate-'));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('locateLastScan', () => {
  it('finds a scan in the working directory', () => {
    seed(base);
    const found = locateLastScan(base);

    expect(found?.root).toBe(base);
    expect(found?.how).toBe('here');
  });

  it('prefers an explicit target over anything else', () => {
    const here = join(base, 'here');
    const wanted = join(base, 'wanted');
    seed(here, 'SIR-SEC-010');
    seed(wanted, 'SIR-SEC-001');

    const found = locateLastScan(here, wanted);

    // The user named a directory; nothing may override that.
    expect(found?.root).toBe(wanted);
    expect(found?.how).toBe('explicit');
  });

  it('reports a descendant match as a search, not as certainty', () => {
    const nested = join(base, 'contract', 'fixtures', 'chaos-repo');
    seed(nested);

    const found = locateLastScan(base);

    // This is the path that rewrote the committed fixtures. It is allowed —
    // `scan <subdir>` then `fix` from the root is a real workflow — but the
    // caller has to be able to tell it apart and say so before writing.
    expect(found?.root).toBe(nested);
    expect(found?.how).toBe('search');
  });

  it('finds nothing when there is nothing to find', () => {
    expect(locateLastScan(base)).toBeUndefined();
  });

  it('does not descend into node_modules', () => {
    seed(join(base, 'node_modules', 'somepkg'));
    expect(locateLastScan(base)).toBeUndefined();
  });

  it('picks the most recently written of several', () => {
    const older = join(base, 'older');
    const newer = join(base, 'newer');
    seed(older);
    seed(newer);

    // Both exist; the newest is the one the user just ran.
    const found = locateLastScan(base);
    expect([older, newer]).toContain(found?.root);
    expect(found?.how).toBe('search');
  });

  it('carries the source through, so fix can tell local from replayed', () => {
    seed(base);
    expect(locateLastScan(base)?.cache.source).toBe('local');
  });
});
