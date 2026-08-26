/**
 * The play surface wrapper. Part of items E3, E4 and E5 (all method D: the
 * scripted captures at the demonstration session close them; what lives here is
 * the behaviour they capture).
 *
 * Three jobs, and they are DESIGN 5's three sentences:
 *
 * 1. **Device pixel ratio is handled here and nowhere else.** The backing store
 *    is sized `cssSize * dpr` and the context is scaled by `dpr`, so every
 *    drawing call in this directory works in logical CSS pixels and never sees
 *    a device pixel. Nothing else under `src/render/` may multiply or divide by
 *    a device pixel ratio: the double-application defect that rule prevents is
 *    recorded in the project instructions, and `tests/unit/render-surface.test.ts`
 *    scans for a second occurrence. The ratio itself arrives as data; this
 *    module does not read `window.devicePixelRatio`, because the composition
 *    root at BJ-15 owns the platform and everything here must run headless
 *    under test.
 *
 * 2. **Two ordered passes per frame, shapes then text.** Each pass begins and
 *    ends once and sets its canvas state explicitly at the top rather than
 *    inheriting it, so a pass cannot depend on what the previous one left
 *    behind. `renderFrame` is the only frame entry point and the order is fixed
 *    in it, not left to callers.
 *
 * 3. **The canvas is the play surface only.** Nothing in this directory draws a
 *    button, a readout, a panel or a label; chrome is DOM (QUALITY-BAR 1). The
 *    felt's printed house rules at E5 are table printing, part of the scene.
 *
 * The canvas parameter is structural rather than `HTMLCanvasElement` so the
 * whole module runs under Vitest's node environment against a recording
 * context. A real element satisfies the type without a cast.
 */

import { BORDER, SPACE, SURFACE } from './tokens';

/**
 * The part of a canvas element this module needs. `HTMLCanvasElement` and
 * `document.createElement('canvas')` both satisfy it; so does the offscreen
 * canvas the felt bakes into, and so does a test stub.
 */
export interface SurfaceCanvas {
  width: number;
  height: number;
  /** Present on a DOM element, absent on an offscreen or a stub. */
  readonly style?: { width: string; height: string };
  getContext(contextId: '2d'): CanvasRenderingContext2D | null;
}

/** The logical size of the surface and the ratio the backing store honours. */
export interface SurfaceSizing {
  /** Logical width in CSS pixels. Every drawing call works in these units. */
  readonly width: number;
  /** Logical height in CSS pixels. */
  readonly height: number;
  /**
   * Device pixels per CSS pixel, fractional values included: browser zoom
   * produces values like 2.6273 and the store must follow them, which is what
   * keeps E3's capture crisp at 200 percent zoom.
   */
  readonly dpr: number;
}

/**
 * QUALITY-BAR section 4's play-surface size, in percent. `BJ-16`, item `F6`.
 *
 * SPEC 14: "Play-surface size is not a duplicate of browser zoom. Browser zoom
 * shrinks the canvas CSS box with the viewport, so the play surface redraws at
 * the same physical size and magnifies nothing. This setting raises the
 * logical-to-CSS scale instead, and it is the only path a low-vision player has
 * to a larger card." The scale it raises is the one `SurfaceSizing` above
 * carries, which is why the setting is declared here rather than beside the
 * control that offers it: this module is the logical-to-CSS seam.
 *
 * **The same union is declared a second time, in `src/storage/document.ts`, and
 * that is deliberate rather than drift.** SPEC 13 persists the setting, so the
 * document had to name it before any presentation module existed, and nothing
 * imports `src/storage/` before `BJ-20` wires the reload flows. The other
 * direction is no longer absent: `BJ-19` took `storage` to `ui` for the sound
 * constants, `document.ts` re-exporting them from `src/ui/audio.ts` on the
 * Speed relocation precedent, so the collapse this paragraph once called
 * impossible is now merely deferred. `BJ-14`'s route for `Speed` itself is not
 * available here: `Speed` went to `core/table.ts` because the machine reads
 * it, and nothing in `core/` reads a CSS scale.
 * `tests/unit/layout-breakpoints.test.ts` pins the two declarations to each
 * other, value for value, so a change to one is a red suite rather than a
 * silent disagreement, and `BJ-20` collapses them by importing this one.
 */
export type SurfaceSize = 100 | 125 | 150 | 200;

/** The four SPEC 14 and QUALITY-BAR section 4 both list, in their order. */
export const SURFACE_SIZES = [100, 125, 150, 200] as const satisfies readonly SurfaceSize[];

/** 100 percent is the scale the layout would choose on its own. */
export const DEFAULT_SURFACE_SIZE: SurfaceSize = 100;

/** What a `SurfaceSize` is a percentage of, so the conversion is written once. */
export const SURFACE_SIZE_WHOLE = 100;

/** A `SurfaceSize` as the multiplier it applies to the logical-to-CSS scale. */
export function surfaceSizeFactor(size: SurfaceSize): number {
  return size / SURFACE_SIZE_WHOLE;
}

