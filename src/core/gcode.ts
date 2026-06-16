import { Drawing } from "./geometry";

// The machine profile captures everything plotter-specific so the same drawing
// can target different hardware. Pen up/down can be servo commands (M3/M5) or
// Z moves ("G1 Z0" / "G0 Z5") — it's just text emitted verbatim.
export interface MachineProfile {
  name: string;
  units: "mm" | "inch";
  /** command(s) that lift the pen */
  penUp: string;
  /** command(s) that drop the pen */
  penDown: string;
  /** feed rate while drawing (units/min) */
  drawFeed: number;
  /** feed rate while travelling with the pen up (units/min) */
  travelFeed: number;
  bedWidth: number;
  bedHeight: number;
  /** flip Y so the origin is bottom-left, the usual plotter convention */
  originBottomLeft: boolean;
  /** dwell after raising the pen, ms (lets the servo settle) */
  penUpDelayMs: number;
  /** dwell after lowering the pen, ms */
  penDownDelayMs: number;
}

export const defaultProfile: MachineProfile = {
  name: "Generic GRBL servo",
  units: "mm",
  penUp: "M5",
  penDown: "M3 S40",
  drawFeed: 3000,
  travelFeed: 8000,
  bedWidth: 210,
  bedHeight: 297,
  originBottomLeft: true,
  penUpDelayMs: 150,
  penDownDelayMs: 150,
};

function num(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

export function toGCode(d: Drawing, profile: MachineProfile): string {
  const out: string[] = [];
  // Flip Y into plotter space if the machine homes at the bottom-left.
  const ty = (y: number) => (profile.originBottomLeft ? d.height - y : y);
  const dwell = (ms: number) => {
    if (ms > 0) out.push(`G4 P${(ms / 1000).toFixed(3)}`);
  };

  out.push(`; Pen Plotter Studio`);
  out.push(`; profile: ${profile.name}`);
  out.push(`; drawing: ${num(d.width)} x ${num(d.height)} mm`);
  out.push(profile.units === "mm" ? "G21" : "G20");
  out.push("G90"); // absolute coordinates
  out.push(profile.penUp);
  dwell(profile.penUpDelayMs);

  for (const layer of d.layers) {
    out.push(`; layer: ${layer.name}`);
    for (const path of layer.paths) {
      if (path.length < 2) continue;
      const [sx, sy] = path[0];
      out.push(`G0 X${num(sx)} Y${num(ty(sy))} F${num(profile.travelFeed)}`);
      out.push(profile.penDown);
      dwell(profile.penDownDelayMs);
      out.push(`G1 F${num(profile.drawFeed)}`);
      for (let i = 1; i < path.length; i++) {
        const [x, y] = path[i];
        out.push(`G1 X${num(x)} Y${num(ty(y))}`);
      }
      out.push(profile.penUp);
      dwell(profile.penUpDelayMs);
    }
  }

  out.push("G0 X0 Y0");
  out.push(profile.penUp);
  return out.join("\n");
}
