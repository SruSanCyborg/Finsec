/**
 * Changing your mind, and reading back what you chose.
 *
 * The inline triage panel first shipped with the queue filtered to undecided
 * findings, which made every decision final the moment it was taken: the
 * finding left the queue and nothing could reach it again. Changing your mind
 * is the most ordinary thing to want to do while triaging a batch, and there
 * was no way to do it and no way to see what you had already said.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearTriage, loadTriage, recordTriage, triageKey } from '../src/engine/store.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-triage-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const finding = { rule_id: 'SIR-SEC-001', file: 'src/config.py', line: 14, fingerprint: 'fp-a' };
const decide = (state: 'accepted' | 'dismissed' | 'suppressed') =>
  recordTriage(dir, { ...finding, state, decided_at: new Date().toISOString() });

describe('a decision already taken', () => {
  it('is replaced rather than added to when it is taken again', () => {
    decide('accepted');
    const after = decide('dismissed');

    expect(after).toHaveLength(1);
    expect(after[0]?.state).toBe('dismissed');
  });

  it('can be read back, which is how you see what you chose', () => {
    decide('suppressed');
    const stored = loadTriage(dir);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ rule_id: 'SIR-SEC-001', state: 'suppressed' });
  });

  it('can be undone, leaving the finding open again', () => {
    // Undo is a real operation rather than "decide the other way". Accepted,
    // dismissed and suppressed are three claims, and none of them means "I have
    // not looked at this yet" — so without this a mis-keyed verdict is
    // permanent.
    decide('accepted');
    const after = clearTriage(dir, triageKey(finding));
    expect(after).toEqual([]);
    expect(loadTriage(dir)).toEqual([]);
  });

  it('leaves other findings alone when one is undone', () => {
    decide('accepted');
    recordTriage(dir, {
      rule_id: 'SIR-SEC-010',
      file: 'src/ledger.py',
      line: 88,
      fingerprint: 'fp-b',
      state: 'accepted',
      decided_at: new Date().toISOString(),
    });

    clearTriage(dir, triageKey(finding));
    expect(loadTriage(dir).map((entry) => entry.rule_id)).toEqual(['SIR-SEC-010']);
  });

  it('tracks a finding that moved down the file, by fingerprint', () => {
    // The whole reason `triageKey` prefers the fingerprint: a decision survives
    // the code being reformatted, and re-deciding still replaces rather than
    // duplicating.
    decide('accepted');
    const moved = recordTriage(dir, {
      ...finding,
      line: 41,
      state: 'dismissed',
      decided_at: new Date().toISOString(),
    });
    expect(moved).toHaveLength(1);
    expect(moved[0]?.line).toBe(41);
  });
});
