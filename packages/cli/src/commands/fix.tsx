/**
 * `finsec fix [finding]` — request a Cerebus suggestion and optionally apply it.
 *
 * Applying a diff is the only place this CLI writes to the user's files, so the
 * safety rules here are deliberate and non-negotiable:
 *
 *   - never apply when the verifier did not pass (`fail` or `escalated`)
 *   - the API returns a diff against a snippet, not the file, so re-locate the
 *     hunk by content rather than trusting the line number
 *   - refuse if the file changed since the scan
 *   - back up before writing
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render, Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';

import { ApiClient } from '../api/client.js';
import { CliError } from '../api/errors.js';
import { loadConfig, findProjectRoot } from '../config/load.js';
import { loadLastScan, resolveFindings } from '../session.js';
import { ApplyPrompt, CerebusPanel, DiffView } from '../ui/FixView.js';
import { COLOR, detectCapabilities, glyphsFor } from '../ui/theme.js';
import type { ApplyChoice } from '../ui/FixView.js';
import type { CachedFinding } from '../session.js';
import type { FixSuggestion } from '../domain.js';

interface FixFlags {
  all?: boolean;
  apply?: boolean;
}

interface GlobalFlags {
  apiUrl?: string;
  project?: string;
  profile?: string;
  color?: boolean;
}

/** Split a unified diff into the lines it removes and the lines it adds. */
export function parseDiff(diff: string): { removed: string[]; added: string[] } {
  const removed: string[] = [];
  const added: string[] = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) continue;
    if (line.startsWith('-')) removed.push(line.slice(1).trim());
    else if (line.startsWith('+')) added.push(line.slice(1).trim());
  }
  return { removed, added };
}

/**
 * Apply a snippet-level diff to a real file.
 *
 * Finds the removed line by content near the reported line number rather than
 * trusting the number outright — the file may have shifted since the scan, and
 * writing to the wrong line of someone's payment code is far worse than
 * refusing to write at all.
 */
export function applyDiffToFile(filePath: string, expectedLine: number, diff: string): { backup: string } {
  const { removed, added } = parseDiff(diff);
  if (removed.length === 0 || added.length === 0) {
    throw new CliError('The suggested diff has no replacement to apply.');
  }

  const original = readFileSync(filePath, 'utf8');
  const lines = original.split('\n');
  const target = removed[0]!;

  // Search outward from the reported line so the nearest match wins.
  let index = -1;
  for (let radius = 0; radius < lines.length; radius += 1) {
    for (const candidate of [expectedLine - 1 + radius, expectedLine - 1 - radius]) {
      if (candidate < 0 || candidate >= lines.length) continue;
      if (lines[candidate]!.trim() === target) {
        index = candidate;
        break;
      }
    }
    if (index >= 0) break;
  }

  if (index < 0) {
    throw new CliError(`Could not find the line to replace in ${filePath}.`, {
      hint: 'The file has changed since the scan. Re-run `finsec scan .` and try again.',
    });
  }

  // Preserve the original indentation; the diff carries content, not layout.
  const indent = lines[index]!.match(/^\s*/)?.[0] ?? '';
  const replacement = added.map((line, i) => (i === 0 ? indent + line : indent + line));
  lines.splice(index, removed.length, ...replacement);

  const backup = `${filePath}.finsec-backup`;
  copyFileSync(filePath, backup);
  writeFileSync(filePath, lines.join('\n'), 'utf8');
  return { backup };
}

