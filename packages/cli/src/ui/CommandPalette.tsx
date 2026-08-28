/**
 * The `/` command palette shown inside the interactive shell.
 *
 * Filtered as you type, arrow keys to move, Enter to run. The catalogue lives
 * here rather than being derived from commander, because the shell wants a
 * short human description and a usage hint per command, and commander's help
 * text is written for a different context.
 */

import { Box, Text } from 'ink';
import React from 'react';

import { COLOR } from './theme.js';
import type { Capabilities } from './theme.js';

/**
 * One thing you can put after a command: a subcommand, a flag, an argument.
 *
 * The palette stopped being useful the moment you finished typing a command
 * name — `/scan` was as far as it would take you, and everything after it you
 * had to already know. These are what it shows once the name is complete.
 */
export interface CommandArg {
  name: string;
  summary: string;
  /** Subcommands come first and read differently from flags. */
  kind?: 'subcommand' | 'flag';
}

export interface ShellCommand {
  name: string;
  summary: string;
  usage?: string;
  /** Shown once the command name is typed and a space follows it. */
  args?: CommandArg[];
  /**
   * Words that should find this command, beyond its name and summary.
   *
   * Mostly subcommands. `/revenue sweep` is one palette entry, so somebody who
   * knows they want a sweep and types `/sweep` would otherwise be told there is
   * no such command — which is true and useless.
   */
  keywords?: string[];
  /** Handled by the shell itself rather than dispatched to the CLI. */
  local?: boolean;
}

