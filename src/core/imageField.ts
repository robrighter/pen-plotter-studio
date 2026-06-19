// A heightfield sampled from an imported image: brightness in [0,1] at any
// normalized (nx, ny) coordinate. Generators use this to trace real photos
// instead of procedural noise.

export interface HeightField {
  /** sample at normalized coords nx,ny in [0,1]; returns brightness [0,1] */
  sample(nx: number, ny: number): number;
}

export interface ImageFieldData {
  width: number;
  height: number;
  gray: Float32Array;
}

export function sampleImageField(
  field: HeightField | null | undefined,
  nx: number,
  ny: number,
  invert = false,
  contrast = 1,
): number | null {
  if (!field) return null;
  let value = field.sample(nx, ny);
  if (invert) value = 1 - value;
  const c = Math.max(0.05, contrast);
  value = (value - 0.5) * c + 0.5;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function imageFieldDataFromImageData(img: ImageData): ImageFieldData {
  const { width, height, data } = img;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  return { width, height, gray };
}

export function heightFieldFromData(fieldData: ImageFieldData): HeightField {
  const { width, height, gray } = fieldData;

  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

  return {
    sample(nx: number, ny: number): number {
      const fx = clamp01(nx) * (width - 1);
      const fy = clamp01(ny) * (height - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, width - 1);
      const y1 = Math.min(y0 + 1, height - 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = gray[y0 * width + x0];
      const b = gray[y0 * width + x1];
      const c = gray[y1 * width + x0];
      const d = gray[y1 * width + x1];
      const top = a + (b - a) * tx;
      const bot = c + (d - c) * tx;
      return top + (bot - top) * ty;
    },
  };
}

/** Build a heightfield from raw image pixels using bilinear interpolation. */
export function fieldFromImageData(img: ImageData): HeightField {
  return heightFieldFromData(imageFieldDataFromImageData(img));
}
