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
import { alternateScreenAvailable, enterAlternateScreen, leaveAlternateScreen } from '../ui/screen.js';
import { renderWordmark } from '../ui/wordmark.js';
import { AUTHOR, TAGLINE, VERSION } from '../branding.js';
import { findProjectRoot, loadConfig } from '../config/load.js';
import type { TranscriptLine } from '../ui/FullScreenShell.js';
import type { ShellCommand } from '../ui/CommandPalette.js';
import type { Capabilities, Glyphs } from '../ui/theme.js';

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');

/** Commands that own the terminal and cannot be captured into a transcript. */
const NEEDS_REAL_TERMINAL = new Set(['triage', 'watch', 'shell']);

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
    // here — "what am I even pointed at?" should never need asking.
    const here = cwd.split('/').pop() || cwd;
    const project = findProjectRoot(cwd);
    return [
      `scanning ${here}/`,
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

function helpLines(): string[] {
  const out: string[] = [''];
  for (const command of SHELL_COMMANDS) {
    out.push(`  /${command.name.padEnd(11)} ${command.summary}`);
    if (command.usage) out.push(`   ${' '.repeat(11)} ${command.usage}`);
  }
  out.push('');
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
      const banner = renderWordmark(
        { version: VERSION, tagline: TAGLINE, context, author: AUTHOR },
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
      initial.push({ id: nextId++, text: 'Type / for commands. /help lists them, /exit leaves.', kind: 'note' });

      function App() {
        const { exit } = useApp();
        const [lines, setLines] = useState<TranscriptLine[]>(initial);
        const [history, setHistory] = useState<string[]>([]);
        const [busy, setBusy] = useState(false);
        const [busyLabel, setBusyLabel] = useState<string | undefined>(undefined);
        const [child, setChild] = useState<ReturnType<typeof spawn> | null>(null);

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

        const submit = (line: string) => {
          append(line, 'input');
          setHistory((h) => [...h, line]);

          const parsed = parseLine(line);
          if (!parsed) return;

          if (parsed.name === 'exit' || parsed.name === 'quit') return finish();

          if (parsed.name === 'clear') {
            setLines([]);
            return;
          }

          if (parsed.name === 'cd') {
            const to = parsed.args[0] ?? homedir();
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
            for (const l of helpLines()) append(l, 'note');
            return;
          }

          if (NEEDS_REAL_TERMINAL.has(parsed.name)) {
            // These draw their own full-screen UI and cannot share the buffer.
            append(`/${parsed.name} needs the whole terminal.`, 'note');
            append(`Leave the shell and run:  sirius ${parsed.name}`, 'note');
            append('Or start the shell with SIRIUS_NO_ALT_SCREEN=1 to run it inline.', 'note');
            return;
          }

          setBusy(true);
          setBusyLabel(`running /${parsed.name}`);

          const proc = spawn(
            process.execPath,
            [CLI_ENTRY, ...inheritedFlags(globals), parsed.name, ...parsed.args],
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

          proc.on('close', () => {
            setBusy(false);
            setBusyLabel(undefined);
            setChild(null);
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
      const instance = render(<App />, { exitOnCtrlC: false });
      debug('render() returned');
      instance
        .waitUntilExit()
        .then(() => {
          debug('waitUntilExit resolved');
          resolvePromise();
        })
        .catch((error: unknown) => {
          debug(`waitUntilExit rejected: ${error instanceof Error ? error.stack : String(error)}`);
          resolvePromise();
        });
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
