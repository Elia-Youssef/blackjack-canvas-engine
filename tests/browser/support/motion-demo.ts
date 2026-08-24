/**
 * The demonstration hook for item `E6`, and the page half of
 * `tests/browser/motion-demo.spec.ts`. Nothing here ships.
 *
 *   "The specified motion set is present and correct: arc travel on dealt
 *    cards, horizontal-scale hole card flip, chip slide and stack, balance
 *    count-up, win pulse. The dealer's peek is identical in motion and pacing
 *    whether or not it finds a natural: no tell, no timing difference, no
 *    animation variation."
 *
 * **`E6` is method D and closes at the ACCEPTANCE section 4 demonstration
 * session, on the capture `demo/motion`.** What this file is, is the route that
 * capture takes and the armour under it. It boots the **real composition root**
 * at a chosen seed, so what is captured is the game a player receives rather
 * than a staged scene: `tests/browser/support/render-demo.ts` staged scenes at
 * `BJ-13` because there was no game to read a table off, and there is one now.
 *
 * It is bundled by the spec with Vite's library build at test time, with
 * `write: false`, and injected into the served `dist/` page. The shipped bundle
 * never imports it and `npm run verify:build` fingerprints the same bytes with
 * and without it.
 *
 * **It is injected alone, never beside `game-harness.ts`.** Each injected bundle
 * carries its own copy of the composition root, and a copy has its own record of
 * the game it last built, so two of them on one page would run two frame loops
 * over one canvas with neither able to dispose the other. The spec that uses
 * this file therefore observes through the chrome's own attributes and through
 * the probe below.
 *
 * A reviewer can drive the same scenes by hand, without Playwright, from the dev
 * server console:
 *
 *   npm run dev
 *   const demo = await import('/tests/browser/support/motion-demo.ts');
 *   demo.peekBranches();          // the two seeds, and what each peek finds
 *   demo.mountPeek('natural');    // deal the branch that finds one
 *   demo.mountPeek('none');       // and the branch that does not
 *
 * Take both. The clause is a comparison, and one capture cannot make it.
 */

import { boot, type Game, type MotionProbe } from '../../../src/main';

import { peekBranches, peekSeed, type PeekBranch } from './peek-seeds';

export { peekBranches, peekSeed };
export type { PeekBranch };

let mounted: Game | null = null;

/** What a mounted scene reports back, so a spec knows what it is watching. */
export interface MountedRound {
  readonly seed: number;
  readonly branch: PeekBranch | null;
}

/**
 * Boot the real game on this page at a chosen seed, replacing whatever ran.
 *
 * `boot` disposes what this module last built, including the game the shipped
 * page started for itself, so exactly one frame loop survives the call.
 */
export function mountSeed(seed: number): MountedRound {
  mounted = boot({ seed });
  return { seed, branch: null };
}

/**
 * `demo/motion`: one arm of SPEC 4.4's peek, dealt for the capture.
 *
 * Everything the criterion lists is in this one round, because the composition
 * root animates the real game: the cards arc in from the shoe and land with a
 * settle, the chips slide to the wager spot and stack, the hole card turns
 * through zero width at the reveal, the balance counts rather than snapping,
 * and a winning hand pulses.
 */
export function mountPeek(branch: PeekBranch): MountedRound {
  const seed = peekSeed(branch);
  mounted = boot({ seed });
  return { seed, branch };
}

/** What the last frame resolved for motion, from the game this file mounted. */
export function probe(): MotionProbe {
  return running().motion();
}

// ---------------------------------------------------------------------------
// The machine's own clock, sampled per frame. Item `E6`'s no-tell clause.
// ---------------------------------------------------------------------------

/**
 * One visit to one phase, as the machine's timed accumulator saw it.
 *
 * **This is simulation time, not wall time, and that is the whole point.** A
 * wall-clock reading of a 0.30 s window is worth about a frame at each edge on
 * an idle machine and rather less than that on a loaded one, and the two clocks
 * can drift apart by a proportion: this part measured two phases at once both
 * reading five sixths of their duration. A gap wide enough to survive that is
 * wide enough to swallow a real tell, which is exactly what happened when the
 * reviewer branched the peek by 30 percent and the wall-clock band did not
 * notice.
 *
 * `TableReadout.elapsed` is the float `update` accumulates and compares against
 * the phase's duration. It cannot drift against the thing it is compared to,
 * because it **is** the thing it is compared to. Sampling it per frame brackets
 * the duration between two adjacent frames: the machine fires the step on the
 * first frame where the accumulator has been paid, so the duration is greater
 * than the largest value observed and at most one frame more than it.
 */
export interface PhaseAccumulator {
  readonly phase: string;
  /** The largest the accumulator got in this visit, in seconds. */
  readonly maxElapsed: number;
  /** The largest step between two consecutive samples: one frame's delta. */
  readonly maxStep: number;
  readonly samples: number;
}

let sampling = false;
const sampled: { phase: string; elapsed: number }[] = [];

/** No trace runs longer than this, so a spec cannot hang on a stuck page. */
const SAMPLE_LIMIT = 4000;

/** Begin sampling the machine's phase and accumulator, once per frame. */
export function watchAccumulator(): void {
  sampled.length = 0;
  sampling = true;
  let frames = 0;
  const tick = (): void => {
    const snapshot = running().readout();
    sampled.push({ phase: snapshot.phase.kind, elapsed: snapshot.elapsed });
    frames += 1;
    if (sampling && frames < SAMPLE_LIMIT) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

/** Stop the sampler. */
export function stopAccumulator(): void {
  sampling = false;
}

/**
 * Every visit to every phase, folded out of the samples in order.
 *
 * A visit ends when the phase changes. Within a visit the accumulator rises by
 * one frame's delta per sample and is reset by each step it pays for, so a phase
 * of several steps saws; `maxElapsed` is the high-water mark either way, and for
 * a one-step phase like the peek it is the last reading before the step fired.
 */
export function accumulators(): readonly PhaseAccumulator[] {
  const visits: PhaseAccumulator[] = [];
  let phase: string | null = null;
  let maxElapsed = 0;
  let maxStep = 0;
  let samples = 0;
  let previous = 0;

  const close = (): void => {
    if (phase !== null) {
      visits.push({ phase, maxElapsed, maxStep, samples });
    }
  };

  for (const sample of sampled) {
    if (sample.phase !== phase) {
      close();
      phase = sample.phase;
      maxElapsed = sample.elapsed;
      maxStep = 0;
      samples = 0;
      previous = sample.elapsed;
    }
    maxElapsed = Math.max(maxElapsed, sample.elapsed);
    maxStep = Math.max(maxStep, sample.elapsed - previous);
    previous = sample.elapsed;
    samples += 1;
  }
  close();
  return visits;
}

/** The game this module last mounted, for a console session. */
export function running(): Game {
  if (mounted === null) {
    throw new Error('the motion demo has not mounted a game');
  }
  return mounted;
}

export interface MotionDemoApi {
  peekBranches: typeof peekBranches;
  peekSeed: typeof peekSeed;
  mountSeed: typeof mountSeed;
  mountPeek: typeof mountPeek;
  probe: typeof probe;
  watchAccumulator: typeof watchAccumulator;
  stopAccumulator: typeof stopAccumulator;
  accumulators: typeof accumulators;
}

declare global {
  interface Window {
    /** Assigned by the demo hook, never by the product. */
    __bjMotionDemo?: MotionDemoApi;
  }
}

window.__bjMotionDemo = {
  peekBranches,
  peekSeed,
  mountSeed,
  mountPeek,
  probe,
  watchAccumulator,
  stopAccumulator,
  accumulators,
};
