/**
 * Everything you can run as `sirius x` you can run as `/x`, and the reverse.
 *
 * This has now been fixed three times by hand — `revenue stress`, `rules test`,
 * `ledger` — each time by somebody noticing a command was missing from the
 * palette after it shipped. Fixing it a fourth time by hand would be the wrong
 * response: the two lists live in different files and nothing made them agree,
 * so they drifted every time either one grew.
 *
 * This is the thing that makes them agree. Adding a command to `cli.ts` without
 * adding it to the palette now fails the build, and so does the reverse.
 *
 * The exceptions are listed here rather than allowed as a general slack, and
 * each carries the reason it is one. A blanket "some commands are shell-only"
 * would let the next real gap through disguised as one of these.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SHELL_COMMANDS } from '../src/ui/CommandPalette.js';

const here = dirname(fileURLToPath(import.meta.url));
const cliSource = readFileSync(join(here, '..', 'src', 'cli.ts'), 'utf8');

/** Commands commander registers — what works as `sirius <name>`. */
const registered = [...cliSource.matchAll(/\.command\('([a-z-]+)'\)/g)].map((match) => match[1] as string);
const palette = SHELL_COMMANDS.map((command) => command.name);

/**
 * Commands that exist on one side only, and why.
 *
 * Every entry is a claim that the command would be meaningless on the other
 * side — not that nobody got round to it.
 */
const SHELL_ONLY: Record<string, string> = {
  // A one-shot process cannot change its parent shell's directory, so
  // `sirius cd` would be a command that appears to work and does nothing.
  cd: 'changes the directory the shell runs in; a one-shot process cannot',
  clear: "clears the shell's transcript; there is no transcript outside it",
  exit: 'leaves the shell; outside one there is nothing to leave',
  // `sirius --help` and `sirius help <cmd>` are commander's, and better.
  help: 'commander already provides --help and help <command> outside the shell',
};

describe('the two ways to run a command', () => {
  it('offers every CLI command in the palette', () => {
    const missing = registered.filter((name) => !palette.includes(name));
    // If this fails: add the command to SHELL_COMMANDS in CommandPalette.tsx.
    // A command the shell dispatches but never lists is one nobody finds.
    expect(missing).toEqual([]);
  });

  it('backs every palette entry with a real command, or a stated exception', () => {
    const extra = palette.filter((name) => !registered.includes(name) && !(name in SHELL_ONLY));
    // If this fails: either register it in cli.ts, or add it to SHELL_ONLY with
    // the reason it cannot exist outside the shell.
    expect(extra).toEqual([]);
  });

  it('keeps the exception list honest', () => {
    // An exception for a command that does exist outside the shell is a stale
    // note that would hide a real gap behind it.
    for (const [name, why] of Object.entries(SHELL_ONLY)) {
      expect(palette, `${name} is excused but not in the palette`).toContain(name);
      expect(registered, `${name} is excused but exists as a CLI command`).not.toContain(name);
      expect(why.length).toBeGreaterThan(20);
    }
  });
});

describe('what the palette says about each command', () => {
  it('gives every command a summary somebody can act on', () => {
    for (const command of SHELL_COMMANDS) {
      expect(command.summary.length, command.name).toBeGreaterThan(12);
      // A summary that is just the command's own name back again tells nobody
      // anything: `/badge` — "badge".
      expect(command.summary.toLowerCase().trim(), command.name).not.toBe(command.name);
    }
  });

  it('writes usage in the slash form, since that is where it is read', () => {
    for (const command of SHELL_COMMANDS) {
      if (!command.usage) continue;
      expect(command.usage.startsWith('/'), `${command.name}: ${command.usage}`).toBe(true);
    }
  });

  it('names the command its own usage line describes', () => {
    // `/report` documenting `/repot [scan-id]` is the kind of typo that survives
    // review forever, because both halves look right on their own.
    for (const command of SHELL_COMMANDS) {
      if (!command.usage) continue;
      expect(command.usage.split(/\s/)[0], command.name).toBe(`/${command.name}`);
    }
  });
});
