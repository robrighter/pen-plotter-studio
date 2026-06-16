import { Path, Point, dist } from "./geometry";

// Reorder paths to minimise the distance the pen travels while lifted. A greedy
// nearest-neighbour walk over path endpoints, allowing each path to be drawn in
// reverse if that end is closer. Cheap and dramatically cuts plot time.

export interface OptimizeResult {
  paths: Path[];
  travelBefore: number;
  travelAfter: number;
}

function totalTravel(paths: Path[], start: Point): number {
  let travel = 0;
  let cur = start;
  for (const path of paths) {
    if (path.length === 0) continue;
    travel += dist(cur, path[0]);
    cur = path[path.length - 1];
  }
  return travel;
}

export function optimizePaths(paths: Path[], start: Point = [0, 0]): OptimizeResult {
  const usable = paths.filter((p) => p.length > 0);
  const travelBefore = totalTravel(usable, start);

  const used = new Uint8Array(usable.length);
  const result: Path[] = [];
  let cur = start;

  for (let k = 0; k < usable.length; k++) {
    let best = -1;
    let bestDist = Infinity;
    let reverse = false;
    for (let i = 0; i < usable.length; i++) {
      if (used[i]) continue;
      const path = usable[i];
      const dStart = dist(cur, path[0]);
      const dEnd = dist(cur, path[path.length - 1]);
      if (dStart < bestDist) {
        bestDist = dStart;
        best = i;
        reverse = false;
      }
      if (dEnd < bestDist) {
        bestDist = dEnd;
        best = i;
        reverse = true;
      }
    }
    if (best < 0) break;
    used[best] = 1;
    const chosen = reverse ? usable[best].slice().reverse() : usable[best];
    result.push(chosen);
    cur = chosen[chosen.length - 1];
  }

  return { paths: result, travelBefore, travelAfter: totalTravel(result, start) };
}
