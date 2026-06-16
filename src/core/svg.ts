import { Drawing } from "./geometry";

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function escapeAttr(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

// Export the drawing as an SVG sized in real millimetres, one <g> per layer so
// the layer/colour split survives a round trip into other tools.
export function toSVG(d: Drawing): string {
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}mm" height="${d.height}mm" viewBox="0 0 ${d.width} ${d.height}">`,
  );
  for (const layer of d.layers) {
    lines.push(
      `  <g id="${escapeAttr(layer.name)}" stroke="${escapeAttr(layer.color)}" fill="none" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round">`,
    );
    for (const path of layer.paths) {
      if (path.length === 0) continue;
      const dAttr = path
        .map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`)
        .join(" ");
      lines.push(`    <path d="${dAttr}"/>`);
    }
    lines.push(`  </g>`);
  }
  lines.push(`</svg>`);
  return lines.join("\n");
}
