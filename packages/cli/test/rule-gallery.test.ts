/**
 * Every shipped rule, demonstrated on real source.
 *
 * Six of the twelve rules had no example anywhere: nothing in the demo fixture
 * tripped SIR-SEC-002, 011, 021, 031, 040 or 041, so they were shipped, unit
 * tested against hand-written snippets, and never once run end to end. That is
 * the same shape as the seven features that were listed Done while being
 * unreachable — a thing that works in the test that asserts it and nowhere else.
 *
 * The gallery fixture exists to close that. One planted flaw per rule, each
 * sitting beside a correct counterpart doing the same job, so the fixture proves
 * two things at once: the rule fires, and it does not fire on the code a team
 * would have written instead.
 *
 * It found three defects the moment it was pointed at the engine, all recorded
 * as tests below: SIR-SEC-021 missed PyJWT's documented idiom, SIR-SEC-030
 * flagged a PCI-permitted last-four, and SIR-SEC-031 counted one flaw twice.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { scanDirectory } from '../src/engine/scanner.js';
import { RULES } from '../src/engine/rules.js';
import type { Finding, WsFrame } from '../src/domain.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const GALLERY = join(repo, 'contract', 'fixtures', 'rule-gallery');
const CHAOS = join(repo, 'contract', 'fixtures', 'chaos-repo');
const REPLAY = join(repo, 'contract', 'fixtures', 'demo.jsonl');

async function scan(root: string) {
  const findings: Finding[] = [];
  let completed: (WsFrame & { type: 'scan.completed' }) | undefined;
  for await (const frame of scanDirectory(root)) {
    if (frame.type === 'finding' && frame.finding) findings.push(frame.finding);
    if (frame.type === 'scan.completed') completed = frame as never;
  }
  return { findings, completed: completed as NonNullable<typeof completed> };
}

const gallery = await scan(GALLERY);
/** Findings in one fixture file, in line order — rules run in catalogue order. */
const at = (file: string) =>
  gallery.findings.filter((f) => f.file.endsWith(file)).sort((a, b) => a.line - b.line);

describe('the rule gallery', () => {
  it('fires every rule the engine ships', () => {
    const fired = new Set(gallery.findings.map((f) => f.rule_id));
    const silent = RULES.map((rule) => rule.id).filter((id) => !fired.has(id));

    // A rule with no example is a rule nobody has watched run.
    expect(silent).toEqual([]);
  });

  it('plants the examples it says it plants, and no others', () => {
    const counts = new Map<string, number>();
    for (const finding of gallery.findings) {
      counts.set(finding.rule_id, (counts.get(finding.rule_id) ?? 0) + 1);
    }

    // Counted explicitly rather than "one each", because three rules honestly
    // have more than one example and a blanket rule would hide which.
    const expected: Record<string, number> = {
      'SIR-SEC-001': 1,
      'SIR-SEC-002': 1,
      // The shape case in injection.py, plus two in taint.py: one traced from
      // the request across three statements, and one coerced by `int()` that is
      // still reported because no proven path is not a proof of safety.
      'SIR-SEC-010': 3,
      // The shape case, and the same flaw traced to `request.form`.
      'SIR-SEC-011': 2,
      'SIR-SEC-020': 1,
      'SIR-SEC-021': 1,
      'SIR-SEC-030': 1,
      'SIR-SEC-031': 1,
      'SIR-SEC-040': 1,
      'SIR-SEC-041': 1,
      'SIR-SEC-050': 1,
      'SIR-SEC-051': 1,
      // An install hook, two non-registry dependencies and a floating pin:
      // four different supply-chain facts under one rule id.
      'SIR-SEC-060': 4,
    };

    for (const [id, n] of counts) {
      expect(n, `${id} fired ${n} times`).toBe(expected[id]);
    }
  });

  it('proves the path when it can, and says nothing when it cannot', () => {
    // The whole difference between "there is an interpolation on this line" and
    // "an attacker controls this string". A finding that claims a trace must
    // carry one, and one that has no trace must not imply safety.
    const traced = gallery.findings.filter((f) => (f as { taint?: string }).taint);
    expect(traced.length).toBe(2);

    for (const finding of traced) {
      expect(finding.message).toContain('attacker-controlled');
      const path = (finding as { taint?: string }).taint as string;
      // Source, then every assignment it passed through, in order.
      expect(path).toMatch(/^HTTP request: /);
      expect(path.split('\u2192').length).toBeGreaterThan(1);
      expect(path).toMatch(/line \d+/);
    }
  });

  it('does not flag a query built from a module constant', () => {
    // `f"SELECT count(*) FROM {LEDGER_TABLE}"` was reported as attacker-
    // controlled SQL on a line where nothing an attacker touches appears.
    const sql = at('taint.py').filter((f) => f.rule_id === 'SIR-SEC-010');
    expect(sql.map((f) => f.line)).not.toContain(27);
  });

  it('leaves the correct counterpart in each file alone', () => {
    // Each fixture file pairs a flaw with the right way to do the same job. If
    // a rule flagged both, its false-positive rate is 50% on the one sample we
    // have, and the "one example each" assertion above would already fail — so
    // this pins the specific lines, which is what makes a regression readable.
    expect(at('secrets.py').map((f) => f.line)).toEqual([9, 12]); // not 6, not 15
    expect(at('injection.py').map((f) => f.line)).toEqual([14, 25]); // not 9, not 20
    expect(at('crypto.py').map((f) => f.line)).toEqual([9, 19]); // not 7, not 15
    expect(at('pii.py').map((f) => f.line)).toEqual([16, 26]); // not 11, not 23
  });

  it('reads a dependency manifest, which has no syntax tree', () => {
    const manifests = gallery.findings.filter(
      (f) => f.file.endsWith('package.json') || f.file.endsWith('requirements.txt'),
    );
    expect(manifests).toHaveLength(4);
    expect(manifests.every((f) => f.rule_id === 'SIR-SEC-060')).toBe(true);
    // The location has to be real: a finding that cannot point at a line is a
    // finding nobody can act on.
    expect(manifests.every((f) => f.line > 0 && Boolean(f.snippet))).toBe(true);
  });
});

