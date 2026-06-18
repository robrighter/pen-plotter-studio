import { Path } from "../geometry";
import { createField, fieldGradient, normalizeField, sampleField } from "../field";
import { Perlin } from "../noise";
import { mulberry32, randRange } from "../rng";
import { HeightField, sampleImageField } from "../imageField";

export interface HatchingParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  hatchCount: number;
  gridSize: number;
  minLength: number;
  maxLength: number;
  angleMode: number;
  angleJitter: number;
  densityScale: number;
  curvature: number;
  noiseScale: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
}

export const hatchingDefaults: HatchingParams = {
  seed: 512,
  width: 210,
  height: 297,
  margin: 15,
  hatchCount: 1200,
  gridSize: 120,
  minLength: 2,
  maxLength: 9,
  angleMode: 0,
  angleJitter: 0.18,
  densityScale: 0.65,
  curvature: 0.25,
  noiseScale: 0.018,
  imageInfluence: 1,
  imageContrast: 1,
};

export function hatching(p: HatchingParams): Path[] {
  const rng = mulberry32(p.seed);
  const perlin = new Perlin(mulberry32((p.seed ^ 0xa51ce) >>> 0));
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const rows = Math.max(24, Math.round(p.gridSize * ((y1 - y0) / (x1 - x0))));
  const field = normalizeField(
    createField(p.gridSize, rows, x0, y0, x1, y1, ({ x, y, nx, ny }) => {
      const n =
        perlin.noise2(x * p.noiseScale, y * p.noiseScale) +
        0.5 * perlin.noise2(x * p.noiseScale * 2.1 + 40, y * p.noiseScale * 2.1 - 20);
      const radial = 1 - Math.hypot(nx - 0.5, ny - 0.5) * 1.35;
      const procedural = n + radial * 0.8;
      const image = sampleImageField(p.field, nx, ny, p.invert, p.imageContrast);
      const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 1));
      return image === null ? procedural : procedural * (1 - influence) + image * influence;
    }),
  );

  const paths: Path[] = [];
  const attempts = Math.max(1, Math.floor(p.hatchCount * 2.8));
  const mode = Math.round(p.angleMode);
  for (let i = 0; i < attempts && paths.length < p.hatchCount; i++) {
    const x = randRange(rng, x0, x1);
    const y = randRange(rng, y0, y1);
    const value = sampleField(field, x, y);
    if (rng() > value * p.densityScale) continue;
    const grad = fieldGradient(field, x, y);
    let angle =
      mode === 1
        ? Math.atan2(grad[1], grad[0]) + Math.PI / 2
        : mode === 2
          ? 0
          : Math.atan2(grad[1], grad[0]);
    angle += randRange(rng, -p.angleJitter, p.angleJitter) * Math.PI;
    const len = p.minLength + value * (p.maxLength - p.minLength);
    const curve = p.curvature * len * randRange(rng, -0.5, 0.5);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const nx = -dy;
    const ny = dx;
    const path: Path = [
      [x - dx * len * 0.5, y - dy * len * 0.5],
      [x + nx * curve, y + ny * curve],
      [x + dx * len * 0.5, y + dy * len * 0.5],
    ];
    if (path.every(([px, py]) => px >= x0 && px <= x1 && py >= y0 && py <= y1)) {
      paths.push(path);
    }
  }
  return paths;
}
