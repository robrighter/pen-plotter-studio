import { Path } from "../geometry";
import { createField, normalizeField } from "../field";
import { contours, evenlySpacedLevels } from "../contours";
import { mulberry32, randRange } from "../rng";
import { HeightField, sampleImageField } from "../imageField";

export interface MetaballsParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  blobCount: number;
  gridSize: number;
  levels: number;
  falloffPower: number;
  minRadius: number;
  maxRadius: number;
  thresholdMin: number;
  thresholdMax: number;
  smoothing: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
}

export const metaballsDefaults: MetaballsParams = {
  seed: 21,
  width: 210,
  height: 297,
  margin: 15,
  blobCount: 18,
  gridSize: 160,
  levels: 8,
  falloffPower: 2,
  minRadius: 8,
  maxRadius: 28,
  thresholdMin: 0.25,
  thresholdMax: 0.78,
  smoothing: 1,
  imageInfluence: 0.75,
  imageContrast: 1,
};

export function metaballs(p: MetaballsParams): Path[] {
  const rng = mulberry32(p.seed);
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const blobs = Array.from({ length: Math.max(1, Math.floor(p.blobCount)) }, () => ({
    x: randRange(rng, x0, x1),
    y: randRange(rng, y0, y1),
    r: randRange(rng, p.minRadius, p.maxRadius),
    w: randRange(rng, 0.7, 1.4),
  }));

  const rows = Math.max(24, Math.round(p.gridSize * ((y1 - y0) / (x1 - x0))));
  const field = normalizeField(
    createField(p.gridSize, rows, x0, y0, x1, y1, ({ x, y, nx, ny }) => {
      let value = 0;
      for (const b of blobs) {
        const d = Math.hypot(x - b.x, y - b.y);
        value += b.w / (1 + Math.pow(d / Math.max(1, b.r), p.falloffPower));
      }
      const image = sampleImageField(p.field, nx, ny, p.invert, p.imageContrast);
      const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 0.75));
      return image === null ? value : value * (1 - influence) + image * influence * blobs.length * 0.18;
    }),
  );

  return contours(
    field,
    evenlySpacedLevels(p.levels, p.thresholdMin, p.thresholdMax),
    { minPathLength: 5, smoothPasses: Math.floor(p.smoothing) },
  );
}
