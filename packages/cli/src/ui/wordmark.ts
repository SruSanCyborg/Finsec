/**
 * The SIRIUS wordmark.
 *
 * Block-letter capitals in the lineage of Gemini CLI, Warp, and the
 * Daytona launcher — a terminal product's first screen is its logo, and a line
 * of text does not read as one.
 *
 * Rendered as raw ANSI rather than Ink, because the banner prints once, outside
 * any React tree, and mounting a renderer for it would be silly.
 */

/** Each glyph is five rows tall. Widths differ; rows within a glyph do not. */
const GLYPHS: Record<string, string[]> = {
  S: [
    '███████',
    '██     ',
    '███████',
    '     ██',
    '███████',
  ],
  I: [
    '██',
    '██',
    '██',
    '██',
    '██',
  ],
  R: [
    '██████ ',
    '██   ██',
    '██████ ',
    '██   ██',
    '██   ██',
  ],
  U: [
    '██   ██',
    '██   ██',
    '██   ██',
    '██   ██',
    ' █████ ',
  ],
};

const ROWS = 5;
const WORD = 'SIRIUS';

/** Printed width of the block-letter wordmark, glyphs plus single-space kerning. */
export function wordmarkWidth(): number {
  const letters = [...WORD].map((letter) => GLYPHS[letter]?.[0]?.length ?? 0);
  return letters.reduce((sum, w) => sum + w, 0) + (letters.length - 1);
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Three stops, all existing design tokens, swept green → blue → violet.
 *
 * Green leads because it means something here: `--success` is the verifier-pass
 * colour, and this is a tool whose promise is telling you what is safe.
 *
 * An earlier version started at near-white and rendered grey on most terminals.
 * A 24-bit near-white has nowhere to go when quantised down to 256 colours, so
 * five of the six letters came out as mud. Every stop is now fully saturated,
 * which survives the approximation.
 */
const GRADIENT: Rgb[] = [
  { r: 0x04, g: 0xb5, b: 0x75 }, // --success, green
  { r: 0x5a, g: 0xc8, b: 0xfa }, // --low, blue
  { r: 0x7c, g: 0x3a, b: 0xed }, // --accent, violet
];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Samples the multi-stop gradient at `t` in [0, 1]. */
export function gradientAt(t: number): Rgb {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const span = 1 / (GRADIENT.length - 1);
  const index = Math.min(GRADIENT.length - 2, Math.floor(clamped / span));
  const local = (clamped - index * span) / span;

  const from = GRADIENT[index] as Rgb;
  const to = GRADIENT[index + 1] as Rgb;

  return {
    r: lerp(from.r, to.r, local),
    g: lerp(from.g, to.g, local),
    b: lerp(from.b, to.b, local),
  };
}

/**
 * True colour is not universal. This machine reports `xterm-256color` with no
 * COLORTERM, which is exactly the case that turns a 24-bit gradient to mud —
 * so map to the 256-colour cube deliberately rather than hoping the emulator
 * approximates well.
 */
function supportsTrueColor(): boolean {
  if (/truecolor|24bit/i.test(process.env.COLORTERM ?? '')) return true;
  // Terminals that support it without advertising COLORTERM.
  return /iTerm|WezTerm|kitty|alacritty|vscode/i.test(process.env.TERM_PROGRAM ?? '');
}

/** RGB → nearest xterm-256 index, via the 6×6×6 colour cube (16–231). */
export function toAnsi256(r: number, g: number, b: number): number {
  const channel = (v: number) => {
    if (v < 48) return 0;
    if (v < 115) return 1;
    return Math.min(5, Math.round((v - 35) / 40));
  };
  return 16 + 36 * channel(r) + 6 * channel(g) + channel(b);
}

function paint({ r, g, b }: Rgb): string {
  return supportsTrueColor()
    ? `\u001b[38;2;${r};${g};${b}m`
    : `\u001b[38;5;${toAnsi256(r, g, b)}m`;
}

const RESET = '\u001b[0m';
const DIM = '\u001b[38;5;244m';
const BOLD = '\u001b[1m';

export interface WordmarkOptions {
  /** Falls back to a plain single-line title when the terminal cannot draw blocks. */
  unicode: boolean;
  color: boolean;
  width: number;
}

/**
 * Builds the block-letter SIRIUS, gradient applied per column so the sweep is
 * continuous across letter boundaries rather than banded per glyph.
 */
function blockLetters({ color }: WordmarkOptions): string[] {
  const rows: string[] = Array.from({ length: ROWS }, () => '');

  for (const [index, letter] of [...WORD].entries()) {
    const glyph = GLYPHS[letter];
    if (!glyph) continue;
    for (let row = 0; row < ROWS; row += 1) {
      rows[row] += (glyph[row] ?? '') + (index === WORD.length - 1 ? '' : ' ');
    }
  }

  if (!color) return rows;

  const total = Math.max(...rows.map((r) => r.length));

  return rows.map((row) => {
    let out = '';
    let current = '';
    for (let col = 0; col < row.length; col += 1) {
      const char = row[col] ?? ' ';
      if (char === ' ') {
        out += char;
        continue;
      }
      const next = paint(gradientAt(total <= 1 ? 0 : col / (total - 1)));
      if (next !== current) {
        out += next;
        current = next;
      }
      out += char;
    }
    return out + RESET;
  });
}

export interface BannerContent {
  version: string;
  tagline: string;
  /** e.g. `project paykit-api · authenticated` */
  context: string;
  author: string;
}

/**
 * The full launcher banner: wordmark, a rule, the tagline and attribution, then
 * the session context.
 */
export function renderWordmark(content: BannerContent, options: WordmarkOptions): string {
  const { unicode, color, width } = options;
  const pad = '  ';

  // Below the wordmark's own width there is no point drawing it; a compact
  // title reads better than a wrapped logo.
  const compact = !unicode || width < 46;

  // The rule and star pick up the gradient's midpoint so the accent belongs to
  // the same palette rather than sitting outside it.
  const accent = color ? paint(gradientAt(0.5)) : '';
  const tail = color ? paint(gradientAt(1)) : '';
  const dim = color ? DIM : '';
  const bold = color ? BOLD : '';
  const reset = color ? RESET : '';
  const star = unicode ? '✦' : '*';

  const lines: string[] = [''];

  if (compact) {
    lines.push(`${pad}${bold}${accent}${star} SIRIUS${reset}${dim}  v${content.version}${reset}`);
  } else {
    for (const row of blockLetters(options)) lines.push(pad + row);
    lines.push('');
    // The rule spans exactly the wordmark, so the edges line up rather than
    // almost lining up — the difference the eye actually notices.
    const ruleChar = unicode ? '─' : '-';
    const ruleWidth = Math.max(10, Math.min(wordmarkWidth(), width - pad.length - 10));
    lines.push(
      `${pad}${dim}${ruleChar.repeat(ruleWidth)}${reset} ${tail}${star}${reset} ${dim}v${content.version}${reset}`,
    );
  }

  // The tagline and session context are prose and can exceed a narrow terminal;
  // truncate rather than letting them wrap and break the block's alignment.
  const room = Math.max(8, width - pad.length);
  const fit = (text: string) => (text.length <= room ? text : `${text.slice(0, room - 1)}${unicode ? '…' : '.'}`);

  lines.push('');
  lines.push(`${pad}${fit(content.tagline)}`);
  lines.push(`${pad}${dim}powered by ${reset}${bold}${fit(content.author)}${reset}`);
  lines.push('');
  lines.push(`${pad}${dim}${fit(content.context)}${reset}`);
  lines.push('');

  return lines.join('\n');
}
