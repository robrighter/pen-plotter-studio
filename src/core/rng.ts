// A small seeded PRNG so every generated piece is reproducible from its seed.

export type RNG = () => number;

/** mulberry32 — fast, decent quality, deterministic from a 32-bit seed. */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng: RNG, min: number, max: number): number {
  return min + rng() * (max - min);
}
