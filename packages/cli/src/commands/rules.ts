/**
 * `sirius rules list|show|validate|test`
 *
 * `test` is deliberately absent: it would need to run an *authored* rule against
 * a fixture, which means a YAML rule interpreter. The engine here runs compiled
 * AST matchers, so there is nothing to feed a YAML rule into. Tracked as blocked
 * on the `auto` branch rather than faked.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ApiClient } from '../api/client.js';
import { CliError } from '../api/errors.js';
import { loadConfig } from '../config/load.js';
import { ExitCode } from '../domain.js';
import { SEVERITY_COLOR, detectCapabilities } from '../ui/theme.js';
import { VERSION } from '../branding.js';
import type { Rule } from '../domain.js';

interface RulesFlags {
  category?: string;
  ruleset?: string;
  json?: boolean;
}

interface GlobalFlags {
  apiUrl?: string;
  profile?: string;
  project?: string;
  color?: boolean;
  local?: boolean;
}

function configFor(globals: GlobalFlags) {
  return loadConfig({
    cwd: process.cwd(),
    overrides: {
      apiUrl: globals.apiUrl,
      profile: globals.profile,
      ...(globals.project ? { projectId: globals.project } : {}),
    },
  });
}

function client(globals: GlobalFlags): ApiClient {
  const config = configFor(globals);
  return new ApiClient({ baseUrl: config.apiUrl, apiKey: config.apiKey });
}

/**
 * Whether to answer from the compiled catalogue rather than the API.
 *
 * Same test `scan` uses: with no project configured there is no hosted ruleset
 * to ask about, and the rules that would actually run are the local ones. A
 * catalogue that cannot be read without a backend is a catalogue nobody reads.
 */
function useLocalCatalog(globals: GlobalFlags): boolean {
  if (globals.local === true) return true;
  if (globals.apiUrl) return false;
  return !configFor(globals).projectId;
}

export async function runRules(
  subcommand: string | undefined,
  target: string | undefined,
  flags: RulesFlags,
  globals: GlobalFlags,
): Promise<void> {
  switch (subcommand ?? 'list') {
    case 'list':
      return listRules(flags, globals);
    case 'show':
      return showRule(target, flags, globals);
    case 'validate':
      return validateRule(target, globals);
    case 'test':
      throw new CliError('`sirius rules test` is not implemented.', {
        hint: 'It needs a rule-execution endpoint the API does not expose yet. See docs/decisions.md.',
      });
    default:
      throw new CliError(`Unknown subcommand "${subcommand}".`, {
        hint: 'Expected one of: list, show, validate.',
      });
  }
}

async function listRules(flags: RulesFlags, globals: GlobalFlags): Promise<void> {
  const local = useLocalCatalog(globals);

  let rules: Rule[];
  if (local) {
    const { localRules, rulesFor } = await import('../engine/catalog.js');

    // `--ruleset` used to end in `|| true` — accepted, then ignored, so the
    // command answered a question nobody asked. It selects the same way a scan
    // does now, or there is no point offering the flag.
    let selected: Set<string> | undefined;
    if (flags.ruleset) {
      try {
        selected = new Set(rulesFor([flags.ruleset]).map((rule) => rule.id));
      } catch (failure) {
        throw new CliError(failure instanceof Error ? failure.message : String(failure));
      }
    }

    rules = localRules(VERSION).filter(
      (rule) =>
        (!flags.category || rule.category === flags.category) &&
        (!selected || selected.has(rule.id)),
    );
  } else {
    rules = await client(globals).listRules({
      ...(flags.category ? { category: flags.category } : {}),
      ...(flags.ruleset ? { ruleset: flags.ruleset } : {}),
    });
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(rules, null, 2) + '\n');
    return;
  }

  if (rules.length === 0) {
    process.stdout.write('No rules matched.\n');
    return;
  }

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const paint = (text: string, color: string) => (capabilities.color ? `\u001b[38;2;${hexToRgb(color)}m${text}\u001b[39m` : text);

  // Group by category so the catalogue reads like the rule table in the docs.
  const byCategory = new Map<string, Rule[]>();
  for (const rule of rules) {
    const key = rule.category ?? 'uncategorized';
    byCategory.set(key, [...(byCategory.get(key) ?? []), rule]);
  }

  for (const [category, group] of [...byCategory].sort()) {
    process.stdout.write(`\n${category}\n`);
    for (const rule of group.sort((a, b) => a.id.localeCompare(b.id))) {
      const severity = rule.severity ?? 'info';
      const enabled = rule.enabled === false ? ' (disabled)' : '';
      process.stdout.write(
        `  ${rule.id.padEnd(14)} ${paint(severity.padEnd(9), SEVERITY_COLOR[severity])} ${rule.message ?? ''}${enabled}\n`,
      );
    }
  }
  // Say where the catalogue came from, for the same reason a scan says where
  // its findings came from: a hosted ruleset and the rules this binary runs are
  // not necessarily the same list.
  const source = local ? 'local engine' : 'API';
  process.stdout.write(`\n${rules.length} rule${rules.length === 1 ? '' : 's'} · ${source}\n`);
}

