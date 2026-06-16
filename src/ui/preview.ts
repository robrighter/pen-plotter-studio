import { Drawing, Point } from "../core/geometry";

export interface PreviewOptions {
  showTravel: boolean;
  paperColor: string;
}

// Render the drawing onto a canvas, fitting the paper into the available space.
// Draw moves are solid in the layer colour; pen-up travel moves are dashed red.
export function renderPreview(
  canvas: HTMLCanvasElement,
  drawing: Drawing,
  opts: PreviewOptions,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = 0;
  const scale = Math.min(
    (cssW - 2 * pad) / drawing.width,
    (cssH - 2 * pad) / drawing.height,
  );
  const ox = (cssW - drawing.width * scale) / 2;
  const oy = (cssH - drawing.height * scale) / 2;
  const tx = (x: number) => ox + x * scale;
  const tyf = (y: number) => oy + y * scale;

  // Paper.
  ctx.fillStyle = opts.paperColor;
  ctx.fillRect(ox, oy, drawing.width * scale, drawing.height * scale);
  ctx.strokeStyle = "#000000";
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, drawing.width * scale, drawing.height * scale);
  ctx.globalAlpha = 1;

  // Travel moves (under the ink).
  if (opts.showTravel) {
    ctx.strokeStyle = "rgba(220,60,60,0.55)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    let cur: Point = [0, 0];
    for (const layer of drawing.layers) {
      for (const path of layer.paths) {
        if (path.length === 0) continue;
        ctx.moveTo(tx(cur[0]), tyf(cur[1]));
        ctx.lineTo(tx(path[0][0]), tyf(path[0][1]));
        cur = path[path.length - 1];
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Ink.
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const layer of drawing.layers) {
    ctx.strokeStyle = layer.color;
    ctx.beginPath();
    for (const path of layer.paths) {
      if (path.length === 0) continue;
      ctx.moveTo(tx(path[0][0]), tyf(path[0][1]));
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(tx(path[i][0]), tyf(path[i][1]));
      }
    }
    ctx.stroke();
  }
}
