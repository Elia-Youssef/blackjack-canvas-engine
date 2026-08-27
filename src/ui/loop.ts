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
  /** Stop scheduling frames. The frame in flight is cancelled, not awaited. */
  stop(): void;
  /** Whether frames are currently scheduled. */
  running(): boolean;
  /**
   * Stop and take the platform listeners off. `BJ-20`, item `C7`.
   *
   * `stop` alone leaves the `visibilitychange` listener bound, which is right
   * for a pause and wrong for the end of a game's life: a listener left behind
   * by a disposed game would answer the next tab switch on behalf of a page it
   * no longer owns, and the `onHidden` write it carries is exactly the kind of
   * write a dead game must not make. The composition root's `dispose` calls
   * this; nothing else needs to.
   */
  dispose(): void;
}

/**
 * The visibility half of the platform, read for `visibilityState`.
 *
 * `EventTarget` plus the one field the handler reads, so a test can build a
 * fake that answers honestly without a page. The same shape `src/ui/audio.ts`
 * reads its resume from.
 */
type VisibilityTarget = EventTarget & { readonly visibilityState: string };

/**
 * Where `pagehide` is read from. Window in a page, `null` under a headless
 * test that did not inject one.
 */
type PageTarget = EventTarget;

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
  /**
   * Where `visibilitychange` is read. Defaults to the page's `document`, or
   * `null` where there is none. `BJ-20`, item `C7`.
   */
  readonly visibility?: VisibilityTarget | null;
  /** Where `pagehide` is read. Defaults to the page's `window`, or `null`. */
  readonly page?: PageTarget | null;
  /**
   * Called when the page goes hidden, or is being unloaded, while the loop is
   * running. QUALITY-BAR section 7: persistence writes happen on those two
   * moments and never on `beforeunload`. The loop stops first, so what the
   * callback observes is a game whose frame has genuinely ended.
   */
  readonly onHidden?: () => void;
}

/**
 * The page's `document`, or `null` where there is none to read.
 *
 * Read off the global scope by name rather than through `window`, on the same
 * terms `src/ui/audio.ts` reads its own targets: a host with no document is a
 * host whose tabs cannot hide, and the loop there simply never pauses.
 */
function platformDocument(): Document | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return document;
}

/** Build a loop. Nothing is scheduled until `start` is called. */
export function createFrameLoop(options: FrameLoopOptions): FrameLoop {
  const schedule =
    options.schedule ?? ((callback: (timestamp: number) => void): number => requestAnimationFrame(callback));
  const cancel = options.cancel ?? ((handle: number): void => { cancelAnimationFrame(handle); });
  const documentTarget: VisibilityTarget | null =
    options.visibility === undefined ? platformDocument() : options.visibility;
  const visibilityTarget = documentTarget;
  // `pagehide` fires on the window, and the document's own `defaultView` is
  // that window. Reaching it that way rather than by naming the `window`
  // global keeps the one-seam scan in `tests/unit/storage-write-failure.test.ts`
  // honest: exactly one file under `src/` names the platform's window, and it
  // is the store's.
  const pageTarget: PageTarget | null =
    options.page === undefined
      ? ((documentTarget as Document | null)?.defaultView ?? null)
      : options.page;

  let handle: number | null = null;
  let previous: number | null = null;
  /**
   * Whether the loop stopped itself because the page went hidden.
   *
   * The flag is what keeps `start` and `stop` meaning what their callers said:
   * a visible event restarts the loop only if the loop paused itself, so a
   * game that was stopped deliberately, by `dispose` or by a replaced shell,
   * stays stopped when the tab comes back.
   */
  let pausedByVisibility = false;

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

  function start(): void {
    if (handle !== null) {
      return;
    }
    previous = null;
    handle = schedule(frame);
  }

  function stop(): void {
    if (handle === null) {
      return;
    }
    cancel(handle);
    handle = null;
    previous = null;
  }

  /**
   * QUALITY-BAR section 7 and item `C7`: a hidden tab pauses the animation,
   * and a visible one resumes it.
   *
   * The pause is a real stop rather than a flag the frame callback checks,
   * because the whole hazard of a hidden tab is what the platform does to
   * `requestAnimationFrame` while nobody is looking: it stops delivering
   * frames, then delivers one with a gap, and the machine's clamp and resume
   * rule already answer the gap. Stopping here means the machine is not asked
   * about time it never observed, which is the stronger half of SPEC 3's
   * "pause animation, preserve state, no penalty".
   */
  function onVisibility(): void {
    if (visibilityTarget === null) {
      return;
    }
    if (visibilityTarget.visibilityState === 'hidden') {
      if (handle !== null) {
        pausedByVisibility = true;
        stop();
        options.onHidden?.();
      }
      return;
    }
    if (pausedByVisibility) {
      pausedByVisibility = false;
      start();
    }
  }

  /**
   * QUALITY-BAR section 7: the write also happens on `pagehide`, which fires
   * where `visibilitychange` does not, and never restarts anything, because
   * the page is leaving rather than hiding.
   */
  function onPageHide(): void {
    if (handle !== null) {
      pausedByVisibility = false;
      stop();
      options.onHidden?.();
    }
  }

  visibilityTarget?.addEventListener('visibilitychange', onVisibility);
  pageTarget?.addEventListener('pagehide', onPageHide);

  return {
    start,
    stop,
    running: () => handle !== null,
    dispose(): void {
      pausedByVisibility = false;
      stop();
      visibilityTarget?.removeEventListener('visibilitychange', onVisibility);
      pageTarget?.removeEventListener('pagehide', onPageHide);
    },
  };
}
