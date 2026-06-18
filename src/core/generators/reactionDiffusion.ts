import { Path } from "../geometry";
import { ScalarField, normalizeField } from "../field";
import { contours, evenlySpacedLevels } from "../contours";
import { mulberry32, randRange } from "../rng";
import { HeightField, sampleImageField } from "../imageField";

export interface ReactionDiffusionParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  gridSize: number;
  iterations: number;
  feed: number;
  kill: number;
  diffusionA: number;
  diffusionB: number;
  levels: number;
  thresholdMin: number;
  thresholdMax: number;
  smoothing: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
}

export const reactionDiffusionDefaults: ReactionDiffusionParams = {
  seed: 88,
  width: 210,
  height: 297,
  margin: 15,
  gridSize: 120,
  iterations: 1200,
  feed: 0.055,
  kill: 0.062,
  diffusionA: 1,
  diffusionB: 0.5,
  levels: 5,
  thresholdMin: 0.12,
  thresholdMax: 0.7,
  smoothing: 1,
  imageInfluence: 0.7,
  imageContrast: 1.4,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function reactionDiffusion(p: ReactionDiffusionParams): Path[] {
  const rng = mulberry32(p.seed);
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const cols = Math.max(32, Math.floor(p.gridSize));
  const rows = Math.max(32, Math.round(cols * ((y1 - y0) / (x1 - x0))));
  const size = cols * rows;
  let a = new Float32Array(size).fill(1);
  let b = new Float32Array(size);
  let nextA = new Float32Array(size);
  let nextB = new Float32Array(size);

  const idx = (x: number, y: number) => y * cols + x;
  if (p.field) {
    const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 0.7));
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const image = sampleImageField(
          p.field,
          x / (cols - 1),
          y / (rows - 1),
          p.invert,
          p.imageContrast,
        ) ?? 0;
        b[idx(x, y)] = image * influence;
        a[idx(x, y)] = 1 - image * influence * 0.35;
      }
    }
  }
  const patches = 10;
  for (let i = 0; i < patches; i++) {
    const cx = Math.floor(randRange(rng, cols * 0.15, cols * 0.85));
    const cy = Math.floor(randRange(rng, rows * 0.15, rows * 0.85));
    const r = Math.floor(randRange(rng, 3, 9));
    for (let y = Math.max(1, cy - r); y < Math.min(rows - 1, cy + r); y++) {
      for (let x = Math.max(1, cx - r); x < Math.min(cols - 1, cx + r); x++) {
        if (Math.hypot(x - cx, y - cy) <= r) b[idx(x, y)] = randRange(rng, 0.6, 1);
      }
    }
  }

  const lap = (arr: Float32Array, x: number, y: number): number =>
    arr[idx(x, y)] * -1 +
    (arr[idx(x - 1, y)] + arr[idx(x + 1, y)] + arr[idx(x, y - 1)] + arr[idx(x, y + 1)]) * 0.2 +
    (arr[idx(x - 1, y - 1)] + arr[idx(x + 1, y - 1)] + arr[idx(x - 1, y + 1)] + arr[idx(x + 1, y + 1)]) * 0.05;

  const iterations = Math.max(1, Math.floor(p.iterations));
  for (let step = 0; step < iterations; step++) {
    nextA.set(a);
    nextB.set(b);
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = idx(x, y);
        const av = a[i];
        const bv = b[i];
        const reaction = av * bv * bv;
        nextA[i] = clamp01(
          av + p.diffusionA * lap(a, x, y) - reaction + p.feed * (1 - av),
        );
        nextB[i] = clamp01(
          bv + p.diffusionB * lap(b, x, y) + reaction - (p.kill + p.feed) * bv,
        );
      }
    }
    [a, nextA] = [nextA, a];
    [b, nextB] = [nextB, b];
  }

  const field: ScalarField = { cols, rows, x0, y0, x1, y1, values: b };
  normalizeField(field);
  let paths = contours(field, evenlySpacedLevels(p.levels, p.thresholdMin, p.thresholdMax), {
    minPathLength: 4,
    smoothPasses: Math.floor(p.smoothing),
  });
  if (paths.length === 0) {
    paths = contours(field, evenlySpacedLevels(Math.max(3, p.levels), 0.05, 0.95), {
      minPathLength: 4,
      smoothPasses: Math.floor(p.smoothing),
    });
  }
  return paths;
}
