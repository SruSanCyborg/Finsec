/**
 * Scan history on disk: `.sirius/scans/<id>.json`.
 *
 * `.sirius/last-scan.json` holds exactly one scan, because everything that read
 * it — `fix`, `report`, `badge` — only ever wanted the most recent one. A second
 * surface changes that: the GUI has a scan history view, and a history that
 * forgets everything but the last row is not a history.
 *
 * This is the file that makes the two surfaces one product. A scan run in the
 * terminal is written here, so it appears in the GUI without the GUI having
 * asked for it; a scan started from the GUI is written the same way, so `sirius
 * report` and `sirius fix` can act on it from a shell. Neither surface owns the
 * record — the project directory does.
 *
 * Deliberately the same discipline as the last-scan cache: no snippets. The
 * snippet carries the redacted secret, and a directory that accumulates one
 * file per scan is the last place to let even redacted credentials pile up.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { CachedFinding, CachedSummary } from '../session.js';
import type { ScanStatus } from '../domain.js';

const DIR = '.sirius';
const SUBDIR = 'scans';

/**
 * How many scans a project keeps.
 *
 * Unbounded, a `watch` session writes one of these per save and the directory
 * grows without limit — and the GUI's history view reads all of them to render
 * a list that shows twenty. The cap is applied on write, so the cost is paid by
 * the process that created the surplus.
 */
const KEEP = 50;

export interface StoredScan {
  schema_version: 1;
  id: string;
  project_id: string | null;
  /** The directory that was scanned, absolute. */
  target: string;
  status: ScanStatus;
  started_at: string;
  finished_at: string | null;
  /** `local` for the built-in engine, `api` for a hosted scan, `replay` for a fixture. */
  source: 'api' | 'local' | 'replay';
  /** Which surface asked for it. Shown in the GUI's history so a terminal run is legible there. */
  origin: 'cli' | 'gui';
  rulesets: string[];
  severity_threshold: string | null;
  fail_on: string | null;
  exit_code: number | null;
  summary: CachedSummary | null;
  findings: CachedFinding[];
  /** Set when the scan failed, so the history row can say why rather than showing an empty scan. */
  error?: string;
}

export const scansDir = (root: string): string => join(root, DIR, SUBDIR);

const scanPath = (root: string, id: string): string => join(scansDir(root), `${sanitise(id)}.json`);

/**
 * Scan ids reach this from a URL path segment, so they are attacker-controlled
 * in the only sense that matters here: a `..` in one would write outside the
 * project. Ids the engine generates never need this; the one that does is the
 * one that came off the wire.
 */
function sanitise(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128) || 'unnamed';
}

export function saveScan(root: string, scan: StoredScan): void {
  const dir = scansDir(root);
  mkdirSync(dir, { recursive: true });
  writeFileSync(scanPath(root, scan.id), JSON.stringify(scan, null, 2) + '\n', 'utf8');
  prune(dir);
}

export function loadScan(root: string, id: string): StoredScan | undefined {
  const path = scanPath(root, id);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredScan;
    return parsed.schema_version === 1 ? parsed : undefined;
  } catch {
    // A corrupt record is one missing row in a list, not a reason to fail the
    // request that asked for the list.
    return undefined;
  }
}

/** A scan's `target` is at or under `underPath` — path-boundary aware, so `/foo/bar` never matches a target of `/foo/barbaz`. */
function isWithin(underPath: string, target: string): boolean {
  const rel = relative(underPath, target);
  return rel === '' || !rel.startsWith('..');
}

/**
 * Newest first, which is the order every caller wants and none should re-sort.
 *
 * `underPath`, when given, restricts results to scans whose `target` was that
 * directory or something inside it. Several projects can share one `.sirius/`
 * store — `findProjectRoot` walks up to the nearest `sirius.yaml`, so two
 * directories in the same repo resolve to the same store — and without this a
 * project's history page shows every scan ever run against any of them,
 * indistinguishably. Filtering means reading every record instead of just the
 * newest `limit`, since membership depends on a field inside the file; the
 * directories this runs against hold tens of scans, not thousands.
 */
export function listScans(root: string, limit = KEEP, underPath?: string): StoredScan[] {
  const dir = scansDir(root);
  if (!existsSync(dir)) return [];

  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }

  const byAge = names
    .map((name) => {
      const full = join(dir, name);
      try {
        return { full, at: statSync(full).mtimeMs };
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is { full: string; at: number } => entry !== undefined)
    .sort((a, b) => b.at - a.at);

  const parse = (full: string): StoredScan | undefined => {
    try {
      const parsed = JSON.parse(readFileSync(full, 'utf8')) as StoredScan;
      return parsed.schema_version === 1 ? parsed : undefined;
    } catch {
      return undefined;
    }
  };

  if (!underPath) {
    return byAge
      .slice(0, limit)
      .map((entry) => parse(entry.full))
      .filter((scan): scan is StoredScan => scan !== undefined);
  }

  return byAge
    .map((entry) => parse(entry.full))
    .filter((scan): scan is StoredScan => scan !== undefined)
    .filter((scan) => isWithin(underPath, scan.target))
    .slice(0, limit);
}

export function deleteScan(root: string, id: string): boolean {
  const path = scanPath(root, id);
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}

function prune(dir: string): void {
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.json'));
  } catch {
    return;
  }
  if (names.length <= KEEP) return;

  const byAge = names
    .map((name) => {
      const full = join(dir, name);
      try {
        return { full, at: statSync(full).mtimeMs };
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is { full: string; at: number } => entry !== undefined)
    .sort((a, b) => b.at - a.at);

  for (const stale of byAge.slice(KEEP)) rmSync(stale.full, { force: true });
}
