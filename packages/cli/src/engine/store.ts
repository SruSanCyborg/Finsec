/**
 * Baselines, suppressions and triage decisions, stored beside the project.
 *
 * `baseline` and `suppress` were written when the CLI was a pure client:
 * fingerprints were "computed server-side — the CLI has no engine". It has one
 * now, and it is the thing that actually produces the fingerprints, so asking a
 * server that is not running made both commands unusable in the configuration
 * everything else defaults to. `triage` had the same fault and is here for the
 * same reason.
 *
 * These are what make a linter adoptable on an existing codebase. A repo with
 * four hundred findings cannot fix them all today; it can agree that today is
 * the floor, record what it has looked at, and gate on what comes next.
 * Without that, the tool gets switched off in a week.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DIR = '.sirius';

export interface Baseline {
  schema_version: 1;
  commit_sha: string | null;
  created_at: string;
  /** Fingerprints accepted as the floor. Line-insensitive, so reformatting is safe. */
  fingerprints: string[];
}

export interface Suppression {
  rule_id?: string;
  path_glob?: string;
  fingerprint?: string;
  /** Mandatory. A suppression without a stated reason is an unexplained hole. */
  reason: string;
  /**
   * ISO-8601, or null for permanent.
   *
   * Modelled on `.snyk`'s expiring ignores: a suppression that never expires is
   * how a temporary exception becomes permanent policy nobody remembers taking.
   */
  expires_at: string | null;
  created_at: string;
}

export const baselinePath = (root: string): string => join(root, DIR, 'baseline.json');
export const suppressionsPath = (root: string): string => join(root, DIR, 'suppressions.json');

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    // Corrupt state is a nuisance, not a reason to refuse to scan.
    return undefined;
  }
}

function writeJson(path: string, value: unknown): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  ensureCacheIgnored(dir);
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/**
 * `.sirius/` holds two different kinds of thing, and only one belongs in git.
 *
 * The baseline, the suppressions and the triage decisions are arguments a team
 * makes about its own risk — they should be reviewed in a pull request like any
 * other. `last-scan.json` is a cache of the last run, different on every
 * machine and every scan. Write the distinction down once, when the directory
 * is first created, rather than telling the user to commit a directory that
 * also carries churn.
 */
function ensureCacheIgnored(dir: string): void {
  const path = join(dir, '.gitignore');
  if (existsSync(path)) return;
  writeFileSync(
    path,
    '# Decisions belong in review. The scan cache does not.\nlast-scan.json\n',
    'utf8',
  );
}

// ---- baseline --------------------------------------------------------------

export function loadBaseline(root: string): Baseline | undefined {
  const found = readJson<Baseline>(baselinePath(root));
  return found?.schema_version === 1 ? found : undefined;
}

export function saveBaseline(root: string, commit: string | null, fingerprints: string[]): Baseline {
  const baseline: Baseline = {
    schema_version: 1,
    commit_sha: commit,
    created_at: new Date().toISOString(),
    // Sorted and de-duplicated so two baselines of the same tree compare equal.
    fingerprints: [...new Set(fingerprints)].sort(),
  };
  writeJson(baselinePath(root), baseline);
  return baseline;
}

/** SARIF's own vocabulary: `new`, `unchanged`, `absent`. */
export type BaselineState = 'new' | 'unchanged' | 'absent';

export function classify(
  fingerprint: string | undefined,
  baseline: Baseline | undefined,
): BaselineState {
  if (!baseline) return 'new';
  if (!fingerprint) return 'new';
  return baseline.fingerprints.includes(fingerprint) ? 'unchanged' : 'new';
}

// ---- suppressions ----------------------------------------------------------

export function loadSuppressions(root: string): Suppression[] {
  return readJson<Suppression[]>(suppressionsPath(root)) ?? [];
}

export function addSuppression(root: string, entry: Suppression): Suppression[] {
  const all = loadSuppressions(root);
  all.push(entry);
  writeJson(suppressionsPath(root), all);
  return all;
}

