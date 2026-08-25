/**
 * The four breakpoints, the sticky-bar threshold, and the surface plan they
 * decide. `BJ-16`, items `F1` (Critical), `F3`, `F6` and `F7`.
 *
 * **Every number here belongs to QUALITY-BAR section 5 and section 4**, and is
 * pinned to `tests/reference/design-contract.md` by
 * `tests/unit/layout-breakpoints.test.ts` exactly as every colour, size and
 * duration is pinned by `tests/unit/tokens.test.ts`. Nothing in this file is a
 * value anybody chose here.
 *
 * **The breakpoint is resolved in TypeScript and published as an attribute, not
 * written as a media query, and that is a token rule rather than a preference.**
 * A media query cannot take a `var()`, so `@media (min-width: 1024px)` would put
 * a dimension literal in `src/ui/chrome.css`, which `tests/unit/tokens.test.ts`
 * fails on sight and which would make the stylesheet a second home for a number
 * QUALITY-BAR owns. Resolving once here and writing `data-breakpoint` on the
 * shell gives the stylesheet a selector instead of a number, gives this file's
 * rule a unit test with no browser in it, and is the only form in which the
 * width-first rule can be written at all: no media query expresses "orientation
 * decides, but only below 768 px" without repeating both thresholds inside an
 * `and`, which is the shape QUALITY-BAR section 5 records an earlier build
 * getting wrong.
 *
 * **Width first, and the four are exhaustive and mutually exclusive.** A
 * viewport at or above 1024 px in portrait, which a 1024 x 1366 tablet produces
 * in its natural orientation, is `wide`. An earlier form of the table qualified
 * `wide` as landscape and left that viewport matching no row at all.
 *
 * Nothing in this file touches the DOM. The composition root reads the viewport
 * and the stage box and hands them in, which is what lets the whole of the
 * resolution and the whole of the sizing arithmetic be unit tested in Node.
 */

import {
  surfaceSizeFactor,
  type SurfaceSize,
  type SurfaceSizing,
} from '../render/surface';

/** QUALITY-BAR section 5's four names, in the order that section lists them. */
export type BreakpointName = 'wide' | 'medium' | 'compact' | 'portrait';

/** The four, so a sweep can iterate them and a test can require all four. */
export const BREAKPOINT_NAMES: readonly BreakpointName[] = Object.freeze([
  'wide',
  'medium',
  'compact',
  'portrait',
]);

/** QUALITY-BAR section 5: `wide` is width >= 1024 px, in either orientation. */
export const WIDE_MIN_WIDTH = 1024;

/** QUALITY-BAR section 5: `medium` runs from 768 px to one below the wide floor. */
export const MEDIUM_MIN_WIDTH = 768;

/**
 * QUALITY-BAR section 5 and DESIGN section 4: below this viewport height both
 * sticky bars unstick and scroll with the document instead of consuming it.
 */
export const STICKY_BARS_MIN_HEIGHT = 400;

/** A viewport, in CSS pixels. The composition root reads it off the platform. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Which of the four a viewport is.
 *
 * Orientation is `height >= width`, which is the CSS `orientation: portrait`
 * media feature's own rule, so a square viewport resolves the way the platform's
 * own query would answer for it rather than the way this file might prefer.
 */
export function resolveBreakpoint(viewport: Viewport): BreakpointName {
  if (viewport.width >= WIDE_MIN_WIDTH) {
    return 'wide';
  }
  if (viewport.width >= MEDIUM_MIN_WIDTH) {
    return 'medium';
  }
  return viewport.height >= viewport.width ? 'portrait' : 'compact';
}

