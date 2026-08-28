/**
 * A compliance badge, drawn here rather than fetched from a server.
 *
 * `sirius badge` printed a URL to `GET /projects/{id}/badge.svg` and refused to
 * do anything without a project id — so the one artefact a README wants was the
 * one thing that required signing up. A scan already computes the score; the
 * badge is that number and a colour.
 *
 * The SVG is the flat style Shields popularised, written out by hand because a
 * badge is forty lines of markup and not worth a dependency. Text width is
 * estimated from character count, which is what Shields does for the same
 * reason: measuring glyphs needs a font, and being two pixels wide is invisible.
 */

export interface BadgeInput {
  /** Left half. Always the tool, so a wall of badges is scannable. */
  label: string;
  /** Right half — `72/100`, `6 findings`, `₹47,30,000`. */
  message: string;
  /** Right-half fill. */
  color: string;
}

/** Shields' palette, so a sirius badge sits next to a CI badge without clashing. */
const COLORS = {
  brightgreen: '#4c1',
  green: '#97ca00',
  yellow: '#dfb317',
  orange: '#fe7d37',
  red: '#e05d44',
  grey: '#9f9f9f',
} as const;

/**
 * Colour by score, on the same thresholds the footer meter uses.
 *
 * Deliberately not a gradient: a badge is read at a glance from across a room,
 * and five steps are as many as that survives.
 */
export function colorForScore(score: number): string {
  if (score >= 90) return COLORS.brightgreen;
  if (score >= 75) return COLORS.green;
  if (score >= 60) return COLORS.yellow;
  if (score >= 40) return COLORS.orange;
  return COLORS.red;
}

export const BADGE_GREY = COLORS.grey;

/** Verdana at 11px, averaged. Off by a pixel or two and nobody can tell. */
function textWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    // Digits and capitals are wider than lowercase; everything else averages out.
    width += /[A-Z0-9]/.test(char) ? 7.2 : /[il1.,:/]/.test(char) ? 3.4 : 6.2;
  }
  return Math.ceil(width);
}

export function renderBadge({ label, message, color }: BadgeInput): string {
  const pad = 10;
  const labelWidth = textWidth(label) + pad * 2;
  const messageWidth = textWidth(message) + pad * 2;
  const total = labelWidth + messageWidth;

  // Text is positioned in tenths of a pixel, as Shields does, so the shadow
  // copy underneath lines up exactly.
  const labelX = (labelWidth / 2) * 10;
  const messageX = (labelWidth + messageWidth / 2) * 10;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${total}" height="20" role="img" aria-label="${escape(label)}: ${escape(message)}">
  <title>${escape(label)}: ${escape(message)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${total}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${total}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${labelX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelWidth - pad * 2) * 10}">${escape(label)}</text>
    <text x="${labelX}" y="140" transform="scale(.1)" textLength="${(labelWidth - pad * 2) * 10}">${escape(label)}</text>
    <text aria-hidden="true" x="${messageX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(messageWidth - pad * 2) * 10}">${escape(message)}</text>
    <text x="${messageX}" y="140" transform="scale(.1)" textLength="${(messageWidth - pad * 2) * 10}">${escape(message)}</text>
  </g>
</svg>
`;
}

/**
 * The Shields endpoint payload for the same badge.
 *
 * Published somewhere reachable, this lets a README use `shields.io/endpoint`
 * and get Shields' own rendering — useful when a team wants the badge to match
 * the rest of their row exactly. It is the same three fields, so the two can
 * never disagree.
 */
export function shieldsEndpoint({ label, message, color }: BadgeInput): string {
  return JSON.stringify({ schemaVersion: 1, label, message, color }, null, 2) + '\n';
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
