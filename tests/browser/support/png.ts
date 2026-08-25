/**
 * A PNG reader, so a browser spec can measure the pixels a **DOM** element was
 * actually painted as. Support for item `D4`.
 *
 * `tests/browser/render-surface.spec.ts` samples rendered pixels through the
 * page itself, because what it measures is a `<canvas>` and a canvas can read
 * itself back with `getImageData`. The focus indicator is not on the canvas: it
 * is an `outline` the compositor paints outside a button's border box, and no
 * script running in the page can read it back. The only instrument that can is a
 * screenshot, and a screenshot is a PNG.
 *
 * So this decodes one. Node's `zlib` is the whole dependency: nothing is added to
 * `package.json`, which is the constraint every part of this build works under.
 * The subset is the subset Playwright emits, 8 bits per channel, colour type 2 or
 * 6, no interlacing, and anything else raises rather than being guessed at. A
 * decoder that silently mis-read a format would produce numbers that looked like
 * measurements, which is worse than a spec that cannot run.
 */

import { inflateSync } from 'node:zlib';

/** One decoded image: RGBA, four bytes per pixel, row major. */
export interface Bitmap {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** One colour, as the four channels a `Bitmap` carries. */
export type Rgba = readonly [number, number, number, number];

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Channels per pixel for the two colour types this reader accepts. */
const CHANNELS: Readonly<Record<number, number>> = { 2: 3, 6: 4 };

/**
 * Undo one scanline filter, in place, over the already-unfiltered previous row.
 *
 * The four filters are the PNG specification's, written out rather than folded
 * together: Paeth in particular is easy to get subtly wrong, and a subtly wrong
 * predictor produces an image that still looks plausible.
 */
function unfilter(
  type: number,
  row: Uint8Array,
  previous: Uint8Array | null,
  bytesPerPixel: number,
): void {
  const left = (index: number): number => (index >= bytesPerPixel ? (row[index - bytesPerPixel] ?? 0) : 0);
  const up = (index: number): number => previous?.[index] ?? 0;
  const upLeft = (index: number): number =>
    index >= bytesPerPixel ? (previous?.[index - bytesPerPixel] ?? 0) : 0;

  for (let index = 0; index < row.length; index += 1) {
    const raw = row[index] ?? 0;
    switch (type) {
      case 0:
        break;
      case 1:
        row[index] = (raw + left(index)) & 0xff;
        break;
      case 2:
        row[index] = (raw + up(index)) & 0xff;
        break;
      case 3:
        row[index] = (raw + ((left(index) + up(index)) >> 1)) & 0xff;
        break;
      case 4: {
        const a = left(index);
        const b = up(index);
        const c = upLeft(index);
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        row[index] = (raw + predicted) & 0xff;
        break;
      }
      default:
        throw new Error(`unknown PNG scanline filter ${String(type)}`);
    }
  }
}

/** Decode one PNG buffer to RGBA. Throws on anything outside the subset. */
export function decodePng(bytes: Buffer): Bitmap {
  for (const [index, expected] of SIGNATURE.entries()) {
    if (bytes[index] !== expected) {
      throw new Error('not a PNG: the signature does not match');
    }
  }

  let offset = SIGNATURE.length;
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Buffer[] = [];

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    if (type === 'IHDR') {
      width = bytes.readUInt32BE(start);
      height = bytes.readUInt32BE(start + 4);
      const depth = bytes[start + 8] ?? 0;
      const colourType = bytes[start + 9] ?? 0;
      const interlace = bytes[start + 12] ?? 0;
      if (depth !== 8) {
        throw new Error(`unsupported PNG bit depth ${String(depth)}`);
      }
      if (interlace !== 0) {
        throw new Error('unsupported interlaced PNG');
      }
      const found = CHANNELS[colourType];
      if (found === undefined) {
        throw new Error(`unsupported PNG colour type ${String(colourType)}`);
      }
      channels = found;
    } else if (type === 'IDAT') {
      parts.push(bytes.subarray(start, start + length));
    } else if (type === 'IEND') {
      break;
    }
    offset = start + length + 4;
  }

