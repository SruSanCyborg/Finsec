/**
 * Greedy word wrap, shared by every renderer.
 *
 * Lives at the root rather than under `render/` because the exposure model also
 * needs it, and an engine module importing a renderer would be backwards.
 *
 * Wrapping matters more here than it looks: the lines that get cut off are the
 * ones carrying the reasoning — the basis for a rupee figure, the public anchor
 * behind it, the advice at the end of a threat report. A truncated explanation
 * explains nothing, and those are exactly the lines a reader stops on.
 */

/** Terminal width to assume when nothing better is known. */
export const DEFAULT_WIDTH = 80;

/**
 * Wraps to `width` columns, never splitting a word.
 *
 * Below ~12 columns there is no useful wrap, so the text is returned whole and
 * the caller's own truncation takes over.
 */
export function wrapText(text: string, width: number): string[] {
  if (width < 12) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current === '') current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines.length > 0 ? lines : [text];
}

/**
 * Wraps and indents a labelled block: the label sits on the first line, and
 * continuation lines align under the text rather than under the label.
 */
export function wrapLabelled(label: string, text: string, width: number, gutter: number): string[] {
  const indent = ' '.repeat(gutter);
  return wrapText(text, Math.max(12, width - gutter)).map((chunk, index) =>
    index === 0 ? `${label.padEnd(gutter)}${chunk}` : `${indent}${chunk}`,
  );
}
