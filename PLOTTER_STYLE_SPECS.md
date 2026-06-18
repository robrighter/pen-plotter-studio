# Plotter Style Implementation Specifications

This document specifies ten additional generative plotter styles for Pen Plotter
Studio. The goal is to add organic, math-driven drawing systems that fit the
existing app architecture:

- Generators produce `Path[]` in paper-space millimeters.
- The app wraps paths into a `Drawing`.
- The existing preview, travel optimizer, SVG exporter, and GCode exporter
  consume the same path model.
- Each style should be deterministic from a seed.
- Each style should expose controls that are useful without requiring the user
  to understand the full algorithm.

Unless noted otherwise, all new generators should live under
`src/core/generators/`, be registered in `src/main.ts`, and use the existing
paper inputs: `width`, `height`, and `margin`.

## Shared Implementation Requirements

### Generator Contract

Each generator should export:

```ts
export interface StyleOptions {
  width: number;
  height: number;
  margin: number;
  seed: number;
}

export const styleDefaults = { ... };

export function styleName(options: StyleOptions): Path[] {
  ...
}
```

Style-specific options should extend this pattern.

### Determinism

Use the existing seeded RNG in `src/core/rng.ts` for all random choices. The same
seed and parameter set should produce the same paths.

### Resolution And Performance

Many of these styles sample scalar fields or simulations. Keep default settings
fast enough for interactive use:

- Default generation target: under 500 ms where practical.
- Heavy generators may take longer, but should avoid browser freezes.
- Prefer coarse simulation grids plus path smoothing over high-resolution brute
  force.
- Expose resolution as a user parameter with conservative defaults.

### Plotter Safety

Generated output should avoid pathological toolpaths:

- Clamp output to the drawable area inside the paper margin.
- Remove paths shorter than a small epsilon.
- Avoid extremely dense defaults.
- Prefer continuous paths where possible.
- Keep path counts and drawn length visible through existing stats.

### Common UI Controls

Every new style should include:

- `Seed`
- Style-specific density/detail control
- Style-specific scale or size control
- Style-specific smoothing or simplification control where useful
- Pen color through the existing color system

## Image Input Opportunities

The current Ridgeline generator proves the useful pattern: an imported image is
converted into a sampled heightfield, then brightness influences the generated
paths. Several of the proposed styles can use the same idea. Image support
should reuse `src/core/imageField.ts` where possible and expose a consistent
small set of controls:

- `Import image`
- `Clear image`
- `Invert image`
- `Image influence`
- Optional `Contrast` or `Threshold`

Image input should be treated as an additional field source, not as a separate
export format. All outputs should still be normal `Path[]`.

### Strong Fits

These styles are especially well-suited to image input:

- **Contour / Topographic Maps**
  - Brightness becomes terrain height.
  - Contour lines become image isolines.
  - Best first target after Ridgeline because it uses the same heightfield idea.

- **Hatching From Scalar Fields**
  - Brightness controls hatch density, hatch length, or both.
  - Image gradients can control hatch direction.
  - This is the most natural route to engraving-like image translation.

- **TSP / Stipple**
  - Brightness controls point density.
  - Darker or lighter areas can receive more stipple points depending on invert.
  - The current TSP density field can be replaced or blended with image
    brightness.

- **Phyllotaxis / Botanical Spirals**
  - Image brightness controls mark size, mark omission, or local point density.
  - This could create portrait-like spiral seed drawings while preserving the
    botanical structure.

- **Metaball Field Contours**
  - Image brightness can modulate blob weights or contour thresholds.
  - Edge or brightness maxima can seed blob centers.
  - Useful for organic image abstractions rather than literal tracing.

### Good Fits With Extra Interpretation

These styles can use image input well, but need more design choices:

- **Streamline Bundles**
  - Image gradient can become a vector field.
  - Streamlines can follow image edges, shadows, or brightness flow.
  - Controls should choose between gradient-following and tangent-following.

- **Voronoi / Cell Structures**
  - Image brightness controls seed density.
  - More cells can appear in detailed or dark regions.
  - Cell size can encode image tone.

- **Space Colonization Trees**
  - Image brightness controls attractor placement.
  - Branches grow into dark/bright regions, producing root or vein structures
    that echo the imported image.
  - Edge-detected images would be especially effective as attractor fields.

- **Differential Growth**
  - Image brightness or edges can act as growth pressure.
  - Curves can expand away from bright areas or cling to image boundaries.
  - This is promising but needs careful tuning to avoid messy self-overlap.

