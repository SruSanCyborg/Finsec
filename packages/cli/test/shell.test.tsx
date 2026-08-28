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
    stdin.write('\u001b[A');
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

/**
 * Finding a command you know the name of half of.
 *
 * `/revenue sweep` is one palette entry, so somebody who knows they want a
 * sweep and types `/sweep` would be told there is no such command — which is
 * true and useless. Keywords widen the search without adding command surface
 * the CLI itself does not have.
 */
describe('the palette finds subcommands', () => {
  const names = (query: string) => filterCommands(query).map((command) => command.name);

  it('finds the revenue subcommands by their own names', () => {
    for (const query of ['/sweep', '/audit', '/recover', '/detect']) {
      expect(names(query), query).toContain('revenue');
    }
  });

  it('finds reconciliation by the words the job is called', () => {
    for (const query of ['/settlement', '/utr', '/close', '/ledger']) {
      expect(names(query), query).toContain('reconcile');
    }
  });

  it('lets an exact name win outright', () => {
    // `/explain` is the rule explainer. It must not turn into a list of every
    // command that happens to mention explaining.
    expect(names('/explain')).toEqual(['explain']);
    expect(names('/scan')).toEqual(['scan']);
  });

  it('lists every subcommand the CLI accepts in the usage hint', () => {
    const revenue = SHELL_COMMANDS.find((command) => command.name === 'revenue');
    for (const sub of ['gen', 'detect', 'eval', 'recover', 'explain', 'sweep', 'audit']) {
      expect(revenue?.usage, sub).toContain(sub);
    }
  });

  it('still returns everything for an empty query', () => {
    expect(filterCommands('/').length).toBe(SHELL_COMMANDS.length);
  });
});

/**
 * Commands that take the whole terminal.
 *
 * The shell used to answer `/triage` with "leave the shell and run: sirius
 * triage", which is a tool telling its user to go and use a different tool. It
 * hands the terminal over now and takes it back when the child exits.
 *
 * The handover itself is checked in a real pty by `pnpm shell:check` — it is
 * about process and terminal state, which nothing in-process can stand in for.
 * What is worth asserting here is that the palette stops promising the old
 * behaviour.
 */
describe('the full-screen commands', () => {
  const entry = (name: string) => SHELL_COMMANDS.find((command) => command.name === name);

  it('are still listed, not hidden', () => {
    expect(entry('triage')).toBeDefined();
    expect(entry('watch')).toBeDefined();
  });

  it('say how to get back rather than how to avoid them', () => {
    expect(entry('triage')?.summary).toMatch(/comes back/);
    expect(entry('watch')?.summary).toMatch(/comes back/);
  });

  it('name the key that quits each one, because they differ', () => {
    // `q` in triage, Ctrl-C in watch. Guessing wrong on a full-screen app that
    // has taken the terminal is a bad moment to be guessing.
    expect(entry('triage')?.summary).toContain('q');
    expect(entry('watch')?.summary).toContain('Ctrl-C');
  });

  it('no longer send the user away to run them', () => {
    // `/exit` says "Leave the shell" and should: that is what it does. What no
    // command may do any more is tell the user to go and run it elsewhere.
    for (const command of SHELL_COMMANDS) {
      const text = `${command.summary} ${command.usage ?? ''}`.toLowerCase();
      expect(text, command.name).not.toMatch(/leave the shell and run|run it outside|start the shell with/);
    }
  });
});
