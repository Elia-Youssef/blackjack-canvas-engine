/**
 * Where the forced-colors flag comes from. `BJ-18`, item `G9`.
 *
 *   "Under forced-colors active the chrome adopts the system palette, no chrome
 *    element depends on a colour the canvas supplies, and the play surface
 *    switches to its high-contrast token set through the media query."
 *
 * `src/ui/motion.ts` is the pattern and the precedent: one file asks the
 * platform, everything else is handed a boolean. The split matters here for the
 * same reason it does there, and for one more. QUALITY-BAR section 5 states it:
 * "Canvas pixels are unaffected by forced colors, so a high-contrast
 * play-surface palette is selected via the media query and applied to the
 * renderer's tokens." The chrome's half is done by CSS, which can read the query
 * itself; the canvas has no stylesheet to read, so the query has to be resolved
 * in TypeScript and handed to the token layer. This is that resolution.
 *
 * **There is no listener, and that is deliberate rather than an omission.**
 * `MediaQueryList.matches` is live: reading it on the frame that needs it gives
 * the current answer without a subscription. `motion.ts` subscribes because it
 * has to answer between frames as well, through `MotionPreference.reduced()`
 * being consulted by the probe; nothing needs that here. The absence also keeps
 * a gate intact: `tests/unit/input-surface.test.ts` pins the whole product to
 * three event listeners, one per input path, and a fourth would have to be
 * argued for rather than added.
 *
 * `matchMedia` is read off the global scope by name, exactly as `motion.ts` and
 * the composition root read theirs, because `tests/unit/storage-write-failure
 * .test.ts` requires that exactly one file under `src/` names the platform
 * storage globals through `window`.
 */

/** The media query QUALITY-BAR section 5 and item `G9` are both written on. */
export const FORCED_COLORS_QUERY = '(forced-colors: active)';

/** The live flag, as the composition root holds it. */
export interface ForcedColorsPreference {
  /** What the platform says right now. `false` where there is nothing to ask. */
  active(): boolean;
}

/** What a preference may be built with. The query is injectable for tests. */
export interface ForcedColorsOptions {
  /**
   * The query list to read, for a test that needs a known answer.
   *
   * Injected in the same spirit as `MotionPreferenceOptions.query`: disclosed,
   * off every path a player can take, and unable to change what an
   * unparameterised construction does. The browser gate does not use it; it
   * emulates the real query, which is the thing item `G9` grades.
   */
  readonly query?: MediaQueryList | null;
}

/**
 * Read the platform's answer, or `null` where there is nothing to ask.
 *
 * A host with no `matchMedia` is not a host in forced colors: it is a host that
 * has not been asked. All three engines the browser gate runs carry it; the
 * guard is for the headless runner, which has no media at all.
 */
function platformQuery(): MediaQueryList | null {
  if (typeof matchMedia !== 'function') {
    return null;
  }
  return matchMedia(FORCED_COLORS_QUERY);
}

export function createForcedColorsPreference(
  options: ForcedColorsOptions = {},
): ForcedColorsPreference {
  const query = options.query === undefined ? platformQuery() : options.query;
  return {
    // Read per call rather than captured at construction: a player who turns
    // high contrast on at the operating system level while the game is open gets
    // it on the next frame, without a reload and without a subscription.
    active: () => query?.matches ?? false,
  };
}
