/**
 * Dataflow, and the two mistakes a shape-matching injection rule makes.
 *
 * The rule matched an interpolation inside the argument of an `execute` call.
 * That shape is neither necessary — real injection is written across
 * statements, and there is nothing to match at the sink — nor sufficient, since
 * interpolating a module constant is not an injection at all.
 *
 * The direction of caution is the important property here, and it is asserted
 * below: the analysis *adds* proof where it can and never withdraws a finding
 * on the strength of having found none. It is intra-procedural, so a value
 * arriving through another function is real taint it simply cannot follow, and
 * treating that silence as safety would turn a scanner into a rubber stamp.
 */

import { describe, expect, it } from 'vitest';

import { parseSource } from '../src/engine/parse.js';
import { analyzeTaint, describePath } from '../src/engine/taint.js';
import { runRules } from '../src/engine/rules.js';

const scan = async (source: string) => {
  const file = await parseSource('probe.py', source);
  if (!file) throw new Error('probe.py did not parse');
  return runRules(file);
};

const sql = (findings: Awaited<ReturnType<typeof scan>>) =>
  findings.filter((f) => f.rule_id === 'SIR-SEC-010');

describe('what the shape rule missed', () => {
  it('follows a request value across three statements to the query', async () => {
    const findings = sql(
      await scan(
        [
          'def search(cur):',
          '    account = request.args["account"]',
          '    q = "SELECT * FROM ledger WHERE account = \'%s\'" % account',
          '    cur.execute(q)',
        ].join('\n'),
      ),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('attacker-controlled');
    expect(findings[0]?.taint).toContain('request.args');
    expect(findings[0]?.taint).toContain('line 2');
    expect(findings[0]?.taint).toContain('line 3');
  });

  it('follows it into a shell command too', async () => {
    const findings = (
      await scan(
        [
          'import subprocess',
          'def export():',
          '    account = request.form["account"]',
          '    path = "/var/statements/%s.csv" % account',
          '    subprocess.run("gzip " + path, shell=True)',
        ].join('\n'),
      )
    ).filter((f) => f.rule_id === 'SIR-SEC-011');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.taint).toContain('request.form');
  });

  it('reports the hops in the order the value took them', async () => {
    const file = await parseSource(
      'probe.py',
      ['def f():', '    a = request.args["x"]', '    b = a + "!"', '    c = b + "?"'].join('\n'),
    );
    const table = analyzeTaint(file!);
    const path = table.at(4, 'c');

    expect(path).toBeDefined();
    expect(path?.steps.map((step) => step.line)).toEqual([2, 3, 4]);
    expect(describePath(path!)).toMatch(/^HTTP request: /);
  });
});

describe('what the shape rule flagged and should not have', () => {
  it('leaves a query built from a module constant alone', async () => {
    const findings = sql(
      await scan(
        ['TABLE = "settlements"', 'def report(cur):', '    cur.execute(f"SELECT count(*) FROM {TABLE}")'].join('\n'),
      ),
    );
    expect(findings).toEqual([]);
  });

  it('still flags it once that constant is not a constant', async () => {
    // Bound twice, so it is a variable with a literal in it, not a constant —
    // and the second binding is exactly where an attacker would want to be.
    const findings = sql(
      await scan(
        [
          'TABLE = "settlements"',
          'def setup():',
          '    global TABLE',
          '    TABLE = request.args["t"]',
          'def report(cur):',
          '    cur.execute(f"SELECT count(*) FROM {TABLE}")',
        ].join('\n'),
      ),
    );
    expect(findings).toHaveLength(1);
  });
});

describe('the direction of caution', () => {
  it('keeps a finding it cannot prove, rather than clearing it', async () => {
    // The value arrives through a parameter, from a caller this analysis never
    // sees. There is no path to report and the finding must stand anyway: an
    // intra-procedural pass finding nothing is a limit of the pass.
    const findings = sql(
      await scan(['def search(cur, account):', '    cur.execute("SELECT * FROM t WHERE a = \'%s\'" % account)'].join('\n')),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.taint).toBeUndefined();
    // And it does not claim a trace it does not have.
    expect(findings[0]?.message).not.toContain('attacker-controlled');
  });

  it('does not treat an environment variable as attacker input', async () => {
    // Deployment configuration is operator input. Treating it as hostile flags
    // every correctly written application.
    const file = await parseSource(
      'probe.py',
      ['import os', 'def f():', '    dsn = os.environ["DSN"]'].join('\n'),
    );
    expect(analyzeTaint(file!).at(3, 'dsn')).toBeUndefined();
  });

  it('clears taint through a coercion that cannot carry a quote', async () => {
    const file = await parseSource(
      'probe.py',
      ['def f():', '    n = int(request.args["n"])'].join('\n'),
    );
    expect(analyzeTaint(file!).at(2, 'n')).toBeUndefined();
  });

  it('does not let a later assignment make an earlier sink look safe', async () => {
    // Flow order matters: `q` is tainted on line 3 and clean on line 5, and the
    // call on line 4 sees the tainted one.
    const file = await parseSource(
      'probe.py',
      ['def f(cur):', '    a = request.args["a"]', '    q = "x" + a', '    cur.execute(q)', '    q = "SELECT 1"'].join('\n'),
    );
    const table = analyzeTaint(file!);
    expect(table.at(4, 'q')).toBeDefined();
    expect(table.at(5, 'q')).toBeUndefined();
  });
});
