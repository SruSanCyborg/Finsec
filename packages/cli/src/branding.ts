/**
 * Product identity, in one place.
 *
 * Kept separate from the renderers so the name, attribution, and tagline are
 * changed once rather than hunted through banner strings — which is exactly the
 * problem the finsec-lint → sirius rename created the first time.
 */

export const PRODUCT = 'sirius';

export const VERSION = '0.4.0';

/** Shown as "powered by …" beneath the wordmark. */
export const AUTHOR = 'Srusan';

export const TAGLINE = 'Compliance linting for money-handling code';

/**
 * Sirius is the brightest star in the night sky, and blue-white. The wordmark's
 * gradient and star accent come from that, which is what keeps the identity
 * from being a generic ASCII banner.
 */
export const STAR = '✦';
