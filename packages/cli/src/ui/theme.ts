/**
 * Terminal capabilities, colors, and glyphs.
 *
 * Three things vary at runtime and every renderer has to respect all three:
 * whether color is allowed, whether we are attached to a TTY, and whether the
 * terminal can draw the box/braille/₹ characters the mockups use.
 *
 * The ASCII fallback is not hypothetical politeness — the demo runs on an
 * unknown presentation machine, and a row of mojibake during the 60 seconds
 * that matter most is a real risk (FINSEC_ASCII=1 forces it).
 */

import type { Severity, Validity } from '../domain.js';

export interface Capabilities {
  color: boolean;
  tty: boolean;
  unicode: boolean;
  width: number;
}

export interface CapabilityOptions {
  noColor?: boolean;
  /** `--json` and `--sarif` force plain output regardless of the terminal. */
  machineMode?: boolean;
}

export function detectCapabilities(options: CapabilityOptions = {}): Capabilities {
  const env = process.env;
  const tty = Boolean(process.stdout.isTTY) && !options.machineMode;

  // NO_COLOR is honored whenever it is set to anything, per no-color.org.
  const noColorEnv = env.NO_COLOR !== undefined && env.NO_COLOR !== '';
  const color = !options.noColor && !noColorEnv && !options.machineMode && tty;

  const asciiForced = env.FINSEC_ASCII === '1' || env.FINSEC_ASCII === 'true';
  const utf8 = /UTF-?8/i.test(env.LC_ALL ?? env.LC_CTYPE ?? env.LANG ?? '');
  // Windows Terminal and modern macOS/Linux terminals are fine; a bare TERM=dumb
  // or a non-UTF-8 locale is not.
  const unicode = !asciiForced && tty && env.TERM !== 'dumb' && (utf8 || process.platform === 'darwin');

  return {
    color,
    tty,
    unicode,
    // `|| 80`, not `?? 80`: a pty that has not been sized yet reports 0, which
    // is not nullish and would otherwise collapse every layout to its narrowest
    // form. This showed up under `script`, and would show up in CI too.
    width: process.stdout.columns || 80,
  };
}

/**
 * Severity colors, from the shared design tokens in docs/system-overview.md.
 * `info` has no token in the PRD; decisions.md D-011 assigns it the muted grey.
 */
export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ff5c5c',
  high: '#ff9f43',
  medium: '#ffbc33',
  low: '#5ac8fa',
  info: '#8a8f98',
};

export const COLOR = {
  success: '#04B575',
  accent: '#7C3AED',
  muted: '#8a8f98',
  border: '#23262d',
  text: '#f2f3f5',
} as const;

/** Glyphs shown beside a finding header. */
const SEVERITY_GLYPH_UNICODE: Record<Severity, string> = {
  critical: '✗',
  high: '▲',
  medium: '■',
  low: '○',
  info: '·',
};

const SEVERITY_GLYPH_ASCII: Record<Severity, string> = {
  critical: 'x',
  high: '!',
  medium: '#',
  low: 'o',
  info: '.',
};

/** Glyphs used in the summary counter row, which differ from the headers. */
const COUNTER_GLYPH_UNICODE: Record<Severity, string> = {
  critical: '●',
  high: '▲',
  medium: '■',
  low: '○',
  info: '·',
};

export interface Glyphs {
  severity: Record<Severity, string>;
  counter: Record<Severity, string>;
  boxTopLeft: string;
  boxTopRight: string;
  boxBottomLeft: string;
  boxBottomRight: string;
  horizontal: string;
  vertical: string;
  elbow: string;
  /** Leads into a fix hint: `↳ fix: env_lookup` */
  arrow: string;
  /** Points at a result: `verifier → ✓ PASS`, `gate: … → BLOCKED` */
  rightArrow: string;
  check: string;
  cross: string;
  warning: string;
  rupee: string;
  barFull: string;
  barEmpty: string;
  barLeftCap: string;
  barRightCap: string;
  dot: string;
  separator: string;
  spinner: string[];
}

const UNICODE_GLYPHS: Glyphs = {
  severity: SEVERITY_GLYPH_UNICODE,
  counter: COUNTER_GLYPH_UNICODE,
  boxTopLeft: '╭',
  boxTopRight: '╮',
  boxBottomLeft: '╰',
  boxBottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  elbow: '╰──',
  arrow: '↳',
  rightArrow: '→',
  check: '✓',
  cross: '✗',
  warning: '⚠',
  rupee: '₹',
  barFull: '█',
  barEmpty: ' ',
  barLeftCap: '▐',
  barRightCap: '▏',
  dot: '·',
  separator: ' · ',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

const ASCII_GLYPHS: Glyphs = {
  severity: SEVERITY_GLYPH_ASCII,
  counter: SEVERITY_GLYPH_ASCII,
  boxTopLeft: '+',
  boxTopRight: '+',
  boxBottomLeft: '+',
  boxBottomRight: '+',
  horizontal: '-',
  vertical: '|',
  elbow: "'--",
  arrow: '->',
  rightArrow: '->',
  // A word here would read as "PASS PASS" wherever the verdict already says it.
  check: '+',
  cross: 'x',
  warning: '!',
  // Rs. rather than a dropped symbol: the figure must stay unmistakably rupees.
  rupee: 'Rs.',
  barFull: '#',
  barEmpty: '.',
  barLeftCap: '[',
  barRightCap: ']',
  dot: '.',
  separator: ' | ',
  spinner: ['|', '/', '-', '\\'],
};

export function glyphsFor(capabilities: Capabilities): Glyphs {
  return capabilities.unicode ? UNICODE_GLYPHS : ASCII_GLYPHS;
}

/** Uppercase, padded so rule ids line up across findings of different severity. */
export function severityLabel(severity: Severity): string {
  return severity.toUpperCase().padEnd(8);
}

/** `verified_live` → `VERIFIED LIVE`. Null for non-secret findings. */
export function validityLabel(validity: Validity | null | undefined): string | undefined {
  switch (validity) {
    case 'verified_live':
      return 'VERIFIED LIVE';
    case 'inactive':
      return 'inactive';
    default:
      return undefined;
  }
}

/**
 * A proportional bar: `▐████████▏`. Used for both scan progress and the
 * compliance score meter.
 */
export function meter(fraction: number, width: number, glyphs: Glyphs): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const filled = Math.round(clamped * width);
  return (
    glyphs.barLeftCap +
    glyphs.barFull.repeat(filled) +
    glyphs.barEmpty.repeat(Math.max(0, width - filled)) +
    glyphs.barRightCap
  );
}
