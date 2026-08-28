/**
 * A PDF, written by hand.
 *
 * `report --format pdf` answered "PDF reports need the hosted renderer", which
 * was the last thing in the CLI that needed a backend. It does not need one. A
 * PDF is a text format with a byte-offset table at the end, and the fourteen
 * base fonts are guaranteed present in every conforming reader — so a
 * text-and-rules document needs no font embedding, no rasteriser and no
 * dependency. Roughly two hundred lines, against a hosted service and a network
 * round trip for a document the scan already has every value of.
 *
 * Deliberately narrow: text, horizontal rules, and page breaks. No images, no
 * embedded fonts, no compression. That is the whole of what a compliance report
 * is, and each thing left out is a thing that cannot be subtly wrong.
 *
 * One real constraint, stated rather than worked around: the base fonts use
 * WinAnsiEncoding, which has no ₹. Rupees are written `Rs.` in the PDF and keep
 * Indian digit grouping, so `Rs.42,00,000` — the same number the terminal shows
 * as `₹42,00,000`. Substituting a similar-looking glyph would be worse: a
 * compliance document should not quietly change a currency symbol.
 */

export type Align = 'left' | 'right';

export interface TextRun {
  text: string;
  /** Points. The document's scale is set by the caller. */
  size?: number;
  bold?: boolean;
  /** 0 is black, 1 is white. Greys read better than colour in print. */
  grey?: number;
  align?: Align;
  /** Extra space above this line, in points. */
  spaceBefore?: number;
}

export interface PdfOptions {
  title: string;
  /** Points. A4 is 595 × 842; US Letter is 612 × 792. */
  width?: number;
  height?: number;
  margin?: number;
}

/** A horizontal rule rather than a line of text. */
export const RULE = Symbol('rule');
export type Block = TextRun | typeof RULE;

const WIDTHS_CACHE = new Map<string, number>();

/**
 * Helvetica advance widths, in 1/1000 em, for the characters a report uses.
 *
 * Only needed for right-alignment and for wrapping, and only for the printable
 * ASCII range — anything outside it is measured as an average. Getting this
 * roughly right is enough to align a column of numbers; getting it exactly
 * right would mean shipping the AFM tables for fourteen fonts.
 */