/**
 * The height the play-surface row keeps when the shell has none to divide.
 *
 * DESIGN section 4: "the play surface takes a minimum height rather than a
 * share". Three of the largest spacing step, which is how `tokens.css` declares
 * it; the number is pinned to `tests/reference/design-contract.md` here and the
 * token is required to resolve to it by `tests/browser/breakpoints.spec.ts`, so
 * the CSS length and this number cannot drift apart.
 *
 * It is a **length in the layout**, not a floor in the plan: `planSurface` still
 * refuses to invent a size for a box it was given, and this is what stops the
 * layout from handing it a box of zero.
 */
export const MIN_SURFACE_HEIGHT = 192;

/**
 * The heights the sticky decision is made against, measured off the page.
 *
 * Every one of them is a **content** height and none of them moves when the
 * decision moves, which is the property that makes the rule below a fixed point
 * rather than a loop: the two bars are laid out from their own content at the
 * viewport's width whether they stick or scroll, and the overhead is the shell's
 * padding and gaps, which are lengths.
 */
export interface ChromeHeights {
  /** `.bj-top`'s content height. */
  readonly top: number;
  /** `.bj-controls`' content height. */
  readonly controls: number;
  /** The shell's own padding and row gaps. */
  readonly overhead: number;
}

/** The first frame's answer, before anything has been laid out. */
export const NO_CHROME_HEIGHTS: ChromeHeights = Object.freeze({ top: 0, controls: 0, overhead: 0 });

/**
 * Whether the two bars stick at this viewport, with this much chrome in them.
 *
 * **Two conditions, and the second one is `BJ-16`'s fix round.** DESIGN section
 * 4's threshold is the first: below 400 px of height the bars unstick and the
 * document scrolls, because two sticky bars plus a play surface cannot fit 256
 * px. The second is the same rule stated for the case the threshold cannot see:
 * a 320 px wide top bar wraps to several rows, and with the disclosure open it
 * can be taller than the viewport on its own, so a viewport well above 400 px
 * can have no room for the sticky layout either. Sticking there produced two
 * defects the `BJ-16` review measured on the shipped page: the play-surface row
 * squeezed to zero, which made `planSurface` take its fallback branch on a box
 * with real width, and controls rendered below the fold of a page that could not
 * scroll, reachable only inside an inner scroller with no affordance.
 *
 * So the rule is: **the bars stick only when the sticky layout fits**, which
 * makes "sticky" imply "the page does not scroll" and "static" imply "the page
 * scrolls to everything". Both halves are asserted in the browser.
 *
 * **This cannot oscillate.** The three measured inputs are content heights at a
 * given viewport width and the shell's own padding, none of which changes when
 * the bars stop or start sticking: `position: sticky` leaves an element in flow,
 * and the row floor is a length in both modes. A frame that answers `false`
 * measures the same numbers on the next frame and answers `false` again.
 */
export function barsStick(viewport: Viewport, chrome: ChromeHeights): boolean {
  if (viewport.height < STICKY_BARS_MIN_HEIGHT) {
    return false;
  }
  return chrome.top + chrome.controls + chrome.overhead + MIN_SURFACE_HEIGHT <= viewport.height;
}

/**
 * The logical space the play surface is drawn in, and its portrait framing.
 *
 * DESIGN section 4 gives the surface "a 1280 x 720 logical space mapped onto its
 * CSS box", and gives portrait "a portrait framing of the same logical space
 * rather than a squashed landscape one: the felt narrows, the hands stack, and
 * the fan band shrinks with it". The portrait framing keeps the 720 short edge
 * and turns it upright at 3:4, so a hand's cards are laid at the same fraction
 * of the same short edge in both framings and only the felt around them changes
 * shape. Shape data rather than tokens, in `SCENE_GEOMETRY`'s sense: these are
 * the proportions of the thing being drawn.
 *
 * A squashed landscape would keep 1280 x 720 in a portrait viewport and give the
 * surface a band a fifth of the height of its row; `tests/browser/portrait.spec
 * .ts` compares the two framings' aspect directly rather than comparing pictures.
 */
export interface Framing {
  readonly width: number;
  readonly height: number;
}

