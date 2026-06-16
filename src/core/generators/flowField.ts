import { Path } from "../geometry";
import { mulberry32, RNG } from "../rng";
import { Perlin } from "../noise";

// Particles are dropped at random and dragged along a Perlin noise field, each
// tracing a polyline until it leaves the page or runs out of steps. This is the
// signature "plotter look".
export interface FlowFieldParams {
  seed: number;
  width: number;
  height: number;
  margin: number;
  numParticles: number;
  /** mm advanced per integration step */
  stepLength: number;
  maxSteps: number;
  /** smaller = larger, smoother swirls */
  noiseScale: number;
  /** how many half-turns the noise maps onto */
  curl: number;
}

export const flowFieldDefaults: FlowFieldParams = {
  seed: 1,
  width: 210,
  height: 297,
  margin: 15,
  numParticles: 400,
  stepLength: 1.5,
  maxSteps: 200,
  noiseScale: 0.008,
  curl: 2.0,
};

export function flowField(p: FlowFieldParams): Path[] {
  const rng: RNG = mulberry32(p.seed);
  // Decorrelate the noise table from the particle placement stream.
  const perlin = new Perlin(mulberry32((p.seed ^ 0x9e3779b9) >>> 0));

  const x0 = p.margin;
  const y0 = p.margin;
  const x1 = p.width - p.margin;
  const y1 = p.height - p.margin;
  const inBounds = (x: number, y: number) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;

  const paths: Path[] = [];
  for (let i = 0; i < p.numParticles; i++) {
    let x = x0 + rng() * (x1 - x0);
    let y = y0 + rng() * (y1 - y0);
    const path: Path = [[x, y]];
    for (let s = 0; s < p.maxSteps; s++) {
      const angle =
        perlin.noise2(x * p.noiseScale, y * p.noiseScale) * Math.PI * p.curl;
      x += Math.cos(angle) * p.stepLength;
      y += Math.sin(angle) * p.stepLength;
      if (!inBounds(x, y)) break;
      path.push([x, y]);
    }
    if (path.length > 2) paths.push(path);
  }
  return paths;
}
