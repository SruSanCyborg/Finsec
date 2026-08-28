/**
 * Rupee formatting.
 *
 * The Indian numbering system groups the last three digits, then every two
 * digits above that: 5120000 is ₹51,20,000 (fifty-one lakh twenty thousand),
 * not ₹5,120,000. The PRD's mockup shows the Indian form, and getting it wrong
 * on stage would undercut the India-relevance argument the whole pitch rests on.
 *
 * `Intl.NumberFormat('en-IN')` implements the grouping correctly, so this module
 * is mostly about the null handling and the compact forms around it.
 */

const GROUPED = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/**
 * `₹`, or `Rs.` where the terminal cannot draw it.
 *
 * AGENTS.md names `SIRIUS_ASCII=1` the projector safety net and lists `₹` as
 * the first character it protects. It did not: this module hardcoded the symbol
 * and knew nothing about the terminal, so under `SIRIUS_ASCII=1` a scan still
 * emitted nine of them. Only the revenue renderer honoured the flag, through
 * `palette.rupee` — so the same variable meant two different things in the two
 * demo beats, and `doctor`'s glyph self-test rendered `Rs.42,00,000` through a
 * *third* path, cheerfully vouching for a fallback the scanner did not have.
 *
 * Read from the environment rather than threaded through every call site: money
 * is formatted from thirty places, most of them nowhere near a `Capabilities`,
 * and a fallback that is only correct where somebody remembered to pass an
 * argument is the situation this replaces. `NO_COLOR` works the same way and
 * for the same reason.
 *
 * Machine output is unaffected — `--json` and SARIF carry money as a number,
 * never through here.
 */
function symbol(): string {
  const env = process.env;
  const ascii = env.SIRIUS_ASCII === '1' || env.SIRIUS_ASCII === 'true';
  return ascii ? 'Rs.' : '₹';
}

/** `4200000` → `"₹42,00,000"`. Null/undefined → `""`. */
export function formatInr(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return '';
  return `${symbol()}${GROUPED.format(Math.round(paise))}`;
}

/** Like `formatInr`, but renders an explicit dash when there is no figure. */
export function formatInrOrDash(amount: number | null | undefined): string {
  return formatInr(amount) || '—';
}

/**
 * `4200000` → `"₹42L"`, `51200000` → `"₹5.1Cr"`. For places where the full
 * figure does not fit, such as a narrow terminal.
 */
export function formatInrCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '';
  const abs = Math.abs(amount);
  if (abs >= 1_00_00_000) return `${symbol()}${trim(amount / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${symbol()}${trim(amount / 1_00_000)}L`;
  if (abs >= 1_000) return `${symbol()}${trim(amount / 1_000)}K`;
  return `${symbol()}${Math.round(amount)}`;
}

function trim(n: number): string {
  // One decimal, but drop it when it is a round number: 42.0 → "42", 5.12 → "5.1"
  return n.toFixed(1).replace(/\.0$/, '');
}

/** Sum a list of possibly-null amounts. */
export function sumInr(amounts: Array<number | null | undefined>): number {
  return amounts.reduce<number>((total, n) => total + (n ?? 0), 0);
}
