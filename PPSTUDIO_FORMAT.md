# PPStudio Project File Format

Pen Plotter Studio project files use the `.ppstudio` extension.

The file is UTF-8 JSON. Version 1 stores one active plot configuration plus
enough supporting state to regenerate and export the drawing later.

## Top-Level Shape

```json
{
  "schema": "https://robrighter.local/pen-plotter-studio/ppstudio.schema.json",
  "format": "Pen Plotter Studio Project",
  "formatVersion": 1,
  "savedAt": "2026-06-18T12:00:00.000Z",
  "documentName": "my-plot",
  "paper": {
    "width": 210,
    "height": 297,
    "margin": 15
  },
  "generator": {
    "id": "ridgeline",
    "label": "Ridgeline (Joy Division)",
    "params": {},
    "color": "#d6336c"
  },
  "colors": {
    "paper": "#ffffff",
    "pensByGenerator": {}
  },
  "image": null,
  "output": {
    "optimizeTravel": true,
    "showTravel": false
  },
  "machineProfile": {}
}
```

## Embedded Images

If the active configuration uses an imported image, `image` is:

```json
{
  "name": "source.png",
  "mimeType": "image/png",
  "dataUrl": "data:image/png;base64,...",
  "invert": false
}
```

The app stores the downscaled working image used by the heightfield sampler, not
necessarily the original full-resolution file. This keeps project files smaller
and makes regeneration deterministic.

## Compatibility

Future versions should increment `formatVersion` when changing the stored shape.
Loaders should ignore unknown keys and preserve best-effort compatibility with
older files.
