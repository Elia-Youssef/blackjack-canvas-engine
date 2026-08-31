/**
 * What the game cannot start without, and the notice for a browser that has
 * none of it. `BJ-21`, item `A5` (Major), QUALITY-BAR section 2 and SPEC 3.
 *
 *   "An unsupported browser receives a styled, accessible notice. Never a blank
 *    canvas and never an uncaught error."
 *
 * **The test runs before the boot, and it is the entry's first statement.**
 * `src/main.ts` asks `missingCapabilities` and mounts the notice instead of
 * building anything when the answer is not empty. That order is the whole item:
 * a feature test after the composition root has already asked for a 2D context
 * is a stack trace with a notice after it, which the criterion's second sentence
 * forbids in as many words.
 *
 * **The list is what this game genuinely needs, not a browser census.**
 * QUALITY-BAR section 2 defines the unsupported tier as "anything without ES2020
 * modules, Pointer Events, or `matchMedia().addEventListener`", and each of the
 * three is answered here or answered by the page, on its own terms:
 *
 *   - **ES2020 modules** cannot be feature tested from inside a module: a
 *     browser that cannot parse `type="module"` never runs a line of this
 *     bundle. The page answers that one instead, with the `nomodule` script the
 *     build emits beside `index.html`, which clones the same `<template>` this
 *     file clones. That is why the notice lives in the page rather than being
 *     built here: one copy of the sentence, reachable from both routes.
 *   - **Pointer Events** are deliberately not tested, because this game binds
 *     none. Item `D1` at `BJ-17` established that every control is a real
 *     `<button>` bound once to `click`, and `tests/unit/input-surface.test.ts`
 *     fails the suite if any file under `src/` so much as names the pointer
 *     event type. A feature test for a capability the product does not use
 *     would turn a browser that runs this game perfectly into an unsupported
 *     one.
 *   - **`matchMedia().addEventListener`** is tested, in the form the code
 *     actually depends on. `src/ui/motion.ts` and `src/ui/forced-colors.ts`
 *     both degrade where `matchMedia` is missing altogether; the method itself
 *     is `motion.ts`'s alone, because it is the one of the two that subscribes,
 *     and `forced-colors.ts` says in its own header that it deliberately does
 *     not. Where `matchMedia` exists and answers with the legacy listener
 *     interface alone, `addEventListener` on the query is a `TypeError` during
 *     the boot. QUALITY-BAR section 2 puts both arms in the same tier, so the
 *     probe below does too. The day `motion.ts` stops subscribing, this
 *     requirement has to be re-argued or dropped: a capability standing on a
 *     dependency nobody has turns browsers that run this game into unsupported
 *     ones.
 *
 * The two the section does not name are the ones without which there is no game
 * at all: a 2D drawing context, and a frame clock.
 *
 * **Storage is deliberately absent from the list.** `src/storage/store.ts`
 * probes the property access itself and falls back to an in-memory store, so a
 * browser with cookies blocked entirely is a browser this game runs on with the
 * cross-session carry degraded. Item `I3` grades that, and putting storage in
 * this list would turn a supported browser into an unsupported one.
 *
 * **Audio is absent for the same reason**, and QUALITY-BAR section 10 states it:
 * "nothing in either game requires audio", and `src/ui/audio.ts` feature tests
 * its own context and plays silently where there is none.
 */

/** One capability, its name as the notice reports it, and its probe. */
export interface Capability {
  /** The name written to the notice's data attribute when this one is absent. */
  readonly name: string;
  /** True when the platform has it. Never throws: see each probe. */
  readonly present: () => boolean;
}

/** The page's notice, as a template nothing has cloned yet. */
const NOTICE_TEMPLATE_SELECTOR = 'template[data-unsupported]';

/**
 * Whether a 2D drawing context can be had at all.
 *
 * `getContext` answers `null` on a platform that has the element and not the
 * context, and throws on one that refuses it outright, which some privacy
 * configurations do rather than answering. Both mean the same thing here, so
 * both are one answer.
 */
function hasCanvas2d(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  try {
    return document.createElement('canvas').getContext('2d') !== null;
  } catch (error) {
    // Bound and read, per QUALITY-BAR section 12. The value is reported rather
    // than discarded, because a platform that refuses a canvas by throwing is
    // worth seeing in a console beside the notice the player is reading.
    console.error(error);
    return false;
  }
}

/**
 * Whether a media query can be asked and listened to.
 *
 * The query is a harmless always-true one rather than either of the two the
 * game uses, because what is being probed is the interface and not the answer.
 */
function hasMediaQueryEvents(): boolean {
  if (typeof matchMedia !== 'function') {
    return false;
  }
  try {
    return typeof matchMedia('(min-width: 0px)').addEventListener === 'function';
  } catch (error) {
    console.error(error);
    return false;
  }
}

/** Whether there is a frame clock to drive the loop. */
function hasAnimationFrames(): boolean {
  return typeof requestAnimationFrame === 'function';
}

/** Every capability the game requires, in the order the notice reports them. */
const REQUIRED_CAPABILITIES: readonly Capability[] = Object.freeze([
  Object.freeze({ name: 'canvas-2d', present: hasCanvas2d }),
  Object.freeze({ name: 'media-query-events', present: hasMediaQueryEvents }),
  Object.freeze({ name: 'animation-frames', present: hasAnimationFrames }),
]);

/** The names of the capabilities this platform is missing. Empty is supported. */
export function missingCapabilities(): readonly string[] {
  const missing: string[] = [];
  for (const capability of REQUIRED_CAPABILITIES) {
    if (!capability.present()) {
      missing.push(capability.name);
    }
  }
  return missing;
}

/**
 * Show the page's notice, and say whether the caller should stop.
 *
 * Returns `true` when the game must not boot. The two halves are one function
 * because there is exactly one correct pairing of them: a caller that could show
 * the notice and boot anyway, or refuse to boot and show nothing, is the defect
 * this item is about.
 *
 * The notice is cloned rather than built. `index.html` carries the heading, the
 * sentence and the `role="alert"`, so a browser that cannot run a module at all
 * still has something to show, and there is one copy of the wording rather than
 * two that could drift.
 */
export function showUnsupportedNotice(missing: readonly string[]): boolean {
  if (missing.length === 0) {
    return false;
  }
  if (typeof document === 'undefined') {
    return true;
  }
  const template = document.querySelector(NOTICE_TEMPLATE_SELECTOR);
  if (!(template instanceof HTMLTemplateElement)) {
    // Not silent, and not a boot either. A page without the template is a page
    // this bundle was dropped into rather than the one the build emits, and
    // starting a game the platform cannot draw is the worse of the two answers,
    // so the refusal stands and the reason goes to the console.
    console.error(new Error(`this page carries no ${NOTICE_TEMPLATE_SELECTOR}`));
    return true;
  }
  const copy = template.content.cloneNode(true);
  const notice = copy instanceof DocumentFragment ? copy.firstElementChild : null;
  if (notice instanceof HTMLElement) {
    // What was missing, for the browser gate and for anyone reading the page.
    notice.setAttribute('data-unsupported-missing', missing.join(' '));
  }
  document.body.append(copy);
  if (notice instanceof HTMLElement) {
    notice.focus();
  }
  return true;
}
