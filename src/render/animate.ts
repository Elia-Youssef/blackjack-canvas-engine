/**
 * The tween set, the pacing block and the one reduced-motion switch. `BJ-14`.
 *
 * Items `E6` (Major, Demonstration), `E7` (Critical) and `E9` (Minor).
 *
 * **Armour, not closure, for `E6`.** That item is method D and closes at the
 * ACCEPTANCE section 4 demonstration session, on the capture `demo/motion`. What
 * is built here is the behaviour it will capture and the automated armour under
 * it; nothing in this file or its tests closes `E6` by itself. `E7` and `E9` are
 * method T and are graded by `tests/browser/reduced-motion.spec.ts` and
 * `tests/browser/speed-setting.spec.ts` over the built `dist/`.
 *
 * Four properties are structural here rather than a matter of discipline.
 *
 * **1. There is exactly one reduced-motion switch, and it is in `progress`.**
 * Every tween below is a pure function of a progress in 0 to 1, and reduced
 * motion is `progress` answering `DONE` whatever the age. So "removes every
 * animation entirely" is one expression rather than a per-tween habit: a tween
 * added later is reduced the moment it asks this module how far along it is, and
 * a tween that read a clock instead would be visible as the one that did not.
 * QUALITY-BAR section 4 says entirely, not partially, and a switch per tween is
 * how partially happens.
 *
 * **2. Reduced motion does not touch pacing.** `seconds` is independent of the
 * flag. SPEC 5 and QUALITY-BAR section 4 both say the sequence of states and the
 * outcome must not change and that presentation pacing may differ; the sequence
 * is `core/table.ts`'s and this file cannot reach it, and the pacing it does own
 * is left alone so that a reduced-motion player sees the same round at the same
 * rhythm with the movement removed. Nothing under `src/core/` names the flag at
 * all, which `tests/unit/motion.test.ts` scans for.
 *
 * **3. The pacing constants are consumed, never forked.** `PACING` below reads
 * SPEC 5's seven straight out of `core/table.ts`'s `TIMINGS`, plus the peek's
 * `PEEK_PAUSE`, and adds only the presentation tweens that section does not name.
 * A second copy of 0.22 in this directory is the drift SPEC 5's "all tunable
 * constants in one place" exists to prevent, and it is the specific defect the
 * machine's own header warns about: an alias bound at module load does not
 * follow a record that was copied and scaled.
 *
 * **4. Fast multiplies at the consumption site.** `seconds` multiplies by
 * `speedMultiplier` on the way out, exactly as `timedStep` does inside the
 * machine, so the same 0.6 reaches the phase durations and the tween durations
 * from the same function. Item `E9`.
 *
 * No clock, no DOM, no canvas and no randomness: every function here is a pure
 * function of values its caller measured. `tests/unit/render-surface.test.ts`
 * scans this directory for all three.
 */

import {
  FAST_SPEED_MULTIPLIER,
  PEEK_PAUSE,
  TIMINGS,
  speedMultiplier,
  type Speed,
} from '../core/table';

import { DURATION, EASE, type Hex, type SurfaceTokens } from './tokens';

/** Milliseconds per second. The duration tokens are in one and pacing is in the other. */
const MS_PER_SECOND = 1000;

/** A finished tween. Every tween below is at its final value here. */
const DONE = 1;

/** A tween that has not started. */
const START = 0;

// ---------------------------------------------------------------------------
// QUALITY-BAR section 4's flash ceiling, and the pulse derived from it
// ---------------------------------------------------------------------------

/**
 * The rolling-window ceiling QUALITY-BAR section 4 sets, from SC 2.3.1 Level A:
 * "nothing flashes more than three times in any one second period".
 */
export const FLASH_LIMIT_HZ = 3;

/**
 * How much of that ceiling the win pulse is allowed to use: half of it.
 *
 * A ratio rather than a rate, so that the period below is derived from the
 * standard's own number instead of being a figure somebody liked. Two means the
 * pulse peaks at most half as often as the limit permits, in the fastest mode
 * the game has.
 */
