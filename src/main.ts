import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Drawing, Path, countPaths, drawnLength } from "./core/geometry";
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
import { ribbonWeave, ribbonWeaveDefaults } from "./core/generators/ribbonWeave";
import { harmonicRibbon, harmonicRibbonDefaults } from "./core/generators/harmonicRibbon";
import { toSVG } from "./core/svg";
import { MachineProfile, defaultProfile, toGCode } from "./core/gcode";
import { renderPreview } from "./ui/preview";
import {
  checkControl,
  colorControl,
  numberControl,
  selectControl,
  textControl,
  toggleControl,
} from "./ui/controls";
import {
  HeightField,
  ImageFieldData,
  heightFieldFromData,
  imageFieldDataFromImageData,
} from "./core/imageField";

// --- Generator registry --------------------------------------------------

/** Numeric slider — the default control when `kind` is omitted. `randomize`
 *  optionally narrows the range "Surprise me" draws from (defaults to min/max). */
interface NumberParamDef {
  kind?: "number";
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  randomize?: [number, number];
}

/** Discrete choice rendered as a dropdown. Value stays numeric. */
interface SelectParamDef {
  kind: "select";
  key: string;
  label: string;
  options: { label: string; value: number }[];
}

/** On/off switch. Value is 0 or 1. */
interface ToggleParamDef {
  kind: "toggle";
  key: string;
  label: string;
}

type ParamDef = NumberParamDef | SelectParamDef | ToggleParamDef;

/** A named snapshot of param values applied on top of the current ones. */
interface GeneratorPreset {
  name: string;
  values: Record<string, number>;
}

interface GeneratorDef {
  id: string;
  label: string;
  color: string;
  /** generator-specific defaults (paper size/margin are injected globally) */
  defaults: Record<string, number>;
  params: ParamDef[];
  run: (params: Record<string, number>) => Path[];
  /** keys whose "Randomize seed" button should re-roll */
  seedKey?: string;
  /** generator can be driven by an imported image heightfield */
  usesImage?: boolean;
  /** curated "looks" the user can jump to from the preset dropdown */
  presets?: GeneratorPreset[];
  /** keys "Surprise me" should leave untouched (e.g. resolution/grid budgets) */
  lockRandom?: string[];
}

interface ProjectPaper {
  width?: number;
  height?: number;
  margin?: number;
}

interface ProjectFile {
  documentName?: string;
  paper?: ProjectPaper;
  generator?: {
    id?: string;
    params?: Record<string, unknown>;
    color?: string;
  };
  colors?: {
    paper?: string;
    pensByGenerator?: Record<string, string>;
  };
  image?: {
    name?: string;
    dataUrl?: string;
    invert?: boolean;
  } | null;
  output?: {
    optimizeTravel?: boolean;
    showTravel?: boolean;
  };
  machineProfile?: Partial<MachineProfile>;
}

interface GenerateWorkerResponse {
  jobId: number;
  ok: boolean;
  drawing?: Drawing;
  travelBefore?: number;
  travelAfter?: number;
  durationMs?: number;
  error?: string;
}

