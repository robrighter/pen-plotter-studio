import "./style.css";
import { Drawing, Path, countPaths, drawnLength } from "./core/geometry";
import { flowField, flowFieldDefaults } from "./core/generators/flowField";
import { hilbert, hilbertDefaults } from "./core/generators/spaceFilling";
import { tsp, tspDefaults } from "./core/generators/tsp";
import { ridgeline, ridgelineDefaults } from "./core/generators/ridgeline";
import { optimizePaths } from "./core/optimize";
import { toSVG } from "./core/svg";
import { MachineProfile, defaultProfile, toGCode } from "./core/gcode";
import { renderPreview } from "./ui/preview";
import {
  checkControl,
  colorControl,
  numberControl,
  textControl,
} from "./ui/controls";
import { HeightField, fieldFromImageData } from "./core/imageField";

// --- Generator registry --------------------------------------------------

interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
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
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "numParticles", label: "Particles", min: 10, max: 3000, step: 10 },
      { key: "stepLength", label: "Step length (mm)", min: 0.2, max: 5, step: 0.1 },
      { key: "maxSteps", label: "Max steps", min: 10, max: 1000, step: 10 },
      { key: "noiseScale", label: "Noise scale", min: 0.001, max: 0.05, step: 0.001 },
      { key: "curl", label: "Curl", min: 0.5, max: 6, step: 0.1 },
    ],
    seedKey: "seed",
    run: (p) =>
      flowField({
        ...flowFieldDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
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
    },
    params: [
      { key: "seed", label: "Seed", min: 0, max: 9999, step: 1 },
      { key: "numPoints", label: "Points", min: 100, max: 4000, step: 50 },
      { key: "densityScale", label: "Density scale", min: 0.002, max: 0.05, step: 0.001 },
      { key: "twoOptPasses", label: "2-opt passes", min: 0, max: 6, step: 1 },
    ],
    seedKey: "seed",
    run: (p) =>
      tsp({
        ...tspDefaults,
        ...p,
        width: paper.width,
        height: paper.height,
        margin: paper.margin,
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

// Per-generator pen colour (seeded from each generator's default) + paper colour.
const colorValues: Record<string, string> = {};
for (const g of generators) colorValues[g.id] = g.color;
const paperColor = { value: "#ffffff" };

// Imported image heightfield (shared by image-driven generators).
let imageField: HeightField | null = null;
let imageName = "";
const imageInvert = { value: false };

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
const drawingTitle = $<HTMLHeadingElement>("drawing-title");
const drawingSubtitle = $<HTMLParagraphElement>("drawing-subtitle");
const layerColor = $<HTMLSpanElement>("layer-color");
const layerLabel = $<HTMLElement>("layer-label");

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
        regenerate();
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
        regenerate();
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
        regenerate();
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
      generate();
    });
    return button;
  });
  generatorTabs.replaceChildren(...tabs);
}

function buildGeneratorControls(): void {
  const g = activeGenerator();
  const values = paramValues[g.id];
  const nodes = g.params.map((p) =>
    numberControl({
      label: p.label,
      min: p.min,
      max: p.max,
      step: p.step,
      value: values[p.key],
      onChange: (v) => {
        values[p.key] = v;
      },
    }),
  );
  generatorControls.replaceChildren(...nodes);
}

function loadImageFile(file: File): void {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
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
    imageField = fieldFromImageData(cx.getImageData(0, 0, cw, ch));
    imageName = file.name;
    URL.revokeObjectURL(url);
    buildImageControls();
    generate();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    imageName = "";
    imageField = null;
    buildImageControls();
  };
  img.src = url;
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
          generate();
        },
      }),
    );
    const clear = document.createElement("button");
    clear.className = "secondary";
    clear.textContent = "Clear image";
    clear.addEventListener("click", () => {
      imageField = null;
      imageName = "";
      buildImageControls();
      generate();
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

function generate(): void {
  const g = activeGenerator();
  let paths = g.run(paramValues[g.id]);
  let travelBefore = 0;
  let travelAfter = 0;
  if (optimizeOn.value) {
    const r = optimizePaths(paths);
    paths = r.paths;
    travelBefore = r.travelBefore;
    travelAfter = r.travelAfter;
  }
  drawing = {
    width: paper.width,
    height: paper.height,
    layers: [{ name: g.label, color: colorValues[g.id], paths }],
  };
  render();
  updateStats(travelBefore, travelAfter);
}

/** Re-run only if we already have a drawing (e.g. after a paper change). */
function regenerate(): void {
  if (drawing) generate();
  else render();
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
  drawingTitle.textContent = `${g.id}.gcode`;
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

function download(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
    generate();
  });

  buildPaperControls();
  buildGeneratorControls();
  buildImageControls();
  buildColorControls();
  buildProfileControls();

  $<HTMLButtonElement>("btn-generate").addEventListener("click", generate);

  $<HTMLButtonElement>("btn-randomize").addEventListener("click", () => {
    const g = activeGenerator();
    if (!g.seedKey) return;
    paramValues[g.id][g.seedKey] = Math.floor(Math.random() * 10000);
    buildGeneratorControls();
    generate();
  });

  $<HTMLInputElement>("opt-optimize").addEventListener("change", (e) => {
    optimizeOn.value = (e.target as HTMLInputElement).checked;
    regenerate();
  });

  $<HTMLInputElement>("opt-show-travel").addEventListener("change", (e) => {
    showTravel.value = (e.target as HTMLInputElement).checked;
    render();
  });

  $<HTMLButtonElement>("btn-export-svg").addEventListener("click", () => {
    if (!drawing) return;
    download(`${activeId}.svg`, toSVG(drawing), "image/svg+xml");
  });

  $<HTMLButtonElement>("btn-export-gcode").addEventListener("click", () => {
    if (!drawing) return;
    download(`${activeId}.gcode`, toGCode(drawing, profile), "text/plain");
  });

  window.addEventListener("resize", render);

  // First paint + an initial drawing so the canvas isn't empty.
  generate();
}

init();
