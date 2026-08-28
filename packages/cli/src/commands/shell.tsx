/**
 * `sirius` with no arguments — the interactive shell.
 *
 * Two renderers, chosen at startup:
 *
 * **Full screen** (default) takes over the terminal's drawing surface like
 * `vim`, pins the input box to the bottom, and scrolls the transcript in-app.
 * Command output is *captured* and rendered into that transcript, because in
 * the alternate buffer a child process cannot be handed the terminal without
 * fighting our own drawing.
 *
 * **Inline** (`SIRIUS_NO_ALT_SCREEN=1`) keeps the native scrollback and hands
 * the real terminal to each command, so `/scan` gets its genuine streaming view
 * and `/triage` its genuine keyboard UI. Slower to look at, higher fidelity.
 *
 * The captured path is not a downgrade for scanning: children run with
 * `SIRIUS_STREAM_PLAIN=1`, so findings are emitted line by line as they are
 * discovered and stream into the transcript live.
 */

import { spawn } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box, Text, render, useApp, useInput } from 'ink';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { CliError } from '../api/errors.js';
import { CommandPalette, SHELL_COMMANDS, filterCommands } from '../ui/CommandPalette.js';
import { FullScreenShell } from '../ui/FullScreenShell.js';
import { COLOR, detectCapabilities, glyphsFor } from '../ui/theme.js';
import {
  alternateScreenAvailable,
  enterAlternateScreen,
  leaveAlternateScreen,
  mouseReportingAvailable,
  nativeSelectionKey,
  withAlternateScreenSuspended,
} from '../ui/screen.js';
import { renderWordmark } from '../ui/wordmark.js';
import { note, plural, truncate } from '../ui/kit.js';
import { AUTHOR, TAGLINE, VERSION } from '../branding.js';
import { findProjectRoot, loadConfig } from '../config/load.js';
import type { Finding } from '../domain.js';
import type { ReviewPanel, TranscriptLine } from '../ui/FullScreenShell.js';
import type { ShellCommand } from '../ui/CommandPalette.js';
import type { Capabilities, Glyphs } from '../ui/theme.js';

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');

/**
 * Commands that draw their own full-screen UI.
 *
 * Their output cannot be captured into the transcript — it is cursor movement
 * meant for a real screen, not lines. So the shell steps aside and gives them
 * the terminal, rather than telling the user to go and run them elsewhere,
 * which is what it used to do.
 */
// `triage` is not here any more: it asks a question with a few answers, and a
// question is not a reason to take the terminal. It runs inline, in a panel
// above the prompt, the way this shell already asks anything else.
const NEEDS_REAL_TERMINAL = new Set(['watch', 'shell']);

/** Batching window for captured output, and the transcript's memory ceiling. */
const FLUSH_MS = 60;
const MAX_TRANSCRIPT = 2000;

interface GlobalFlags {
  apiUrl?: string;
  wsUrl?: string;
  project?: string;
  profile?: string;
  color?: boolean;
}

export async function runShell(_flags: unknown, globals: GlobalFlags): Promise<void> {
  const capabilities = detectCapabilities({ noColor: globals.color === false });

  // Both streams must be a terminal: the palette needs keypresses, and the
  // commands need somewhere to draw.
  if (!capabilities.tty || !process.stdin.isTTY) {
    throw new CliError('`sirius` with no arguments opens an interactive shell, which needs a terminal.', {
      hint: 'Run a command directly instead, e.g. `sirius scan .`, or see `sirius --help`.',
    });
  }

  const glyphs = glyphsFor(capabilities);

  if (alternateScreenAvailable()) {
    await runFullScreen(capabilities, glyphs, globals);
  } else {
    await runInline(capabilities, glyphs, globals);
  }
}

// ---------------------------------------------------------------- shared

function sessionContext(glyphs: Glyphs, globals: GlobalFlags): string {
  try {
    const cwd = process.cwd();
    const config = loadConfig({
      cwd,
      overrides: { apiUrl: globals.apiUrl, projectId: globals.project, profile: globals.profile },
    });
    // The directory comes first, because `/scan` takes no argument and scans
    // here — "what am I even pointed at?" should never need asking. It showed
    // only the last segment, which answers that question badly: `ho/` could be
    // any of a dozen directories, and somebody did have to ask.
    const project = findProjectRoot(cwd);
    return [
      `scanning ${shortPath(cwd)}`,
      project ? `project ${project.dir.split('/').pop()}` : 'no sirius.yaml',
      config.projectId ? `api ${config.apiUrl.replace(/^https?:\/\//, '')}` : 'local engine',
    ].join(glyphs.separator);
  } catch {
    // A broken config should not stop the shell opening — /doctor is exactly
    // the tool for diagnosing it.
    return 'config could not be read, try /doctor';
  }
}

/** Splits a line into argv, honoring quotes so `--reason "a b"` survives. */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}

