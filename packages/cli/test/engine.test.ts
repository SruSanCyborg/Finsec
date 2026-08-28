/**
 * The detection engine.
 *
 * The claim this file has to defend is that findings come from a syntax tree
 * rather than a regex. The load-bearing test is `ledger.py`: it contains five
 * `execute()` calls, four of which pass bound parameters correctly and one of
 * which interpolates. A grep for `execute(` flags all five. Anything that
 * cannot tell them apart is not a scanner.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseFile, parseSource, languageOf } from '../src/engine/parse.js';
import { runRules, shannonEntropy } from '../src/engine/rules.js';
import { collectFiles, complianceScore, fingerprint, redact, scanDirectory } from '../src/engine/scanner.js';
import { buildAttackPaths, extractCredential, extractSearchablePrefix } from '../src/engine/threat.js';
import type { Finding, WsFrame } from '../src/domain.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CHAOS = join(REPO, 'contract', 'fixtures', 'chaos-repo');

let scratch: string;
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'sirius-engine-'));
});
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function write(name: string, source: string): string {
  const path = join(scratch, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source, 'utf8');
  return path;
}

async function findingsFor(name: string, source: string) {
  const parsed = await parseFile(write(name, source));
  expect(parsed).toBeDefined();
  return runRules(parsed!);
}

describe('parsing', () => {
  it('recognises the languages it can scan', () => {
    expect(languageOf('a.py')).toBe('python');
    expect(languageOf('a.ts')).toBe('typescript');
    expect(languageOf('a.go')).toBe('go');
    expect(languageOf('a.md')).toBeUndefined();
  });

  it('produces a real syntax tree, not a line split', async () => {
    const parsed = await parseFile(write('t.py', 'x = 1 + 2\n'));
    expect(parsed?.root.type).toBe('module');
    expect(parsed?.root.childCount).toBeGreaterThan(0);
  });
});

describe('SQL injection — the AST claim', () => {
  it('flags interpolation and leaves bound parameters alone', async () => {
    const findings = await findingsFor(
      'db.py',
      [
        'def a(cur, uid):',
        '    cur.execute("SELECT * FROM t WHERE id = %s", (uid,))',
        '    cur.execute("SELECT * FROM t WHERE id = %s" % uid)',
        '    cur.execute("SELECT * FROM t WHERE id = " + uid)',
        '    cur.execute(f"SELECT * FROM t WHERE id = {uid}")',
        '    cur.execute("SELECT 1")',
        '',
      ].join('\n'),
    );

    const sql = findings.filter((f) => f.rule_id === 'SIR-SEC-010');
    // Lines 3, 4 and 5 interpolate. Lines 2 and 6 do not.
    expect(sql.map((f) => f.line).sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });

  it('does not flag the real fixture\'s correct queries', async () => {
    const parsed = await parseFile(join(CHAOS, 'src', 'ledger.py'));
    const sql = runRules(parsed!).filter((f) => f.rule_id === 'SIR-SEC-010');
    expect(sql).toHaveLength(1);
    expect(sql[0]?.line).toBe(88);
  });
});

describe('secrets', () => {
  it('finds a provider key by its prefix', async () => {
    const findings = await findingsFor('c.py', 'KEY = "sk_live_51H8xR2eZvAAAAAAAAAA"\n');
    expect(findings.some((f) => f.rule_id === 'SIR-SEC-001')).toBe(true);
  });

  it('ignores an ordinary string of the same length', async () => {
    const findings = await findingsFor('c.py', 'GREETING = "hello there, this is not a secret"\n');
    expect(findings.filter((f) => f.category === 'secrets')).toHaveLength(0);
  });

  it('needs a credential-shaped name before entropy counts', async () => {
    const noisy = 'CHECKSUM = "a8f5f167f44f4964e6c998dee827110c"\n';
    const named = 'API_SECRET = "a8f5f167f44f4964e6c998dee827110c"\n';

    expect((await findingsFor('a.py', noisy)).filter((f) => f.rule_id === 'SIR-SEC-002')).toHaveLength(0);
    expect((await findingsFor('b.py', named)).filter((f) => f.rule_id === 'SIR-SEC-002')).toHaveLength(1);
  });

  it('measures entropy sensibly', () => {
    expect(shannonEntropy('aaaaaaaa')).toBeLessThan(1);
    expect(shannonEntropy('a8f5f167f44f4964e6c998de')).toBeGreaterThan(3);
  });
});

describe('other rules', () => {
  it('flags an unverified JWT but not a verified one', async () => {
    const bad = await findingsFor('a.py', 'jwt.decode(token, verify=False)\n');
    const good = await findingsFor('b.py', 'jwt.decode(token, key, algorithms=["RS256"])\n');
    expect(bad.some((f) => f.rule_id === 'SIR-SEC-021')).toBe(true);
    expect(good.some((f) => f.rule_id === 'SIR-SEC-021')).toBe(false);
  });

  it('flags PII in logs, including dictionary access', async () => {
    const findings = await findingsFor('a.py', 'log.info("card %s", card.get("number"))\n');
    expect(findings.some((f) => f.rule_id === 'SIR-SEC-030')).toBe(true);
  });

  it('leaves ordinary logging alone', async () => {
    const findings = await findingsFor('a.py', 'log.info("processed %s orders", count)\n');
    expect(findings.filter((f) => f.rule_id === 'SIR-SEC-030')).toHaveLength(0);
  });

  it('flags plain HTTP but not localhost', async () => {
    const remote = await findingsFor('a.py', 'URL = "http://payments.example.com/v1"\n');
    const local = await findingsFor('b.py', 'URL = "http://localhost:8000/v1"\n');
    expect(remote.some((f) => f.rule_id === 'SIR-SEC-041')).toBe(true);
    expect(local.some((f) => f.rule_id === 'SIR-SEC-041')).toBe(false);
  });

  it('flags a weak hash but not a strong one', async () => {
    const weak = await findingsFor('a.py', 'h = hashlib.md5(data).hexdigest()\n');
    const strong = await findingsFor('b.py', 'h = hashlib.sha256(data).hexdigest()\n');
    expect(weak.some((f) => f.rule_id === 'SIR-SEC-040')).toBe(true);
    expect(strong.some((f) => f.rule_id === 'SIR-SEC-040')).toBe(false);
  });
});

describe('scanning a tree', () => {
  it('skips vendored and build directories', () => {
    write('src/a.py', 'x = 1\n');
    write('node_modules/pkg/b.py', 'y = 2\n');
    write('dist/c.py', 'z = 3\n');

    const files = collectFiles(scratch);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/src\/a\.py$/);
  });

  it('honors an inline sirius-ignore', async () => {
    const source = [
      'KEY = "sk_live_51H8xR2eZvAAAAAAAAAA"  # sirius-ignore: SIR-SEC-001',
      '',
    ].join('\n');
    write('src/x.py', source);

    const findings: Finding[] = [];
    for await (const frame of scanDirectory(scratch)) {
      if (frame.type === 'finding') findings.push(frame.finding);
    }
    expect(findings.filter((f) => f.rule_id === 'SIR-SEC-001')).toHaveLength(0);
  });

  it('emits the same frame sequence the API does', async () => {
    write('src/x.py', 'KEY = "sk_live_51H8xR2eZvAAAAAAAAAA"\n');
    const types: string[] = [];
    for await (const frame of scanDirectory(scratch)) types.push((frame as WsFrame).type);

    expect(types[0]).toBe('scan.started');
    expect(types).toContain('file.scanning');
    expect(types).toContain('finding');
    expect(types.at(-1)).toBe('scan.completed');
  });

  it('finds every planted vulnerability in the chaos repo', async () => {
    const found = new Map<string, number>();
    for await (const frame of scanDirectory(CHAOS)) {
      if (frame.type === 'finding') found.set(frame.finding.rule_id, frame.finding.line);
    }

    expect(found.get('SIR-SEC-001')).toBe(14); // src/config.py
    expect(found.get('SIR-SEC-010')).toBe(88); // src/ledger.py
    expect(found.get('SIR-SEC-030')).toBe(52); // src/webhooks.py
  });
});

describe('supporting behaviour', () => {
  it('redacts a secret literal at detection, not display', () => {
    const out = redact('KEY = "sk_live_51H8xR2eZvNOTAREALKE"');
    expect(out).not.toContain('NOTAREALKEY');
    expect(out).toContain('…');
  });

  it('fingerprints stably, and independently of line number', () => {
    const a = fingerprint('SIR-SEC-001', 'src/c.py', 'KEY = "x"');
    const b = fingerprint('SIR-SEC-001', 'src/c.py', '  KEY  =  "x"  ');
    expect(a).toBe(b);
    expect(a).not.toBe(fingerprint('SIR-SEC-001', 'src/other.py', 'KEY = "x"'));
  });

  it('scores a clean codebase at 100 and a bad one lower', () => {
    expect(complianceScore({}, 50)).toBe(100);
    expect(complianceScore({ critical: 3 }, 50)).toBeLessThan(100);
    expect(complianceScore({ critical: 3 }, 50)).toBeLessThan(complianceScore({ low: 3 }, 50));
  });
});

describe('threat stage', () => {
  const finding = (over: Partial<Finding>): Finding =>
    ({
      id: Math.random().toString(36),
      file: 'a.py',
      line: 1,
      severity: 'high',
      rule_id: 'X',
      category: 'secrets',
      message: 'm',
      ...over,
    }) as Finding;

  it('chains a leaked credential to exposed cardholder data', () => {
    const paths = buildAttackPaths([
      finding({ category: 'secrets', rule_id: 'SIR-SEC-001', validity: 'verified_live' }),
      finding({ category: 'logging', rule_id: 'SIR-SEC-030' }),
    ]);

    expect(paths[0]?.id).toBe('AP-1');
    expect(paths[0]?.severity).toBe('critical');
    expect(paths[0]?.steps).toHaveLength(2);
  });

  it('rates a live credential above a merely leaked one', () => {
    const live = buildAttackPaths([
      finding({ category: 'secrets', validity: 'verified_live' }),
      finding({ category: 'logging' }),
    ]);
    const leaked = buildAttackPaths([
      finding({ category: 'secrets', validity: 'unknown' }),
      finding({ category: 'logging' }),
    ]);

    expect(live[0]?.severity).toBe('critical');
    expect(leaked[0]?.severity).toBe('high');
    expect(live[0]!.money_at_risk_inr).toBeGreaterThan(leaked[0]!.money_at_risk_inr);
  });

  it('builds no path from a single unrelated finding', () => {
    expect(buildAttackPaths([finding({ category: 'crypto' })])).toEqual([]);
  });

  it('recognises credentials it can probe', () => {
    expect(extractCredential('KEY = "sk_live_51H8xR2eZvAAAAAAAAAA"')?.probe.name).toBe('stripe');
    expect(extractCredential('x = "hello"')).toBeUndefined();
  });

  it('searches history with the surviving prefix, never the whole secret', () => {
    const prefix = extractSearchablePrefix('KEY = "sk_live_51H8…"');
    expect(prefix).toBe('sk_live_51H8');
    expect(prefix).not.toContain('…');
  });
});

/**
 * Test-mode credentials, rated by what someone holding one can do.
 *
 * The exposure model already priced a Stripe test key at a hundredth of a live
 * key — and the rule rated it `critical` anyway, so severity and money
 * disagreed by two orders of magnitude on the same finding. Severity is what
 * the gate acts on, so a test fixture failed a build exactly as hard as a
 * credential that can move ₹42 lakh. That is how a linter gets switched off.
 */
