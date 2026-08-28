/**
 * The full-screen shell.
 *
 * Layout, top to bottom: a one-line header, a scrolling transcript that fills
 * the remaining height, and an input box pinned to the bottom. The input does
 * not move while a command runs, which is the whole point of the alternate
 * screen — output streams into the transcript above it rather than pushing it
 * around.
 *
 * Only the visible slice of the transcript is rendered. A long scan produces
 * hundreds of lines and reconciling all of them every frame is what makes a
 * terminal UI feel slow.
 */

import { Box, Text, useApp, useInput, useStdout } from 'ink';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CommandPalette, filterCommands } from './CommandPalette.js';
import { COLOR } from './theme.js';
import { copyToClipboard } from './clipboard.js';
import type { ShellCommand } from './CommandPalette.js';
import type { Capabilities, Glyphs } from './theme.js';

export interface TranscriptLine {
  id: number;
  text: string;
  kind: 'input' | 'output' | 'error' | 'note';
  /** Evidence, hidden until Ctrl+O. */
  detail?: boolean;
}

export interface FullScreenShellProps {
  glyphs: Glyphs;
  capabilities: Capabilities;
  header: string;
  lines: TranscriptLine[];
  /** True while a command is running; the input is disabled and a spinner shows. */
  busy: boolean;
  busyLabel?: string | undefined;
  /**
   * A question the shell is asking, shown in place of the usual prompt arrow.
   *
   * The shell has to ask some things itself: it spawns children with stdin
   * ignored, so a prompt inside one can never be answered.
   */
  prompt?: string | undefined;
  history: string[];
  onSubmit: (line: string) => void;
  onCancel: () => void;
  onExit: () => void;
}

const INPUT_HEIGHT = 3; // border, text, border
const HEADER_HEIGHT = 1;
const FOOTER_HEIGHT = 1;
const SPINNER_INTERVAL_MS = 80;

/**
 * Lines per wheel notch. Most terminals send exactly one event per physical
 * notch with no multiplier, so scrolling one line a notch feels broken. Three
 * matches vim's default; SIRIUS_SCROLL_SPEED overrides it.
 */
const WHEEL_LINES = (() => {
  const raw = Number.parseFloat(process.env.SIRIUS_SCROLL_SPEED ?? '');
  return Number.isFinite(raw) && raw > 0 ? Math.max(1, Math.round(raw)) : 3;
})();

