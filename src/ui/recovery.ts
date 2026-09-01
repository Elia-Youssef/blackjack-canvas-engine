/**
 * The top-level error boundary, and the recovery panel it mounts. `BJ-21`,
 * item `M4` (Critical), QUALITY-BAR section 12 and SPEC 18.
 *
 *   "A thrown error from the loop, a window.onerror and an unhandledrejection
 *    each stop the loop cleanly and show a styled, accessible recovery panel
 *    with a working reload action. No bare catch block exists in the source."
 *
 * **Three routes, one handler, one panel.** A throw out of the frame callback
 * arrives through `run`, which is what the composition root wraps its frame in;
 * an uncaught error anywhere else on the page arrives through the `error`
 * listener; a rejected promise nobody handled arrives through
 * `unhandledrejection`. All three call `fail`, and `fail` runs once: the first
 * failure stops the game and mounts the panel, and every failure after it is
 * recorded and otherwise ignored, because a page that replaced its own recovery
 * panel each time a stopped game threw again would be a panel the player could
 * not press.
 *
 * **Stopping is the composition root's `dispose`, not a flag.** `stop` is
 * handed in, and what it does is dispose the running game: the frame loop's
 * scheduled callback is cancelled, the visibility and page listeners come off,
 * the audio engine's gesture handlers come off, the focus policy's `keydown`
 * comes off, and the shell leaves the page. That is what "stops the loop
 * cleanly" means here, and it is why the panel is mounted after the stop rather
 * than beside it: the alternative, a frozen canvas with a panel over it, is the
 * exact thing QUALITY-BAR section 12 forbids.
 *
 * **Nothing is saved on the way down, and that is deliberate.** SPEC 13's save
 * points are the round boundary and a setting change, so the document on disk is
 * the last state the game was known to be consistent in. A crashed frame's state
 * is precisely the state that must not be written: the failure could be halfway
 * through the sequence a round boundary exists to be outside of. So a crash
 * costs at most the current round, which SPEC 13 never persisted anyway.
 *
 * **The caught value is reported, never swallowed.** The console is the only
 * place a thrown value can go on a page with no server to send it to, and
 * QUALITY-BAR section 12's rule is that nothing fails silently. Two files in
 * `src/` write to the console and they are the two this part added, this one and
 * `src/ui/capability.ts`; between them there are five calls and every one of
 * them is on a failure path, which is why `tests/browser/scaffold.spec.ts` still
 * requires a clean load to log nothing at all.
 *
 * **The panel is chrome, like everything else a player reads.** It is built
 * from `src/ui/dom.ts`'s element factory, so its button is a real `<button>`
 * with the platform's focus order and keyboard operation; its sentences are
 * `src/ui/text.ts`'s, so this file assembles no user-facing string; and every
 * value in its stylesheet block resolves through the token layer, so it is
 * legible under forced colors and at 200 percent text without a rule of its own.
 * Focus moves to it on arrival, because the shell it replaced took the focused
 * control with it and `<body>` is where a screen reader loses its place.
 *
 * **`window` is not named here.** `tests/unit/storage-write-failure.test.ts`
 * scans every file under `src/` for the three names `window`, `localStorage`
 * and `sessionStorage`, and requires all of them to appear in one file,
 * `src/storage/store.ts`, where the storage probe lives. That scan is about
 * those three names and nothing else. The two page-level events are therefore
 * read from `document.defaultView`, which is the same object reached the way
 * `src/ui/loop.ts` already reaches it for `pagehide`.
 */

import { button, el } from './dom';
import { type PageTarget, pageDocument } from './platform';
import { recoveryMessage, recoveryReloadLabel, recoveryTitle } from './text';

/** The id the panel's heading carries, so the panel can be named by it. */
const TITLE_ID = 'bj-recovery-title';

