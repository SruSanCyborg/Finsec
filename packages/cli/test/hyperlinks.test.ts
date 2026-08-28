/**
 * OSC 8, and the two ways it goes wrong.
 *
 * A `file:line` the terminal can open is the smallest change on the design
 * report's list and the one it calls the most impressive. It also has a
 * genuinely bad failure mode: a terminal that does not understand the sequence
 * prints its payload as text, so every location in the output becomes a line of
 * escape gibberish. That is why it is detected rather than assumed, and off
 * whenever there is doubt.
 */

import { describe, expect, it } from 'vitest';

import { hyperlink, stripAnsi, visibleWidth } from '../src/ui/kit.js';
import { detectCapabilities } from '../src/ui/theme.js';

const ESC = String.fromCharCode(27);

describe('the sequence', () => {
  it('wraps the text and hides the target', () => {
    const link = hyperlink('src/app.py:14', '/repo/src/app.py', 14);
    expect(link).toContain('src/app.py:14');
    expect(link).toContain('file:///repo/src/app.py#L14');
    expect(link.startsWith(`${ESC}]8;;`)).toBe(true);
    expect(link.endsWith(`${ESC}]8;;${ESC}\\`)).toBe(true);
  });

  it('occupies only the columns of its text', () => {
    // The property the layout depends on. The payload is bytes the terminal
    // never draws, so padding a wrapped string would pad the escape and pull
    // the column left by however long the path happens to be.
    const link = hyperlink('a.py:1', '/very/long/path/that/goes/on/and/on/a.py', 1);
    expect(visibleWidth(link)).toBe(visibleWidth('a.py:1'));
    expect(stripAnsi(link)).toContain('a.py:1');
  });

  it('takes an editor scheme, because file:// forgets the line', () => {
    const previous = process.env.SIRIUS_LINK_SCHEME;
    process.env.SIRIUS_LINK_SCHEME = 'vscode';
    try {
      expect(hyperlink('a.py:9', '/repo/a.py', 9)).toContain('vscode://file//repo/a.py:9');
    } finally {
      if (previous === undefined) delete process.env.SIRIUS_LINK_SCHEME;
      else process.env.SIRIUS_LINK_SCHEME = previous;
    }
  });
});

/** Runs `body` with the given environment, and puts the environment back. */
function withEnv(env: Record<string, string | undefined>, body: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    body();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('when it switches on', () => {
  it('is off in a pipe, where nothing can click anything', () => {
    // Which is also the case every test and every CI log takes.
    withEnv({ SIRIUS_LINKS: undefined, TERM_PROGRAM: 'iTerm.app' }, () => {
      expect(detectCapabilities({}).hyperlinks).toBe(false);
    });
  });

  it('obeys an explicit yes', () => {
    withEnv({ SIRIUS_LINKS: '1' }, () => {
      expect(detectCapabilities({}).hyperlinks).toBe(true);
    });
  });

  it('can be forced off, for a terminal that lies about itself', () => {
    withEnv({ SIRIUS_LINKS: '0', TERM_PROGRAM: 'iTerm.app' }, () => {
      expect(detectCapabilities({}).hyperlinks).toBe(false);
    });
  });

  it('does not guess yes for a terminal it does not recognise', () => {
    // The important one. Guessing wrong prints the escape payload as text on
    // every finding, which is far worse than a location that is not clickable.
    withEnv(
      {
        SIRIUS_LINKS: undefined,
        TERM_PROGRAM: 'SomeoneElsesTerminal',
        KITTY_WINDOW_ID: undefined,
        WT_SESSION: undefined,
        VTE_VERSION: undefined,
      },
      () => {
        expect(detectCapabilities({}).hyperlinks).toBe(false);
      },
    );
  });
});
