/**
 * A seeded generator, so every number in this feature is reproducible.
 *
 * Measured precision and recall mean nothing if the batch they were measured on
 * cannot be regenerated. `Math.random()` would make every run a different
 * experiment and every reported figure unfalsifiable — the exact failure mode
 * this whole track is supposed to argue against.
 *
 * mulberry32: 32-bit state, one multiply-xor round. Not cryptographic and not
 * trying to be — it seeds fixtures, it does not protect anything.
 */

export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** One item from a weighted list. Weights need not sum to anything. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [item, weight] of items) {
      roll -= weight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1]![0];
  }

  /**
   * Log-normal-ish amount in paise, so the batch has the long tail real
   * payment traffic has: many small values, a few that dominate the total.
   * A uniform spread would make money-weighted metrics indistinguishable from
   * count-weighted ones, which is precisely the distinction worth showing.
   */
  amount(medianRupees: number, sigma = 1.1): number {
    const u = Math.max(this.next(), 1e-9);
    const v = Math.max(this.next(), 1e-9);
    const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const rupees = medianRupees * Math.exp(sigma * normal);
    return Math.round(Math.min(Math.max(rupees, 49), 25_00_000) * 100);
  }

  /** Fisher-Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j] as T, items[i] as T];
    }
    return items;
  }
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
