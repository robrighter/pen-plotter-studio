import { Path, Point } from "../geometry";
import { mulberry32, randRange } from "../rng";
import { HeightField, sampleImageField } from "../imageField";

export interface PhyllotaxisParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  points: number;
  angleDegrees: number;
  radialScale: number;
  markMode: number;
  markSize: number;
  noiseWarp: number;
  ellipseRatio: number;
  rotation: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
}

export const phyllotaxisDefaults: PhyllotaxisParams = {
  seed: 144,
  width: 210,
  height: 297,
  margin: 15,
  points: 900,
  angleDegrees: 137.507764,
  radialScale: 2.4,
  markMode: 1,
  markSize: 1.4,
  noiseWarp: 0.2,
  ellipseRatio: 1,
  rotation: 0,
  imageInfluence: 1,
  imageContrast: 1,
};

function circlePath(center: Point, r: number, segments = 12): Path {
  const path: Path = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    path.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r]);
  }
  return path;
}

export function phyllotaxis(p: PhyllotaxisParams): Path[] {
  const rng = mulberry32(p.seed);
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const maxR = Math.min(x1 - x0, y1 - y0) / 2;
  const rot = (p.rotation * Math.PI) / 180;
  const angleStep = (p.angleDegrees * Math.PI) / 180;
  const n = Math.max(2, Math.floor(p.points));
  const mode = Math.round(p.markMode);
  const pts: Array<{ pt: Point; tone: number }> = [];

  for (let i = 0; i < n; i++) {
    const a = i * angleStep + rot;
    const r = Math.sqrt(i / Math.max(1, n - 1)) * maxR * (p.radialScale / 3);
    const warp = randRange(rng, -p.noiseWarp, p.noiseWarp);
    const x = cx + Math.cos(a) * (r + warp);
    const y = cy + Math.sin(a) * (r * p.ellipseRatio + warp);
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
      const image = sampleImageField(
        p.field,
        (x - x0) / (x1 - x0),
        (y - y0) / (y1 - y0),
        p.invert,
        p.imageContrast,
      );
      const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 1));
      const tone = image === null ? 1 : 1 * (1 - influence) + image * influence;
      if (image === null || rng() < Math.max(0.04, tone)) pts.push({ pt: [x, y], tone });
    }
  }

  if (mode === 0) return pts.map(({ pt, tone }) => circlePath(pt, p.markSize * (0.25 + tone * 0.6), 9));
  if (mode === 2) {
    const paths: Path[] = [];
    const skips = [13, 21, 34];
    for (const skip of skips) {
      for (let start = 0; start < Math.min(skip, pts.length); start++) {
        const path: Path = [];
        for (let i = start; i < pts.length; i += skip) path.push(pts[i].pt);
        if (path.length > 2) paths.push(path);
      }
    }
    return paths;
  }

  return pts.map(({ pt, tone }, i) => {
    const a = i * angleStep + rot + Math.PI / 2;
    const len = p.markSize * (0.35 + tone) * randRange(rng, 0.7, 1.4);
    return [
      [pt[0] - Math.cos(a) * len, pt[1] - Math.sin(a) * len],
      [pt[0] + Math.cos(a) * len, pt[1] + Math.sin(a) * len],
    ];
  });
}
