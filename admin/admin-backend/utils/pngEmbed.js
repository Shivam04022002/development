// utils/pngEmbed.js
//
// Minimal PNG reader for embedding a raster logo into a PDF, using only Node's
// built-in zlib. Supports 8-bit non-interlaced RGB (colour type 2) and RGBA
// (colour type 6) — which is what the Surjit Finance logo is.
//
// Returns the colour samples and, for RGBA, the alpha channel separately so the
// PDF can carry it as an /SMask.

import zlib from "zlib";

/** Undo the per-scanline PNG filters (RFC 2083 section 6). */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;      // left
      const b = prev ? prev[x] : 0;               // up
      const c = prev && x >= bpp ? prev[x - bpp] : 0; // up-left
      const v = line[x];
      let val;
      switch (filter) {
        case 0: val = v; break;
        case 1: val = v + a; break;
        case 2: val = v + b; break;
        case 3: val = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`unsupported PNG filter ${filter}`);
      }
      cur[x] = val & 0xff;
    }
  }
  return out;
}

/**
 * readPng(buffer) → { width, height, rgb, alpha }
 *   rgb   — Buffer of width*height*3 samples
 *   alpha — Buffer of width*height samples, or null when fully opaque
 * Throws on an unsupported variant so the caller can fall back to text.
 */
export function readPng(buffer) {
  if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new Error("not a PNG");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  let p = 8;
  while (p + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(p);
    const type = buffer.toString("latin1", p + 4, p + 8);
    const data = buffer.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG unsupported");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    p += 12 + len; // length + type + data + crc
  }

  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} unsupported`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`colour type ${colorType} unsupported`);

  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = unfilter(raw, width, height, bpp);

  if (colorType === 2) return { width, height, rgb: pixels, alpha: null };

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height);
  let opaque = true;
  for (let i = 0, j = 0, k = 0; i < pixels.length; i += 4, j += 3, k += 1) {
    rgb[j] = pixels[i];
    rgb[j + 1] = pixels[i + 1];
    rgb[j + 2] = pixels[i + 2];
    alpha[k] = pixels[i + 3];
    if (pixels[i + 3] !== 255) opaque = false;
  }
  return { width, height, rgb, alpha: opaque ? null : alpha };
}

/**
 * pngToPdfImage(buffer) → { width, height, streams }
 * `streams` are ready-to-write PDF object bodies: the image XObject and, when
 * the PNG carries transparency, its soft mask.
 */
export function pngToPdfImage(buffer) {
  const { width, height, rgb, alpha } = readPng(buffer);
  const image = zlib.deflateSync(rgb);
  const mask = alpha ? zlib.deflateSync(alpha) : null;
  return { width, height, image, mask };
}

export default { readPng, pngToPdfImage };