### Possible But Less Direct

- **Reaction Diffusion Fields**
  - Image brightness can initialize chemical `B`, vary feed/kill rates, or act
    as a mask.
  - This will produce image-influenced organic texture rather than a literal
    image translation.
  - It is computationally heavier, so it should come after simpler image-driven
    scalar-field styles.

### Shared Image Field Controls

Recommended common options for image-capable generators:

- `imageMode`
  - `0`: procedural only
  - `1`: image only
  - `2`: blend procedural and image
- `imageInfluence`
  - `0` to `1`, controlling how strongly the imported image affects the style.
- `imageInvert`
  - Reuse the current invert behavior.
- `imageContrast`
  - Remap brightness around 0.5 before sampling.
- `imageBlur`
  - Optional pre-smoothing for noisy images.

### Suggested Image Input Implementation Order

1. **Topographic image contours**
   - Direct reuse of the Ridgeline heightfield pattern.
   - Lowest conceptual risk.

2. **Image hatching**
   - High payoff for plotter-style image translation.
   - Brightness-to-density is straightforward.

3. **Image TSP / stipple**
   - Classic plotter workflow.
   - The existing TSP generator already uses density sampling.

4. **Image-seeded Voronoi**
   - Strong visual identity.
   - Can share density sampling with TSP.

5. **Image-gradient streamlines**
   - Beautiful but more sensitive to parameter tuning.

6. **Image-attractor space colonization**
   - Excellent for vein/root interpretations of images.

7. **Image-modulated phyllotaxis**
   - Distinctive stylization after the core image workflows are proven.

8. **Image-modulated metaballs**
   - Good abstraction tool, but less literal.

9. **Image-guided differential growth**
   - Powerful but likely needs iterative tuning.

10. **Image-modulated reaction diffusion**
   - Rich texture, but heavier and less predictable.

## 1. Reaction Diffusion Fields

### Concept

Generate organic cellular patterns using a Gray-Scott reaction-diffusion
simulation. Convert the resulting chemical concentration field into contour
lines or boundaries.

Visual references: coral, fingerprints, lichen, membranes, chemical blooms.

### Algorithm

1. Create a 2D simulation grid.
2. Initialize chemicals `A` and `B`.
3. Seed several patches of `B` using the deterministic RNG.
4. Run Gray-Scott iterations:
   - Diffuse `A` and `B` using a Laplacian kernel.
   - Apply reaction term `A * B * B`.
   - Apply feed and kill rates.
5. Extract one or more contour levels from the final `B` field.
6. Convert contour segments into plotter paths.
7. Smooth and simplify paths.
8. Map grid coordinates into paper-space millimeters.

### Parameters

- `seed`: deterministic initialization.
- `gridSize`: simulation resolution, e.g. 80 to 260.
- `iterations`: simulation steps, e.g. 500 to 8000.
- `feed`: Gray-Scott feed rate.
- `kill`: Gray-Scott kill rate.
- `diffusionA`: diffusion rate for chemical A.
- `diffusionB`: diffusion rate for chemical B.
- `levels`: number of contour thresholds.
- `thresholdMin` / `thresholdMax`: contour range.
- `smoothing`: path smoothing strength.
- `minPathLength`: discard tiny contour fragments.

### Defaults

- `gridSize`: 160
- `iterations`: 2200
- `feed`: 0.055
- `kill`: 0.062
- `diffusionA`: 1.0
- `diffusionB`: 0.5
- `levels`: 5
- `thresholdMin`: 0.18
- `thresholdMax`: 0.42

### Implementation Notes

- Add a reusable contour extraction helper if not already implemented.
- Marching squares is sufficient.
- Start with one generated layer.
- Consider adding named presets later: `Coral`, `Spots`, `Stripes`, `Cells`.
- Image input can initialize chemical `B`, modulate feed/kill rates, or mask the
  reaction area. Prefer `imageInfluence` as a blend so the generator still has
  an organic reaction-diffusion character.

### Acceptance Criteria

- Produces closed or semi-closed organic contour paths.
- Same seed and parameters reproduce the same image.
- Default settings generate in a reasonable time.
- SVG and GCode exports work without special handling.

## 2. Contour / Topographic Maps

### Concept

Generate scalar terrain from noise, mathematical functions, or image brightness,
then draw contour lines at evenly spaced elevations.

