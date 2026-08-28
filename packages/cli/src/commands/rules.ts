/**
 * `sirius rules list|show|validate|test`
 *
 * `test` is deliberately absent: it would need to run an *authored* rule against
 * a fixture, which means a YAML rule interpreter. The engine here runs compiled
 * AST matchers, so there is nothing to feed a YAML rule into. Tracked as blocked
 * on the `auto` branch rather than faked.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';

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
      return testRule(target, flags, globals);
    default:
      throw new CliError(`Unknown subcommand "${subcommand}".`, {
        hint: 'Expected one of: list, show, validate, test.',
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
  // "applies to" for a rule that reads manifests: `languages: package.json` is
  // a category error, and the field is the only place the distinction shows.
  if (rule.languages?.length) {
    const label = rule.category === 'supplychain' ? 'applies to: ' : 'languages:  ';
    process.stdout.write(`${label} ${rule.languages.join(', ')}\n`);
  }
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
    // One rule does not walk a tree, and saying it does would be exactly the
    // kind of plausible-but-false line this branch keeps deleting. A manifest
    // has no syntax tree; supply chain reads it as the line format it is.
    const readsManifests = rule.category === 'supplychain';
    process.stdout.write(
      readsManifests
        ? `\nThis rule is compiled into the local engine, not a YAML document — there\n` +
            `is no rule source to print. Unlike every other rule it does not walk a\n` +
            `syntax tree: a dependency manifest has none, so it is read as the line\n` +
            `format it is, and a floating version is only reported when no lockfile\n` +
            `governs it.\n`
        : `\nThis rule is a compiled AST matcher in the local engine, not a YAML\n` +
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

  // A directory is the likely typo, and letting readFileSync answer it printed
  // `error: EISDIR: illegal operation on a directory, read` — a Node errno is
  // not an answer to "which file did you mean?".
  if (statSync(filePath).isDirectory()) {
    throw new CliError(`${path} is a directory, and validate takes one rule file.`, {
      hint: 'e.g. sirius rules validate rules/my-rule.yaml',
    });
  }

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
          `what you think it matches is not checked here — run \`sirius rules test\` for that.\n`,
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


// ---- test -------------------------------------------------------------------

/**
 * Runs a rule against a fixture and checks it fired where it was supposed to.
 *
 * Semgrep's convention, because it is a good one and the whole project is built
 * on copying good ones: the fixture annotates its own expectations. A comment
 * `sirius-test: <rule-id>` says the *next* line must match, and `sirius-ok:
 * <rule-id>` says it must not. The fixture is therefore readable on its own,
 * and reviewing it is reviewing the rule.
 *
 * A rule that fires everywhere passes a test that only checks the lines it was
 * supposed to hit, so unexpected matches fail too.
 */
