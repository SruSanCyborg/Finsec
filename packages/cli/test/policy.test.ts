/**
 * Baselines and suppressions.
 *
 * Both commands wrote to a server that is not running, so neither did anything.
 * Worse, the two halves existed on either side of a gap nobody had bridged: the
 * gate already knew how to act on `baseline_state` and the renderers knew how
 * to show it, but nothing ever *set* it — so `sirius baseline set` recorded a
 * floor no scan ever read, and `--fail-on new` blocked on findings that were
 * not new.
 *
 * These are the features that decide whether a linter survives contact with an
 * existing codebase. A repo with four hundred findings cannot fix them today;
 * it can agree today is the floor. Get this wrong in the unsafe direction and
 * real findings vanish, so the tests lean on the cases where something must
 * *not* be silenced.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addSuppression,
  classify,
  findSuppression,
  isExpired,
  loadBaseline,
  loadSuppressions,
  matchesGlob,
  removeSuppression,
  saveBaseline,
} from '../src/engine/store.js';
import { applyPolicy, emptyPolicyOutcome } from '../src/engine/policy.js';
import type { WsFrame } from '../src/domain.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-policy-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const finding = (rule: string, file: string, fingerprint: string) =>
  ({
    type: 'finding',
    finding: { id: fingerprint, rule_id: rule, file, line: 1, severity: 'high', fingerprint },
  }) as unknown as WsFrame;

async function* stream(...frames: WsFrame[]): AsyncGenerator<WsFrame> {
  for (const f of frames) yield f;
}

const drain = async (source: AsyncIterable<WsFrame>) => {
  const out: WsFrame[] = [];
  for await (const f of source) out.push(f);
  return out;
};

describe('baseline', () => {
  it('round-trips through disk', () => {
    saveBaseline(dir, 'abc123', ['f1', 'f2']);
    const loaded = loadBaseline(dir);

    expect(loaded?.commit_sha).toBe('abc123');
    expect(loaded?.fingerprints).toEqual(['f1', 'f2']);
  });

  it('sorts and de-duplicates, so two baselines of one tree compare equal', () => {
    saveBaseline(dir, null, ['b', 'a', 'b']);
    expect(loadBaseline(dir)?.fingerprints).toEqual(['a', 'b']);
  });

  it('classifies against it', () => {
    const baseline = saveBaseline(dir, null, ['known']);

    expect(classify('known', baseline)).toBe('unchanged');
    expect(classify('other', baseline)).toBe('new');
  });

  it('calls everything new when there is no baseline', () => {
    // The safe direction: without a floor, nothing has been accepted yet.
    expect(classify('anything', undefined)).toBe('new');
  });

  it('calls a finding without a fingerprint new', () => {
    const baseline = saveBaseline(dir, null, ['known']);
    expect(classify(undefined, baseline)).toBe('new');
  });
});

describe('suppression matching', () => {
  const entry = (over: Partial<Parameters<typeof addSuppression>[1]>) => ({
    reason: 'because',
    expires_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  it('matches by rule id, case-insensitively', () => {
    const found = findSuppression({ rule_id: 'SIR-SEC-001', file: 'a.py' }, [
      entry({ rule_id: 'sir-sec-001' }),
    ]);
    expect(found).toBeDefined();
  });

  it('does not match a different rule', () => {
    const found = findSuppression({ rule_id: 'SIR-SEC-002', file: 'a.py' }, [
      entry({ rule_id: 'SIR-SEC-001' }),
    ]);
    expect(found).toBeUndefined();
  });

  it('requires every field set to match, not any', () => {
    // Narrowing a suppression must never widen it. OR-ing the fields would
    // make `--path tests/**` silence the rule everywhere.
    const found = findSuppression({ rule_id: 'SIR-SEC-001', file: 'src/pay.py' }, [
      entry({ rule_id: 'SIR-SEC-001', path_glob: 'tests/**' }),
    ]);
    expect(found).toBeUndefined();
  });

  it('matches a path glob', () => {
    const found = findSuppression({ rule_id: 'SIR-SEC-001', file: 'tests/fixtures/keys.py' }, [
      entry({ rule_id: 'SIR-SEC-001', path_glob: 'tests/**' }),
    ]);
    expect(found).toBeDefined();
  });

  it('ignores an entry with no criteria at all', () => {
    // An empty entry that matched everything would silence the whole tool.
    expect(findSuppression({ rule_id: 'SIR-SEC-001', file: 'a.py' }, [entry({})])).toBeUndefined();
  });

  it('stops suppressing once expired', () => {
    const lapsed = entry({ rule_id: 'SIR-SEC-001', expires_at: '2020-01-01T00:00:00.000Z' });

    expect(isExpired(lapsed)).toBe(true);
    expect(findSuppression({ rule_id: 'SIR-SEC-001', file: 'a.py' }, [lapsed])).toBeUndefined();
  });

  it('treats an unparseable expiry as permanent rather than silently lapsed', () => {
    expect(isExpired(entry({ expires_at: 'soon' }))).toBe(false);
  });
});

describe('glob matching', () => {
  it.each([
    ['tests/**', 'tests/a/b.py', true],
    ['tests/**', 'src/a.py', false],
    ['src/*.py', 'src/a.py', true],
    ['src/*.py', 'src/a/b.py', false],
    ['**/fixtures/**', 'a/fixtures/b.py', true],
  ])('%s vs %s', (pattern, path, expected) => {
    expect(matchesGlob(pattern, path)).toBe(expected);
  });
});

describe('the store on disk', () => {
  it('adds and removes', () => {
    addSuppression(dir, {
      rule_id: 'SIR-SEC-001',
      reason: 'fixture',
      expires_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(loadSuppressions(dir)).toHaveLength(1);

    expect(removeSuppression(dir, 'sir-sec-001').removed).toBe(1);
    expect(loadSuppressions(dir)).toHaveLength(0);
  });

  it('reads an absent store as empty rather than failing', () => {
    expect(loadSuppressions(dir)).toEqual([]);
  });
});

describe('applying policy to a stream', () => {
  it('marks findings against the baseline', async () => {
    saveBaseline(dir, 'abc', ['old']);
    const outcome = emptyPolicyOutcome();

    const frames = await drain(
      applyPolicy(stream(finding('SIR-SEC-010', 'a.py', 'old'), finding('SIR-SEC-010', 'b.py', 'fresh')), dir, outcome),
    );

    expect(frames.map((f) => (f as never as { finding: { baseline_state: string } }).finding.baseline_state)).toEqual([
      'unchanged',
      'new',
    ]);
    expect(outcome.unchanged).toBe(1);
  });

  it('withholds a suppressed finding entirely', async () => {
    addSuppression(dir, {
      rule_id: 'SIR-SEC-001',
      reason: 'fixture key',
      expires_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const outcome = emptyPolicyOutcome();

    const frames = await drain(
      applyPolicy(stream(finding('SIR-SEC-001', 'a.py', 'f1'), finding('SIR-SEC-010', 'b.py', 'f2')), dir, outcome),
    );

    // Withheld from the stream, not filtered later: a finding that is printed
    // and then silently uncounted is the worst of both.
    expect(frames).toHaveLength(1);
    expect(outcome.suppressed).toEqual([{ rule_id: 'SIR-SEC-001', file: 'a.py', reason: 'fixture key' }]);
  });

  it('reports a lapsed suppression instead of quietly re-firing', async () => {
    addSuppression(dir, {
      rule_id: 'SIR-SEC-001',
      reason: 'was temporary',
      expires_at: '2020-01-01T00:00:00.000Z',
      created_at: '2019-01-01T00:00:00.000Z',
    });
    const outcome = emptyPolicyOutcome();

    const frames = await drain(applyPolicy(stream(finding('SIR-SEC-001', 'a.py', 'f1')), dir, outcome));

    expect(frames).toHaveLength(1);
    expect(outcome.expired).toHaveLength(1);
  });

  it('passes non-finding frames through untouched', async () => {
    const outcome = emptyPolicyOutcome();
    const frames = await drain(
      applyPolicy(stream({ type: 'scan.started' } as WsFrame, { type: 'scan.completed' } as WsFrame), dir, outcome),
    );

    expect(frames.map((f) => f.type)).toEqual(['scan.started', 'scan.completed']);
  });
});

/**
 * The half of suppression nobody had bridged either: a withheld finding was
 * gone from the list and still present in every total. Suppressing a critical
 * left "2 critical" in the headline, its rupees in the money figure, and its
 * penalty in the compliance score — the one number a pipeline might gate on.
 */
