//
// The positive control for item M3.
//
// This file also sits under a `core` directory, so the boundary rules apply to
// it in full, and it must produce no message at all. Everything in it is a
// shape that a text scan would flag and scope analysis must not: identifiers
// that share a name with a DOM global but resolve locally, module specifiers
// that contain the letters "render" or "ui" without crossing the boundary, and
// uses of `Math` that are not `Math.random`.
//
// An earlier project verified the equivalent property by grep. This file is the
// reason that was not good enough.

// Specifiers that look like the render and ui layers and are not.
import { cachedFelt } from '../render-cache/store';
import { uiCopyFor } from '../guidance/ui-copy';
import { renderingOrder } from '../rendering-order';

// A locally declared type that shares a name with a DOM interface.
interface Event {
  readonly kind: string;
  readonly at: number;
}

interface Node {
  readonly id: number;
}

export function describe(event: Event, node: Node): string {
  return event.kind + ':' + String(node.id) + ':' + String(event.at);
}

// A local binding that shadows a platform global.
export function heading(): string {
  const document = { title: 'core' };
  return document.title;
}

// A parameter that shadows a platform global.
export function scaled(window: number): number {
  return window * 2;
}

// Math is fine. Only Math.random is not, and only capturing Math is not.
export function clampToGrid(value: number): number {
  return Math.max(0, Math.floor(value / 10) * 10);
}

// Destructuring statically known members is still allowed. The rule refuses a
// capture of Math because an alias hides Math.random; a named set of members
// cannot hide anything.
const { floor, min } = Math;

export function toGrid(value: number): number {
  return min(1000, floor(value / 10) * 10);
}

export function hypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

// Decay is always k ** dt, never per frame. BUILD-PLAN rule 4.
export function decay(velocity: number, k: number, dt: number): number {
  return velocity * k ** dt;
}

export { cachedFelt, uiCopyFor, renderingOrder };