const generators: GeneratorDef[] = [
  {
    id: "flow",
    label: "Flow Field",
    color: "#1a1a1a",
    defaults: {
      seed: flowFieldDefaults.seed,
      numParticles: flowFieldDefaults.numParticles,
      stepLength: flowFieldDefaults.stepLength,
      maxSteps: flowFieldDefaults.maxSteps,
      noiseScale: flowFieldDefaults.noiseScale,
      curl: flowFieldDefaults.curl,
      imageInfluence: flowFieldDefaults.imageInfluence ?? 0.75,
      imageContrast: flowFieldDefaults.imageContrast ?? 1.35,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "numParticles", label: "Particles", min: 10, max: 3000, step: 10 },
      { key: "stepLength", label: "Step length (mm)", min: 0.2, max: 5, step: 0.1 },
      { key: "maxSteps", label: "Max steps", min: 10, max: 1000, step: 10 },
      { key: "noiseScale", label: "Noise scale", min: 0.001, max: 0.05, step: 0.001 },
      { key: "curl", label: "Curl", min: 0.5, max: 6, step: 0.1 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["numParticles", "maxSteps"],
    presets: [
      { name: "Wispy threads", values: { numParticles: 400, stepLength: 1.5, maxSteps: 420, noiseScale: 0.006, curl: 2 } },
      { name: "Dense weave", values: { numParticles: 1600, stepLength: 0.8, maxSteps: 300, noiseScale: 0.012, curl: 3 } },
      { name: "Bold swirls", values: { numParticles: 220, stepLength: 2.6, maxSteps: 600, noiseScale: 0.004, curl: 4.5 } },
    ],
    run: (p) =>
      flowField({
        ...flowFieldDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "hilbert",
    label: "Hilbert Curve",
    color: "#0b3d91",
    defaults: { order: hilbertDefaults.order },
    params: [{ key: "order", label: "Order (1-8)", min: 1, max: 8, step: 1 }],
    run: (p) =>
      hilbert({
        ...hilbertDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
      }),
  },
  {
    id: "tsp",
    label: "TSP / Stipple",
    color: "#1a1a1a",
    defaults: {
      seed: tspDefaults.seed,
      numPoints: tspDefaults.numPoints,
      densityScale: tspDefaults.densityScale,
      twoOptPasses: tspDefaults.twoOptPasses,
      imageInfluence: tspDefaults.imageInfluence ?? 1,
      imageContrast: tspDefaults.imageContrast ?? 1,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "numPoints", label: "Points", min: 100, max: 4000, step: 50 },
      { key: "densityScale", label: "Density scale", min: 0.002, max: 0.05, step: 0.001 },
      { key: "twoOptPasses", label: "2-opt passes", min: 0, max: 6, step: 1 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["numPoints", "twoOptPasses"],
    run: (p) =>
      tsp({
        ...tspDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "ridgeline",
    label: "Ridgeline (Joy Division)",
    color: "#d6336c",
    defaults: {
      seed: ridgelineDefaults.seed,
      numLines: ridgelineDefaults.numLines,
      resolution: ridgelineDefaults.resolution,
      amplitude: ridgelineDefaults.amplitude,
      noiseScale: ridgelineDefaults.noiseScale,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "numLines", label: "Lines", min: 5, max: 200, step: 1 },
      { key: "resolution", label: "Resolution", min: 40, max: 600, step: 10 },
      { key: "amplitude", label: "Amplitude (mm)", min: 0, max: 120, step: 1 },
      { key: "noiseScale", label: "Noise scale", min: 0.002, max: 0.05, step: 0.001 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["resolution"],
    presets: [
      { name: "Joy Division", values: { numLines: 60, resolution: 280, amplitude: 45, noiseScale: 0.02 } },
      { name: "Calm hills", values: { numLines: 28, resolution: 220, amplitude: 18, noiseScale: 0.01 } },
      { name: "Jagged peaks", values: { numLines: 110, resolution: 360, amplitude: 95, noiseScale: 0.035 } },
    ],
    run: (p) =>
      ridgeline({
        ...ridgelineDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "reaction",
    label: "Reaction Diffusion",
    color: "#7c3aed",
    defaults: {
      seed: reactionDiffusionDefaults.seed,
      gridSize: reactionDiffusionDefaults.gridSize,
      iterations: reactionDiffusionDefaults.iterations,
      feed: reactionDiffusionDefaults.feed,
      kill: reactionDiffusionDefaults.kill,
      levels: reactionDiffusionDefaults.levels,
      thresholdMin: reactionDiffusionDefaults.thresholdMin,
      thresholdMax: reactionDiffusionDefaults.thresholdMax,
      smoothing: reactionDiffusionDefaults.smoothing,
      imageInfluence: reactionDiffusionDefaults.imageInfluence ?? 0.7,
      imageContrast: reactionDiffusionDefaults.imageContrast ?? 1.4,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "gridSize", label: "Grid size", min: 60, max: 190, step: 10 },
      { key: "iterations", label: "Iterations", min: 200, max: 4000, step: 100 },
      { key: "feed", label: "Feed", min: 0.01, max: 0.09, step: 0.001 },
      { key: "kill", label: "Kill", min: 0.03, max: 0.09, step: 0.001 },
      { key: "levels", label: "Contour levels", min: 1, max: 12, step: 1 },
      { key: "thresholdMin", label: "Threshold min", min: 0.02, max: 0.8, step: 0.01 },
      { key: "thresholdMax", label: "Threshold max", min: 0.05, max: 0.95, step: 0.01 },
      { key: "smoothing", label: "Smoothing", min: 0, max: 2, step: 1 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["gridSize", "iterations"],
    run: (p) =>
      reactionDiffusion({
        ...reactionDiffusionDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        diffusionA: reactionDiffusionDefaults.diffusionA,
        diffusionB: reactionDiffusionDefaults.diffusionB,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "topographic",
    label: "Contour / Topographic Map",
    color: "#2f6f4e",
    defaults: {
      seed: topographicDefaults.seed,
      gridSize: topographicDefaults.gridSize,
      levels: topographicDefaults.levels,
      noiseScale: topographicDefaults.noiseScale,
      octaves: topographicDefaults.octaves,
      persistence: topographicDefaults.persistence,
      lacunarity: topographicDefaults.lacunarity,
      ridgeStrength: topographicDefaults.ridgeStrength,
      islandFalloff: topographicDefaults.islandFalloff,
      smoothing: topographicDefaults.smoothing,
      imageInfluence: topographicDefaults.imageInfluence ?? 1,
      imageContrast: topographicDefaults.imageContrast ?? 1,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "gridSize", label: "Grid size", min: 60, max: 260, step: 10 },
      { key: "levels", label: "Contour levels", min: 2, max: 32, step: 1 },
      { key: "noiseScale", label: "Noise scale", min: 0.002, max: 0.05, step: 0.001 },
      { key: "octaves", label: "Octaves", min: 1, max: 7, step: 1 },
      { key: "persistence", label: "Persistence", min: 0.2, max: 0.9, step: 0.05 },
      { key: "lacunarity", label: "Lacunarity", min: 1.2, max: 3.5, step: 0.1 },
      { key: "ridgeStrength", label: "Ridge strength", min: 0, max: 1.5, step: 0.05 },
      { key: "islandFalloff", label: "Island falloff", min: 0, max: 1.5, step: 0.05 },
      { key: "smoothing", label: "Smoothing", min: 0, max: 2, step: 1 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["gridSize"],
    presets: [
      { name: "Rolling terrain", values: { levels: 14, noiseScale: 0.012, octaves: 4, persistence: 0.5, lacunarity: 2, ridgeStrength: 0, islandFalloff: 0.3, smoothing: 1 } },
      { name: "Sharp ridges", values: { levels: 20, noiseScale: 0.02, octaves: 5, persistence: 0.6, lacunarity: 2.4, ridgeStrength: 1.1, islandFalloff: 0, smoothing: 0 } },
      { name: "Lone island", values: { levels: 12, noiseScale: 0.01, octaves: 4, persistence: 0.45, lacunarity: 2, ridgeStrength: 0.3, islandFalloff: 1.2, smoothing: 1 } },
    ],
    run: (p) =>
      topographic({
        ...topographicDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "growth",
    label: "Differential Growth",
    color: "#111827",
    defaults: {
      seed: differentialGrowthDefaults.seed,
      iterations: differentialGrowthDefaults.iterations,
      initialPoints: differentialGrowthDefaults.initialPoints,
      maxPoints: differentialGrowthDefaults.maxPoints,
      repulsionRadius: differentialGrowthDefaults.repulsionRadius,
      repulsionStrength: differentialGrowthDefaults.repulsionStrength,
      splitLength: differentialGrowthDefaults.splitLength,
      smoothing: differentialGrowthDefaults.smoothing,
      boundsForce: differentialGrowthDefaults.boundsForce,
      historyEvery: differentialGrowthDefaults.historyEvery,
      imageInfluence: differentialGrowthDefaults.imageInfluence ?? 0.7,
      imageContrast: differentialGrowthDefaults.imageContrast ?? 1.4,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "iterations", label: "Iterations", min: 50, max: 1200, step: 25 },
      { key: "initialPoints", label: "Initial points", min: 12, max: 160, step: 4 },
      { key: "maxPoints", label: "Max points", min: 200, max: 2600, step: 100 },
      { key: "repulsionRadius", label: "Repulsion radius", min: 1, max: 20, step: 0.5 },
      { key: "repulsionStrength", label: "Repulsion strength", min: 0.05, max: 2, step: 0.05 },
      { key: "splitLength", label: "Split length", min: 1, max: 10, step: 0.25 },
      { key: "smoothing", label: "Smoothing", min: 0, max: 0.8, step: 0.02 },
      { key: "boundsForce", label: "Bounds force", min: 0, max: 2, step: 0.05 },
      { key: "historyEvery", label: "History every", min: 0, max: 80, step: 2 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["iterations", "maxPoints"],
    run: (p) =>
      differentialGrowth({
        ...differentialGrowthDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "voronoi",
    label: "Voronoi / Cell Structures",
    color: "#0f766e",
    defaults: {
      seed: voronoiCellsDefaults.seed,
      points: voronoiCellsDefaults.points,
      relaxationPasses: voronoiCellsDefaults.relaxationPasses,
      drawMode: voronoiCellsDefaults.drawMode,
      jitter: voronoiCellsDefaults.jitter,
      inset: voronoiCellsDefaults.inset,
      noiseWarp: voronoiCellsDefaults.noiseWarp,
      imageInfluence: voronoiCellsDefaults.imageInfluence ?? 1,
      imageContrast: voronoiCellsDefaults.imageContrast ?? 1,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "points", label: "Cells", min: 10, max: 220, step: 5 },
      { key: "relaxationPasses", label: "Relaxation passes", min: 0, max: 5, step: 1 },
      {
        kind: "select",
        key: "drawMode",
        label: "Draw mode",
        options: [
          { label: "Cell borders", value: 0 },
          { label: "Inset cells", value: 1 },
          { label: "Centers only", value: 2 },
        ],
      },
      { key: "jitter", label: "Jitter", min: 0, max: 1, step: 0.05 },
      { key: "inset", label: "Inset", min: 0, max: 0.45, step: 0.01 },
      { key: "noiseWarp", label: "Noise warp", min: 0, max: 3, step: 0.1 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    presets: [
      { name: "Tight cells", values: { points: 140, relaxationPasses: 3, drawMode: 0, jitter: 0.1, inset: 0, noiseWarp: 0.3 } },
      { name: "Loose & warped", values: { points: 60, relaxationPasses: 0, drawMode: 1, jitter: 0.6, inset: 0.25, noiseWarp: 1.8 } },
      { name: "Stipple centers", values: { points: 200, relaxationPasses: 2, drawMode: 2, jitter: 0.2, inset: 0, noiseWarp: 0.5 } },
    ],
    run: (p) =>
      voronoiCells({
        ...voronoiCellsDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "streamlines",
    label: "Streamline Bundles",
    color: "#2563eb",
    defaults: {
      seed: streamlinesDefaults.seed,
      fieldType: streamlinesDefaults.fieldType,
      sourceCount: streamlinesDefaults.sourceCount,
      lineCount: streamlinesDefaults.lineCount,
      stepLength: streamlinesDefaults.stepLength,
      maxSteps: streamlinesDefaults.maxSteps,
      fieldScale: streamlinesDefaults.fieldScale,
      spacing: streamlinesDefaults.spacing,
      drawBidirectional: streamlinesDefaults.drawBidirectional,
      imageInfluence: streamlinesDefaults.imageInfluence ?? 0.8,
      imageContrast: streamlinesDefaults.imageContrast ?? 1.4,
      imageTangent: streamlinesDefaults.imageTangent ?? 1,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      {
        kind: "select",
        key: "fieldType",
        label: "Field type",
        options: [
          { label: "Vortex", value: 0 },
          { label: "Source", value: 1 },
          { label: "Mixed", value: 2 },
        ],
      },
      { key: "sourceCount", label: "Sources", min: 1, max: 14, step: 1 },
      { key: "lineCount", label: "Lines", min: 20, max: 800, step: 20 },
      { key: "stepLength", label: "Step length", min: 0.4, max: 4, step: 0.1 },
      { key: "maxSteps", label: "Max steps", min: 40, max: 1000, step: 20 },
      { key: "fieldScale", label: "Field scale", min: 0, max: 3, step: 0.1 },
      { key: "spacing", label: "Spacing", min: 0.5, max: 8, step: 0.1 },
      { kind: "toggle", key: "drawBidirectional", label: "Bidirectional" },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
      { kind: "toggle", key: "imageTangent", label: "Follow image tangent" },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["lineCount", "maxSteps"],
    presets: [
      { name: "Single vortex", values: { fieldType: 0, sourceCount: 1, lineCount: 320, stepLength: 1.4, spacing: 2, fieldScale: 1, drawBidirectional: 0 } },
      { name: "Source spray", values: { fieldType: 1, sourceCount: 5, lineCount: 420, stepLength: 1.2, spacing: 1.5, fieldScale: 1.2, drawBidirectional: 1 } },
      { name: "Turbulent mix", values: { fieldType: 2, sourceCount: 8, lineCount: 600, stepLength: 1, spacing: 1.2, fieldScale: 1.6, drawBidirectional: 1 } },
    ],
    run: (p) =>
      streamlines({
        ...streamlinesDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "phyllotaxis",
    label: "Phyllotaxis / Botanical Spirals",
    color: "#b45309",
    defaults: {
      seed: phyllotaxisDefaults.seed,
      points: phyllotaxisDefaults.points,
      angleDegrees: phyllotaxisDefaults.angleDegrees,
      radialScale: phyllotaxisDefaults.radialScale,
      markMode: phyllotaxisDefaults.markMode,
      markSize: phyllotaxisDefaults.markSize,
      noiseWarp: phyllotaxisDefaults.noiseWarp,
      ellipseRatio: phyllotaxisDefaults.ellipseRatio,
      rotation: phyllotaxisDefaults.rotation,
      imageInfluence: phyllotaxisDefaults.imageInfluence ?? 1,
      imageContrast: phyllotaxisDefaults.imageContrast ?? 1,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "points", label: "Points", min: 50, max: 3000, step: 50 },
      { key: "angleDegrees", label: "Angle degrees", min: 120, max: 150, step: 0.01 },
      { key: "radialScale", label: "Radial scale", min: 0.5, max: 4, step: 0.05 },
      {
        kind: "select",
        key: "markMode",
        label: "Mark mode",
        options: [
          { label: "Circles", value: 0 },
          { label: "Ticks", value: 1 },
          { label: "Spirals", value: 2 },
        ],
      },
      { key: "markSize", label: "Mark size", min: 0.2, max: 5, step: 0.1 },
      { key: "noiseWarp", label: "Noise warp", min: 0, max: 3, step: 0.1 },
      { key: "ellipseRatio", label: "Ellipse ratio", min: 0.4, max: 1.8, step: 0.05 },
      { key: "rotation", label: "Rotation", min: 0, max: 360, step: 1 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["points", "angleDegrees"],
    presets: [
      { name: "Sunflower", values: { points: 1200, angleDegrees: 137.5, radialScale: 1.5, markMode: 0, markSize: 1.2, ellipseRatio: 1, noiseWarp: 0 } },
      { name: "Spiral arms", values: { points: 800, angleDegrees: 137.3, radialScale: 2, markMode: 2, markSize: 2, ellipseRatio: 1, noiseWarp: 0.4 } },
      { name: "Tick field", values: { points: 1500, angleDegrees: 137.5, radialScale: 1.4, markMode: 1, markSize: 1.5, ellipseRatio: 1.2, noiseWarp: 0.2 } },
    ],
    run: (p) =>
      phyllotaxis({
        ...phyllotaxisDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "branching",
    label: "Space Colonization Trees",
    color: "#166534",
    defaults: {
      seed: spaceColonizationDefaults.seed,
      attractorCount: spaceColonizationDefaults.attractorCount,
      startMode: spaceColonizationDefaults.startMode,
      growthStep: spaceColonizationDefaults.growthStep,
      attractionRadius: spaceColonizationDefaults.attractionRadius,
      killRadius: spaceColonizationDefaults.killRadius,
      branchJitter: spaceColonizationDefaults.branchJitter,
      gravity: spaceColonizationDefaults.gravity,
      maxIterations: spaceColonizationDefaults.maxIterations,
      imageInfluence: spaceColonizationDefaults.imageInfluence ?? 1,
      imageContrast: spaceColonizationDefaults.imageContrast ?? 1.2,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "attractorCount", label: "Attractors", min: 50, max: 1500, step: 50 },
      {
        kind: "select",
        key: "startMode",
        label: "Start position",
        options: [
          { label: "Root (bottom)", value: 0 },
          { label: "Center", value: 1 },
          { label: "Sides", value: 2 },
        ],
      },
      { key: "growthStep", label: "Growth step", min: 0.5, max: 6, step: 0.1 },
      { key: "attractionRadius", label: "Attraction radius", min: 4, max: 40, step: 1 },
      { key: "killRadius", label: "Kill radius", min: 1, max: 12, step: 0.5 },
      { key: "branchJitter", label: "Branch jitter", min: 0, max: 1, step: 0.02 },
      { key: "gravity", label: "Gravity", min: -1, max: 1, step: 0.05 },
      { key: "maxIterations", label: "Max iterations", min: 50, max: 1600, step: 50 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["attractorCount", "maxIterations"],
    run: (p) =>
      spaceColonization({
        ...spaceColonizationDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "waves",
    label: "Moire / Wave Interference",
    color: "#6d28d9",
    defaults: {
      seed: waveInterferenceDefaults.seed,
      sourceCount: waveInterferenceDefaults.sourceCount,
      gridSize: waveInterferenceDefaults.gridSize,
      levels: waveInterferenceDefaults.levels,
      frequency: waveInterferenceDefaults.frequency,
      directionalMix: waveInterferenceDefaults.directionalMix,
      sourceLayout: waveInterferenceDefaults.sourceLayout,
      smoothing: waveInterferenceDefaults.smoothing,
      imageInfluence: waveInterferenceDefaults.imageInfluence ?? 0.45,
      imageContrast: waveInterferenceDefaults.imageContrast ?? 1.2,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "sourceCount", label: "Sources", min: 1, max: 12, step: 1 },
      { key: "gridSize", label: "Grid size", min: 60, max: 260, step: 10 },
      { key: "levels", label: "Contour levels", min: 2, max: 32, step: 1 },
      { key: "frequency", label: "Frequency", min: 0.02, max: 0.35, step: 0.005 },
      { key: "directionalMix", label: "Directional mix", min: 0, max: 1, step: 0.05 },
      {
        kind: "select",
        key: "sourceLayout",
        label: "Source layout",
        options: [
          { label: "Random", value: 0 },
          { label: "Ring", value: 1 },
          { label: "Line", value: 2 },
        ],
      },
      { key: "smoothing", label: "Smoothing", min: 0, max: 2, step: 1 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["gridSize"],
    run: (p) =>
      waveInterference({
        ...waveInterferenceDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "metaballs",
    label: "Metaball Field Contours",
    color: "#be123c",
    defaults: {
      seed: metaballsDefaults.seed,
      blobCount: metaballsDefaults.blobCount,
      gridSize: metaballsDefaults.gridSize,
      levels: metaballsDefaults.levels,
      falloffPower: metaballsDefaults.falloffPower,
      minRadius: metaballsDefaults.minRadius,
      maxRadius: metaballsDefaults.maxRadius,
      thresholdMin: metaballsDefaults.thresholdMin,
      thresholdMax: metaballsDefaults.thresholdMax,
      smoothing: metaballsDefaults.smoothing,
      imageInfluence: metaballsDefaults.imageInfluence ?? 0.75,
      imageContrast: metaballsDefaults.imageContrast ?? 1,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "blobCount", label: "Blobs", min: 1, max: 80, step: 1 },
      { key: "gridSize", label: "Grid size", min: 60, max: 260, step: 10 },
      { key: "levels", label: "Contour levels", min: 1, max: 24, step: 1 },
      { key: "falloffPower", label: "Falloff power", min: 0.8, max: 5, step: 0.1 },
      { key: "minRadius", label: "Min radius", min: 1, max: 40, step: 1 },
      { key: "maxRadius", label: "Max radius", min: 2, max: 80, step: 1 },
      { key: "thresholdMin", label: "Threshold min", min: 0.02, max: 0.8, step: 0.01 },
      { key: "thresholdMax", label: "Threshold max", min: 0.05, max: 0.98, step: 0.01 },
      { key: "smoothing", label: "Smoothing", min: 0, max: 2, step: 1 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["gridSize"],
    run: (p) =>
      metaballs({
        ...metaballsDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "hatching",
    label: "Hatching From Scalar Fields",
    color: "#374151",
    defaults: {
      seed: hatchingDefaults.seed,
      hatchCount: hatchingDefaults.hatchCount,
      gridSize: hatchingDefaults.gridSize,
      minLength: hatchingDefaults.minLength,
      maxLength: hatchingDefaults.maxLength,
      angleMode: hatchingDefaults.angleMode,
      angleJitter: hatchingDefaults.angleJitter,
      densityScale: hatchingDefaults.densityScale,
      curvature: hatchingDefaults.curvature,
      noiseScale: hatchingDefaults.noiseScale,
      imageInfluence: hatchingDefaults.imageInfluence ?? 1,
      imageContrast: hatchingDefaults.imageContrast ?? 1,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "hatchCount", label: "Hatches", min: 50, max: 4000, step: 50 },
      { key: "gridSize", label: "Grid size", min: 40, max: 220, step: 10 },
      { key: "minLength", label: "Min length", min: 0.5, max: 10, step: 0.1 },
      { key: "maxLength", label: "Max length", min: 1, max: 30, step: 0.5 },
      {
        kind: "select",
        key: "angleMode",
        label: "Angle mode",
        options: [
          { label: "Gradient", value: 0 },
          { label: "Tangent", value: 1 },
          { label: "Fixed", value: 2 },
        ],
      },
      { key: "angleJitter", label: "Angle jitter", min: 0, max: 1, step: 0.02 },
      { key: "densityScale", label: "Density scale", min: 0.05, max: 1.5, step: 0.05 },
      { key: "curvature", label: "Curvature", min: 0, max: 1.5, step: 0.05 },
      { key: "noiseScale", label: "Noise scale", min: 0.002, max: 0.05, step: 0.001 },
      { key: "imageInfluence", label: "Image influence", min: 0, max: 1, step: 0.05 },
      { key: "imageContrast", label: "Image contrast", min: 0.2, max: 3, step: 0.05 },
    ],
    seedKey: "seed",
    usesImage: true,
    lockRandom: ["hatchCount", "gridSize"],
    presets: [
      { name: "Pencil shading", values: { angleMode: 0, angleJitter: 0.1, minLength: 2, maxLength: 8, curvature: 0.2, densityScale: 0.6, noiseScale: 0.012 } },
      { name: "Crosshatch flow", values: { angleMode: 1, angleJitter: 0.2, minLength: 1.5, maxLength: 14, curvature: 0.8, densityScale: 0.8, noiseScale: 0.02 } },
      { name: "Fixed engraving", values: { angleMode: 2, angleJitter: 0, minLength: 3, maxLength: 12, curvature: 0, densityScale: 0.7, noiseScale: 0.01 } },
    ],
    run: (p) =>
      hatching({
        ...hatchingDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
        field: imageField,
        invert: imageInvert.value,
      }),
  },
  {
    id: "ribbon",
    label: "Interlaced Ribbon Weave",
    color: "#101820",
    defaults: {
      seed: ribbonWeaveDefaults.seed,
      trackCount: ribbonWeaveDefaults.trackCount,
      spacing: ribbonWeaveDefaults.spacing,
      loopScale: ribbonWeaveDefaults.loopScale,
      bend: ribbonWeaveDefaults.bend,
      hatchSpacing: ribbonWeaveDefaults.hatchSpacing,
      hatchWidth: ribbonWeaveDefaults.hatchWidth,
      hatchHeight: ribbonWeaveDefaults.hatchHeight,
      lineJitter: ribbonWeaveDefaults.lineJitter,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "trackCount", label: "Tracks", min: 6, max: 64, step: 1 },
      { key: "spacing", label: "Track spacing", min: 0.6, max: 3.5, step: 0.05 },
      { key: "loopScale", label: "Loop scale", min: 0.55, max: 1.35, step: 0.05 },
      { key: "bend", label: "Crossing bend", min: 0, max: 1, step: 0.05 },
      { key: "hatchSpacing", label: "Hatch spacing", min: 0.7, max: 4, step: 0.05 },
      { key: "hatchWidth", label: "Hatch width", min: 20, max: 180, step: 1 },
      { key: "hatchHeight", label: "Hatch height", min: 20, max: 260, step: 1 },
      { key: "lineJitter", label: "Line jitter", min: 0, max: 1.2, step: 0.02 },
    ],
    seedKey: "seed",
    run: (p) =>
      ribbonWeave({
        ...ribbonWeaveDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
      }),
  },
  {
    id: "harmonic-ribbon",
    label: "Harmonic Ribbon Mesh",
    color: "#006ee6",
    defaults: {
      seed: harmonicRibbonDefaults.seed,
      ribbons: harmonicRibbonDefaults.ribbons,
      linesPerRibbon: harmonicRibbonDefaults.linesPerRibbon,
      length: harmonicRibbonDefaults.length,
      ribbonWidth: harmonicRibbonDefaults.ribbonWidth,
      amplitude: harmonicRibbonDefaults.amplitude,
      twist: harmonicRibbonDefaults.twist,
      frequency: harmonicRibbonDefaults.frequency,
      rotation: harmonicRibbonDefaults.rotation,
      spread: harmonicRibbonDefaults.spread,
      phaseDrift: harmonicRibbonDefaults.phaseDrift,
      lineJitter: harmonicRibbonDefaults.lineJitter,
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "ribbons", label: "Ribbon groups", min: 1, max: 5, step: 1 },
      { key: "linesPerRibbon", label: "Lines per ribbon", min: 20, max: 240, step: 5 },
      { key: "length", label: "Ribbon length", min: 50, max: 220, step: 1 },
      { key: "ribbonWidth", label: "Ribbon width", min: 12, max: 95, step: 1 },
      { key: "amplitude", label: "Wave amplitude", min: 0, max: 70, step: 1 },
      { key: "twist", label: "Twist", min: 0, max: 1, step: 0.01 },
      { key: "frequency", label: "Wave frequency", min: 0.25, max: 3, step: 0.05 },
      { key: "rotation", label: "Rotation", min: -90, max: 90, step: 1 },
      { key: "spread", label: "Group spread", min: 0, max: 90, step: 1 },
      { key: "phaseDrift", label: "Phase drift", min: 0, max: 1, step: 0.01 },
      { key: "lineJitter", label: "Line jitter", min: 0, max: 1.5, step: 0.05 },
    ],
    seedKey: "seed",
    lockRandom: ["linesPerRibbon"],
    presets: [
      { name: "Single calm ribbon", values: { ribbons: 1, linesPerRibbon: 120, length: 180, ribbonWidth: 55, amplitude: 30, twist: 0.2, frequency: 1, spread: 0, phaseDrift: 0.1, lineJitter: 0 } },
      { name: "Twisted bundle", values: { ribbons: 3, linesPerRibbon: 110, length: 170, ribbonWidth: 45, amplitude: 50, twist: 0.7, frequency: 1.5, spread: 40, phaseDrift: 0.3, lineJitter: 0.2 } },
      { name: "High-frequency mesh", values: { ribbons: 2, linesPerRibbon: 200, length: 190, ribbonWidth: 60, amplitude: 40, twist: 0.4, frequency: 2.6, spread: 25, phaseDrift: 0.6, lineJitter: 0.1 } },
    ],
    run: (p) =>
      harmonicRibbon({
        ...harmonicRibbonDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
      }),
  },
];

// --- App state -----------------------------------------------------------

const paper = { width: 210, height: 297, margin: 15 };
const profile: MachineProfile = { ...defaultProfile };

// Allow ?gen=<id> to preselect a generator on load.
const requestedId = new URLSearchParams(location.search).get("gen");
let activeId = generators.some((g) => g.id === requestedId)
  ? requestedId!
  : generators[0].id;
// Live parameter values per generator, seeded from defaults.
const paramValues: Record<string, Record<string, number>> = {};
for (const g of generators) paramValues[g.id] = { ...g.defaults };

const optimizeOn = { value: true };
const showTravel = { value: false };
let drawing: Drawing | null = null;
let generateTimer: number | undefined;
let generationWorker: Worker | null = null;
let generationJobId = 0;
let busyStartedAt = 0;
let busyEstimateMs: number | null = null;
let busyTimer: number | undefined;
const generationDurations: Record<string, number> = {};

// Per-generator pen colour (seeded from each generator's default) + paper colour.
const colorValues: Record<string, string> = {};
for (const g of generators) colorValues[g.id] = g.color;
const paperColor = { value: "#ffffff" };

// Imported image heightfield (shared by image-driven generators).
let imageField: HeightField | null = null;
let imageFieldData: ImageFieldData | null = null;
let imageName = "";
let imageDataUrl = "";
const imageInvert = { value: false };
let currentProjectPath = "";

// --- Element handles -----------------------------------------------------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("preview");
const generatorSelect = $<HTMLSelectElement>("generator-select");
const generatorTabs = $<HTMLDivElement>("generator-tabs");
const generatorControls = $<HTMLDivElement>("generator-controls");
const imageControls = $<HTMLDivElement>("image-controls");
const colorControls = $<HTMLDivElement>("color-controls");
const paperControls = $<HTMLDivElement>("paper-controls");
const profileControls = $<HTMLDivElement>("profile-controls");
const statsEl = $<HTMLDivElement>("stats");
const metricWidth = $<HTMLElement>("metric-width");
const metricHeight = $<HTMLElement>("metric-height");
const metricMargin = $<HTMLElement>("metric-margin");
const axisWidth = $<HTMLSpanElement>("axis-width");
const axisHeight = $<HTMLSpanElement>("axis-height");
const paperFrame = document.querySelector<HTMLDivElement>(".paper-frame")!;
const documentNameInput = $<HTMLInputElement>("document-name");
const fileMenuButton = $<HTMLButtonElement>("btn-file-menu");
const fileMenu = $<HTMLDivElement>("file-menu");
const projectOpenInput = $<HTMLInputElement>("project-open-input");
const drawingSubtitle = $<HTMLParagraphElement>("drawing-subtitle");
const layerColor = $<HTMLSpanElement>("layer-color");
const layerLabel = $<HTMLElement>("layer-label");
const renderBusy = $<HTMLDivElement>("render-busy");
const renderBusyTitle = $<HTMLElement>("render-busy-title");
const renderBusyDetail = $<HTMLElement>("render-busy-detail");
const exportStatus = document.createElement("div");
exportStatus.className = "export-status";
const appWindow = getCurrentWindow();

// --- Build the static control sections -----------------------------------

function activeGenerator(): GeneratorDef {
  return generators.find((g) => g.id === activeId)!;
}

function buildPaperControls(): void {
  paperControls.replaceChildren(
    numberControl({
      label: "Width (mm)",
      min: 50,
      max: 1000,
      step: 1,
      value: paper.width,
      onChange: (v) => {
        paper.width = v;
        updatePaperMetrics();
        scheduleGenerate();
      },
    }),
    numberControl({
      label: "Height (mm)",
      min: 50,
      max: 1000,
      step: 1,
      value: paper.height,
      onChange: (v) => {
        paper.height = v;
        updatePaperMetrics();
        scheduleGenerate();
      },
    }),
    numberControl({
      label: "Margin (mm)",
      min: 0,
      max: 100,
      step: 1,
      value: paper.margin,
      onChange: (v) => {
        paper.margin = v;
        updatePaperMetrics();
        scheduleGenerate();
      },
    }),
  );
  updatePaperMetrics();
}

function updatePaperMetrics(): void {
  metricWidth.textContent = String(paper.width);
  metricHeight.textContent = String(paper.height);
  metricMargin.textContent = String(paper.margin);
  axisWidth.textContent = `${paper.width} mm`;
  axisHeight.textContent = `${paper.height} mm`;
  paperFrame.style.aspectRatio = `${paper.width} / ${paper.height}`;
  const marginX = Math.min(35, Math.max(0, (paper.margin / paper.width) * 100));
  const marginY = Math.min(35, Math.max(0, (paper.margin / paper.height) * 100));
  paperFrame.style.setProperty("--margin-x", `${marginX}%`);
  paperFrame.style.setProperty("--margin-y", `${marginY}%`);
}

function iconForGenerator(id: string): string {
  switch (id) {
    case "flow":
      return '<svg viewBox="0 0 24 24" fill="none"><path d="M4 8c4-4 8 4 12 0 1.5-1.5 2.7-2 4-2M4 16c4-4 8 4 12 0 1.5-1.5 2.7-2 4-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>';
    case "hilbert":
      return '<svg viewBox="0 0 24 24" fill="none"><path d="M7 5v5h10V5M7 19v-5h10v5M12 10v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>';
    case "tsp":
      return '<svg viewBox="0 0 24 24" fill="none"><path d="M6 7h.1M18 6h.1M14 13h.1M7 18h.1M6 7l8 6 4-7M14 13l-7 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>';
    default:
      return '<svg viewBox="0 0 24 24" fill="none"><path d="M4 17c3-4 5-4 8 0s5 4 8 0M4 12c3-3 5-3 8 0s5 3 8 0M4 7c3-2 5-2 8 0s5 2 8 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>';
  }
}

function buildGeneratorTabs(): void {
  const tabs = generators.map((g) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `generator-tab${g.id === activeId ? " active" : ""}`;
    button.title = g.label;
    button.innerHTML = iconForGenerator(g.id);
    button.addEventListener("click", () => {
      activeId = g.id;
      generatorSelect.value = activeId;
      buildGeneratorTabs();
      buildGeneratorControls();
      buildImageControls();
      buildColorControls();
      scheduleGenerate();
    });
    return button;
  });
  generatorTabs.replaceChildren(...tabs);
}

function buildGeneratorControls(): void {
  const g = activeGenerator();
  const values = paramValues[g.id];
  const apply = (key: string) => (v: number) => {
    values[key] = v;
    scheduleGenerate();
  };
  const nodes: HTMLElement[] = [];
  if (g.presets && g.presets.length) nodes.push(buildPresetControl(g));
  for (const p of g.params) {
    if (p.kind === "select") {
      nodes.push(
        selectControl({
          label: p.label,
          options: p.options,
          value: values[p.key],
          onChange: apply(p.key),
        }),
      );
    } else if (p.kind === "toggle") {
      nodes.push(
        toggleControl({
          label: p.label,
          value: values[p.key],
          onChange: apply(p.key),
        }),
      );
    } else {
      nodes.push(
        numberControl({
          label: p.label,
          min: p.min,
          max: p.max,
          step: p.step,
          value: values[p.key],
          onChange: apply(p.key),
        }),
      );
    }
  }
  generatorControls.replaceChildren(...nodes);
}

/** Dropdown of curated "looks" for a generator. Selecting one merges its
 *  snapshot onto the live values, then rebuilds controls so the sliders
 *  reflect the preset and re-renders. */
function buildPresetControl(g: GeneratorDef): HTMLElement {
  const field = document.createElement("label");
  field.className = "field preset-field";
  const span = document.createElement("span");
  span.textContent = "Style preset";
  const select = document.createElement("select");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Custom / pick a preset...";
  select.appendChild(placeholder);
  for (const preset of g.presets ?? []) {
    const opt = document.createElement("option");
    opt.value = preset.name;
    opt.textContent = preset.name;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    const preset = g.presets?.find((pr) => pr.name === select.value);
    if (!preset) return;
    Object.assign(paramValues[g.id], preset.values);
    buildGeneratorControls();
    scheduleGenerate();
  });
  field.appendChild(span);
  field.appendChild(select);
  return field;
}

function setImageFromElement(img: HTMLImageElement, name: string): void {
  // Downscale large images; we only need a coarse heightfield.
  const maxDim = 600;
  const k = Math.min(1, maxDim / Math.max(img.width, img.height));
  const cw = Math.max(1, Math.round(img.width * k));
  const ch = Math.max(1, Math.round(img.height * k));
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const cx = c.getContext("2d")!;
  cx.drawImage(img, 0, 0, cw, ch);
  imageFieldData = imageFieldDataFromImageData(cx.getImageData(0, 0, cw, ch));
  imageField = heightFieldFromData(imageFieldData);
  imageName = name;
  imageDataUrl = c.toDataURL("image/png");
}

function loadImageFile(file: File): void {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    setImageFromElement(img, file.name);
    URL.revokeObjectURL(url);
    buildImageControls();
    scheduleGenerate();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    imageName = "";
    imageDataUrl = "";
    imageField = null;
    buildImageControls();
  };
  img.src = url;
}

function loadImageDataUrl(dataUrl: string, name: string, invert: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      setImageFromElement(img, name);
      imageInvert.value = invert;
      resolve();
    };
    img.onerror = () => reject(new Error("Could not read embedded project image."));
    img.src = dataUrl;
  });
}

function clearProjectImage(): void {
  imageField = null;
  imageFieldData = null;
  imageName = "";
  imageDataUrl = "";
  imageInvert.value = false;
}

function buildImageControls(): void {
  const g = activeGenerator();
  if (!g.usesImage) {
    imageControls.replaceChildren();
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "image-source";

  const status = document.createElement("div");
  status.className = "field-note";
  status.textContent = imageField
    ? `Image: ${imageName}`
    : "No image - using procedural noise.";

  const fileLabel = document.createElement("label");
  fileLabel.className = "file-button";
  fileLabel.textContent = imageField ? "Replace image..." : "Import image...";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) loadImageFile(file);
  });
  fileLabel.appendChild(fileInput);

  wrap.appendChild(status);
  wrap.appendChild(fileLabel);

  if (imageField) {
    wrap.appendChild(
      checkControl({
        label: "Invert (bright = tall)",
        value: imageInvert.value,
        onChange: (v) => {
          imageInvert.value = v;
          scheduleGenerate();
        },
      }),
    );
    const clear = document.createElement("button");
    clear.className = "secondary";
    clear.textContent = "Clear image";
    clear.addEventListener("click", () => {
      clearProjectImage();
      buildImageControls();
      scheduleGenerate();
    });
    wrap.appendChild(clear);
  }

  imageControls.replaceChildren(wrap);
}

function buildColorControls(): void {
  colorControls.replaceChildren(
    colorControl({
      label: "Pen colour",
      value: colorValues[activeId],
      onChange: (v) => {
        colorValues[activeId] = v;
        if (drawing && drawing.layers[0]) {
          drawing.layers[0].color = v;
          render();
        }
      },
    }),
    colorControl({
      label: "Paper colour",
      value: paperColor.value,
      onChange: (v) => {
        paperColor.value = v;
        render();
      },
    }),
  );
}

function buildProfileControls(): void {
  profileControls.replaceChildren(
    textControl({
      label: "Pen up command",
      value: profile.penUp,
      onChange: (v) => (profile.penUp = v),
    }),
    textControl({
      label: "Pen down command",
      value: profile.penDown,
      onChange: (v) => (profile.penDown = v),
    }),
    numberControl({
      label: "Draw feed (mm/min)",
      min: 100,
      max: 20000,
      step: 100,
      value: profile.drawFeed,
      onChange: (v) => (profile.drawFeed = v),
    }),
    numberControl({
      label: "Travel feed (mm/min)",
      min: 100,
      max: 30000,
      step: 100,
      value: profile.travelFeed,
      onChange: (v) => (profile.travelFeed = v),
    }),
    checkControl({
      label: "Origin bottom-left (flip Y)",
      value: profile.originBottomLeft,
      onChange: (v) => (profile.originBottomLeft = v),
    }),
  );
}

// --- Core actions --------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function updateBusyDetail(): void {
  if (renderBusy.hidden || busyStartedAt === 0) return;
  const elapsed = performance.now() - busyStartedAt;
  if (busyEstimateMs === null) {
    renderBusyDetail.textContent = `Elapsed ${formatDuration(elapsed)} - estimating time...`;
    return;
  }
  const remaining = Math.max(0, busyEstimateMs - elapsed);
  renderBusyDetail.textContent = `Elapsed ${formatDuration(elapsed)} - about ${formatDuration(remaining)} remaining`;
}

function showBusy(label: string): void {
  busyStartedAt = performance.now();
  busyEstimateMs = generationDurations[activeId] ?? null;
  renderBusyTitle.textContent = `Rendering ${label}`;
  renderBusy.hidden = false;
  updateBusyDetail();
  if (busyTimer !== undefined) window.clearInterval(busyTimer);
  busyTimer = window.setInterval(updateBusyDetail, 250);
}

function hideBusy(): void {
  renderBusy.hidden = true;
  busyStartedAt = 0;
  busyEstimateMs = null;
  if (busyTimer !== undefined) {
    window.clearInterval(busyTimer);
    busyTimer = undefined;
  }
}

function recordGenerationDuration(generatorId: string, durationMs: number): void {
  const previous = generationDurations[generatorId];
  generationDurations[generatorId] =
    previous === undefined ? durationMs : previous * 0.7 + durationMs * 0.3;
}

function generate(): void {
  if (generateTimer !== undefined) {
    window.clearTimeout(generateTimer);
    generateTimer = undefined;
  }
  const g = activeGenerator();
  const jobId = ++generationJobId;

  generationWorker?.terminate();
  generationWorker = new Worker(new URL("./generationWorker.ts", import.meta.url), {
    type: "module",
  });
  showBusy(g.label);

  generationWorker.onmessage = (event: MessageEvent<GenerateWorkerResponse>) => {
    const response = event.data;
    if (response.jobId !== generationJobId) return;

    generationWorker?.terminate();
    generationWorker = null;
    hideBusy();

    if (!response.ok || !response.drawing) {
      setExportStatus(`Render failed: ${response.error ?? "Unknown error"}`, "error");
      return;
    }

    if (typeof response.durationMs === "number") {
      recordGenerationDuration(g.id, response.durationMs);
    }
    drawing = response.drawing;
    render();
    updateStats(response.travelBefore ?? 0, response.travelAfter ?? 0);
  };

  generationWorker.onerror = (event) => {
    if (jobId !== generationJobId) return;
    generationWorker?.terminate();
    generationWorker = null;
    hideBusy();
    setExportStatus(`Render failed: ${event.message}`, "error");
  };

  generationWorker.postMessage({
    jobId,
    generatorId: g.id,
    label: g.label,
    color: colorValues[g.id],
    params: { ...paramValues[g.id] },
    paper: { ...paper },
    imageFieldData,
    imageInvert: imageInvert.value,
    optimize: optimizeOn.value,
  });
}

function scheduleGenerate(delay = 500): void {
  if (generateTimer !== undefined) {
    window.clearTimeout(generateTimer);
  }
  generateTimer = window.setTimeout(() => generate(), delay);
}

function render(): void {
  const view: Drawing = drawing ?? {
    width: paper.width,
    height: paper.height,
    layers: [],
  };
  renderPreview(canvas, view, {
    showTravel: showTravel.value,
    paperColor: paperColor.value,
  });
  updatePreviewLabels();
}

function updateStats(travelBefore: number, travelAfter: number): void {
  if (!drawing) {
    statsEl.textContent = "No drawing yet.";
    return;
  }
  const paths = countPaths(drawing);
  const ink = drawnLength(drawing);
  const statRows = [
    ["Ink length", `${(ink / 1000).toFixed(2)} m`],
    ["Paths", String(paths)],
  ];
  if (optimizeOn.value && travelBefore > 0) {
    const saved = (1 - travelAfter / travelBefore) * 100;
    statRows.push(["Travel saved", `${saved.toFixed(0)}%`]);
  }
  statsEl.replaceChildren(
    ...statRows.map(([label, value]) => {
      const row = document.createElement("div");
      row.className = "stat";
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      const valueEl = document.createElement("strong");
      valueEl.textContent = value;
      row.append(labelEl, valueEl);
      return row;
    }),
  );
  if (optimizeOn.value && travelBefore > 0) {
    const saved = Math.max(0, Math.min(100, (1 - travelAfter / travelBefore) * 100));
    const progress = document.createElement("div");
    progress.className = "stats-progress";
    const bar = document.createElement("span");
    bar.style.width = `${saved}%`;
    progress.appendChild(bar);
    statsEl.appendChild(progress);
  }
}

function updatePreviewLabels(): void {
  const g = activeGenerator();
  drawingSubtitle.textContent = optimizeOn.value
    ? "Optimized preview"
    : "Unoptimized preview";
  layerColor.style.background = colorValues[g.id];
  if (!drawing) {
    layerLabel.textContent = "No drawing yet";
    return;
  }
  layerLabel.textContent = `${g.label}, ${countPaths(drawing)} paths`;
}

function stripKnownExtension(name: string): string {
  return name.replace(/\.(svg|gcode|ppstudio)$/i, "");
}

function documentBaseName(): string {
  const cleaned = stripKnownExtension(documentNameInput.value.trim())
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "untitled";
}

function ensureFileExtension(path: string, extension: string): string {
  const escaped = extension.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.${escaped}$`, "i").test(path) ? path : `${path}.${extension}`;
}

function ensureProjectExtension(path: string): string {
  return ensureFileExtension(path, "ppstudio");
}

function normalizeDocumentName(): void {
  documentNameInput.value = documentBaseName();
}

function currentConfigJson(): string {
  const g = activeGenerator();
  const config = {
    schema: "https://robrighter.local/pen-plotter-studio/ppstudio.schema.json",
    format: "Pen Plotter Studio Project",
    formatVersion: 1,
    savedAt: new Date().toISOString(),
    documentName: documentBaseName(),
    paper: { ...paper },
    generator: {
      id: g.id,
      label: g.label,
      params: { ...paramValues[g.id] },
      color: colorValues[g.id],
    },
    colors: {
      paper: paperColor.value,
      pensByGenerator: { ...colorValues },
    },
    image: imageField
      ? {
          name: imageName,
          mimeType: "image/png",
          dataUrl: imageDataUrl,
          invert: imageInvert.value,
        }
      : null,
    output: {
      optimizeTravel: optimizeOn.value,
      showTravel: showTravel.value,
    },
    machineProfile: { ...profile },
  };
  return JSON.stringify(config, null, 2);
}

function browserDownload(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function setExportStatus(message: string, tone: "ok" | "error" = "ok"): void {
  exportStatus.textContent = message;
  exportStatus.dataset.tone = tone;
  drawingSubtitle.textContent = message;
}

async function exportFile(
  filename: string,
  contents: string,
  mime: string,
): Promise<string | null> {
  try {
    const savedPath = await invoke<string>("save_export", { filename, contents });
    setExportStatus(`Saved to ${savedPath}`);
    return savedPath;
  } catch (error) {
    const isTauri = "__TAURI_INTERNALS__" in window;
    if (!isTauri) {
      browserDownload(filename, contents, mime);
      setExportStatus(`Downloaded ${filename}`);
      return null;
    }
    const message = error instanceof Error ? error.message : String(error);
    setExportStatus(`Export failed: ${message}`, "error");
    return null;
  }
}

async function exportFileAs(
  filename: string,
  contents: string,
  mime: string,
  extension: "svg" | "gcode",
  label: string,
): Promise<string | null> {
  const isTauri = "__TAURI_INTERNALS__" in window;
  if (!isTauri) {
    browserDownload(filename, contents, mime);
    setExportStatus(`Downloaded ${filename}`);
    return null;
  }

  try {
    const selectedPath = await save({
      title: `Export ${label}`,
      defaultPath: filename,
      filters: [{ name: label, extensions: [extension] }],
    });
    if (!selectedPath) return null;
    const path = ensureFileExtension(selectedPath, extension);
    const savedPath = await invoke<string>("save_file_to_path", { path, contents });
    setExportStatus(`Saved to ${savedPath}`);
    return savedPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setExportStatus(`Export failed: ${message}`, "error");
    return null;
  }
}

/** Re-roll every param of the active generator within its sensible range,
 *  giving a fresh-but-coherent variation. Locked keys (and the value the
 *  preset would consider structural) are left alone. */
function surpriseActiveGenerator(): void {
  const g = activeGenerator();
  const values = paramValues[g.id];
  const locked = new Set(g.lockRandom ?? []);
  for (const p of g.params) {
    if (locked.has(p.key)) continue;
    if (p.kind === "select") {
      const choice = p.options[Math.floor(Math.random() * p.options.length)];
      values[p.key] = choice.value;
    } else if (p.kind === "toggle") {
      values[p.key] = Math.random() < 0.5 ? 0 : 1;
    } else {
      const [lo, hi] = p.randomize ?? [p.min, p.max];
      const raw = lo + Math.random() * (hi - lo);
      const snapped = p.step ? Math.round(raw / p.step) * p.step : raw;
      const clamped = Math.min(p.max, Math.max(p.min, snapped));
      // Avoid floating-point dust from the step division.
      values[p.key] = Number(clamped.toFixed(6));
    }
  }
  if (g.seedKey) values[g.seedKey] = Math.floor(Math.random() * 10000);
  buildGeneratorControls();
  scheduleGenerate();
}

function resetGeneratorDefaults(): void {
  for (const g of generators) {
    paramValues[g.id] = { ...g.defaults };
    colorValues[g.id] = g.color;
  }
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mergeNumberParams(target: Record<string, number>, source?: Record<string, unknown>): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      target[key] = value;
    }
  }
}

function syncOutputControls(): void {
  $<HTMLInputElement>("opt-optimize").checked = optimizeOn.value;
  const showTravelInput = document.getElementById("opt-show-travel") as HTMLInputElement | null;
  if (showTravelInput) showTravelInput.checked = showTravel.value;
}

function rebuildProjectUi(): void {
  generatorSelect.value = activeId;
  buildPaperControls();
  buildGeneratorTabs();
  buildGeneratorControls();
  buildImageControls();
  buildColorControls();
  buildProfileControls();
  syncOutputControls();
  generate();
}

function newProject(): void {
  if (!window.confirm("Start a new project? Unsaved changes will be lost.")) return;
  currentProjectPath = "";
  documentNameInput.value = "untitled";
  paper.width = 210;
  paper.height = 297;
  paper.margin = 15;
  Object.assign(profile, defaultProfile);
  resetGeneratorDefaults();
  clearProjectImage();
  paperColor.value = "#ffffff";
  optimizeOn.value = true;
  showTravel.value = false;
  activeId = generators[0].id;
  rebuildProjectUi();
  setExportStatus("New project ready.");
}

async function saveProject(saveAs = false): Promise<void> {
  normalizeDocumentName();
  const contents = currentConfigJson();
  const isTauri = "__TAURI_INTERNALS__" in window;

  if ((saveAs || !currentProjectPath) && isTauri) {
    try {
      const selectedPath = await save({
        title: "Save Pen Plotter Studio Project",
        defaultPath: currentProjectPath || `${documentBaseName()}.ppstudio`,
        filters: [{ name: "Pen Plotter Studio Project", extensions: ["ppstudio"] }],
      });
      if (!selectedPath) return;
      currentProjectPath = ensureProjectExtension(selectedPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportStatus(`Save dialog failed: ${message}`, "error");
      return;
    }
  }

  if (!saveAs && currentProjectPath) {
    try {
      const savedPath = await invoke<string>("save_project_to_path", {
        path: currentProjectPath,
        contents,
      });
      currentProjectPath = savedPath;
      setExportStatus(`Saved to ${savedPath}`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportStatus(`Save failed: ${message}`, "error");
      return;
    }
  }

  if (currentProjectPath) {
    try {
      const savedPath = await invoke<string>("save_project_to_path", {
        path: currentProjectPath,
        contents,
      });
      currentProjectPath = savedPath;
      setExportStatus(`Saved to ${savedPath}`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportStatus(`Save failed: ${message}`, "error");
      return;
    }
  }

  const savedPath = await exportFile(
    `${documentBaseName()}.ppstudio`,
    contents,
    "application/vnd.pen-plotter-studio+json",
  );
  if (savedPath) currentProjectPath = savedPath;
}

async function applyProjectConfig(config: ProjectFile): Promise<void> {
  currentProjectPath = "";
  documentNameInput.value = stripKnownExtension(config.documentName ?? "untitled");
  normalizeDocumentName();

  paper.width = finiteNumber(config.paper?.width, 210);
  paper.height = finiteNumber(config.paper?.height, 297);
  paper.margin = finiteNumber(config.paper?.margin, 15);

  resetGeneratorDefaults();
  if (typeof config.colors?.paper === "string") {
    paperColor.value = config.colors.paper;
  } else {
    paperColor.value = "#ffffff";
  }
  for (const [id, color] of Object.entries(config.colors?.pensByGenerator ?? {})) {
    if (generators.some((g) => g.id === id) && typeof color === "string") {
      colorValues[id] = color;
    }
  }

  const openedId = config.generator?.id;
  activeId = openedId && generators.some((g) => g.id === openedId) ? openedId : generators[0].id;
  mergeNumberParams(paramValues[activeId], config.generator?.params);
  if (typeof config.generator?.color === "string") {
    colorValues[activeId] = config.generator.color;
  }

  Object.assign(profile, defaultProfile, config.machineProfile ?? {});
  optimizeOn.value = config.output?.optimizeTravel ?? true;
  showTravel.value = config.output?.showTravel ?? false;

  clearProjectImage();
  if (config.image?.dataUrl) {
    await loadImageDataUrl(
      config.image.dataUrl,
      config.image.name ?? "embedded-image.png",
      config.image.invert ?? false,
    );
  }

  rebuildProjectUi();
}

async function openProjectFile(file: File): Promise<void> {
  try {
    const config = JSON.parse(await file.text()) as ProjectFile;
    await applyProjectConfig(config);
    setExportStatus(`Opened ${file.name}. Use Save As to choose a save target.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setExportStatus(`Open failed: ${message}`, "error");
  } finally {
    projectOpenInput.value = "";
  }
}

async function openProjectDialog(): Promise<void> {
  const isTauri = "__TAURI_INTERNALS__" in window;
  if (!isTauri) {
    projectOpenInput.click();
    return;
  }

  try {
    const selectedPath = await open({
      title: "Open Pen Plotter Studio Project",
      multiple: false,
      directory: false,
      filters: [{ name: "Pen Plotter Studio Project", extensions: ["ppstudio"] }],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    const contents = await invoke<string>("read_project_from_path", { path: selectedPath });
    const config = JSON.parse(contents) as ProjectFile;
    await applyProjectConfig(config);
    currentProjectPath = selectedPath;
    setExportStatus(`Opened ${selectedPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setExportStatus(`Open failed: ${message}`, "error");
  }
}

function closeFileMenu(): void {
  fileMenu.hidden = true;
  fileMenuButton.setAttribute("aria-expanded", "false");
}

function toggleFileMenu(): void {
  const open = fileMenu.hidden;
  fileMenu.hidden = !open;
  fileMenuButton.setAttribute("aria-expanded", String(open));
}

// --- Wire up the page ----------------------------------------------------

function init(): void {
  for (const g of generators) {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.label;
    generatorSelect.appendChild(opt);
  }
  generatorSelect.value = activeId;
  buildGeneratorTabs();
  generatorSelect.addEventListener("change", () => {
    activeId = generatorSelect.value;
    buildGeneratorTabs();
    buildGeneratorControls();
    buildImageControls();
    buildColorControls();
    scheduleGenerate();
  });

  buildPaperControls();
  buildGeneratorControls();
  buildImageControls();
  buildColorControls();
  buildProfileControls();
  statsEl.parentElement?.appendChild(exportStatus);

  documentNameInput.addEventListener("blur", normalizeDocumentName);
  documentNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      normalizeDocumentName();
      documentNameInput.blur();
    }
  });

  fileMenuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFileMenu();
  });
  fileMenu.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", closeFileMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFileMenu();
  });
  $<HTMLButtonElement>("file-new").addEventListener("click", () => {
    closeFileMenu();
    newProject();
  });
  $<HTMLButtonElement>("file-open").addEventListener("click", () => {
    closeFileMenu();
    void openProjectDialog();
  });
  $<HTMLButtonElement>("file-save").addEventListener("click", () => {
    closeFileMenu();
    void saveProject();
  });
  $<HTMLButtonElement>("file-save-as").addEventListener("click", () => {
    closeFileMenu();
    void saveProject(true);
  });
  projectOpenInput.addEventListener("change", () => {
    const file = projectOpenInput.files?.[0];
    if (file) void openProjectFile(file);
  });

  $<HTMLButtonElement>("btn-window-minimize").addEventListener("click", () => {
    void appWindow.minimize();
  });

  $<HTMLButtonElement>("btn-window-maximize").addEventListener("click", () => {
    void appWindow.toggleMaximize();
  });

  $<HTMLButtonElement>("btn-window-close").addEventListener("click", () => {
    void appWindow.close();
  });

  $<HTMLButtonElement>("btn-randomize").addEventListener("click", () => {
    const g = activeGenerator();
    if (!g.seedKey) return;
    paramValues[g.id][g.seedKey] = Math.floor(Math.random() * 10000);
    buildGeneratorControls();
    scheduleGenerate();
  });

  $<HTMLButtonElement>("btn-surprise").addEventListener("click", () => {
    surpriseActiveGenerator();
  });

  $<HTMLInputElement>("opt-optimize").addEventListener("change", (e) => {
    optimizeOn.value = (e.target as HTMLInputElement).checked;
    scheduleGenerate();
  });

  document.getElementById("opt-show-travel")?.addEventListener("change", (e) => {
    showTravel.value = (e.target as HTMLInputElement).checked;
    render();
  });

  $<HTMLButtonElement>("btn-export-svg").addEventListener("click", () => {
    if (!drawing) return;
    void exportFileAs(
      `${documentBaseName()}.svg`,
      toSVG(drawing),
      "image/svg+xml",
      "svg",
      "SVG",
    );
  });

  $<HTMLButtonElement>("btn-export-gcode").addEventListener("click", () => {
    if (!drawing) return;
    void exportFileAs(
      `${documentBaseName()}.gcode`,
      toGCode(drawing, profile),
      "text/plain",
      "gcode",
      "GCode",
    );
  });

  window.addEventListener("resize", render);

  // First paint + an initial drawing so the canvas isn't empty.
  generate();
}

init();