Visual references: topographic maps, geological diagrams, weather maps, field
studies.

### Algorithm

1. Sample a scalar field on a 2D grid.
2. Combine multiple octaves of noise with optional radial or directional terms.
3. Normalize values to `[0, 1]`.
4. Extract contour lines at `n` levels.
5. Smooth and simplify paths.
6. Map paths into the drawable paper area.

### Parameters

- `seed`
- `fieldSource`: procedural, image, or blended.
- `imageInfluence`
- `imageInvert`
- `imageContrast`
- `gridSize`
- `levels`
- `noiseScale`
- `octaves`
- `persistence`
- `lacunarity`
- `ridgeStrength`
- `islandFalloff`
- `smoothing`
- `minPathLength`

### Defaults

- `gridSize`: 180
- `levels`: 14
- `noiseScale`: 0.018
- `octaves`: 4
- `persistence`: 0.5
- `lacunarity`: 2.0
- `ridgeStrength`: 0.25
- `islandFalloff`: 0.35

### Implementation Notes

- This should become the foundation for other scalar-field styles.
- The contour extraction code can be shared by Reaction Diffusion, Metaballs,
  Wave Interference, and image contouring.
- Use `noise.ts` where possible.
- Image input should map brightness directly to elevation. In blended mode,
  combine image brightness with procedural terrain before normalization.

### Acceptance Criteria

- Produces clean map-like contour layers.
- Contour count responds predictably to `levels`.
- Paths remain inside the paper margin.

## 3. Differential Growth

### Concept

Simulate a growing closed or open curve whose points repel each other while new
points are inserted along long segments. The result is ruffled, vein-like,
biological linework.

Visual references: coral edges, leaf veins, cellular growth, organic folds.

### Algorithm

1. Initialize one or more seed curves, usually a circle or loop.
2. At each iteration:
   - Compute repulsion between nearby points.
   - Apply optional attraction to the previous curve structure.
   - Apply smoothing along neighboring points.
   - Insert points along segments longer than `splitLength`.
   - Clamp points to drawable bounds or softly push them inward.
3. Convert final point loops into paths.
4. Optionally draw growth history as multiple nested paths.

### Parameters

- `seed`
- `startShape`: circle, line, ring, blob.
- `iterations`
- `initialPoints`
- `maxPoints`
- `repulsionRadius`
- `repulsionStrength`
- `splitLength`
- `smoothing`
- `boundsForce`
- `historyEvery`

### Defaults

- `startShape`: circle
- `iterations`: 600
- `initialPoints`: 48
- `maxPoints`: 1800
- `repulsionRadius`: 6 mm
- `repulsionStrength`: 0.45
- `splitLength`: 3 mm
- `smoothing`: 0.18
- `historyEvery`: 0

### Implementation Notes

- Use a spatial hash/grid for neighbor lookup once point counts grow.
- Keep a hard cap on `maxPoints`.
- Output can be one closed path or multiple history rings.
- Image input can provide a pressure field. Use brightness or edge strength to
  push growth outward, pull it toward boundaries, or slow growth in protected
  areas.

### Acceptance Criteria

- Produces organic, non-self-uniform growth.
- Does not freeze the UI at defaults.
- Stops gracefully when `maxPoints` is reached.

## 4. Voronoi / Cell Structures

### Concept

Create cellular structures from seeded points using Voronoi-like regions,
distortion, relaxation, and optional inset borders.

Visual references: leaf cells, foam, cracked mud, insect wings, membranes.

### Algorithm

1. Generate deterministic seed points within the drawable area.
2. Optionally relax points using Lloyd relaxation.
3. Compute cell boundaries.
4. Optionally distort boundary points with noise.
5. Optionally inset each cell toward its centroid.
6. Return cell boundary paths.

### Parameters

- `seed`
- `densitySource`: uniform, procedural, image, or blended.
- `imageInfluence`
- `imageInvert`
- `imageContrast`
- `points`
- `relaxationPasses`
- `drawMode`: borders, inset cells, dual graph, centers connected.
- `jitter`
- `noiseWarp`
- `inset`
- `minCellArea`
- `edgeClip`

### Defaults

- `points`: 120
- `relaxationPasses`: 2
- `drawMode`: inset cells
- `jitter`: 0.25
- `noiseWarp`: 0.8 mm
- `inset`: 0.18

### Implementation Notes

