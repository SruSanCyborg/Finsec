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
