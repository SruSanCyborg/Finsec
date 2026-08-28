/**
 * `sirius fix [finding]` — request a Cerebus suggestion and optionally apply it.
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
import { loadConfig } from '../config/load.js';
import { locateLastScan, resolveFindings } from '../session.js';
import { ApplyPrompt, CerebusPanel, DiffView } from '../ui/FixView.js';
import { COLOR, detectCapabilities, glyphsFor } from '../ui/theme.js';
import type { ApplyChoice } from '../ui/FixView.js';
import type { CachedFinding } from '../session.js';
import type { FixSuggestion } from '../domain.js';

interface FixFlags {
  all?: boolean;
  apply?: boolean;
  /** Apply fixes that are not machine-applicable, rustc's term. */
  unsafeFixes?: boolean;
  /**
   * Show the panel and the diff, then stop without prompting or writing.
   *
   * The full-screen shell runs its children with stdin ignored, so an
   * interactive prompt inside one can never receive a keystroke — it simply
   * hung. The shell therefore asks for confirmation itself and re-runs with
   * `--apply`, and this is the half that renders the proposal.
   */
  dryRun?: boolean;
  /** Where the scan was run, when it was not the working directory. */
  target?: string;
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
      hint: 'The file has changed since the scan. Re-run `sirius scan .` and try again.',
    });
  }

  // Preserve the original indentation; the diff carries content, not layout.
  const indent = lines[index]!.match(/^\s*/)?.[0] ?? '';
  const replacement = added.map((line, i) => (i === 0 ? indent + line : indent + line));
  lines.splice(index, removed.length, ...replacement);

  const backup = `${filePath}.sirius-backup`;
  copyFileSync(filePath, backup);
  writeFileSync(filePath, lines.join('\n'), 'utf8');
  return { backup };
}

