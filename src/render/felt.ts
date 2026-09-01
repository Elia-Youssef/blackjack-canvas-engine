/**
 * The felt: table ground, rail, printed house rules, insurance divider. Item
 * E5, method D: the capture at the demonstration session closes it; this
 * module is the behaviour it captures, and `tests/unit/render-felt.test.ts` is
 * the automated armour under it.
 *
 * E5's criterion: "The felt prints the house rules as a real table does:
 * blackjack pays 3 to 2, dealer must stand on all 17s, insurance pays 2 to 1,
 * and the active table limits" (SPEC 16). `feltPrint` is those four lines,
 * with the limits taken from the caller's table record, never restated here:
 * SPEC 6's numbers have one home, `core/wallet.ts`. The print is a decorative
 * repeat by design: the same rules and limits are real DOM text in the chrome
 * and in How to Play (SPEC 16, QUALITY-BAR 4), so nothing a player needs in
 * order to decide lives only in these pixels.
 *
 * **Baked once, blitted per frame.** QUALITY-BAR 1: static layers render once
 * into an offscreen canvas at the current backing-store scale, and nothing
 * procedural is regenerated per frame. `bakeFelt` does the one render and the
 * returned layer's per-frame work is a single `drawImage`; the armour asserts
 * the frame path contains no primitive drawing at all. The caller owns the
 * offscreen canvas object, because creating one is a platform concern and this
 * module runs headless under test.
 *
 * **The grain is a tile, and that is a measured decision.** `BJ-22`'s fix round
 * measured the first form of it, one path segment per 4 px cell over the whole
 * felt: 44,398 segments on a 1121 x 631 table, and a bake that took 176 ms on
 * the shipped page under QUALITY-BAR section 2's 4x throttle, against item
 * `H4`'s 50 ms ceiling for any one task. Three controls separated the cost:
 * with the grain suppressed entirely the same run reported **zero** long tasks
 * and a 33.3 ms worst frame; with the blend modes replaced by `source-over` and
 * every segment kept it reported 131 ms; with two whole-felt blend passes and
 * no segments at all it reported zero again. So the segments are the cost and
 * the blending is not. `bakeGrainTiles` pays that cost once, over one
 * `noiseTileCells` square, and a bake blits the square across the table under
 * the two blend operations: 4,096 segments once, and about thirty `drawImage`
 * calls per bake. The texture repeats every `noiseTileCells` cells, which at
 * this alpha ceiling is what "subtle noise" already looks like.
 *
 * **Deterministic to the byte.** The grain is a hash of cell coordinates from
 * a fixed seed: the same spec bakes the same pixels on every run, which is
 * what the BJ-22 visual baselines diff, and no `Math.random` appears
 * anywhere under `src/render/` (scanned by `tests/unit/render-surface.test.ts`).
 * The vignette and the grain are the felt's own colour composited over itself
 * with `multiply` and `screen`, so no colour exists here beyond the SPEC 16
 * palette: the modulation is arithmetic on one committed hex, the way an
 * antialiased edge is, and every measured ratio keeps its meaning.
 *
 * **The rail is load-bearing, not trim** (SPEC 16): no felt reaches 3:1
 * against the dark ground on its own, the rail's 8.02:1 is what separates the
 * table from the page, and nothing here may thin it below `BORDER.thick`.
 * Outside the rail the canvas stays transparent, so the chrome's ground shows
 * through and the rail is the boundary against whatever the theme paints.
 */

import {
  BORDER,
  feltColour,
  SPACE,
  type FeltName,
  type Hex,
  type SelectedPalette,
} from './tokens';
import {
  beginShapePass,
  beginTextPass,
  createSurface,
  endPass,
  font,
  roundedRectPath,
  SERIF_FAMILY,
  type ScenePasses,
  type SurfaceCanvas,
} from './surface';

/** The active table's limits, read off `core/wallet.ts`'s record. */
export interface FeltLimits {
  readonly minimum: number;
  readonly maximum: number;
}

