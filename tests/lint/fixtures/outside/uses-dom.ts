//
// The scoping control for item M3.
//
// Byte for byte the same offences as `../core/violations.ts`, in a directory
// that is not `core`. The boundary rules must report nothing here: `render/`
// and `ui/` are allowed to import each other and to touch the DOM, and that is
// the entire point of drawing the boundary in one place rather than everywhere.
//
// Without this control, a rule that reported on every file would pass the
// violations fixture and look correct while making the codebase unbuildable.

import { drawFelt } from '../render/felt';
import { mountChrome } from '../ui/chrome';
import { Surface } from '@js-games/engine/render';

export function title(): string {
  return document.title;
}

export function measure(canvas: HTMLCanvasElement): number {
  return canvas.width;
}

export function jitter(): number {
  return Math.random();
}

export { drawFelt, mountChrome };
export type { Surface };