- A full robust Voronoi library is not currently present. Options:
  - Implement bounded half-plane clipping per seed point. This is simple enough
    for moderate point counts.
  - Or add a small dependency if acceptable later.
- Half-plane clipping approach:
  - Start each cell as the drawable rectangle.
  - For every other point, clip against the perpendicular bisector.
  - This is `O(n^2)` but fine for default point counts around 100.
- Image input should affect seed density first. A later refinement can map
  brightness to cell inset, cell omission, or local relaxation strength.

### Acceptance Criteria

- Produces bounded cells inside the margin.
- No paths extend off paper.
- Inset mode avoids excessive pen-up travel by producing clean loops.

## 5. Streamline Bundles

### Concept

Trace streamlines through analytic vector fields. Compared with the existing
Flow Field generator, this style should feel more diagrammatic and scientific:
sources, sinks, vortices, dipoles, and field-line bundles.

Visual references: magnetic field diagrams, fluid flow, weather maps, fiber
tracts, anatomical flow illustrations.

### Algorithm

1. Create a vector field from one or more attractors, repulsors, vortices, or
   analytic equations.
2. Place seed points using a grid, rings, or randomized distribution.
3. Integrate forward and optionally backward using Euler or RK4.
4. Stop at bounds, max length, low velocity, or collision with existing lines.
5. Optionally enforce spacing between lines with a distance field.

### Parameters

- `seed`
- `fieldSource`: analytic, image-gradient, image-tangent, or blended.
- `imageInfluence`
- `imageInvert`
- `imageContrast`
- `fieldType`: vortices, dipole, sources, noise blend, saddle.
- `sourceCount`
- `seedMode`: grid, ring, random, boundary.
- `lineCount`
- `stepLength`
- `maxSteps`
- `fieldScale`
- `spacing`
- `curl`
- `drawBidirectional`

### Defaults

- `fieldType`: vortices
- `sourceCount`: 5
- `seedMode`: boundary
- `lineCount`: 220
- `stepLength`: 1.2 mm
- `maxSteps`: 450
- `spacing`: 2.2 mm
- `drawBidirectional`: true

### Implementation Notes

- Can reuse ideas from the existing Flow Field generator.
- Differentiate it by using analytic field primitives and spacing constraints.
- RK4 gives smoother curves but Euler is acceptable for first version.
- Image input should use brightness gradients: gradient-following creates
  shadow-flow diagrams, while tangent-following traces along image edges and
  contours.

### Acceptance Criteria

- Field structure is visually legible.
- Lines do not become a uniform hairball at defaults.
- Controls produce noticeably different diagram families.

## 6. Phyllotaxis / Botanical Spirals

### Concept

Draw botanical arrangements based on phyllotaxis, especially golden-angle
spirals. Output can be dots, circles, linked paths, seed spirals, or hatch marks.

Visual references: sunflower heads, pinecones, succulents, seed pods, botanical
diagrams.

### Algorithm

1. Generate `n` points using:
   - `angle = i * goldenAngle`
   - `radius = scale * sqrt(i)`
2. Optionally warp points with noise.
3. Draw one of several mark modes:
   - Tiny circles
   - Short tangent strokes
   - Linked spiral paths
   - Density-varying rings
4. Clip marks to the drawable area.

### Parameters

- `seed`
- `imageMode`: off, density, mark size, or omission.
- `imageInfluence`
- `imageInvert`
- `imageContrast`
- `points`
- `angleOffset`
- `radialScale`
- `markMode`: dots, circles, ticks, spiral paths.
- `markSize`
- `noiseWarp`
- `centerX`
- `centerY`
- `ellipseRatio`
- `rotation`

### Defaults

- `points`: 900
- `angleOffset`: 137.507764 degrees
- `radialScale`: 2.4
- `markMode`: ticks
- `markSize`: 1.4 mm
- `noiseWarp`: 0.2 mm

### Implementation Notes

- This should be one of the quickest generators to implement.
- Circle marks should be approximated as polylines.
- Spiral paths can connect every `k`th point to reveal parastichy families.
- Image input should preserve the phyllotaxis structure while modulating marks.
  The first implementation should vary mark size and omit marks based on
  brightness.

### Acceptance Criteria

- Produces clear botanical spiral structure.
- Mark count and mark size are controllable.
- Output remains plotter-friendly at defaults.

## 7. L-Systems / Space Colonization Trees

### Concept

