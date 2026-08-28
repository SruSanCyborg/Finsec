/**
 * Layered config resolution.
 *
 * Precedence, highest first (decided in AGENTS.md — the PRD names the files but
 * never orders them):
 *
 *   1. CLI flags
 *   2. environment (SIRIUS_*)
 *   3. .siriuslintrc   nearest directory, walking up toward the project root
 *   4. sirius.yaml     project root
 *   5. ~/.config/sirius/config.toml
 *   6. built-in defaults
 *
 * `.siriuslintrc` files merge shallowly from the outermost inward, so a nested
 * directory can override its parent without restating everything.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, parse as parsePath, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';

import { CliError } from '../api/errors.js';
import {
  DEFAULTS,
  configTomlSchema,
  projectConfigSchema,
  rcConfigSchema,
} from './schema.js';
import type { ConfigOverrides, ConfigToml, ProjectConfig, ResolvedConfig } from './schema.js';

const PROJECT_FILES = ['sirius.yaml', 'sirius.yml'];
const RC_FILE = '.siriuslintrc';

export function configTomlPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, 'sirius', 'config.toml') : join(homedir(), '.config', 'sirius', 'config.toml');
}

/** Reads and validates a file, reporting the path when it is malformed. */
function readConfigFile<T>(path: string, parse: (raw: string) => unknown, schema: { parse: (v: unknown) => T }): T {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new CliError(`Cannot read ${path}`, { cause });
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (cause) {
    throw new CliError(`${path} is not valid ${path.endsWith('.toml') ? 'TOML' : 'YAML'}`, { cause });
  }

  warnAboutUnknownKeys(path, parsed, schema as unknown as { shape?: Record<string, unknown> });

  try {
    return schema.parse(parsed ?? {});
  } catch (cause) {
    throw new CliError(`${path} has invalid settings`, { hint: describeZodIssues(cause), cause });
  }
}

/**
 * Says something about a key nobody will ever read.
 *
 * Zod objects are non-strict, so `min_complaince_score: 80` parses cleanly and
 * applies nothing. A misspelled *gate* key means the gate silently does not
 * exist — the config looks stricter than the run actually is, which is the
 * direction that matters.
 *
 * A warning rather than an error, deliberately. A hard failure would turn a
 * typo into a broken build for teams whose config was written against a newer
 * version of the tool, and this file is read on every single command. Saying it
 * once on stderr keeps machine output clean and still reaches a person.
 *
 * Only the top level and `policy:` are checked: those are where the gate lives,
 * and `revenue:` is a large nested surface where a false alarm would be worse
 * than the silence.
 */
function warnAboutUnknownKeys(path: string, parsed: unknown, schema: { shape?: Record<string, unknown> }): void {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
  const shape = schema.shape;
  if (!shape) return;

  const unknown = Object.keys(parsed as Record<string, unknown>).filter((key) => !(key in shape));

  const policy = (parsed as { policy?: unknown }).policy;
  const policyKeys = ['fail_on_severity', 'max_new_findings', 'require_no_verified_secrets', 'min_compliance_score'];
  if (typeof policy === 'object' && policy !== null && !Array.isArray(policy)) {
    for (const key of Object.keys(policy as Record<string, unknown>)) {
      if (!policyKeys.includes(key)) unknown.push(`policy.${key}`);
    }
  }

  if (unknown.length === 0) return;
  process.stderr.write(
    `note: ${path} — ${unknown.length === 1 ? 'this setting is' : 'these settings are'} not recognised ` +
      `and will be ignored: ${unknown.join(', ')}\n`,
  );
}

/**
 * Turns a Zod failure into something that names the key and the value.
 *
 * The hint was `cause.message.split('\n')[0]`, and a Zod error's message is a
 * pretty-printed JSON array — so the first line is the opening bracket, and the
 * whole error read:
 *
 *     error: sirius.yaml has invalid settings
 *       [
 *
 * Which is the least useful string the program could have chosen. Every
 * hand-written error in this CLI names the problem and the fix; this one named
 * a punctuation mark.
 *
 * At most three issues, because a config with ten mistakes is usually one
 * mistake — a mis-indented block — and printing ten lines buries the first.
 */
function describeZodIssues(cause: unknown): string | undefined {
  const issues = (cause as { issues?: { path?: (string | number)[]; message?: string }[] })?.issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    return cause instanceof Error ? cause.message.split('\n')[0] : undefined;
  }

  const described = issues.slice(0, 3).map((issue) => {
    const where = (issue.path ?? []).join('.');
    return where ? `${where}: ${issue.message}` : (issue.message ?? 'invalid');
  });

  const more = issues.length > described.length ? ` (and ${issues.length - described.length} more)` : '';
  return `${described.join('; ')}${more}`;
}