function charWidth(character: string, bold: boolean): number {
  const key = `${character}${bold ? 'b' : ''}`;
  const cached = WIDTHS_CACHE.get(key);
  if (cached !== undefined) return cached;

  const code = character.charCodeAt(0);
  let width = 556;

  if (character === ' ') width = 278;
  else if (/[.,:;'`|!ilj]/.test(character)) width = 278;
  else if (/[0-9]/.test(character)) width = 556;
  else if (/[A-Z]/.test(character)) width = code === 73 ? 278 : 722;
  else if (/[a-z]/.test(character)) width = 556;
  else if (/[()[\]{}/\\-]/.test(character)) width = 333;

  if (bold) width = Math.round(width * 1.06);
  WIDTHS_CACHE.set(key, width);
  return width;
}

/** Width of a string at a given size, in points. */
export function measure(text: string, size: number, bold = false): number {
  let total = 0;
  for (const character of text) total += charWidth(character, bold);
  return (total / 1000) * size;
}

/** Breaks a string to fit a width, at spaces where it can. */
export function wrapToWidth(text: string, width: number, size: number, bold = false): string[] {
  // A line that already fits is returned untouched. Splitting on whitespace and
  // rejoining with single spaces silently rewrote text the wrapper never needed
  // to touch — `Compliance score  60/100` came out with one space, which is a
  // wrapper editing a document rather than laying it out.
  if (measure(text, size, bold) <= width) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, size, bold) > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Escapes a string for a PDF literal and drops what the encoding cannot carry.
 *
 * `(`, `)` and `\` are structural inside a literal string — an unescaped one
 * ends the string early and corrupts every object after it. Characters outside
 * WinAnsi are replaced rather than emitted: a byte the reader cannot map is a
 * glyph nobody can predict, and in a signed compliance document an unpredictable
 * glyph is worse than a missing one.
 */
function literal(text: string): string {
  let out = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (character === '(' || character === ')' || character === '\\') out += `\\${character}`;
    else if (code === 0x20b9) out += 'Rs.'; // ₹ — WinAnsi has no rupee sign
    else if (code === 0x2014 || code === 0x2013) out += '-';
    else if (code === 0x2018 || code === 0x2019) out += "'";
    else if (code === 0x201c || code === 0x201d) out += '"';
    else if (code === 0x00b7 || code === 0x2022) out += '-';
    else if (code < 32) out += ' ';
    else if (code > 255) out += '?';
    else out += character;
  }
  return out;
}

/**
 * Lays blocks onto pages and serialises the file.
 *
 * The xref table is the part that has to be exactly right: it records the byte
 * offset of every object, and a reader uses it rather than scanning. Offsets
 * are therefore taken while building the body, not computed afterwards.
 */
export function renderPdf(blocks: readonly Block[], options: PdfOptions): Buffer {
  const width = options.width ?? 595;
  const height = options.height ?? 842;
  const margin = options.margin ?? 56;
  const usable = width - margin * 2;

  // ---- lay out into pages
  const pages: string[][] = [];
  let stream: string[] = [];
  let y = height - margin;

  const newPage = (): void => {
    if (stream.length > 0) pages.push(stream);
    stream = [];
    y = height - margin;
  };

  for (const block of blocks) {
    if (block === RULE) {
      if (y < margin + 24) newPage();
      y -= 8;
      stream.push(`0.85 g ${margin} ${y.toFixed(1)} ${usable} 0.6 re f`);
      y -= 12;
      continue;
    }

    const size = block.size ?? 10;
    const bold = block.bold ?? false;
    const leading = size * 1.45;
    y -= block.spaceBefore ?? 0;

    for (const line of wrapToWidth(block.text, usable, size, bold)) {
      if (y < margin + leading) newPage();
      const x =
        block.align === 'right' ? margin + usable - measure(line, size, bold) : margin;
      const grey = block.grey ?? 0;

      stream.push(
        `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${grey.toFixed(2)} g ` +
          `1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${literal(line)}) Tj ET`,
      );
      y -= leading;
    }
  }
  if (stream.length > 0) pages.push(stream);
  if (pages.length === 0) pages.push([]);

  // ---- serialise
  const objects: string[] = [];
  const add = (body: string): number => {
    objects.push(body);
    return objects.length; // 1-indexed, as PDF object numbers are
  };

  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  // The pages object needs its children's numbers, and the children need its —
  // so it is reserved first and filled in once they exist.
  const pagesObject = add('');
  const pageNumbers: number[] = [];

  for (const page of pages) {
    const content = page.join('\n');
    const contentObject = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    pageNumbers.push(
      add(
        `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${width} ${height}] ` +
          `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
          `/Contents ${contentObject} 0 R >>`,
      ),
    );
  }

  objects[pagesObject - 1] =
    `<< /Type /Pages /Count ${pageNumbers.length} /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(' ')}] >>`;

  const info = add(
    `<< /Title (${literal(options.title)}) /Producer (sirius) /Creator (sirius) >>`,
  );
  const catalog = add(`<< /Type /Catalog /Pages ${pagesObject} 0 R >>`);

  const chunks: Buffer[] = [];
  let offset = 0;
  const push = (text: string): void => {
    const buffer = Buffer.from(text, 'latin1');
    chunks.push(buffer);
    offset += buffer.length;
  };

  // The binary comment on line two tells transfer tools this is not text.
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(offset);
    push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xref = offset;
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const each of offsets) table += `${String(each).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\n` +
      `startxref\n${xref}\n%%EOF\n`,
  );

  return Buffer.concat(chunks);
}
