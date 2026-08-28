/**
 * The full-screen shell.
 *
 * The regression that matters most here is the viewport height. A pty that has
 * not been sized reports `rows` as 0, and `height={0}` clips the entire app to
 * nothing — the shell rendered zero bytes and looked like a crash. It is the
 * same trap already fixed for `columns`, so both axes are pinned by tests now.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FullScreenShell } from '../src/ui/FullScreenShell.js';
import { alternateScreenAvailable } from '../src/ui/screen.js';
import { parseLine, tokenize } from '../src/commands/shell.js';
import { detectCapabilities, glyphsFor } from '../src/ui/theme.js';
import type { TranscriptLine } from '../src/ui/FullScreenShell.js';

const capabilities = { ...detectCapabilities(), color: false, tty: true, unicode: true, width: 100 };
const glyphs = glyphsFor(capabilities);
const settle = () => new Promise((r) => setTimeout(r, 20));

const lines = (n: number): TranscriptLine[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, text: `line-${i}`, kind: 'output' as const }));

function setup(overrides: Partial<React.ComponentProps<typeof FullScreenShell>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const onExit = vi.fn();
  const app = render(
    <FullScreenShell
      glyphs={glyphs}
      capabilities={capabilities}
      header="sirius v0.4.0"
      lines={lines(3)}
      busy={false}
      history={[]}
      onSubmit={onSubmit}
      onCancel={onCancel}
      onExit={onExit}
      {...overrides}
    />,
  );
  return { ...app, onSubmit, onCancel, onExit };
}

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

describe('alternateScreenAvailable', () => {
  it('opts out when asked', () => {
    process.env.SIRIUS_NO_ALT_SCREEN = '1';
    expect(alternateScreenAvailable()).toBe(false);
  });

  it('refuses a dumb terminal', () => {
    delete process.env.SIRIUS_NO_ALT_SCREEN;
    process.env.TERM = 'dumb';
    expect(alternateScreenAvailable()).toBe(false);
  });

  it('refuses when there is no TERM at all', () => {
    delete process.env.SIRIUS_NO_ALT_SCREEN;
    delete process.env.TERM;
    expect(alternateScreenAvailable()).toBe(false);
  });
});

describe('FullScreenShell layout', () => {
  it('renders the header, transcript, and input box', () => {
    const frame = setup().lastFrame() ?? '';
    expect(frame).toContain('sirius v0.4.0');
    expect(frame).toContain('line-0');
    expect(frame).toContain('╭');
  });

  it('pins the input box below the transcript', () => {
    const frame = setup().lastFrame() ?? '';
    const rows = frame.split('\n');
    const lastTranscript = rows.findLastIndex((l) => l.includes('line-2'));
    const inputBox = rows.findIndex((l) => l.includes('╭'));
    expect(inputBox).toBeGreaterThan(lastTranscript);
  });

  it('shows a spinner and hides the cursor while busy', () => {
    const frame = setup({ busy: true, busyLabel: 'running /scan' }).lastFrame() ?? '';
    expect(frame).toContain('running /scan');
    expect(frame).toContain('ctrl-c cancel');
  });

  it('renders only a window of a long transcript', () => {
    const frame = setup({ lines: lines(500) }).lastFrame() ?? '';
    // Tail-following, so the newest line is on screen and the oldest is not.
    expect(frame).toContain('line-499');
    expect(frame).not.toContain('line-0 ');
  });
});

describe('FullScreenShell input', () => {
  it('submits a typed command', async () => {
    const { stdin, onSubmit } = setup();
    stdin.write('/badge');
    await settle();
    stdin.write('\r');
    await settle();
    expect(onSubmit).toHaveBeenCalledWith('/badge');
  });

  it('opens the palette on slash', async () => {
    const { stdin, lastFrame } = setup();
    stdin.write('/tri');
    await settle();
    expect(lastFrame()).toContain('/triage');
  });

  it('cancels a running command with ctrl-c rather than exiting', async () => {
    const { stdin, onCancel, onExit } = setup({ busy: true });
    stdin.write('');
    await settle();
    expect(onCancel).toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('needs two ctrl-c presses to leave, so a stray one does not', async () => {
    const { stdin, onExit } = setup();
    stdin.write('');
    await settle();
    expect(onExit).not.toHaveBeenCalled();

    stdin.write('');
    await settle();
    expect(onExit).toHaveBeenCalled();
  });

  it('ignores typing while a command runs', async () => {
    const { stdin, onSubmit } = setup({ busy: true });
    stdin.write('/badge');
    await settle();
    stdin.write('\r');
    await settle();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('scrolling up pauses auto-follow and says how to get back', async () => {
    const { stdin, lastFrame } = setup({ lines: lines(500) });
    stdin.write('\u001b[5~'); // PgUp
    await settle();
    expect(lastFrame()).toContain('esc bottom');
  });
});

describe('parseLine', () => {
  it('strips the leading slash and splits arguments', () => {
    expect(parseLine('/scan . --json')).toMatchObject({ name: 'scan', args: ['.', '--json'] });
  });

  it('accepts a command without a slash', () => {
    expect(parseLine('doctor')).toMatchObject({ name: 'doctor', local: false });
  });

  it('marks built-ins as local so they never spawn a process', () => {
    for (const name of ['exit', 'quit', 'clear', 'help']) {
      expect(parseLine(`/${name}`)?.local).toBe(true);
    }
  });

  it('marks an unknown command local, so it reports rather than spawning', () => {
    expect(parseLine('/nonsense')).toMatchObject({ local: true, command: undefined });
  });

  it('returns nothing for an empty line', () => {
    expect(parseLine('   ')).toBeNull();
  });
});

describe('tokenize', () => {
  it('keeps quoted arguments intact', () => {
    expect(tokenize('suppress SIR-SEC-010 --reason "a b"')).toEqual([
      'suppress',
      'SIR-SEC-010',
      '--reason',
      'a b',
    ]);
  });
});
