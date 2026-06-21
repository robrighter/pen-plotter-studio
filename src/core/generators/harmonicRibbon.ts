import { Path, Point } from "../geometry";
import { mulberry32, randRange } from "../rng";

export interface HarmonicRibbonParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  ribbons: number;
  linesPerRibbon: number;
  length: number;
  ribbonWidth: number;
  amplitude: number;
  twist: number;
  frequency: number;
  rotation: number;
  spread: number;
  phaseDrift: number;
  lineJitter: number;
}

export const harmonicRibbonDefaults: HarmonicRibbonParams = {
  seed: 701,
  width: 210,
  height: 297,
  margin: 15,
  ribbons: 3,
  linesPerRibbon: 120,
  length: 150,
  ribbonWidth: 52,
  amplitude: 24,
  twist: 0.32,
  frequency: 1.15,
  rotation: -18,
  spread: 48,
  phaseDrift: 0.36,
  lineJitter: 0.18,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rotate(point: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [point[0] * c - point[1] * s, point[0] * s + point[1] * c];
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function surfacePoint(
  t: number,
  side: -1 | 1,
  ribbonIndex: number,
  p: HarmonicRibbonParams,
): Point {
  const u = t * 2 - 1;
  const taper = Math.sin(Math.PI * t);
  const phase = ribbonIndex * p.phaseDrift;
  const wave =
    Math.sin((t * p.frequency + phase) * Math.PI * 2) * p.amplitude * taper;
  const secondary =
    Math.sin((t * (p.frequency * 0.55 + 0.35) - phase) * Math.PI * 2) *
    p.amplitude *
    0.34 *
    taper;
  const twist = Math.sin((t + phase) * Math.PI * 2) * p.ribbonWidth * p.twist;
  const edge = side * (p.ribbonWidth * 0.5 + twist);
  const x = u * p.length * 0.5;
  const y = wave + secondary + edge;
  return [x, y];
}

function transform(point: Point, ribbonIndex: number, count: number, p: HarmonicRibbonParams): Point {
  const centeredIndex = ribbonIndex - (count - 1) / 2;
  const extraRotation = centeredIndex * 20;
  const [rx, ry] = rotate(point, p.rotation + extraRotation);
  const cx = p.width / 2 + centeredIndex * p.spread * 0.38;
  const cy = p.height / 2 + centeredIndex * p.spread;
  return [cx + rx, cy + ry];
}

function clampToPaper(path: Path, p: HarmonicRibbonParams): Path {
  const minX = p.margin;
  const maxX = p.width - p.margin;
  const minY = p.margin;
  const maxY = p.height - p.margin;
  return path.map(([x, y]) => [clamp(x, minX, maxX), clamp(y, minY, maxY)]);
}

export function harmonicRibbon(params: HarmonicRibbonParams): Path[] {
  const p = { ...harmonicRibbonDefaults, ...params };
  const rng = mulberry32(p.seed);
  const ribbonCount = Math.max(1, Math.floor(p.ribbons));
  const lines = Math.max(8, Math.floor(p.linesPerRibbon));
  const paths: Path[] = [];

  for (let r = 0; r < ribbonCount; r++) {
    const localPhase = randRange(rng, -0.05, 0.05);
    for (let i = 0; i < lines; i++) {
      const t = lines === 1 ? 0 : i / (lines - 1);
      const eased = smoothstep(t);
      const pairT = clamp((eased + p.twist * 0.35 + localPhase) % 1, 0, 1);
      const jitter = p.lineJitter > 0 ? randRange(rng, -p.lineJitter, p.lineJitter) : 0;

      const a = surfacePoint(t, -1, r, p);
      const b = surfacePoint(pairT, 1, r, p);
      const mid = surfacePoint((t + pairT) * 0.5, t < 0.5 ? 1 : -1, r, p);
      const bow = Math.sin(Math.PI * t) * p.amplitude * 0.32;
      const curve: Path = [];
      const samples = 8;
      for (let s = 0; s <= samples; s++) {
        const q = s / samples;
        const mq = 1 - q;
        const x = mq * mq * a[0] + 2 * mq * q * (mid[0] + jitter) + q * q * b[0];
        const y = mq * mq * a[1] + 2 * mq * q * (mid[1] + bow) + q * q * b[1];
        curve.push(transform([x, y], r, ribbonCount, p));
      }
      paths.push(clampToPaper(curve, p));
    }

    const outlineSteps = 90;
    const upper: Path = [];
    const lower: Path = [];
    for (let i = 0; i <= outlineSteps; i++) {
      const t = i / outlineSteps;
      upper.push(transform(surfacePoint(t, 1, r, p), r, ribbonCount, p));
      lower.push(transform(surfacePoint(t, -1, r, p), r, ribbonCount, p));
    }
    paths.push(clampToPaper(upper, p));
    paths.push(clampToPaper(lower, p));
  }

  return paths;
}
