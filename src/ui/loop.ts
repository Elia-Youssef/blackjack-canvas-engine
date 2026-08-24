/**
 * The frame loop. DESIGN section 3.
 *
 * It lives under `src/ui/` and not under `src/render/`, and the reason is a
 * gate rather than taste: `tests/unit/render-surface.test.ts` scans every module
 * in `src/render/` for `requestAnimationFrame`, `Date`, `performance` and
 * `setTimeout`, because a renderer that reads a clock is a renderer that can
 * disagree with the simulation about what time it is. The clock belongs on the
 * platform side of that line, and `src/ui/` is where the platform lives.
 *
 * **This module decides nothing about the game.** It converts frame timestamps
 * into a delta in seconds and hands each one to its caller, which is the whole
 * of it. Clamping that delta is `core/table.ts`'s `clampDelta`, per QUALITY-BAR
 * section 7, and the machine applies it inside `update`; a second clamp here
 * would be a second reading of the same rule.
 *
 * **The step and render seam is deliberately one callback.** `BJ-14` adds the
 * tween layer between the machine's `update` and the render, and item `E7`
 * grades that reduced motion removes the animation without changing the
 * sequence of states. A loop that owned the order of those calls would be the
 * thing `BJ-14` had to unpick; a loop that owns only the delta is one it can
 * build on.
 *
 * No acceptance item is claimed here. `M5` at `BJ-12` already grades frame
 * independence against a derived wall-clock schedule, and it drives the machine
 * directly rather than through this file for exactly the reason above: the
 * simulation's behaviour must not depend on who is holding the clock.
 */

/** Milliseconds per second, for the one conversion this module performs. */
const MS_PER_SECOND = 1000;

/** A running loop. */
export interface FrameLoop {
  /** Begin scheduling frames. Calling it twice is harmless. */
  start(): void;
  /** Stop scheduling. The frame in flight is cancelled, not awaited. */
  stop(): void;
  /** Whether frames are currently scheduled. */
  running(): boolean;
}

/** What a loop is built from. Both schedulers are injectable, for a test. */
export interface FrameLoopOptions {
  /**
   * One frame's work, given the seconds since the previous frame.
   *
   * The first frame of a run reports zero, because there is no previous frame
   * to measure from and inventing one would advance the game by an interval
   * nobody waited.
   */
  readonly onFrame: (dt: number) => void;
  /** Defaults to `requestAnimationFrame`. */
  readonly schedule?: (callback: (timestamp: number) => void) => number;
  /** Defaults to `cancelAnimationFrame`. */
  readonly cancel?: (handle: number) => void;
}

/** Build a loop. Nothing is scheduled until `start` is called. */
export function createFrameLoop(options: FrameLoopOptions): FrameLoop {
  const schedule =
    options.schedule ?? ((callback: (timestamp: number) => void): number => requestAnimationFrame(callback));
  const cancel = options.cancel ?? ((handle: number): void => { cancelAnimationFrame(handle); });

  let handle: number | null = null;
  let previous: number | null = null;

  function frame(timestamp: number): void {
    // Scheduled again first, so a throw from `onFrame` stops the loop rather
    // than leaving one frame queued behind it. The error boundary that turns
    // that stop into a recovery panel is item `M4` at `BJ-21`; what this file
    // owes that part is a loop that does not swallow anything, and there is no
    // `catch` in it at all.
    handle = schedule(frame);
    const dt = previous === null ? 0 : (timestamp - previous) / MS_PER_SECOND;
    previous = timestamp;
    options.onFrame(dt);
  }

  return {
    start(): void {
      if (handle !== null) {
        return;
      }
      previous = null;
      handle = schedule(frame);
    },

    stop(): void {
      if (handle === null) {
        return;
      }
      cancel(handle);
      handle = null;
      previous = null;
    },

    running(): boolean {
      return handle !== null;
    },
  };
}
