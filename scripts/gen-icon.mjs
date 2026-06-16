// Generate a 1024x1024 source app icon (no dependencies) in the app's
// ridgeline aesthetic: dark background with stacked pink ridge lines.
// Output: src-tauri/app-icon.png  ->  feed to `tauri icon`.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const S = 1024;
const buf = Buffer.alloc(S * S * 4);

function px(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = 255;
}

// Background vertical gradient.
for (let y = 0; y < S; y++) {
  const t = y / S;
  const r = Math.round(0x2b + (0x16 - 0x2b) * t);
  const g = Math.round(0x2c + (0x17 - 0x2c) * t);
  const b = Math.round(0x30 + (0x1b - 0x30) * t);
  for (let x = 0; x < S; x++) px(x, y, r, g, b);
}

// Stacked ridge lines with hidden-line feel: draw back-to-front, each line a
// sum of sines, in a pink->orange gradient.
const lines = 16;
const margin = 150;
const span = S - margin * 2;
for (let li = 0; li < lines; li++) {
  const baseY = margin + (li / (lines - 1)) * span;
  const t = li / (lines - 1);
  const cr = Math.round(0xff + (0xd6 - 0xff) * t);
  const cg = Math.round(0x6b + (0x33 - 0x6b) * t);
  const cb = Math.round(0x3c + (0x6c - 0x3c) * t);
  const amp = 70 * (0.4 + 0.6 * (1 - t));
  for (let x = margin; x < S - margin; x++) {
    const u = (x - margin) / span;
    const disp =
      Math.sin(u * Math.PI * 3 + li * 0.7) * amp +
      Math.sin(u * Math.PI * 7 + li * 1.9) * amp * 0.35;
    const y = Math.round(baseY - disp);
    for (let d = -3; d <= 3; d++) px(x, y + d, cr, cg, cb);
  }
}

// --- minimal PNG encoder ---
function crc32(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// Add filter byte (0) per scanline.
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(new URL("../src-tauri", import.meta.url), { recursive: true });
const out = new URL("../src-tauri/app-icon.png", import.meta.url);
writeFileSync(out, png);
console.log(`wrote ${out.pathname} (${png.length} bytes)`);
