/**
 * The local scan engine: walk a directory, parse what it can, run the rules.
 *
 * Emits the same `WsFrame` sequence the Core API's WebSocket does, so every
 * renderer, the gate, the JSON envelope and the SARIF writer are unchanged —
 * the engine is simply another frame source alongside the socket and `--replay`.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { languageOf, parseFile } from './parse.js';
import { runManifestRules, runRules } from './rules.js';
import { matchesGlob } from './store.js';
import { manifestKind, readManifest } from './manifests.js';
import type { RawFinding, Rule } from './rules.js';
import type { Finding, WsFrame } from '../domain.js';

/** Directories never worth walking: vendored code is not the user's risk. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.sirius',
  '.next',
  'coverage',
  '.mypy_cache',
  '.pytest_cache',
]);

const MAX_FILE_BYTES = 512 * 1024;

export interface ScanEngineOptions {
  /**
   * Paths to skip, from `.siriusignore` and the config's `exclude:`.
   *
   * This field existed and was passed in and was read by nothing. The default
   * `.siriusignore` that `init` writes lists `node_modules/`, `vendor/`,
   * `dist/` — all of which are in SKIP_DIRS already — so the file appeared to
   * work while any pattern a user added themselves did nothing at all. A
   * feature that looks correct on its own defaults is the hardest kind to
   * notice is broken.
   */
  ignorePatterns?: string[];
  maxFiles?: number;
  /** The rules to run. Defaults to the whole catalogue; see `rulesFor`. */
  rules?: Rule[];
  /**
   * Also walk dependency manifests. On by default for a scan; off for callers
   * that only want parseable source, such as the fix verifier.
   */
  manifests?: boolean;
}

export function collectFiles(root: string, options: ScanEngineOptions = {}): string[] {
  const found: string[] = [];
  const limit = options.maxFiles ?? 5000;
  const ignored = options.ignorePatterns ?? [];

  /**
   * Whether a path is excluded, by the conventions a `.gitignore` reader would
   * expect: a bare name or a trailing slash means the directory and everything
   * under it, and `*` / `**` mean what they mean everywhere else.
   */
  const isIgnored = (relativePath: string): boolean => {
    if (ignored.length === 0) return false;
    const path = relativePath.split(sep).join('/');

    return ignored.some((raw) => {
      const pattern = raw.replace(/\/$/, '');
      if (matchesGlob(pattern, path)) return true;
      // `vendor` and `vendor/` both mean everything beneath it.
      if (path.startsWith(`${pattern}/`)) return true;
      // `*.min.js` should match at any depth, as it does in a .gitignore.
      if (!pattern.includes('/') && matchesGlob(pattern, path.split('/').at(-1) ?? '')) return true;
      return false;
    });
  };

  const walkDir = (dir: string) => {
    if (found.length >= limit) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (found.length >= limit) return;
      const path = join(dir, entry);

      let stats;
      try {
        stats = statSync(path);
      } catch {
        continue;
      }

      const relativePath = relative(root, path);

      if (stats.isDirectory()) {
        if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
        if (isIgnored(relativePath)) continue;
        walkDir(path);
        continue;
      }

      if (!languageOf(path) && !(options.manifests && manifestKind(path))) continue;
      if (stats.size > MAX_FILE_BYTES) continue;
      if (isIgnored(relativePath)) continue;
      found.push(path);
    }
  };

  walkDir(root);
  return found.sort();
}

/**
 * Stable across runs and line moves: rule + path + the normalised source of the
 * offending line. Deliberately *not* line-number-sensitive, so reformatting a
 * file does not invalidate every baseline entry.
 */
export function fingerprint(ruleId: string, path: string, snippet: string): string {
  const normalised = snippet.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(`${ruleId}\u0000${path}\u0000${normalised}`).digest('hex').slice(0, 32);
}

/** `# sirius-ignore: SIR-SEC-010` on the finding's line, or the line above it. */
function isSuppressed(lines: string[], finding: RawFinding): boolean {
  const candidates = [lines[finding.line - 1], lines[finding.line - 2]];
  return candidates.some((text) => {
    if (!text) return false;
    const match = /sirius-ignore:\s*([A-Z0-9-]+)/i.exec(text);
    return Boolean(match && (match[1] === finding.rule_id || match[1] === 'all'));
  });
}