export const WIN_PULSE_HEADROOM = 2;

/**
 * The pulse's period at Normal speed, in seconds, derived from the ceiling.
 *
 * `WIN_PULSE_HEADROOM / (FLASH_LIMIT_HZ * FAST_SPEED_MULTIPLIER)`. The division
 * by the Fast multiplier is the point: a period is a pacing constant, so Fast
 * shortens it and the pulse peaks *more* often, which is the direction that can
 * breach the ceiling. Solving for the worst case rather than for the default
 * means the bound holds in both modes by construction, at exactly half the
 * ceiling at Fast and well under a peak per second at Normal.
 *
 * `tests/unit/motion.test.ts` does not take that on trust: it counts peaks in a
 * rolling one-second window of the real envelope, at both speeds.
 */
export const WIN_PULSE_PERIOD = WIN_PULSE_HEADROOM / (FLASH_LIMIT_HZ * FAST_SPEED_MULTIPLIER);

/**
 * How many times a winning hand pulses before it rests.
 *
 * Bounded rather than continuous. SPEC 5 asks winning hands to pulse, and a
 * pulse that never stopped would sit under the flash ceiling and still be a
 * moving object on a screen a player is reading their result off.
 */
export const WIN_PULSE_CYCLES = 2;

/**
 * The ink the win pulse modulates. SPEC 16's rail gold, through the token record.
 *
 * QUALITY-BAR section 4: "saturated red is not used in any flashing or pulsing
 * effect". WCAG's red flash threshold defines saturated red as a red fraction of
 * `R / (R + G + B)` at or above 0.8; the base rail measures 0.41 and the
 * high-contrast rail 0.47, and the unit suite computes both fractions from the
 * hexes rather than trusting this sentence.
 *
 * A function of the frame's selected set rather than a constant, because
 * `BJ-22` gave the play surface a second set and a pulse drawn in the other
 * set's gold would be the one ink on the felt that ignored the selection.
 */
export function winPulseInk(tokens: SurfaceTokens): Hex {
  return tokens.rail;
}

// ---------------------------------------------------------------------------
// SPEC 5: all tunable constants in one place, consumed from that place
// ---------------------------------------------------------------------------

/**
 * Every pacing constant the presentation layer counts, in seconds, at Normal.
 *
 * The first eight are the machine's own, read out of `core/table.ts` rather than
 * restated: SPEC 5's seven reference timings and the peek pause the machine
 * derives from the hole-card flip. The last three are the tweens SPEC 5 names
 * without giving a number, and each says where its number comes from.
 *
 * **`peekPause` is here and is not decoration.** It is the same expression the
 * machine scales, so a reader comparing the two sides of the boundary can see
 * that the peek is paced by one constant on both. Item `E6`'s no-tell clause is
 * that there is no second number and no branch anywhere in the peek's path.
 */
