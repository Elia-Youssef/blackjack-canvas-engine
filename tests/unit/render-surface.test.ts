/**
 * The surface wrapper under items E3, E4 and E5. Armour, not closure: all
 * three are Demonstration items and close at the ACCEPTANCE section 4 session;
 * this file holds the two structural rules every capture depends on.
 *
 * First, DESIGN 5's device-pixel rule: the backing store is sized
 * `cssSize * dpr`, the context is scaled by `dpr`, and **nothing else in the
 * render directory touches a device pixel**. The rule's failure mode is
 * recorded in the project instructions: `clientX` and the bounding rect are
 * both CSS pixels, so a second application of the ratio divides by it twice.
 * The wrapper is asserted directly, and then the whole directory is scanned
 * for a second application, with every scan pattern proven against a planted
 * sample so a typo in a pattern cannot report clean forever.
 *
 * Second, DESIGN 5's frame shape: two ordered passes, shapes then text, each
 * beginning and ending once and setting its state explicitly at the top. The
 * order and the state are read off the recorded instruction stream.
 *
 * The same scan bans the sources of nondeterminism and wall-clock time from
 * the directory: the render layer draws state it is handed, the loop and the
 * clock belong to the composition root at BJ-15, and the BJ-22 visual
 * baselines will diff pixels, so a `Math.random` or a `Date.now` anywhere
 * under `src/render/` is a defect even where no lint rule reaches it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  beginShapePass,
  beginTextPass,
  createSurface,
  endPass,
  font,
  renderFrame,
  roundedRectPath,
  SANS_FAMILY,
  SERIF_FAMILY,
} from '../../src/render/surface';
import { BORDER, SURFACE } from '../../src/render/tokens';
import { createRecordingCanvas, createRecordingContext, createStyleFreeCanvas } from './support/recording-context';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDER_DIR = join(PROJECT_ROOT, 'src', 'render');

describe('DPR: applied to the backing store once, and nowhere else', () => {
  it('sizes the store at cssSize * dpr and scales the context by dpr', () => {
    const { canvas, recording } = createRecordingCanvas();
    createSurface(canvas, { width: 640, height: 420, dpr: 2 });

    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(840);
    expect(recording.calls('scale')).toHaveLength(1);
    expect(recording.calls('scale')[0]?.args).toEqual([2, 2]);
  });

  it('keeps the CSS size in CSS pixels, untouched by the ratio', () => {
    // The half of the rule the double-division defect lives in: the element's
    // layout size never carries the ratio, only the store does.
    const { canvas } = createRecordingCanvas();
    createSurface(canvas, { width: 640, height: 420, dpr: 3 });
    expect(canvas.style.width).toBe('640px');
    expect(canvas.style.height).toBe('420px');
  });

  it('follows a fractional ratio to the nearest whole device pixel', () => {
    // Browser zoom hands out ratios like 2.6273; E3's capture at 200 percent
    // zoom is this case. The store is whole pixels, the scale is exact.
    const { canvas, recording } = createRecordingCanvas();
    createSurface(canvas, { width: 640, height: 420, dpr: 2.6273 });
    expect(canvas.width).toBe(Math.round(640 * 2.6273));
    expect(canvas.height).toBe(Math.round(420 * 2.6273));
    expect(recording.calls('scale')[0]?.args).toEqual([2.6273, 2.6273]);
  });

  it('resizes in place and re-derives the store from the new sizing', () => {
    const { canvas, recording } = createRecordingCanvas();
    const surface = createSurface(canvas, { width: 320, height: 200, dpr: 1 });
    surface.resize({ width: 800, height: 500, dpr: 2 });

    expect(surface.width).toBe(800);
    expect(surface.height).toBe(500);
    expect(surface.dpr).toBe(2);
    expect(canvas.width).toBe(1600);
    expect(recording.calls('scale')).toHaveLength(2);
    expect(recording.calls('scale')[1]?.args).toEqual([2, 2]);
  });

  it('clears in logical units, because drawing never sees the store', () => {
    const { canvas, recording } = createRecordingCanvas();
    const surface = createSurface(canvas, { width: 640, height: 420, dpr: 2 });
    surface.clear();
    expect(recording.calls('clearRect')[0]?.args).toEqual([0, 0, 640, 420]);
  });

  it('serves a style-free offscreen canvas without inventing a style', () => {
    const { canvas } = createStyleFreeCanvas();
    const surface = createSurface(canvas, { width: 64, height: 40, dpr: 2 });
    expect(canvas.width).toBe(128);
    expect(surface.width).toBe(64);
  });

  it('refuses a missing context and a nonsense sizing, loudly', () => {
    // QUALITY-BAR 2's unsupported-browser notice is the composition root's to
    // show; it can only show it if the failure surfaces as an error rather
    // than a blank canvas.
    const dead = {
      width: 0,
      height: 0,
      getContext: (): CanvasRenderingContext2D | null => null,
    };
    expect(() => createSurface(dead, { width: 10, height: 10, dpr: 1 })).toThrowError(/2d context/);

    const { canvas } = createRecordingCanvas();
    expect(() => createSurface(canvas, { width: 10, height: 10, dpr: 0 })).toThrowError(/pixel ratio/);
    expect(() => createSurface(canvas, { width: 10, height: 10, dpr: Number.NaN })).toThrowError(/pixel ratio/);
    expect(() => createSurface(canvas, { width: -4, height: 10, dpr: 1 })).toThrowError(/logical size/);
    expect(() => createSurface(canvas, { width: 10, height: 0, dpr: 1 })).toThrowError(/logical size/);
  });
});

describe('the frame: two ordered passes, state set explicitly at each top', () => {
  function frameRecording(): ReturnType<typeof createRecordingCanvas> {
    const made = createRecordingCanvas();
    const surface = createSurface(made.canvas, { width: 300, height: 200, dpr: 1 });
    renderFrame(surface, [
      {
        drawShapes: (ctx): void => {
          ctx.fillRect(1, 0, 0, 0);
        },
        drawText: (ctx): void => {
          ctx.fillText('first', 0, 0);
        },
      },
      {
        drawShapes: (ctx): void => {
          ctx.fillRect(2, 0, 0, 0);
        },
        drawText: (ctx): void => {
          ctx.fillText('second', 0, 0);
        },
      },
    ], SURFACE);
    return made;
  }

  it('draws every layer\'s shapes before any layer\'s text, layers in order', () => {
    const { recording } = frameRecording();

    const shapeIndexes = recording.calls('fillRect').map((call) => recording.entries.indexOf(call));
    const textIndexes = recording.calls('fillText').map((call) => recording.entries.indexOf(call));
    expect(shapeIndexes).toHaveLength(2);
    expect(textIndexes).toHaveLength(2);
    expect(Math.max(...shapeIndexes)).toBeLessThan(Math.min(...textIndexes));

    expect(recording.calls('fillRect').map((call) => call.args[0])).toEqual([1, 2]);
    expect(recording.calls('fillText').map((call) => call.args[0])).toEqual(['first', 'second']);
  });

  it('begins and ends each pass exactly once, clearing first', () => {
    const { recording } = frameRecording();
    expect(recording.calls('save')).toHaveLength(2);
    expect(recording.calls('restore')).toHaveLength(2);

    const clear = recording.indexOfCall('clearRect');
    expect(clear).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(recording.indexOfCall('save'));
  });

  it('sets the shape state explicitly at the top of the shape pass', () => {
    const { recording } = frameRecording();
    const start = recording.indexOfCall('save', 0);
    const firstShape = recording.indexOfCall('fillRect', 0);
    const between = recording.entries.slice(start, firstShape);

    const set = (property: string): unknown =>
      between.find((entry) => entry.kind === 'set' && entry.property === property);
    for (const property of ['globalAlpha', 'globalCompositeOperation', 'lineWidth', 'fillStyle', 'strokeStyle']) {
      expect(set(property), property).toBeDefined();
    }
    expect(recording.valueBefore(firstShape, 'lineWidth')).toBe(BORDER.hair);
    expect(recording.valueBefore(firstShape, 'fillStyle')).toBe(SURFACE.rankBlack);
    expect(
      between.some((entry) => entry.kind === 'call' && entry.op === 'setLineDash'),
    ).toBe(true);
  });

  it('sets the text state explicitly at the top of the text pass', () => {
    const { recording } = frameRecording();
    const start = recording.indexOfCall('save', 1);
    const firstText = recording.indexOfCall('fillText', 0);
    expect(start).toBeGreaterThan(-1);
    expect(firstText).toBeGreaterThan(start);
    const between = recording.entries.slice(start, firstText);

    const set = (property: string): unknown =>
      between.find((entry) => entry.kind === 'set' && entry.property === property);
    for (const property of ['font', 'textAlign', 'textBaseline', 'fillStyle', 'globalAlpha']) {
      expect(set(property), property).toBeDefined();
    }
    expect(recording.valueBefore(firstText, 'textAlign')).toBe('center');
    expect(recording.valueBefore(firstText, 'textBaseline')).toBe('middle');
    expect(recording.valueBefore(firstText, 'fillStyle')).toBe(SURFACE.print);
  });

  it('offers only generic font families, because nothing ships a webfont', () => {
    expect(SANS_FAMILY).toBe('sans-serif');
    expect(SERIF_FAMILY).toBe('serif');
    expect(font(16, SANS_FAMILY, 'bold')).toBe('bold 16px sans-serif');
    expect(font(12, SERIF_FAMILY)).toBe('normal 12px serif');
  });

  it('paths a rounded rectangle over arcTo, per the QUALITY-BAR 2 floor', () => {
    const recording = createRecordingContext();
    roundedRectPath(recording.ctx, 0, 0, 100, 60, 8);
    expect(recording.calls('arcTo')).toHaveLength(4);
    expect(recording.calls('roundRect')).toHaveLength(0);
    expect(recording.indexOfCall('beginPath')).toBeGreaterThan(-1);
    expect(recording.indexOfCall('closePath')).toBeGreaterThan(-1);
  });

  it('balances every begin with an end, so passes cannot leak state', () => {
    const recording = createRecordingContext();
    beginShapePass(recording.ctx, SURFACE);
    endPass(recording.ctx);
    beginTextPass(recording.ctx, SURFACE);
    endPass(recording.ctx);
    expect(recording.calls('save')).toHaveLength(2);
    expect(recording.calls('restore')).toHaveLength(2);
  });
});

describe('the directory scan: no second DPR, no clock, no randomness', () => {
  /** Comments are prose; the scan reads code. Mirrors tokens.test.ts. */
  function withoutComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  function renderSources(): { name: string; code: string }[] {
    return readdirSync(RENDER_DIR)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => ({
        name,
        code: withoutComments(readFileSync(join(RENDER_DIR, name), 'utf8')),
      }));
  }

  /** Every pattern carries a sample it must match, or the scan is a typo. */
  const CLOCK_AND_CHANCE: readonly { pattern: RegExp; sample: string }[] = [
    { pattern: /\bMath\.random\b/, sample: 'const roll = Math.random();' },
    { pattern: /\bDate\b/, sample: 'const t = Date.now();' },
    { pattern: /\bperformance\s*\./, sample: 'const t = performance.now();' },
    { pattern: /\bsetTimeout\s*\(/, sample: 'setTimeout(step, 16);' },
    { pattern: /\bsetInterval\s*\(/, sample: 'setInterval(step, 16);' },
    { pattern: /\brequestAnimationFrame\b/, sample: 'requestAnimationFrame(loop);' },
  ];

  // Every form accepts a dotted path before `dpr`, so a `spec.dpr` or
  // `this.dpr` receiver cannot slip past a scan written for the bare
  // identifier: the multiply and divide patterns spell the path out, the
  // left-multiply's `\b` already matches after a dot, and each sample plants
  // the dotted form. The bare form is proven separately, by the surface.ts
  // required-present check below.
  const DPR_ARITHMETIC: readonly { pattern: RegExp; sample: string }[] = [
    { pattern: /\*\s*(?:[\w$]+\s*\.\s*)*dpr\b/, sample: 'const device = width * spec.dpr;' },
    { pattern: /\bdpr\s*\*/, sample: 'const w = sizing.dpr * width;' },
    { pattern: /\/\s*(?:[\w$]+\s*\.\s*)*dpr\b/, sample: 'const logical = device / this.dpr;' },
  ];

  it('finds the render sources it scans', () => {
    const names = renderSources().map((source) => source.name);
    for (const expected of ['card.ts', 'chips.ts', 'felt.ts', 'surface.ts', 'tokens.ts']) {
      expect(names).toContain(expected);
    }
  });

  it('proves every pattern against its planted sample', () => {
    for (const { pattern, sample } of [...CLOCK_AND_CHANCE, ...DPR_ARITHMETIC]) {
      expect(pattern.test(sample), pattern.source).toBe(true);
    }
    expect(/\bdevicePixelRatio\b/.test('const dpr = window.devicePixelRatio;')).toBe(true);
  });

  it('keeps every clock and every random source out of src/render', () => {
    const offenders: string[] = [];
    for (const { name, code } of renderSources()) {
      for (const { pattern } of CLOCK_AND_CHANCE) {
        if (pattern.test(code)) {
          offenders.push(`${name}: ${pattern.source}`);
        }
      }
    }
    expect(offenders, 'render draws handed state; time and chance arrive as data').toEqual([]);
  });

  it('applies the device pixel ratio in surface.ts and nowhere else', () => {
    const sources = renderSources();
    const surfaceSource = sources.find((source) => source.name === 'surface.ts');
    expect(surfaceSource).toBeDefined();
    // The one application must exist, or this scan is watching for a rule
    // nothing implements.
    expect(DPR_ARITHMETIC[0]?.pattern.test(surfaceSource?.code ?? '')).toBe(true);

    const offenders: string[] = [];
    for (const { name, code } of sources) {
      if (name !== 'surface.ts') {
        for (const { pattern } of DPR_ARITHMETIC) {
          if (pattern.test(code)) {
            offenders.push(`${name}: ${pattern.source}`);
          }
        }
      }
      if (/\bdevicePixelRatio\b/.test(code)) {
        offenders.push(`${name}: devicePixelRatio is the composition root's to read`);
      }
    }
    expect(offenders, 'DPR is applied once, in the surface wrapper').toEqual([]);
  });
});