Generate branching organic structures using either symbolic L-systems or a
space-colonization algorithm. Space colonization is preferred for organic,
diagrammatic roots, trees, veins, and deltas.

Visual references: roots, leaf veins, trees, river deltas, lightning, mycelium.

### Algorithm: Space Colonization

1. Place attractor points in a region.
2. Start one or more root nodes.
3. For each iteration:
   - Assign attractors to nearby branch tips.
   - Grow tips toward their assigned attractor cluster.
   - Remove attractors that are reached.
4. Convert the branch graph into paths.
5. Optionally draw parent-child branches as individual paths or continuous
   traced branch chains.

### Parameters

- `seed`
- `attractorSource`: procedural, image brightness, image edges, or blended.
- `imageInfluence`
- `imageInvert`
- `imageContrast`
- `attractorCount`
- `startMode`: root, center, edge, multiple roots.
- `growthStep`
- `attractionRadius`
- `killRadius`
- `branchJitter`
- `gravity`
- `maxIterations`
- `drawMode`: skeleton, twigs, contours, weighted passes.

### Defaults

- `attractorCount`: 700
- `startMode`: bottom root
- `growthStep`: 2.2 mm
- `attractionRadius`: 16 mm
- `killRadius`: 4 mm
- `branchJitter`: 0.12
- `gravity`: -0.15
- `maxIterations`: 900

### Implementation Notes

- Start with space colonization rather than full symbolic L-systems.
- Later, add L-system presets for more geometric branching.
- If line weight is desired, approximate it with repeated offset paths or leave
  it for a future multi-pass pen feature.
- Image input should place attractors according to brightness or edge strength.
  This lets branches grow into the structure of an image while still looking
  like roots, veins, or deltas.

### Acceptance Criteria

- Produces recognizable branching structures.
- Does not generate excessive duplicate segments.
- Branches remain inside the drawable area.

## 8. Moire / Wave Interference Diagrams

### Concept

Sum waves from point sources, radial functions, or sine fields, then draw
isolines or phase bands. The result is a scientific-looking interference map.

Visual references: ripple tanks, wave physics diagrams, moire fields, magnetic
or acoustic maps.

### Algorithm

1. Place wave sources deterministically.
2. Sample a scalar field:
   - `value += sin(distance * frequency + phase) * amplitude`
3. Optionally add directional sine waves.
4. Normalize or use raw signed values.
5. Extract contours at phase levels.
6. Smooth and simplify.

### Parameters

- `seed`
- `sourceCount`
- `frequency`
- `phase`
- `amplitudeJitter`
- `directionalMix`
- `levels`
- `gridSize`
- `sourceLayout`: random, ring, line, corners.
- `smoothing`

### Defaults

- `sourceCount`: 4
- `frequency`: 0.12
- `phase`: 0
- `directionalMix`: 0.25
- `levels`: 12
- `gridSize`: 180
- `sourceLayout`: ring

### Implementation Notes

- Reuse contour extraction.
- Signed fields can create especially interesting contour families.
- Add optional source markers later as a separate layer.
- Image input is less direct here, but image brightness can modulate wave
  amplitude or phase. Keep this secondary to the procedural interference
  controls.

### Acceptance Criteria

- Produces recognizable interference bands.
- Changing source count and frequency has obvious visual impact.
- Defaults avoid over-dense contour noise.

## 9. Metaball Field Contours

### Concept

Create organic blob diagrams by summing influence fields from weighted points,
then drawing contours through the scalar field.

Visual references: membranes, microscopic clusters, liquid blobs, map-like
organic regions.

### Algorithm

1. Generate weighted blob centers.
2. For each grid sample, compute field value:
   - `value += weight / (distance^power + epsilon)`
   - or use Gaussian falloff.
3. Normalize or clamp the field.
4. Extract contour levels.
5. Smooth, simplify, and discard tiny paths.

### Parameters

- `seed`
- `fieldSource`: procedural, image-weighted blobs, image-seeded blobs, or
  blended.
- `imageInfluence`
- `imageInvert`
- `imageContrast`
- `blobCount`
- `gridSize`
- `levels`
- `falloffPower`
- `minRadius`
- `maxRadius`
- `thresholdMin`
- `thresholdMax`
- `noiseWarp`
- `smoothing`

### Defaults

- `blobCount`: 18
- `gridSize`: 180
- `levels`: 8
- `falloffPower`: 2.0
- `minRadius`: 8 mm
- `maxRadius`: 28 mm
- `thresholdMin`: 0.22
- `thresholdMax`: 0.72
- `noiseWarp`: 0.5 mm

