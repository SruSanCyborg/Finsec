/**
 * Validating a rule file without a server.
 *
 * `rules validate` posted the YAML to the API, so with no backend it could not
 * say whether `severity: hgih` was a typo — an answer that was already in the
 * binary. Almost every check here is a convention this repo owns, and the two
 * that are not conventions are safety: a validity check must be read-only,
 * because it calls a third party with someone's leaked credential.
 */

import { describe, expect, it } from 'vitest';

import { validateRuleDocument } from '../src/engine/rule-schema.js';

const complete = `
rule:
  id: SIR-SEC-012
  category: injection
  severity: critical
  languages: [python]
  message: "Template rendered with user input; use autoescaping."
  metadata:
    compliance:
      pci_dss: ["6.2.4"]
    remediation_action: sanitize_input
  match:
    kind: ast
    pattern: render_template_string($X)
  fix: { action: sanitize_input }
  suppress: "# sirius-ignore: SIR-SEC-012"
`;

const errors = (source: string) =>
  validateRuleDocument(source).problems.filter((p) => p.severity === 'error');
const warnings = (source: string) =>
  validateRuleDocument(source).problems.filter((p) => p.severity === 'warning');
const paths = (source: string) => validateRuleDocument(source).problems.map((p) => p.path);

describe('validateRuleDocument', () => {
  it('passes a complete rule', () => {
    const result = validateRuleDocument(complete);
    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.id).toBe('SIR-SEC-012');
  });

  it('reports unparseable YAML as one error, not a stack trace', () => {
    const result = validateRuleDocument('rule:\n  id: [unclosed\n');
    expect(result.valid).toBe(false);
    expect(result.problems).toHaveLength(1);
  });

  it('requires an id in the project\'s format', () => {
    expect(errors(complete.replace('SIR-SEC-012', 'MY-RULE-1'))).toMatchObject([
      { path: 'rule.id' },
    ]);
  });

  it('refuses an id that is already a compiled rule', () => {
    // Silently shadowing SIR-SEC-001 would make two different rules answer to
    // one id, and suppressions are keyed by id.
    expect(errors(complete.replace('SIR-SEC-012', 'SIR-SEC-001')).map((e) => e.message.toLowerCase())).toEqual([
      expect.stringContaining('already'),
    ]);
  });

  it('warns when the id block disagrees with the category', () => {
    // 04x is crypto; this rule says injection.
    const found = warnings(complete.replaceAll('SIR-SEC-012', 'SIR-SEC-042'));
    expect(found.map((w) => w.path)).toContain('rule.id');
  });

  it('accepts logging in the pii block, which the catalogue itself does', () => {
    const source = complete.replaceAll('SIR-SEC-012', 'SIR-SEC-032').replace('injection', 'logging');
    expect(warnings(source).map((w) => w.path)).not.toContain('rule.id');
  });

  it('rejects a severity or category outside the vocabulary', () => {
    expect(paths(complete.replace('severity: critical', 'severity: hgih'))).toContain('rule.severity');
    expect(paths(complete.replace('category: injection', 'category: vibes'))).toContain('rule.category');
  });

  it('requires something to match on', () => {
    const source = complete.replace('    pattern: render_template_string($X)\n', '');
    expect(errors(source).map((e) => e.path)).toContain('rule.match');
  });

  it('rejects a validity check that is not read-only', () => {
    const source = complete.replace(
      '    kind: ast',
      '    kind: ast\n    validity_check:\n      method: POST\n      endpoint: "https://api.stripe.com/v1/charges"',
    );
    // This one is not a convention. A non-GET probe could move money with the
    // very key it is testing.
    expect(errors(source).map((e) => e.path)).toContain('rule.match.validity_check.method');
  });

  it('rejects a validity check over plaintext HTTP', () => {
    const source = complete.replace(
      '    kind: ast',
      '    kind: ast\n    validity_check:\n      method: GET\n      endpoint: "http://api.stripe.com/v1/balance"',
    );
    expect(errors(source).map((e) => e.path)).toContain('rule.match.validity_check.endpoint');
  });

  it('catches a PCI-DSS number that v4.0 renumbered', () => {
    const found = errors(complete.replace('"6.2.4"', '"6.5.1"'));
    expect(found[0]?.message).toContain('6.2.4');
    // The whole product is clause mapping; citing a retired clause is wrong in
    // the way that matters most to an auditor.
    expect(found[0]?.path).toBe('rule.metadata.compliance.pci_dss[0]');
  });

  it('rejects a fix action outside the fixed vocabulary', () => {
    expect(paths(complete.replace('action: sanitize_input', 'action: make_it_secure'))).toContain(
      'rule.fix.action',
    );
  });

  it('catches a fix action that disagrees with the metadata', () => {
    const source = complete.replace('remediation_action: sanitize_input', 'remediation_action: env_lookup');
    expect(errors(source).map((e) => e.path)).toContain('rule.fix.action');
  });

  it('warns about a language the engine cannot parse', () => {
    const found = warnings(complete.replace('[python]', '[rust]'));
    expect(found[0]?.message).toContain('never fire');
  });

  it('warns when there is no clause mapping at all', () => {
    const source = complete.replace(/  metadata:[\s\S]*?  match:/, '  match:');
    expect(warnings(source).map((w) => w.path)).toContain('rule.metadata.compliance');
  });

  it('reads a bare document, saying that is what it did', () => {
    const bare = complete.replace('rule:\n', '').replace(/^ {2}/gm, '');
    const result = validateRuleDocument(bare);
    expect(result.valid).toBe(true);
    expect(result.problems.map((p) => p.message)).toEqual([expect.stringContaining('no `rule:` key')]);
  });
});
