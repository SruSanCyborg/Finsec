/**
 * A rule that claims a language must actually fire in it.
 *
 * Eleven of thirteen rules gated on tree-sitter's *Python* node names — `call`,
 * `assignment`, `decorated_definition`. tree-sitter names the same construct
 * differently per grammar, so on a `.js` file those rules walked the whole tree,
 * matched nothing, and reported the file clean. Meanwhile `rules show
 * SIR-SEC-010` printed `languages: python, javascript, typescript` and `doctor`
 * printed a hardcoded `python, javascript, typescript, go` — a language no rule
 * has ever declared.
 *
 * A JavaScript file with SQL injection, command injection, MD5 over a PAN and a
 * card number in a log line came back with one finding: the hardcoded key,
 * caught by a regex that never needed a grammar.
 *
 * Silent under-reporting is the worst failure a linter has. A crash gets fixed;
 * a clean report gets believed. And no Python fixture could ever have caught it,
 * because in Python every one of these rules worked perfectly.
 *
 * Two claims are checked here, and the second matters as much as the first: the
 * catalogue may not advertise a language the engine does not really scan, and
 * the rules may not fire on the correct counterpart of each planted flaw.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { localRules } from '../src/engine/catalog.js';
import { scanDirectory } from '../src/engine/scanner.js';
import type { Finding } from '../src/domain.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const GALLERY = join(repo, 'contract', 'fixtures', 'rule-gallery');

/**
 * The gallery, filtered to one file.
 *
 * `scanDirectory` walks a tree, so the whole gallery is scanned and the
 * JavaScript half selected from the results. Filtering afterwards also proves
 * the file is genuinely reached by an ordinary scan, rather than only by being
 * named directly.
 */
async function scanOnly(suffix: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  for await (const frame of scanDirectory(GALLERY)) {
    if (frame.type === 'finding' && frame.finding?.file.endsWith(suffix)) findings.push(frame.finding);
  }
  return findings;
}

const js = await scanOnly('payments.js');
const fired = new Set(js.map((finding) => finding.rule_id));

describe('the JavaScript gallery', () => {
  it.each([
    ['SIR-SEC-001', 'a credential in the source'],
    ['SIR-SEC-010', 'SQL built from request input'],
    ['SIR-SEC-011', 'a shell command built from request input'],
    ['SIR-SEC-030', 'a card number written to the log'],
    ['SIR-SEC-040', 'a weak digest over a PAN'],
  ])('%s fires on %s', (ruleId) => {
    expect(fired, `${ruleId} did not fire on the JavaScript gallery`).toContain(ruleId);
  });

  it('traces the taint rather than matching a shape', () => {
    // The distinction the Python rules make, holding in JavaScript: the
    // finding must know the value came from `req.query` / `req.body`, not
    // merely that a string was concatenated.
    const sql = js.find((finding) => finding.rule_id === 'SIR-SEC-010');
    expect(sql?.message).toMatch(/attacker-controlled/);
  });

  it('leaves the correct counterparts alone', () => {
    // Five planted flaws, five right ways of doing the same job beside them.
    // A rule that fires on both has learned nothing.
    expect(js).toHaveLength(5);

    const lines = js.map((finding) => finding.line).sort((a, b) => a - b);
    for (const [index, line] of lines.entries()) {
      expect(lines.indexOf(line), `two findings on line ${line}`).toBe(index);
    }
  });

  it('does not report the argv spawn as a shell injection', () => {
    // `execFile('tar', [...])` involves no shell. Reporting it would be the
    // false positive that teaches a team to ignore the rule — which is why
    // `execFile` and `spawn` are deliberately outside the pattern.
    const shell = js.filter((finding) => finding.rule_id === 'SIR-SEC-011');
    expect(shell).toHaveLength(1);
    expect(shell[0]?.line).toBeLessThan(40);
  });
});

describe('the catalogue does not advertise what it cannot do', () => {
  const rules = localRules('test');

  it('gives every rule at least one language', () => {
    for (const rule of rules) {
      expect(rule.languages?.length, rule.id).toBeGreaterThan(0);
    }
  });

  it('claims javascript only for rules shown to fire in it', () => {
    // The three decorator rules match Python's `@app.route` idiom, which
    // Express spells as a call. They now say `python` rather than claiming a
    // language they quietly do nothing in.
    for (const id of ['SIR-SEC-020', 'SIR-SEC-050', 'SIR-SEC-051']) {
      const rule = rules.find((each) => each.id === id);
      expect(rule?.languages, id).toEqual(['python']);
    }
  });

  it('never claims a language the parser has no grammar for', async () => {
    // `doctor` used to print `go` from a hardcoded string. Nothing declared it,
    // and a health check that composes its own good news cannot report bad news.
    const { SUPPORTED_LANGUAGES } = await import('../src/engine/parse.js');

    for (const rule of rules) {
      for (const language of rule.languages ?? []) {
        // Manifest rules name files (`package.json`), not languages.
        if (language.includes('.')) continue;
        expect(SUPPORTED_LANGUAGES, `${rule.id} claims "${language}"`).toContain(language);
      }
    }
  });
});