export const PACING = Object.freeze({
  /** SPEC 5: 0.22 s between the cards of the opening deal. */
  dealInterval: TIMINGS.dealInterval,
  /** SPEC 5: 0.28 s of arc travel per card. */
  cardTravel: TIMINGS.cardTravel,
  /** SPEC 5: 0.30 s for the hole card's horizontal-scale flip. */
  holeCardFlip: TIMINGS.holeCardFlip,
  /** SPEC 5: 0.18 s to re-centre a hand as it grows. */
  handRecentre: TIMINGS.handRecentre,
  /** SPEC 5: 0.45 s of reveal pause. */
  revealPause: TIMINGS.revealPause,
  /** SPEC 5: 0.65 s between the dealer's draws. */
  dealerDrawInterval: TIMINGS.dealerDrawInterval,
  /** SPEC 5: 0.55 s of settle pause. */
  settlePause: TIMINGS.settlePause,
  /** The peek, on both branches, as the machine derives it. SPEC 4.4. */
  peekPause: PEEK_PAUSE,

  /**
   * How long a chip takes to slide to the wager spot.
   *
   * SPEC 5 names the movement and gives no number for it, so it takes the card's
   * travel rather than a new constant: a chip and a card cross the same felt to
   * the same rhythm, and a second number here would be one more thing to keep in
   * step with the deal.
   */
  chipSlide: TIMINGS.cardTravel,

  /**
   * How long the balance takes to count up. QUALITY-BAR section 15's `--dur-4`.
   *
   * A chrome transition rather than a table pacing constant, so its home is the
   * duration scale that owns every other chrome duration, converted from the
   * milliseconds that scale is stated in. `tests/unit/tokens.test.ts` already
   * fails if `DURATION` and the design contract disagree.
   */
  balanceCountUp: DURATION.d4 / MS_PER_SECOND,

  /**
   * How long a winning hand pulses in total: the derived period, twice.
   *
   * Both factors are above, and both are derived rather than chosen: the period
   * from QUALITY-BAR section 4's ceiling, the count from the decision that a
   * pulse should end.
   */
  winPulse: WIN_PULSE_PERIOD * WIN_PULSE_CYCLES,
});

/** The name of one pacing constant. */
export type PacingName = keyof typeof PACING;

/**
 * Every pacing constant's name, so a sweep cannot quietly miss one.
 *
 * `E9` grades that Fast multiplies **every** pacing constant by 0.6, and a test
 * that listed the constants by hand would grade only the ones somebody
 * remembered. The specs iterate this.
 */
export const PACING_NAMES: readonly PacingName[] = Object.freeze(
  Object.keys(PACING) as PacingName[],
);

// ---------------------------------------------------------------------------
// The easing, evaluated from the committed control points
// ---------------------------------------------------------------------------

/** Newton would need a derivative; bisection needs only monotonicity. */
const BISECTION_STEPS = 32;

/** One coordinate of a cubic Bezier with endpoints at 0 and 1. */
function bezierAxis(a: number, b: number, t: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * a + 3 * inverse * t * t * b + t * t * t;
}

/**
 * The eased value of a progress, on one of the two committed curves.
 *
 * The control points are `EASE` in the token record, which is where CSS takes
 * them from as well; QUALITY-BAR section 15 commits the points rather than an
 * approximation precisely so that a canvas tween and a CSS transition run on the
 * same curve. The parameter of a cubic Bezier is not its x coordinate, so the
 * parameter is recovered by bisection over a fixed number of steps: fixed rather
 * than tolerance-driven, because a loop whose length depends on the input is a
 * loop whose cost depends on the input, and this runs per tween per frame.
 */
export function ease(curve: readonly [number, number, number, number], progress: number): number {
  const [x1, y1, x2, y2] = curve;
  if (progress <= START) {
    return START;
  }
  if (progress >= DONE) {
    return DONE;
  }
  let low = START;
  let high = DONE;
  let t = progress;
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    t = (low + high) / 2;
    if (bezierAxis(x1, x2, t) < progress) {
      low = t;
    } else {
      high = t;
    }
  }
  return bezierAxis(y1, y2, t);
}

/** The decelerating curve. Everything that travels or settles uses it. */
export function easeOut(progress: number): number {
  return ease(EASE.out, progress);
}

/** The symmetric curve. The flip uses it, so both halves match. */
export function easeInOut(progress: number): number {
  return ease(EASE.inOut, progress);
}

// ---------------------------------------------------------------------------
// The resolved policy: one reduced-motion switch, one Speed multiplier
// ---------------------------------------------------------------------------

/** What the platform and the settings panel between them decide. */
export interface MotionSettings {
  /**
   * Whether animation is removed. Resolved outside this directory.
   *
   * `src/ui/motion.ts` resolves it from `prefers-reduced-motion` today and from
   * SPEC 14's reduced-motion setting as well once `BJ-20` builds that control.
   * Nothing here queries the platform: `src/render/` draws handed state.
   */
  readonly reducedMotion: boolean;
  /** SPEC 5's Speed. The same value the machine's `setSpeed` was given. */
  readonly speed: Speed;
}

