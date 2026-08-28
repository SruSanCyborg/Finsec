/**
 * The local engine's rules, described in the shape the API returns.
 *
 * `sirius rules` asked a server what rules exist, which meant the command was
 * unusable in the configuration everything else defaults to — while the rules
 * themselves sat compiled into this binary. Listing them is not a favour to the
 * user: a compliance linter that cannot say what it checks for, or which clause
 * each check maps to, is asking to be taken on faith.
 *
 * The mapping is deliberately lossy in one direction and honest about it. The
 * PRD's rules are YAML documents; these are compiled AST matchers, so there is
 * no `yaml_body` to show and none is invented. Everything that *is* known —
 * severity, category, clauses, fix action, suppression token — is real.
 */

import { RULES } from './rules.js';
import type { Rule } from './rules.js';
import type { Rule as ApiRule } from '../domain.js';

/** Languages a rule applies to, when it does not say. */
const DEFAULT_LANGUAGES = ['python', 'javascript', 'typescript'];

/**
 * The rules this build actually runs.
 *
 * `version` is the engine's, not each rule's: they ship together and there is
 * no per-rule versioning to report, so claiming one would be invention.
 */
export function localRules(version: string): ApiRule[] {
  return RULES.map((rule) => ({
    id: rule.id,
    version,
    enabled: true,
    category: rule.category,
    severity: rule.severity,
    message: rule.message,
    languages: rule.languages ?? DEFAULT_LANGUAGES,
    compliance_ref: rule.compliance_ref,
    ...(rule.fix_action ? { fix_action: rule.fix_action as ApiRule['fix_action'] } : {}),
    suppress_token: `# sirius-ignore: ${rule.id}`,
  }));
}

/** One rule by id, case-insensitively — nobody types `SIR-SEC-001` in caps twice. */
export function localRule(id: string, version: string): ApiRule | undefined {
  const wanted = id.trim().toUpperCase();
  return localRules(version).find((rule) => rule.id.toUpperCase() === wanted);
}

/** Ids only, for error messages that should suggest something real. */
export function localRuleIds(): string[] {
  return RULES.map((rule) => rule.id);
}

/**
 * Which compiled rules a ruleset name selects.
 *
 * `rulesets:` sits in every scaffolded `sirius.yaml` and `--ruleset` is on both
 * `scan` and `watch`, but the local engine ran all twelve rules regardless — a
 * knob wired to nothing. It errs toward noise rather than silence, so it was
 * never going to be caught by a missing finding.
 *
 * The PRD names `p/fintech-core` ("the full fintech catalogue") and `p/secrets`
 * without defining membership, so the mapping is: the core set is everything,
 * and `p/<category>` selects that category. Anything else is an error naming
 * what exists rather than a silent full scan — a ruleset that quietly means
 * "all rules" is how a team believes it narrowed a scan that it did not.
 */
export function rulesFor(rulesets: readonly string[]): Rule[] {
  if (rulesets.length === 0) return [...RULES];

  const selected = new Set<Rule>();
  for (const name of rulesets) {
    const key = name.trim().toLowerCase();
    if (key === 'p/fintech-core' || key === 'all') {
      for (const rule of RULES) selected.add(rule);
      continue;
    }

    const category = key.startsWith('p/') ? key.slice(2) : key;
    const matching = RULES.filter((rule) => rule.category === category);
    if (matching.length === 0) {
      throw new Error(
        `Unknown ruleset "${name}". Available: p/fintech-core, ${categoriesInCatalogue()
          .map((c) => `p/${c}`)
          .join(', ')}.`,
      );
    }
    for (const rule of matching) selected.add(rule);
  }

  // Catalogue order, not selection order, so two equivalent rulesets scan alike.
  return RULES.filter((rule) => selected.has(rule));
}

/** The categories the compiled rules actually cover, for error messages. */
export function categoriesInCatalogue(): string[] {
  return [...new Set(RULES.map((rule) => rule.category))].sort();
}