/** One felt to bake: which table, its limits, and the surface it fills. */
export interface FeltSpec {
  readonly felt: FeltName;
  readonly limits: FeltLimits;
  /** Logical size of the play surface the bake fills. */
  readonly width: number;
  readonly height: number;
  /** The backing-store scale the bake renders at. QUALITY-BAR 1. */
  readonly dpr: number;
  /**
   * The play-surface set this bake paints in. Item `G9`, `BJ-22`.
   *
   * Part of the spec rather than a parameter beside it, because the baked
   * pixels are only valid for the set they were baked from: `needsRebake` in
   * `scene.ts` compares specs, and a palette outside the spec would leave a
   * high-contrast frame blitting a standard-palette felt until something else
   * happened to drift.
   */
  readonly palette: SelectedPalette;
}

/**
 * Every proportion of the felt. Fractions named `...X` are of the width,
 * `...Y` of the height, the rest of the smaller of the two. Shape data, not
 * tokens, for the reason `card.ts`'s header gives; the two absolute lengths
 * here, the rail's floor and the grain cell, are tokens.
 */
export const FELT_GEOMETRY = Object.freeze({
  /** Rail stroke thickness, floored at `BORDER.thick` so it never vanishes. */
  rail: 0.024,
  railMinimum: BORDER.thick,
  /** Corner radius of the table outline. */
  cornerRadius: 0.1,
  /** The insurance band: SPEC 16's divider, printed between two rules. */
  bandTopY: 0.4,
  bandBottomY: 0.52,
  bandInsetX: 0.1,
  /** Vertical centres of the printed lines. */
  naturalY: 0.64,
  standY: 0.72,
  limitsY: 0.89,
  /** Print sizes. */
  insuranceFont: 0.048,
  naturalFont: 0.06,
  standFont: 0.038,
  limitsFont: 0.036,
  /** Vignette: pure felt to `start`, then a multiplied edge darkening. */
  vignetteStart: 0.55,
  vignetteAlpha: 0.32,
  /** Grain: per-cell alpha ceiling, and the cell size. */
  noiseAlpha: 0.05,
  noiseCell: SPACE[1],
  /** Alpha bands used to batch the deterministic cells into canvas paths. */
  noiseSteps: 8,
  /**
   * The grain tile's side, **in cells**. A count and not a length, which is why
   * it is not a token: the one absolute length in the grain is `noiseCell`
   * above, and the tile is that many of them. 64 cells is 256 CSS pixels, which
   * repeats between four and five times across the widest table this game
   * draws and costs 4,096 segments to bake, a fifth of what one 1121 x 631
   * felt cost per bake before it.
   */
  noiseTileCells: 64,
} as const);

/**
 * The printed lines, top of the felt to the bottom, exactly as SPEC 16 states
 * them. The limits line carries the active table's numbers as plain digits;
 * the locale-formatted copy of the same numbers is the chrome's DOM text
 * (QUALITY-BAR 11), which is the authoritative one.
 *
 * **This is one of item `M2`'s two adjudicated parks, and the ruling is here so
 * nobody has to rediscover it.** `M2` at `BJ-21` requires every number to be
 * formatted through `Intl.NumberFormat` with an explicit locale list, and the
 * line below is not: it is printed as ASCII digits on English felt art, beside
 * `INSURANCE PAYS 2 TO 1` and `BLACKJACK PAYS 3 TO 2`, whose digits nobody
 * would localise either. SPEC 16 calls the felt print "a decorative repeat: the
 * same rules and limits are real DOM text in the chrome", so the copy a player
 * reads for a decision is the formatted one and this is the table's paintwork.
 * The other park is the chip's value glyph in `src/render/chips.ts`, which is
 * object identity in the same way a card's rank is.
 *
 * `tests/unit/locale.test.ts` holds both as a named exemption list of exactly
 * two sites, checked by path, and asserts that this function prints exactly one
 * data-driven line and that its shape does not grow a second quantity.
 */
export function feltPrint(limits: FeltLimits): readonly string[] {
  return [
    'INSURANCE PAYS 2 TO 1',
    'BLACKJACK PAYS 3 TO 2',
    'Dealer must stand on all 17s',
    `MINIMUM ${String(limits.minimum)} - MAXIMUM ${String(limits.maximum)}`,
  ];
}

