/**
 * Triage with no backend.
 *
 * `triage` was written as a pure client and never revisited: it read findings
 * from the API and PATCHed each decision back. With no project configured —
 * which is what `sirius scan .` defaults to — it refused to open at all,
 * reporting the local scan it found as "a replay".
 *
 * The risk in fixing that is recording a judgement nothing acts on. So these
 * tests care less about the file format than about the two ends meeting: a
 * dismissal must produce a suppression narrow enough to silence that finding
 * and nothing else, and an acceptance must not silence anything at all.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { localBackend } from '../src/commands/triage.js';
import { loadSuppressions, loadTriage, triageKey } from '../src/engine/store.js';
import type { CachedFinding, LastScan } from '../src/session.js';
import type { Finding } from '../src/domain.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-triage-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const cached = (overrides: Partial<CachedFinding> = {}): CachedFinding => ({
  id: 'local-00000001',
  rule_id: 'SIR-SEC-001',
  file: 'src/config.py',
  line: 14,
  severity: 'critical',
  message: 'Hardcoded Stripe secret key',
  compliance_ref: ['PCI-DSS:8.6.2'],
  money_at_risk_inr: 4_200_000,
  fingerprint: 'fp-001',
  category: 'secrets',
  ...overrides,
});

const scan = (findings: CachedFinding[]): LastScan => ({
  schema_version: 2,
  scan_id: 'local-abc123abc123',
  project_id: null,
  scanned_at: '2026-08-23T00:00:00.000Z',
  root: dir,
  source: 'local',
  findings,
});

describe('the local triage backend', () => {
  it('offers the last scan\'s findings without asking a server', async () => {
    const backend = await localBackend({}, dir, scan([cached(), cached({ id: 'local-00000002', fingerprint: 'fp-002' })]));
    expect(backend.findings).toHaveLength(2);
    expect(backend.findings[0]?.message).toBe('Hardcoded Stripe secret key');
  });

  it('fills a message and category in from the rule catalogue when the cache has none', async () => {
    const backend = await localBackend({}, dir, scan([cached({ message: undefined, category: undefined })]));

    // Not invented: SIR-SEC-001 is compiled into this binary and says both.
    expect(backend.findings[0]?.message).toBeTruthy();
    expect(backend.findings[0]?.category).toBe('secrets');
  });

  it('records an acceptance and suppresses nothing — an acknowledged risk still fails the gate', async () => {
    const backend = await localBackend({}, dir, scan([cached()]));
    await backend.decide(backend.findings[0] as Finding, 'accepted');

    expect(loadTriage(dir)).toMatchObject([{ rule_id: 'SIR-SEC-001', state: 'accepted' }]);
    expect(loadSuppressions(dir)).toHaveLength(0);
  });

  it('turns a dismissal into a suppression the next scan will honor', async () => {
    const backend = await localBackend({}, dir, scan([cached()]));
    await backend.decide(backend.findings[0] as Finding, 'dismissed', 'test fixture, not a live key');

    expect(loadTriage(dir)).toMatchObject([{ state: 'dismissed', reason: 'test fixture, not a live key' }]);
    expect(loadSuppressions(dir)).toMatchObject([
      { rule_id: 'SIR-SEC-001', fingerprint: 'fp-001', reason: 'test fixture, not a live key' },
    ]);
  });

  it('scopes the suppression to the one finding, never the whole rule', async () => {
    const backend = await localBackend({}, dir, scan([cached()]));
    await backend.decide(backend.findings[0] as Finding, 'suppressed', 'rotating on Friday');

    // With a fingerprint it pins that finding; the same rule elsewhere in the
    // repo is untouched. Without one it falls back to this file, not the repo.
    expect(loadSuppressions(dir)[0]?.fingerprint).toBe('fp-001');
    expect(loadSuppressions(dir)[0]?.path_glob).toBeUndefined();
  });

  it('falls back to the file when the finding has no fingerprint', async () => {
    const backend = await localBackend({}, dir, scan([cached({ fingerprint: undefined })]));
    await backend.decide(backend.findings[0] as Finding, 'dismissed', 'generated code');

    expect(loadSuppressions(dir)[0]).toMatchObject({ rule_id: 'SIR-SEC-001', path_glob: 'src/config.py' });
    expect(loadSuppressions(dir)[0]?.fingerprint).toBeUndefined();
  });

  it('hides what has already been decided, and shows it again with --all', async () => {
    const first = await localBackend({}, dir, scan([cached(), cached({ id: 'local-2', fingerprint: 'fp-002' })]));
    await first.decide(first.findings[0] as Finding, 'accepted');

    const second = await localBackend({}, dir, scan([cached(), cached({ id: 'local-2', fingerprint: 'fp-002' })]));
    expect(second.findings.map((f) => f.fingerprint)).toEqual(['fp-002']);

    const all = await localBackend({ all: true }, dir, scan([cached(), cached({ id: 'local-2', fingerprint: 'fp-002' })]));
    expect(all.findings).toHaveLength(2);
    expect(all.findings[0]?.triage_state).toBe('accepted');
  });

  it('replaces an earlier decision about the same finding rather than stacking them', async () => {
    const backend = await localBackend({}, dir, scan([cached()]));
    await backend.decide(backend.findings[0] as Finding, 'accepted');
    await backend.decide(backend.findings[0] as Finding, 'dismissed', 'changed my mind');

    expect(loadTriage(dir)).toHaveLength(1);
    expect(loadTriage(dir)[0]?.state).toBe('dismissed');
  });

  it('filters by severity', async () => {
    const backend = await localBackend(
      { severity: 'high' },
      dir,
      scan([cached(), cached({ id: 'local-2', fingerprint: 'fp-002', severity: 'high' })]),
    );

    expect(backend.findings.map((f) => f.severity)).toEqual(['high']);
  });
});

describe('triageKey', () => {
  it('follows the fingerprint, so a decision survives the code moving', () => {
    const before = { rule_id: 'SIR-SEC-001', file: 'a.py', line: 14, fingerprint: 'fp-001' };
    const after = { ...before, line: 92 };
    expect(triageKey(before)).toBe(triageKey(after));
  });

  it('falls back to rule and location when there is no fingerprint', () => {
    expect(triageKey({ rule_id: 'SIR-SEC-001', file: 'a.py', line: 14 })).toBe('SIR-SEC-001@a.py:14');
  });
});
