/**
 * `sirius rules list|show|validate|test`
 *
 * `test` is deliberately absent: it would need to run a rule against a fixture,
 * which means either a local rule engine — violating the golden rule that the
 * CLI is a pure client — or an endpoint the contract does not have. It is
 * tracked as blocked on the `auto` branch rather than faked here.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ApiClient } from '../api/client.js';
import { CliError } from '../api/errors.js';
import { loadConfig } from '../config/load.js';
import { SEVERITY_COLOR, detectCapabilities } from '../ui/theme.js';
import type { Rule } from '../domain.js';

interface RulesFlags {
  category?: string;
  ruleset?: string;
  json?: boolean;
}

interface GlobalFlags {
  apiUrl?: string;
  profile?: string;
  color?: boolean;
}

function client(globals: GlobalFlags): ApiClient {
  const config = loadConfig({
    cwd: process.cwd(),
    overrides: { apiUrl: globals.apiUrl, profile: globals.profile },
  });
  return new ApiClient({ baseUrl: config.apiUrl, apiKey: config.apiKey });
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
  const rules = await client(globals).listRules({
    ...(flags.category ? { category: flags.category } : {}),
    ...(flags.ruleset ? { ruleset: flags.ruleset } : {}),
  });

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
  process.stdout.write(`\n${rules.length} rule${rules.length === 1 ? '' : 's'}\n`);
}

async function showRule(ruleId: string | undefined, flags: RulesFlags, globals: GlobalFlags): Promise<void> {
  if (!ruleId) {
    throw new CliError('Which rule?', { hint: 'e.g. sirius rules show SIR-SEC-001' });
  }

  const rule = await client(globals).getRule(ruleId);

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
}

async function validateRule(path: string | undefined, globals: GlobalFlags): Promise<void> {
  if (!path) {
    throw new CliError('Which file?', { hint: 'e.g. sirius rules validate my-rule.yaml' });
  }

  const filePath = resolve(process.cwd(), path);
  if (!existsSync(filePath)) throw new CliError(`No such file: ${path}`);

  const result = await client(globals).validateRule(readFileSync(filePath, 'utf8'));

  if (result.valid) {
    process.stdout.write(`${path} is valid\n`);
    return;
  }

  process.stderr.write(`${path} is not valid\n`);
  for (const error of result.errors ?? []) {
    process.stderr.write(`  ${error.path ? `${error.path}: ` : ''}${error.message ?? 'unspecified error'}\n`);
  }
  // A failed validation is the answer to the question asked, not a CLI failure —
  // but it must be non-zero so CI can gate on it.
  throw new CliError(`${(result.errors ?? []).length} schema error(s).`);
}

/** `#ff5c5c` → `255;92;92` for a truecolor escape. */
function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const int = Number.parseInt(value, 16);
  return `${(int >> 16) & 255};${(int >> 8) & 255};${int & 255}`;
}
