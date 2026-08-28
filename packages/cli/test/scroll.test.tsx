/**
 * Scroll bindings.
 *
 * These exist because the original two bindings were unreachable on the machine
 * this is built on: a MacBook has no PgUp key (it is Fn+↑) and macOS claims
 * Ctrl+↑ for Mission Control, so a Mac user had no working way to scroll and
 * plain ↑ recalls command history instead. Every binding below is one a Mac
 * keyboard can actually send.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { FullScreenShell } from '../src/ui/FullScreenShell.js';
import { detectCapabilities, glyphsFor } from '../src/ui/theme.js';

const ESC = '\u001b';
const capabilities = { ...detectCapabilities(), color: false, tty: true, unicode: true, width: 100 };
const settle = () => new Promise((r) => setTimeout(r, 20));

const lines = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i, text: `line-${i}`, kind: 'output' as const }));

function setup() {
  return render(
    <FullScreenShell
      glyphs={glyphsFor(capabilities)}
      capabilities={capabilities}
      header="sirius"
      lines={lines(400)}
      busy={false}
      history={[]}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      onExit={vi.fn()}
    />,
  );
}

describe('scrolling', () => {
  it.each([
    ['shift+up', `${ESC}[1;2A`],
    ['page up', `${ESC}[5~`],
    ['ctrl+u', ''],
  ])('%s moves off the tail', async (_name, sequence) => {
    const { stdin, lastFrame } = setup();
    expect(lastFrame()).toContain('line-399');

    stdin.write(sequence);
    await settle();

    // Off the tail, the footer switches to the paused-follow hint.
    expect(lastFrame()).toContain('below');
  });

  it('escape returns to the bottom and resumes following', async () => {
    const { stdin, lastFrame } = setup();

    stdin.write(`${ESC}[5~`);
    await settle();
    expect(lastFrame()).toContain('below');

    stdin.write(ESC);
    await settle();
    expect(lastFrame()).toContain('line-399');
  });

  it('shift+down walks back toward the tail', async () => {
    const { stdin, lastFrame } = setup();

    stdin.write(`${ESC}[5~`);
    await settle();
    const scrolledBack = lastFrame() ?? '';

    stdin.write(`${ESC}[1;2B`);
    await settle();

    expect(lastFrame()).not.toBe(scrolledBack);
  });

  it('tells the user how to get back while paused', async () => {
    const { stdin, lastFrame } = setup();
    stdin.write(`${ESC}[5~`);
    await settle();

    expect(lastFrame()).toContain('esc back to bottom');
  });
});
