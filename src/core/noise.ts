import { RNG } from "./rng";

// Classic 2D Perlin noise with a seeded permutation table. Used to drive the
// flow field angles and the stipple density map.
export class Perlin {
  private perm: Uint8Array;

  constructor(rng: RNG) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle seeded by the RNG.
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private static fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private static lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private static grad(hash: number, x: number, y: number): number {
    switch (hash & 3) {
      case 0:
        return x + y;
      case 1:
        return -x + y;
      case 2:
        return x - y;
      default:
        return -x - y;
    }
  }

  /** Returns noise in roughly [-1, 1]. */
  noise2(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = Perlin.fade(x);
    const v = Perlin.fade(y);
    const p = this.perm;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    return Perlin.lerp(
      Perlin.lerp(Perlin.grad(aa, x, y), Perlin.grad(ba, x - 1, y), u),
      Perlin.lerp(Perlin.grad(ab, x, y - 1), Perlin.grad(bb, x - 1, y - 1), u),
      v,
    );
  }
}
