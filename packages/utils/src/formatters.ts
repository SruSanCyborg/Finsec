/**
 * Standard SIRIUS Utility Formatters
 */

/**
 * Money-at-risk, in rupees, grouped the Indian way: `₹42,00,000`, never
 * `₹4,200,000`. `Intl.NumberFormat('en-IN')` groups 2-2-3 rather than 3-3-3 on
 * its own — `formatMoneyUSD` below groups the Western way and is kept only for
 * anything that genuinely has a dollar figure, which nothing in this app does
 * once it is talking to the local daemon. A Western-grouped rupee figure on
 * stage undercuts the whole India-relevance argument sirius is built on.
 */
export function formatMoneyINR(amountInr: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amountInr);
}

/** Kept for the rare genuinely-dollar figure. Nothing sirius computes is one — see `formatMoneyINR`. */
export function formatMoneyUSD(amountUSD: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amountUSD);
}

/**
 * Format duration in milliseconds to human readable string (e.g. "4m 12s")
 */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format ISO Date string to localized string
 */
export function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return isoString;
  }
}
