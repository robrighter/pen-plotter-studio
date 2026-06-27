# Plot Options: Richer Controls, Dropdowns & Presets

Changes that make the generator plot options more variable and easier to
control, without changing the underlying drawing geometry or file formats.

## Summary

Previously every generator parameter was a numeric slider, including several
that were really *discrete choices* shoehorned into a slider (e.g. drag to "1"
for "inset" mode). This change:

1. Adds richer control types (dropdowns + toggles) to the parameter system.
2. Converts the cryptic numeric "mode" parameters into proper labeled choices.
3. Adds per-generator **style presets** and a **Surprise me** button for
   exploring coherent variations quickly.

All parameter values stay numeric under the hood, so the generation worker
contract (`Record<string, number>`) and the `.ppstudio` project format are
unchanged — save/load already covers the new controls.

## 1. New control types — `src/ui/controls.ts`

- `selectControl` — a labeled `<select>` whose options map a display label to a
  numeric value. Emits a number, so it round-trips unchanged.
- `toggleControl` — an on/off switch that emits `1` / `0`.

## 2. Typed parameter definitions — `src/main.ts`

`ParamDef` is now a discriminated union, fully backward compatible (entries
with no `kind` are treated as numeric sliders):

```ts
type ParamDef =
  | { kind?: "number"; key; label; min; max; step; randomize?: [number, number] }
  | { kind: "select"; key; label; options: { label: string; value: number }[] }
  | { kind: "toggle"; key; label };
```

`buildGeneratorControls` switches on `kind` to render the correct widget.

### Numeric modes converted to dropdowns / toggles

| Generator    | Parameter            | Now renders as                          |
| ------------ | -------------------- | --------------------------------------- |
| Voronoi      | `drawMode`           | Cell borders / Inset cells / Centers    |
| Streamlines  | `fieldType`          | Vortex / Source / Mixed                 |
| Streamlines  | `drawBidirectional`  | toggle                                  |
| Streamlines  | `imageTangent`       | toggle (Follow image tangent)           |
| Phyllotaxis  | `markMode`           | Circles / Ticks / Spirals               |
| Branching    | `startMode`          | Root / Center / Sides                   |
| Waves        | `sourceLayout`       | Random / Ring / Line                    |
| Hatching     | `angleMode`          | Gradient / Tangent / Fixed              |

## 3. Presets & "Surprise me" — `src/main.ts`, `index.html`, `src/style.css`

- `GeneratorDef` gained two optional fields:
  - `presets?: { name; values: Record<string, number> }[]` — curated looks.
  - `lockRandom?: string[]` — keys "Surprise me" must not touch.
- A **Style preset** dropdown appears at the top of the parameter panel for
  generators that define presets. Selecting one merges its snapshot onto the
  live values and regenerates.
- A **Surprise me** button (next to "Randomize seed") re-rolls every parameter
  within its sensible range — a random option for dropdowns, a fresh seed too —
  giving coherent variation instead of chaos.
- Heavy compute parameters (`gridSize`, `iterations`, `numParticles`, etc.) are
  flagged `lockRandom` on every generator so a random roll can never kick off a
  minutes-long render.

### Generators shipped with presets (3 each)

Flow Field, Ridgeline, Topographic, Voronoi, Streamlines, Phyllotaxis,
Hatching, Harmonic Ribbon. Remaining generators have `lockRandom` budgets set so
"Surprise me" stays fast; presets can be added to them with the same pattern.

## Files touched

- `src/ui/controls.ts` — `selectControl`, `toggleControl`.
- `src/main.ts` — `ParamDef` union, preset + lockRandom support,
  `buildPresetControl`, `surpriseActiveGenerator`, dropdown/toggle conversions.
- `index.html` — "Surprise me" button in a two-button row.
- `src/style.css` — `.button-row`, `.preset-field` styling.

## Verification

`npx tsc --noEmit` and `npx vite build` both pass clean.
