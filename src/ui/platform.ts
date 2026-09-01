/**
 * The two platform readings the chrome shares, in one place.
 *
 * Five modules degrade rather than throw where the host offers no `document`
 * and no `matchMedia`, and each carried its own copy of the guard until this
 * file. What differed between the copies was a query constant and a return
 * annotation, which is a parameter and a type; what is left here is the reading
 * and nothing else.
 *
 * **The globals are still read by name, which is the property the copies were
 * written for.** `tests/unit/storage-write-failure.test.ts` requires exactly one
 * file under `src/` to name `window`, `localStorage` or `sessionStorage`, and
 * that file is the store's. Neither `document` nor `matchMedia` is one of those
 * three, so reading them here rather than in five places moves nothing across
 * that line.
 *
 * **What deliberately does not live here.** Why a module degrades, and what it
 * does about it, stays in that module's own header, because that is where the
 * modules genuinely differ: `src/ui/motion.ts` subscribes to its query and
 * `src/ui/forced-colors.ts` deliberately does not, which is the whole
 * difference between them. `src/ui/capability.ts`'s probe is not one of these
 * either: it asks whether the interface exists in the form the code depends on,
 * which is a different question that happens to open with the same `typeof`.
 */

/**
 * The visibility half of the platform, read for `visibilityState`.
 *
 * `EventTarget` plus the one field the handlers read, so a test can build a
 * fake that answers honestly without a page.
 */
export type VisibilityTarget = EventTarget & { readonly visibilityState: string };

/** Where the page-level events are read. `null` where there is no page. */
export type PageTarget = EventTarget;

/**
 * The page's `document`, or `null` where there is none to read.
 *
 * A host with no document is a host whose tabs cannot hide and whose page
 * cannot be unloaded, so every caller's answer is the same: listen to nothing
 * and carry on.
 */
export function pageDocument(): Document | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return document;
}

/**
 * One media query, or `null` on a host that answers no media at all.
 *
 * A host with no `matchMedia` has not expressed a preference; it has not been
 * asked. Every caller reads that `null` as "no preference" rather than as the
 * preference, which is what keeps the headless runner from silently removing
 * the animation the browser gate exists to measure.
 */
export function mediaQuery(query: string): MediaQueryList | null {
  if (typeof matchMedia !== 'function') {
    return null;
  }
  return matchMedia(query);
}