/** Walks up from `from` to the filesystem root, nearest directory first. */
function ancestors(from: string): string[] {
  const chain: string[] = [];
  let dir = resolve(from);
  const { root } = parsePath(dir);
  while (true) {
    chain.push(dir);
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return chain;
}

/** The nearest ancestor containing a `sirius.yaml`, if any. */
export function findProjectRoot(from: string): { dir: string; file: string } | undefined {
  for (const dir of ancestors(from)) {
    for (const name of PROJECT_FILES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return { dir, file: candidate };
    }
  }
  return undefined;
}

function envOverrides(): ConfigOverrides {
  const env = process.env;
  return {
    apiUrl: env.SIRIUS_API_URL,
    wsUrl: env.SIRIUS_WS_URL,
    apiKey: env.SIRIUS_API_KEY,
    projectId: env.SIRIUS_PROJECT_ID,
    profile: env.SIRIUS_PROFILE,
  };
}

/** Drops undefined values so a later layer does not clobber an earlier one. */
function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export interface LoadOptions {
  /** Directory the scan targets; the search for config files starts here. */
  cwd: string;
  overrides?: ConfigOverrides;
}

export function loadConfig({ cwd, overrides = {} }: LoadOptions): ResolvedConfig {
  const sources: Record<string, string> = {};
  const note = (key: string, source: string, value: unknown) => {
    if (value !== undefined) sources[key] = source;
  };

  // ---- layer 6/5: defaults, then the user's global config.toml
  let toml: ConfigToml = {};
  const tomlPath = configTomlPath();
  if (existsSync(tomlPath)) {
    toml = readConfigFile(tomlPath, (raw) => parseToml(raw), configTomlSchema);
  }
  const profileName = overrides.profile ?? process.env.SIRIUS_PROFILE ?? toml.default_profile ?? 'default';
  const profile = toml.profile?.[profileName] ?? {};
  if (overrides.profile && !toml.profile?.[overrides.profile]) {
    throw new CliError(`No profile named "${overrides.profile}" in ${tomlPath}`, {
      hint: `Known profiles: ${Object.keys(toml.profile ?? {}).join(', ') || '(none)'}`,
    });
  }
  note('apiKey', tomlPath, profile.api_key);
  note('apiUrl', tomlPath, profile.api_url);
  note('projectId', tomlPath, profile.project_id);

  // ---- layer 4: sirius.yaml at the project root
  const explicit = overrides.configFile ? resolve(overrides.configFile) : undefined;
  if (explicit && !existsSync(explicit)) {
    throw new CliError(`Config file not found: ${overrides.configFile}`);
  }
  const project = explicit
    ? { dir: dirname(explicit), file: explicit }
    : findProjectRoot(cwd);

  let projectConfig: ProjectConfig = {};
  if (project) {
    projectConfig = readConfigFile(project.file, (raw) => parseYaml(raw), projectConfigSchema);
    for (const key of Object.keys(defined(projectConfig))) note(key, project.file, true);
  }

  // ---- layer 3: .siriuslintrc files, outermost first so nearest wins
  const rcRoot = project?.dir ?? parsePath(resolve(cwd)).root;
  const rcChain = ancestors(cwd)
    .filter((dir) => dir === rcRoot || dir.startsWith(rcRoot))
    .reverse();

  let rcConfig: ProjectConfig = {};
  for (const dir of rcChain) {
    const candidate = join(dir, RC_FILE);
    if (!existsSync(candidate)) continue;
    const parsed = readConfigFile(candidate, (raw) => parseYaml(raw), rcConfigSchema);
    rcConfig = { ...rcConfig, ...defined(parsed) };
    for (const key of Object.keys(defined(parsed))) note(key, candidate, true);
  }

  // ---- layers 2 and 1: env, then flags
  const env = defined(envOverrides());
  for (const key of Object.keys(env)) note(key, 'environment', true);
  const flags = defined(overrides);
  for (const key of Object.keys(flags)) note(key, 'flag', true);

  const merged = { ...projectConfig, ...rcConfig };
  const layered = { ...profile, ...env, ...flags } as ConfigOverrides & typeof profile;

  const apiUrl = layered.apiUrl ?? merged.api_url ?? profile.api_url ?? DEFAULTS.apiUrl;

  return {
    apiUrl,
    wsUrl: layered.wsUrl ?? merged.ws_url ?? profile.ws_url,
    apiKey: layered.apiKey ?? profile.api_key,
    projectId: layered.projectId ?? merged.project_id ?? profile.project_id,
    rulesets: flags.rulesets ?? merged.rulesets ?? [...DEFAULTS.rulesets],
    severityThreshold: flags.severityThreshold ?? merged.severity_threshold ?? DEFAULTS.severityThreshold,
    failOn: flags.failOn ?? merged.fail_on ?? DEFAULTS.failOn,
    validateSecrets: flags.validateSecrets ?? merged.validate_secrets ?? DEFAULTS.validateSecrets,
    diffAware: flags.diffAware ?? merged.diff_aware ?? DEFAULTS.diffAware,
    baselineCommit: flags.baselineCommit ?? merged.baseline_commit,
    exclude: merged.exclude ?? [],
    policy: merged.policy,
    revenue: merged.revenue,
    sources,
  };
}

/**
 * Reads `.siriusignore` if present. Returns glob patterns in gitignore style;
 * blank lines and `#` comments are dropped.
 */
export function loadIgnorePatterns(dir: string): string[] {
  const path = join(dir, '.siriusignore');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}
