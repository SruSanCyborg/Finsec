/**
 * Which fixes may be applied without being asked for.
 *
 * Every fix carried a `confidence: 0.84` that meant nothing to anybody and
 * gated nothing: the verifier decided whether a patch resolved the finding and
 * parsed, and after that all four templates were equal. They are not. Moving a
 * secret to `os.environ` is unambiguously what the author meant; wrapping a log
 * argument in `redact()` calls a helper this tool does not define, and would
 * raise a NameError in a project that has none — and both were applied the same
 * way, by the same keystroke.
 *
 * rustc's `Applicability` is the canonical model and `cargo clippy --fix`
 * applies only `MachineApplicable`. That is the discipline copied here.
 *
 * The interesting property is that applicability belongs to the **match**, not
 * the template: the same parameterisation is machine-applicable when the
 * placeholder count agrees with the operand count, and a guess when it does not.
 */

import { describe, expect, it } from 'vitest';

import { buildLocalFix } from '../src/engine/fix.js';

const fix = (source: string, action: string, line: number, ruleId = 'SIR-SEC-010') =>
  buildLocalFix({ filePath: 'probe.py', source, action, line, ruleId });

describe('a fix that is unambiguously what was meant', () => {
  it('is machine-applicable', async () => {
    const built = await fix('STRIPE_KEY = "sk_live_51H8xR2eZvKYlo2Cexam"\n', 'env_lookup', 1, 'SIR-SEC-001');
    expect(built?.applicability).toBe('machine-applicable');
  });

  it('still says what changes about the running program', async () => {
    // Applicability and consequence are different axes. This one is certain
    // *and* makes the program need an environment variable that must now be
    // set — which is the thing a person wants to know before pressing y.
    const built = await fix('STRIPE_KEY = "sk_live_51H8xR2eZvKYlo2Cexam"\n', 'env_lookup', 1, 'SIR-SEC-001');
    expect(built?.behaviourNote).toMatch(/environment/);
  });
});

describe('applicability comes from the match, not the template', () => {
  it('is machine-applicable when the placeholders and the values agree', async () => {
    const built = await fix(
      ['def q(cur, uid):', `    cur.execute("SELECT * FROM t WHERE id = '%s'" % uid)`].join('\n'),
      'parameterize_query',
      2,
    );
    expect(built?.applicability).toBe('machine-applicable');
    expect(built?.behaviourNote).toBeUndefined();
  });

  it('is maybe-incorrect when they do not', async () => {
    // Two placeholders and one operand is a guess about what the author meant
    // to interpolate. The same template, a different verdict, because the
    // verdict is about this line and not about the template.
    const built = await fix(
      ['def q(cur, uid):', `    cur.execute("SELECT * FROM t WHERE a = '%s' AND b = '%s'" % uid)`].join('\n'),
      'parameterize_query',
      2,
    );
    expect(built?.applicability).toBe('maybe-incorrect');
    expect(built?.behaviourNote).toMatch(/placeholder/);
  });
});

describe('a fix that assumes something about the project', () => {
  it('is maybe-incorrect when it calls a helper it does not define', async () => {
    const built = await fix(
      ['import logging', 'log = logging.getLogger(__name__)', 'log.info("card %s", card["number"])'].join('\n'),
      'redact_pii_log',
      3,
      'SIR-SEC-030',
    );
    expect(built?.applicability).toBe('maybe-incorrect');
    // The patched line parses and the rule stops matching, so the verifier
    // passes it. Passing the verifier is not the same as being safe to apply,
    // and this is the case that shows the difference.
    expect(built?.verifierStatus).toBe('pass');
    expect(built?.behaviourNote).toMatch(/redact\(\)/);
  });
});

describe('the verifier', () => {
  it('says why the fix converges, rather than implying a pass it did not run', async () => {
    // The design report asks for three conditions: resolves the finding,
    // reparses, and converges. The third follows from the first here — fixes
    // are selected by findings, and the rule no longer matches — so the
    // verifier says that rather than claiming a separate test.
    //
    // The first attempt did run one, by applying the template to its own
    // output, and it was wrong: `add_auth_decorator` inserts a line, so the
    // second run read the decorator it had just written and failed a template
    // that converges perfectly well.
    const built = await fix('STRIPE_KEY = "sk_live_51H8xR2eZvKYlo2Cexam"\n', 'env_lookup', 1, 'SIR-SEC-001');
    expect(built?.verifierStatus).toBe('pass');
    expect(built?.verifierDetail).toContain('nothing would select it again');
  });

  it('shows the verdict as a stage, so the panel can say it out loud', async () => {
    const built = await fix('STRIPE_KEY = "sk_live_51H8xR2eZvKYlo2Cexam"\n', 'env_lookup', 1, 'SIR-SEC-001');
    const stage = built?.stages.find((each) => each.name === 'applicability');
    expect(stage?.detail).toContain('machine-applicable');
    expect(stage?.real).toBe(true);
  });
});
