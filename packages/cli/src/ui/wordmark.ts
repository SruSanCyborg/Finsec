/**
 * The SIRIUS wordmark.
 *
 * Block-letter capitals in the lineage of Gemini CLI, Warp, and the
 * Daytona launcher — a terminal product's logo is the first thing a judge sees,
 * and a plain string does not read as a product.
 *
 * The identity comes from the name: Sirius is the brightest star in the night
 * sky, and a blue-white one. So the wordmark runs a blue-white gradient rather
 * than the violet used elsewhere in the design tokens, and carries a star
 * accent. That is the part that makes it ours instead of a generic ASCII banner.
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

/** Sirius A is a blue-white star; the gradient runs from its white core outward. */
const GRADIENT_START = { r: 0xe8, g: 0xf4, b: 0xff }; // near-white blue
const GRADIENT_END = { r: 0x5a, g: 0xc8, b: 0xfa }; // --low, the token blue

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function truecolor(r: number, g: number, b: number): string {
  return `\u001b[38;2;${r};${g};${b}m`;
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
 * Builds the block-letter SIRIUS, gradient applied horizontally so the colour
 * sweeps across the word rather than banding per letter.
 */
function blockLetters({ color }: WordmarkOptions): string[] {
  const word = WORD;
  const rows: string[] = Array.from({ length: ROWS }, () => '');

  for (const [index, letter] of [...word].entries()) {
    const glyph = GLYPHS[letter];
    if (!glyph) continue;
    for (let row = 0; row < ROWS; row += 1) {
      rows[row] += (glyph[row] ?? '') + (index === word.length - 1 ? '' : ' ');
    }
  }

  const total = Math.max(...rows.map((r) => r.length));
  if (!color) return rows;

  // Colour per column so the sweep is continuous across letter boundaries.
  return rows.map((row) => {
    let out = '';
    let currentColor = '';
    for (let col = 0; col < row.length; col += 1) {
      const char = row[col] ?? ' ';
      if (char === ' ') {
        out += char;
        continue;
      }
      const t = total <= 1 ? 0 : col / (total - 1);
      const next = truecolor(
        lerp(GRADIENT_START.r, GRADIENT_END.r, t),
        lerp(GRADIENT_START.g, GRADIENT_END.g, t),
        lerp(GRADIENT_START.b, GRADIENT_END.b, t),
      );
      if (next !== currentColor) {
        out += next;
        currentColor = next;
      }
      out += char;
    }
    return out + RESET;
  });
}

export interface BannerContent {
  version: string;
  tagline: string;
  /** e.g. `project: paykit-api · authenticated` */
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

  const accent = color ? truecolor(GRADIENT_END.r, GRADIENT_END.g, GRADIENT_END.b) : '';
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
    // The rule spans exactly the wordmark, so the two edges line up rather than
    // almost lining up — which is the difference the eye actually notices.
    const ruleChar = unicode ? '─' : '-';
    const ruleWidth = Math.max(10, Math.min(wordmarkWidth(), width - pad.length - 10));
    lines.push(
      `${pad}${dim}${ruleChar.repeat(ruleWidth)}${reset} ${accent}${star}${reset} ${dim}v${content.version}${reset}`,
    );
  }

  // The tagline and the session context are prose and can be longer than a
  // narrow terminal; truncate rather than letting them wrap and break the
  // block's alignment.
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