async function testRule(
  target: string | undefined,
  flags: { fixture?: string; json?: boolean },
  globals: GlobalFlags,
): Promise<void> {
  void globals;

  if (!target) {
    throw new CliError('Which rule?', {
      hint: 'e.g. sirius rules test my-rule.yaml --fixture cases/my-rule.py',
    });
  }

  const rulePath = resolve(process.cwd(), target);
  if (!existsSync(rulePath)) throw new CliError(`No such file: ${target}`);
  if (statSync(rulePath).isDirectory()) {
    throw new CliError(`${target} is a directory, and test takes one rule file.`, {
      hint: 'e.g. sirius rules test rules/my-rule.yaml',
    });
  }

  // The fixture defaults to a sibling of the rule, which is where an author
  // writing both of them would naturally put it.
  const fixturePath = flags.fixture
    ? resolve(process.cwd(), flags.fixture)
    : findFixtureBeside(rulePath);

  if (!fixturePath || !existsSync(fixturePath)) {
    throw new CliError('No fixture to run the rule against.', {
      hint: `Pass --fixture <file>, or put one beside the rule named ${basename(rulePath).replace(/\.ya?ml$/, '')}.<ext>`,
    });
  }

  const { runRuleDocument } = await import('../engine/rule-interpreter.js');
  const source = readFileSync(fixturePath, 'utf8');
  const run = await runRuleDocument(readFileSync(rulePath, 'utf8'), {
    path: fixturePath,
    source,
  });

  const expectations = expectationsIn(source, run.id);
  const fired = new Set(run.matches.map((match) => match.line));

  const missed = expectations.filter((e) => e.shouldMatch && !fired.has(e.line));
  const spurious = expectations.filter((e) => !e.shouldMatch && fired.has(e.line));
  // A line that fired with no annotation either way is not a failure — the
  // fixture is allowed to be about one rule and contain other code.
  const passed = expectations.length - missed.length - spurious.length;

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          schema: 'sirius.rules.test/v1',
          rule: run.id,
          fixture: relative(process.cwd(), fixturePath),
          expected: expectations.length,
          passed,
          missed,
          spurious,
          unsupported: run.unsupported,
          matches: run.matches,
        },
        null,
        2,
      ) + '\n',
    );
    if (missed.length + spurious.length > 0 || run.unsupported.length > 0) process.exitCode = 1;
    return;
  }

  const out: string[] = [''];
  out.push(`  ${run.id || basename(rulePath)}  against  ${relative(process.cwd(), fixturePath)}`);
  out.push('');

  if (run.error) {
    out.push(`  error: ${run.error}`);
    process.stdout.write(out.join('\n') + '\n\n');
    process.exitCode = 1;
    return;
  }

  if (expectations.length === 0) {
    out.push('  The fixture makes no claims, so this checked nothing.');
    out.push('  Annotate it:  # sirius-test: ' + (run.id || 'SIR-SEC-NNN') + '   above a line that must match,');
    out.push('                # sirius-ok:   ' + (run.id || 'SIR-SEC-NNN') + '   above one that must not.');
    process.stdout.write(out.join('\n') + '\n\n');
    process.exitCode = 1;
    return;
  }

  for (const expectation of expectations) {
    const hit = fired.has(expectation.line);
    const ok = hit === expectation.shouldMatch;
    const mark = ok ? 'ok  ' : 'FAIL';
    const wanted = expectation.shouldMatch ? 'should match' : 'should not match';
    out.push(`  ${mark}  line ${String(expectation.line).padStart(3)}  ${wanted}`);
    if (!ok) out.push(`          ${expectation.text}`);
  }

  out.push('');
  out.push(`  ${passed} of ${expectations.length} as expected.`);

  // Unsupported clauses are reported loudly and fail the run. A pattern nobody
  // executed cannot be evidence that the rule is right, and reporting a pass
  // for it is how a rule tester becomes worse than no rule tester.
  if (run.unsupported.length > 0) {
    out.push('');
    out.push('  Not everything in this rule could be executed:');
    for (const clause of run.unsupported) out.push(`    · ${clause}`);
    out.push('  The result above covers only the clauses that ran.');
  }

  process.stdout.write(out.join('\n') + '\n\n');
  if (missed.length + spurious.length > 0 || run.unsupported.length > 0) process.exitCode = 1;
}

interface Expectation {
  line: number;
  shouldMatch: boolean;
  text: string;
}

/** `# sirius-test: <id>` and `# sirius-ok: <id>`, each about the line below it. */
function expectationsIn(source: string, ruleId: string): Expectation[] {
  const lines = source.split('\n');
  const found: Expectation[] = [];

  lines.forEach((line, index) => {
    const annotation = /(?:#|\/\/)\s*sirius-(test|ok)\s*:\s*([A-Za-z0-9-]+)/.exec(line);
    if (!annotation) return;
    // An annotation naming a different rule belongs to that rule's test.
    if (ruleId && annotation[2] !== ruleId) return;

    const subject = index + 2; // the line below the comment
    found.push({
      line: subject,
      shouldMatch: annotation[1] === 'test',
      text: (lines[subject - 1] ?? '').trim(),
    });
  });

  return found;
}

/** A fixture named like the rule, sitting beside it. */
function findFixtureBeside(rulePath: string): string | undefined {
  const stem = rulePath.replace(/\.ya?ml$/, '');
  for (const extension of ['.py', '.js', '.ts', '.go', '.txt']) {
    if (existsSync(stem + extension)) return stem + extension;
  }
  return undefined;
}
