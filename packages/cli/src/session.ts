/**
 * The last-scan cache: `.finsec/last-scan.json`.
 *
 * Exists because the demo runs `finsec fix FIN-SEC-001` — a rule id, with no
 * scan id — while the endpoint is keyed by scan id plus finding id. Rather than
 * make the user paste UUIDs, every scan records enough to resolve a rule id back
 * to the findings it produced (decisions.md D-007).
 *
 * `.finsec/` is gitignored. Nothing sensitive goes in here: file paths, line
 * numbers, rule ids, and the scan id — never snippets, which can contain the
 * very secrets we just found.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Finding, Severity } from './domain.js';

const DIR = '.finsec';
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
 * Resolve a user-supplied identifier — a rule id like `FIN-SEC-001`, a finding
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
