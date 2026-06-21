import { Drawing, Layer, Path } from "./core/geometry";
import { optimizePaths } from "./core/optimize";
import { HeightField, ImageFieldData, heightFieldFromData } from "./core/imageField";
import { flowField, flowFieldDefaults } from "./core/generators/flowField";
import { hilbert, hilbertDefaults } from "./core/generators/spaceFilling";
import { tsp, tspDefaults } from "./core/generators/tsp";
import { ridgeline, ridgelineDefaults } from "./core/generators/ridgeline";
import { reactionDiffusion, reactionDiffusionDefaults } from "./core/generators/reactionDiffusion";
import { topographic, topographicDefaults } from "./core/generators/topographic";
import { differentialGrowth, differentialGrowthDefaults } from "./core/generators/differentialGrowth";
import { voronoiCells, voronoiCellsDefaults } from "./core/generators/voronoiCells";
import { streamlines, streamlinesDefaults } from "./core/generators/streamlines";
import { phyllotaxis, phyllotaxisDefaults } from "./core/generators/phyllotaxis";
import { spaceColonization, spaceColonizationDefaults } from "./core/generators/spaceColonization";
import { waveInterference, waveInterferenceDefaults } from "./core/generators/waveInterference";
import { metaballs, metaballsDefaults } from "./core/generators/metaballs";
import { hatching, hatchingDefaults } from "./core/generators/hatching";
import { ribbonWeave, ribbonWeaveDefaults, ribbonWeaveLayers } from "./core/generators/ribbonWeave";
import { harmonicRibbon, harmonicRibbonDefaults } from "./core/generators/harmonicRibbon";

interface GenerateRequest {
  jobId: number;
  generatorId: string;
  label: string;
  color: string;
  params: Record<string, number>;
  paper: { width: number; height: number; margin: number };
  imageFieldData: ImageFieldData | null;
  imageInvert: boolean;
  optimize: boolean;
}

interface GenerateResponse {
  jobId: number;
  ok: boolean;
  drawing?: Drawing;
  travelBefore?: number;
  travelAfter?: number;
  durationMs?: number;
  error?: string;
}

function runGenerator(request: GenerateRequest, field: HeightField | null): Path[] {
  const base = {
    ...request.params,
    width: request.paper.width,
    height: request.paper.height,
    margin: request.paper.margin,
    field,
    invert: request.imageInvert,
  };

  switch (request.generatorId) {
    case "flow":
      return flowField({ ...flowFieldDefaults, ...base });
    case "hilbert":
      return hilbert({ ...hilbertDefaults, ...base });
    case "tsp":
      return tsp({ ...tspDefaults, ...base });
    case "ridgeline":
      return ridgeline({ ...ridgelineDefaults, ...base });
    case "reaction":
      return reactionDiffusion({ ...reactionDiffusionDefaults, ...base });
    case "topographic":
      return topographic({ ...topographicDefaults, ...base });
    case "growth":
      return differentialGrowth({ ...differentialGrowthDefaults, ...base });
    case "voronoi":
      return voronoiCells({ ...voronoiCellsDefaults, ...base });
    case "streamlines":
      return streamlines({ ...streamlinesDefaults, ...base });
    case "phyllotaxis":
      return phyllotaxis({ ...phyllotaxisDefaults, ...base });
    case "branching":
      return spaceColonization({ ...spaceColonizationDefaults, ...base });
    case "waves":
      return waveInterference({ ...waveInterferenceDefaults, ...base });
    case "metaballs":
      return metaballs({ ...metaballsDefaults, ...base });
    case "hatching":
      return hatching({ ...hatchingDefaults, ...base });
    case "ribbon":
      return ribbonWeave({ ...ribbonWeaveDefaults, ...base });
    case "harmonic-ribbon":
      return harmonicRibbon({ ...harmonicRibbonDefaults, ...base });
    default:
      throw new Error(`Unknown generator: ${request.generatorId}`);
  }
}

function optimizeLayers(layers: Layer[]): { layers: Layer[]; travelBefore: number; travelAfter: number } {
  let travelBefore = 0;
  let travelAfter = 0;
  const optimizedLayers = layers.map((layer) => {
    const optimized = optimizePaths(layer.paths);
    travelBefore += optimized.travelBefore;
    travelAfter += optimized.travelAfter;
    return { ...layer, paths: optimized.paths };
  });
  return { layers: optimizedLayers, travelBefore, travelAfter };
}

self.onmessage = (event: MessageEvent<GenerateRequest>) => {
  const request = event.data;
  const started = performance.now();
  try {
    const field = request.imageFieldData ? heightFieldFromData(request.imageFieldData) : null;
    let travelBefore = 0;
    let travelAfter = 0;
    let drawing: Drawing;

    if (request.generatorId === "ribbon") {
      let layers = ribbonWeaveLayers(
        {
          ...ribbonWeaveDefaults,
          ...request.params,
          width: request.paper.width,
          height: request.paper.height,
          margin: request.paper.margin,
        },
        request.color,
      );
      if (request.optimize) {
        const optimized = optimizeLayers(layers);
        layers = optimized.layers;
        travelBefore = optimized.travelBefore;
        travelAfter = optimized.travelAfter;
      }
      drawing = {
        width: request.paper.width,
        height: request.paper.height,
        layers,
      };
    } else {
      let paths = runGenerator(request, field);

      if (request.optimize) {
        const optimized = optimizePaths(paths);
        paths = optimized.paths;
        travelBefore = optimized.travelBefore;
        travelAfter = optimized.travelAfter;
      }

      drawing = {
        width: request.paper.width,
        height: request.paper.height,
        layers: [{ name: request.label, color: request.color, paths }],
      };
    }

    const response: GenerateResponse = {
      jobId: request.jobId,
      ok: true,
      drawing,
      travelBefore,
      travelAfter,
      durationMs: performance.now() - started,
    };
    self.postMessage(response);
  } catch (error) {
    const response: GenerateResponse = {
      jobId: request.jobId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: performance.now() - started,
    };
    self.postMessage(response);
  }
};
