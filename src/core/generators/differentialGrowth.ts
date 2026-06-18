import { Path, Point } from "../geometry";
import { mulberry32, randRange } from "../rng";
import { HeightField, sampleImageField } from "../imageField";

export interface DifferentialGrowthParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  iterations: number;
  initialPoints: number;
  maxPoints: number;
  repulsionRadius: number;
  repulsionStrength: number;
  splitLength: number;
  smoothing: number;
  boundsForce: number;
  historyEvery: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
}

export const differentialGrowthDefaults: DifferentialGrowthParams = {
  seed: 33,
  width: 210,
  height: 297,
  margin: 15,
  iterations: 420,
  initialPoints: 48,
  maxPoints: 1500,
  repulsionRadius: 6,
  repulsionStrength: 0.45,
  splitLength: 3,
  smoothing: 0.18,
  boundsForce: 0.4,
  historyEvery: 0,
  imageInfluence: 0.7,
  imageContrast: 1.4,
};

function add(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1]];
}

export function differentialGrowth(p: DifferentialGrowthParams): Path[] {
  const rng = mulberry32(p.seed);
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const radius = Math.min(x1 - x0, y1 - y0) * 0.18;
  let pts: Point[] = [];
  for (let i = 0; i < Math.max(8, Math.floor(p.initialPoints)); i++) {
    const a = (i / p.initialPoints) * Math.PI * 2;
    const r = radius + randRange(rng, -radius * 0.08, radius * 0.08);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }

  const history: Path[] = [];
  const cell = Math.max(1, p.repulsionRadius);
  const imageGradient = (pt: Point): Point => {
    if (!p.field) return [0, 0];
    const nx = (pt[0] - x0) / (x1 - x0);
    const ny = (pt[1] - y0) / (y1 - y0);
    const eps = 1 / 260;
    const left = sampleImageField(p.field, nx - eps, ny, p.invert, p.imageContrast) ?? 0;
    const right = sampleImageField(p.field, nx + eps, ny, p.invert, p.imageContrast) ?? 0;
    const top = sampleImageField(p.field, nx, ny - eps, p.invert, p.imageContrast) ?? 0;
    const bottom = sampleImageField(p.field, nx, ny + eps, p.invert, p.imageContrast) ?? 0;
    const gx = right - left;
    const gy = bottom - top;
    const d = Math.hypot(gx, gy) || 1;
    const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 0.7));
    return [(gx / d) * influence, (gy / d) * influence];
  };
  const iterations = Math.max(1, Math.floor(p.iterations));
  for (let step = 0; step < iterations && pts.length < p.maxPoints; step++) {
    const grid = new Map<string, number[]>();
    const key = (pt: Point) => `${Math.floor(pt[0] / cell)},${Math.floor(pt[1] / cell)}`;
    pts.forEach((pt, i) => {
      const k = key(pt);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(i);
    });

    const moves: Point[] = pts.map(() => [0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const gx = Math.floor(pt[0] / cell);
      const gy = Math.floor(pt[1] / cell);
      for (let yy = gy - 1; yy <= gy + 1; yy++) {
        for (let xx = gx - 1; xx <= gx + 1; xx++) {
          const bucket = grid.get(`${xx},${yy}`) ?? [];
          for (const j of bucket) {
            if (i === j) continue;
            const other = pts[j];
            const dx = pt[0] - other[0];
            const dy = pt[1] - other[1];
            const d = Math.hypot(dx, dy);
            if (d > 0.001 && d < p.repulsionRadius) {
              const f = ((p.repulsionRadius - d) / p.repulsionRadius) * p.repulsionStrength;
              moves[i][0] += (dx / d) * f;
              moves[i][1] += (dy / d) * f;
            }
          }
        }
      }
    }

    pts = pts.map((pt, i) => {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const smooth: Point = [
        (prev[0] + next[0]) / 2 - pt[0],
        (prev[1] + next[1]) / 2 - pt[1],
      ];
      const img = imageGradient(pt);
      let moved = add(pt, [
        moves[i][0] + smooth[0] * p.smoothing + img[0] * 0.6,
        moves[i][1] + smooth[1] * p.smoothing + img[1] * 0.6,
      ]);
      moved = [
        Math.max(x0, Math.min(x1, moved[0] + (cx - moved[0]) * p.boundsForce * 0.002)),
        Math.max(y0, Math.min(y1, moved[1] + (cy - moved[1]) * p.boundsForce * 0.002)),
      ];
      return moved;
    });

    const grown: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      grown.push(a);
      if (pts.length < p.maxPoints && Math.hypot(a[0] - b[0], a[1] - b[1]) > p.splitLength) {
        grown.push([(a[0] + b[0]) / 2 + randRange(rng, -0.2, 0.2), (a[1] + b[1]) / 2 + randRange(rng, -0.2, 0.2)]);
      }
    }
    pts = grown;

    if (p.historyEvery >= 2 && step % Math.floor(p.historyEvery) === 0) {
      history.push([...pts, pts[0]]);
    }
  }

  const finalPath: Path = [...pts, pts[0]];
  return p.historyEvery >= 2 ? [...history, finalPath] : [finalPath];
}