async function showRule(ruleId: string | undefined, flags: RulesFlags, globals: GlobalFlags): Promise<void> {
  if (!ruleId) {
    throw new CliError('Which rule?', { hint: 'e.g. sirius rules show SIR-SEC-001' });
  }

  const local = useLocalCatalog(globals);

  let rule: Rule | undefined;
  if (local) {
    const { localRule, localRuleIds } = await import('../engine/catalog.js');
    rule = localRule(ruleId, VERSION);
    if (!rule) {
      throw new CliError(`No rule "${ruleId}" in the local engine.`, {
        hint: `Known: ${localRuleIds().slice(0, 6).join(', ')}…  Run \`sirius rules list\` for all.`,
      });
    }
  } else {
    rule = await client(globals).getRule(ruleId);
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(rule, null, 2) + '\n');
    return;
  }

  process.stdout.write(`${rule.id}  ${rule.severity ?? ''}  ${rule.category ?? ''}\n`);
  if (rule.message) process.stdout.write(`${rule.message}\n`);
  process.stdout.write('\n');
  if (rule.languages?.length) process.stdout.write(`languages:   ${rule.languages.join(', ')}\n`);
  if (rule.compliance_ref?.length) process.stdout.write(`compliance:  ${rule.compliance_ref.join(', ')}\n`);
  if (rule.fix_action) process.stdout.write(`fix action:  ${rule.fix_action}\n`);
  if (rule.suppress_token) process.stdout.write(`suppress:    ${rule.suppress_token}\n`);
  if (rule.version) process.stdout.write(`version:     ${rule.version}\n`);

  // The YAML body is the point of `show` — it is what makes the rules engine
  // legible rather than a black box.
  if (rule.yaml_body) process.stdout.write(`\n${rule.yaml_body}\n`);
  else if (local) {
    // The PRD's rules are YAML; these are compiled AST matchers. Saying so is
    // better than printing a plausible YAML document that no code ever reads.
    process.stdout.write(
      `\nThis rule is a compiled AST matcher in the local engine, not a YAML\n` +
        `document — there is no rule source to print. It runs against the parsed\n` +
        `syntax tree, which is why it can tell an interpolated query from a safe one.\n`,
    );
  }
}

/**
 * Checks a rule file against the conventions this repo owns.
 *
 * Structural validation runs here, always, because it needs nothing but the
 * file: the id scheme, the vocabularies, the PCI-DSS numbers v4.0 renumbered.
 * Posting the file to a server to learn that `severity: hgih` is misspelled was
 * a round trip for an answer already in the binary — and with no backend, no
 * answer at all.
 *
 * When a project is configured the server is asked as well, and its errors are
 * merged in. What it knows that this does not is semantics: whether a pattern
 * compiles, and whether it matches what the author thinks. The output says so,
 * because a clean structural pass is not a promise the rule works.
 */
async function validateRule(path: string | undefined, globals: GlobalFlags): Promise<void> {
  if (!path) {
    throw new CliError('Which file?', { hint: 'e.g. sirius rules validate my-rule.yaml' });
  }

  const filePath = resolve(process.cwd(), path);
  if (!existsSync(filePath)) throw new CliError(`No such file: ${path}`);

  const source = readFileSync(filePath, 'utf8');
  const { validateRuleDocument } = await import('../engine/rule-schema.js');
  const local = validateRuleDocument(source);

  const problems = [...local.problems];
  let askedServer = false;

  if (!useLocalCatalog(globals)) {
    askedServer = true;
    const remote = await client(globals).validateRule(source);
    for (const error of remote.errors ?? []) {
      problems.push({
        path: error.path ?? '',
        message: error.message ?? 'unspecified error',
        severity: 'error',
      });
    }
  }

  const errors = problems.filter((problem) => problem.severity === 'error');
  const warnings = problems.filter((problem) => problem.severity === 'warning');
  const name = local.id ? `${path} (${local.id})` : path;

  const out = errors.length > 0 ? process.stderr : process.stdout;
  out.write(errors.length > 0 ? `${name} is not valid\n` : `${name} is valid\n`);

  for (const problem of [...errors, ...warnings]) {
    const mark = problem.severity === 'error' ? 'error' : 'warn ';
    out.write(`  ${mark}  ${problem.path ? `${problem.path}: ` : ''}${problem.message}\n`);
    if (problem.hint) out.write(`         ${problem.hint}\n`);
  }

  // Never let a green tick claim more than it checked.
  out.write(
    askedServer
      ? `\nChecked: schema, vocabularies and clause numbers here; patterns by the API.\n`
      : `\nChecked: schema, vocabularies and clause numbers. Whether the pattern matches\n` +
          `what you think it matches is not checked — that needs the rule engine.\n`,
  );

  // Exit 1, not 2. An invalid rule is the answer to the question asked, the same
  // way findings are — the CLI did its job. Exit 2 is reserved for the CLI
  // itself failing, and a pipeline that cannot tell those apart will treat a
  // typo in a rule file as a broken build agent.
  if (errors.length > 0) {
    out.write(`\n${errors.length} error(s)${warnings.length > 0 ? `, ${warnings.length} warning(s)` : ''}.\n`);
    process.exitCode = ExitCode.FINDINGS;
  }
}

/** `#ff5c5c` → `255;92;92` for a truecolor escape. */
function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const int = Number.parseInt(value, 16);
  return `${(int >> 16) & 255};${(int >> 8) & 255};${int & 255}`;
}
