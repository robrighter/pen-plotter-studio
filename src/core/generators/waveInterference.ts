import { Path } from "../geometry";
import { createField, normalizeField } from "../field";
import { contours, evenlySpacedLevels } from "../contours";
import { mulberry32, randRange } from "../rng";
import { HeightField, sampleImageField } from "../imageField";

export interface WaveInterferenceParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  sourceCount: number;
  gridSize: number;
  levels: number;
  frequency: number;
  directionalMix: number;
  sourceLayout: number;
  smoothing: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
}

export const waveInterferenceDefaults: WaveInterferenceParams = {
  seed: 73,
  width: 210,
  height: 297,
  margin: 15,
  sourceCount: 4,
  gridSize: 170,
  levels: 12,
  frequency: 0.12,
  directionalMix: 0.25,
  sourceLayout: 1,
  smoothing: 1,
  imageInfluence: 0.45,
  imageContrast: 1.2,
};

export function waveInterference(p: WaveInterferenceParams): Path[] {
  const rng = mulberry32(p.seed);
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const radius = Math.min(x1 - x0, y1 - y0) * 0.35;
  const count = Math.max(1, Math.floor(p.sourceCount));
  const layout = Math.round(p.sourceLayout);
  const sources = Array.from({ length: count }, (_, i) => {
    if (layout === 1) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.25;
      return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, phase: rng() * Math.PI * 2 };
    }
    if (layout === 2) {
      return { x: x0 + ((i + 0.5) / count) * (x1 - x0), y: cy, phase: rng() * Math.PI * 2 };
    }
    return { x: randRange(rng, x0, x1), y: randRange(rng, y0, y1), phase: rng() * Math.PI * 2 };
  });

  const rows = Math.max(24, Math.round(p.gridSize * ((y1 - y0) / (x1 - x0))));
  const field = normalizeField(
    createField(p.gridSize, rows, x0, y0, x1, y1, ({ x, y, nx, ny }) => {
      let value = 0;
      for (const s of sources) {
        const d = Math.hypot(x - s.x, y - s.y);
        value += Math.sin(d * p.frequency + s.phase);
      }
      value +=
        Math.sin(x * p.frequency * 0.75 + y * p.frequency * 0.22) *
        p.directionalMix *
        count;
      const image = sampleImageField(p.field, nx, ny, p.invert, p.imageContrast);
      const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 0.45));
      return image === null ? value : value + (image - 0.5) * count * influence * 2;
    }),
  );

  return contours(field, evenlySpacedLevels(p.levels, 0.08, 0.92), {
    minPathLength: 5,
    smoothPasses: Math.floor(p.smoothing),
  });
}
