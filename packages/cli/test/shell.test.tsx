/**
 * The interactive shell's input handling.
 *
 * Argument tokenizing and the `/` palette are the parts with real logic; the
 * rest of the shell is a loop that spawns child processes.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { Prompt, tokenize } from '../src/commands/shell.js';
import { SHELL_COMMANDS, filterCommands } from '../src/ui/CommandPalette.js';
import { detectCapabilities, glyphsFor } from '../src/ui/theme.js';

const capabilities = { ...detectCapabilities(), color: false, tty: true, unicode: true, width: 100 };
const glyphs = glyphsFor(capabilities);
const settle = () => new Promise((r) => setTimeout(r, 20));

function setup(history: string[] = []) {
  const onSubmit = vi.fn();
  const app = render(
    <Prompt capabilities={capabilities} glyphs={glyphs} history={history} onSubmit={onSubmit} />,
  );
  return { ...app, onSubmit };
}

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(tokenize('scan . --json')).toEqual(['scan', '.', '--json']);
  });

  it('keeps double-quoted arguments together', () => {
    expect(tokenize('suppress SIR-SEC-010 --reason "test fixture, not live"')).toEqual([
      'suppress',
      'SIR-SEC-010',
      '--reason',
      'test fixture, not live',
    ]);
  });

  it('keeps single-quoted arguments together', () => {
    expect(tokenize("fix SIR-SEC-001 --reason 'a b'")).toEqual(['fix', 'SIR-SEC-001', '--reason', 'a b']);
  });

  it('collapses runs of whitespace', () => {
    expect(tokenize('  scan    .  ')).toEqual(['scan', '.']);
  });

  it('returns nothing for an empty line', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('filterCommands', () => {
  it('lists everything for a bare slash', () => {
    expect(filterCommands('/')).toHaveLength(SHELL_COMMANDS.length);
  });

  it('prefers a prefix match on the name', () => {
    expect(filterCommands('/sc').map((c) => c.name)).toEqual(['scan']);
  });

  it('falls back to summaries when no name matches', () => {
    const names = filterCommands('/compliance').map((c) => c.name);
    expect(names).toContain('report');
  });

  it('ignores arguments typed after the command', () => {
    expect(filterCommands('/scan . --json').map((c) => c.name)).toEqual(['scan']);
  });

  it('returns nothing for a nonsense command', () => {
    expect(filterCommands('/zzzz')).toEqual([]);
  });
});

describe('Prompt', () => {
  it('shows the palette once a slash is typed', async () => {
    const { stdin, lastFrame } = setup();
    expect(lastFrame()).not.toContain('/scan');

    stdin.write('/');
    await settle();

    expect(lastFrame()).toContain('/scan');
    expect(lastFrame()).toContain('/triage');
  });

  it('narrows the palette as you type', async () => {
    const { stdin, lastFrame } = setup();
    stdin.write('/tri');
    await settle();

    expect(lastFrame()).toContain('/triage');
    expect(lastFrame()).not.toContain('/scan');
  });

  it('runs the highlighted command on enter', async () => {
    const { stdin, onSubmit } = setup();
    stdin.write('/sc');
    await settle();
    stdin.write('\r');
    await settle();

    expect(onSubmit).toHaveBeenCalledWith('/scan');
  });

  it('submits the raw line once arguments are present', async () => {
    const { stdin, onSubmit } = setup();
    stdin.write('/scan . --json');
    await settle();
    stdin.write('\r');
    await settle();

    // Not the highlighted entry — the typed line, arguments and all.
    expect(onSubmit).toHaveBeenCalledWith('/scan . --json');
  });

  it('accepts a command typed without a slash', async () => {
    const { stdin, onSubmit } = setup();
    stdin.write('doctor');
    await settle();
    stdin.write('\r');
    await settle();

    expect(onSubmit).toHaveBeenCalledWith('doctor');
  });

  it('tab completes without running', async () => {
    const { stdin, lastFrame, onSubmit } = setup();
    stdin.write('/tri');
    await settle();
    stdin.write('\t');
    await settle();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('/triage');
  });

  it('recalls history with the up arrow', async () => {
    const { stdin, lastFrame } = setup(['scan .', 'doctor']);
    stdin.write('[A');
    await settle();

    expect(lastFrame()).toContain('doctor');
  });

  it('backspace deletes a character', async () => {
    const { stdin, lastFrame } = setup();
    stdin.write('doctorX');
    await settle();
    stdin.write('');
    await settle();

    expect(lastFrame()).toContain('doctor');
    expect(lastFrame()).not.toContain('doctorX');
  });

  it('ctrl-c leaves the shell', async () => {
    const { stdin, onSubmit } = setup();
    stdin.write('');
    await settle();

    expect(onSubmit).toHaveBeenCalledWith(null);
  });
});
