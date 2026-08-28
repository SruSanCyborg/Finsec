/**
 * Following a value into another function.
 *
 * The shape this exists for is two lines, neither of which looks wrong:
 *
 *     def run(cur, q): cur.execute(q)      the sink, with nothing untrusted in sight
 *     run(cur, request.args["q"])          the mistake, with no sink in sight
 *
 * A rule matching the shape of a statement cannot see it. A summary can: each
 * function is asked once whether a tainted parameter reaches its return value
 * or a sink, and the answers are reused at every call.
 *
 * The tests that matter here are the negatives. An interprocedural pass that
 * assumes every call passes taint through will flag `q = escape(dirty)`, and
 * one that assumes every call sinks its arguments will flag the entire
 * codebase. Both are worse than staying intraprocedural.
 */

import { describe, expect, it } from 'vitest';

import { parseSource } from '../src/engine/parse.js';
import { analyzeTaint, summarise } from '../src/engine/taint.js';
import { runRules } from '../src/engine/rules.js';

const parse = async (source: string) => {
  const file = await parseSource('probe.py', source);
  if (!file) throw new Error('probe.py did not parse');
  return file;
};

const sql = async (source: string) =>
  runRules(await parse(source)).filter((finding) => finding.rule_id === 'SIR-SEC-010');

describe('what a function does to its arguments', () => {
  it('knows which parameter reaches a sink', async () => {
    const summaries = summarise(
      await parse(['def run(cur, q):', '    cur.execute(q)'].join('\n')),
    );
    const run = summaries.get('run');

    expect(run?.params).toEqual(['cur', 'q']);
    // The second argument, not the first. A summary that cannot tell them apart
    // reports the wrong argument at every call site.
    expect(run?.sinksParam.map((hit) => hit.index)).toEqual([1]);
    expect(run?.sinksParam[0]?.sink).toBe('cur.execute');
  });

  it('knows which parameter comes back out', async () => {
    const summaries = summarise(
      await parse(['def wrap(prefix, value):', '    return prefix + value'].join('\n')),
    );
    expect(summaries.get('wrap')?.returnsTaintFrom).toEqual([0, 1]);
  });

  it('knows when a parameter is cleaned on the way through', async () => {
    const summaries = summarise(
      await parse(['def clean(value):', '    safe = int(value)', '    return safe'].join('\n')),
    );
    expect(summaries.get('clean')?.returnsTaintFrom).toEqual([]);
  });
});

describe('the bug that neither line shows', () => {
  it('is reported at the call, and names the sink inside the callee', async () => {
    const findings = await sql(
      [
        'def run_query(cur, q):',
        '    cur.execute(q)',
        '',
        'def search(cur):',
        '    account = request.args["account"]',
        `    run_query(cur, "SELECT * FROM t WHERE a = '%s'" % account)`,
      ].join('\n'),
    );

    expect(findings).toHaveLength(1);
    // Line 6 — the call. That is the line somebody has to change; the sink on
    // line 2 is correct code that was handed something it should not have been.
    expect(findings[0]?.line).toBe(6);
    expect(findings[0]?.message).toContain('run_query');
    expect(findings[0]?.taint).toContain('request.args');
    expect(findings[0]?.taint).toContain('line 2');
  });

  it('says nothing when the same function is handed a constant', async () => {
    const findings = await sql(
      [
        'def run_query(cur, q):',
        '    cur.execute(q)',
        '',
        'def report(cur):',
        '    run_query(cur, "SELECT count(*) FROM t")',
      ].join('\n'),
    );
    expect(findings).toEqual([]);
  });

  it('says nothing when the tainted value goes to a parameter that is never sunk', async () => {
    // `run_query` sinks its second argument. Tainting the first is not this bug,
    // and reporting it would make the summary decorative.
    const findings = await sql(
      [
        'def run_query(cur, q):',
        '    cur.execute(q)',
        '',
        'def search():',
        '    handle = request.args["h"]',
        '    run_query(handle, "SELECT 1")',
      ].join('\n'),
    );
    expect(findings).toEqual([]);
  });
});

describe('taint coming back out of a call', () => {
  it('follows it when the function returns what it was given', async () => {
    const file = await parse(
      [
        'def wrap(value):',
        '    return "WHERE a = " + value',
        '',
        'def search(cur):',
        '    a = request.args["a"]',
        '    q = wrap(a)',
      ].join('\n'),
    );
    expect(analyzeTaint(file).at(6, 'q')).toBeDefined();
  });

  it('drops it when the function does not', async () => {
    // The negative that keeps this honest. Assuming every call passes taint
    // through would flag `q = escape(dirty)` — code doing exactly the right
    // thing — which is the fastest way to have the whole feature switched off.
    const file = await parse(
      [
        'def sanitise(value):',
        '    return int(value)',
        '',
        'def search():',
        '    a = request.args["a"]',
        '    q = sanitise(a)',
      ].join('\n'),
    );
    expect(analyzeTaint(file).at(6, 'q')).toBeUndefined();
  });
});

describe('the limits, which are the point', () => {
  it('adds a finding and never removes one', async () => {
    // A direct sink stays a finding whether or not any summary applies.
    const findings = await sql(
      ['def search(cur, account):', `    cur.execute("SELECT * FROM t WHERE a = '%s'" % account)`].join('\n'),
    );
    expect(findings).toHaveLength(1);
  });

  it('does not invent findings in a file with no calls into anything', async () => {
    const file = await parse(['x = 1', 'y = x + 2'].join('\n'));
    expect(analyzeTaint(file).callSites).toEqual([]);
  });
});