export function removeSuppression(
  root: string,
  ruleId: string,
): { removed: number; remaining: Suppression[] } {
  const all = loadSuppressions(root);
  const remaining = all.filter((s) => s.rule_id?.toUpperCase() !== ruleId.toUpperCase());
  writeJson(suppressionsPath(root), remaining);
  return { removed: all.length - remaining.length, remaining };
}

/** True once `expires_at` is in the past. Expired entries stop suppressing. */
export function isExpired(entry: Suppression, now = new Date()): boolean {
  if (!entry.expires_at) return false;
  const at = Date.parse(entry.expires_at);
  return Number.isFinite(at) && at <= now.getTime();
}

/** Minimal glob: `*` within a path segment, `**` across segments. */
export function matchesGlob(pattern: string, path: string): boolean {
  const DOUBLE = '\u0000';
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, DOUBLE)
    .replace(/\*/g, '[^/]*')
    .split(DOUBLE)
    .join('.*');
  return new RegExp(`^${escaped}$`).test(path);
}

export interface SuppressibleFinding {
  rule_id: string;
  file: string;
  fingerprint?: string;
}

/**
 * The suppression that silences a finding, if any.
 *
 * An entry with several fields set must match on all of them — narrowing a
 * suppression should never widen it, which is what OR-ing the fields would do.
 */
export function findSuppression(
  finding: SuppressibleFinding,
  suppressions: readonly Suppression[],
  now = new Date(),
): Suppression | undefined {
  return suppressions.find((entry) => {
    if (isExpired(entry, now)) return false;
    if (!entry.rule_id && !entry.path_glob && !entry.fingerprint) return false;

    if (entry.rule_id && entry.rule_id.toUpperCase() !== finding.rule_id.toUpperCase()) return false;
    if (entry.fingerprint && entry.fingerprint !== finding.fingerprint) return false;
    if (entry.path_glob && !matchesGlob(entry.path_glob, finding.file)) return false;

    return true;
  });
}

// ---- triage ----------------------------------------------------------------

/**
 * A judgement recorded against one finding.
 *
 * `suppress` answers "silence this rule"; triage answers "I looked at this one
 * and here is what I decided". The distinction matters for an auditor: an
 * accepted finding is an acknowledged risk that still fails the gate, while a
 * dismissed one is a claim that the finding was wrong.
 */
export interface TriageDecision {
  rule_id: string;
  file: string;
  line: number;
  fingerprint?: string;
  state: 'accepted' | 'dismissed' | 'suppressed';
  /** Required for dismissed and suppressed; absent for accepted. */
  reason?: string;
  decided_at: string;
}

export const triagePath = (root: string): string => join(root, DIR, 'triage.json');

/**
 * Identity of a finding for the purpose of remembering a decision about it.
 *
 * The fingerprint when there is one, because it survives the code moving down
 * the file. Otherwise rule plus location, which does not — but a decision
 * recorded against the wrong line is better than a decision silently lost.
 */
export function triageKey(finding: {
  rule_id: string;
  file: string;
  line: number;
  fingerprint?: string | null;
}): string {
  return finding.fingerprint
    ? `fp:${finding.fingerprint}`
    : `${finding.rule_id.toUpperCase()}@${finding.file}:${finding.line}`;
}

export function loadTriage(root: string): TriageDecision[] {
  return readJson<TriageDecision[]>(triagePath(root)) ?? [];
}

/**
 * Forgets a decision, so the finding is open again.
 *
 * Undo has to be a real operation rather than "decide the other way": accepted,
 * dismissed and suppressed are three claims, and none of them means "I have not
 * looked at this yet". Without it, a mis-keyed verdict is permanent.
 */
export function clearTriage(root: string, key: string): TriageDecision[] {
  const remaining = loadTriage(root).filter((entry) => triageKey(entry) !== key);
  writeJson(triagePath(root), remaining);
  return remaining;
}

/** Records a decision, replacing any earlier one about the same finding. */
export function recordTriage(root: string, decision: TriageDecision): TriageDecision[] {
  const key = triageKey(decision);
  const all = loadTriage(root).filter((entry) => triageKey(entry) !== key);
  all.push(decision);
  writeJson(triagePath(root), all);
  return all;
}