export const SURFACE_FRAMING: Readonly<Record<'landscape' | 'portrait', Framing>> = Object.freeze({
  landscape: Object.freeze({ width: 1280, height: 720 }),
  portrait: Object.freeze({ width: 720, height: 960 }),
});

/** Which framing a breakpoint draws in. Only `portrait` turns the space. */
export function framingFor(breakpoint: BreakpointName): Framing {
  return breakpoint === 'portrait' ? SURFACE_FRAMING.portrait : SURFACE_FRAMING.landscape;
}

/**
 * The width the surface is drawn at when its box is not a box yet.
 *
 * A row that has not been laid out reports a client size of zero, and a
 * zero-sized backing store is an exception out of `createSurface` rather than a
 * blank frame. **It is a fallback and never a floor**, which is the whole of the
 * distinction: a floor would be applied to a box that is real but small, and the
 * surface would then be larger than the row it is in at the default setting,
 * which is exactly the overflow this part exists to remove. A 320 x 200 viewport
 * gets a small surface, and that is the correct answer.
 */
export const FALLBACK_SURFACE_WIDTH = 320;

/** The box the surface is fitted into, in CSS pixels. */
export interface StageBox {
  readonly width: number;
  readonly height: number;
}

/** Everything one frame resolved about the play surface's size. */
export interface SurfacePlan {
  /** What `createSurface` and `resize` are handed. */
  readonly sizing: SurfaceSizing;
  /** The framing this plan drew in. */
  readonly framing: Framing;
  /** CSS pixels per logical unit: the scale item `F6`'s setting multiplies. */
  readonly scale: number;
  /** The scale the layout would have chosen at 100 percent. */
  readonly baseScale: number;
}

/**
 * The size and scale one frame should draw the play surface at.
 *
 * Three properties, and each is a clause of an item:
 *
 * 1. **At 100 percent the surface never asks for more than the box it was
 *    given.** Both dimensions are floored, so a fit is a fit and the stage never
 *    scrolls at the default setting. This is the arithmetic half of the defect
 *    the `BJ-14` review recorded: a surface that could ask for a box larger than
 *    its row grew the row, which grew the document, which pushed the action
 *    buttons below the fold. The layout half is a shell of a definite height,
 *    in `chrome.css`.
 * 2. **The scale is exactly the base scale times the setting.** `F6` says the
 *    setting "raises the logical-to-CSS scale by that factor", so the factor is
 *    applied to the scale and the dimensions are derived from it, never the
 *    other way round, and nothing clamps the result back to the box: above 100
 *    percent the surface is deliberately larger than its stage, and the stage
 *    scrolls to it. Clamping is what would clip.
 * 3. **The base scale does not depend on the setting.** It is read off the box
 *    the layout gives the row, which no canvas is inside, so there is no path by
 *    which a larger surface makes the next frame's base larger or smaller. A
 *    plan that measured the scrolling stage would have exactly that loop.
 */
export function planSurface(
  box: StageBox,
  breakpoint: BreakpointName,
  size: SurfaceSize,
  dpr: number,
): SurfacePlan {
  const framing = framingFor(breakpoint);
  const fitted = Math.min(box.width / framing.width, box.height / framing.height);
  const usable = Number.isFinite(fitted) && framing.width * fitted >= 1 && framing.height * fitted >= 1;
  const baseScale = usable ? fitted : FALLBACK_SURFACE_WIDTH / framing.width;
  const scale = baseScale * surfaceSizeFactor(size);
  return {
    sizing: {
      width: Math.floor(framing.width * scale),
      height: Math.floor(framing.height * scale),
      dpr: dpr > 0 ? dpr : 1,
    },
    framing,
    scale,
    baseScale,
  };
}

/** Whether two sizings ask for the same backing store. */
export function sameSizing(a: SurfaceSizing, b: SurfaceSizing): boolean {
  return a.width === b.width && a.height === b.height && a.dpr === b.dpr;
}
