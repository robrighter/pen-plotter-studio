import { Point } from "./geometry";
import { Perlin } from "./noise";
import { mulberry32 } from "./rng";

export interface ScalarField {
  cols: number;
  rows: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  values: Float32Array;
}

export interface FieldSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
  col: number;
  row: number;
}

export function createField(
  cols: number,
  rows: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  sample: (p: FieldSample) => number,
): ScalarField {
  const safeCols = Math.max(2, Math.floor(cols));
  const safeRows = Math.max(2, Math.floor(rows));
  const values = new Float32Array(safeCols * safeRows);
  for (let row = 0; row < safeRows; row++) {
    const ny = row / (safeRows - 1);
    const y = y0 + ny * (y1 - y0);
    for (let col = 0; col < safeCols; col++) {
      const nx = col / (safeCols - 1);
      const x = x0 + nx * (x1 - x0);
      values[row * safeCols + col] = sample({ x, y, nx, ny, col, row });
    }
  }
  return { cols: safeCols, rows: safeRows, x0, y0, x1, y1, values };
}

export function fieldValue(field: ScalarField, col: number, row: number): number {
  const c = Math.max(0, Math.min(field.cols - 1, col));
  const r = Math.max(0, Math.min(field.rows - 1, row));
  return field.values[r * field.cols + c];
}

export function fieldPoint(field: ScalarField, col: number, row: number): Point {
  const x = field.x0 + (col / (field.cols - 1)) * (field.x1 - field.x0);
  const y = field.y0 + (row / (field.rows - 1)) * (field.y1 - field.y0);
  return [x, y];
}

export function normalizeField(field: ScalarField): ScalarField {
  let min = Infinity;
  let max = -Infinity;
  for (const value of field.values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    field.values.fill(0);
    return field;
  }
  const span = max - min || 1;
  for (let i = 0; i < field.values.length; i++) {
    const value = field.values[i];
    field.values[i] = Number.isFinite(value) ? (value - min) / span : 0;
  }
  return field;
}

export function sampleField(field: ScalarField, x: number, y: number): number {
  const nx = (x - field.x0) / (field.x1 - field.x0);
  const ny = (y - field.y0) / (field.y1 - field.y0);
  const gx = Math.max(0, Math.min(field.cols - 1, nx * (field.cols - 1)));
  const gy = Math.max(0, Math.min(field.rows - 1, ny * (field.rows - 1)));
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(field.cols - 1, x0 + 1);
  const y1 = Math.min(field.rows - 1, y0 + 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const a = fieldValue(field, x0, y0);
  const b = fieldValue(field, x1, y0);
  const c = fieldValue(field, x0, y1);
  const d = fieldValue(field, x1, y1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

export function fieldGradient(field: ScalarField, x: number, y: number): Point {
  const dx = (field.x1 - field.x0) / (field.cols - 1);
  const dy = (field.y1 - field.y0) / (field.rows - 1);
  const gx = sampleField(field, x + dx, y) - sampleField(field, x - dx, y);
  const gy = sampleField(field, x, y + dy) - sampleField(field, x, y - dy);
  return [gx / (2 * dx), gy / (2 * dy)];
}

export function fractalNoise(
  seed: number,
  x: number,
  y: number,
  scale: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): number {
  const perlin = new Perlin(mulberry32(seed >>> 0));
  let amp = 1;
  let freq = scale;
  let value = 0;
  let norm = 0;
  for (let i = 0; i < Math.max(1, Math.floor(octaves)); i++) {
    value += perlin.noise2(x * freq, y * freq) * amp;
    norm += amp;
    amp *= persistence;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : value / norm;
}