describe('test-mode keys are still findings, at their real blast radius', () => {
  const scan = async (source: string) => {
    const parsed = await parseSource('keys.py', source);
    return runRules(parsed as never).filter((finding) => finding.rule_id === 'SIR-SEC-001');
  };

  it('still reports a Stripe test key — it is a credential in source', async () => {
    const found = await scan('KEY = "sk_test_51H8xR2eZvKYlo2Cexam"\n');
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('test');
  });

  it('rates it medium, not critical', async () => {
    const found = await scan('KEY = "sk_test_51H8xR2eZvKYlo2Cexam"\n');
    expect(found[0]?.severity).toBe('medium');
  });

  it('keeps a live key critical', async () => {
    const found = await scan('KEY = "sk_live_51H8xR2eZvKYlo2Cexam"\n');
    expect(found[0]?.severity).toBe('critical');
  });

  it('prices the two at least an order of magnitude apart', async () => {
    const live = await scan('KEY = "sk_live_51H8xR2eZvKYlo2Cexam"\n');
    const test = await scan('KEY = "sk_test_51H8xR2eZvKYlo2Cexam"\n');
    const liveMoney = live[0]?.money_at_risk_inr ?? 0;
    const testMoney = test[0]?.money_at_risk_inr ?? 1;
    expect(liveMoney / testMoney).toBeGreaterThan(10);
  });

  it('tells a Razorpay live key from a test one', async () => {
    // One pattern used to match both, so a test key was priced as a money-mover.
    const live = await scan('KEY = "rzp_live_ABCdefGHI1234567"\n');
    const test = await scan('KEY = "rzp_test_ABCdefGHI1234567"\n');
    expect(live[0]?.severity).toBe('critical');
    expect(test[0]?.severity).toBe('medium');
    expect(live[0]?.money_at_risk_inr).toBeGreaterThan(test[0]?.money_at_risk_inr ?? 0);
  });

  it('says why in the message, rather than leaving a reader to infer it', async () => {
    const found = await scan('KEY = "sk_test_51H8xR2eZvKYlo2Cexam"\n');
    expect(found[0]?.message).toMatch(/no money moves/);
  });
});