export async function runFix(identifier: string | undefined, flags: FixFlags, globals: GlobalFlags): Promise<void> {
  // Without a terminal there is nobody to accept the diff, and the screen that
  // asks resolves nothing — so `fix` printed `applying…`, waited forever, and
  // ended on a Node warning about an unsettled top-level await naming a path
  // inside dist/. In a pipeline it hung; from a script it looked like a crash
  // in the tool rather than a missing flag.
  //
  // `triage` already refuses this way, but it can only refuse: there is no
  // non-interactive triage. `fix` has two, so the hint names them instead of
  // telling somebody their pipeline is the wrong place to be.
  if (!flags.apply && !flags.dryRun && !process.stdin.isTTY) {
    throw new CliError('`sirius fix` needs a terminal to accept the diff.', {
      hint: 'Pass --dry-run to see the change, or --apply to take it without being asked.',
    });
  }

  const cwd = process.cwd();
  const found = locateLastScan(cwd, flags.target);
  if (!found) {
    throw new CliError('No recent scan to fix from.', {
      hint: 'Run `sirius scan .` first — fix resolves rule ids against the last scan.',
    });
  }
  const { root, cache, how } = found;

  // Always say which scan is being fixed, and make a guess unmistakable. `fix`
  // rewrites source files; picking the wrong scan and editing a directory the
  // user never named is not something they can undo by re-running.
  const when = cache.scanned_at ? ` · ${cache.scanned_at.slice(0, 19).replace('T', ' ')}` : '';
  if (how === 'search') {
    process.stderr.write(
      `note: no scan here, so using the most recent one found below ${cwd}:\n` +
        `      ${root}${when}\n` +
        `      Pass --target <dir> to choose a different one.\n`,
    );
  } else {
    process.stderr.write(`fixing from the scan of ${root}${when}\n`);
  }

  // Where the findings came from decides where the fix comes from. Read from
  // `source` and not from the id: local scans used to be filed under the id
  // `replay`, and anything still keying off that sentinel starts asking a
  // server about a scan it never ran.
  const local = cache.source !== 'api';
  if (cache.source === 'replay') {
    throw new CliError('The last scan was a replay of a recorded fixture, so there is nothing to fix.', {
      hint: 'Run `sirius scan .` to analyse real files.',
    });
  }

  if (!identifier && !flags.all) {
    throw new CliError('Which finding? Pass a rule id, a finding id, or --all.', {
      hint: `e.g. sirius fix ${cache.findings[0]?.rule_id ?? 'SIR-SEC-001'}`,
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

  // Discovered once: every template that must match the project's vocabulary
  // reads from this rather than guessing a name.
  const { findAuthConvention } = await import('../engine/conventions.js');
  const auth = local ? findAuthConvention(root) : undefined;
  const fixContext: import('../engine/fix.js').FixContext = auth ? { auth } : {};

  let applied = 0;
  let acceptAll = Boolean(flags.apply);

  for (const finding of queue) {
    const filePath = resolve(root, finding.file);

    // The local engine has no scan on any server, but it has the rules and the
    // file, which is everything a fix needs. Without this branch `sirius fix`
    // was unreachable in the default configuration — the Response stage existed
    // only against a backend nobody has running.
    const suggestion = local
      ? await localSuggestion(finding, filePath, fixContext)
      : await client.requestFix(cache.scan_id, finding.id);

    if (!suggestion) {
      // Say *why* nothing was offered. "No template" and "this project has no
      // authentication decorator to copy" are different problems, and only one
      // of them is something the user can act on.
      const reason =
        finding.fix_action === 'add_auth_decorator' && !fixContext.auth
          ? `${finding.file} has no authenticated route to copy, so there is no ` +
            `decorator to apply. Adding authentication here is a design decision.`
          : `no local fix template for ${finding.rule_id} (${finding.fix_action ?? 'no action'}).`;
      process.stderr.write(`${reason}\n`);
      continue;
    }

    // rustc's discipline, which `cargo clippy --fix` follows exactly: only
    // machine-applicable suggestions are applied without being asked for. The
    // rest are shown in full and skipped, because a fix that "may be what the
    // user intended" is a proposal, and applying a proposal unasked is how a
    // tool loses the right to touch anybody's code.
    const applicability = (suggestion as { applicability?: string }).applicability ?? 'unspecified';
    if (applicability !== 'machine-applicable' && !flags.unsafeFixes && !flags.dryRun) {
      const note = (suggestion as { behaviour_note?: string }).behaviour_note;
      process.stderr.write(
        `skipped ${finding.rule_id} at ${finding.file}:${finding.line} — ${applicability}.\n` +
          (note ? `  ${note}\n` : '') +
          `  See it with --dry-run, or apply it with --unsafe-fixes.\n`,
      );
      continue;
    }

    if (flags.dryRun) {
      await presentFix({
        finding,
        suggestion,
        filePath,
        glyphs,
        capabilities,
        autoAccept: true,
        render: 'proposal-only',
      });
      continue;
    }

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
      const verified = suggestion as FixSuggestion & {
        verified_source?: string;
        verified_from?: string;
      };

      // Write exactly what was verified, when we have it. Replaying the diff
      // instead drops anything outside the hunk — the added `import os`, the
      // decorator's import — and produces a file the verifier never saw.
      let backup: string;
      if (verified.verified_source !== undefined && verified.verified_from !== undefined) {
        const current = readFileSync(filePath, 'utf8');
        if (current !== verified.verified_from) {
          process.stderr.write(
            `skipped ${finding.rule_id}: ${finding.file} changed since the scan. Re-run the scan.\n`,
          );
          continue;
        }
        backup = `${filePath}.sirius-backup`;
        copyFileSync(filePath, backup);
        writeFileSync(filePath, verified.verified_source, 'utf8');
      } else {
        ({ backup } = applyDiffToFile(filePath, finding.line, suggestion.diff));
      }
      applied += 1;
      process.stdout.write(`applied ${finding.rule_id} to ${finding.file} (backup: ${backup})\n`);

      for (const effect of suggestion.side_effects ?? []) {
        if (!effect.file) continue;
        appendSideEffect(join(root, effect.file), effect.content ?? '');
      }
    }
  }

  if (flags.dryRun) return;
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
  render?: 'proposal-only';
}): Promise<ApplyChoice> {
  const { finding, suggestion, glyphs, capabilities, autoAccept } = args;
  const proposalOnly = args.render === 'proposal-only';

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
              {proposalOnly
                ? suggestion.verifier_status === 'pass'
                  ? '   nothing written yet.'
                  : '   verifier did not pass; this fix will not be offered.'
                : suggestion.verifier_status === 'pass'
                  ? '   applying…'
                  : '   verifier did not pass; not applying'}
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

/**
 * A fix built from the local engine, shaped like the API's response.
 *
 * Keeping the shape identical means the panel, the diff view, the apply prompt,
 * and the verifier gate below are all one code path — the local and hosted
 * routes cannot drift into showing the user different things.
 */
async function localSuggestion(
  finding: CachedFinding,
  filePath: string,
  context: import('../engine/fix.js').FixContext,
): Promise<FixSuggestion | undefined> {
  if (!finding.fix_action || !existsSync(filePath)) return undefined;

  const { buildLocalFix } = await import('../engine/fix.js');
  const built = await buildLocalFix({
    filePath,
    source: readFileSync(filePath, 'utf8'),
    line: finding.line,
    ruleId: finding.rule_id,
    action: finding.fix_action,
    context,
  });
  if (!built) return undefined;

  return {
    finding_id: finding.id,
    action: built.action as FixSuggestion['action'],
    ...(built.target ? { target: built.target } : {}),
    confidence: built.confidence,
    diff: built.diff,
    side_effects: built.sideEffects,
    verifier_status: built.verifierStatus,
    escalate: built.escalate,
    generated_at: new Date().toISOString(),
    // Carried through for the provenance panel, which must not imply a model
    // ran when none did.
    stages: built.stages,
    verifier_detail: built.verifierDetail,
    // The exact text the verifier re-ran the rule against. Applying anything
    // else would mean the ✓ PASS was earned by code that never reached disk —
    // which is what happened while only the diff was replayed and the imports
    // the patch depends on were silently dropped.
    verified_source: built.patched,
    applicability: built.applicability,
    ...(built.behaviourNote ? { behaviour_note: built.behaviourNote } : {}),
    verified_from: readFileSync(filePath, 'utf8'),
  } as FixSuggestion & {
    stages: typeof built.stages;
    verifier_detail: string;
    verified_source: string;
    verified_from: string;
  };
}
