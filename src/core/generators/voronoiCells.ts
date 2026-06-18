import { Path, Point } from "../geometry";
import { mulberry32, randRange } from "../rng";
import { HeightField, sampleImageField } from "../imageField";

export interface VoronoiCellsParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  points: number;
  relaxationPasses: number;
  drawMode: number;
  jitter: number;
  inset: number;
  noiseWarp: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
}

export const voronoiCellsDefaults: VoronoiCellsParams = {
  seed: 19,
  width: 210,
  height: 297,
  margin: 15,
  points: 90,
  relaxationPasses: 1,
  drawMode: 1,
  jitter: 0.25,
  inset: 0.18,
  noiseWarp: 0.8,
  imageInfluence: 1,
  imageContrast: 1,
};

function clipCell(poly: Point[], site: Point, other: Point): Point[] {
  const mid: Point = [(site[0] + other[0]) / 2, (site[1] + other[1]) / 2];
  const nx = other[0] - site[0];
  const ny = other[1] - site[1];
  const inside = (p: Point) => (p[0] - mid[0]) * nx + (p[1] - mid[1]) * ny <= 0;
  const intersect = (a: Point, b: Point): Point => {
    const da = (a[0] - mid[0]) * nx + (a[1] - mid[1]) * ny;
    const db = (b[0] - mid[0]) * nx + (b[1] - mid[1]) * ny;
    const t = da / (da - db || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = inside(a);
    const bin = inside(b);
    if (ain && bin) out.push(b);
    else if (ain && !bin) out.push(intersect(a, b));
    else if (!ain && bin) out.push(intersect(a, b), b);
  }
  return out;
}

function centroid(poly: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

function cellsForPoints(points: Point[], bounds: [number, number, number, number]): Point[][] {
  const [x0, y0, x1, y1] = bounds;
  const base: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  return points.map((site, i) => {
    let poly = base.slice();
    for (let j = 0; j < points.length && poly.length > 0; j++) {
      if (i !== j) poly = clipCell(poly, site, points[j]);
    }
    return poly;
  });
}

export function voronoiCells(p: VoronoiCellsParams): Path[] {
  const rng = mulberry32(p.seed);
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const targetPoints = Math.max(2, Math.floor(p.points));
  let points: Point[] = [];
  const maxAttempts = targetPoints * 60;
  const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 1));
  for (let attempt = 0; points.length < targetPoints && attempt < maxAttempts; attempt++) {
    const x = randRange(rng, x0, x1);
    const y = randRange(rng, y0, y1);
    const image = sampleImageField(
      p.field,
      (x - x0) / (x1 - x0),
      (y - y0) / (y1 - y0),
      p.invert,
      p.imageContrast,
    );
    const density = image === null ? 1 : 1 * (1 - influence) + image * influence;
    if (rng() < Math.max(0.02, density)) points.push([x, y]);
  }
  while (points.length < targetPoints) points.push([randRange(rng, x0, x1), randRange(rng, y0, y1)]);

  for (let pass = 0; pass < Math.floor(p.relaxationPasses); pass++) {
    const cells = cellsForPoints(points, [x0, y0, x1, y1]);
    points = cells.map((cell, i) => (cell.length >= 3 ? centroid(cell) : points[i]));
  }

  const cells = cellsForPoints(points, [x0, y0, x1, y1]);
  const mode = Math.round(p.drawMode);
  const paths: Path[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.length < 3) continue;
    const c = centroid(cell);
    if (mode === 2) {
      paths.push([points[i], c]);
      continue;
    }
    const inset = mode === 1 ? Math.max(0, Math.min(0.45, p.inset)) : 0;
    const path = cell.map<Point>((pt) => {
      const wx = randRange(rng, -p.noiseWarp, p.noiseWarp) * p.jitter;
      const wy = randRange(rng, -p.noiseWarp, p.noiseWarp) * p.jitter;
      return [pt[0] + (c[0] - pt[0]) * inset + wx, pt[1] + (c[1] - pt[1]) * inset + wy];
    });
    path.push(path[0]);
    paths.push(path);
  }
  return paths;
}