describe('the completion frame after suppression', () => {
  const completed = () =>
    ({
      type: 'scan.completed',
      counts: { critical: 2, high: 1 },
      money_at_risk_inr: 8_930_000,
      compliance_score: 60,
      exit_code: 1,
    }) as unknown as WsFrame;

  const critical = (fingerprint: string, money: number) =>
    ({
      type: 'finding',
      finding: {
        id: fingerprint,
        rule_id: 'SIR-SEC-001',
        file: 'a.py',
        line: 1,
        severity: 'critical',
        fingerprint,
        money_at_risk_inr: money,
      },
    }) as unknown as WsFrame;

  const suppressEverythingFor = (rule: string) =>
    addSuppression(dir, {
      rule_id: rule,
      reason: 'test fixture',
      expires_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });

  it('takes the withheld finding out of the counts and the money', async () => {
    suppressEverythingFor('SIR-SEC-001');
    const outcome = emptyPolicyOutcome();

    const frames = await drain(
      applyPolicy(
        stream({ type: 'file.scanning' } as WsFrame, critical('f1', 4_200_000), completed()),
        dir,
        outcome,
      ),
    );

    const end = frames.at(-1) as { counts: Record<string, number>; money_at_risk_inr: number };
    expect(end.counts).toEqual({ critical: 1, high: 1 });
    expect(end.money_at_risk_inr).toBe(4_730_000);
  });

  it('recomputes the compliance score rather than leaving the old one', async () => {
    suppressEverythingFor('SIR-SEC-001');
    const outcome = emptyPolicyOutcome();

    const frames = await drain(
      applyPolicy(stream({ type: 'file.scanning' } as WsFrame, critical('f1', 0), completed()), dir, outcome),
    );

    const end = frames.at(-1) as { compliance_score: number };
    // Whatever the number is, it must not still be the one computed with the
    // suppressed finding included.
    expect(end.compliance_score).toBeGreaterThan(60);
  });

  it('leaves the frame alone when nothing was suppressed', async () => {
    const outcome = emptyPolicyOutcome();
    const frames = await drain(applyPolicy(stream(critical('f1', 4_200_000), completed()), dir, outcome));

    expect(frames.at(-1)).toMatchObject({
      counts: { critical: 2, high: 1 },
      money_at_risk_inr: 8_930_000,
      compliance_score: 60,
    });
  });

  it('drops the advisory exit code to 0 once everything is suppressed', async () => {
    suppressEverythingFor('SIR-SEC-001');
    const outcome = emptyPolicyOutcome();

    const frames = await drain(
      applyPolicy(
        stream(
          { type: 'file.scanning' } as WsFrame,
          critical('f1', 0),
          ({
            type: 'scan.completed',
            counts: { critical: 1 },
            money_at_risk_inr: 0,
            compliance_score: 88,
            exit_code: 1,
          }) as unknown as WsFrame,
        ),
        dir,
        outcome,
      ),
    );

    expect(frames.at(-1)).toMatchObject({ counts: {}, exit_code: 0 });
  });
});
