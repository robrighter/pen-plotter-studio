import { Path } from "../geometry";
import { createField, normalizeField } from "../field";
import { contours, evenlySpacedLevels } from "../contours";
import { Perlin } from "../noise";
import { mulberry32 } from "../rng";
import { HeightField, sampleImageField } from "../imageField";

export interface TopographicParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  gridSize: number;
  levels: number;
  noiseScale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  ridgeStrength: number;
  islandFalloff: number;
  smoothing: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
}

export const topographicDefaults: TopographicParams = {
  seed: 42,
  width: 210,
  height: 297,
  margin: 15,
  gridSize: 170,
  levels: 14,
  noiseScale: 0.018,
  octaves: 4,
  persistence: 0.5,
  lacunarity: 2,
  ridgeStrength: 0.25,
  islandFalloff: 0.35,
  smoothing: 1,
  imageInfluence: 1,
  imageContrast: 1,
};

export function topographic(p: TopographicParams): Path[] {
  const perlin = new Perlin(mulberry32(p.seed));
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const rows = Math.max(24, Math.round(p.gridSize * ((y1 - y0) / (x1 - x0))));
  const octaves = Math.max(1, Math.floor(p.octaves));

  const field = normalizeField(
    createField(p.gridSize, rows, x0, y0, x1, y1, ({ x, y, nx, ny }) => {
      let amp = 1;
      let freq = p.noiseScale;
      let value = 0;
      let norm = 0;
      for (let i = 0; i < octaves; i++) {
        const n = perlin.noise2(x * freq + i * 31.7, y * freq - i * 17.3);
        value += n * amp;
        norm += amp;
        amp *= p.persistence;
        freq *= p.lacunarity;
      }
      value /= norm || 1;
      const ridge = 1 - Math.abs(value);
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const island = Math.max(0, 1 - Math.hypot(dx, dy) * 1.55);
      const procedural = value + ridge * p.ridgeStrength + island * p.islandFalloff;
      const image = sampleImageField(p.field, nx, ny, p.invert, p.imageContrast);
      const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 1));
      return image === null ? procedural : procedural * (1 - influence) + image * influence;
    }),
  );

  return contours(field, evenlySpacedLevels(p.levels, 0.12, 0.9), {
    minPathLength: 6,
    smoothPasses: Math.floor(p.smoothing),
  });
}
