/// <reference lib="dom" /> // @expect core-boundary/no-dom
//
// The deliberately violating fixture for item M3.
//
// This file sits under a `core` directory, so the core-boundary rules apply to
// it exactly as they apply to the real `src/core/`. `npm run lint` excludes it
// on the command line; `tests/unit/core-boundary.test.ts` points the real
// eslint.config.js at it and asserts that every line marked below is rejected,
// and that nothing else is.
//
// Every `@expect` marker names the rule that must report on that line. The test
// asserts the match in both directions, so an unmarked error fails the test and
// so does a marker with no error behind it. A lint rule that cannot fail is not
// a gate, and neither is one whose fixture has quietly stopped violating it.

// 1. Imports across the boundary.
import { drawFelt } from '../render/felt'; // @expect core-boundary/no-forbidden-imports
import { mountChrome } from '../ui/chrome'; // @expect core-boundary/no-forbidden-imports
import { Surface } from '@js-games/engine/render'; // @expect core-boundary/no-forbidden-imports
import cardChrome = require('../ui/card-panel'); // @expect core-boundary/no-forbidden-imports

export { drawCard } from '../render/card'; // @expect core-boundary/no-forbidden-imports
export * from '../render/chips'; // @expect core-boundary/no-forbidden-imports

const felt = require('../render/felt'); // @expect core-boundary/no-forbidden-imports

export async function lazy(): Promise<unknown> {
  return import('../ui/panel'); // @expect core-boundary/no-forbidden-imports
}

type LazySurface = import('@js-games/engine/render').Surface; // @expect core-boundary/no-forbidden-imports

// 2. DOM, BOM and canvas, in value and type positions alike.
export function title(): string {
  return document.title; // @expect core-boundary/no-dom
}

export function width(): number {
  return window.innerWidth; // @expect core-boundary/no-dom
}

export function stored(): string | null {
  return globalThis.localStorage.getItem('bj'); // @expect core-boundary/no-dom
}

export function schedule(fn: () => void): number {
  return requestAnimationFrame(fn); // @expect core-boundary/no-dom
}

export function measure(canvas: HTMLCanvasElement): number { // @expect core-boundary/no-dom
  return canvas.width;
}

export const context: CanvasRenderingContext2D | null = null; // @expect core-boundary/no-dom

// 3. Math.random(), in each of its three shapes.
export function roll(): number {
  return Math.random(); // @expect core-boundary/no-math-random
}

export function rollIndexed(): number {
  return Math['random'](); // @expect core-boundary/no-math-random
}

const { random } = Math; // @expect core-boundary/no-math-random

// 4. The gate may not be switched off from inside the file it gates.
//    `noInlineConfig` is set for core/ in eslint.config.js, so this disable
//    comment is inert and the line below is still reported.
// eslint-disable-next-line core-boundary/no-math-random
export const forced = Math.random(); // @expect core-boundary/no-math-random

// ---------------------------------------------------------------------------
// 5. The escape routes. Every line below passed the gate at one point and was
//    closed after an adversarial review demonstrated it. They are here so that
//    reopening one is a test failure rather than a discovery.
// ---------------------------------------------------------------------------

// 5a. A template literal specifier. Every bundler resolves this statically and
//     emits the chunk, so reading only `Literal` nodes let a real
//     cross-boundary import through while appearing to have checked it.
export async function lazyTemplate(): Promise<unknown> {
  return import(`../ui/panel`); // @expect core-boundary/no-forbidden-imports
}

const templatedFelt = require(`../render/felt`); // @expect core-boundary/no-forbidden-imports

// 5b. Bare BOM readouts. These reach the same values as `window.innerWidth`
//     without ever naming `window`. devicePixelRatio is the sharp one: it is
//     the value the single coordinate transform is required to exclude.
export function ratio(): number {
  return devicePixelRatio; // @expect core-boundary/no-dom
}

export function viewportWidth(): number {
  return innerWidth; // @expect core-boundary/no-dom
}

// 5c. The interface types themselves. A core function that accepts one of
//     these can do arbitrary DOM work through the parameter.
export function readTitle(d: Document): string { // @expect core-boundary/no-dom
  return d.title;
}

export function readWidth(w: Window): number { // @expect core-boundary/no-dom
  return w.innerWidth;
}

export function textWidth(m: TextMetrics): number { // @expect core-boundary/no-dom
  return m.width;
}

// 5d. Computed access through globalThis, which no property-level check can
//     read. This is why globalThis and self are refused outright in core/.
export function sneakyDocument(): unknown {
  return globalThis['doc' + 'ument']; // @expect core-boundary/no-dom
}

export function sneakyReflect(): unknown {
  return Reflect.get(globalThis, 'document'); // @expect core-boundary/no-dom
}

export function sneakyRandom(): number {
  return globalThis.Math.random(); // @expect core-boundary/no-dom
}

// 5e. Capturing Math itself, which puts Math.random one hop beyond a rule that
//     only looks one hop.
const captured = Math; // @expect core-boundary/no-math-random
export const aliasedRoll = (): number => captured.random();

const key = 'random';
export function computedRoll(): number {
  return (Math as unknown as Record<string, () => number>)[key]!(); // @expect core-boundary/no-math-random
}

export { drawFelt, mountChrome, Surface, cardChrome, felt, random, templatedFelt };
export type { LazySurface };