/** The resolved policy for one frame. */
export interface Motion extends MotionSettings {
  /**
   * How long a pacing constant lasts at this Speed, in seconds.
   *
   * **Independent of `reducedMotion`, deliberately.** Removing the animation
   * must not change the pacing, and a `seconds` that answered zero under the
   * flag would collapse the count-up and the pulse into the frame they started
   * on by shortening the game rather than by removing the movement, which is a
   * different thing and would show up as a changed rhythm.
   */
  seconds(name: PacingName): number;
  /**
   * How far along a tween of `name` is, given its age in seconds.
   *
   * **The one reduced-motion switch in the project's presentation layer.** Under
   * the flag this is `DONE` from the first frame, so every tween below is at its
   * final value and nothing moves. Outside it, the age is divided by the Speed
   * scaled duration and clamped.
   */
  progress(name: PacingName, age: number): number;
}

/** Clamp a progress into 0 to 1. */
function clampProgress(value: number): number {
  if (!Number.isFinite(value) || value <= START) {
    return START;
  }
  return value >= DONE ? DONE : value;
}

/** Resolve the policy for a frame. Cheap enough to call per frame. */
export function resolveMotion(settings: MotionSettings): Motion {
  const { reducedMotion, speed } = settings;
  const scale = speedMultiplier(speed);

  function seconds(name: PacingName): number {
    return PACING[name] * scale;
  }

  return {
    reducedMotion,
    speed,
    seconds,
    progress(name: PacingName, age: number): number {
      if (reducedMotion) {
        return DONE;
      }
      const span = seconds(name);
      return span <= 0 ? DONE : clampProgress(age / span);
    },
  };
}

// ---------------------------------------------------------------------------
// The tween set. Every one of them is a pure function of a progress.
// ---------------------------------------------------------------------------

/** A point on the play surface, in logical units. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * One eased number, from `from` to `to`. The scalar every tween below is built
 * on, and the one a caller reaches for when what moves is a length rather than
 * a point: the width a hand occupies as it grows, which is SPEC 5's re-centre.
 *
 * Exactly `to` at a progress of 1, because `easeOut(1)` is exactly 1.
 */
export function toward(from: number, to: number, progress: number): number {
  return lerp(from, to, easeOut(progress));
}

/**
 * SPEC 5: "Cards travel from the shoe on an arc with eased motion, not a linear
 * slide, and land with a settle."
 *
 * Three clauses, three parts of one expression. The **arc** is the sine lift,
 * which is zero at both ends and `lift` at the halfway point, so the path bows
 * away from the straight line and returns to it exactly at the destination. The
 * **eased motion** is `easeOut` on the horizontal interpolation, which is also
 * the **settle**: the card decelerates into its place instead of stopping dead,
 * and no overshoot is used, because a card that passed its slot and came back
 * would be a second movement to remove under reduced motion.
 *
 * At a progress of 1 the result is exactly `to`, on both axes: `easeOut(1)` is
 * 1 and `sin(pi)` is 0. That is what makes reduced motion free here rather than
 * special-cased, since `progress` answers 1 from the first frame.
 */
export function arcTravel(from: Point, to: Point, lift: number, progress: number): Point {
  const t = easeOut(progress);
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t) - lift * Math.sin(Math.PI * clampProgress(progress)),
  };
}