export async function runFix(identifier: string | undefined, flags: FixFlags, globals: GlobalFlags): Promise<void> {
  const cwd = process.cwd();
  const root = findProjectRoot(cwd)?.dir ?? cwd;

  const cache = loadLastScan(root);
  if (!cache) {
    throw new CliError('No recent scan to fix from.', {
      hint: 'Run `finsec scan .` first — fix resolves rule ids against the last scan.',
    });
  }

  // A replayed scan has no server-side scan to ask Cerebus about. Say so
  // plainly rather than letting the API reject a synthetic id.
  if (cache.scan_id === 'replay') {
    throw new CliError('The last scan was a replay, so there is nothing on the server to fix.', {
      hint: 'Run `finsec scan .` against a real API first.',
    });
  }

  if (!identifier && !flags.all) {
    throw new CliError('Which finding? Pass a rule id, a finding id, or --all.', {
      hint: `e.g. finsec fix ${cache.findings[0]?.rule_id ?? 'FIN-SEC-001'}`,
    });
  }

  const targets: CachedFinding[] = identifier
    ? resolveFindings(cache, identifier)
    : cache.findings.filter((f) => f.fix_action);

  if (targets.length === 0) {
    throw new CliError(`No finding in the last scan matches "${identifier}".`, {
      hint: `Known rules: ${[...new Set(cache.findings.map((f) => f.rule_id))].slice(0, 6).join(', ')}`,
    });
  }

  const queue = flags.all ? targets : targets.slice(0, 1);
  if (targets.length > 1 && !flags.all) {
    process.stderr.write(
      `note: ${targets.length} findings match; fixing the first. Use --all to walk them.\n`,
    );
  }

  const config = loadConfig({
    cwd: root,
    overrides: {
      apiUrl: globals.apiUrl,
      projectId: globals.project,
      profile: globals.profile,
    },
  });
  const client = new ApiClient({ baseUrl: config.apiUrl, apiKey: config.apiKey });

  const capabilities = detectCapabilities({ noColor: globals.color === false });
  const glyphs = glyphsFor(capabilities);

  let applied = 0;
  let acceptAll = Boolean(flags.apply);

  for (const finding of queue) {
    const suggestion = await client.requestFix(cache.scan_id, finding.id);
    const filePath = resolve(root, finding.file);

    const decision = await presentFix({
      finding,
      suggestion,
      filePath,
      glyphs,
      capabilities,
      autoAccept: acceptAll,
    });

    if (decision === 'quit') break;
    if (decision === 'all') acceptAll = true;

    if (decision === 'accept' || decision === 'all' || acceptAll) {
      if (suggestion.verifier_status !== 'pass') {
        process.stderr.write(
          `skipped ${finding.rule_id}: verifier reported "${suggestion.verifier_status}"\n`,
        );
        continue;
      }
      if (!existsSync(filePath)) {
        process.stderr.write(`skipped ${finding.rule_id}: ${finding.file} no longer exists\n`);
        continue;
      }
      const { backup } = applyDiffToFile(filePath, finding.line, suggestion.diff);
      applied += 1;
      process.stdout.write(`applied ${finding.rule_id} to ${finding.file} (backup: ${backup})\n`);

      for (const effect of suggestion.side_effects ?? []) {
        if (!effect.file) continue;
        appendSideEffect(join(root, effect.file), effect.content ?? '');
      }
    }
  }

  if (applied === 0) process.stdout.write('no changes written\n');
}

/** Appends a line to a side-effect file (e.g. `.env.example`) if not already there. */
function appendSideEffect(path: string, content: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (existing.includes(content.split('=')[0] ?? content)) return;
  writeFileSync(path, existing + (existing.endsWith('\n') || existing === '' ? '' : '\n') + content + '\n', 'utf8');
}

/** Renders one fix and resolves with the user's choice. */
function presentFix(args: {
  finding: CachedFinding;
  suggestion: FixSuggestion;
  filePath: string;
  glyphs: ReturnType<typeof glyphsFor>;
  capabilities: ReturnType<typeof detectCapabilities>;
  autoAccept: boolean;
}): Promise<ApplyChoice> {
  const { finding, suggestion, glyphs, capabilities, autoAccept } = args;

  return new Promise<ApplyChoice>((resolvePromise) => {
    const interactive = capabilities.tty && !autoAccept;

    function FixScreen() {
      const [choice, setChoice] = useState<ApplyChoice | null>(autoAccept ? 'accept' : null);

      useEffect(() => {
        if (choice) {
          const timer = setTimeout(() => resolvePromise(choice), 0);
          return () => clearTimeout(timer);
        }
      }, [choice]);

      return (
        <Box flexDirection="column">
          <CerebusPanel
            ruleId={finding.rule_id}
            suggestion={suggestion}
            glyphs={glyphs}
            capabilities={capabilities}
          />
          <DiffView
            file={finding.file}
            line={finding.line}
            diff={suggestion.diff}
            sideEffects={suggestion.side_effects}
            glyphs={glyphs}
            capabilities={capabilities}
          />
          {interactive && !choice ? (
            <ApplyPrompt
              glyphs={glyphs}
              capabilities={capabilities}
              disabled={suggestion.verifier_status !== 'pass'}
              onChoice={setChoice}
            />
          ) : (
            <Text color={capabilities.color ? COLOR.muted : undefined}>
              {suggestion.verifier_status === 'pass' ? '   applying…' : '   verifier did not pass; not applying'}
            </Text>
          )}
        </Box>
      );
    }

    const instance = render(<FixScreen />);
    instance.waitUntilExit().catch(() => resolvePromise('skip'));

    // Resolving does not unmount by itself; stop Ink once a choice is made.
    const originalResolve = resolvePromise;
    resolvePromise = ((value: ApplyChoice) => {
      instance.unmount();
      originalResolve(value);
    }) as typeof resolvePromise;
  });
}
