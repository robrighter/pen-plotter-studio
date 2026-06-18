import { Path, Point } from "../geometry";
import { mulberry32, randRange } from "../rng";
import { HeightField, sampleImageField } from "../imageField";

export interface SpaceColonizationParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  attractorCount: number;
  startMode: number;
  growthStep: number;
  attractionRadius: number;
  killRadius: number;
  branchJitter: number;
  gravity: number;
  maxIterations: number;
  field?: HeightField | null;
  invert?: boolean;
  imageInfluence?: number;
  imageContrast?: number;
}

export const spaceColonizationDefaults: SpaceColonizationParams = {
  seed: 101,
  width: 210,
  height: 297,
  margin: 15,
  attractorCount: 650,
  startMode: 0,
  growthStep: 2.2,
  attractionRadius: 24,
  killRadius: 4,
  branchJitter: 0.12,
  gravity: -0.15,
  maxIterations: 600,
  imageInfluence: 1,
  imageContrast: 1.2,
};

interface BranchNode {
  p: Point;
  parent: number;
}

function normalize(x: number, y: number): Point {
  const d = Math.hypot(x, y) || 1;
  return [x / d, y / d];
}

function nearestPair(nodes: BranchNode[], attractors: Point[]): [number, Point] | null {
  let bestNode = -1;
  let bestAttractor: Point | null = null;
  let bestDist = Infinity;
  for (let n = 0; n < nodes.length; n++) {
    for (const attractor of attractors) {
      const d = Math.hypot(attractor[0] - nodes[n].p[0], attractor[1] - nodes[n].p[1]);
      if (d < bestDist) {
        bestDist = d;
        bestNode = n;
        bestAttractor = attractor;
      }
    }
  }
  return bestNode >= 0 && bestAttractor ? [bestNode, bestAttractor] : null;
}

export function spaceColonization(p: SpaceColonizationParams): Path[] {
  const rng = mulberry32(p.seed);
  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const attractors: Point[] = [];
  const targetAttractors = Math.floor(p.attractorCount);
  const maxAttempts = targetAttractors * 80;
  for (let i = 0, attempts = 0; i < targetAttractors && attempts < maxAttempts; attempts++) {
    const rx = randRange(rng, -1, 1);
    const ry = randRange(rng, -1, 1);
    if (rx * rx + ry * ry > 1) {
      continue;
    }
    const x = cx + rx * (x1 - x0) * 0.45;
    const y = cy + ry * (y1 - y0) * 0.45;
    const image = sampleImageField(
      p.field,
      (x - x0) / (x1 - x0),
      (y - y0) / (y1 - y0),
      p.invert,
      p.imageContrast,
    );
    const influence = Math.max(0, Math.min(1, p.imageInfluence ?? 1));
    const density = image === null ? 1 : 1 * (1 - influence) + image * influence;
    if (rng() < Math.max(0.02, density)) {
      attractors.push([x, y]);
      i++;
    }
  }
  while (attractors.length < Math.max(8, targetAttractors * 0.12)) {
    attractors.push([randRange(rng, x0, x1), randRange(rng, y0, y1)]);
  }

  const mode = Math.round(p.startMode);
  const nodes: BranchNode[] =
    mode === 1
      ? [{ p: [cx, cy], parent: -1 }]
      : mode === 2
        ? [
            { p: [x0, cy], parent: -1 },
            { p: [x1, cy], parent: -1 },
          ]
        : [{ p: [cx, y1], parent: -1 }];

  for (let iter = 0; iter < p.maxIterations && attractors.length > 0; iter++) {
    const assignments = new Map<number, Point[]>();
    for (let i = attractors.length - 1; i >= 0; i--) {
      const a = attractors[i];
      let best = -1;
      let bestDist = Infinity;
      for (let n = 0; n < nodes.length; n++) {
        const d = Math.hypot(a[0] - nodes[n].p[0], a[1] - nodes[n].p[1]);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      }
      if (bestDist < p.killRadius) {
        attractors.splice(i, 1);
      } else if (bestDist < p.attractionRadius && best >= 0) {
        if (!assignments.has(best)) assignments.set(best, []);
        assignments.get(best)!.push(a);
      }
    }

    if (assignments.size === 0) {
      const pair = nearestPair(nodes, attractors);
      if (!pair) break;
      assignments.set(pair[0], [pair[1]]);
    }
    for (const [nodeIndex, assigned] of assignments) {
      const node = nodes[nodeIndex];
      let vx = 0;
      let vy = p.gravity;
      for (const a of assigned) {
        const dir = normalize(a[0] - node.p[0], a[1] - node.p[1]);
        vx += dir[0];
        vy += dir[1];
      }
      vx += randRange(rng, -p.branchJitter, p.branchJitter);
      vy += randRange(rng, -p.branchJitter, p.branchJitter);
      const dir = normalize(vx, vy);
      const next: Point = [
        Math.max(x0, Math.min(x1, node.p[0] + dir[0] * p.growthStep)),
        Math.max(y0, Math.min(y1, node.p[1] + dir[1] * p.growthStep)),
      ];
      nodes.push({ p: next, parent: nodeIndex });
    }
  }

  const paths: Path[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const parent = nodes[i].parent;
    if (parent >= 0) paths.push([nodes[parent].p, nodes[i].p]);
  }
  return paths;
}