/**
 * SPEC 5: "The hole card flips on a horizontal scale through zero width, so it
 * reads as a real flip."
 *
 * The horizontal scale to draw the card at: `|cos(pi * progress)|`, which is 1
 * at both ends and exactly 0 at the halfway point.
 *
 * **The cosine is the projection, not an easing choice.** A card turning about
 * its vertical axis at a constant rate presents a width of its true width times
 * the cosine of the angle, and half a turn is `pi`. So the shape is derived from
 * what a flip is rather than picked off the easing scale, and it carries the
 * easing for free: the apparent width changes slowly near the flat positions and
 * quickly through the edge, which is what makes it read as a card rather than as
 * a rectangle being squeezed.
 *
 * Zero at exactly the halfway point is the clause SPEC 5 states, not an
 * artefact: a flip that never reached zero width would be a card that got thin
 * and thick again without ever turning over.
 */
export function flipScale(progress: number): number {
  return Math.abs(Math.cos(Math.PI * clampProgress(progress)));
}

/**
 * Which side of the card the flip is showing. The face from the halfway point on.
 *
 * The same halfway point `flipScale` is zero at, so the swap happens on the
 * frame the card has no width and there is no frame where a shrinking face or a
 * growing back is visible. `tests/unit/motion.test.ts` pins the two together
 * rather than asserting each against a number of its own.
 */
export function flipShowsFace(progress: number): boolean {
  return clampProgress(progress) >= DONE / 2;
}

/**
 * SPEC 5: "Chips slide to the wager spot and stack."
 *
 * A straight eased slide rather than an arc. A chip is pushed across a table and
 * a card is dealt through the air, and the two movements are different on
 * purpose: the same easing, no lift.
 */
export function slide(from: Point, to: Point, progress: number): Point {
  const t = easeOut(progress);
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
}

/**
 * SPEC 5: "the balance counts up rather than snapping".
 *
 * Rounded on the way out, because a balance is a whole number of chips and SPEC
 * 4.11 has no rounding rule precisely because no quantity in this game is ever
 * fractional. A count-up that showed 1,437.6 for a frame would be inventing one.
 * At a progress of 1 the result is exactly `to`, so the readout ends on the
 * number the machine holds and not near it.
 *
 * It counts down as readily as up: a lost round is the same tween with the
 * endpoints the other way round, and SPEC 5's phrase names the common case
 * rather than a direction.
 */
export function countUp(from: number, to: number, progress: number): number {
  return Math.round(toward(from, to, progress));
}

/**
 * SPEC 5: "Winning hands pulse."
 *
 * The envelope, 0 to 1, that a winning hand's highlight is drawn at. Two things
 * are multiplied: a raised cosine at `WIN_PULSE_CYCLES` cycles over the tween,
 * and a linear fade to nothing across the same tween, so the pulse ends at rest
 * rather than being cut off at whatever brightness it had reached.
 *
 * It is written over `motion.progress` rather than over the age directly, so it
 * inherits the one reduced-motion switch: under the flag the progress is 1, the
 * fade term is 0, and the highlight never appears. QUALITY-BAR section 4's
 * ceiling is held by `WIN_PULSE_PERIOD`, derived above from the ceiling itself.
 */
export function winPulse(age: number, motion: Motion): number {
  const progress = motion.progress('winPulse', age);
  const fade = DONE - progress;
  return (fade * (DONE - Math.cos(2 * Math.PI * WIN_PULSE_CYCLES * progress))) / 2;
}

/**
 * The red fraction WCAG's red flash threshold is measured on: `R / (R + G + B)`.
 *
 * Exported because the rule it serves is an absence, and an absence is only
 * checked if something computes it. QUALITY-BAR section 4 forbids saturated red
 * in any flashing or pulsing effect, and the standard's own definition of
 * saturated red is this fraction at or above 0.8.
 */
export function redFraction(hex: Hex): number {
  const digits = hex.slice(1);
  const red = Number.parseInt(digits.slice(0, 2), 16);
  const green = Number.parseInt(digits.slice(2, 4), 16);
  const blue = Number.parseInt(digits.slice(4, 6), 16);
  const total = red + green + blue;
  return total === 0 ? 0 : red / total;
}

/** The threshold `redFraction` is compared against. WCAG's red flash threshold. */
export const SATURATED_RED_FRACTION = 0.8;
