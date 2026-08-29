/**
 * The shell: four regions, and the rule that keeps SPEC 11's readouts visible.
 *
 * The shell is a three-row grid, and the rows are the whole of item `C5`'s first
 * clause:
 *
 *   row 1  the continuous readouts and the three overlay controls
 *   row 2  the play surface, and the overlay host **inside it**
 *   row 3  the notice and whichever screen the current phase offers
 *
 * An overlay is absolutely positioned against row 2, so it can cover the play
 * surface and can reach neither of the other rows. SPEC 10 asks for exactly
 * that: "the play surface persists behind every overlay, so the continuously
 * displayed readouts are genuinely continuous". Making the host `fixed` instead
 * of `absolute`, or hoisting it out of row 2, is the one edit that would break
 * the clause, and `C5` measures rendered boxes on three engines rather than
 * reading this comment.
 *
 * **Breakpoints are not here.** DESIGN section 1 gives `layout.ts` "breakpoint
 * wiring" and item `F1` at `BJ-16` grades the four breakpoints resolved by width
 * first, the portrait re-arrangement and the safe-area insets. What this part
 * owes that one is a shell whose regions are already separate elements, so the
 * responsive work is a stylesheet and a resize path rather than a rebuild.
 *
 * **The canvas is `aria-hidden`, and now it has a replacement.** QUALITY-BAR
 * section 1: the play surface is a rendered scene, and item `G4` at `BJ-18`
 * builds the visually hidden mirror that makes its state navigable. The canvas
 * stays hidden from assistive technology because a `<canvas>` exposes its
 * bitmap and nothing else; the mirror sits in the same landmark, carrying the
 * cards as words and every hand's value, and `chrome.ts` mounts it there.
 *
 * **Landmarks and the page heading. `BJ-18`, item `G6`.** The three rows are a
 * `<header>`, a `<main>` and a `<footer>`, so the page has banner, main and
 * contentinfo without a single `role` attribute: native elements first, per the
 * item's "meaningful landmarks". The play surface and its mirror are in `main`
 * because they are the game; the overlay controls are a `<nav>` built by
 * `overlays.ts`; the controls row keeps its own accessible name so a landmark
 * list reads "Game controls" rather than "content information".
 *
 * The `<h1>` is visually hidden, and that is a layout decision with a measured
 * reason rather than a shortcut. The chrome has no visible title bar: DESIGN
 * section 4's top row is SPEC 11's readouts and the three panel controls, and at
 * `compact` and `portrait` that row is already at the height `barsStick`
 * measures against a 400 px viewport. A visible heading added to it would change
 * the sticky decision at exactly the viewports `BJ-16` tuned it for. The
 * heading is out of flow, so it adds nothing to any box, and the same words are
 * in the document title, which item `G6` also grades.
 */

import type { FeltLayerHost } from '../render/scene';
import type { SurfaceCanvas } from '../render/surface';

import { el } from './dom';

/** The shell's regions, so the chrome can fill them without querying the DOM. */
export interface Shell {
  /** The whole shell. Mounted into the page by the composition root. */
  readonly root: HTMLElement;
  /** The page heading. Item `G6`'s single `h1`, visually hidden and out of flow. */
  readonly heading: HTMLElement;
  /** Row 1. SPEC 11's readouts and the overlay controls. */
  readonly top: HTMLElement;
  /** Row 2, the `main` landmark. The play surface, the mirror and the overlay host. */
  readonly body: HTMLElement;
  /** The element the play surface is sized against. */
  readonly stage: HTMLElement;
  /** The static felt layer, stacked below the animated scene. */
  readonly feltCanvas: HTMLCanvasElement;
  /** The play surface itself. */
  readonly canvas: HTMLCanvasElement;
  /** Row 3. The notice and the phase screens. */
  readonly controls: HTMLElement;
}

