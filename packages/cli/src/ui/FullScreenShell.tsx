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
  history: string[];
  onSubmit: (line: string) => void;
  onCancel: () => void;
  onExit: () => void;
}

const INPUT_HEIGHT = 3; // border, text, border
const HEADER_HEIGHT = 1;
const FOOTER_HEIGHT = 1;
const SPINNER_INTERVAL_MS = 80;

export function FullScreenShell({
  glyphs,
  capabilities,
  header,
  lines,
  busy,
  busyLabel,
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
  // Ctrl+O, the same gesture other agent CLIs use to open a transcript.
  const [expanded, setExpanded] = useState(false);
  const lastCtrlC = useRef(0);

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

    if (key.pageUp) return scrollBy(-halfPage);
    if (key.pageDown) return scrollBy(halfPage);
    if (key.ctrl && input === 'o') {
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
          setScrollOffset(firstEvidence < 0 ? null : Math.max(0, Math.min(firstEvidence - 2, nextMax)));
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
        {visible.map((line) => (
          <Text key={line.id} color={lineColor(line.kind)} wrap="truncate-end">
            {line.kind === 'input' ? ` ${glyphs.arrow} ${line.text}` : ` ${line.text}`}
          </Text>
        ))}
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
            <Text color={accent}>{`${glyphs.arrow} `}</Text>
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
              : ` / commands · ↑↓ scroll · ctrl-p history · ctrl-o ${expanded ? 'hide' : 'why'} · ctrl-c ctrl-c exit`
            : ` ${hiddenBelow} below · ↑↓ scroll · ctrl-g top · esc back to bottom`}
        </Text>
      </Box>
    </Box>
  );
}
