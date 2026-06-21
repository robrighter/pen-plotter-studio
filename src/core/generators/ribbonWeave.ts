import { Layer, Path, Point } from "../geometry";
import { mulberry32, randRange } from "../rng";

export interface RibbonWeaveParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  trackCount: number;
  spacing: number;
  loopScale: number;
  bend: number;
  hatchSpacing: number;
  hatchWidth: number;
  hatchHeight: number;
  lineJitter: number;
}

export const ribbonWeaveDefaults: RibbonWeaveParams = {
  seed: 302,
  width: 210,
  height: 297,
  margin: 15,
  trackCount: 28,
  spacing: 1.55,
  loopScale: 1,
  bend: 0.55,
  hatchSpacing: 1.5,
  hatchWidth: 104,
  hatchHeight: 172,
  lineJitter: 0.18,
};

const palette = ["#101820", "#b84a3a", "#d98d24", "#2f6f5b", "#1f6f96", "#6f3d63"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pointOnCubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const mt = 1 - t;
  const x =
    mt * mt * mt * a[0] +
    3 * mt * mt * t * b[0] +
    3 * mt * t * t * c[0] +
    t * t * t * d[0];
  const y =
    mt * mt * mt * a[1] +
    3 * mt * mt * t * b[1] +
    3 * mt * t * t * c[1] +
    t * t * t * d[1];
  return [x, y];
}

function roundedCapsule(cx: number, cy: number, w: number, h: number, steps = 24): Path {
  const path: Path = [];
  if (w >= h) {
    const r = h / 2;
    const left = cx - w / 2 + r;
    const right = cx + w / 2 - r;
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / steps;
      path.push([right + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / steps;
      path.push([left + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  } else {
    const r = w / 2;
    const top = cy - h / 2 + r;
    const bottom = cy + h / 2 - r;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI + (Math.PI * i) / steps;
      path.push([cx + Math.cos(a) * r, top + Math.sin(a) * r]);
    }
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI * i) / steps;
      path.push([cx + Math.cos(a) * r, bottom + Math.sin(a) * r]);
    }
  }
  path.push(path[0]);
  return path;
}

function offsetCubicRibbon(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
  offset: number,
  jitter: number,
  rng: () => number,
  samples = 90,
): Path {
  const base: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    base.push(pointOnCubic(a, b, c, d, i / samples));
  }

  return base.map((p, i) => {
    const prev = base[Math.max(0, i - 1)];
    const next = base[Math.min(base.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const wobble = jitter > 0 ? randRange(rng, -jitter, jitter) : 0;
    return [p[0] + (-dy / len) * (offset + wobble), p[1] + (dx / len) * (offset + wobble)];
  });
}

function addPath(groups: Path[][], path: Path, index: number): void {
  groups[index % groups.length].push(path);
}

export function ribbonWeaveLayers(
  params: RibbonWeaveParams,
  firstColor = palette[0],
): Layer[] {
  const p = { ...ribbonWeaveDefaults, ...params };
  const rng = mulberry32(p.seed);
  const cx = p.width / 2;
  const cy = p.height / 2;
  const scale = clamp(p.loopScale, 0.55, 1.35);
  const trackCount = Math.max(6, Math.floor(p.trackCount));
  const spacing = Math.max(0.45, p.spacing);
  const half = (trackCount - 1) / 2;
  const jitter = Math.max(0, p.lineJitter);
  const colors = [firstColor, ...palette.slice(1)];
  const groups = colors.map(() => [] as Path[]);
  const hatch: Path[] = [];

  const hatchW = clamp(p.hatchWidth, 20, p.width - p.margin * 2);
  const hatchH = clamp(p.hatchHeight, 20, p.height - p.margin * 2);
  const hx0 = clamp(cx - 4, p.margin, p.width - p.margin - hatchW);
  const hy0 = clamp(cy - hatchH * 0.34, p.margin, p.height - p.margin - hatchH);
  const hatchStep = Math.max(0.7, p.hatchSpacing);
  for (let x = hx0; x <= hx0 + hatchW; x += hatchStep) {
    hatch.push([
      [x, hy0],
      [x, hy0 + hatchH],
    ]);
  }

  for (let i = 0; i < trackCount; i++) {
    const inset = i * spacing;
    const colorIndex = i % groups.length;
    const topW = 78 * scale - inset * 1.15;
    const topH = 138 * scale - inset * 1.15;
    const bottomW = 166 * scale - inset * 1.1;
    const bottomH = 74 * scale - inset * 1.1;

    if (topW > 10 && topH > topW + 6) {
      addPath(groups, roundedCapsule(cx - 15 * scale, cy - 48 * scale, topW, topH, 28), colorIndex);
    }
    if (bottomW > bottomH + 6 && bottomH > 10) {
      addPath(groups, roundedCapsule(cx + 6 * scale, cy + 52 * scale, bottomW, bottomH, 32), colorIndex + 2);
    }
  }

  for (let i = 0; i < trackCount; i++) {
    const offset = (i - half) * spacing;
    const colorIndex = i % groups.length;
    addPath(
      groups,
      offsetCubicRibbon(
        [cx - 82 * scale, cy + 40 * scale],
        [cx - 36 * scale, cy - 8 * scale],
        [cx + (28 + p.bend * 22) * scale, cy + 115 * scale],
        [cx + 80 * scale, cy + 34 * scale],
        offset,
        jitter,
        rng,
      ),
      colorIndex + 1,
    );
    addPath(
      groups,
      offsetCubicRibbon(
        [cx - 42 * scale, cy - 18 * scale],
        [cx + (8 + p.bend * 34) * scale, cy - 16 * scale],
        [cx + 92 * scale, cy - 82 * scale],
        [cx + 48 * scale, cy - 2 * scale],
        offset * 0.8,
        jitter,
        rng,
        70,
      ),
      colorIndex + 3,
    );
  }

  return [
    { name: "Background hatch", color: "#b85b4a", paths: hatch },
    ...colors.map((color, i) => ({
      name: `Ribbon pen ${i + 1}`,
      color,
      paths: groups[i],
    })),
  ].filter((layer) => layer.paths.length > 0);
}

export function ribbonWeave(params: RibbonWeaveParams): Path[] {
  return ribbonWeaveLayers(params).flatMap((layer) => layer.paths);
}
