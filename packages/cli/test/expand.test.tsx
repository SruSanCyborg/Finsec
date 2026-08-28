/**
 * Ctrl+E, and the mouse sequences that must never reach the prompt.
 *
 * The click bug is the one worth pinning: an unmatched mouse sequence fell
 * through to the printable branch and was typed into the input as garbage, so
 * every click produced `[<0;10;5M` in the prompt.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { FullScreenShell } from '../src/ui/FullScreenShell.js';
import { detectCapabilities, glyphsFor } from '../src/ui/theme.js';
import type { TranscriptLine } from '../src/ui/FullScreenShell.js';

const ESC = '\u001b';
const CTRL_E = '\u0005';

const capabilities = { ...detectCapabilities(), color: false, tty: true, unicode: true, width: 100 };
const settle = () => new Promise((r) => setTimeout(r, 20));

const lines: TranscriptLine[] = [
  { id: 1, text: 'CRITICAL SIR-SEC-001 a finding', kind: 'output' },
  { id: 2, text: 'basis  a live payment credential is bounded by velocity', kind: 'output', detail: true },
  { id: 3, text: 'anchor RBI transaction limits', kind: 'output', detail: true },
  { id: 4, text: 'Findings 1 critical', kind: 'output' },
];

function setup() {
  return render(
    <FullScreenShell
      glyphs={glyphsFor(capabilities)}
      capabilities={capabilities}
      header="sirius"
      lines={lines}
      busy={false}
      history={[]}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      onExit={vi.fn()}
    />,
  );
}

describe('ctrl-e reveals the evidence', () => {
  it('hides detail lines by default', () => {
    const frame = setup().lastFrame() ?? '';
    expect(frame).toContain('SIR-SEC-001');
    expect(frame).not.toContain('RBI transaction limits');
  });

  it('shows them when pressed', async () => {
    const { stdin, lastFrame } = setup();
    stdin.write(CTRL_E);
    await settle();

    expect(lastFrame()).toContain('RBI transaction limits');
  });

  it('hides them again when pressed twice', async () => {
    const { stdin, lastFrame } = setup();
    stdin.write(CTRL_E);
    await settle();
    stdin.write(CTRL_E);
    await settle();

    expect(lastFrame()).not.toContain('RBI transaction limits');
  });

  it('flips the footer hint', async () => {
    const { stdin, lastFrame } = setup();
    expect(lastFrame()).toContain('ctrl-e why');

    stdin.write(CTRL_E);
    await settle();
    expect(lastFrame()).toContain('ctrl-e hide');
  });
});

describe('mouse sequences never become text', () => {
  it.each([
    ['left click', `${ESC}[<0;10;5M`],
    ['left release', `${ESC}[<0;10;5m`],
    ['right click', `${ESC}[<2;10;5M`],
    ['drag', `${ESC}[<32;12;7M`],
  ])('%s is swallowed', async (_name, sequence) => {
    const { stdin, lastFrame } = setup();
    stdin.write(sequence);
    await settle();

    // The prompt stays empty rather than filling with escape gibberish.
    expect(lastFrame()).not.toContain('[<');
    expect(lastFrame()).not.toContain(';10;5');
  });

  it('the wheel still scrolls', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      id: i,
      text: `line-${i}`,
      kind: 'output' as const,
    }));
    const { stdin, lastFrame } = render(
      <FullScreenShell
        glyphs={glyphsFor(capabilities)}
        capabilities={capabilities}
        header="sirius"
        lines={many}
        busy={false}
        history={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    stdin.write(`${ESC}[<64;10;5M`);
    await settle();

    expect(lastFrame()).toContain('below');
  });
});
