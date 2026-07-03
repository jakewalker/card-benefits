#!/usr/bin/env node
/**
 * Dependency-free PWA icon generator.
 *
 * Hand-encodes valid PNGs (RGB pixel buffer -> zlib deflate -> PNG chunks
 * with CRC32) drawing a simple rounded-rect "card" shape with an accent
 * stripe, no text, in a two-tone indigo palette. No image libraries.
 *
 * Output: public/icons/{icon-192,icon-512,icon-512-maskable,apple-touch-icon}.png
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");

// ---------------------------------------------------------------------------
// PNG encoding (RGB, no alpha — colorType 2, bit depth 8)
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** canvas: Uint8Array of size*size*3 (RGB, row-major, no padding). */
function encodePNG(canvas, size) {
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    raw.set(canvas.subarray(y * stride, y * stride + stride), rowStart + 1);
  }

  const idatData = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  return Buffer.concat([
    PNG_SIGNATURE,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idatData),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

function createCanvas(size) {
  return new Uint8Array(size * size * 3);
}

function setPx(canvas, size, x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 3;
  canvas[i] = r;
  canvas[i + 1] = g;
  canvas[i + 2] = b;
}

function fillRect(canvas, size, x0, y0, x1, y1, color) {
  const xs = Math.max(0, Math.round(x0));
  const xe = Math.min(size, Math.round(x1));
  const ys = Math.max(0, Math.round(y0));
  const ye = Math.min(size, Math.round(y1));
  for (let y = ys; y < ye; y++) {
    for (let x = xs; x < xe; x++) {
      setPx(canvas, size, x, y, color);
    }
  }
}

function fillRoundedRect(canvas, size, x0, y0, x1, y1, radius, color) {
  const xs = Math.max(0, Math.round(x0));
  const xe = Math.min(size, Math.round(x1));
  const ys = Math.max(0, Math.round(y0));
  const ye = Math.min(size, Math.round(y1));
  for (let y = ys; y < ye; y++) {
    for (let x = xs; x < xe; x++) {
      const nearLeft = x < x0 + radius;
      const nearRight = x > x1 - radius;
      const nearTop = y < y0 + radius;
      const nearBottom = y > y1 - radius;
      let inside = true;
      if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
        const cx = nearLeft ? x0 + radius : x1 - radius;
        const cy = nearTop ? y0 + radius : y1 - radius;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      if (inside) setPx(canvas, size, x, y, color);
    }
  }
}

// ---------------------------------------------------------------------------
// Icon design: deep indigo background, lighter rounded card, accent stripe.
// ---------------------------------------------------------------------------

const BASE = [26, 26, 46]; // #1a1a2e
const CARD = [79, 93, 149]; // #4f5d95
const STRIPE = [233, 69, 96]; // #e94560

/**
 * @param size icon dimensions (square)
 * @param contentFraction fraction of the canvas the drawing occupies,
 *   centered — 1 for normal icons, 0.8 to respect a maskable safe zone.
 */
function drawCardIcon(size, contentFraction = 1) {
  const canvas = createCanvas(size);
  fillRect(canvas, size, 0, 0, size, size, BASE);

  const contentSize = size * contentFraction;
  const offset = (size - contentSize) / 2;

  const cardW = contentSize * 0.78;
  const cardH = cardW / 1.586; // standard credit-card aspect ratio
  const cardX0 = offset + (contentSize - cardW) / 2;
  const cardY0 = offset + (contentSize - cardH) / 2;
  const cardX1 = cardX0 + cardW;
  const cardY1 = cardY0 + cardH;
  const radius = contentSize * 0.09;

  fillRoundedRect(canvas, size, cardX0, cardY0, cardX1, cardY1, radius, CARD);

  const stripeY0 = cardY0 + cardH * 0.24;
  const stripeH = cardH * 0.16;
  fillRect(canvas, size, cardX0, stripeY0, cardX1, stripeY0 + stripeH, STRIPE);

  return canvas;
}

// ---------------------------------------------------------------------------
// Generate + write files
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, contentFraction: 1 },
  { file: "icon-512.png", size: 512, contentFraction: 1 },
  { file: "icon-512-maskable.png", size: 512, contentFraction: 0.8 },
  { file: "apple-touch-icon.png", size: 180, contentFraction: 1 },
];

for (const { file, size, contentFraction } of targets) {
  const canvas = drawCardIcon(size, contentFraction);
  const png = encodePNG(canvas, size);
  const outPath = join(OUT_DIR, file);
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes)`);
}
