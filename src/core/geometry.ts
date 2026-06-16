// The universal currency of the whole app: everything is polylines (paths)
// expressed in paper-space millimetres, origin at the top-left, Y pointing
// down (the SVG convention). The GCode exporter is the only place that flips
// Y into plotter space.

export type Point = [number, number];

/** A single continuous polyline the pen draws without lifting. */
export type Path = Point[];

export interface Layer {
  name: string;
  /** CSS / SVG colour, also used as the preview stroke and a pen hint. */
  color: string;
  paths: Path[];
}

export interface Drawing {
  /** paper size in millimetres */
  width: number;
  height: number;
  layers: Layer[];
}

export function emptyDrawing(width: number, height: number): Drawing {
  return { width, height, layers: [] };
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function pathsBBox(paths: Path[]): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const path of paths) {
    for (const [x, y] of path) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function pathLength(path: Path): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += dist(path[i - 1], path[i]);
  return len;
}

/** total ink length across every path in the drawing (mm) */
export function drawnLength(drawing: Drawing): number {
  let len = 0;
  for (const layer of drawing.layers)
    for (const path of layer.paths) len += pathLength(path);
  return len;
}

export function countPaths(drawing: Drawing): number {
  let n = 0;
  for (const layer of drawing.layers) n += layer.paths.length;
  return n;
}
