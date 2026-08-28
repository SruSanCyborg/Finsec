/**
 * The local Response stage: building a fix, and verifying it before offering it.
 *
 * The verifier is the part worth testing hardest. Its whole job is to refuse a
 * patch that looks right and changes nothing, and it has already earned that
 * keep once: an early `redact_pii_log` template wrapped the format string
 * instead of the data, the verifier re-ran the rule, found the finding still
 * there, and reported `fail`. That is the difference between a guardrail and a
 * green tick.
 */

import { describe, expect, it } from 'vitest';

import { buildLocalFix } from '../src/engine/fix.js';

const PY = '/tmp/sirius-fix-test/sample.py';

describe('env_lookup moves a hardcoded secret out of the file', () => {
  const source = ['import os', '', 'STRIPE_KEY = "sk_live_51H8xR2eZvNOTAREALKE"', ''].join('\n');

  it('replaces the literal with an environment lookup', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source,
      line: 3,
      ruleId: 'SIR-SEC-001',
      action: 'env_lookup',
    });

    expect(fix).toBeDefined();
    expect(fix!.patched).toContain('os.environ["STRIPE_KEY"]');
    expect(fix!.patched).not.toContain('sk_live_51H8xR2eZ');
  });

  it('verifies by re-running the rule, not by asserting success', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source,
      line: 3,
      ruleId: 'SIR-SEC-001',
      action: 'env_lookup',
    });

    expect(fix!.verifierStatus).toBe('pass');
    expect(fix!.escalate).toBe(false);
    expect(fix!.verifierDetail).toContain('SIR-SEC-001');
  });

  it('leaves an .env.example entry so the variable is discoverable', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source,
      line: 3,
      ruleId: 'SIR-SEC-001',
      action: 'env_lookup',
    });

    expect(fix!.sideEffects).toContainEqual({ file: '.env.example', content: 'STRIPE_KEY=' });
  });

  it('adds the os import when the file lacks one', async () => {
    const withoutImport = 'STRIPE_KEY = "sk_live_51H8xR2eZvNOTAREALKE"\n';
    const fix = await buildLocalFix({
      filePath: PY,
      source: withoutImport,
      line: 1,
      ruleId: 'SIR-SEC-001',
      action: 'env_lookup',
    });

    // Without this the "fix" would leave the file raising NameError on import.
    expect(fix!.patched.startsWith('import os')).toBe(true);
    expect(fix!.verifierStatus).toBe('pass');
  });
});

describe('parameterize_query binds the value instead of formatting it', () => {
  it('handles percent formatting', async () => {
    const source = [
      'class L:',
      '    def get(self, uid):',
      '        cur = self._conn.cursor()',
      '        cur.execute("SELECT * FROM txns WHERE id = %s" % uid)',
      '',
    ].join('\n');

    const fix = await buildLocalFix({
      filePath: PY,
      source,
      line: 4,
      ruleId: 'SIR-SEC-010',
      action: 'parameterize_query',
    });

    expect(fix!.patched).toContain('cur.execute("SELECT * FROM txns WHERE id = %s", (uid,))');
    expect(fix!.verifierStatus).toBe('pass');
  });

  it('handles an f-string', async () => {
    const source = ['def q(cur, uid):', '    cur.execute(f"SELECT * FROM t WHERE id = {uid}")', ''].join('\n');

    const fix = await buildLocalFix({
      filePath: PY,
      source,
      line: 2,
      ruleId: 'SIR-SEC-010',
      action: 'parameterize_query',
    });

    expect(fix!.patched).toContain('%s');
    expect(fix!.patched).toContain('(uid,)');
    expect(fix!.verifierStatus).toBe('pass');
  });
});

describe('redact_pii_log wraps the data, not the message', () => {
  const source = ['def h(log, card):', '    log.info("charge for card %s", card.get("number"))', ''].join('\n');

  it('leaves the format string alone', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source,
      line: 2,
      ruleId: 'SIR-SEC-030',
      action: 'redact_pii_log',
    });

    // The bug the verifier caught: `log.info(redact("charge…", card…))` reads
    // as a fix and redacts nothing.
    expect(fix!.patched).toContain('log.info("charge for card %s", redact(card.get("number")))');
    expect(fix!.patched).not.toContain('redact("charge');
  });

  it('clears the finding', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source,
      line: 2,
      ruleId: 'SIR-SEC-030',
      action: 'redact_pii_log',
    });

    expect(fix!.verifierStatus).toBe('pass');
  });

  it('does not double-wrap an already redacted call', async () => {
    const already = ['def h(log, card):', '    log.info("card %s", redact(card.get("number")))', ''].join('\n');
    const fix = await buildLocalFix({
      filePath: PY,
      source: already,
      line: 2,
      ruleId: 'SIR-SEC-030',
      action: 'redact_pii_log',
    });

    expect(fix).toBeUndefined();
  });
});

describe('the guardrail refuses rather than guesses', () => {
  it('offers nothing when the template does not match the line', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source: 'STRIPE_KEY = "sk_live_abcdefghijklmnopqrst"\n',
      line: 1,
      ruleId: 'SIR-SEC-001',
      action: 'redact_pii_log',
    });

    // A wrong patch to money-handling code is worse than no patch.
    expect(fix).toBeUndefined();
  });

  it('offers nothing for an action with no template', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source: 'x = 1\n',
      line: 1,
      ruleId: 'SIR-SEC-040',
      action: 'upgrade_crypto',
    });

    expect(fix).toBeUndefined();
  });

  it('offers nothing for a line that does not exist', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source: 'x = 1\n',
      line: 99,
      ruleId: 'SIR-SEC-001',
      action: 'env_lookup',
    });

    expect(fix).toBeUndefined();
  });

  it('escalates when the rule is not one it can re-run', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source: 'API_TOKEN = "ghp_0123456789abcdefghijklmnopqrstuvwxyz"\n',
      line: 1,
      ruleId: 'SIR-SEC-999',
      action: 'env_lookup',
    });

    // No rule to re-run means the fix is unverified, and unverified is not pass.
    expect(fix!.verifierStatus).toBe('escalated');
    expect(fix!.escalate).toBe(true);
  });
});

describe('the provenance panel does not claim a model ran', () => {
  it('names the first stage a template selector', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source: 'import os\nSTRIPE_KEY = "sk_live_51H8xR2eZvNOTAREALKE"\n',
      line: 2,
      ruleId: 'SIR-SEC-001',
      action: 'env_lookup',
    });

    const names = fix!.stages.map((s) => s.name);
    expect(names).toContain('template selector');
    expect(names).not.toContain('quarantined model');
  });

  it('marks which stages are real', async () => {
    const fix = await buildLocalFix({
      filePath: PY,
      source: 'import os\nSTRIPE_KEY = "sk_live_51H8xR2eZvNOTAREALKE"\n',
      line: 2,
      ruleId: 'SIR-SEC-001',
      action: 'env_lookup',
    });

    const selector = fix!.stages.find((s) => s.name === 'template selector');
    const verifier = fix!.stages.find((s) => s.name === 'verifier');

    // No LLM ran, and the verifier genuinely re-ran the rule. Both must be
    // labelled as what they are.
    expect(selector!.real).toBe(false);
    expect(verifier!.real).toBe(true);
  });
});
