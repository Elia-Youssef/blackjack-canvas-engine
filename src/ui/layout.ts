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
 * **The canvas is `aria-hidden`.** QUALITY-BAR section 1: the play surface is a
 * rendered scene and the state mirror that makes it navigable is item `G1` at
 * `BJ-18`. Hiding it from assistive technology now, with nothing to replace it
 * yet, is the honest state: what is on the canvas is also in the chrome as real
 * text, which is why SPEC 11's readouts exist.
 */

import { el } from './dom';

/** The shell's regions, so the chrome can fill them without querying the DOM. */
export interface Shell {
  /** The whole shell. Mounted into the page by the composition root. */
  readonly root: HTMLElement;
  /** Row 1. SPEC 11's readouts and the overlay controls. */
  readonly top: HTMLElement;
  /** Row 2. The play surface and the overlay host, in that order. */
  readonly body: HTMLElement;
  /** The element the play surface is sized against. */
  readonly stage: HTMLElement;
  /** The play surface itself. */
  readonly canvas: HTMLCanvasElement;
  /** Row 3. The notice and the phase screens. */
  readonly controls: HTMLElement;
}

/** Build the shell. Nothing is filled in: `chrome.ts` mounts the components. */
export function createShell(): Shell {
  const canvas = el('canvas', {
    className: 'bj-surface',
    attributes: { 'aria-hidden': 'true' },
  });
  const stage = el('div', { className: 'bj-stage', children: [canvas] });
  const top = el('header', { className: 'bj-top' });
  const body = el('div', { className: 'bj-body', children: [stage] });
  const controls = el('footer', { className: 'bj-controls' });
  const root = el('div', {
    className: 'bj-shell',
    children: [top, body, controls],
  });

  return { root, top, body, stage, canvas, controls };
}
