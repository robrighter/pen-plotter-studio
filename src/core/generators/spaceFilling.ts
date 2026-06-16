import { Path } from "../geometry";

// A Hilbert space-filling curve: one continuous path that visits every cell of
// a 2^order x 2^order grid. Fully deterministic, so it doubles as a good test
// pattern for the GCode pipeline.
export interface HilbertParams {
  width: number;
  height: number;
  margin: number;
  /** curve order, 1..8 (grid side is 2^order) */
  order: number;
}

export const hilbertDefaults: HilbertParams = {
  width: 210,
  height: 297,
  margin: 15,
  order: 5,
};

// Map a distance d along the order-n Hilbert curve to integer grid (x, y).
function d2xy(n: number, d: number): [number, number] {
  let x = 0;
  let y = 0;
  let t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & (t >> 1);
    const ry = 1 & (t ^ rx);
    // rotate the quadrant
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return [x, y];
}

export function hilbert(p: HilbertParams): Path[] {
  const order = Math.max(1, Math.min(8, Math.floor(p.order)));
  const n = 1 << order; // grid side
  const total = n * n;

  // Fit the square curve inside the drawable area, centred.
  const side = Math.min(p.width, p.height) - 2 * p.margin;
  const cell = side / (n - 1);
  const offX = p.margin + (p.width - 2 * p.margin - side) / 2;
  const offY = p.margin + (p.height - 2 * p.margin - side) / 2;

  const path: Path = [];
  for (let d = 0; d < total; d++) {
    const [gx, gy] = d2xy(n, d);
    path.push([offX + gx * cell, offY + gy * cell]);
  }
  return [path];
}
