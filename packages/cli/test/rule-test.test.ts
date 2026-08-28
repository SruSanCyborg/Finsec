/**
 * `rules test`, and the reason it was the last command still unimplemented.
 *
 * It answered "not implemented — needs a rule-execution endpoint", and that
 * reason had drifted from the truth. No endpoint would have helped: nothing
 * anywhere could *run* a rule document. The engine's rules are compiled
 * TypeScript matchers, and `rules validate` checks a YAML rule's structure
 * while explicitly disclaiming any opinion on whether its patterns match.
 *
 * The interesting property here is not how much of Semgrep it covers. It is
 * what happens at the edge of what it covers: a clause the interpreter cannot
 * execute has to be reported and has to fail the run. Silently returning "no
 * findings" for a pattern nobody ran is how an author reads a green result and
 * ships a rule that fires on nothing.
 */

import { describe, expect, it } from 'vitest';

import { runRuleDocument } from '../src/engine/rule-interpreter.js';

const run = (rule: string, source: string, path = 'probe.py') =>
  runRuleDocument(rule, { path, source });

describe('a regex rule', () => {
  const rule = `
rule:
  id: SIR-SEC-001
  match:
    regex: 'sk_live_[0-9a-zA-Z]{16,}'
`;

  it('fires on the line that matches and no other', async () => {
    const result = await run(
      rule,
      ['import os', 'KEY = "sk_live_51H8xR2eZvKYlo2Cexam"', 'SAFE = os.environ["KEY"]'].join('\n'),
    );
    expect(result.matches.map((m) => m.line)).toEqual([2]);
    expect(result.unsupported).toEqual([]);
  });

  it('tells the difference between a live key and a test key', async () => {
    const result = await run(rule, 'KEY = "sk_test_51H8xR2eZvKYlo2Cexam"');
    expect(result.matches).toEqual([]);
  });

  it('runs on a file the engine has no grammar for', async () => {
    // A pure-regex rule must not need a syntax tree — requiring one would make
    // config files unscannable by a rule that only ever wanted to read text.
    const result = await run(rule, 'key = sk_live_51H8xR2eZvKYlo2Cexam', 'settings.conf');
    expect(result.matches.map((m) => m.line)).toEqual([1]);
    expect(result.unsupported).toEqual([]);
  });
});

describe('an AST pattern, as the PRD writes them', () => {
  const rule = `
rule:
  id: SIR-SEC-010
  match:
    kind: ast
    pattern: |
      $CUR.execute("..." % $X)
`;

  it('separates a formatted query from a bound one', async () => {
    const result = await run(
      rule,
      [
        'def bound(cur, uid):',
        '    cur.execute("SELECT * FROM t WHERE id = %s", (uid,))',
        'def formatted(cur, uid):',
        `    cur.execute("SELECT * FROM t WHERE id = '%s'" % uid)`,
      ].join('\n'),
    );

    // Line 4 only. The bound call on line 2 passes its parameters separately,
    // which is the entire distinction the rule exists to make.
    expect(result.matches.map((m) => m.line)).toEqual([4]);
  });

  it('matches the f-string spelling of the same flaw', async () => {
    const either = `
rule:
  id: SIR-SEC-010
  match:
    pattern-either:
      - pattern: $CUR.execute("...")
`;
    const result = await run(either, 'cur.execute(f"SELECT * FROM t WHERE id = {uid}")');
    expect(result.matches.map((m) => m.line)).toEqual([1]);
  });
});

describe('entropy', () => {
  it('measures the literal, not the line', async () => {
    // A line of prose clears 3.5 bits comfortably. Measuring the whole line
    // would make the gate fire on every comment in the file.
    const rule = `
rule:
  id: SIR-SEC-002
  match:
    patterns:
      - entropy: { min_bits: 3.5 }
`;
    const result = await run(
      rule,
      ['# a perfectly ordinary sentence of explanatory prose', 'TOKEN = "kQ7xR2mZ9vB4nL6pT8wY3jH5"'].join('\n'),
    );
    expect(result.matches.map((m) => m.line)).toEqual([2]);
  });
});

describe('the edge of what it can run', () => {
  it('names a clause it cannot execute instead of passing it', async () => {
    const rule = `
rule:
  id: SIR-SEC-099
  match:
    patterns:
      - taint:
          sources: [request.args]
          sinks: [cur.execute]
`;
    const result = await run(rule, 'cur.execute(request.args["q"])');
    expect(result.matches).toEqual([]);
    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0]).toContain('taint');
  });

  it('refuses a pattern of nothing but metavariables', async () => {
    // `$X` matches every node in the file, which is never what an author meant
    // and would report a rule as working perfectly on any input at all.
    const result = await run('rule:\n  id: X\n  match:\n    pattern: $X\n', 'cur.execute(q)');
    expect(result.matches).toEqual([]);
    expect(result.unsupported).toHaveLength(1);
  });

  it('says so when the regex does not compile', async () => {
    const result = await run('rule:\n  id: X\n  match:\n    regex: "([unclosed"\n', 'anything');
    expect(result.unsupported[0]).toContain('does not compile');
    expect(result.matches).toEqual([]);
  });

  it('reports a document that is not a rule rather than finding nothing in it', async () => {
    expect((await run('just: a map\n', 'x = 1')).error).toContain('no `match:` clause');
    expect((await run('[unclosed\n', 'x = 1')).error).toContain('not valid YAML');
  });
});

describe('the committed example rules', () => {
  it('both run against their own fixtures', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const dir = join(here, '..', '..', '..', 'contract', 'fixtures', 'rules');

    for (const [rule, fixture, expected] of [
      ['hardcoded-key.yaml', 'hardcoded-key.py', [4]],
      ['sql.yaml', 'sql.py', [7]],
    ] as const) {
      const result = await runRuleDocument(readFileSync(join(dir, rule), 'utf8'), {
        path: join(dir, fixture),
        source: readFileSync(join(dir, fixture), 'utf8'),
      });
      expect(result.unsupported, rule).toEqual([]);
      expect(result.matches.map((m) => m.line), rule).toEqual(expected);
    }
  });
});