/** The baked felt: a blit in the shape pass, nothing in the text pass. */
export interface FeltLayer extends ScenePasses {
  readonly canvas: SurfaceCanvas;
  readonly spec: FeltSpec;
}

/** Two hex digits of alpha, appended to a token hex to modulate it. */
function alphaHex(alpha: number): string {
  return Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
}

/**
 * The grain hash: cell coordinates and a fixed seed to one value in [0, 1).
 * Integer mixing only, so the same cell reads the same on every run and every
 * engine. The seed is structure, not a tunable; reseeding reprints every felt.
 */
const NOISE_SEED = 0x5f356495;

function grain(column: number, row: number): number {
  let mixed = Math.imul(column, 0x9e3779b1) ^ Math.imul(row, 0x85ebca6b) ^ NOISE_SEED;
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x2c1b3c6d);
  mixed = Math.imul(mixed ^ (mixed >>> 12), 0x297a2d39);
  mixed ^= mixed >>> 15;
  return (mixed >>> 0) / 0x100000000;
}

interface FeltFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly railWidth: number;
}

function frameOf(spec: FeltSpec): FeltFrame {
  const g = FELT_GEOMETRY;
  const scale = Math.min(spec.width, spec.height);
  const railWidth = Math.max(g.railMinimum, g.rail * scale);
  const pad = railWidth / 2;
  return {
    x: pad,
    y: pad,
    width: spec.width - railWidth,
    height: spec.height - railWidth,
    radius: g.cornerRadius * scale,
    railWidth,
  };
}

function tablePath(ctx: CanvasRenderingContext2D, frame: FeltFrame): void {
  roundedRectPath(ctx, frame.x, frame.y, frame.width, frame.height, frame.radius);
}

function drawGround(ctx: CanvasRenderingContext2D, frame: FeltFrame, felt: Hex): void {
  ctx.fillStyle = felt;
  tablePath(ctx, frame);
  ctx.fill();
}