export const SHELL_COMMANDS: ShellCommand[] = [
  {
    name: 'scan',
    summary: 'Scan a path and stream findings',
    usage: '/scan [path] [--json] [--sarif <file>]',
    args: [
      { name: '<path>', summary: 'what to scan — defaults to the current directory' },
      { name: '--diff', summary: 'only what the baseline does not already contain', kind: 'flag' },
      { name: '--severity-threshold <level>', summary: 'the bar: critical | high | medium | low | info', kind: 'flag' },
      { name: '--fail-on <what>', summary: 'what blocks: all | new | verified-secrets', kind: 'flag' },
      { name: '--ruleset <name>', summary: 'p/fintech-core, or p/<category> to narrow it', kind: 'flag' },
      { name: '--validate-secrets', summary: 'ask the provider whether a leaked key still works', kind: 'flag' },
      { name: '--json', summary: 'one machine-readable object instead of cards', kind: 'flag' },
      { name: '--sarif <file>', summary: 'SARIF 2.1.0, for GitHub code scanning', kind: 'flag' },
      { name: '--local', summary: 'the built-in engine even when a project is set', kind: 'flag' },
    ],
  },
  {
    name: 'fix',
    summary: 'Apply a Cerebus fix suggestion',
    usage: '/fix <SIR-SEC-001> [--all] [--apply]',
    args: [
      { name: '<rule-id>', summary: 'which finding to fix, e.g. SIR-SEC-001' },
      { name: '--all', summary: 'every finding of that rule, not just the first', kind: 'flag' },
      { name: '--apply', summary: 'write it without asking — the shell asks by default', kind: 'flag' },
    ],
  },
  {
    name: 'triage',
    summary: 'Decide about each finding, one key at a time, without leaving the shell',
    usage: '/triage [--decided] [severity]',
    args: [
      { name: '--decided', summary: 'list what you already chose, without reopening the queue', kind: 'flag' },
      { name: 'critical', summary: 'only findings of that severity — also high, medium, low' },
    ],
  },
  {
    name: 'watch',
    summary: 'Re-scan on file change — takes the whole terminal, Ctrl-C comes back',
    usage: '/watch [path]',
  },
  { name: 'doctor', summary: 'Check config, connectivity, and terminal' },
  {
    name: 'explain',
    summary: 'Show how a money-at-risk figure was derived — for a record, /revenue explain',
    usage: '/explain SIR-SEC-001',
  },
  {
    name: 'rules',
    summary: 'List, show, validate, or test rules',
    usage: '/rules [list|show|validate|test] [target]',
    args: [
      { name: 'list', summary: 'every rule this build ships, by category', kind: 'subcommand' },
      { name: 'show', summary: 'one rule in full — clauses, fix action, suppression token', kind: 'subcommand' },
      { name: 'validate', summary: 'check a rule YAML against the conventions', kind: 'subcommand' },
      { name: 'test', summary: 'run the rule against its annotated fixture', kind: 'subcommand' },
    ],
    keywords: ['test', 'validate', 'yaml'],
  },
  {
    name: 'revenue',
    summary: 'Find, price and recover revenue at risk — `watch` runs until Ctrl-C',
    usage: '/revenue [gen|detect|eval|recover|explain|sweep|stress|watch|audit] [batch]',
    args: [
      { name: 'gen', summary: 'make a seeded batch with a known answer key', kind: 'subcommand' },
      { name: 'detect', summary: 'score it, name the outage, pick what to work', kind: 'subcommand' },
      { name: 'eval', summary: 'measure it against the half it never saw', kind: 'subcommand' },
      { name: 'recover', summary: 'work the queue under the stopping rules', kind: 'subcommand' },
      { name: 'explain', summary: 'why one record scored what it did', kind: 'subcommand' },
      { name: 'sweep', summary: 'the same evaluation over N seeded batches', kind: 'subcommand' },
      { name: 'stress', summary: 'what survives when the world shifts', kind: 'subcommand' },
      { name: 'watch', summary: 're-run when the batch or the policy changes', kind: 'subcommand' },
      { name: 'audit', summary: 'verify a recovery trail has not been altered', kind: 'subcommand' },
    ],
    keywords: [
      'gen',
      'detect',
      'eval',
      'recover',
      'explain',
      'sweep',
      'stress',
      'audit',
      'robustness',
      'drift',
      'payments',
      'invoices',
      'churn',
      'tune',
    ],
  },
  {
    name: 'reconcile',
    summary: 'Match the ledger against settlements and the bank',
    usage: '/reconcile [books] [--gen] [--exceptions]',
    args: [
      { name: 'books', summary: 'the directory holding the three sets — defaults to ./books' },
      { name: '--gen', summary: 'generate a seeded set first, if you have none', kind: 'flag' },
      { name: '--exceptions', summary: 'every unresolved line, not just the first few', kind: 'flag' },
    ],
    keywords: ['settlement', 'bank', 'ledger', 'close', 'match', 'utr'],
  },
  {
    name: 'report',
    summary: 'Download a signed compliance report',
    usage: '/report [--format json|pdf] [--verify <file>]',
    args: [
      { name: '--format json', summary: 'signed JSON — the file `--verify` can check', kind: 'flag' },
      { name: '--format pdf', summary: 'a page to hand someone; the signature covers the payload', kind: 'flag' },
      { name: '--verify <file>', summary: 'check a report has not been altered since signing', kind: 'flag' },
    ],
  },
  { name: 'suppress', summary: 'Suppress a rule, with a reason', usage: '/suppress <rule> --reason "…"' },
  {
    name: 'baseline',
    summary: 'Set or show the baseline',
    usage: '/baseline [set|show]',
    args: [
      { name: 'set', summary: "accept today's findings, so later scans show only what is new", kind: 'subcommand' },
      { name: 'show', summary: 'what the baseline currently holds', kind: 'subcommand' },
    ],
  },
  { name: 'badge', summary: 'Print the compliance badge URL' },
  { name: 'init', summary: 'Scaffold sirius.yaml and .siriusignore' },
  { name: 'login', summary: 'Store an API key', usage: '/login --api-key <key>' },
  { name: 'logout', summary: 'Remove a stored profile' },
  { name: 'cd', summary: 'Show or change the directory everything runs in', usage: '/cd [path] — bare /cd says where you are', local: true },
  { name: 'help', summary: 'Show this list', local: true },
  { name: 'clear', summary: 'Clear the screen', local: true },
  { name: 'exit', summary: 'Leave the shell', local: true },
];

/**
 * Name first, then everything else.
 *
 * The exact-name pass wins outright so `/explain` is the rule explainer and not
 * a list of every command mentioning the word. Only when nothing matches by
 * name does it widen to summaries and keywords, which is what lets `/sweep` and
 * `/utr` find the commands that actually do those things.
 */
