/**
 * Scroll bindings, pinned to what Ink actually delivers.
 *
 * Measured rather than assumed: a probe confirmed Ink reports plain arrows as
 * `upArrow`/`downArrow` with no modifier, Shift+arrows with `shift`, and Ctrl
 * chords as `{ ctrl: true, input: 'letter' }`. The binding that kept failing in
 * practice was Shift+Arrow, because Terminal.app sends a *bare* arrow for it —
 * so plain arrows now scroll and history moved to ctrl-p/ctrl-n.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { FullScreenShell } from '../src/ui/FullScreenShell.js';
import { detectCapabilities, glyphsFor } from '../src/ui/theme.js';

const ESC = '\u001b';
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const CTRL_G = '\u0007';
const CTRL_P = '\u0010';

const capabilities = { ...detectCapabilities(), color: false, tty: true, unicode: true, width: 100 };
const settle = () => new Promise((r) => setTimeout(r, 20));

const lines = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i, text: `line-${i}`, kind: 'output' as const }));

function setup(history: string[] = []) {
  const onSubmit = vi.fn();
  const app = render(
    <FullScreenShell
      glyphs={glyphsFor(capabilities)}
      capabilities={capabilities}
      header="sirius"
      lines={lines(400)}
      busy={false}
      history={history}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  return { ...app, onSubmit };
}

describe('plain arrows scroll', () => {
  it('up moves off the tail', async () => {
    const { stdin, lastFrame } = setup();
    expect(lastFrame()).toContain('line-399');

    stdin.write(UP);
    await settle();

    expect(lastFrame()).toContain('below');
  });

  it('down walks back toward the tail', async () => {
    const { stdin, lastFrame } = setup();
    stdin.write(UP);
    stdin.write(UP);
    await settle();
    const up = lastFrame();

    stdin.write(DOWN);
    await settle();

    expect(lastFrame()).not.toBe(up);
  });

  it('moves several lines at a time, not one', async () => {
    // One line per press made 92 lines of output effectively unscrollable.
    const { stdin, lastFrame } = setup();
    stdin.write(UP);
    await settle();

    const match = /(\d+) below/.exec(lastFrame() ?? '');
    expect(Number(match?.[1] ?? 0)).toBeGreaterThan(1);
  });
});

describe('jump to top and bottom', () => {
  it('ctrl-g goes to the very start, so the banner is reachable', async () => {
    const { stdin, lastFrame } = setup();
    stdin.write(CTRL_G);
    await settle();

    expect(lastFrame()).toContain('line-0');
  });

  it('escape returns to the tail', async () => {
    const { stdin, lastFrame } = setup();
    stdin.write(CTRL_G);
    await settle();
    expect(lastFrame()).toContain('line-0');

    stdin.write(ESC);
    await settle();
    expect(lastFrame()).toContain('line-399');
  });
});

describe('history moved off the arrows', () => {
  it('ctrl-p recalls the last command', async () => {
    const { stdin, lastFrame } = setup(['scan .', 'doctor']);
    stdin.write(CTRL_P);
    await settle();

    expect(lastFrame()).toContain('doctor');
  });

  it('plain up scrolls rather than recalling', async () => {
    const { stdin, lastFrame } = setup(['scan .', 'doctor']);
    stdin.write(UP);
    await settle();

    expect(lastFrame()).not.toContain('↳ doctor');
    expect(lastFrame()).toContain('below');
  });
});
