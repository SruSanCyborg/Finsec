/**
 * The progress row.
 *
 *   ⠹  Scanning 128 files ····································  86%   ▐████████▏
 *
 * This is the only part of the scan view that re-renders continuously, which is
 * deliberate: findings go into Ink's <Static> region so the whole tree is not
 * reconciled 128 times during a demo.
 */

import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';

import { COLOR, meter } from './theme.js';
import type { Capabilities, Glyphs } from './theme.js';

export interface ScanProgressProps {
  scanned: number;
  total: number;
  glyphs: Glyphs;
  capabilities: Capabilities;
  /** Set once the scan finishes so the spinner stops advancing. */
  done?: boolean;
}

const SPINNER_INTERVAL_MS = 80;
const BAR_WIDTH = 8;

export function ScanProgress({ scanned, total, glyphs, capabilities, done = false }: ScanProgressProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (done || !capabilities.tty) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % glyphs.spinner.length), SPINNER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [done, capabilities.tty, glyphs.spinner.length]);

  const fraction = total > 0 ? scanned / total : 0;
  const percent = `${Math.floor(fraction * 100)}%`.padStart(4);
  const spinner = done ? glyphs.check : (glyphs.spinner[frame] ?? glyphs.spinner[0] ?? '');
  const label = `Scanning ${total || '…'} files `;
  const bar = meter(fraction, BAR_WIDTH, glyphs);

  // Size the leader from the segments that actually get printed, rather than a
  // hand-tallied constant that drifts the moment any of them changes. One column
  // is held back so the line never wraps and leaves an orphan dot behind.
  const prefix = `  ${spinner}  ${label}`;
  const suffix = `  ${percent}   ${bar}`;
  const room = capabilities.width - 1 - prefix.length - suffix.length;
  const leader = glyphs.dot.repeat(Math.max(0, Math.min(44, room)));

  return (
    <Box marginBottom={1}>
      <Text color={capabilities.color ? COLOR.accent : undefined}>{`  ${spinner}  `}</Text>
      <Text>{label}</Text>
      <Text color={capabilities.color ? COLOR.border : undefined}>{leader}</Text>
      <Text>{`  ${percent}   `}</Text>
      <Text color={capabilities.color ? COLOR.accent : undefined}>{bar}</Text>
    </Box>
  );
}
