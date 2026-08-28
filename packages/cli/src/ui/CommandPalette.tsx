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

export interface ShellCommand {
  name: string;
  summary: string;
  usage?: string;
  /** Handled by the shell itself rather than dispatched to the CLI. */
  local?: boolean;
}

export const SHELL_COMMANDS: ShellCommand[] = [
  { name: 'scan', summary: 'Scan a path and stream findings', usage: '/scan [path] [--json] [--sarif <file>]' },
  { name: 'fix', summary: 'Apply a Cerebus fix suggestion', usage: '/fix <SIR-SEC-001> [--all] [--apply]' },
  { name: 'triage', summary: 'Review findings interactively', usage: '/triage [--severity <level>]' },
  { name: 'watch', summary: 'Re-scan on file change', usage: '/watch [path]' },
  { name: 'doctor', summary: 'Check config, connectivity, and terminal' },
  { name: 'rules', summary: 'List, show, or validate rules', usage: '/rules [list|show|validate] [target]' },
  { name: 'report', summary: 'Download a signed compliance report', usage: '/report [scan-id] [--format json]' },
  { name: 'suppress', summary: 'Suppress a rule, with a reason', usage: '/suppress <rule> --reason "…"' },
  { name: 'baseline', summary: 'Set or show the baseline', usage: '/baseline [set|show]' },
  { name: 'badge', summary: 'Print the compliance badge URL' },
  { name: 'init', summary: 'Scaffold sirius.yaml and .siriusignore' },
  { name: 'login', summary: 'Store an API key', usage: '/login --api-key <key>' },
  { name: 'logout', summary: 'Remove a stored profile' },
  { name: 'help', summary: 'Show this list', local: true },
  { name: 'clear', summary: 'Clear the screen', local: true },
  { name: 'exit', summary: 'Leave the shell', local: true },
];

/** Matches on the command name, then its summary, so `/secret` finds nothing but `/rule` finds rules. */
export function filterCommands(query: string): ShellCommand[] {
  const needle = query.replace(/^\//, '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!needle) return SHELL_COMMANDS;

  const byName = SHELL_COMMANDS.filter((c) => c.name.startsWith(needle));
  if (byName.length > 0) return byName;

  return SHELL_COMMANDS.filter(
    (c) => c.name.includes(needle) || c.summary.toLowerCase().includes(needle),
  );
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
