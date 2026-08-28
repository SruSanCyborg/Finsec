/**
 * `sirius` with no arguments — the interactive shell.
 *
 * Type `/` for a command palette, Enter to run. The point is that a scan, a
 * fix, and a triage pass live in one session instead of three invocations with
 * environment variables re-exported each time.
 *
 * **How commands run:** each one is spawned as a child process with the
 * terminal inherited, after this shell's Ink instance has unmounted. Two
 * full-screen Ink apps cannot share a terminal — the earlier triage work ran
 * into exactly that — and spawning means `/scan` gets the genuine streaming
 * view and `/triage` the genuine keyboard UI, rather than reimplementations.
 * The cost is a process start per command, which is not noticeable next to a
 * scan.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box, Text, render, useApp, useInput } from 'ink';
import React, { useMemo, useState } from 'react';

import { CliError } from '../api/errors.js';
import { CommandPalette, SHELL_COMMANDS, filterCommands } from '../ui/CommandPalette.js';
import { COLOR, detectCapabilities, glyphsFor } from '../ui/theme.js';
import { renderWordmark } from '../ui/wordmark.js';
import { AUTHOR, TAGLINE, VERSION } from '../branding.js';
import { findProjectRoot, loadConfig } from '../config/load.js';
import type { ShellCommand } from '../ui/CommandPalette.js';
import type { Capabilities, Glyphs } from '../ui/theme.js';

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');

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
  // spawned commands need somewhere to draw.
  if (!capabilities.tty || !process.stdin.isTTY) {
    throw new CliError('`sirius` with no arguments opens an interactive shell, which needs a terminal.', {
      hint: 'Run a command directly instead, e.g. `sirius scan .`, or see `sirius --help`.',
    });
  }

  const glyphs = glyphsFor(capabilities);
  printBanner(capabilities, glyphs, globals);

  const history: string[] = [];

  // The loop is deliberately sequential: prompt, unmount, run, prompt again.
  for (;;) {
    const line = await promptForLine({ capabilities, glyphs, history });
    if (line === null) break;

    const trimmed = line.trim();
    if (!trimmed) continue;

    history.push(trimmed);

    const argv = tokenize(trimmed.replace(/^\//, ''));
    const [name, ...args] = argv;
    if (!name) continue;

    const command = SHELL_COMMANDS.find((c) => c.name === name);

    if (name === 'exit' || name === 'quit') break;

    if (name === 'clear') {
      process.stdout.write('\u001b[2J\u001b[H');
      printBanner(capabilities, glyphs, globals);
      continue;
    }

    if (name === 'help' || !command) {
      if (!command) {
        process.stdout.write(`\n  unknown command: /${name}\n`);
      }
      printHelp(capabilities);
      continue;
    }

    await runChild([name, ...args], globals);
  }

  process.stdout.write('\n');
}

// ---------------------------------------------------------------- banner

function printBanner(capabilities: Capabilities, glyphs: Glyphs, globals: GlobalFlags): void {
  const dim = capabilities.color ? '\u001b[38;5;245m' : '';
  const reset = capabilities.color ? '\u001b[0m' : '';
  const bold = capabilities.color ? '\u001b[1m' : '';

  let context: string;
  try {
    const cwd = process.cwd();
    const config = loadConfig({
      cwd,
      overrides: { apiUrl: globals.apiUrl, projectId: globals.project, profile: globals.profile },
    });
    const project = findProjectRoot(cwd);
    context = [
      project ? `project ${project.dir.split('/').pop()}` : 'no sirius.yaml',
      config.apiKey ? 'authenticated' : 'no key',
      config.apiUrl.replace(/^https?:\/\//, ''),
    ].join(glyphs.separator);
  } catch {
    // A broken config should not stop the shell opening — /doctor is exactly
    // the tool for diagnosing it.
    context = 'config could not be read, try /doctor';
  }

  process.stdout.write(
    renderWordmark(
      { version: VERSION, tagline: TAGLINE, context, author: AUTHOR },
      { unicode: capabilities.unicode, color: capabilities.color, width: capabilities.width },
    ),
  );

  process.stdout.write(
    `\n${dim}  Type ${reset}${bold}/${reset}${dim} for commands. ${reset}/help${dim} lists them, ${reset}/exit${dim} leaves.${reset}\n\n`,
  );
}

function printHelp(capabilities: Capabilities): void {
  const dim = capabilities.color ? '\u001b[38;5;245m' : '';
  const reset = capabilities.color ? '\u001b[0m' : '';

  process.stdout.write('\n');
  for (const command of SHELL_COMMANDS) {
    process.stdout.write(`  /${command.name.padEnd(11)} ${dim}${command.summary}${reset}\n`);
    if (command.usage) process.stdout.write(`   ${' '.repeat(11)} ${dim}${command.usage}${reset}\n`);
  }
  process.stdout.write('\n');
}

// ---------------------------------------------------------------- execution

/**
 * Splits a line into argv, honoring quotes so `--reason "a b"` survives.
 */
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

function runChild(argv: string[], globals: GlobalFlags): Promise<void> {
  return new Promise<void>((resolve) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...inheritedFlags(globals), ...argv], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', (error) => {
      process.stderr.write(`\n  could not run: ${error.message}\n`);
      resolve();
    });

    // Exit codes are informational here: a scan that finds problems exits 1,
    // which is not a shell error and must not look like one.
    child.on('close', () => resolve());
  });
}

// ---------------------------------------------------------------- prompt

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
    // piped session or a closed terminal looks like. Treat EOF as `/exit`.
    const onEnd = () => finish(null);
    process.stdin.once('end', onEnd);
    process.stdin.once('close', onEnd);

    const instance = render(
      <Prompt capabilities={capabilities} glyphs={glyphs} history={history} onSubmit={finish} />,
      // Ink clears its own output on unmount by default; keeping the frame means
      // the submitted line stays in scrollback like a real shell.
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
    // typing is fast or the line is pasted. Split on the first newline: whatever
    // precedes it completes the line, and the rest is discarded.
    const newlineAt = input.search(/[\r\n]/);
    const isEnter = key.return || newlineAt >= 0;

    if (isEnter) {
      const typedBeforeEnter = newlineAt >= 0 ? input.slice(0, newlineAt) : '';
      const line = value + typedBeforeEnter;

      // With the palette open and nothing typed past the command name, Enter
      // takes the highlighted entry rather than the raw text.
      if (line.startsWith('/') && !line.includes(' ')) {
        const options = filterCommands(line);
        if (options.length > 0) {
          const picked = options[Math.min(selected, options.length - 1)] as ShellCommand;
          submit(`/${picked.name}`);
          return;
        }
      }
      submit(line);
      return;
    }

    if (key.tab && showPalette && matches.length > 0) {
      const picked = matches[Math.min(selected, matches.length - 1)] as ShellCommand;
      // Tab completes without running, so arguments can be typed after it.
      setValue(`/${picked.name} `);
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
      // Strip control characters so a stray CR/LF cannot end up inside the line.
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