export function FullScreenShell({
  glyphs,
  capabilities,
  header,
  lines,
  busy,
  busyLabel,
  prompt,
  history,
  onSubmit,
  onCancel,
  onExit,
}: FullScreenShellProps) {
  useApp();
  const { stdout } = useStdout();

  const [value, setValue] = useState('');
  const [selected, setSelected] = useState(0);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  // null means "follow the tail"; a number pins the viewport to that offset.
  const [scrollOffset, setScrollOffset] = useState<number | null>(null);
  const [spinner, setSpinner] = useState(0);
  // Ctrl+E for 'explain'. Some agent CLIs use Ctrl+O for their transcript, but
  // Ctrl+E reads as the verb here and leaves Ctrl+O free.
  const [expanded, setExpanded] = useState(false);
  const lastCtrlC = useRef(0);
  // Click-drag selection, in screen rows. Capturing the mouse takes the
  // terminal's own selection away, so the app has to provide one or the user
  // simply cannot copy anything.
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Held in a ref, not state: press, drag, and release can all arrive in a
  // single stdin chunk, so the release must read what the drag just wrote
  // rather than a value React has not re-rendered yet.
  const dragging = useRef<{ from: number; to: number; moved: boolean } | null>(null);

  // `|| 24`, not `?? 24`: a pty that has not been sized reports 0, which is not
  // nullish, and `height={0}` clips the entire app to nothing. Exactly the bug
  // already fixed for `columns` in theme.ts — same trap, other axis.
  const rows = stdout?.rows || 24;
  const viewportHeight = Math.max(3, rows - HEADER_HEIGHT - INPUT_HEIGHT - FOOTER_HEIGHT);

  const showPalette = value.startsWith('/') && !busy;
  const matches = useMemo(() => (showPalette ? filterCommands(value) : []), [showPalette, value]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setSpinner((s) => (s + 1) % glyphs.spinner.length), SPINNER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [busy, glyphs.spinner.length]);

  const shown = expanded ? lines : lines.filter((l) => !l.detail);
  const maxOffset = Math.max(0, shown.length - viewportHeight);
  const offset = scrollOffset === null ? maxOffset : Math.min(scrollOffset, maxOffset);
  const following = scrollOffset === null;
  const visible = shown.slice(offset, offset + viewportHeight);
  const hiddenBelow = shown.length - (offset + visible.length);

  const scrollBy = useCallback(
    (delta: number) => {
      setScrollOffset((current) => {
        const from = current === null ? maxOffset : current;
        const next = Math.max(0, Math.min(maxOffset, from + delta));
        // Landing back at the bottom re-enables auto-follow, so the user does
        // not have to press an extra key to resume.
        return next >= maxOffset ? null : next;
      });
    },
    [maxOffset],
  );

  useInput((input, key) => {
    // Scrolling stays live while a command runs — watching output go by is
    // exactly when you want to look back at something.
    //
    // The bindings matter more than they look. A MacBook has no PgUp key (it is
    // Fn+↑) and macOS takes Ctrl+↑ for Mission Control, so a Mac user with only
    // those two bindings has no working way to scroll at all. Shift+arrows and
    // Ctrl+U/D always reach us.
    const halfPage = Math.max(1, Math.floor(viewportHeight / 2));

    // Mouse wheel. Ink hands the SGR sequence through as raw input with the
    // escape stripped, so it is matched here rather than as a key: button 64 is
    // wheel-up, 65 wheel-down. Three lines a notch matches most terminals'
    // native feel.
    // A drag emits an event per pixel-row of travel, and the terminal often
    // delivers a whole burst of them in one chunk — so every event in the chunk
    // is processed in order, not just the first. Groups: button, column, row,
    // and M (press or motion) versus m (release).
    const events = [...input.matchAll(/\[<(\d+);(\d+);(\d+)([Mm])/g)];
    if (events.length > 0) {
      // Buttons 64 and 65 are the wheel. Everything else is a click or a drag
      // and is swallowed here — an unmatched sequence used to fall through to
      // the printable branch below and get typed into the prompt as garbage.
      let wheel = 0;
      for (const event of events) {
        const button = Number(event[1]);
        const row = Number(event[3]);
        const isRelease = event[4] === 'm';

        if (button === 64) {
          wheel -= WHEEL_LINES;
          continue;
        }
        if (button === 65) {
          wheel += WHEEL_LINES;
          continue;
        }

        // Screen row to transcript index. Row 1 is the header, so the first
        // transcript line sits on row 2. Clamped, so dragging past the last
        // line selects to the end rather than selecting blank padding.
        const row0 = row - 1 - HEADER_HEIGHT;
        const inTranscript = row0 >= 0 && row0 < viewportHeight;
        const index = Math.min(offset + Math.max(0, row0), Math.max(0, shown.length - 1));

        if (button === 0 && !isRelease && inTranscript) {
          dragging.current = { from: index, to: index, moved: false };
          setSelection({ from: index, to: index });
          setCopied(null);
          continue;
        }

        // 32 is button 0 with the motion flag set: a drag.
        if (button === 32 && dragging.current) {
          const drag = dragging.current;
          if (index !== drag.to) {
            drag.to = index;
            drag.moved = true;
            setSelection({ from: drag.from, to: index });
          }
          continue;
        }

        if (isRelease && dragging.current) {
          const drag = dragging.current;
          dragging.current = null;

          // A click that never moved is a click, not a selection. Copying a
          // line onto the clipboard because someone clicked to focus the
          // window would destroy whatever they had copied a moment earlier.
          if (!drag.moved) {
            setSelection(null);
            continue;
          }

          // Copy on release, the way the terminal's own selection behaves.
          const a = Math.min(drag.from, drag.to);
          const b = Math.max(drag.from, drag.to);
          const text = shown
            .slice(a, b + 1)
            .map((l) => l.text.trimEnd())
            .join('\n');

          if (text.trim()) {
            void copyToClipboard(text).then((ok) => {
              setCopied(
                ok
                  ? `copied ${b - a + 1} line${b === a ? '' : 's'}`
                  : 'no clipboard tool on this system',
              );
            });
          }
        }
      }

      // Wheel notches in the chunk are summed and applied once, so a fast
      // scroll is one state update instead of a dozen.
      if (wheel !== 0) scrollBy(wheel);
      return;
    }

    if (key.pageUp) return scrollBy(-halfPage);
    if (key.pageDown) return scrollBy(halfPage);
    if (key.ctrl && input === 'e') {
      // Toggling changes how many lines exist, so a naive toggle jumps the
      // viewport to the tail and hides the very evidence it just revealed.
      // Anchor on the line currently at the top and keep it there.
      const anchorId = visible[0]?.id;
      const wasFollowing = following;

      setExpanded((wasExpanded) => {
        const next = !wasExpanded;
        const nextShown = next ? lines : lines.filter((l) => !l.detail);
        const nextMax = Math.max(0, nextShown.length - viewportHeight);

        if (next && wasFollowing) {
          // Expanding from the tail is the common case, and anchoring there
          // would show the summary the user has already read. Jump to the first
          // piece of evidence — pressing "why" should answer "why".
          const firstEvidence = nextShown.findIndex((l) => l.detail);
          // Only move if there is somewhere to move to. Pinning an offset on a
          // transcript that already fits leaves the view marked as scrolled-up
          // for no reason, which then hides the hint for getting back.
          setScrollOffset(
            firstEvidence < 0 || nextMax === 0 ? null : Math.max(0, Math.min(firstEvidence - 2, nextMax)),
          );
          return next;
        }

        // Otherwise keep the line under the cursor where it is.
        const index = anchorId === undefined ? -1 : nextShown.findIndex((l) => l.id === anchorId);
        if (index >= 0) setScrollOffset(index >= nextMax ? null : index);
        return next;
      });
      return;
    }
    if (key.ctrl && input === 'u') return scrollBy(-halfPage);
    if (key.ctrl && input === 'd' && value !== '') return scrollBy(halfPage);
    if (key.shift && key.upArrow) return scrollBy(-halfPage);
    if (key.shift && key.downArrow) return scrollBy(halfPage);
    if (key.ctrl && key.upArrow) return setScrollOffset(0);
    if (key.ctrl && key.downArrow) return setScrollOffset(null);
    if (key.ctrl && input === 'g') return setScrollOffset(0);

    // Plain arrows scroll. This is a full-screen viewer, and reading back is
    // what people reach for first — Terminal.app also sends a bare arrow for
    // Shift+Arrow, so binding scroll only to the modified form left no working
    // key at all. History moves to ctrl-p / ctrl-n, the readline convention.
    if (!busy && key.upArrow && !showPalette) return scrollBy(-3);
    if (!busy && key.downArrow && !showPalette) return scrollBy(3);

    // Scrolled up with nothing typed, Escape means "put me back at the bottom"
    // — the thing you actually want after reading history.
    if (key.escape && !following && value === '') return setScrollOffset(null);

    if (key.ctrl && input === 'c') {
      if (busy) {
        onCancel();
        return;
      }
      // Two presses within two seconds to leave, so a stray Ctrl-C does not
      // discard a session.
      const now = Date.now();
      if (now - lastCtrlC.current < 2000) {
        onExit();
        return;
      }
      lastCtrlC.current = now;
      setValue('');
      return;
    }

    if (busy) return;

    if (key.ctrl && input === 'd' && value === '') return onExit();
    if (key.ctrl && input === 'l') return setScrollOffset(null);

    if (key.escape) {
      setValue('');
      setSelected(0);
      return;
    }

    // A terminal may deliver the newline inside a larger chunk — `/scan\n` as a
    // single event, which is also what pasting a line looks like.
    const newlineAt = input.search(/[\r\n]/);
    if (key.return || newlineAt >= 0) {
      const line = (value + (newlineAt >= 0 ? input.slice(0, newlineAt) : '')).trim();
      if (!line) return;

      let toRun = line;
      if (line.startsWith('/') && !line.includes(' ')) {
        const options = filterCommands(line);
        if (options.length > 0) toRun = `/${(options[Math.min(selected, options.length - 1)] as ShellCommand).name}`;
      }

      setValue('');
      setSelected(0);
      setHistoryIndex(null);
      setScrollOffset(null);
      onSubmit(toRun);
      return;
    }

    if (key.tab && showPalette && matches.length > 0) {
      setValue(`/${(matches[Math.min(selected, matches.length - 1)] as ShellCommand).name} `);
      setSelected(0);
      return;
    }

    if (key.upArrow || (key.ctrl && input === 'p')) {
      if (showPalette && matches.length > 0) return setSelected((s) => Math.max(0, s - 1));
      if (history.length > 0) {
        const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(next);
        setValue(history[next] ?? '');
      }
      return;
    }

    if (key.downArrow || (key.ctrl && input === 'n')) {
      if (showPalette && matches.length > 0) return setSelected((s) => Math.min(matches.length - 1, s + 1));
      if (historyIndex !== null) {
        const next = historyIndex + 1;
        if (next >= history.length) {
          setHistoryIndex(null);
          setValue('');
        } else {
          setHistoryIndex(next);
          setValue(history[next] ?? '');
        }
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      setSelected(0);
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const printable = input.replace(/[\r\n]/g, '');
      if (!printable) return;
      setValue((v) => v + printable);
      setSelected(0);
    }
  });

  const muted = capabilities.color ? COLOR.muted : undefined;
  const accent = capabilities.color ? COLOR.accent : undefined;
  const border = capabilities.color ? COLOR.border : undefined;

  const lineColor = (kind: TranscriptLine['kind']) => {
    if (!capabilities.color) return undefined;
    switch (kind) {
      case 'input':
        return COLOR.accent;
      case 'error':
        return '#ff5c5c';
      case 'note':
        return COLOR.muted;
      default:
        return undefined;
    }
  };

  return (
    <Box flexDirection="column" height={rows}>
      <Box>
        <Text color={muted}>{` ${header}`}</Text>
      </Box>

      <Box flexDirection="column" height={viewportHeight} overflow="hidden">
        {visible.map((line, row) => {
          const absolute = offset + row;
          const selected =
            selection !== null &&
            absolute >= Math.min(selection.from, selection.to) &&
            absolute <= Math.max(selection.from, selection.to);
          return (
            <Text
              key={line.id}
              color={selected ? undefined : lineColor(line.kind)}
              inverse={selected}
              wrap="truncate-end"
            >
              {line.kind === 'input' ? ` ${glyphs.arrow} ${line.text}` : ` ${line.text}`}
            </Text>
          );
        })}
        {/* Pad so the input box stays pinned to the bottom on a short transcript. */}
        {Array.from({ length: Math.max(0, viewportHeight - visible.length) }, (_, i) => (
          <Text key={`pad-${i}`}> </Text>
        ))}
      </Box>

      {showPalette && matches.length > 0 ? (
        <Box flexDirection="column">
          <CommandPalette commands={matches} selected={selected} capabilities={capabilities} max={5} />
        </Box>
      ) : null}

      <Box borderStyle={capabilities.unicode ? 'round' : 'classic'} borderColor={border} paddingX={1}>
        {busy ? (
          <>
            <Text color={accent}>{`${glyphs.spinner[spinner] ?? ''} `}</Text>
            <Text color={muted}>{busyLabel ?? 'working'}</Text>
          </>
        ) : (
          <>
            {prompt ? (
              <Text color={accent} bold>{`${prompt} `}</Text>
            ) : (
              <Text color={accent}>{`${glyphs.arrow} `}</Text>
            )}
            <Text>{value}</Text>
            <Text color={muted}>▌</Text>
          </>
        )}
      </Box>

      <Box>
        <Text color={muted}>
          {following
            ? busy
              ? ' ctrl-c cancel · ↑↓ scroll'
              : copied
                ? ` ${copied} · drag to select · ctrl-e ${expanded ? 'hide' : 'why'}`
                : ` / commands · ↑↓ scroll · drag to copy · ctrl-e ${expanded ? 'hide' : 'why'} · ctrl-c ctrl-c exit`
            : ` ${hiddenBelow} below · ↑↓ scroll · ctrl-e ${expanded ? 'hide' : 'why'} · esc bottom`}
        </Text>
      </Box>
    </Box>
  );
}