/** Global flags typed once on `sirius` should apply to everything run inside. */
function inheritedFlags(globals: GlobalFlags): string[] {
  const flags: string[] = [];
  if (globals.apiUrl) flags.push('--api-url', globals.apiUrl);
  if (globals.wsUrl) flags.push('--ws-url', globals.wsUrl);
  if (globals.project) flags.push('--project', globals.project);
  if (globals.profile) flags.push('--profile', globals.profile);
  if (globals.color === false) flags.push('--no-color');
  return flags;
}

export interface ParsedCommand {
  name: string;
  args: string[];
  command: ShellCommand | undefined;
  local: boolean;
}

export function parseLine(line: string): ParsedCommand | null {
  const argv = tokenize(line.trim().replace(/^\//, ''));
  const [name, ...args] = argv;
  if (!name) return null;

  const command = SHELL_COMMANDS.find((c) => c.name === name);
  return {
    name,
    args,
    command,
    local:
      name === 'exit' ||
      name === 'quit' ||
      name === 'clear' ||
      name === 'cd' ||
      name === 'help' ||
      !command,
  };
}

/**
 * Help, grouped by what you are trying to do.
 *
 * It was one flat alphabetical list of twenty commands with a one-line summary
 * each, which tells you what every command is and nothing about which one to
 * run. The question a person actually has on first contact is "where do I
 * start", and a list sorted by name cannot answer it.
 *
 * So: four groups in the order you would meet them, each opening with the path
 * through it. The summaries are unchanged — the grouping is the whole change.
 */
const HELP_GROUPS: { title: string; flow: string; commands: string[] }[] = [
  {
    title: 'START HERE — is anything wrong with this code?',
    flow: '/scan .   →   /explain <rule>   →   /fix <rule>',
    commands: ['scan', 'explain', 'fix', 'triage', 'watch'],
  },
  {
    title: 'MONEY AT RISK IN OPERATIONS — failed payments, ageing invoices',
    flow: '/revenue gen batch   →   /revenue detect batch   →   /revenue recover batch',
    commands: ['revenue', 'reconcile'],
  },
  {
    title: 'PROVE IT — what you hand a reviewer or a CI pipeline',
    flow: '/report   →   /badge   →   /baseline set',
    commands: ['report', 'badge', 'baseline', 'suppress', 'rules'],
  },
  {
    title: 'SET UP AND CHECK — run these when something looks wrong',
    flow: '/doctor   tells you which mode a scan will actually run in',
    commands: ['doctor', 'init', 'login', 'logout', 'cd'],
  },
];

/**
 * The current finding, as the body of the inline question.
 *
 * Deliberately the same facts the full-screen view showed — severity, rule,
 * location, message, clauses, money — because nothing about that was wrong. It
 * was only ever shown in the wrong place.
 */
function reviewPanel(
  state: { findings: Finding[]; index: number; verdicts: Map<string, string> } | null,
  glyphs: Glyphs,
): ReviewPanel | undefined {
  if (!state) return undefined;
  const finding = state.findings[state.index];
  if (!finding) return undefined;

  // The answer already on file, if there is one. Without it there is no way to
  // tell a finding you have not reached from one you decided ten keystrokes
  // ago, which makes going back to change something guesswork.
  const held = state.verdicts.get(
    finding.fingerprint
      ? `fp:${finding.fingerprint}`
      : `${finding.rule_id.toUpperCase()}@${finding.file}:${finding.line}`,
  );

  const money = finding.money_at_risk_inr
    ? `₹${new Intl.NumberFormat('en-IN').format(finding.money_at_risk_inr)} at risk`
    : '';
  const clauses = (finding.compliance_ref ?? []).join(` ${glyphs.separator.trim()} `);

  return {
    title: `${finding.severity.toUpperCase()}  ${finding.rule_id}`,
    position: `${state.index + 1} of ${state.findings.length}${held ? `  ·  ${held}` : ''}`,
    body: [
      `${finding.file}:${finding.line}`,
      finding.message ?? '',
      [clauses, money].filter(Boolean).join('   '),
    ].filter((line) => line.length > 0),
    keys: held
      ? `a accept   d dismiss   s suppress   u undo ${held}   j/k move   q done`
      : 'a accept   d dismiss   s suppress   j/k move   q done',
  };
}

function helpLines(width = 80): string[] {
  const out: string[] = [''];
  const shown = new Set<string>();

  for (const group of HELP_GROUPS) {
    out.push(`  ${group.title}`);
    out.push(`    ${group.flow}`);
    out.push('');
    for (const name of group.commands) {
      const command = SHELL_COMMANDS.find((candidate) => candidate.name === name);
      if (!command) continue;
      shown.add(name);
      out.push(`    /${command.name.padEnd(10)} ${truncate(command.summary, Math.max(20, width - 18))}`);
      if (command.usage) out.push(`     ${' '.repeat(10)} ${truncate(command.usage, Math.max(20, width - 18))}`);
    }
    out.push('');
  }

  // Anything the groups forgot still gets listed, because a command that exists
  // and appears in no help is worse than one in the wrong group.
  const rest = SHELL_COMMANDS.filter((command) => !shown.has(command.name));
  if (rest.length > 0) {
    out.push('  THE SHELL ITSELF');
    out.push('');
    for (const command of rest) {
      out.push(`    /${command.name.padEnd(10)} ${truncate(command.summary, Math.max(20, width - 18))}`);
    }
    out.push('');
  }

  return out;
}

// ---------------------------------------------------------------- full screen

async function runFullScreen(capabilities: Capabilities, glyphs: Glyphs, globals: GlobalFlags): Promise<void> {
  enterAlternateScreen();

  try {
    await new Promise<void>((resolvePromise) => {
      let nextId = 0;
      // Read once. This touches the filesystem, and it used to be called from
      // inside render for the header prop — so every appended line re-read the
      // config from disk, which is a large part of why output felt laggy.
      const context = sessionContext(glyphs, globals);
      // The wordmark does not repeat the context. It was printing the same
      // "scanning … · no sirius.yaml · local engine" the header shows, one line
      // below the header showing it — and the header's copy is the one that
      // stays put when the banner scrolls away.
      const banner = renderWordmark(
        { version: VERSION, tagline: TAGLINE, context: '', author: AUTHOR },
        { unicode: capabilities.unicode, color: capabilities.color, width: capabilities.width },
      );

      // Trim the banner's leading and trailing blank lines. They give it room
      // when printed to a fresh terminal, but inside a scrollback they are just
      // empty rows the user has to scroll past to reach anything.
      const bannerLines = banner.split('\n');
      while (bannerLines.length > 0 && bannerLines[0]?.trim() === '') bannerLines.shift();
      while (bannerLines.length > 0 && bannerLines.at(-1)?.trim() === '') bannerLines.pop();

      const initial: TranscriptLine[] = bannerLines.map((text) => ({
        id: nextId++,
        text,
        kind: 'output' as const,
      }));
      // Wrapped here rather than at render. A transcript row is one screen line
      // and truncates, so a hint longer than the terminal lost its ending — and
      // the ending is the part that says which key to hold.
      const hint = (text: string): void => {
        for (const wrapped of note(text, { indent: 0, width: capabilities.width - 2 })) {
          initial.push({ id: nextId++, text: wrapped, kind: 'note' });
        }
      };

      hint('Type / for commands. /help lists them, /exit leaves.');
      if (mouseReportingAvailable()) {
        // Say this up front. Losing click-drag selection without explanation
        // reads as a broken terminal rather than a deliberate trade.
        hint(
          `Scroll with the wheel. Drag to select — it copies on release. ` +
            `Hold ${nativeSelectionKey()} for the terminal's own selection.`,
        );
      }

      /** An open triage queue: the findings, where we are, and what was decided. */
      interface ReviewState {
        root: string;
        /**
         * Every finding, not only the undecided ones.
         *
         * Filtering the queue to what was still open meant a decision was final
         * the moment it was taken: the finding left the queue and `k` could
         * never reach it again. Changing your mind is the most ordinary thing
         * to want to do while triaging.
         */
        findings: Finding[];
        index: number;
        /** Current verdict per finding, keyed by `triageKey`. */
        verdicts: Map<string, string>;
      }

      /** What survives an unmount: everything the user would be sorry to lose. */
      const kept: { lines: TranscriptLine[]; history: string[] } = { lines: initial, history: [] };

      function App() {
        const { exit } = useApp();
        // Seeded from the closure, not from `initial`, so a handover — which
        // unmounts this component and mounts a fresh one — comes back to the
        // same transcript rather than to an empty screen.
        const [lines, setLines] = useState<TranscriptLine[]>(kept.lines);
        const [history, setHistory] = useState<string[]>(kept.history);

        // Mirrored on every change. React state does not outlive the component;
        // this does.
        useEffect(() => {
          kept.lines = lines;
        }, [lines]);
        useEffect(() => {
          kept.history = history;
        }, [history]);
        const [busy, setBusy] = useState(false);
        const [busyLabel, setBusyLabel] = useState<string | undefined>(undefined);
        const [child, setChild] = useState<ReturnType<typeof spawn> | null>(null);
        // What the next line of input answers, if anything. Held in a ref so the
        // submit handler reads the current value rather than one captured at
        // render time.
        const pendingRef = useRef<{ name: string; args: string[] } | null>(null);
        const [pendingLabel, setPendingLabel] = useState<string | null>(null);

        // The triage queue, when one is open. Held in state so the panel
        // re-renders as decisions are taken, and in a ref so the key handler
        // reads the current value rather than one captured at render time.
        const [review, setReview] = useState<ReviewState | null>(null);
        const reviewRef = useRef<ReviewState | null>(null);
        reviewRef.current = review;
        // What `/scan` last targeted. `/fix` runs as a child whose cwd is the
        // shell's, not the scan's, so without this it would fall back to
        // searching for a scan cache — and then write to whatever it found.
        const lastTargetRef = useRef<string | null>(null);

        // Output arrives a line at a time and a scan emits dozens in a second.
        // Committing React state per line re-reconciles the whole transcript
        // each time, which is what made it lag. Buffer and flush on a tick.
        const pending = useRef<TranscriptLine[]>([]);
        const flushTimer = useRef<NodeJS.Timeout | null>(null);

        const flush = () => {
          flushTimer.current = null;
          if (pending.current.length === 0) return;
          const batch = pending.current;
          pending.current = [];
          setLines((all) => {
            const next = [...all, ...batch];
            // Keep memory flat in a long session: the viewport shows a screenful
            // and nobody scrolls back thousands of lines in a terminal.
            return next.length > MAX_TRANSCRIPT ? next.slice(next.length - MAX_TRANSCRIPT) : next;
          });
        };

        // A printable marker, not a NUL byte: this has to be greppable in a
        // log and typeable in a test, and an invisible one was neither.
        const DETAIL = '::sirius-why::';
        const append = (text: string, kind: TranscriptLine['kind'] = 'output') => {
          // Evidence arrives inline, marked. It is stored hidden and revealed
          // by Ctrl+O rather than re-running the scan to answer "why?".
          const isDetail = text.startsWith(DETAIL);
          pending.current.push({
            id: nextId++,
            text: isDetail ? text.slice(DETAIL.length) : text,
            kind,
            ...(isDetail ? { detail: true } : {}),
          });
          if (!flushTimer.current) flushTimer.current = setTimeout(flush, FLUSH_MS);
        };

        useEffect(() => () => {
          if (flushTimer.current) clearTimeout(flushTimer.current);
        }, []);

        const finish = () => {
          exit();
          resolvePromise();
        };

        /**
         * Opens the triage queue from the last scan.
         *
         * Everything it needs is already on disk: `scan` caches its findings
         * and `recordTriage` writes the decisions. What was missing was a way
         * to ask without taking the screen.
         */
        const startReview = async (args: string[]): Promise<void> => {
          const { locateLastScan } = await import('../session.js');
          const { loadTriage, triageKey } = await import('../engine/store.js');

          const found = locateLastScan(process.cwd());
          if (!found) {
            append('No scan to triage yet. Run /scan . first.', 'error');
            return;
          }

          const decisions = loadTriage(found.root);
          const verdicts = new Map(decisions.map((entry) => [triageKey(entry), entry.state as string]));

          // `--decided` answers "what did I choose?" without reopening the
          // queue. The decisions are a record somebody reviews later, so there
          // has to be a way to read them that is not "walk the whole batch
          // again".
          if (args.includes('--decided')) {
            if (decisions.length === 0) {
              append('Nothing decided yet.', 'note');
              return;
            }
            append(`${decisions.length} decision(s), newest last:`, 'note');
            for (const entry of decisions) {
              append(
                `  ${entry.state.padEnd(10)} ${entry.rule_id}  ${entry.file}:${entry.line}` +
                  (entry.reason ? `   ${entry.reason}` : ''),
                'output',
              );
            }
            append('Reopen with /triage — k moves back, and deciding again replaces the old answer.', 'note');
            return;
          }

          const severity = args.find((arg) => !arg.startsWith('-'));
          const queue = (found.cache.findings as Finding[]).filter(
            (finding) => !severity || finding.severity === severity,
          );

          if (queue.length === 0) {
            append('No findings to triage.', 'note');
            return;
          }

          // Opens at the first thing without an answer, but the ones behind it
          // are still in the queue and `k` reaches them.
          const first = queue.findIndex((finding) => !verdicts.has(triageKey(finding as never)));
          const open = queue.length - verdicts.size;

          append(
            `triaging ${plural(queue.length, 'finding')}, ${open} still open — ` +
              `a accept · d dismiss · s suppress · u undo · j/k move · q done`,
            'note',
          );
          setReview({ root: found.root, findings: queue, index: first < 0 ? 0 : first, verdicts });
        };

        /** One keypress against the open queue. */
        const onReviewKey = (input: string, key: { escape?: boolean }): void => {
          const state = reviewRef.current;
          if (!state) return;

          const finding = state.findings[state.index];

          const tally = (verdicts: Map<string, string>): string => {
            const counts: Record<string, number> = {};
            for (const verdict of verdicts.values()) counts[verdict] = (counts[verdict] ?? 0) + 1;
            const parts = Object.entries(counts).map(([verdict, n]) => `${n} ${verdict}`);
            const open = state.findings.length - verdicts.size;
            return [...parts, open > 0 ? `${open} still open` : 'nothing left open'].join(' · ');
          };

          if (key.escape || input === 'q') {
            append(`triage closed — ${tally(state.verdicts)}`, 'note');
            append('See them again with  /triage --decided', 'note');
            setReview(null);
            return;
          }

          if (input === 'j' || input === 'k') {
            const delta = input === 'j' ? 1 : -1;
            setReview({
              ...state,
              index: Math.max(0, Math.min(state.findings.length - 1, state.index + delta)),
            });
            return;
          }

          const verdict =
            input === 'a' ? 'accepted' : input === 'd' ? 'dismissed' : input === 's' ? 'suppressed' : undefined;
          if ((!verdict && input !== 'u') || !finding) return;

          void (async () => {
            const { recordTriage, clearTriage, triageKey } = await import('../engine/store.js');
            const identity = triageKey(finding as never);
            const verdicts = new Map(state.verdicts);
            const previous = verdicts.get(identity);

            if (input === 'u') {
              if (!previous) return;
              clearTriage(state.root, identity);
              verdicts.delete(identity);
              append(`undone     ${finding.rule_id}  ${finding.file}:${finding.line}`, 'note');
              setReview({ ...state, verdicts });
              return;
            }

            recordTriage(state.root, {
              rule_id: finding.rule_id,
              file: finding.file,
              line: finding.line,
              ...(finding.fingerprint ? { fingerprint: finding.fingerprint } : {}),
              state: verdict as 'accepted' | 'dismissed' | 'suppressed',
              // A dismissal and a suppression both want a reason, and a panel
              // has no room to type one. Recorded as decided here and refined
              // with `/suppress <rule> --reason "…"`, which is where a reason
              // that has to survive review belongs anyway.
              ...(verdict === 'accepted' ? {} : { reason: 'decided in /triage' }),
              decided_at: new Date().toISOString(),
            });
            verdicts.set(identity, verdict as string);

            // Says so when it replaced an answer, rather than looking the same
            // as a first decision.
            append(
              `${(verdict as string).padEnd(10)} ${finding.rule_id}  ${finding.file}:${finding.line}` +
                (previous && previous !== verdict ? `   (was ${previous})` : ''),
              'output',
            );

            // Forward to the next thing without an answer, wrapping once, so a
            // pass through the batch ends where there is nothing left to do.
            const order = state.findings.map((_, offset) => (state.index + 1 + offset) % state.findings.length);
            const next = order.find((candidate) => !verdicts.has(triageKey(state.findings[candidate] as never)));

            if (next === undefined) {
              append(`triage done — ${tally(verdicts)}`, 'note');
              append('See them again with  /triage --decided', 'note');
              setReview(null);
              return;
            }
            setReview({ ...state, index: next, verdicts });
          })();
        };

        const submit = (line: string) => {
          // A pending confirmation swallows the line: the shell is asking, not
          // the prompt. `/fix` needs this because the child it spawns has its
          // stdin ignored and can never read a keystroke of its own.
          const awaiting = pendingRef.current;
          if (awaiting) {
            append(line, 'input');
            pendingRef.current = null;
            setPendingLabel(null);

            if (/^(y|yes)$/i.test(line.trim())) {
              runCommand(awaiting.name, awaiting.args);
            } else {
              append('nothing written.', 'note');
            }
            return;
          }

          append(line, 'input');
          setHistory((h) => [...h, line]);

          const parsed = parseLine(line);
          if (!parsed) return;

          if (parsed.name === 'exit' || parsed.name === 'quit') return finish();

          if (parsed.name === 'clear') {
            // Back to the opening screen, not to an empty one. `/clear` wiped
            // the wordmark along with the transcript, and a blank terminal with
            // a prompt in it does not say what it is.
            setLines(initial);
            return;
          }

          if (parsed.name === 'cd') {
            // Bare `/cd` says where you are rather than moving you home. In a
            // shell whose every command is relative to one directory, "which
            // one?" is the more likely question, and a silent jump to home is a
            // surprising answer to it.
            if (!parsed.args[0]) {
              append(`here: ${process.cwd()}`, 'note');
              append('move with  /cd <path>  ·  /cd ~  goes home', 'note');
              return;
            }

            const to = parsed.args[0] === '~' ? homedir() : parsed.args[0];
            try {
              process.chdir(to);
              append(`now scanning ${process.cwd()}`, 'note');
            } catch {
              append(`no such directory: ${to}`, 'error');
            }
            return;
          }

          if (parsed.name === 'help' || !parsed.command) {
            if (!parsed.command) append(`unknown command: /${parsed.name}`, 'error');
            for (const l of helpLines(capabilities.width)) append(l, 'note');
            return;
          }

          if (parsed.name === 'shell') {
            append('you are already in it.', 'note');
            return;
          }

          if (parsed.name === 'triage') {
            void startReview(parsed.args);
            return;
          }

          if (NEEDS_REAL_TERMINAL.has(parsed.name)) {
            // These draw their own full-screen UI, so the shell steps aside and
            // gives them the real terminal rather than telling the user to go
            // and run them somewhere else.
            // Pushed straight into the kept transcript rather than through
            // `append`, which batches on a timer — the unmount lands first and
            // the note is lost.
            kept.lines = [
              ...kept.lines,
              {
                id: Date.now(),
                text: `handed the terminal to /${parsed.name}`,
                kind: 'note',
              },
            ];
            void handover(parsed.name, parsed.args);
            return;
          }

          // `fix` prompts for confirmation, which a child with no stdin cannot
          // do. Show the proposal, then let the shell do the asking.
          if (parsed.name === 'fix' && !parsed.args.includes('--apply')) {
            const scoped = withScanTarget(parsed.args, lastTargetRef.current);
            runCommand(parsed.name, [...scoped, '--dry-run'], {
              confirm: { name: parsed.name, args: [...scoped, '--apply'] },
            });
            return;
          }

          if (parsed.name === 'scan') {
            // The first non-flag argument is the path; no argument means here.
            const path = parsed.args.find((a) => !a.startsWith('-'));
            lastTargetRef.current = path ? resolvePath(process.cwd(), path) : process.cwd();
          }

          runCommand(parsed.name, parsed.args);
        };

        const runCommand = (
          name: string,
          args: string[],
          options: { confirm?: { name: string; args: string[] } } = {},
        ) => {
          setBusy(true);
          setBusyLabel(`running /${name}`);

          const proc = spawn(
            process.execPath,
            [CLI_ENTRY, ...inheritedFlags(globals), name, ...args],
            {
              stdio: ['ignore', 'pipe', 'pipe'],
              env: {
                ...process.env,
                // Captured, so the child is not a TTY — ask for colour anyway,
                // and for findings to stream out line by line as they arrive.
                FORCE_COLOR: capabilities.color ? '1' : '0',
                SIRIUS_STREAM_PLAIN: '1',
                // The child is a pipe and cannot measure the terminal, so hand
                // it the transcript's usable width. Two columns for the gutter.
                SIRIUS_WIDTH: String(Math.max(40, capabilities.width - 2)),
                // So a child telling the user what to run next can name the
                // form that will actually work where they are: `/scan .` in
                // here, `sirius scan .` from their own prompt.
                SIRIUS_IN_SHELL: '1',
                ...(capabilities.unicode ? { SIRIUS_UNICODE: '1' } : {}),
              },
            },
          );
          setChild(proc);

          for (const [stream, kind] of [
            [proc.stdout, 'output'],
            [proc.stderr, 'error'],
          ] as const) {
            if (!stream) continue;
            createInterface({ input: stream }).on('line', (text) => append(text, kind));
          }

          proc.on('error', (error) => {
            append(`could not run: ${error.message}`, 'error');
            setBusy(false);
            setChild(null);
          });

          proc.on('close', (code) => {
            setBusy(false);
            setBusyLabel(undefined);
            setChild(null);

            // Arm the confirmation only if the proposal actually rendered. A
            // command that failed has nothing to apply, and asking anyway would
            // invite the user to say yes to nothing.
            if (options.confirm && code === 0) {
              pendingRef.current = options.confirm;
              setPendingLabel('apply this fix? [y/N]');
            }
          });
        };

        return (
          <FullScreenShell
            glyphs={glyphs}
            capabilities={capabilities}
            header={`sirius v${VERSION}  ${context}`}
            lines={lines}
            busy={busy}
            busyLabel={busyLabel}
            prompt={pendingLabel ?? undefined}
            review={reviewPanel(review, glyphs)}
            onKey={review ? onReviewKey : undefined}
            history={history}
            onSubmit={submit}
            onCancel={() => {
              child?.kill('SIGINT');
              append('cancelled', 'note');
            }}
            onExit={finish}
          />
        );
      }

      const debug = (message: string) => {
        if (process.env.SIRIUS_DEBUG) process.stderr.write(`[shell] ${message}\n`);
      };

      debug('rendering full-screen app');
      let instance = render(<App />, { exitOnCtrlC: false });
      debug('render() returned');

      // Set while the shell is deliberately unmounting to hand over the
      // terminal. Without it, that unmount would look exactly like the user
      // quitting and would end the session.
      let handingOver = false;

      const watchForExit = () => {
        instance
          .waitUntilExit()
          .then(() => {
            if (handingOver) {
              debug('unmounted for a handover');
              return;
            }
            debug('waitUntilExit resolved');
            resolvePromise();
          })
          .catch((error: unknown) => {
            debug(`waitUntilExit rejected: ${error instanceof Error ? error.stack : String(error)}`);
            if (!handingOver) resolvePromise();
          });
      };
      watchForExit();

      /**
       * Steps aside so a full-screen command can own the real terminal.
       *
       * Not a split. Splitting would mean allocating a pty, interpreting the
       * child's cursor movements into a buffer, and shipping a native
       * dependency to do it — a terminal multiplexer, for two commands. What
       * the user wants is to type `/triage` and have it work, and handing over
       * gives exactly that: the child gets a genuine TTY, full keyboard and the
       * whole screen, and the shell comes back with its transcript when the
       * child exits. It is what `git` does for `$EDITOR`.
       *
       * The order matters. Ink is unmounted first so it stops painting *and*
       * releases stdin — two readers on one file descriptor means each keypress
       * goes to whichever happens to get it.
       */
      async function handover(name: string, args: string[]): Promise<void> {
        handingOver = true;
        instance.unmount();

        // Wait for the unmount to actually finish, rather than guessing.
        //
        // This was `setTimeout(30)`, with a comment saying it was one tick for
        // Ink to restore raw mode and detach its stdin listener. Ink's teardown
        // is asynchronous and takes as long as it takes; on a loaded machine,
        // or after a session with a few hundred lines of transcript, it takes
        // longer than thirty milliseconds. The child then started while the
        // parent still held stdin in raw mode with a listener attached, and the
        // two competed for the same keystrokes — the parent winning some, and
        // then pausing the stream underneath the child when its teardown
        // finally ran. That is the whole `/watch`-after-`/triage` flake: the
        // shell kept painting, because painting never depended on stdin, and
        // never received another keystroke, not even end-of-input.
        //
        // `waitUntilExit()` resolves when Ink has finished. It is the signal the
        // sleep was approximating.
        try {
          await instance.waitUntilExit();
        } catch {
          // An app that errored on the way out has still let go of stdin, which
          // is the only thing being waited for here.
        }

        // And then let go of stdin explicitly. Ink restores raw mode on its own
        // way out, but the stream is left flowing in the parent, and a flowing
        // parent stream steals bytes from a child that inherited the same
        // descriptor.
        const wasRaw = Boolean(process.stdin.isTTY && process.stdin.isRaw);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();

        const code = await withAlternateScreenSuspended(async () => {
          process.stdout.write('\n');
          return new Promise<number>((resolve) => {
            const child = spawn(process.execPath, [CLI_ENTRY, ...inheritedFlags(globals), name, ...args], {
              stdio: 'inherit',
              env: { ...process.env },
            });
            child.on('close', (status) => resolve(status ?? 0));
            child.on('error', () => resolve(2));
          });
        });

        // Appended *before* the remount. The fresh component seeds its state
        // from `kept` at mount and then mirrors its own state back, so a line
        // added afterwards is overwritten on the next render and never seen.
        kept.lines = [
          ...kept.lines,
          { id: Date.now(), text: `/${name} finished (exit ${code}) — back in the shell.`, kind: 'note' },
        ];

        // Hand stdin back before mounting. Ink acquires raw mode itself when it
        // mounts, but it does not resume a stream somebody else paused, and a
        // paused stream is a shell that renders perfectly and answers nothing.
        process.stdin.resume();
        if (wasRaw && process.stdin.isTTY) process.stdin.setRawMode(true);

        handingOver = false;
        instance = render(<App />, { exitOnCtrlC: false });
        watchForExit();
      }
    });
  } finally {
    leaveAlternateScreen();
  }
}

// ---------------------------------------------------------------- inline

async function runInline(capabilities: Capabilities, glyphs: Glyphs, globals: GlobalFlags): Promise<void> {
  printInlineBanner(capabilities, glyphs, globals);

  const history: string[] = [];

  for (;;) {
    const line = await promptForLine({ capabilities, glyphs, history });
    if (line === null) break;

    const trimmed = line.trim();
    if (!trimmed) continue;
    history.push(trimmed);

    const parsed = parseLine(trimmed);
    if (!parsed) continue;

    if (parsed.name === 'exit' || parsed.name === 'quit') break;

    if (parsed.name === 'clear') {
      process.stdout.write('[2J[H');
      printInlineBanner(capabilities, glyphs, globals);
      continue;
    }

    if (parsed.name === 'help' || !parsed.command) {
      if (!parsed.command) process.stdout.write(`\n  unknown command: /${parsed.name}\n`);
      process.stdout.write(helpLines().join('\n') + '\n');
      continue;
    }

    await runChildInherited([parsed.name, ...parsed.args], globals);
  }

  process.stdout.write('\n');
}

function printInlineBanner(capabilities: Capabilities, glyphs: Glyphs, globals: GlobalFlags): void {
  const dim = capabilities.color ? '[38;5;244m' : '';
  const reset = capabilities.color ? '[0m' : '';
  const bold = capabilities.color ? '[1m' : '';

  process.stdout.write(
    renderWordmark(
      { version: VERSION, tagline: TAGLINE, context: sessionContext(glyphs, globals), author: AUTHOR },
      { unicode: capabilities.unicode, color: capabilities.color, width: capabilities.width },
    ),
  );
  process.stdout.write(
    `\n${dim}  Type ${reset}${bold}/${reset}${dim} for commands. ${reset}/help${dim} lists them, ${reset}/exit${dim} leaves.${reset}\n\n`,
  );
}

function runChildInherited(argv: string[], globals: GlobalFlags): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...inheritedFlags(globals), ...argv], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', (error) => {
      process.stderr.write(`\n  could not run: ${error.message}\n`);
      resolvePromise();
    });
    // Exit codes are informational here: a scan that finds problems exits 1,
    // which is not a shell error and must not look like one.
    child.on('close', () => resolvePromise());
  });
}

