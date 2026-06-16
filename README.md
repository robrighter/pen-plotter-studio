# Pen Plotter Studio

Pen Plotter Studio is a desktop app for designing generative pen-plotter art,
previewing it on a virtual sheet of paper, and exporting the result as SVG or
GCode.

The app is built with Tauri 2 for the desktop shell and TypeScript/Vite for the
frontend. The drawing engine is intentionally path-first: generators produce
polylines in real paper-space millimeters, the preview renders those paths, the
optimizer reorders them to reduce pen-up travel, and the exporters write the
same drawing model to SVG or GCode.

## What the app does

- Creates plotter-friendly generative artwork from several built-in generators.
- Shows a live canvas preview on configurable paper dimensions.
- Lets you choose pen and paper colors for preview and SVG output.
- Optimizes path order to reduce pen-up travel distance.
- Optionally displays pen-up travel moves as dashed preview lines.
- Exports real-millimeter SVG files.
- Exports GCode using a configurable machine profile.

## Generators

Pen Plotter Studio currently includes:

- **Flow Field**: particles move through a seeded Perlin-noise vector field.
- **Hilbert Curve**: a continuous space-filling curve that makes a useful
  plotter calibration or stress-test pattern.
- **TSP / Stipple**: noise-weighted points joined into a single stroke with a
  nearest-neighbor route and 2-opt refinement.
- **Ridgeline**: stacked terrain-like lines with hidden-line removal, inspired
  by classic Joy Division style plots.

The ridgeline generator can also use an imported image as a heightfield. Image
brightness becomes terrain height, with an optional invert control.

## Interface overview

The refreshed UI is organized into three work areas:

- **Left rail**: paper settings, generator selection, generator parameters,
  image import, color controls, and generation actions.
- **Center stage**: the live paper preview with margin guide, scale labels,
  layer status, and travel-overlay controls.
- **Right inspector**: output stats, export actions, and machine profile
  settings.

This keeps creative controls, visual inspection, and machine/export details
separate while still visible during the normal workflow.

## Machine profile

GCode export uses a simple machine profile:

- Pen-up command
- Pen-down command
- Drawing feed rate
- Travel feed rate
- Optional Y-axis flip for machines that use a bottom-left origin

The default profile is intended as a starting point. Check the generated GCode
against your plotter or controller before running a real drawing.

## Running in development

Install dependencies:

```bash
npm install
```

Run the frontend in a browser:

```bash
npm run dev
```

By default Vite serves the app at:

```text
http://localhost:1420
```

Run the desktop app in development mode:

```bash
npm run tauri dev
```

## Building

Build the frontend:

```bash
npm run build
```

Build the Tauri desktop app and installers:

```bash
npm run tauri build
```

On Windows, successful Tauri release builds produce:

- `src-tauri/target/release/pen-plotter-app.exe`
- `src-tauri/target/release/bundle/msi/`
- `src-tauri/target/release/bundle/nsis/`

For more Windows packaging notes, see `BUILD-WINDOWS.md`.

## Project structure

```text
src/
  core/
    geometry.ts            Drawing, layer, path, and measurement helpers
    rng.ts                 Seeded random number generator
    noise.ts               Perlin-style noise helpers
    generators/            Flow field, Hilbert, TSP, and ridgeline generators
    optimize.ts            Pen-up travel optimization
    svg.ts                 SVG exporter
    gcode.ts               GCode exporter and machine profile
  ui/
    controls.ts            Framework-free DOM control helpers
    preview.ts             Canvas preview renderer
  main.ts                  App state, generator registry, and UI wiring

src-tauri/
  src/main.rs              Tauri desktop entry point
  tauri.conf.json          Tauri app and bundle configuration
```

## Notes

Exports currently use browser-style downloads from the webview. Future versions
could save through Tauri file dialogs, send GCode directly over serial, support
multi-pen layers, or add a GCode playback preview.
