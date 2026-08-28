/**
 * What the palette says after the command name.
 *
 * It stopped being useful the moment you finished typing one: `/scan` was as
 * far as it would take you, and every flag after that you had to already know.
 * Somebody typed `/scan`, got nothing more, and asked — reasonably — what else
 * they could put there.
 */

import { describe, expect, it } from 'vitest';

import { SHELL_COMMANDS, argCompletions, filterCommands } from '../src/ui/CommandPalette.js';

describe('while still choosing a command', () => {
  it('offers nothing, so the command list is not replaced mid-word', () => {
    expect(argCompletions('/sc')).toBeUndefined();
    expect(argCompletions('/scan')).toBeUndefined();
    expect(filterCommands('/sc').map((c) => c.name)).toContain('scan');
  });
});

describe('once the command is chosen', () => {
  it('offers what can follow it', () => {
    const found = argCompletions('/scan ');
    expect(found?.command.name).toBe('scan');
    expect(found?.args.map((a) => a.name)).toContain('--sarif <file>');
  });

  it('narrows as you type', () => {
    const found = argCompletions('/scan --sa');
    expect(found?.args.map((a) => a.name)).toEqual(['--sarif <file>']);
  });

  it('shows subcommands for the commands that have them', () => {
    expect(argCompletions('/revenue ')?.args.map((a) => a.name)).toContain('detect');
    expect(argCompletions('/rules ')?.args.map((a) => a.name)).toContain('validate');
    expect(argCompletions('/baseline ')?.args.map((a) => a.name)).toEqual(['set', 'show']);
  });

  it('stops offering what is already on the line', () => {
    // Suggesting `--json` to somebody who has just typed `--json` is the
    // completion equivalent of not listening.
    const found = argCompletions('/scan --json ');
    expect(found?.args.map((a) => a.name)).not.toContain('--json');
  });

  it('falls back to the full list rather than going blank on a typo', () => {
    // An empty panel reads as "there is nothing here", which is a lie — it
    // means "nothing starts with that".
    const found = argCompletions('/scan --zzz');
    expect(found?.args.length).toBeGreaterThan(0);
  });

  it('says nothing for a command that takes nothing', () => {
    expect(argCompletions('/badge ')).toBeUndefined();
    expect(argCompletions('/nonsense ')).toBeUndefined();
  });
});

describe('the catalogue itself', () => {
  it('gives every documented subcommand an explanation', () => {
    // A name with no summary is the state this was in before: you can see the
    // word and still not know what it does.
    for (const command of SHELL_COMMANDS) {
      for (const arg of command.args ?? []) {
        expect(arg.summary.length, `${command.name} ${arg.name}`).toBeGreaterThan(8);
      }
    }
  });

  it('covers every subcommand its usage line advertises', () => {
    // `/revenue [gen|detect|…]` promising nine subcommands and listing four
    // would be worse than listing none.
    for (const command of SHELL_COMMANDS) {
      const advertised = /\[([a-z|]+)\]/.exec(command.usage ?? '')?.[1]?.split('|') ?? [];
      if (advertised.length < 2) continue;
      const offered = (command.args ?? []).map((arg) => arg.name.split(' ')[0]);
      for (const name of advertised) {
        expect(offered, `${command.name} advertises ${name}`).toContain(name);
      }
    }
  });
});
