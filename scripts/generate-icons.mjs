/**
 * Generates the PWA icons (public/icons/*) and the favicon source
 * (src/app/icon.png) without any image dependency: flat ink square with a
 * paper "L" glyph, matching the design system (no radius, two colours).
 *
 * Usage: node scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INK = [0x1a, 0x1a, 0x18, 0xff]; // #1a1a18
const PAPER = [0xf2, 0xf2, 0xee, 0xff]; // #f2f2ee

// --- minimal PNG encoder (RGBA, no filter) ----------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size, pixelAt) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4); // leading filter byte stays 0
    for (let x = 0; x < size; x++) {
      raw.set(pixelAt(x, y), row + 1 + x * 4);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- LifeOS glyph: blocky "L" -------------------------------------------------

function icon(size, glyphScale) {
  const box = size * glyphScale;
  const o = (size - box) / 2;
  const inRect = (x, y, x0, x1, y0, y1) =>
    x >= o + x0 * box && x < o + x1 * box && y >= o + y0 * box && y < o + y1 * box;
  return png(size, (x, y) => {
    const vertical = inRect(x, y, 0.3, 0.44, 0.2, 0.8);
    const horizontal = inRect(x, y, 0.3, 0.72, 0.66, 0.8);
    return vertical || horizontal ? PAPER : INK;
  });
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

writeFileSync(join(iconsDir, "icon-192.png"), icon(192, 1));
writeFileSync(join(iconsDir, "icon-512.png"), icon(512, 1));
// maskable: glyph inside the safe zone so launcher masks don't clip it
writeFileSync(join(iconsDir, "icon-maskable-512.png"), icon(512, 0.62));
writeFileSync(join(root, "src", "app", "icon.png"), icon(64, 1));

console.log("icons written: public/icons/{icon-192,icon-512,icon-maskable-512}.png + src/app/icon.png");
