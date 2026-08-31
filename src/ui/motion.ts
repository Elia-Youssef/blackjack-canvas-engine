/**
 * Where the reduced-motion flag comes from. `BJ-14`, item `E7` (Critical).
 *
 *   "prefers-reduced-motion removes every animation entirely, including panel
 *    and overlay transitions, while leaving the sequence of states and the
 *    outcome identical. Presentation pacing may differ."
 *
 * `src/render/animate.ts` owns what the flag *does* and consumes it as a plain
 * boolean; this file is the only place in the project that asks the platform for
 * it. The split is the same one `src/ui/loop.ts` makes for the clock:
 * `tests/unit/render-surface.test.ts` scans `src/render/` for anything that
 * reads the platform, because a renderer that queried its environment could
 * disagree with the simulation about what the environment said.
 *
 * **The stylesheet answers the same question independently, and that is correct
 * rather than duplicated.** `src/ui/tokens.css` redefines every `--dur-*` to
 * `--dur-0` inside the media query, so CSS transitions are removed by CSS. There
 * is no route by which this file's answer and the stylesheet's could differ on
 * the media query, because both read the same query; what this file adds is the
 * canvas half, which has no stylesheet to read.
 *
 * **SPEC 14's reduced-motion setting arrived at `BJ-20`, item `I5`.** The
 * control lives in the Settings panel; this file owns the setting's words
 * (`MotionSetting` and its list, above) and the resolution rule both arms run
 * through. `setAlwaysReduce` is what the control calls, the matching
 * `:root[data-motion='reduce']` selector in the stylesheet is the CSS half,
 * and nothing here reads a persisted document: the composition root loads one
 * and hands the resolved boolean in, which is what keeps this module testable
 * without a store.
 *
 * `matchMedia` is read off the global scope by name rather than through
 * `window`, which is a gate rather than a style:
 * `tests/unit/storage-write-failure.test.ts` requires that exactly one file
 * under `src/` names the platform storage globals, and the seam it means is
 * `src/storage/store.ts`. The composition root takes `devicePixelRatio` the same
 * way and says so. The reading itself lives in `src/ui/platform.ts`, which is
 * the one guard five modules were carrying a copy of; the query constant below
 * and the subscription further down are what makes this module the owner of
 * reduced motion, and both stay here.
 */

import { mediaQuery } from './platform';

/** The media query QUALITY-BAR section 4 and item `E7` are both written on. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// ---------------------------------------------------------------------------
// SPEC 14's setting. `BJ-20`, item `I5`.
// ---------------------------------------------------------------------------

/** SPEC 14's reduced-motion setting: follow the platform query, or always. */
export type MotionSetting = 'system' | 'always';

/** Both, in SPEC 14's order. */
export const MOTION_SETTINGS = ['system', 'always'] as const satisfies readonly MotionSetting[];

/** SPEC 14 prints "system / always", and QUALITY-BAR section 4 honours the query. */
export const DEFAULT_REDUCED_MOTION: MotionSetting = 'system';

/**
 * The setting's "always" arm, as the boolean `createMotionPreference` takes.
 *
 * The only translation in the project between the persisted word and the
 * resolution rule's input, so a settings control, a save and a restore cannot
 * disagree about which arm is which. `system` is the absence of the override
 * rather than a value of it, for the reason `themeAttribute` gives.
 */
export function alwaysReduceOf(setting: MotionSetting): boolean {
  return setting === 'always';
}

/**
 * The resolution rule, as a pure function of the two inputs. SPEC 14.
 *
 * "System" honours the query and "always" does not consult it, so the setting
 * can only ever add reduction and never remove it. A player who has asked their
 * platform for reduced motion and then chooses "system" in this game still gets
 * reduced motion, which is the only reading of SPEC 14's two words that does not
 * quietly override an accessibility preference set outside the game.
 */
export function resolveReducedMotion(alwaysReduce: boolean, systemPrefers: boolean): boolean {
  return alwaysReduce || systemPrefers;
}

/** The live flag, and the one place a later part flips SPEC 14's setting. */
export interface MotionPreference {
  /** The resolved boolean `resolveMotion` is handed each frame. */
  reduced(): boolean;
  /** What the platform says right now, before the setting is applied. */
  systemPrefers(): boolean;
  /** SPEC 14's "always" arm. `BJ-20` calls this from its settings control. */
  setAlwaysReduce(always: boolean): void;
  /** Drop the platform listener. Called from the composition root's dispose. */
  dispose(): void;
}

/** What a preference may be built with. Every field has a default. */
export interface MotionPreferenceOptions {
  /** SPEC 14's setting, resolved to a boolean by the caller. Off by default. */
  readonly alwaysReduce?: boolean;
  /**
   * The query list to read, for a test that needs a known answer.
   *
   * Injected in the same spirit as `FrameLoopOptions.schedule` and
   * `TableOptions.shoe`: disclosed, off every path a player can take, and unable
   * to change what an unparameterised construction does. The browser gate does
   * not use it; it emulates the real query, which is the thing `E7` grades.
   */
  readonly query?: MediaQueryList | null;
}

/**
 * Build the preference and start listening.
 *
 * The listener matters even though the query rarely changes mid-session: a
 * player who turns reduced motion on at the operating system level while the
 * game is open gets it on the next frame, without a reload, because the frame
 * asks this object rather than a value captured at boot.
 */
export function createMotionPreference(options: MotionPreferenceOptions = {}): MotionPreference {
  // Read the platform's answer, or `false` where there is nothing to ask. A
  // host with no `matchMedia` is not a host that prefers reduced motion: it is
  // a host that has not been asked, and defaulting to reduced there would
  // remove the animation from every environment the game is unit tested in and
  // hide the difference `E7` exists to measure. All three engines the browser
  // gate runs carry it; `src/ui/platform.ts`'s guard is for the headless runner.
  const query = options.query === undefined ? mediaQuery(REDUCED_MOTION_QUERY) : options.query;
  let alwaysReduce = options.alwaysReduce ?? false;
  let system = query?.matches ?? false;

  const onChange = (event: MediaQueryListEvent): void => {
    system = event.matches;
  };
  query?.addEventListener('change', onChange);

  return {
    reduced: () => resolveReducedMotion(alwaysReduce, system),
    systemPrefers: () => system,
    setAlwaysReduce(always: boolean): void {
      alwaysReduce = always;
    },
    dispose(): void {
      query?.removeEventListener('change', onChange);
    },
  };
}