function promptForLine(args: {
  capabilities: Capabilities;
  glyphs: Glyphs;
  history: string[];
}): Promise<string | null> {
  const { capabilities, glyphs, history } = args;

  return new Promise<string | null>((resolvePromise) => {
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      process.stdin.off('end', onEnd);
      process.stdin.off('close', onEnd);
      instance.unmount();
      resolvePromise(value);
    };

    // Without this the shell spins forever once stdin closes — which is what a
    // piped session or a closed terminal looks like. Treat EOF as /exit.
    const onEnd = () => finish(null);
    process.stdin.once('end', onEnd);
    process.stdin.once('close', onEnd);

    const instance = render(
      <Prompt capabilities={capabilities} glyphs={glyphs} history={history} onSubmit={finish} />,
      { exitOnCtrlC: false },
    );

    instance.waitUntilExit().then(() => finish(null));
  });
}

export interface PromptProps {
  capabilities: Capabilities;
  glyphs: Glyphs;
  history: string[];
  onSubmit: (line: string | null) => void;
}

export function Prompt({ capabilities, glyphs, history, onSubmit }: PromptProps) {
  const { exit } = useApp();
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState(0);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const showPalette = value.startsWith('/');
  const matches = useMemo(() => (showPalette ? filterCommands(value) : []), [showPalette, value]);

  const submit = (line: string) => {
    onSubmit(line);
    exit();
  };

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onSubmit(null);
      exit();
      return;
    }
    if (key.ctrl && input === 'd' && value === '') {
      onSubmit(null);
      exit();
      return;
    }

    // Ink normally reports Enter as `key.return`, but a terminal can deliver the
    // newline inside a larger chunk — `/badge\n` arrives as one input event when
    // typing is fast or the line is pasted.
    const newlineAt = input.search(/[\r\n]/);
    if (key.return || newlineAt >= 0) {
      const line = value + (newlineAt >= 0 ? input.slice(0, newlineAt) : '');

      if (line.startsWith('/') && !line.includes(' ')) {
        const options = filterCommands(line);
        if (options.length > 0) {
          submit(`/${(options[Math.min(selected, options.length - 1)] as ShellCommand).name}`);
          return;
        }
      }
      submit(line);
      return;
    }

    if (key.tab && showPalette && matches.length > 0) {
      setValue(`/${(matches[Math.min(selected, matches.length - 1)] as ShellCommand).name} `);
      setSelected(0);
      return;
    }

    if (key.upArrow) {
      if (showPalette && matches.length > 0) {
        setSelected((s) => Math.max(0, s - 1));
      } else if (history.length > 0) {
        const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(next);
        setValue(history[next] ?? '');
      }
      return;
    }

    if (key.downArrow) {
      if (showPalette && matches.length > 0) {
        setSelected((s) => Math.min(matches.length - 1, s + 1));
      } else if (historyIndex !== null) {
        const next = historyIndex + 1;
        if (next >= history.length) {
          setHistoryIndex(null);
          setValue('');
        } else {
          setHistoryIndex(next);
          setValue(history[next] ?? '');
        }
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      setSelected(0);
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const printable = input.replace(/[\r\n]/g, '');
      if (!printable) return;
      setValue((v) => v + printable);
      setSelected(0);
    }
  });

  const muted = capabilities.color ? COLOR.muted : undefined;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={capabilities.color ? COLOR.accent : undefined}>{`  ${glyphs.arrow} `}</Text>
        <Text>{value}</Text>
        <Text color={muted}>▌</Text>
      </Box>
      {showPalette ? (
        <Box marginTop={1} flexDirection="column">
          <CommandPalette commands={matches} selected={selected} capabilities={capabilities} />
          <Text color={muted}>{'    ↑↓ select · tab complete · enter run · esc clear'}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * A path short enough for a status bar and specific enough to act on.
 *
 * Home becomes `~`, and anything still too long loses its middle rather than
 * its end — the last segments are the ones that identify the directory, and
 * truncating from the right throws away exactly the part being asked about.
 */
export function shortPath(path: string, max = 44): string {
  const home = homedir();
  const withTilde = path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
  if (withTilde.length <= max) return withTilde;

  const segments = withTilde.split('/');
  const tail: string[] = [];
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const candidate = [segments[i] as string, ...tail];
    if (candidate.join('/').length + 2 > max) break;
    tail.unshift(segments[i] as string);
  }
  return `…/${tail.join('/')}`;
}

/** Adds `--target` when the shell knows what was scanned and the caller did not say. */
function withScanTarget(args: string[], target: string | null): string[] {
  if (!target || args.includes('--target')) return args;
  return [...args, '--target', target];
}
