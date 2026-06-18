import { Path, Point } from "../geometry";
import { mulberry32, randRange } from "../rng";
import { HeightField, sampleImageField } from "../imageField";

export interface StreamlinesParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  fieldType: number;
  sourceCount: number;
  lineCount: number;
  stepLength: number;
  maxSteps: number;
  fieldScale: number;
  spacing: number;
  drawBidirectional: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
  imageTangent?: number;
}

export const streamlinesDefaults: StreamlinesParams = {
  seed: 64,
  width: 210,
  height: 297,
  margin: 15,
  fieldType: 0,
  sourceCount: 5,
  lineCount: 220,
  stepLength: 1.2,
  maxSteps: 450,
  fieldScale: 1,
  spacing: 2.2,
  drawBidirectional: 1,
  imageInfluence: 0.8,
  imageContrast: 1.4,
  imageTangent: 1,
};

interface Source {
  x: number;
  y: number;
  strength: number;
}

function norm(v: Point): Point {
  const d = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / d, v[1] / d];
}

export function streamlines(p: StreamlinesParams): Path[] {
  const rng = mulberry32(p.seed);
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const sources: Source[] = Array.from({ length: Math.max(1, Math.floor(p.sourceCount)) }, (_, i) => ({
    x: randRange(rng, x0, x1),
    y: randRange(rng, y0, y1),
    strength: (i % 2 === 0 ? 1 : -1) * randRange(rng, 0.6, 1.4),
  }));
  const fieldType = Math.round(p.fieldType);
  const cell = Math.max(0.5, p.spacing);
  const occupied = new Set<string>();
  const cellKey = (x: number, y: number) => `${Math.floor((x - x0) / cell)},${Math.floor((y - y0) / cell)}`;
  const inBounds = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const isFree = (x: number, y: number) => !occupied.has(cellKey(x, y));
  const occupy = (path: Path) => {
    for (const [x, y] of path) occupied.add(cellKey(x, y));
  };

  const imageVectorAt = (x: number, y: number): Point | null => {
    if (!p.field) return null;
    const nx = (x - x0) / (x1 - x0);
    const ny = (y - y0) / (y1 - y0);
    const eps = 1 / 300;
    const left = sampleImageField(p.field, nx - eps, ny, p.invert, p.imageContrast) ?? 0;
    const right = sampleImageField(p.field, nx + eps, ny, p.invert, p.imageContrast) ?? 0;
    const top = sampleImageField(p.field, nx, ny - eps, p.invert, p.imageContrast) ?? 0;
    const bottom = sampleImageField(p.field, nx, ny + eps, p.invert, p.imageContrast) ?? 0;
    const gx = right - left;
    const gy = bottom - top;
    if (Math.hypot(gx, gy) < 1e-5) return null;
    return p.imageTangent && p.imageTangent >= 0.5 ? norm([-gy, gx]) : norm([gx, gy]);
  };

  const vectorAt = (x: number, y: number): Point => {
    let vx = 0;
    let vy = 0;
    for (const s of sources) {
      const dx = x - s.x;
      const dy = y - s.y;
      const d2 = dx * dx + dy * dy + 25;
      if (fieldType === 1) {
        vx += (dx / d2) * s.strength;
        vy += (dy / d2) * s.strength;
      } else if (fieldType === 2) {
        vx += ((dy / d2) * s.strength + dx / d2) * 0.7;
        vy += ((-dx / d2) * s.strength - dy / d2) * 0.7;
      } else {
        vx += (dy / d2) * s.strength;
        vy += (-dx / d2) * s.strength;
      }
    }
    vx += Math.sin(y * 0.025 + p.seed) * 0.12 * p.fieldScale;
    vy += Math.cos(x * 0.025 - p.seed) * 0.12 * p.fieldScale;
    const imageV = imageVectorAt(x, y);
    if (imageV) {
      const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 0.8));
      vx = vx * (1 - influence) + imageV[0] * influence;
      vy = vy * (1 - influence) + imageV[1] * influence;
    }
    return norm([vx, vy]);
  };

  const trace = (start: Point, dir: number): Path => {
    const path: Path = [start];
    let [x, y] = start;
    for (let i = 0; i < p.maxSteps; i++) {
      const v = vectorAt(x, y);
      x += v[0] * p.stepLength * dir;
      y += v[1] * p.stepLength * dir;
      if (!inBounds(x, y)) break;
      if (path.length > 8 && !isFree(x, y)) break;
      path.push([x, y]);
    }
    return path;
  };

  const paths: Path[] = [];
  const attempts = Math.max(1, Math.floor(p.lineCount * 8));
  for (let i = 0; i < attempts && paths.length < p.lineCount; i++) {
    const start: Point = [randRange(rng, x0, x1), randRange(rng, y0, y1)];
    if (!isFree(start[0], start[1])) continue;
    let path = trace(start, 1);
    if (p.drawBidirectional >= 0.5) {
      const back = trace(start, -1).reverse();
      path = back.concat(path.slice(1));
    }
    if (path.length > 12) {
      paths.push(path);
      occupy(path);
    }
  }
  return paths;
}
