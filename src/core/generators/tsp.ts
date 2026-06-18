import { Path, Point, dist } from "../geometry";
import { mulberry32, RNG } from "../rng";
import { Perlin } from "../noise";
import { HeightField, sampleImageField } from "../imageField";

// Scatter stipple points with a noise-driven density, then connect them into a
// single continuous path with a nearest-neighbour tour refined by 2-opt — the
// classic "TSP art" the pen draws in one unbroken stroke.
export interface TspParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  numPoints: number;
  /** noise scale for the density field that biases where dots land */
  densityScale: number;
  /** 2-opt refinement passes (0 = nearest-neighbour only) */
  twoOptPasses: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
}

export const tspDefaults: TspParams = {
  seed: 1,
  width: 210,
  height: 297,
  margin: 15,
  numPoints: 1200,
  densityScale: 0.01,
  twoOptPasses: 2,
  imageInfluence: 1,
  imageContrast: 1,
};

function stipplePoints(p: TspParams, rng: RNG): Point[] {
  const perlin = new Perlin(mulberry32((p.seed ^ 0x1234567) >>> 0));
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;

  const points: Point[] = [];
  const maxAttempts = p.numPoints * 40;
  let attempts = 0;
  while (points.length < p.numPoints && attempts < maxAttempts) {
    attempts++;
    const x = x0 + rng() * (x1 - x0);
    const y = y0 + rng() * (y1 - y0);
    // Rejection sampling: accept more often where the density field is high.
    const procedural = (perlin.noise2(x * p.densityScale, y * p.densityScale) + 1) / 2;
    const image = sampleImageField(
      p.field,
      (x - x0) / (x1 - x0),
      (y - y0) / (y1 - y0),
      p.invert,
      p.imageContrast,
    );
    const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 1));
    const density = image === null ? procedural : procedural * (1 - influence) + image * influence;
    if (rng() < density) points.push([x, y]);
  }
  return points;
}

function nearestNeighbourTour(points: Point[]): Point[] {
  if (points.length === 0) return [];
  const used = new Uint8Array(points.length);
  const order: Point[] = [points[0]];
  used[0] = 1;
  let current = 0;
  for (let k = 1; k < points.length; k++) {
    let best = -1;
    let bestDist = Infinity;
    const cp = points[current];
    for (let i = 0; i < points.length; i++) {
      if (used[i]) continue;
      const dd = dist(cp, points[i]);
      if (dd < bestDist) {
        bestDist = dd;
        best = i;
      }
    }
    if (best < 0) break;
    used[best] = 1;
    order.push(points[best]);
    current = best;
  }
  return order;
}

function twoOpt(route: Point[], passes: number): Point[] {
  const n = route.length;
  if (n < 4) return route;
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (let i = 0; i < n - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      for (let j = i + 2; j < n - 1; j++) {
        const c = route[j];
        const d = route[j + 1];
        const delta = dist(a, c) + dist(b, d) - (dist(a, b) + dist(c, d));
        if (delta < -1e-9) {
          // reverse the segment between i+1 and j
          let lo = i + 1;
          let hi = j;
          while (lo < hi) {
            const tmp = route[lo];
            route[lo] = route[hi];
            route[hi] = tmp;
            lo++;
            hi--;
          }
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return route;
}

export function tsp(p: TspParams): Path[] {
  const rng = mulberry32(p.seed);
  const pts = stipplePoints(p, rng);
  let route = nearestNeighbourTour(pts);
  route = twoOpt(route, Math.max(0, Math.floor(p.twoOptPasses)));
  return route.length >= 2 ? [route] : [];
}