/** One raw finding, in the shape the wire and every renderer expect. */
function toFinding(raw: RawFinding, shown: string): Finding {
  return {
    id: nextId(),
    file: shown,
    line: raw.line,
    col: raw.col,
    ...(raw.endLine ? { end_line: raw.endLine } : {}),
    severity: raw.severity,
    rule_id: raw.rule_id,
    category: raw.category,
    compliance_ref: raw.compliance_ref,
    message: raw.message,
    snippet: redact(raw.snippet),
    fingerprint: fingerprint(raw.rule_id, shown, raw.snippet),
    baseline_state: 'new',
    suppressed: false,
    ...(raw.validity ? { validity: raw.validity } : {}),
    ...(raw.money_at_risk_inr ? { money_at_risk_inr: raw.money_at_risk_inr } : {}),
    ...(raw.fix_action ? { fix_action: raw.fix_action } : {}),
    ...(raw.taint ? { taint: raw.taint } : {}),
  } as Finding;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `local-${counter.toString().padStart(8, '0')}`;
}

/**
 * Scans `root`, yielding the same frames the API would.
 *
 * Yielding rather than returning is what keeps findings streaming into the
 * renderer as they are discovered instead of arriving in one lump at the end.
 */
export async function* scanDirectory(root: string, options: ScanEngineOptions = {}): AsyncGenerator<WsFrame> {
  const files = collectFiles(root, { manifests: true, ...options });

  yield {
    type: 'scan.started',
    scan_id: `local-${Date.now().toString(36)}`,
    total_files: files.length,
    ts: new Date().toISOString(),
  } as WsFrame;

  const counts: Record<string, number> = {};
  let money = 0;
  let found = 0;

  for (const [index, path] of files.entries()) {
    const shown = relative(root, path) || path.split(sep).pop() || path;
    yield { type: 'file.scanning', path: shown, index: index + 1, total: files.length } as WsFrame;

    // A manifest has no syntax tree; it gets the narrow supply-chain pass.
    const manifest = manifestKind(path) ? readManifest(path) : undefined;
    if (manifest) {
      for (const raw of runManifestRules(manifest, options.rules)) {
        if (isSuppressed(manifest.lines, raw)) continue;
        found += 1;
        counts[raw.severity] = (counts[raw.severity] ?? 0) + 1;
        money += raw.money_at_risk_inr ?? 0;
        yield { type: 'finding', finding: toFinding(raw, shown) } as WsFrame;
      }
      continue;
    }

    let parsed;
    try {
      parsed = await parseFile(path);
    } catch (error) {
      yield {
        type: 'error',
        code: 'SIRIUS_ERR_PARSE',
        path: shown,
        detail: error instanceof Error ? error.message : String(error),
      } as WsFrame;
      continue;
    }
    if (!parsed) continue;

    const emitted = new Set<string>();
    for (const raw of runRules(parsed, options.rules)) {
      if (isSuppressed(parsed.lines, raw)) continue;
      // Two findings with the same fingerprint are one finding — that is what
      // the fingerprint means, and baseline and suppress already treat them as
      // one. SIR-SEC-031 matched a class-body assignment twice, once as the
      // assignment and once as the statement wrapping it, and the duplicate
      // counted twice in the totals and twice in the money while collapsing to
      // a single row in every baseline.
      const key = fingerprint(raw.rule_id, shown, raw.snippet);
      if (emitted.has(key)) continue;
      emitted.add(key);

      found += 1;
      counts[raw.severity] = (counts[raw.severity] ?? 0) + 1;
      money += raw.money_at_risk_inr ?? 0;

      yield { type: 'finding', finding: toFinding(raw, shown) } as WsFrame;
    }

    if ((index + 1) % 16 === 0) {
      yield { type: 'progress', scanned: index + 1, total: files.length, findings_so_far: found } as WsFrame;
    }
  }

  yield {
    type: 'scan.completed',
    counts,
    money_at_risk_inr: money,
    compliance_score: complianceScore(counts, files.length),
    exit_code: found > 0 ? 1 : 0,
  } as WsFrame;
}

/**
 * A secret must never leave the process intact, even into our own transcript —
 * so the literal is truncated at the point of detection, not at the point of
 * display.
 */
export function redact(snippet: string): string {
  return snippet.replace(/(['"])([^'"]{12,})\1/g, (_all, quote: string, value: string) => {
    return `${quote}${value.slice(0, 12)}…${quote}`;
  });
}

/**
 * A transparent 0–100 score: every finding costs points by severity, scaled by
 * how much code was examined so a large clean codebase is not punished for the
 * same absolute number of issues as a tiny one.
 *
 * The PRD leaves the formula undefined and the Core API is meant to own it; this
 * is the local engine's answer, and it is deliberately explainable rather than
 * tuned.
 */
export function complianceScore(counts: Record<string, number>, fileCount: number): number {
  const weights: Record<string, number> = { critical: 12, high: 6, medium: 2, low: 0.5, info: 0 };
  const penalty = Object.entries(counts).reduce(
    (sum, [severity, n]) => sum + (weights[severity] ?? 0) * n,
    0,
  );
  const scale = Math.max(1, Math.log10(Math.max(10, fileCount)));
  return Math.max(0, Math.round((100 - penalty / scale) * 10) / 10);
}