describe('the three defects the gallery found', () => {
  it('SIR-SEC-021 catches PyJWT\'s documented idiom, not just the bare flag', () => {
    // `options={"verify_signature": False}` — a dict key, so the name is
    // followed by a quote before the colon. The rule matched `verify=False`
    // only, which is the spelling almost nobody writes.
    const jwt = gallery.findings.filter((f) => f.rule_id === 'SIR-SEC-021');
    expect(jwt).toHaveLength(1);
    expect(jwt[0]?.line).toBe(30);
    // Truncated, because redaction runs over every snippet before it leaves the
    // process and does not make an exception for a string that happens to be
    // harmless. Asserting the whole word here would be asserting a leak.
    expect(jwt[0]?.snippet).toContain('verify_signa');
  });

  it('SIR-SEC-030 accepts a truncated PAN, which PCI-DSS 3.3.1 permits', () => {
    const logs = gallery.findings.filter((f) => f.rule_id === 'SIR-SEC-030');
    expect(logs).toHaveLength(1);
    // The permitted form is on line 11 and must not be the one reported.
    expect(logs[0]?.line).toBe(16);
    expect(logs[0]?.snippet).not.toContain('[-4:]');
  });

  it('counts one flaw once, however many nodes match it', () => {
    // A class-body assignment is both an assignment and the statement wrapping
    // one, and SIR-SEC-031 matched both — two findings sharing a fingerprint,
    // counted twice in the totals and twice in the money, collapsing to one row
    // in every baseline. Two findings with one fingerprint are one finding.
    const seen = new Set(gallery.findings.map((f) => f.fingerprint));
    expect(seen.size).toBe(gallery.findings.length);
  });
});

describe('the demo replay and the engine', () => {
  const replayed = new Set<string>();
  for (const line of readFileSync(REPLAY, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const frame = JSON.parse(line) as WsFrame;
    if (frame.type === 'finding' && frame.finding) replayed.add(frame.finding.rule_id);
  }
  const shipped = new Set(RULES.map((rule) => rule.id));

  it('never claims a rule the engine does not have', () => {
    // SIR-SEC-060 was in the replay and in the PRD's rule table and in no build:
    // `--replay` showed a supply-chain finding a live scan could not produce.
    // Which is the demo asserting a capability the product did not have.
    const claimed = [...replayed].filter((id) => !shipped.has(id)).sort();
    expect(claimed).toEqual([]);
  });

  it('is a different repository from the chaos repo, and the numbers say so', async () => {
    // Worth pinning because the two get compared. The replay describes a
    // sixteen-file fictional codebase; the chaos repo is three real files. They
    // are not two readings of one scan and will never agree.
    const chaos = await scan(CHAOS);
    expect(chaos.findings.length).toBeLessThan(replayed.size + 10);
    expect(chaos.completed.money_at_risk_inr).toBe(8_930_000);
    expect(chaos.completed.compliance_score).toBe(60);
  });
});