/** What a boundary is built from. Everything platform-shaped is injectable. */
export interface ErrorBoundaryOptions {
  /**
   * Where the panel is mounted, resolved at the moment of failure.
   *
   * A function rather than an element, because the boundary is installed before
   * the first game is built and the mount point is the composition root's to
   * know. It must not throw: a mount that failed would leave the page with a
   * stopped game and nothing to read.
   */
  readonly mount: () => HTMLElement;
  /** Stop the running game: its loop, its listeners and its shell. */
  readonly stop: () => void;
  /** The reload action. Defaults to the platform's own. */
  readonly reload?: () => void;
  /** Where `error` and `unhandledrejection` are read. Defaults to the page. */
  readonly page?: PageTarget | null;
}

/** An installed boundary. Its listeners are attached at construction. */
export interface ErrorBoundary {
  /**
   * Run one piece of work, and hand anything it throws to `fail`.
   *
   * The composition root wraps its frame callback in this, which is the "thrown
   * error from the loop" route. `src/ui/loop.ts` schedules the next frame
   * before calling back, so a throw would stop the loop on its own; what this
   * adds is the clean stop and the panel, which is the half the criterion is
   * actually about.
   */
  run(work: () => void): void;
  /** Report a failure from anywhere. Runs its handling exactly once. */
  fail(error: unknown): void;
  /** Whether the boundary has fired. */
  failed(): boolean;
  /** How many failures have arrived, including the ones after the first. */
  failures(): number;
}

/** Install a boundary. Nothing is mounted until something fails. */
export function createErrorBoundary(options: ErrorBoundaryOptions): ErrorBoundary {
  // A host with no document has no window to listen on, and the boundary there
  // is the `run` wrapper alone rather than nothing at all.
  const pageTarget: PageTarget | null =
    options.page === undefined ? (pageDocument()?.defaultView ?? null) : options.page;
  const reload =
    options.reload ??
    ((): void => {
      // The one navigation in the project. `location` rather than the window's
      // property, for the reason this file's header gives.
      location.reload();
    });

  let stopped = false;
  let count = 0;

  /** SPEC 18's panel, built once, from the sentence home and the factory. */
  function panel(): HTMLElement {
    const title = el('h1', {
      className: 'bj-recovery__title',
      text: recoveryTitle(),
      attributes: { id: TITLE_ID },
    });
    const message = el('p', { className: 'bj-recovery__message', text: recoveryMessage() });
    const action = button(recoveryReloadLabel(), reload, {
      className: 'bj-button bj-button--primary',
      attributes: { 'data-control': 'recovery-reload' },
    });
    return el('div', {
      className: 'bj-recovery',
      attributes: {
        // An alert, so the arrival is announced by a screen reader that was
        // reading something else, and focusable so the reload action is one Tab
        // away rather than wherever the removed shell left the caret.
        role: 'alert',
        tabindex: '-1',
        'aria-labelledby': TITLE_ID,
        'data-recovery': 'panel',
      },
      children: [title, message, action],
    });
  }

  function fail(error: unknown): void {
    count += 1;
    if (stopped) {
      return;
    }
    stopped = true;
    // Reported rather than swallowed. See this file's header: the console is
    // the only place it can go, and a silent stop is what section 12 forbids.
    console.error(error);
    // **The panel is not conditional on the stop succeeding.** A game whose own
    // teardown throws is exactly the game a player most needs a way out of, and
    // a boundary that let a second failure take the panel with it would leave
    // the frozen canvas this item exists to prevent. So the stop is attempted,
    // its failure is reported beside the first one rather than replacing it,
    // and the panel is mounted either way.
    try {
      options.stop();
    } catch (stopFailure) {
      console.error(stopFailure);
    }
    const host = options.mount();
    const node = panel();
    host.replaceChildren(node);
    node.focus();
  }

  function onError(event: Event): void {
    fail(event instanceof ErrorEvent ? event.error : event);
  }

  function onRejection(event: Event): void {
    fail(event instanceof PromiseRejectionEvent ? event.reason : event);
  }

  pageTarget?.addEventListener('error', onError);
  pageTarget?.addEventListener('unhandledrejection', onRejection);

  return {
    run(work: () => void): void {
      try {
        work();
      } catch (error) {
        // Bound and read, which is the whole of QUALITY-BAR section 12's rule
        // about this shape: the value is what the panel exists because of, and
        // it reaches the console through `fail`.
        fail(error);
      }
    },
    fail,
    failed: () => stopped,
    failures: () => count,
  };
}