/** A sized surface. Drawing on `ctx` is in logical units from here on. */
export interface Surface {
  readonly canvas: SurfaceCanvas;
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  resize(sizing: SurfaceSizing): void;
  /** Clears the whole surface, in logical units. */
  clear(): void;
}

/**
 * One scene element's contribution to the two passes. A layer that has nothing
 * to say in a pass implements it as a no-op rather than being absent, so the
 * frame loop has one shape and no conditional path.
 */
export interface ScenePasses {
  drawShapes(ctx: CanvasRenderingContext2D): void;
  drawText(ctx: CanvasRenderingContext2D): void;
}

/**
 * Font families for the text pass. The project is asset-free: no webfont ships
 * (workspace README, "Asset-free"), so only generic families appear here and
 * the platform resolves them. These are families, not sizes: the play surface
 * has no type scale of its own (QUALITY-BAR 15), and every text size in this
 * directory is geometry, a fraction of the element it sits on.
 */
export const SERIF_FAMILY = 'serif';
export const SANS_FAMILY = 'sans-serif';

/** A canvas font string, from a logical pixel size and a family. */
export function font(sizePx: number, family: string, weight: 'normal' | 'bold' = 'normal'): string {
  return `${weight} ${String(sizePx)}px ${family}`;
}

function applySizing(canvas: SurfaceCanvas, ctx: CanvasRenderingContext2D, sizing: SurfaceSizing): void {
  const { width, height, dpr } = sizing;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`surface: logical size must be positive and finite, got ${String(width)}x${String(height)}`);
  }
  if (!Number.isFinite(dpr) || dpr <= 0) {
    throw new Error(`surface: device pixel ratio must be positive and finite, got ${String(dpr)}`);
  }

  // The one place in the project where a device pixel ratio is applied.
  // Rounded, because a backing store has whole pixels; at a fractional ratio
  // the store is within half a device pixel of exact and the transform below
  // still maps logical units onto it, so drawing code never compensates.
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  // A DOM element also needs its CSS size pinned, or the browser stretches the
  // store back over whatever layout gave it. An offscreen canvas has no style
  // and no layout, so there is nothing to pin.
  if (canvas.style !== undefined) {
    canvas.style.width = `${String(width)}px`;
    canvas.style.height = `${String(height)}px`;
  }

  // Assigning width or height reset the context, so the scale lands on a clean
  // identity transform. DESIGN 5: the context is scaled by dpr, once.
  ctx.scale(dpr, dpr);
}

/**
 * Acquire the context and size the backing store.
 *
 * Throws when the platform refuses a 2d context rather than limping on: the
 * styled unsupported-browser notice of QUALITY-BAR 2 is the composition root's
 * to show, and item `A5` at BJ-21 grades it; it can only be shown if the
 * failure surfaces as an error instead of a blank canvas.
 */
export function createSurface(canvas: SurfaceCanvas, sizing: SurfaceSizing): Surface {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('surface: the canvas returned no 2d context');
  }

  let { width, height, dpr } = sizing;
  applySizing(canvas, ctx, sizing);

  return {
    canvas,
    ctx,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get dpr() {
      return dpr;
    },
    resize(next: SurfaceSizing): void {
      applySizing(canvas, ctx, next);
      ({ width, height, dpr } = next);
    },
    clear(): void {
      ctx.clearRect(0, 0, width, height);
    },
  };
}

/**
 * The explicit state the shape pass starts from. Every value is set, none is
 * inherited; a drawing function still sets its own colours before painting,
 * and this baseline is what makes forgetting one a visible defect on this
 * frame rather than a dependency on the previous one.
 */
export function beginShapePass(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.setLineDash([]);
  ctx.lineWidth = BORDER.hair;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = SURFACE.rankBlack;
  ctx.strokeStyle = SURFACE.rankBlack;
}

/** The explicit state the text pass starts from. See `beginShapePass`. */
export function beginTextPass(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(SPACE[4], SANS_FAMILY);
  ctx.fillStyle = SURFACE.print;
}

/** Ends the pass `beginShapePass` or `beginTextPass` opened. */
export function endPass(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}

/**
 * One frame: clear, then every layer's shapes, then every layer's text, in the
 * order the layers were given. DESIGN 5's two ordered passes, each beginning
 * and ending exactly once. There is no other frame path.
 */
export function renderFrame(surface: Surface, layers: readonly ScenePasses[]): void {
  const { ctx } = surface;
  surface.clear();

  beginShapePass(ctx);
  for (const layer of layers) {
    layer.drawShapes(ctx);
  }
  endPass(ctx);

  beginTextPass(ctx);
  for (const layer of layers) {
    layer.drawText(ctx);
  }
  endPass(ctx);
}

/**
 * A rounded rectangle path over `arcTo`, begun and closed here.
 *
 * QUALITY-BAR 2 keeps `CanvasRenderingContext2D.roundRect` off the gating list
 * and has it polyfilled over `arcTo`; using the `arcTo` form everywhere is that
 * decision taken literally, one code path on every engine instead of a feature
 * test with a rarely-exercised branch.
 */
export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
