import { Path } from "../geometry";
import { mulberry32 } from "../rng";
import { Perlin } from "../noise";
import { HeightField } from "../imageField";

// "Ridgeline" / Joy Division plot: a stack of horizontal scan lines, each
// displaced upward by a heightfield, drawn front-to-back with hidden-line
// removal so nearer ridges occlude the lines behind them. The occlusion is
// what produces the characteristic blank "holes" where a peak hides the rows
// behind it.
export interface RidgelineParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  /** number of horizontal lines */
  numLines: number;
  /** samples per line — higher = smoother ridges */
  resolution: number;
  /** maximum upward displacement in mm */
  amplitude: number;
  /** smaller = broader, smoother hills */
  noiseScale: number;
  /** when set, drives the heightfield from an image instead of noise */
  field?: HeightField | null;
  /** invert image brightness (bright = tall instead of dark = tall) */
  invert?: boolean;
}

export const ridgelineDefaults: RidgelineParams = {
  seed: 7,
  width: 210,
  height: 297,
  margin: 15,
  numLines: 60,
  resolution: 240,
  amplitude: 45,
  noiseScale: 0.012,
};

export function ridgeline(p: RidgelineParams): Path[] {
  const perlin = new Perlin(mulberry32(p.seed >>> 0));

  const x0 = p.margin;
  const x1 = p.width - p.margin;
  const yTop = p.margin;
  const yBottom = p.height - p.margin;
  const res = Math.max(2, Math.floor(p.resolution));
  const lines = Math.max(2, Math.floor(p.numLines));
  const spacing = (yBottom - yTop) / (lines - 1);
  const s = p.noiseScale;

  // Displacement comes from an imported image when one is supplied, otherwise
  // from two octaves of Perlin noise (using the row's baseline as the second
  // coordinate so ridges stay coherent across rows).
  const field = p.field ?? null;
  const heightAt = (x: number, baseY: number): number => {
    if (field) {
      const nx = (x - x0) / (x1 - x0);
      const ny = (baseY - yTop) / (yBottom - yTop);
      let b = field.sample(nx, ny);
      if (p.invert) b = 1 - b;
      return b * p.amplitude;
    }
    const n =
      perlin.noise2(x * s, baseY * s) +
      0.5 * perlin.noise2(x * s * 2.3 + 100, baseY * s * 2.3 + 100);
    return (n / 1.5) * p.amplitude;
  };

  // Skyline: the highest (smallest y) point drawn so far at each column.
  const skyline = new Array<number>(res).fill(Infinity);
  const xs = new Array<number>(res);
  for (let i = 0; i < res; i++) xs[i] = x0 + (i / (res - 1)) * (x1 - x0);

  const paths: Path[] = [];

  // Front (bottom) to back (top): a row is visible only where it rises above
  // everything already drawn in front of it.
  for (let row = lines - 1; row >= 0; row--) {
    const baseY = yTop + row * spacing;
    let run: Path = [];
    for (let i = 0; i < res; i++) {
      const y = baseY - heightAt(xs[i], baseY);
      const visible = y < skyline[i];
      if (visible) {
        run.push([xs[i], y]);
        skyline[i] = y;
      } else if (run.length >= 2) {
        paths.push(run);
        run = [];
      } else {
        run = [];
      }
    }
    if (run.length >= 2) paths.push(run);
  }

  return paths;
}
