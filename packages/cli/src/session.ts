/**
 * The last-scan cache: `.sirius/last-scan.json`.
 *
 * Exists because the demo runs `sirius fix SIR-SEC-001` — a rule id, with no
 * scan id — while the endpoint is keyed by scan id plus finding id. Rather than
 * make the user paste UUIDs, every scan records enough to resolve a rule id back
 * to the findings it produced (decisions.md D-007).
 *
 * `.sirius/` is gitignored. Nothing sensitive goes in here: file paths, line
 * numbers, rule ids, and the scan id — never snippets, which can contain the
 * very secrets we just found.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { findProjectRoot } from './config/load.js';
import type { Finding, Severity } from './domain.js';

const DIR = '.sirius';
const FILE = 'last-scan.json';

export interface CachedFinding {
  id: string;
  rule_id: string;
  file: string;
  line: number;
  severity: Severity;
  fix_action?: string;
}

export interface LastScan {
  schema_version: 1;
  scan_id: string;
  project_id: string | null;
  scanned_at: string;
  root: string;
  /**
   * How the findings were produced. `fix` needs this: a local-engine scan has
   * no server-side scan id but can still be fixed from the source on disk,
   * while a replayed fixture cannot be fixed at all.
   */
  source?: 'api' | 'local' | 'replay';
  findings: CachedFinding[];
}

export function lastScanPath(root: string): string {
  return join(root, DIR, FILE);
}

export function saveLastScan(root: string, scan: Omit<LastScan, 'schema_version' | 'scanned_at'>): void {
  const path = lastScanPath(root);
  const payload: LastScan = {
    schema_version: 1,
    scanned_at: new Date().toISOString(),
    ...scan,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

export function loadLastScan(root: string): LastScan | undefined {
  const path = lastScanPath(root);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as LastScan;
    // A cache from a future version is not worth guessing at.
    if (parsed.schema_version !== 1) return undefined;
    return parsed;
  } catch {
    // A corrupt cache is a nuisance, not an error — the user can re-scan.
    return undefined;
  }
}

/** Strip a finding down to what the cache stores. */
export function toCached(finding: Finding): CachedFinding {
  return {
    id: finding.id,
    rule_id: finding.rule_id,
    file: finding.file,
    line: finding.line,
    severity: finding.severity,
    ...(finding.fix_action ? { fix_action: finding.fix_action } : {}),
  };
}

/**
 * Resolve a user-supplied identifier — a rule id like `SIR-SEC-001`, a finding
 * UUID, or a `file:line` — against the cache.
 */
export function resolveFindings(cache: LastScan, identifier: string): CachedFinding[] {
  const needle = identifier.trim();
  const exact = cache.findings.filter((f) => f.id === needle);
  if (exact.length > 0) return exact;

  const byRule = cache.findings.filter((f) => f.rule_id.toLowerCase() === needle.toLowerCase());
  if (byRule.length > 0) return byRule;

  return cache.findings.filter((f) => `${f.file}:${f.line}` === needle);
}

/**
 * Finds the most recent scan cache, searching the way a user expects.
 *
 * `sirius scan contract/fixtures/chaos-repo` writes its cache *inside the
 * target*, but `sirius fix SIR-SEC-001` is then run from wherever the user
 * happens to be — usually the repo root. Looking only in the working directory
 * meant the documented two-command sequence failed with "no recent scan".
 *
 * Order: an explicit path, then the working directory and its project root,
 * then the most recently written cache beneath the working directory.
 */
export function locateLastScan(
  cwd: string,
  explicit?: string,
): { root: string; cache: LastScan; how: 'explicit' | 'here' | 'project' | 'search' } | undefined {
  const candidates: Array<[string, 'explicit' | 'here' | 'project']> = [];
  if (explicit) candidates.push([resolve(cwd, explicit), 'explicit']);
  candidates.push([cwd, 'here']);

  const projectRoot = findProjectRoot(cwd)?.dir;
  if (projectRoot) candidates.push([projectRoot, 'project']);

  for (const [root, how] of candidates) {
    const cache = loadLastScan(root);
    if (cache) return { root, cache, how };
  }

  // Nothing nearby: fall back to the newest cache under the working directory,
  // which is what makes `scan <subdir>` then `fix` from the root work.
  //
  // Reported as a search, and the caller says so out loud, because this is a
  // guess and `fix` writes to source files. Silently picking a scan the user
  // never mentioned and editing those files is not a recoverable mistake.
  const found = newestCacheUnder(cwd);
  if (found) {
    const cache = loadLastScan(found);
    if (cache) return { root: found, cache, how: 'search' };
  }

  return undefined;
}

/** The directory of the most recently written `.sirius/last-scan.json` below `from`. */
function newestCacheUnder(from: string, depth = 4): string | undefined {
  let best: { dir: string; at: number } | undefined;

  const visit = (dir: string, remaining: number) => {
    if (remaining < 0) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skipping these is what keeps the walk cheap enough to be worth doing.
      if (entry.name === 'node_modules' || entry.name === '.git') continue;

      const child = join(dir, entry.name);
      if (entry.name === DIR) {
        try {
          const at = statSync(join(child, FILE)).mtimeMs;
          if (!best || at > best.at) best = { dir, at };
        } catch {
          // No cache file in this .sirius directory.
        }
        continue;
      }
      visit(child, remaining - 1);
    }
  };

  visit(from, depth);
  return best?.dir;
}