  if (width === 0 || height === 0 || channels === 0) {
    throw new Error('the PNG carried no usable header');
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const data = new Uint8Array(width * height * 4);
  let previous: Uint8Array | null = null;

  for (let y = 0; y < height; y += 1) {
    const at = y * (stride + 1);
    const filter = raw[at] ?? 0;
    const row = new Uint8Array(raw.subarray(at + 1, at + 1 + stride));
    unfilter(filter, row, previous, channels);
    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      data[to] = row[from] ?? 0;
      data[to + 1] = row[from + 1] ?? 0;
      data[to + 2] = row[from + 2] ?? 0;
      data[to + 3] = channels === 4 ? (row[from + 3] ?? 255) : 255;
    }
    previous = row;
  }

  return { width, height, data };
}

/** One pixel of a bitmap, by coordinate. */
export function pixelAt(bitmap: Bitmap, x: number, y: number): Rgba {
  const at = (y * bitmap.width + x) * 4;
  return [
    bitmap.data[at] ?? 0,
    bitmap.data[at + 1] ?? 0,
    bitmap.data[at + 2] ?? 0,
    bitmap.data[at + 3] ?? 0,
  ];
}

// ---------------------------------------------------------------------------
// WCAG contrast, over sampled pixels. The same arithmetic as
// `tests/browser/render-surface.spec.ts` and `tests/unit/tokens.test.ts`, which
// is deliberate: three instruments measuring the same quantity should not each
// carry their own reading of the formula.
// ---------------------------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminanceOf(rgb: Rgba): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastOf(a: Rgba, b: Rgba): number {
  const la = luminanceOf(a);
  const lb = luminanceOf(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A colour as `#rrggbb`, for a failure message a person can read. */
export function hexOf(rgb: Rgba): string {
  return `#${[rgb[0], rgb[1], rgb[2]].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * What one screenshot says about an indicator that appeared between two shots.
 *
 * The two bitmaps are the same clip of the same page, before and after the
 * element took focus, so every pixel that differs is part of what focus drew.
 * The indicator's colour is the **most common** colour among those pixels and
 * the background it replaced is the most common colour those same pixels held
 * before, which is what makes the reading a measurement of the ring rather than
 * of its antialiased edge: a 2 px solid outline is mostly solid, and the blended
 * pixels along its border are a minority of a minority.
 */
export interface IndicatorSample {
  /** How many pixels the focus changed. Zero means no indicator at all. */
  readonly changed: number;
  readonly indicator: Rgba;
  readonly background: Rgba;
  readonly contrast: number;
}

/** Which pixels differ between two same-sized bitmaps, and by how much. */
export function sampleIndicator(before: Bitmap, after: Bitmap): IndicatorSample {
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error('the two shots are different sizes');
  }
  const tallies = new Map<string, { readonly after: Rgba; readonly before: Rgba; count: number }>();
  let changed = 0;
  for (let y = 0; y < before.height; y += 1) {
    for (let x = 0; x < before.width; x += 1) {
      const was = pixelAt(before, x, y);
      const now = pixelAt(after, x, y);
      if (was[0] === now[0] && was[1] === now[1] && was[2] === now[2]) {
        continue;
      }
      changed += 1;
      const key = `${now.join(',')}|${was.join(',')}`;
      const held = tallies.get(key);
      if (held === undefined) {
        tallies.set(key, { after: now, before: was, count: 1 });
      } else {
        held.count += 1;
      }
    }
  }

  if (changed === 0) {
    return { changed: 0, indicator: [0, 0, 0, 0], background: [0, 0, 0, 0], contrast: 1 };
  }

  let best = { after: [0, 0, 0, 0] as Rgba, before: [0, 0, 0, 0] as Rgba, count: 0 };
  for (const entry of tallies.values()) {
    if (entry.count > best.count) {
      best = entry;
    }
  }
  return {
    changed,
    indicator: best.after,
    background: best.before,
    contrast: contrastOf(best.after, best.before),
  };
}