function drawVignette(ctx: CanvasRenderingContext2D, spec: FeltSpec, frame: FeltFrame, felt: Hex): void {
  const g = FELT_GEOMETRY;
  const cx = spec.width / 2;
  const cy = spec.height / 2;
  const reach = Math.hypot(spec.width, spec.height) / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
  gradient.addColorStop(0, `${felt}${alphaHex(0)}`);
  gradient.addColorStop(g.vignetteStart, `${felt}${alphaHex(0)}`);
  gradient.addColorStop(1, `${felt}${alphaHex(g.vignetteAlpha)}`);

  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = gradient;
  tablePath(ctx, frame);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/** What one grain tile pair was baked from, so a cache can compare two. */
export interface GrainSpec {
  /** The felt colour every cell is drawn in. The grain invents no colour. */
  readonly felt: Hex;
  /** The backing-store scale the tiles are rasterised at. */
  readonly dpr: number;
}

/**
 * The baked grain: one square of cells that darken and one of cells that
 * lighten, tiled across a felt under `multiply` and `screen` respectively.
 *
 * Two squares rather than one, because a cell's direction is a blend operation
 * and a single blit carries exactly one. Every cell appears in exactly one of
 * them, so the pair holds `noiseTileCells` squared cells between them and not
 * twice that.
 */
export interface GrainTiles {
  readonly darken: SurfaceCanvas;
  readonly lighten: SurfaceCanvas;
  /** The logical side of each tile, in CSS pixels. */
  readonly side: number;
  readonly spec: GrainSpec;
}

/** Whether a baked grain pair still matches what a bake wants. */
export function sameGrain(current: GrainSpec, next: GrainSpec): boolean {
  return current.felt === next.felt && current.dpr === next.dpr;
}

/**
 * Bake the grain once, into two caller-supplied canvases.
 *
 * The caller owns the canvas objects for the reason this file's header gives:
 * creating one is a platform concern and this module runs headless under test.
 * `scene.ts` holds the cache in front of this, so a session bakes one pair per
 * felt colour and backing-store scale rather than one per table size.
 */
export function bakeGrainTiles(makeCanvas: () => SurfaceCanvas, spec: GrainSpec): GrainTiles {
  const g = FELT_GEOMETRY;
  const cell = g.noiseCell;
  const side = g.noiseTileCells * cell;
  const sizing = { width: side, height: side, dpr: spec.dpr };
  const darken = createSurface(makeCanvas(), sizing);
  const lighten = createSurface(makeCanvas(), sizing);
  const buckets: number[][] = Array.from({ length: g.noiseSteps * 2 }, () => []);

  for (let row = 0; row < g.noiseTileCells; row += 1) {
    for (let column = 0; column < g.noiseTileCells; column += 1) {
      const value = grain(column, row);
      const strength = Math.abs(value - 0.5) * 2;
      const level = Math.max(1, Math.ceil(strength * g.noiseSteps)) - 1;
      const operation = value < 0.5 ? 0 : g.noiseSteps;
      buckets[operation + level]?.push(column * cell, row * cell);
    }
  }

  for (const [index, bucket] of buckets.entries()) {
    if (bucket.length === 0) {
      continue;
    }
    // One hash still decides both the direction and strength of every cell.
    // The direction picks the square, and quantising the subtle strength into
    // eight bands makes each square eight paths rather than one per cell. The
    // alpha lives in the baked pixels, so a blit needs no `globalAlpha`.
    const target = index < g.noiseSteps ? darken : lighten;
    target.ctx.fillStyle = spec.felt;
    target.ctx.globalAlpha = (g.noiseAlpha * ((index % g.noiseSteps) + 1)) / g.noiseSteps;
    target.ctx.beginPath();
    for (let offset = 0; offset < bucket.length; offset += 2) {
      target.ctx.rect(bucket[offset] ?? 0, bucket[offset + 1] ?? 0, cell, cell);
    }
    target.ctx.fill();
  }
  darken.ctx.globalAlpha = 1;
  lighten.ctx.globalAlpha = 1;

  return { darken: darken.canvas, lighten: lighten.canvas, side, spec };
}

function drawGrain(
  ctx: CanvasRenderingContext2D,
  spec: FeltSpec,
  frame: FeltFrame,
  tiles: GrainTiles,
): void {
  const { side } = tiles;
  ctx.save();
  tablePath(ctx, frame);
  ctx.clip();
  for (const [tile, operation] of [
    [tiles.darken, 'multiply'],
    [tiles.lighten, 'screen'],
  ] as const) {
    ctx.globalCompositeOperation = operation;
    for (let y = 0; y < spec.height; y += side) {
      for (let x = 0; x < spec.width; x += side) {
        // The same seam `drawShapes` documents below: a real canvas satisfies
        // both the structural type this module tests against and the platform
        // type `drawImage` demands.
        ctx.drawImage(tile as unknown as CanvasImageSource, x, y, side, side);
      }
    }
  }
  ctx.restore();
}

function drawBand(ctx: CanvasRenderingContext2D, spec: FeltSpec): void {
  const g = FELT_GEOMETRY;
  const left = g.bandInsetX * spec.width;
  const right = spec.width - g.bandInsetX * spec.width;
  ctx.strokeStyle = spec.palette.surface.print;
  ctx.lineWidth = BORDER.hair;
  for (const y of [g.bandTopY * spec.height, g.bandBottomY * spec.height]) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
}

function drawRail(ctx: CanvasRenderingContext2D, frame: FeltFrame, rail: Hex): void {
  ctx.strokeStyle = rail;
  ctx.lineWidth = frame.railWidth;
  tablePath(ctx, frame);
  ctx.stroke();
}

function drawPrint(ctx: CanvasRenderingContext2D, spec: FeltSpec): void {
  const g = FELT_GEOMETRY;
  const scale = Math.min(spec.width, spec.height);
  const centre = spec.width / 2;
  const [insurance, natural, stand, limits] = feltPrint(spec.limits);

  ctx.fillStyle = spec.palette.surface.print;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines: readonly (readonly [string | undefined, number, number])[] = [
    [insurance, ((g.bandTopY + g.bandBottomY) / 2) * spec.height, g.insuranceFont * scale],
    [natural, g.naturalY * spec.height, g.naturalFont * scale],
    [stand, g.standY * spec.height, g.standFont * scale],
    [limits, g.limitsY * spec.height, g.limitsFont * scale],
  ];
  for (const [text, y, size] of lines) {
    if (text === undefined) {
      // Unreachable while feltPrint returns its four lines; if it ever does
      // not, a felt missing a house rule must refuse to bake, not print short.
      throw new Error('felt: feltPrint returned fewer than the four lines SPEC 16 states');
    }
    ctx.font = font(size, SERIF_FAMILY);
    ctx.fillText(text, centre, y);
  }
}

/**
 * Render the whole felt once into `canvas` and hand back the layer that blits
 * it. The bake follows the same two-pass discipline as a frame, shapes then
 * text, each with its state set explicitly, because the offscreen is a canvas
 * like any other and inherits nothing either.
 *
 * **`grain` is a thunk because the flat felt never reads one.** SPEC 16's
 * forced-colors subsection suppresses the gradient and the grain under the
 * high-contrast set, so the whole grain path below is inside a branch this bake
 * does not take; a `GrainTiles` passed by value made the caller bake 4,096
 * cells into two canvases first, and this function then threw them away. Worse
 * than wasted: `scene.ts` caches grain pairs in a bound of four, and a
 * forced-colors session that visits three tables filled it with pairs no frame
 * can draw and evicted the pair the standard set was still using. The thunk
 * moves the decision to the one place that knows the answer.
 */
export function bakeFelt(
  canvas: SurfaceCanvas,
  spec: FeltSpec,
  grain: () => GrainTiles,
): FeltLayer {
  const tokens = spec.palette.surface;
  const felt = feltColour(tokens, spec.felt);
  const surface = createSurface(canvas, { width: spec.width, height: spec.height, dpr: spec.dpr });
  const frame = frameOf(spec);
  const { ctx } = surface;

  surface.clear();
  beginShapePass(ctx, tokens);
  drawGround(ctx, frame, felt);
  // **The flat felt is the high-contrast set's own behaviour**, and the two
  // suppressed passes are named by SPEC 16's forced-colors subsection: "the
  // gradient and the grain are suppressed under this set, because subtle
  // texture is what high contrast exists to remove, and the audit measures the
  // flat fill". The ground, the band, the rail and the print are unchanged, so
  // what the set removes is texture and never information.
  if (!spec.palette.flatFelt) {
    const tiles = grain();
    // A pair baked for another colour or another backing-store scale would
    // tile the wrong texture at the wrong resolution and nothing downstream
    // would say so, which is exactly the failure a cache in front of a bake
    // invites. It refuses instead.
    if (!sameGrain(tiles.spec, { felt, dpr: spec.dpr })) {
      throw new Error('felt: the grain tiles were baked for another colour or backing-store scale');
    }
    drawVignette(ctx, spec, frame, felt);
    drawGrain(ctx, spec, frame, tiles);
  }
  drawBand(ctx, spec);
  drawRail(ctx, frame, tokens.rail);
  endPass(ctx);

  beginTextPass(ctx, tokens);
  drawPrint(ctx, spec);
  endPass(ctx);

  return {
    canvas,
    // **Frozen, and a copy, because this object is the cache key.**
    // `scene.ts` keeps baked layers in a list and reuses one when
    // `needsRebake(entry.spec, wanted)` says the wanted spec matches it, so the
    // record below is not a description of the bake: it is what decides whether
    // the next frame pays for another one. `PlaySurface.feltSpec()` hands it out
    // to anything that asks, and a four-byte edit from outside was enough to
    // make the cache miss forever and pay a 176 ms bake per frame. Copying keeps
    // the caller's own literal separate; freezing is what the readout contract
    // the rest of this codebase follows already promises.
    spec: Object.freeze({ ...spec }),
    drawShapes(target: CanvasRenderingContext2D): void {
      // The one per-frame cost of the felt. The cast is the seam between the
      // structural canvas this module tests against and the platform type
      // `drawImage` demands; a real canvas satisfies both.
      target.drawImage(canvas as unknown as CanvasImageSource, 0, 0, spec.width, spec.height);
    },
    drawText(): void {
      // The print is baked. Nothing to add per frame.
    },
  };
}
