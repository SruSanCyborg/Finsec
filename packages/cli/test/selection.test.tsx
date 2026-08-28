/**
 * Click-drag selection.
 *
 * Capturing the mouse is what makes the wheel scroll, but it also takes the
 * terminal's own click-drag-to-copy away — so the app has to provide the
 * selection itself. These tests pin the two halves that must coexist: a drag
 * selects and copies, and the wheel still scrolls.
 *
 * The regression worth naming: the mouse regex originally captured only the
 * button and the M/m flag, never the row, so every drag resolved to the same
 * line. Row extraction is asserted directly below.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const copyToClipboard = vi.fn(() => Promise.resolve(true));
vi.mock('../src/ui/clipboard.js', () => ({
  copyToClipboard: (text: string) => copyToClipboard(text),
  clipboardAvailable: () => true,
}));

const { FullScreenShell } = await import('../src/ui/FullScreenShell.js');
const { detectCapabilities, glyphsFor } = await import('../src/ui/theme.js');
type TranscriptLine = import('../src/ui/FullScreenShell.js').TranscriptLine;

const ESC = '\u001b';
const capabilities = { ...detectCapabilities(), color: false, tty: true, unicode: true, width: 100 };
const settle = () => new Promise((r) => setTimeout(r, 20));

/** SGR mouse report. Row 2 is the first transcript line — row 1 is the header. */
const press = (row: number) => `${ESC}[<0;5;${row}M`;
const drag = (row: number) => `${ESC}[<32;5;${row}M`;
const release = (row: number) => `${ESC}[<0;5;${row}m`;

const lines: TranscriptLine[] = [
  { id: 1, text: 'alpha-line', kind: 'output' },
  { id: 2, text: 'bravo-line', kind: 'output' },
  { id: 3, text: 'charlie-line', kind: 'output' },
  { id: 4, text: 'delta-line', kind: 'output' },
];

function setup(transcript: TranscriptLine[] = lines) {
  return render(
    <FullScreenShell
      glyphs={glyphsFor(capabilities)}
      capabilities={capabilities}
      header="sirius"
      lines={transcript}
      busy={false}
      history={[]}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      onExit={vi.fn()}
    />,
  );
}

beforeEach(() => copyToClipboard.mockClear());

describe('dragging selects and copies', () => {
  it('copies the dragged range on release', async () => {
    const { stdin, lastFrame } = setup();

    stdin.write(press(2));
    stdin.write(drag(4));
    stdin.write(release(4));
    await settle();

    expect(copyToClipboard).toHaveBeenCalledWith('alpha-line\nbravo-line\ncharlie-line');
    expect(lastFrame()).toContain('copied 3 lines');
  });

  it('reads the row from the sequence rather than assuming one', async () => {
    const { stdin } = setup();

    // A drag confined to a single row must copy that row alone. This failed
    // while the regex discarded the row coordinate.
    stdin.write(press(3));
    stdin.write(drag(3));
    stdin.write(release(3));
    await settle();

    // No movement between rows, so nothing is copied — but crucially the press
    // resolved to row 3, not row 2.
    stdin.write(press(3));
    stdin.write(drag(4));
    stdin.write(release(4));
    await settle();

    expect(copyToClipboard).toHaveBeenLastCalledWith('bravo-line\ncharlie-line');
  });

  it('handles a whole drag arriving as one chunk', async () => {
    const { stdin } = setup();

    // Terminals batch motion events; the handler must process every event in
    // the chunk, not only the first.
    stdin.write(`${press(2)}${drag(3)}${drag(4)}${drag(5)}${release(5)}`);
    await settle();

    expect(copyToClipboard).toHaveBeenCalledWith('alpha-line\nbravo-line\ncharlie-line\ndelta-line');
  });

  it('drags upward as well as downward', async () => {
    const { stdin } = setup();

    stdin.write(`${press(4)}${drag(2)}${release(2)}`);
    await settle();

    expect(copyToClipboard).toHaveBeenCalledWith('alpha-line\nbravo-line\ncharlie-line');
  });

  it('clamps a drag past the last line', async () => {
    const { stdin } = setup();

    stdin.write(`${press(2)}${drag(20)}${release(20)}`);
    await settle();

    // Four lines of transcript, so the blank padding below them is not copied.
    expect(copyToClipboard).toHaveBeenCalledWith('alpha-line\nbravo-line\ncharlie-line\ndelta-line');
  });

  it('highlights the selection while dragging', async () => {
    const { stdin, lastFrame } = setup();

    stdin.write(`${press(2)}${drag(3)}`);
    await settle();

    // Inverse video is the highlight; without color the frame still carries it.
    expect(lastFrame()).toContain('alpha-line');
  });
});

describe('a click is not a selection', () => {
  it('does not copy when the mouse never moved', async () => {
    const { stdin } = setup();

    stdin.write(press(3));
    stdin.write(release(3));
    await settle();

    // Clicking to focus the window must not overwrite the user's clipboard.
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('still never types the sequence into the prompt', async () => {
    const { stdin, lastFrame } = setup();

    stdin.write(`${press(3)}${drag(4)}${release(4)}`);
    await settle();

    expect(lastFrame()).not.toContain('[<');
    expect(lastFrame()).not.toContain(';5;');
  });
});

describe('the wheel still scrolls', () => {
  const many: TranscriptLine[] = Array.from({ length: 200 }, (_, i) => ({
    id: i,
    text: `line-${i}`,
    kind: 'output' as const,
  }));

  it('scrolls up on a wheel-up report', async () => {
    const { stdin, lastFrame } = setup(many);

    stdin.write(`${ESC}[<64;5;10M`);
    await settle();

    expect(lastFrame()).toContain('below');
  });

  it('sums a burst of notches into one scroll', async () => {
    const up = `${ESC}[<64;5;10M`;

    const one = setup(many);
    one.stdin.write(up);
    await settle();

    const four = setup(many);
    four.stdin.write(`${up}${up}${up}${up}`);
    await settle();

    // Four notches must travel strictly further than one. Applying only the
    // first event of a batched chunk would make these two frames identical.
    const topLine = (frame: string) => Number(/line-(\d+)/.exec(frame)?.[1] ?? -1);
    expect(topLine(four.lastFrame() ?? '')).toBeLessThan(topLine(one.lastFrame() ?? ''));
  });

  it('does not start a selection', async () => {
    const { stdin } = setup(many);

    stdin.write(`${ESC}[<64;5;10M`);
    stdin.write(`${ESC}[<65;5;10M`);
    await settle();

    expect(copyToClipboard).not.toHaveBeenCalled();
  });
});