### Implementation Notes

- This is a strong first contour-based addition.
- It is simpler than reaction diffusion while still very organic.
- It can share most machinery with topographic contours.
- Image input can either seed blob centers from bright/dark regions or modulate
  blob weights after procedural placement. Seeded blobs will feel more image
  literal; weighted blobs will feel more abstract.

### Acceptance Criteria

- Produces clean organic nested boundaries.
- Runs quickly at default resolution.
- Contour levels are evenly distributed and visually useful.

## 10. Hatching From Scalar Fields

### Concept

Generate curved hatching whose density, orientation, or length follows a scalar
field. This creates an engraved scientific-illustration look.

Visual references: botanical engraving, terrain shading, anatomical plates,
field sketches.

### Algorithm

1. Generate or import a scalar field.
2. For each candidate hatch row or seed point:
   - Sample field value.
   - Decide whether to draw based on density threshold.
   - Determine local angle from field gradient or noise.
   - Trace a short curved hatch segment.
3. Vary hatch length or spacing based on field value.
4. Clip segments to the drawable area.

### Parameters

- `seed`
- `fieldType`: noise, radial, image, metaball.
- `imageInfluence`
- `imageInvert`
- `imageContrast`
- `imageBlur`
- `hatchCount`
- `spacing`
- `minLength`
- `maxLength`
- `angleMode`: gradient, tangent, noise, fixed.
- `angleJitter`
- `densityScale`
- `curvature`
- `contrast`

### Defaults

- `fieldType`: noise
- `hatchCount`: 1200
- `spacing`: 3 mm
- `minLength`: 2 mm
- `maxLength`: 9 mm
- `angleMode`: gradient
- `angleJitter`: 0.18
- `densityScale`: 0.65
- `curvature`: 0.25

### Implementation Notes

- This can reuse image heightfield utilities later.
- Start with generated noise fields before adding image-driven hatching.
- To keep output plotter-friendly, hatches should be separate short paths, and
  the existing travel optimizer can reorder them.
- Image input should be a first-class mode. Brightness maps to hatch density and
  length; image gradients should optionally control hatch direction.

### Acceptance Criteria

- Produces visually coherent shaded regions.
- Density responds to scalar values.
- Default output is detailed but not excessive.

## Suggested Implementation Order

1. **Metaball Field Contours**
   - High visual payoff.
   - Relatively simple.
   - Establishes shared contour extraction.

2. **Contour / Topographic Maps**
   - Reuses contour extraction.
   - Creates a reusable scalar-field foundation.

3. **Wave Interference Diagrams**
   - Also reuses contour extraction.
   - Adds strong mathematical variety.

4. **Phyllotaxis / Botanical Spirals**
   - Fast to implement.
   - Adds a distinct botanical family.

5. **Streamline Bundles**
   - Builds on the existing Flow Field mental model.
   - Adds scientific diagram structure.

6. **Hatching From Scalar Fields**
   - Uses scalar-field work from earlier styles.

7. **Voronoi / Cell Structures**
   - Needs robust bounded-cell generation.

8. **Differential Growth**
   - Very distinctive, but needs careful performance management.

9. **Space Colonization Trees**
   - Distinctive, graph-based, and likely worth a focused pass.

10. **Reaction Diffusion Fields**
   - Visually rich but computationally heavier.
   - Best after contour extraction and performance patterns are settled.

## Shared Helpers To Add

### `src/core/field.ts`

Potential shared scalar-field utilities:

- Grid allocation.
- Grid sampling.
- Bilinear interpolation.
- Normalization.
- Gradient estimation.
- Noise field generation.
- Radial falloff helpers.

### `src/core/contours.ts`

Potential shared contour utilities:

- Marching squares.
- Segment joining.
- Path simplification.
- Closed-loop detection.
- Minimum path length filtering.

### `src/core/spatial.ts`

Potential shared spatial utilities:

- Spatial hash for nearby-point queries.
- Distance-to-existing-line checks.
- Bounds clipping helpers.

## UI Registration Notes

The current generator selector can support these new entries directly. However,
ten additional styles will make the generator list long. Consider grouping
generators into families later:

- Field Lines
- Contours
- Cellular
- Botanical
- Branching
- Hatching

The icon tab row can remain a shortcut for the most-used styles, while the full
select includes all generators.
