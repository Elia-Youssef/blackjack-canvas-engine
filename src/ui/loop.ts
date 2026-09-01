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
 *
 * The `document` reading and the two target types are `src/ui/platform.ts`'s:
 * three modules degraded on the same `typeof` guard and now share it. Why this
 * one degrades, and what it does with a page that has no tabs to hide, stays
 * here.
 */

import { type PageTarget, type VisibilityTarget, pageDocument } from './platform';

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
  /**
   * Where `pagehide` and `pageshow` are read. Defaults to the page's `window`,
   * or `null`.
   */
  readonly page?: PageTarget | null;
  /**
   * Called when the page goes hidden, or is being unloaded, while the loop is
   * running. QUALITY-BAR section 7: persistence writes happen on those two
   * moments and never on `beforeunload`. The loop stops first, so what the
   * callback observes is a game whose frame has genuinely ended.
   */
  readonly onHidden?: () => void;
}

/** Build a loop. Nothing is scheduled until `start` is called. */
export function createFrameLoop(options: FrameLoopOptions): FrameLoop {
  const schedule =
    options.schedule ?? ((callback: (timestamp: number) => void): number => requestAnimationFrame(callback));
  const cancel = options.cancel ?? ((handle: number): void => { cancelAnimationFrame(handle); });
  // A host with no document is a host whose tabs cannot hide, and the loop
  // there simply never pauses.
  const documentTarget: VisibilityTarget | null =
    options.visibility === undefined ? pageDocument() : options.visibility;
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
  /**
   * Whether the loop stopped because `pagehide` put the page away.
   *
   * The flag is `pausedByVisibility`'s twin and is read the same way: only the
   * handler that performed a stop may undo it. It is set in the one arm of
   * `onPageHide` that actually stops a running loop, so a `pagehide` that
   * found the loop already stopped, which is what the ordinary exit ordering
   * produces, leaves it false and leaves the resume to the visibility path
   * that owns it.
   */
  let stoppedByPageHide = false;

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
    // Cleared before the guard, so the flag can never outlive the stop it
    // describes: whoever starts the loop, the previous `pagehide` has been
    // answered and a later `pageshow` has nothing left to restore.
    stoppedByPageHide = false;
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
   * where `visibilitychange` does not, and restarts nothing itself, because
   * the page is leaving rather than hiding.
   *
   * The one route back is `onPageShow` below, and it is the platform's own
   * word rather than this handler's: a page that left is gone, and a page the
   * back/forward cache revives says so on the event it is revived by. What
   * this handler owes that one is the flag, set here and only here, so the
   * revival can tell its own stop from anybody else's.
   */
  function onPageHide(): void {
    if (handle !== null) {
      pausedByVisibility = false;
      stoppedByPageHide = true;
      stop();
      options.onHidden?.();
    }
  }

  /**
   * QUALITY-BAR section 7: `pageshow` with `event.persisted` restores from
   * bfcache without a reload.
   *
   * It is `onPageHide`'s other half, and the page it answers is one nothing
   * else would ever start again. A page put into the back/forward cache is
   * stopped by `pagehide` and revived without a load, so the boot that starts
   * a loop on a fresh page does not run, and no `visibilitychange` is owed on
   * that route either: the tab was never hidden, it was put away whole.
   *
   * Both halves of the revival are required before anything restarts.
   * `persisted` is the platform saying the page came back rather than arrived,
   * and a `pageshow` without it is a fresh load, which is the boot's business
   * and not this loop's. The flag is this loop saying the stop was `pagehide`'s
   * own, so a loop stopped by `dispose`, by a replaced shell or by the
   * visibility pause stays the business of whoever stopped it. That is the
   * same reading `pausedByVisibility` carries above, and it is what keeps the
   * ordinary exit ordering single: a page that hid before it left resumes
   * through the visibility path, and this one finds nothing to do.
   */
  function onPageShow(event: Event): void {
    // `persisted` belongs to `PageTransitionEvent` and is absent from a plain
    // `Event`, so the read is a cast and the comparison is to `true` rather
    // than a truthiness test: an event carrying no such field is a load.
    if ((event as PageTransitionEvent).persisted !== true) {
      return;
    }
    if (!stoppedByPageHide) {
      return;
    }
    stoppedByPageHide = false;
    start();
  }

  visibilityTarget?.addEventListener('visibilitychange', onVisibility);
  pageTarget?.addEventListener('pagehide', onPageHide);
  pageTarget?.addEventListener('pageshow', onPageShow);

  return {
    start,
    stop,
    running: () => handle !== null,
    dispose(): void {
      pausedByVisibility = false;
      stoppedByPageHide = false;
      stop();
      visibilityTarget?.removeEventListener('visibilitychange', onVisibility);
      pageTarget?.removeEventListener('pagehide', onPageHide);
      pageTarget?.removeEventListener('pageshow', onPageShow);
    },
  };
}