/** Build the shell. Nothing is filled in: `chrome.ts` mounts the components. */
export function createShell(): Shell {
  const feltCanvas = el('canvas', {
    className: 'bj-surface-felt',
    attributes: { 'aria-hidden': 'true' },
  });
  const canvas = el('canvas', {
    className: 'bj-surface',
    attributes: { 'aria-hidden': 'true' },
  });
  const surface = el('div', {
    className: 'bj-surface-stack',
    children: [feltCanvas, canvas],
  });
  // **The stage is a scroll container, so it is in the tab order.** `BJ-18`,
  // item `G1`. Item `F6` draws a surface larger than its box above 100 percent
  // and lets this element scroll to it, and a region that scrolls and cannot be
  // reached by keyboard is a WCAG 2.1.1 failure: the scan reports it as
  // `scrollable-region-focusable`, which is how this was found. A player using
  // arrow keys needs somewhere to put focus before the arrows mean anything, and
  // this is that place.
  //
  // **Unconditional, rather than added when the surface is magnified.** The
  // first form of this fix wrote the attribute from the size setting, so the
  // default page carried no stop; it was withdrawn because the stage also
  // scrolls for a single frame at 100 percent, whenever a phase change moves the
  // controls row's height and the canvas is resized on the frame after. One
  // frame is enough for the scan to catch it, which it did on one run in five,
  // and a Critical gate that fails one run in five is worse than a tab stop. It
  // is one stop, it is named, and it sits where the game is.
  const stage = el('div', {
    className: 'bj-stage',
    attributes: {
      role: 'group',
      'aria-label': 'Play surface',
      'data-control': 'play-surface',
      tabindex: '0',
    },
    children: [surface],
  });
  const top = el('header', { className: 'bj-top' });
  // `<main>` rather than a div. Item `G6`: the play surface, its mirror and the
  // overlay host are the game, and this is the landmark a screen reader user
  // jumps to. Nothing else in the page claims it.
  const body = el('main', { className: 'bj-body', children: [stage] });
  // Row 3 doubles as the focus anchor. `BJ-17`, item `D4`: SPEC 10 replaces the
  // whole of this row at every phase, so a control really is taken out from
  // under the caret, and QUALITY-BAR section 3 asks for a stable named place for
  // focus to go rather than `<body>`. This row is the one that is present at
  // every phase and is where the replacement controls appear, so one `Tab` from
  // it reaches the first of them. `tabindex="-1"` makes it focusable without
  // putting it in the tab order; `src/ui/input.ts` is the only caller.
  const controls = el('footer', {
    className: 'bj-controls',
    attributes: {
      tabindex: '-1',
      'aria-label': 'Game controls',
      'data-focus-anchor': 'controls',
    },
  });
  // Item `G6`'s single `h1`. Out of flow, so it creates no grid track and
  // changes no measured height; see this file's header for why it is hidden.
  const heading = el('h1', { className: 'bj-visually-hidden', text: 'Blackjack' });
  const root = el('div', {
    className: 'bj-shell',
    children: [heading, top, body, controls],
  });

  return { root, heading, top, body, stage, feltCanvas, canvas, controls };
}

/**
 * The shell's felt stack, as the renderer's `FeltLayerHost`. `BJ-22`'s fix
 * round.
 *
 * **One canvas per baked felt, and the shown one is the one without `hidden`.**
 * `src/render/scene.ts` caches its bakes so a phase cycle that changes the
 * surface size 27 times bakes three felts rather than 27, and the measurement
 * behind this shape is in `FeltLayerHost`'s own comment: copying a baked
 * offscreen onto one shown canvas costs 21 to 32 ms the first time each source
 * is copied, against 1 to 2 ms to bake straight onto a canvas the page is
 * showing. So a cache hit here is a swap and never a draw.
 *
 * Every canvas carries the shell's own class and `aria-hidden`, sits absolutely
 * inside the stack, and is inserted before the animated scene so source order
 * keeps the felt behind it. Only one is ever without `hidden`, which is what
 * `canvas.bj-surface-felt:not([hidden])` selects.
 */
export function createFeltLayer(shell: Shell): FeltLayerHost {
  const stack = shell.canvas.parentElement;
  if (stack === null) {
    throw new Error('layout: the play surface has no stack to put a felt in');
  }
  // The shell's own felt canvas is the first one the layer hands out, so a
  // session that never changes size ends with exactly the stack `createShell`
  // built.
  let spare: HTMLCanvasElement | null = shell.feltCanvas;
  const showing = new Set<HTMLCanvasElement>();

  const isCanvas = (canvas: SurfaceCanvas): HTMLCanvasElement => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('layout: the felt layer was handed a canvas it did not make');
    }
    return canvas;
  };

  return {
    acquire(): SurfaceCanvas {
      if (spare !== null) {
        const first = spare;
        spare = null;
        return first;
      }
      const made = el('canvas', {
        className: 'bj-surface-felt',
        attributes: { 'aria-hidden': 'true', hidden: '' },
      });
      stack.insertBefore(made, shell.canvas);
      return made;
    },
    show(canvas: SurfaceCanvas): void {
      const shown = isCanvas(canvas);
      for (const other of showing) {
        if (other !== shown) {
          other.hidden = true;
        }
      }
      showing.clear();
      shown.hidden = false;
      showing.add(shown);
    },
    release(canvas: SurfaceCanvas): void {
      const gone = isCanvas(canvas);
      showing.delete(gone);
      gone.remove();
    },
  };
}
