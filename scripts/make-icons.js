// Draws the app icons with no dependencies — a leaf on a deep green field.
// Run with `npm run icons` if you ever want to change the colours.

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BACKGROUND = [0x2f, 0x5d, 0x3f];
const LEAF = [0xf2, 0xef, 0xe4];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** True where the leaf sits, in coordinates running -1..1 from the centre. */
function insideLeaf(x, y) {
  // Rotate 45° so the leaf lies on the diagonal.
  const u = (x - y) / Math.SQRT2;
  const v = (x + y) / Math.SQRT2;

  const scale = 1.15;
  const su = u * scale;
  const sv = v * scale;

  // Two overlapping circles offset along u leave a pointed lens — the blade —
  // running the length of v.
  const r = 1.05;
  const a = 0.82;
  const blade = (su - a) ** 2 + sv ** 2 <= r * r && (su + a) ** 2 + sv ** 2 <= r * r;

  const stem = Math.abs(su) <= 0.035 && sv >= -0.92 && sv <= -0.5;
  return blade || stem;
}

/** The midrib and the veins, cut back out of the blade. */
function insideVein(x, y) {
  const u = (x - y) / Math.SQRT2;
  const v = (x + y) / Math.SQRT2;
  const scale = 1.15;
  const su = u * scale;
  const sv = v * scale;

  const midrib = Math.abs(su) <= 0.032 && sv >= -0.62 && sv <= 0.58;
  if (midrib) return true;

  for (const start of [-0.4, -0.16, 0.08, 0.3]) {
    for (const side of [1, -1]) {
      // Each vein runs out from the midrib at roughly 40°, stopping short of the edge.
      const along = sv - start;
      if (along < 0 || along > 0.19) continue;
      const expected = side * along * 0.85;
      if (Math.abs(su - expected) <= 0.022) return true;
    }
  }
  return false;
}

function drawIcon(size) {
  const samples = 3;
  const pixels = Buffer.alloc(size * size * 3);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      let total = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = ((px + (sx + 0.5) / samples) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / samples) / size) * 2 - 1;
          total += 1;
          if (insideLeaf(x, y) && !insideVein(x, y)) hits += 1;
        }
      }
      const t = hits / total;
      const offset = (py * size + px) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(BACKGROUND[channel] * (1 - t) + LEAF[channel] * t);
      }
    }
  }
  return encodePng(size, size, pixels);
}

for (const size of [192, 512]) {
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(file, drawIcon(size));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