export function filterCommands(query: string): ShellCommand[] {
  const needle = query.replace(/^\//, '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!needle) return SHELL_COMMANDS;

  const byName = SHELL_COMMANDS.filter((c) => c.name.startsWith(needle));
  if (byName.length > 0) return byName;

  return SHELL_COMMANDS.filter(
    (c) =>
      c.name.includes(needle) ||
      c.summary.toLowerCase().includes(needle) ||
      (c.keywords ?? []).some((keyword) => keyword.startsWith(needle)),
  );
}

/**
 * What can follow the command already typed.
 *
 * Returns nothing until the name is complete and a space follows it, so the
 * command list is never replaced while somebody is still choosing a command.
 * The last token filters, which makes `--sa` narrow to `--sarif`.
 */
export function argCompletions(query: string): { command: ShellCommand; args: CommandArg[] } | undefined {
  const match = /^\/([a-z]+)\s+(.*)$/.exec(query);
  if (!match) return undefined;

  const command = SHELL_COMMANDS.find((candidate) => candidate.name === match[1]);
  if (!command?.args) return undefined;

  const typed = (match[2] ?? '').split(/\s+/).at(-1) ?? '';
  const already = (match[2] ?? '').split(/\s+/).slice(0, -1);

  const remaining = command.args.filter((arg) => !already.some((word) => arg.name.startsWith(word) && word.length > 1));
  if (!typed) return { command, args: remaining };

  const narrowed = remaining.filter((arg) => arg.name.startsWith(typed));
  return { command, args: narrowed.length > 0 ? narrowed : remaining };
}

export interface CommandPaletteProps {
  commands: ShellCommand[];
  selected: number;
  capabilities: Capabilities;
  max?: number;
}

export function CommandPalette({ commands, selected, capabilities, max = 8 }: CommandPaletteProps) {
  const muted = capabilities.color ? COLOR.muted : undefined;

  if (commands.length === 0) {
    return <Text color={muted}>{'  no matching command'}</Text>;
  }

  // Keep the highlighted row inside the window as the list scrolls.
  const start = Math.max(0, Math.min(selected - Math.floor(max / 2), commands.length - max));
  const window = commands.slice(Math.max(0, start), Math.max(0, start) + max);

  return (
    <Box flexDirection="column">
      {window.map((command, i) => {
        const index = Math.max(0, start) + i;
        const isSelected = index === selected;
        return (
          <Box key={command.name}>
            <Text color={capabilities.color ? COLOR.accent : undefined}>{isSelected ? '  > ' : '    '}</Text>
            <Text bold={isSelected} color={isSelected ? undefined : muted}>
              {`/${command.name}`.padEnd(12)}
            </Text>
            <Text color={muted}>{command.summary}</Text>
          </Box>
        );
      })}
      {commands.length > window.length ? (
        <Text color={muted}>{`    … ${commands.length - window.length} more`}</Text>
      ) : null}
    </Box>
  );
}

export interface ArgPaletteProps {
  command: ShellCommand;
  args: CommandArg[];
  selected: number;
  capabilities: Capabilities;
  max?: number;
}

/**
 * What can follow the command, once the command is chosen.
 *
 * Subcommands and flags read differently and are coloured differently, because
 * `gen` and `--json` are not the same kind of thing and a flat list of both
 * makes you work that out for yourself.
 */
export function ArgPalette({ command, args, selected, capabilities, max = 7 }: ArgPaletteProps) {
  const muted = capabilities.color ? COLOR.muted : undefined;
  const accent = capabilities.color ? COLOR.accent : undefined;

  if (args.length === 0) {
    return <Text color={muted}>{`  /${command.name} takes nothing else`}</Text>;
  }

  const start = Math.max(0, Math.min(selected - Math.floor(max / 2), args.length - max));
  const window = args.slice(Math.max(0, start), Math.max(0, start) + max);
  const width = Math.max(...args.map((arg) => arg.name.length));

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={muted} wrap="truncate-end">{`  ${command.usage ?? `/${command.name}`}`}</Text>
      </Box>
      {window.map((arg, i) => {
        const index = Math.max(0, start) + i;
        const isSelected = index === selected;
        return (
          <Box key={arg.name}>
            <Text color={accent}>{isSelected ? '  > ' : '    '}</Text>
            <Text bold={isSelected} color={isSelected ? undefined : arg.kind === 'flag' ? muted : accent}>
              {arg.name.padEnd(width + 2)}
            </Text>
            {/* Truncated, not wrapped. A summary that runs onto a second line
                pushes every row below it out of its column, and the list stops
                reading as a list. */}
            <Text color={muted} wrap="truncate-end">
              {arg.summary.slice(0, Math.max(10, capabilities.width - width - 10))}
            </Text>
          </Box>
        );
      })}
      {args.length > window.length ? (
        <Text color={muted}>{`    … ${args.length - window.length} more`}</Text>
      ) : null}
    </Box>
  );
}
