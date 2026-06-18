import { Path, Point, pathLength } from "./geometry";
import { fieldPoint, fieldValue, ScalarField } from "./field";

export interface ContourOptions {
  minPathLength?: number;
  smoothPasses?: number;
}

type Segment = [Point, Point];

function interp(a: Point, b: Point, av: number, bv: number, level: number): Point {
  const t = Math.abs(bv - av) < 1e-9 ? 0.5 : (level - av) / (bv - av);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function key(p: Point): string {
  return `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

function segmentsForCell(field: ScalarField, col: number, row: number, level: number): Segment[] {
  const p0 = fieldPoint(field, col, row);
  const p1 = fieldPoint(field, col + 1, row);
  const p2 = fieldPoint(field, col + 1, row + 1);
  const p3 = fieldPoint(field, col, row + 1);
  const v0 = fieldValue(field, col, row);
  const v1 = fieldValue(field, col + 1, row);
  const v2 = fieldValue(field, col + 1, row + 1);
  const v3 = fieldValue(field, col, row + 1);

  const crossings: Point[] = [];
  if ((v0 < level && v1 >= level) || (v1 < level && v0 >= level)) {
    crossings.push(interp(p0, p1, v0, v1, level));
  }
  if ((v1 < level && v2 >= level) || (v2 < level && v1 >= level)) {
    crossings.push(interp(p1, p2, v1, v2, level));
  }
  if ((v2 < level && v3 >= level) || (v3 < level && v2 >= level)) {
    crossings.push(interp(p2, p3, v2, v3, level));
  }
  if ((v3 < level && v0 >= level) || (v0 < level && v3 >= level)) {
    crossings.push(interp(p3, p0, v3, v0, level));
  }

  if (crossings.length === 2) return [[crossings[0], crossings[1]]];
  if (crossings.length === 4) {
    return [
      [crossings[0], crossings[1]],
      [crossings[2], crossings[3]],
    ];
  }
  return [];
}

function joinSegments(segments: Segment[]): Path[] {
  const paths: Path[] = [];
  const byStart = new Map<string, Segment[]>();
  const byEnd = new Map<string, Segment[]>();

  for (const segment of segments) {
    const startKey = key(segment[0]);
    const endKey = key(segment[1]);
    if (!byStart.has(startKey)) byStart.set(startKey, []);
    if (!byEnd.has(endKey)) byEnd.set(endKey, []);
    byStart.get(startKey)!.push(segment);
    byEnd.get(endKey)!.push(segment);
  }

  const used = new Set<Segment>();
  for (const segment of segments) {
    if (used.has(segment)) continue;
    used.add(segment);
    const path: Path = [segment[0], segment[1]];

    let extended = true;
    while (extended) {
      extended = false;
      const tail = path[path.length - 1];
      const candidates = byStart.get(key(tail)) ?? [];
      for (const next of candidates) {
        if (used.has(next)) continue;
        used.add(next);
        path.push(next[1]);
        extended = true;
        break;
      }
    }

    extended = true;
    while (extended) {
      extended = false;
      const head = path[0];
      const candidates = byEnd.get(key(head)) ?? [];
      for (const prev of candidates) {
        if (used.has(prev)) continue;
        used.add(prev);
        path.unshift(prev[0]);
        extended = true;
        break;
      }
    }

    if (path.length >= 2) {
      if (path.length > 3 && samePoint(path[0], path[path.length - 1])) {
        path[path.length - 1] = path[0];
      }
      paths.push(path);
    }
  }

  return paths;
}

export function smoothPath(path: Path, passes: number): Path {
  let current = path;
  const closed = current.length > 3 && samePoint(current[0], current[current.length - 1]);
  for (let pass = 0; pass < passes; pass++) {
    if (current.length < 3) return current;
    const next: Path = [];
    const limit = closed ? current.length - 1 : current.length - 1;
    if (!closed) next.push(current[0]);
    for (let i = 0; i < limit; i++) {
      const a = current[i];
      const b = current[(i + 1) % current.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (closed) next.push(next[0]);
    else next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

export function filterAndSmooth(paths: Path[], options: ContourOptions = {}): Path[] {
  const minLen = options.minPathLength ?? 2;
  const smoothPasses = Math.max(0, Math.floor(options.smoothPasses ?? 0));
  return paths
    .map((path) => (smoothPasses > 0 ? smoothPath(path, smoothPasses) : path))
    .filter((path) => path.length >= 2 && pathLength(path) >= minLen);
}

export function contours(
  field: ScalarField,
  levels: number[],
  options: ContourOptions = {},
): Path[] {
  const all: Path[] = [];
  for (const level of levels) {
    const segments: Segment[] = [];
    for (let row = 0; row < field.rows - 1; row++) {
      for (let col = 0; col < field.cols - 1; col++) {
        segments.push(...segmentsForCell(field, col, row, level));
      }
    }
    all.push(...joinSegments(segments));
  }
  return filterAndSmooth(all, options);
}

export function evenlySpacedLevels(count: number, min: number, max: number): number[] {
  const n = Math.max(1, Math.floor(count));
  if (n === 1) return [(min + max) / 2];
  const levels: number[] = [];
  for (let i = 0; i < n; i++) {
    levels.push(min + (i / (n - 1)) * (max - min));
  }
  return levels;
}
