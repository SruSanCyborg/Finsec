/**
 * Terminal layout primitives.
 *
 * The string renderers grew two habits worth undoing. Every table was assembled
 * from `padEnd`/`padStart` at the call site — sixty-four of them in the revenue
 * renderer alone — and none of them knew the terminal's width, so the
 * comparison table ran to 176 columns. On anything narrower it wraps, and a
 * wrapped table is not a table: the demo machine's terminal is the one place
 * these numbers have to be legible.
 *
 * Two rules the call sites could not enforce for themselves:
 *
 * **Width is what you can see, not what `String.length` says.** A cell that has
 * already been coloured carries escape bytes occupying no columns, so padding
 * it pads the escapes and the column drifts. Nothing does that today — `rupee`,
 * `bar` and `glyph` all return plain text, which is the only reason the tables
 * line up — but it is one commit away at all times, and it fails invisibly in
 * colour while looking perfect in a pipe, which is where every test looks.
 *
 * **A row that does not fit has to lose something on purpose.** Given a width,
 * the column the caller nominated gives way and the numbers never do.
 *
 * Deliberately not a component framework. These return strings, because their
 * callers are string renderers feeding `process.stdout.write`; the Ink
 * components beside them are a separate working thing and are left alone.
 */

/** The escape sequences a palette introduces. Written as an escape, not a byte. */
const ANSI = /\u001B\[[0-9;]*m/g;

/**
 * OSC 8 hyperlinks, which occupy no columns either.
 *
 * `stripAnsi` knew about colour and nothing else, so a cell carrying a link
 * measured the length of its URL — seventy columns for a six-column filename —
 * and every table containing one would have been laid out against a number
 * that was wrong by the length of a path. Caught by a test asserting the one
 * property the whole layout rests on: what a string costs is what you can see.
 */
const OSC8 = /\u001B\]8;;.*?\u001B\\/g;
const ANSI_AT_START = /^\u001B\[[0-9;]*m/;
const RESET = '\u001B[0m';

export function stripAnsi(text: string): string {
  return text.replace(OSC8, '').replace(ANSI, '');
}

/** Columns a string actually occupies, ignoring colour. */
export function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

export type Align = 'left' | 'right';

/** Pads to `width` columns, counting what is visible rather than what is stored. */
export function padVisible(text: string, width: number, align: Align = 'left'): string {
  const gap = Math.max(0, width - visibleWidth(text));
  return align === 'right' ? ' '.repeat(gap) + text : text + ' '.repeat(gap);
}

/**
 * Shortens to `width` columns, keeping colour intact.
 *
 * Walks the string rather than slicing it, so an escape sequence is never cut
 * in half — half a colour code does not render as a shorter string, it renders
 * as rubbish for the rest of the line.
 */
export function truncate(text: string, width: number, ellipsis = '…'): string {
  if (visibleWidth(text) <= width) return text;
  if (width <= 0) return '';

  const keep = Math.max(0, width - ellipsis.length);
  let out = '';
  let seen = 0;
  let coloured = false;

  for (let i = 0; i < text.length; ) {
    const escape = ANSI_AT_START.exec(text.slice(i));
    if (escape) {
      out += escape[0];
      coloured = true;
      i += escape[0].length;
      continue;
    }
    if (seen >= keep) break;
    out += text[i];
    seen += 1;
    i += 1;
  }

  // Any colour opened before the cut is still open; close it rather than let it
  // bleed down the rest of the line.
  return `${out}${ellipsis}${coloured ? RESET : ''}`;
}

export interface Column {
  header: string;
  align?: Align;
  /** Gives way first when the row does not fit. Nominate exactly one. */
  flex?: boolean;
  /** Never shrink below this many columns. */
  min?: number;
}

export interface TableOptions {
  /** Leading spaces on every line. */
  indent?: number;
  /** Spaces between columns. */
  gap?: number;
  /** Terminal width to fit inside. */
  width?: number;
  /** Force the header row on or off; defaults to on when any header has text. */
  showHeader?: boolean;
  /** Wraps each header cell, usually to dim it. */
  header?: (text: string) => string;
}

/**
 * Lays rows out in columns that fit.
 *
 * Widths come from the content. When the total exceeds the terminal the
 * flexible column is cut back to its floor and then truncated, so the money and
 * the verdicts stay whole and the prose is what gives way — the right trade
 * every time.
 */
export function table(
  columns: readonly Column[],
  rows: readonly string[][],
  options: TableOptions = {},
): string[] {
  const indent = options.indent ?? 2;
  const gap = options.gap ?? 2;
  const limit = options.width ?? 80;

  const widths = columns.map((column, index) =>
    Math.max(visibleWidth(column.header), ...rows.map((row) => visibleWidth(row[index] ?? ''))),
  );

  const chrome = indent + gap * Math.max(0, columns.length - 1);
  const total = (): number => widths.reduce((sum, width) => sum + width, 0) + chrome;

  const flexible = columns.findIndex((column) => column.flex);
  if (flexible >= 0 && total() > limit) {
    const over = total() - limit;
    const floor = columns[flexible]?.min ?? 12;
    widths[flexible] = Math.max(floor, (widths[flexible] ?? 0) - over);
  }

  const line = (cells: readonly string[]): string =>
    ' '.repeat(indent) +
    cells
      .map((cell, index) => {
        const width = widths[index] ?? 0;
        return padVisible(truncate(cell, width), width, columns[index]?.align ?? 'left');
      })
      .join(' '.repeat(gap))
      .trimEnd();

  const out: string[] = [];
  const wantsHeader = options.showHeader ?? columns.some((column) => column.header.length > 0);
  if (wantsHeader) {
    const paint = options.header ?? ((text: string) => text);
    out.push(line(columns.map((column) => paint(column.header))));
  }
  for (const row of rows) out.push(line(row));
  return out;
}

/**
 * A note belonging to the row above it, wrapped and indented under it.
 *
 * These were appended to the row itself, which is how a comparison table
 * reached 176 columns: the numbers a reader came for, pushed off the right edge
 * by the sentence explaining them.
 */
export function note(text: string, options: { indent?: number; width?: number } = {}): string[] {
  const indent = options.indent ?? 4;
  const width = Math.max(20, (options.width ?? 80) - indent);
  const words = stripAnsi(text).split(/\s+/).filter(Boolean);

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    // A word longer than the line is not a wrapping problem, it is a breaking
    // one. An absolute path under a temp directory is a hundred and fifty
    // characters with no spaces in it, and a wrapper that only breaks at spaces
    // emits it whole and overflows by exactly as much as the path is long.
    if (word.length > width) {
      if (current) {
        lines.push(' '.repeat(indent) + current);
        current = '';
      }
      for (let i = 0; i < word.length; i += width) {
        lines.push(' '.repeat(indent) + word.slice(i, i + width));
      }
      continue;
    }

    if (current && current.length + 1 + word.length > width) {
      lines.push(' '.repeat(indent) + current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }

  if (current) lines.push(' '.repeat(indent) + current);
  return lines;
}

/** A labelled divider that fills the width. */
export function rule(width: number, label?: string, glyph = '─'): string {
  if (!label) return glyph.repeat(Math.max(0, width));
  const text = ` ${label} `;
  const fill = Math.max(0, width - text.length - 2);
  return `${glyph.repeat(2)}${text}${glyph.repeat(fill)}`;
}

/**
 * A location the terminal can open, via OSC 8.
 *
 * The sequence is ESC ]8;; <url> ST <text> ESC ]8;; ST — the terminal renders
 * `text` and treats it as a link. Supported by iTerm2, WezTerm, kitty, Ghostty,
 * Windows Terminal and VS Code's terminal. A terminal that does not understand
 * it may print the payload as literal text, so the caller decides from
 * `capabilities.hyperlinks` rather than this function guessing — a location
 * that is merely not clickable beats a line of escape gibberish.
 *
 * The scheme is configurable because "open this file at this line" has no
 * standard. `file://` opens the file and usually forgets the line; editors each
 * have their own, and `SIRIUS_LINK_SCHEME=vscode` gives
 * `vscode://file/<abs>:<line>`, which does jump to it.
 */
export function hyperlink(text: string, path: string, line?: number): string {
  const scheme = process.env.SIRIUS_LINK_SCHEME ?? 'file';
  const target =
    scheme === 'file'
      ? `file://${path}${line ? `#L${line}` : ''}`
      : `${scheme}://file/${path}${line ? `:${line}` : ''}`;

  const open = `\u001B]8;;${target}\u001B\\`;
  const close = '\u001B]8;;\u001B\\';
  return `${open}${text}${close}`;
}

/**
 * Everything `SIRIUS_ASCII=1` promises, and did not deliver.
 *
 * The flag is documented as the projector safety net: a presentation machine
 * whose font lacks `₹`, box drawing or a braille spinner still has to produce a
 * readable screen. The glyph table handled the drawing characters, but prose
 * punctuation went straight through — a scan under `SIRIUS_ASCII=1` still
 * emitted `—`, `…`, `·`, `§` and `≥`.
 *
 * Substitutions are chosen so a line keeps its meaning at the same width or
 * shorter, never longer: a replacement that grows the string would push a
 * carefully fitted table over the edge on exactly the narrow terminal that
 * asked for ASCII in the first place. `§` becomes `S.` rather than `Sec.` for
 * that reason.
 */
const ASCII_SUBSTITUTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2014\u2013]/g, '--'], // em and en dash
  [/\u2026/g, '...'],
  [/\u00b7/g, '-'],
  [/\u00a7/g, 'S.'],
  [/\u2265/g, '>='],
  [/\u2264/g, '<='],
  [/\u2192/g, '->'],
  [/[\u2018\u2019]/g, "'"],
  [/[\u201c\u201d]/g, '"'],
  [/\u20b9/g, 'Rs.'],
];

/** Rewrites a line into ASCII. Identity unless the caller asks for it. */
export function toAscii(text: string): string {
  let out = text;
  for (const [pattern, replacement] of ASCII_SUBSTITUTIONS) out = out.replace(pattern, replacement);
  return out;
}

/** Whether the environment asked for ASCII output. */
export function asciiRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SIRIUS_ASCII === '1' || env.SIRIUS_ASCII === 'true';
}

/**
 * `1 finding`, `6 findings` — never `6 finding(s)`.
 *
 * The `(s)` spelling was in a dozen places, and it is the one piece of writing
 * in the output that admits nobody looked at the sentence. The prose everywhere
 * else in this tool is careful; this undercut it for the sake of a branch.
 *
 * Irregular plurals are passed explicitly rather than guessed, because guessing
 * gets `entrys` and there is no rule that would not.
 */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
