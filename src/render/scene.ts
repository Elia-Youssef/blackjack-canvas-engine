/**
 * The play surface, composed and animated. What the composition root hands to
 * the canvas.
 *
 * `BJ-13` built the four drawing modules and proved each one on its own: the
 * felt bakes once and blits, a card knows its corners and its pips, a chip stack
 * knows its offsets. Nothing put them together into a table, because there was
 * no game to read a table off. `BJ-15` made that assembly, for item `M1`: the
 * canvas draws the felt, the cards and the chips, **and nothing else**. No
 * button, no readout, no panel, no label and no menu is drawn here, and there is
 * no hit test in this file or anywhere else under `src/render/`.
 *
 * **`BJ-14` added the motion, and this file holds the state it needs.** Items
 * `E6` (Major, Demonstration), `E7` (Critical) and `E9` (Minor). `animate.ts` is
 * pure: every tween there is a function of a progress in 0 to 1. Something has
 * to remember how long ago each card was dealt, and that memory is here, next to
 * the arrangement it animates, because it is derived entirely from what changed
 * between two `SceneState` values and nothing outside this file needs it.
 *
 * **Armour, not closure.** `E3`, `E4`, `E5` and `E6` are Demonstration items and
 * close at the ACCEPTANCE section 4 session. What is built here is the behaviour
 * those captures will show and the automated armour under it.
 *
 * Three properties are load bearing and are tested rather than assumed:
 *
 * - **The felt is baked once and rebaked only on drift.** `FeltLayer` publishes
 *   the `FeltSpec` it was baked from, and `needsRebake` compares it against the
 *   spec a frame wants. A per-frame bake would regenerate the grain, the
 *   vignette and four lines of print sixty times a second, which QUALITY-BAR
 *   section 1 forbids in as many words.
 * - **Every length here is a fraction of the surface**, so the arrangement is
 *   the same picture at any size and the play-surface size setting at `BJ-16`
 *   changes one number rather than a layout. The device pixel ratio is not in
 *   any of it: `surface.ts` applies it to the backing store and nothing in this
 *   directory may apply it a second time.
 * - **Reduced motion is not decided here.** Every tween asks
 *   `motion.progress(...)`, which answers 1 from the first frame under the flag,
 *   so the arrangement below draws the settled picture with no branch of its
 *   own. There is no `if (reducedMotion)` in this file, and there must not be
 *   one: `animate.ts` has the only switch, and a second one is how "removes
 *   every animation entirely" becomes "removes most of it".
 *
 * **Time arrives as a delta, never from a clock.** `render` takes the same `dt`
 * the machine's `update` was given, which is what keeps the picture and the
 * simulation on one timeline through a stutter.
 * `tests/unit/render-surface.test.ts` scans this directory for every clock and
 * every random source.
 */

import type { Card, Rank, Suit } from '../core/cards';

import {
  arcTravel,
  flipScale,
  flipShowsFace,
  slide,
  toward,
  winPulse,
  winPulseInk,
  type Motion,
  type PacingName,
  type Point,
} from './animate';
import {
  drawCardShapes,
  drawCardText,
  cardHeight,
  CARD_GEOMETRY,
  type CardSpec,
} from './card';
import {
  CHIP_GEOMETRY,
  drawChipStackShapes,
  drawChipStackText,
  wagerToChips,
  type ChipStackSpec,
} from './chips';
import {
  bakeFelt,
  bakeGrainTiles,
  sameGrain,
  type FeltLayer,
  type FeltLimits,
  type FeltSpec,
  type GrainSpec,
  type GrainTiles,
} from './felt';
import {
  createSurface,
  renderFrame,
  roundedRectPath,
  type ScenePasses,
  type Surface,
  type SurfaceCanvas,
  type SurfaceSizing,
} from './surface';
import { feltColour } from './tokens';
import type { ChipDenomination, FeltName, Hex, SelectedPalette, SurfaceTokens } from './tokens';

/**
 * Every proportion of the arrangement. Fractions named `...X` are of the
 * surface width, `...Y` of its height, and the rest are of the card width they
 * apply to. Shape data rather than tokens, exactly as `CARD_GEOMETRY` and
 * `FELT_GEOMETRY` are and for the same reason: these are the dimensions of the
 * thing being drawn, not values a designer picks off a scale.
 */
export const SCENE_GEOMETRY = Object.freeze({
  /** Card width, as a fraction of the surface width. */
  cardX: 0.078,
  /** Distance between the left edges of two cards in one hand, of card width. */
  cardStep: 0.42,
  /** Top of the dealer's cards, of the surface height. */
  dealerY: 0.08,
  /** Top of the player's cards, of the surface height. */
  handY: 0.5,
  /** Centre of a hand's committed chip stack, of the surface height. */
  handChipY: 0.9,
  /** Centre of the pending wager's stack, of the surface height. */
  pendingChipY: 0.86,
  /** Chip radius, of the surface width. */
  chipX: 0.026,

  // The staging `BJ-14` added. SPEC 5's motion set needs somewhere for a card
  // and a chip to come from, and both are points on the same fractional grid.

  /** The shoe a card is dealt from: the dealer's right, off the felt's edge. */
  shoeX: 1.02,
  shoeY: 0.02,
  /** How far a dealt card's arc bows above the straight line, of surface height. */
  arcLiftY: 0.14,
  /** The chip rack a wager is built from: below the felt, centred. */
  rackX: 0.5,
  rackY: 1.1,
  /** The win pulse ring: its clearance, corner and stroke, of card width. */
  pulsePad: 0.16,
  pulseRadius: 0.16,
  pulseStroke: 0.07,
} as const);

// ---------------------------------------------------------------------------
// The card-legibility fan floor. DESIGN section 4, and item `E8`'s appended
// clause, built at `BJ-22`.
// ---------------------------------------------------------------------------

/**
 * The narrowest a card is ever drawn, in CSS pixels. Item `E8`:
 *
 *   "At every breakpoint, no card renders narrower than 60 CSS px and no fan
 *    pitch narrower than the corner-index column of the card beneath it; under
 *    pressure the fan compresses to its pitch floor before any card shrinks,
 *    cards then shrink to the width floor, and past both floors the hand band
 *    overflows into the pannable stage rather than breaking either. At 60 px
 *    the ten's corner index, the smallest glyph on any card, renders at 8.0 px
 *    bold."
 *
 * **This is a legibility number, not a proportion**, which is why it is the one
 * absolute length in the arrangement. `SCENE_GEOMETRY.cardX` makes a card 7.8
 * percent of the surface, and 7.8 percent of the surface a 390 x 844 phone gives
 * this game is 15.7 CSS pixels: the ten's corner index would render at 2.1 px,
 * which is not a card, it is a coloured rectangle. The floor is what DESIGN
 * section 4 calls the card-legibility fan floor and it was unbuilt until here.
 *
 * The companion number in the criterion's last sentence is arithmetic on
 * `CARD_GEOMETRY`, not a second constant: `indexFont` 0.17 times `indexTenScale`
 * 0.78 times 60 is 7.956, which the criterion states as 8.0 px bold.
 * `tests/unit/fan-floor.test.ts` computes it rather than repeating it.
 */
export const CARD_WIDTH_FLOOR = 60;

/**
 * The narrowest pitch, as a fraction of the card width it separates.
 *
 * The criterion names it rather than numbering it: "no fan pitch narrower than
 * the corner-index column of the card beneath it". `CARD_GEOMETRY.indexX` is the
 * **centre** of that column measured from the near edge, so the column itself is
 * twice it, and a pitch equal to the column is the tightest overlap that still
 * leaves the whole of the covered card's index visible. Derived here rather than
 * written down, so moving the index moves the floor with it.
 */
export const FAN_PITCH_FLOOR = 2 * CARD_GEOMETRY.indexX;

/**
 * How far a band may exceed its room and still be said to fit, in CSS pixels.
 *
 * A millionth of a pixel: the residual of `room / k` multiplied back by `k` in
 * double precision, and nothing a screen could show. See `fanFor`.
 */
const OVERFLOW_TOLERANCE = 1e-6;

/** One band of cards asking for room: how many cards, and how much room. */
export interface FanBand {
  readonly count: number;
  /** The horizontal room this band has, in CSS pixels. */
  readonly room: number;
}

/**
 * Which of the criterion's four states a band resolved to. The order of the
 * first three is the order the criterion states; `overflow` is what happens
 * past both floors.
 */
export type FanRegime = 'natural' | 'pitch-compressed' | 'width-shrunk' | 'overflow';

/** What one band draws at, once the floors have been applied. */
export interface Fan {
  readonly cardWidth: number;
  /** Distance between the left edges of two neighbouring cards, in CSS px. */
  readonly pitch: number;
  /** `pitch / cardWidth`. Never below `FAN_PITCH_FLOOR`. */
  readonly pitchRatio: number;
  /** The width the whole band occupies. */
  readonly laid: number;
  /** How far the band exceeds its room. Zero unless the regime is `overflow`. */
  readonly overflow: number;
  readonly regime: FanRegime;
}

/**
 * The card width a frame would draw at with no pressure on it at all.
 *
 * The proportion, floored. Above the floor this is exactly what every frame
 * before `BJ-22` drew; at and below it, the floor is what the criterion's first
 * clause asks for and what the rest of the resolution shrinks **towards** rather
 * than through.
 */
export function naturalCardWidth(surfaceWidth: number): number {
  return Math.max(CARD_WIDTH_FLOOR, surfaceWidth * SCENE_GEOMETRY.cardX);
}

/**
 * What one frame resolved for the fan. Item `E8`, and the play surface's own
 * publication of it.
 *
 * Nothing in the game reads it. It is `MotionProbe`'s pattern for the same kind
 * of claim: the criterion is about a card's rendered width and a fan's rendered
 * pitch, and neither is a DOM box, so the page has no other way to publish
 * them. The browser spec measures the composited canvas first and cross-checks
 * this second, exactly as every other probe in this project is used.
 */
export interface FanReading {
  readonly cardWidth: number;
  readonly naturalCardWidth: number;
  /** The first player hand's pitch, in CSS pixels. */
  readonly pitch: number;
  readonly pitchRatio: number;
  /** The regime of each band, the dealer's first and then the hands in order. */
  readonly regimes: readonly FanRegime[];
  /** Where the dealer's row starts, in CSS pixels down the surface. */
  readonly dealerTop: number;
  /**
   * Where the player's row starts, after the clearance clamp.
   *
   * Published because the clamp is the vertical half of item `E8`'s floor and
   * nothing else can be asked for it: a floored card is 1.4 times 60 px tall
   * whatever the surface is, and on a short one the dealer's row would grow down
   * into the player's. The browser spec recomputes the same rule from the
   * geometry and the measured surface and requires the two to agree, and
   * separately requires the property the rule exists for, which is that this is
   * never above `dealerTop` plus a card's height.
   */
  readonly handTop: number;
  /** The widest overflow among the bands, in CSS pixels. Zero when all fit. */
  readonly overflow: number;
}

/**
 * The width every card in a frame is drawn at, given every band on the felt.
 *
 * **One width for the whole frame, and that is a decision rather than a
 * shortcut.** A split deals four hands onto one table and a table does not deal
 * one player a bigger card than the player beside them; a per-band width would
 * also make a hand's cards change size as it drew, which is the one thing the
 * hand re-centre exists to avoid. So the tightest band decides, and every band
 * then compresses its own pitch inside the width it was given.
 *
 * The tightest band is the one whose cards, laid at the pitch floor, need the
 * most width per card. Nothing here goes below `CARD_WIDTH_FLOOR` or above the
 * natural width: shrinking is the second lever, and it stops at the floor.
 */
export function fanCardWidth(bands: readonly FanBand[], natural: number): number {
  let width = natural;
  for (const band of bands) {
    if (band.count <= 0) {
      continue;
    }
    width = Math.min(width, band.room / (1 + (band.count - 1) * FAN_PITCH_FLOOR));
  }
  return Math.max(CARD_WIDTH_FLOOR, Math.min(natural, width));
}

/**
 * One band's fan, at the width the frame resolved.
 *
 * The criterion's order, taken literally and in this sequence:
 *
 *   1. the natural pitch, while the band fits;
 *   2. the pitch compresses, down to the corner-index column and no further,
 *      while the card width holds;
 *   3. the card width shrinks, with the pitch pinned at its floor, down to 60
 *      CSS px and no further (`fanCardWidth` above is where that happens, once
 *      per frame);
 *   4. past both floors the band overflows, and `overflow` says by how much.
 *
 * `natural` is the unpressured width, and it is passed in rather than recomputed
 * so that a band can tell "the frame shrank every card" from "this band's own
 * pitch is tight", which is what makes the regime a reading rather than a guess.
 */
export function fanFor(count: number, room: number, cardWidth: number, natural: number): Fan {
  const span = Math.max(0, count - 1);
  let pitchRatio: number = SCENE_GEOMETRY.cardStep;
  if (span > 0 && cardWidth + span * cardWidth * pitchRatio > room) {
    pitchRatio = Math.max(FAN_PITCH_FLOOR, (room - cardWidth) / (span * cardWidth));
  }
  const laid = laidWidth(Math.max(0, count), cardWidth, cardWidth * pitchRatio);
  // A band that shrank to fit lands on its room to within the last bit of a
  // double, and `room / (1 + span * floor)` multiplied back out is exactly that
  // case. Without the tolerance a band that fits reports a millionth of a pixel
  // of overflow, and the regime it reports is the one past both floors: the
  // ordered sweep in `tests/unit/fan-floor.test.ts` caught it at ten cards,
  // reporting `overflow` for a band that fitted and `width-shrunk` for the
  // wider band after it, which is the order inverted. A tolerance of a
  // millionth of a CSS pixel is arithmetic noise and nothing else.
  const excess = laid - room;
  const overflow = excess > OVERFLOW_TOLERANCE ? excess : 0;
  const regime: FanRegime =
    overflow > 0
      ? 'overflow'
      : cardWidth < natural
        ? 'width-shrunk'
        : pitchRatio < SCENE_GEOMETRY.cardStep
          ? 'pitch-compressed'
          : 'natural';
  return { cardWidth, pitch: cardWidth * pitchRatio, pitchRatio, laid, overflow, regime };
}

/**
 * The rank and suit a face-down card is drawn with.
 *
 * A `CardSpec` has no shape for "unknown", and it needs none: `faceUp: false`
 * draws the back and conceals everything else in the record, which is `card.ts`'s
 * own guarantee. The machine deliberately does not publish the hole card while
 * it is down (`TableReadout.dealerVisible` is the face-up cards and
 * `dealerConcealed` is a count), so there is no real card to pass and this
 * placeholder can never be shown.
 */
const CONCEALED_RANK: Rank = 'A';
const CONCEALED_SUIT: Suit = 'spades';

/** SPEC 4.3 fixes which of the dealer's cards is face down: the second. */
const HOLE_CARD = 1;

/** One player hand as the felt shows it. */
export interface SceneHand {
  readonly cards: readonly Card[];
  /** The wager committed on this hand, drawn as a stack beneath it. */
  readonly wager: number;
  /**
   * Whether this hand won, while SPEC 10's round result is on screen.
   *
   * `null` at every other moment, which is not the same as `false`: SPEC 5 asks
   * winning hands to pulse and a hand mid-round has not won or lost yet. The
   * composition root reads it off the round result's settled hands, whose order
   * is the readout's hand order.
   */
  readonly won: boolean | null;
}

/** Everything the play surface draws, and nothing about how the game got here. */
export interface SceneState {
  /** Which table's felt. SPEC 16 gives each of SPEC 6's three its own colour. */
  readonly felt: FeltName;
  /** The active table's printed limits. */
  readonly limits: FeltLimits;
  /** The dealer's face-up cards, in deal order. SPEC 4.3. */
  readonly dealer: readonly Card[];
  /** How many of the dealer's cards are face down. SPEC 4.3: zero or one. */
  readonly dealerConcealed: number;
  /** The player's hands, left to right in SPEC 4.6's play order. */
  readonly hands: readonly SceneHand[];
  /** SPEC 4.11's wager being built at the controls, before the deal. */
  readonly pendingWager: number;
  /** The resolved motion policy for this frame. `animate.ts` owns what it does. */
  readonly motion: Motion;
  /**
   * The play-surface set this frame draws in. Item `G9`, `BJ-22`.
   *
   * Resolved once per frame by the composition root, beside the motion policy
   * and from the same single platform read the chrome's stylesheet answers, so
   * the canvas and the chrome cannot disagree about whether the page is in
   * forced colors. Nothing under `src/render/` asks the platform anything.
   */
  readonly palette: SelectedPalette;
}

/** Whether two immutable scene snapshots describe the same visible picture. */
function sameCards(left: readonly Card[], right: readonly Card[]): boolean {
  return (
    left.length === right.length &&
    left.every((held, index) => {
      const other = right[index];
      return other !== undefined && held.rank === other.rank && held.suit === other.suit;
    })
  );
}

/**
 * Whether a new scene can reuse the settled pixels already on the canvas.
 *
 * `SceneState` is assembled from immutable readouts, so retaining the previous
 * value is safe. The comparison is structural because the composition root
 * creates the hand wrappers afresh each frame.
 */
function sameScene(left: SceneState, right: SceneState): boolean {
  return (
    left.felt === right.felt &&
    left.limits.minimum === right.limits.minimum &&
    left.limits.maximum === right.limits.maximum &&
    left.dealerConcealed === right.dealerConcealed &&
    left.pendingWager === right.pendingWager &&
    left.motion.reducedMotion === right.motion.reducedMotion &&
    left.motion.speed === right.motion.speed &&
    // Identity, and `tokens.ts` is what makes that sound: `surfacePalette`
    // returns one of two frozen constants, so a frame that selected the same
    // set holds the same object and a frame that switched holds the other.
    left.palette === right.palette &&
    sameCards(left.dealer, right.dealer) &&
    left.hands.length === right.hands.length &&
    left.hands.every((hand, index) => {
      const other = right.hands[index];
      return (
        other !== undefined &&
        hand.wager === other.wager &&
        hand.won === other.won &&
        sameCards(hand.cards, other.cards)
      );
    })
  );
}

/**
 * Whether a baked felt still matches what a frame wants.
 *
 * Exported because it is the whole of the caching rule and because the
 * composition root has to be able to ask it. Five fields decide: the table's
 * colour, its printed limits, the logical size, the backing-store scale and the
 * play-surface set. A change in any of them means the baked pixels are wrong for
 * this frame. The palette entered the list at `BJ-22`: a forced-colors frame
 * that kept the standard bake would draw high-contrast cards onto a textured
 * standard felt, which is the one way the selection could be honoured and still
 * be invisible.
 */
export function needsRebake(current: FeltSpec, next: FeltSpec): boolean {
  return (
    current.felt !== next.felt ||
    current.width !== next.width ||
    current.height !== next.height ||
    current.dpr !== next.dpr ||
    current.limits.minimum !== next.limits.minimum ||
    current.limits.maximum !== next.limits.maximum ||
    current.palette !== next.palette
  );
}

/**
 * Where each card of one hand sits, centred on `centreX`.
 *
 * Cards overlap by design: a four-card hand at full width would run off a
 * split's share of the felt. The hand is laid out from `total`, its own laid
 * width, so it stays centred as it grows; passing that width in rather than
 * computing it here is what makes SPEC 5's "hand re-centre" a tween, because the
 * caller can hand in a width part way between the old one and the new one and
 * get the intermediate arrangement.
 */
export function handLayout(
  cards: readonly { readonly rank: Rank; readonly suit: Suit }[],
  centreX: number,
  topY: number,
  fan: Fan,
  faceUpCount: number,
  total: number = laidWidth(cards.length, fan.cardWidth, fan.pitch),
): readonly CardSpec[] {
  const left = centreX - total / 2;
  return cards.map((card, index) => ({
    rank: card.rank,
    suit: card.suit,
    faceUp: index < faceUpCount,
    x: left + index * fan.pitch,
    y: topY,
    width: fan.cardWidth,
  }));
}

/**
 * The width `count` cards occupy at a given pitch. Zero cards occupy nothing.
 *
 * The pitch is a length rather than the old fixed fraction of the card width,
 * which is the whole of item `E8`'s "the fan compresses to its pitch floor
 * before any card shrinks": there is now a pitch to compress.
 */
export function laidWidth(count: number, cardWidth: number, pitch: number): number {
  return count === 0 ? 0 : cardWidth + (count - 1) * pitch;
}

/** The horizontal centre of hand `index` of `count`, in logical units. */
export function handCentre(index: number, count: number, width: number): number {
  return (width * (index * 2 + 1)) / (count * 2);
}

// ---------------------------------------------------------------------------
// The animation state: what changed between two frames, and how long ago
// ---------------------------------------------------------------------------

/**
 * One thing that started at some point and has been running since.
 *
 * The age is capped at its own span every frame, so a session left open for an
 * hour holds the same small floats it held on the first round rather than a
 * number that has been added to sixty times a second all afternoon.
 */
interface Ageing {
  age: number;
  readonly pacing: PacingName;
}

/** One number easing toward a new value: the hand re-centre, and a stack's spot. */
export interface Easing {
  from: number;
  to: number;
  age: number;
}

/**
 * Everything the scene remembers between frames, and nothing else.
 *
 * Keyed by a stable string per drawn thing: `d:2` is the dealer's third card,
 * `h1:0` the first card of the second hand, `pending` and `h0` the two kinds of
 * chip stack. A key that stops appearing is dropped at the end of the frame, so
 * the maps are the size of the felt and not of the session.
 */
interface SceneMemory {
  /** When each card arrived, so a new one travels and an old one does not. */
  readonly cards: Map<string, Ageing>;
  /** When each chip arrived. Same rule, one entry per chip in a stack. */
  readonly chips: Map<string, Ageing>;
  /** Each hand's laid width, easing as the hand grows. SPEC 5's re-centre. */
  readonly widths: Map<string, Easing>;
  /** The hole card's flip, while one is running. SPEC 5, and item `E6`. */
  flip: Ageing | null;
  /** How many dealer cards were concealed last frame, to see the reveal. */
  concealed: number;
  /** The win pulse, while one is running. One for the round, not per hand. */
  pulse: Ageing | null;
  /** Whether a round result was on screen last frame, to see it arrive. */
  settled: boolean;
}

function newMemory(): SceneMemory {
  return {
    cards: new Map(),
    chips: new Map(),
    widths: new Map(),
    flip: null,
    concealed: 0,
    pulse: null,
    settled: false,
  };
}

/**
 * Advance an ageing thing, capped at its own span.
 *
 * **The delta is guarded here, because only the simulation half of the frame is
 * clamped.** `table.update` runs QUALITY-BAR section 7's three clauses on its
 * own copy of `dt`; the composition root hands the presentation half the raw
 * one, and this is where that raw number is spent. A non-finite delta would
 * write `NaN` into the age and `Math.min` keeps it there for the life of the
 * key, so every tween would sit at progress 0 for ever rather than jumping to
 * finished: a card mid-flight would never land. A negative delta would rewind
 * an age the machine consumed as zero. Neither is reachable through
 * `requestAnimationFrame`, whose timestamps are finite and non-decreasing; the
 * guard is here because the failure would be permanent rather than transient.
 *
 * A **large** delta is deliberately not clamped. Saturating at the span is what
 * lands every tween finished after a resume, which is the behaviour clause 3 of
 * section 7 asks the presentation for; borrowing the machine's clamp here would
 * leave them mid-flight instead.
 */
function advance(timer: Ageing, dt: number, motion: Motion): void {
  const span = motion.seconds(timer.pacing);
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  timer.age = Math.min(timer.age + step, span);
}

/** True once an ageing thing has run its whole span. */
function finished(timer: Ageing, motion: Motion): boolean {
  return motion.progress(timer.pacing, timer.age) >= 1;
}

/**
 * The progress of the thing keyed `key`, creating it at zero if it is new.
 *
 * The creation is the whole of "a card that has just been dealt travels": there
 * is no event and no callback, only a key that was not in the map last frame.
 * A `SceneState` is a value and the difference between two of them is the only
 * thing the presentation layer needs in order to know what happened.
 */
function progressOf(
  memory: Map<string, Ageing>,
  key: string,
  pacing: PacingName,
  dt: number,
  motion: Motion,
  seen: Set<string>,
): number {
  seen.add(key);
  let timer = memory.get(key);
  if (timer === undefined) {
    timer = { age: 0, pacing };
    memory.set(key, timer);
  } else {
    advance(timer, dt, motion);
  }
  return motion.progress(pacing, timer.age);
}

/**
 * Drop every key that did not appear this frame.
 *
 * Generic over the value, because the two memories prune identically and the
 * value type was the only thing that differed between the two copies this
 * replaced. What a memory holds is nothing to do with when it is emptied.
 */
function prune<T>(memory: Map<string, T>, seen: Set<string>): void {
  for (const key of [...memory.keys()]) {
    if (!seen.has(key)) {
      memory.delete(key);
    }
  }
}

/**
 * One number easing toward `target`, restarting the ease when the target moves.
 *
 * Restarting from the value currently shown, not from the previous target, so a
 * hand that gains two cards in quick succession slides once from wherever it had
 * reached rather than jumping back.
 */
function easeToward(
  memory: Map<string, Easing>,
  key: string,
  target: number,
  dt: number,
  motion: Motion,
  seen: Set<string>,
): EaseReading {
  seen.add(key);
  const held = memory.get(key);
  if (held === undefined) {
    memory.set(key, { from: target, to: target, age: 0 });
    return { value: target, moving: false };
  }
  return easeStep(held, target, dt, motion);
}

/** What one ease shows this frame, and whether it is still on its way. */
export interface EaseReading {
  readonly value: number;
  readonly moving: boolean;
}

/**
 * Advance one ease and read it, restarting it if its target has moved.
 *
 * Split out of `easeToward` and exported so the reading can be asserted
 * directly: `easeToward` takes the map and the seen-set it is plumbed with, and
 * a test of those is a test of the plumbing.
 *
 * **The reading is always taken at the age the frame ends on, and that is the
 * whole of the fix this function exists to carry.** An earlier form restarted
 * the ease and then returned the value it had computed *before* the restart,
 * which under reduced motion is the previous target: `progress` answers 1 from
 * the first frame, so the pre-restart reading is exactly where the hand used to
 * be. The hand then laid out one frame stale and snapped on the next, a 67 ms
 * residual at 15 fps, and `moving` was false throughout so nothing counted it as
 * animation. Reduced motion must remove the movement, not defer it by a frame.
 *
 * Outside the flag the behaviour is unchanged: `progress` of a zero age is 0,
 * so a restarted ease reads `from`, which is the value it was showing.
 */
export function easeStep(held: Easing, target: number, dt: number, motion: Motion): EaseReading {
  held.age = Math.min(held.age + dt, motion.seconds('handRecentre'));
  if (held.to !== target) {
    held.from = toward(held.from, held.to, motion.progress('handRecentre', held.age));
    held.to = target;
    held.age = 0;
  }
  const progress = motion.progress('handRecentre', held.age);
  return { value: toward(held.from, held.to, progress), moving: progress < 1 };
}

// ---------------------------------------------------------------------------
// The layers
// ---------------------------------------------------------------------------

/** Which card of a list is mid-flip, and how far through it is. SPEC 5. */
interface Flip {
  readonly index: number;
  readonly progress: number;
}

/** One card to draw, and the horizontal scale to draw it at. SPEC 5's flip. */
interface DrawnCard {
  readonly spec: CardSpec;
  /** 1 for every card but the one mid-flip. Zero is a card seen edge on. */
  readonly scaleX: number;
}

/**
 * Draw one card inside the layer's own horizontal scale about its centre.
 *
 * The scale is the flip. `CardSpec` cannot express it, because a card's height
 * follows from its width through `CARD_ASPECT`, so compressing the width in the
 * spec would compress the height with it and the card would shrink rather than
 * turn. The transform is the layer's own and is opened and closed around one
 * draw, which is what the pass rules allow: `beginShapePass` and `beginTextPass`
 * each own one `save` and one `restore`, and a layer that balances its own is
 * invisible to them.
 *
 * At a scale of zero there is nothing to draw and the transform would be
 * singular, so the draw is skipped. That is the same picture: a card seen
 * exactly edge on has no width.
 */
function withFlip(
  ctx: CanvasRenderingContext2D,
  card: DrawnCard,
  draw: (ctx: CanvasRenderingContext2D, spec: CardSpec) => void,
): void {
  if (card.scaleX >= 1) {
    draw(ctx, card.spec);
    return;
  }
  if (card.scaleX <= 0) {
    return;
  }
  const centre = card.spec.x + card.spec.width / 2;
  ctx.save();
  ctx.translate(centre, 0);
  ctx.scale(card.scaleX, 1);
  ctx.translate(-centre, 0);
  draw(ctx, card.spec);
  ctx.restore();
}

/** A layer that draws one list of cards in both passes. */
function cardLayer(cards: readonly DrawnCard[], tokens: SurfaceTokens): ScenePasses {
  return {
    drawShapes(ctx: CanvasRenderingContext2D): void {
      for (const card of cards) {
        withFlip(ctx, card, (target, spec) => {
          drawCardShapes(target, spec, tokens);
        });
      }
    },
    drawText(ctx: CanvasRenderingContext2D): void {
      for (const card of cards) {
        withFlip(ctx, card, (target, spec) => {
          drawCardText(target, spec, tokens);
        });
      }
    },
  };
}

/**
 * One chip in flight, drawn as a one-chip stack turned to the dash pattern it
 * will land on.
 *
 * `drawChip` is private by design, so a single travelling chip is a stack of
 * one. A stack of one turns its dashes by nothing, while the same chip landing
 * at index `i` turns them by `i * dashTurn`, so a chip drawn naively would spin
 * into place on the frame it arrived. The layer rotates its own context about
 * the chip's centre by exactly that angle instead. That is exact rather than
 * approximate: every arc `drawChip` traces is centred on the chip's own centre,
 * which is the point being rotated about, so rotating the transform by `a` and
 * adding `a` to every arc's start angle are the same instruction stream.
 */
interface FlyingChip {
  readonly spec: ChipStackSpec;
  readonly angle: number;
}

/**
 * Draw one flying chip's **shapes** under its landing turn.
 *
 * Shapes only, and that restriction is the whole of it. `drawChipStackText`
 * draws the numeral of a stack's **top** chip, and a stack of one is its own
 * top, so a flying chip drawn through this would print its own numeral, turned
 * by the same angle its dashes are: 55 degrees off upright at index 2, 83 at
 * index 3, snapping upright the moment it landed, with the stack underneath
 * showing a second numeral throughout the flight. A chip in the air is a chip,
 * not a label, and the value of a stack is read off the chip on top of it.
 */
function withTurn(ctx: CanvasRenderingContext2D, chip: FlyingChip, ring: Hex): void {
  ctx.save();
  ctx.translate(chip.spec.x, chip.spec.y);
  ctx.rotate(chip.angle);
  ctx.translate(-chip.spec.x, -chip.spec.y);
  drawChipStackShapes(ctx, chip.spec, ring);
  ctx.restore();
}

/**
 * A layer that draws the landed stacks and the chips still on their way.
 *
 * **The text pass never sees a flying chip.** So no numeral is drawn under a
 * rotated transform anywhere in the frame, and the numerals that are drawn are
 * exactly the ones the landed stacks would draw with nothing in the air. Item
 * `E4`'s "a 300 wager looks like three chips rather than a number" is about the
 * stack, and the stack is what carries the number.
 */
function chipLayer(
  stacks: readonly ChipStackSpec[],
  flying: readonly FlyingChip[],
  ring: Hex,
): ScenePasses {
  return {
    drawShapes(ctx: CanvasRenderingContext2D): void {
      for (const stack of stacks) {
        drawChipStackShapes(ctx, stack, ring);
      }
      for (const chip of flying) {
        withTurn(ctx, chip, ring);
      }
    },
    drawText(ctx: CanvasRenderingContext2D): void {
      for (const stack of stacks) {
        drawChipStackText(ctx, stack);
      }
    },
  };
}

/** One winning hand's pulse ring. SPEC 5, bounded by QUALITY-BAR section 4. */
interface PulseRing {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly stroke: number;
  /** The envelope, 0 to 1. Zero draws nothing at all. */
  readonly alpha: number;
}

/**
 * A layer that rings the winning hands.
 *
 * The ring is a boundary rather than a fill, which is the palette's own rule:
 * where a fill cannot clear 3:1 against what is behind it, the boundary carries
 * the contrast. It is drawn in the rail gold, whose red fraction is far below
 * WCAG's saturated-red threshold, and its alpha is the pulse envelope, which is
 * zero under reduced motion on every frame.
 */
function pulseLayer(rings: readonly PulseRing[], tokens: SurfaceTokens): ScenePasses {
  return {
    drawShapes(ctx: CanvasRenderingContext2D): void {
      for (const ring of rings) {
        if (ring.alpha <= 0) {
          continue;
        }
        ctx.save();
        ctx.globalAlpha = ring.alpha;
        ctx.strokeStyle = winPulseInk(tokens);
        ctx.lineWidth = ring.stroke;
        roundedRectPath(ctx, ring.x, ring.y, ring.width, ring.height, ring.radius);
        ctx.stroke();
        ctx.restore();
      }
    },
    drawText(): void {
      // A ring has no text. The no-op is the shape `ScenePasses` asks for, so
      // the frame loop has one path and no conditional.
    },
  };
}

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

/** The play surface: a sized canvas, a cached felt, and one frame entry point. */
export interface PlaySurface {
  readonly surface: Surface;
  /**
   * The spec the felt is currently baked from, frozen.
   *
   * **There is no drift-check consumer, and there is not meant to be one any
   * more.** This was the composition root's door for detecting a size or
   * device-pixel-ratio change and asking for a rebake; the `BJ-22` bake cache
   * took that job over and answers it per frame from the wanted spec, so
   * `main.ts` does not call this and the only reader is `felt-cache.test.ts`.
   * It stays because reading what the felt was baked from is a fair question to
   * be able to ask, and it is frozen at the bake because the object it hands
   * back is the cache's own key: an edit to it would silently make every
   * subsequent frame miss the cache and pay for a bake.
   */
  feltSpec(): FeltSpec;
  /** Resize the backing store. The felt rebakes on the next frame. */
  resize(sizing: SurfaceSizing): void;
  /**
   * One frame. Clear, felt, cards, chips, pulse, in that order.
   *
   * `dt` is the same delta the machine's `update` was given, in seconds. It is
   * how far the tweens advance, and it is handed in rather than measured so that
   * the picture and the simulation cannot disagree about how much time passed.
   */
  render(state: SceneState, dt: number): void;
  /** What the last frame resolved for item `E8`'s fan. Nothing in the game reads it. */
  fan(): FanReading;
  /**
   * Whether anything is mid-tween right now. Nothing in the game reads it.
   *
   * It is the observation item `E7` is graded on: "removes every animation
   * entirely" is the claim that this is false on every frame of a round driven
   * under `prefers-reduced-motion`, and the browser spec samples it per frame
   * through the test harness. A count rather than a boolean, so the same probe
   * shows the control: under no-preference it has to be positive somewhere, or
   * the assertion under the flag is asserting nothing.
   */
  tweensInFlight(): number;
}

/** What a play surface is built from. */
export interface PlaySurfaceOptions {
  /** The canvas the game is drawn on. */
  readonly canvas: SurfaceCanvas;
  /**
   * A **fresh** offscreen canvas, every call.
   *
   * A factory rather than a canvas, because this module must not reach for
   * `document` to make one: every module under `src/render/` runs headless
   * under Vitest, which is what let `BJ-13` assert an instruction stream rather
   * than a screenshot.
   *
   * **Freshness is load-bearing from `BJ-22`'s fix round on.** The caches below
   * keep a baked felt and a baked grain pair alive across frames, and a factory
   * that answered with the same canvas twice would have the second bake paint
   * over the first one's pixels while both cache entries still claimed to hold
   * them. The composition root passed the shipped felt canvas here until that
   * round; it now passes `feltLayer` for that.
   */
  readonly offscreen: () => SurfaceCanvas;
  readonly sizing: SurfaceSizing;
  /**
   * The shipped static felt layer, when the shell has one.
   *
   * Given, each bake gets a canvas of its own from the layer and the layer is
   * told which one to show; the felt never enters the animated surface's layer
   * list, because the shell stacks the static canvas behind the transparent
   * scene so motion never recopies a full-size table. Absent, the felt is drawn
   * as the animated surface's first layer, which is what the headless unit
   * armour reads.
   */
  readonly feltLayer?: FeltLayerHost;
}

/**
 * Where a baked felt goes when the shell has a static layer for it.
 *
 * **A canvas per bake, shown and hidden, rather than one canvas copied into.**
 * That shape is a measurement, taken on the shipped page under QUALITY-BAR
 * section 2's 4x throttle during `BJ-22`'s fix round, of the three ways the
 * pixels could reach the page:
 *
 * | Operation, at 1121 x 631 | Cost |
 * | --- | --- |
 * | Bake straight onto a canvas the page is showing | 1.0 to 2.0 ms |
 * | Bake into a fresh offscreen canvas | 3.0 to 3.8 ms |
 * | **First** copy of that offscreen onto the shown canvas | 21.6 to 32.3 ms |
 * | Every later copy of the same offscreen | 0.0 ms |
 *
 * A caveat on the third row, from the review that checked this table: the
 * first-copy figure depends on the instrument. A wall-clock bracket around
 * `drawImage` measures only the queueing and reads 2.5 to 4.9 ms; the figure
 * above came from attributing the deferred raster and upload to the call, and
 * the review could not reproduce it that large. What both instruments agree
 * on is the DIRECTION: baking onto a canvas of its own never costs more than
 * an offscreen bake plus its first copy, and later hits are free either way.
 * That ordering, not the margin, is what this design rests on: the copy is
 * out of the design and a cache hit is a swap rather than a draw. What that did **not** change is the one long task item `H4` can
 * still miss: it was 52 ms with the copy in the design and 52 ms without it,
 * and `scripts/report/perf.mjs` carries the trace that says why.
 *
 * Nothing here knows what a DOM element is: `src/ui/layout.ts` implements this
 * over the shell's felt stack, and the headless armour implements it over
 * canvas stubs.
 */
export interface FeltLayerHost {
  /** A canvas of the layer's own, not yet the one being shown. */
  acquire: () => SurfaceCanvas;
  /** Show this one, and stop showing whichever was being shown. */
  show: (canvas: SurfaceCanvas) => void;
  /** Take one the cache has evicted out of the layer for good. */
  release: (canvas: SurfaceCanvas) => void;
}

/**
 * How many baked felts are kept alive at once. `BJ-22`'s fix round, item `H4`.
 *
 * **Bounded because it is a cache of backing stores and not of numbers.** Each
 * entry holds a canvas the size of the play surface, so an unbounded map would
 * be a leak item `H5` measures for. Four, because the shipped phase cycle
 * visits exactly three surface sizes, measured over three rounds on the built
 * page (1029 x 579 at betting and the player turn, 1121 x 631 at dealing and
 * the reveal, 407 x 229 at the round result), and the fourth slot absorbs one
 * drift, a viewport resize or a forced-colors flip, without evicting the set in
 * play. Past that a bake is what the renderer did on every size change before
 * this cache existed, so the worst case is the old behaviour rather than a new
 * failure.
 */
export const FELT_CACHE_LIMIT = 4;

/**
 * How many baked grain pairs are kept. Three felts on one set, plus one.
 *
 * A pair is two `noiseTileCells` squares rather than two full surfaces, so this
 * bound costs far less than the one above; it exists for the same reason.
 */
const GRAIN_CACHE_LIMIT = 4;

/** Build the play surface. The felt bakes on the first frame, not here. */
export function createPlaySurface(options: PlaySurfaceOptions): PlaySurface {
  const surface = createSurface(options.canvas, options.sizing);
  const feltLayer = options.feltLayer ?? null;
  // Most recently used first, so an eviction takes the tail. A short array
  // scanned with `needsRebake` rather than a map keyed on a string, because
  // `needsRebake` is the whole of the caching rule and a second encoding of it
  // beside the first is a rule that can drift out from under its own test.
  const felts: FeltLayer[] = [];
  const grains: GrainTiles[] = [];
  /** The bake being shown, so the layer is only told when the answer changes. */
  let active: FeltLayer | null = null;
  const memory: SceneMemory = newMemory();
  let inFlight = 0;
  let rendered: SceneState | null = null;
  let resized = false;
  let fanReading: FanReading = Object.freeze({
    cardWidth: 0,
    naturalCardWidth: 0,
    pitch: 0,
    pitchRatio: 0,
    regimes: Object.freeze([]),
    overflow: 0,
    dealerTop: 0,
    handTop: 0,
  });

  /** The grain pair for one colour and scale, baked at most once for each. */
  function grainFor(wanted: GrainSpec): GrainTiles {
    const found = grains.find((entry) => sameGrain(entry.spec, wanted));
    if (found !== undefined) {
      grains.splice(grains.indexOf(found), 1);
      grains.unshift(found);
      return found;
    }
    const baked = bakeGrainTiles(options.offscreen, wanted);
    grains.unshift(baked);
    grains.length = Math.min(grains.length, GRAIN_CACHE_LIMIT);
    return baked;
  }

  /**
   * The baked felt this frame wants, from the cache when one holds it.
   *
   * **The cache is why the shipped page stopped rebaking on every screen.**
   * SPEC 10 replaces the whole controls row at every phase, that row is an
   * `auto` grid track, and the play-surface row above it therefore changes
   * height at every screen: three rounds of measured play on the built page
   * changed the backing store 27 times over three distinct sizes. Each of those
   * changes rebaked the felt, and a bake is the one expensive thing this
   * renderer does. Three bakes now serve all 27.
   */
  function feltFor(state: SceneState): FeltLayer {
    const wanted: FeltSpec = {
      felt: state.felt,
      limits: state.limits,
      width: surface.width,
      height: surface.height,
      dpr: surface.dpr,
      palette: state.palette,
    };
    const found = felts.find((entry) => !needsRebake(entry.spec, wanted));
    if (found !== undefined) {
      felts.splice(felts.indexOf(found), 1);
      felts.unshift(found);
      return found;
    }
    const baked = bakeFelt(
      feltLayer === null ? options.offscreen() : feltLayer.acquire(),
      wanted,
      grainFor({ felt: feltColour(state.palette.surface, state.felt), dpr: surface.dpr }),
    );
    felts.unshift(baked);
    for (const evicted of felts.splice(FELT_CACHE_LIMIT)) {
      feltLayer?.release(evicted.canvas);
    }
    return baked;
  }

  /** SPEC 5's flip, started on the frame the machine stops concealing a card. */
  function trackFlip(state: SceneState, dt: number): number | null {
    const was = memory.concealed;
    memory.concealed = state.dealerConcealed;
    if (state.dealerConcealed > 0) {
      // Concealed again means a new round: whatever was flipping is not.
      memory.flip = null;
      return null;
    }
    if (was > 0 && state.dealer.length > HOLE_CARD) {
      memory.flip = { age: 0, pacing: 'holeCardFlip' };
    } else if (memory.flip !== null) {
      advance(memory.flip, dt, state.motion);
    }
    if (memory.flip === null) {
      return null;
    }
    const progress = state.motion.progress('holeCardFlip', memory.flip.age);
    if (finished(memory.flip, state.motion)) {
      memory.flip = null;
    }
    return progress;
  }

  /** SPEC 5's pulse, started on the frame the round result arrives. */
  function trackPulse(state: SceneState, dt: number): number {
    const settled = state.hands.some((hand) => hand.won !== null);
    const was = memory.settled;
    memory.settled = settled;
    if (!settled) {
      memory.pulse = null;
      return 0;
    }
    if (!was) {
      memory.pulse = { age: 0, pacing: 'winPulse' };
    } else if (memory.pulse !== null) {
      advance(memory.pulse, dt, state.motion);
    }
    if (memory.pulse === null) {
      return 0;
    }
    return winPulse(memory.pulse.age, state.motion);
  }

  return {
    surface,

    feltSpec(): FeltSpec {
      if (active === null) {
        throw new Error('scene: the felt has not been baked; render a frame first');
      }
      return active.spec;
    },

    resize(sizing: SurfaceSizing): void {
      surface.resize(sizing);
      // Resizing a canvas clears its backing store. Even an otherwise identical
      // settled scene therefore owes one fresh draw at the new dimensions. The
      // felt layer needs nothing here: a size is part of the felt spec, so the
      // next frame either finds a bake already at this size or makes one, and
      // each bake sized its own canvas when it was made.
      resized = true;
    },

    fan: () => fanReading,

    tweensInFlight: () => inFlight,

    render(state: SceneState, dt: number): void {
      const { width, height } = surface;
      const { motion } = state;
      const tokens = state.palette.surface;

      // Item `E8`'s fan floor. Every band on the felt asks for room, one card
      // width is resolved for the whole frame from the tightest of them, and
      // each band then compresses its own pitch inside that width. The dealer's
      // band has the whole surface; each player hand has its equal share of it,
      // which is the room `handCentre` below already lays the hands out in.
      //
      // **Each band's fan is resolved once, here, and carried to whatever draws
      // it.** `fanFor` is arithmetic, so this is not about cost: the reading
      // `fan()` publishes is what `tests/browser/fan-floor.spec.ts` measures the
      // composited pixels against, and a second derivation beside the one the
      // cards are laid out from would let the probe report a fan the scene did
      // not draw.
      const handCount = Math.max(1, state.hands.length);
      const handRoom = width / handCount;
      const natural = naturalCardWidth(width);
      const dealerBand: FanBand = {
        count: state.dealer.length + state.dealerConcealed,
        room: width,
      };
      const bands: FanBand[] = [
        dealerBand,
        ...state.hands.map((hand) => ({ count: hand.cards.length, room: handRoom })),
      ];
      const cardWidth = fanCardWidth(bands, natural);
      const dealerFan = fanFor(dealerBand.count, dealerBand.room, cardWidth, natural);
      const laidHands = state.hands.map((hand) => ({
        hand,
        fan: fanFor(hand.cards.length, handRoom, cardWidth, natural),
      }));
      const resolved: Fan[] = [dealerFan, ...laidHands.map((entry) => entry.fan)];
      // The reading names the player's band, and a table with no hand on it
      // still has to answer: an empty band at the same room is what that is.
      const handFan = laidHands[0]?.fan ?? fanFor(0, handRoom, cardWidth, natural);
      const dealerRowTop = height * SCENE_GEOMETRY.dealerY;
      const playerRowTop = Math.max(
        height * SCENE_GEOMETRY.handY,
        dealerRowTop + cardHeight(cardWidth),
      );
      // Frozen here rather than copied at the getter, which is the cheapest
      // form: the record is rebuilt whole on every frame anyway, so freezing it
      // at the assignment costs one call a frame and no copy. `fan()` was the
      // one readout in the project that handed out live internal state, and it
      // is the surface item `E8`'s fan-floor evidence travels on.
      fanReading = Object.freeze({
        cardWidth,
        naturalCardWidth: natural,
        pitch: handFan.pitch,
        pitchRatio: handFan.pitchRatio,
        regimes: Object.freeze(resolved.map((fan) => fan.regime)),
        overflow: resolved.reduce((worst, fan) => Math.max(worst, fan.overflow), 0),
        dealerTop: dealerRowTop,
        handTop: playerRowTop,
      });
      const chipRadius = width * SCENE_GEOMETRY.chipX;
      const arcLift = height * SCENE_GEOMETRY.arcLiftY;
      const shoe: Point = {
        x: width * SCENE_GEOMETRY.shoeX,
        y: height * SCENE_GEOMETRY.shoeY,
      };
      const rack: Point = { x: width * SCENE_GEOMETRY.rackX, y: height * SCENE_GEOMETRY.rackY };
      const pendingSpot: Point = { x: width / 2, y: height * SCENE_GEOMETRY.pendingChipY };

      const seenCards = new Set<string>();
      const seenChips = new Set<string>();
      const seenWidths = new Set<string>();
      let moving = 0;

      /** Lay one list of cards out, travelling whichever of them are new. */
      function travelled(
        key: string,
        cards: readonly { readonly rank: Rank; readonly suit: Suit }[],
        centre: number,
        topY: number,
        faceUpCount: number,
        flip: Flip | null,
        fan: Fan,
      ): readonly DrawnCard[] {
        // SPEC 5's hand re-centre: the laid width eases to its new value, so the
        // cards already on the felt slide apart as one rather than jumping.
        const laid = easeToward(memory.widths, key, fan.laid, dt, motion, seenWidths);
        if (laid.moving) {
          moving += 1;
        }
        const specs = handLayout(cards, centre, topY, fan, faceUpCount, laid.value);
        return specs.map((spec, index) => {
          const progress = progressOf(
            memory.cards,
            `${key}:${String(index)}`,
            'cardTravel',
            dt,
            motion,
            seenCards,
          );
          if (progress < 1) {
            moving += 1;
          }
          const rest: Point = { x: spec.x, y: spec.y };
          const at = arcTravel(shoe, rest, arcLift, progress);
          const flipping = flip !== null && index === flip.index;
          if (flipping && flip.progress < 1) {
            moving += 1;
          }
          return {
            spec: {
              ...spec,
              x: at.x,
              y: at.y,
              faceUp: flipping && flip !== null ? flipShowsFace(flip.progress) : spec.faceUp,
            },
            scaleX: flipping && flip !== null ? flipScale(flip.progress) : 1,
          };
        });
      }

      /** One stack, with any chip that has not landed drawn on its way in. */
      function stacked(
        key: string,
        wager: number,
        spot: Point,
        origin: Point,
        into: ChipStackSpec[],
        flying: FlyingChip[],
      ): void {
        if (wager <= 0) {
          return;
        }
        const chips = wagerToChips(wager);
        const full: ChipStackSpec = { x: spot.x, y: spot.y, radius: chipRadius, chips };
        const landed: ChipDenomination[] = [];
        chips.forEach((denomination, index) => {
          const progress = progressOf(
            memory.chips,
            `${key}:${String(index)}`,
            'chipSlide',
            dt,
            motion,
            seenChips,
          );
          if (progress >= 1) {
            landed.push(denomination);
            return;
          }
          moving += 1;
          const rest: Point = {
            x: full.x,
            y: full.y - index * CHIP_GEOMETRY.stackOffset * chipRadius,
          };
          const at = slide(origin, rest, progress);
          flying.push({
            spec: { x: at.x, y: at.y, radius: chipRadius, chips: [denomination] },
            angle: index * CHIP_GEOMETRY.dashTurn,
          });
        });
        if (landed.length > 0) {
          into.push({ x: spot.x, y: spot.y, radius: chipRadius, chips: landed });
        }
      }

      const bakedFelt = feltFor(state);
      // Each bake owns its canvas, so a change of felt is a change of which one
      // the layer shows and never a copy. See `FeltLayerHost` for the three
      // measurements that made this a swap instead of a blit.
      if (bakedFelt !== active) {
        feltLayer?.show(bakedFelt.canvas);
        active = bakedFelt;
      }
      const layers: ScenePasses[] = feltLayer === null ? [bakedFelt] : [];
      const flipAt = trackFlip(state, dt);
      const pulse = trackPulse(state, dt);
      if (pulse > 0) {
        moving += 1;
      }

      // The dealer, centred, with the hole card drawn face down when the
      // machine says one is concealed. SPEC 4.3.
      const dealerCards = [...state.dealer];
      for (let index = 0; index < state.dealerConcealed; index += 1) {
        dealerCards.push({ rank: CONCEALED_RANK, suit: CONCEALED_SUIT });
      }
      const dealerTop = fanReading.dealerTop;
      if (dealerCards.length > 0) {
        layers.push(
          cardLayer(
            travelled(
              'd',
              dealerCards,
              width / 2,
              dealerTop,
              state.dealer.length,
              flipAt === null ? null : { index: HOLE_CARD, progress: flipAt },
              dealerFan,
            ),
            tokens,
          ),
        );
      }

      // **The player's row never starts above the dealer's row ends**, and that
      // clamp is the vertical half of item `E8`'s floor. The two rows are
      // fractions of the surface height, which is right while the card is a
      // fraction of the surface width: at 0.078 of the width a card is a fifth of
      // the height and the rows clear each other everywhere. A **floored** card
      // is not a fraction of anything, so on a short surface the dealer's cards
      // grow down into the player's row: measured at a 341 x 192 surface, the
      // one a 667 x 375 phone in landscape produces, the two rows overlapped by
      // 3 px. The clamp pushes the player's row clear and lets the band run off
      // the bottom instead, which is the criterion's own resolution: the band
      // overflows rather than either floor breaking. Above the floor
      // `Math.max` returns the fraction unchanged, so no viewport that was
      // laid out correctly moves by a pixel.
      const handTop = fanReading.handTop;

      // The player's hands, left to right, each with its own committed stack.
      const stacks: ChipStackSpec[] = [];
      const flying: FlyingChip[] = [];
      const rings: PulseRing[] = [];
      laidHands.forEach(({ hand, fan }, index) => {
        const key = `h${String(index)}`;
        const centre = handCentre(index, state.hands.length, width);
        const topY = handTop;
        const drawn = travelled(key, hand.cards, centre, topY, hand.cards.length, null, fan);
        layers.push(cardLayer(drawn, tokens));

        stacked(
          key,
          hand.wager,
          { x: centre, y: height * SCENE_GEOMETRY.handChipY },
          pendingSpot,
          stacks,
          flying,
        );

        if (hand.won === true && pulse > 0 && drawn.length > 0) {
          const first = drawn[0];
          const last = drawn[drawn.length - 1];
          if (first !== undefined && last !== undefined) {
            const pad = cardWidth * SCENE_GEOMETRY.pulsePad;
            rings.push({
              x: first.spec.x - pad,
              y: topY - pad,
              width: last.spec.x + cardWidth - first.spec.x + pad * 2,
              height: cardHeight(cardWidth) + pad * 2,
              radius: cardWidth * SCENE_GEOMETRY.pulseRadius,
              stroke: cardWidth * SCENE_GEOMETRY.pulseStroke,
              alpha: pulse,
            });
          }
        }
      });

      // SPEC 4.11's pending wager, on the felt while it is being built.
      stacked('pending', state.pendingWager, pendingSpot, rack, stacks, flying);

      if (stacks.length > 0 || flying.length > 0) {
        layers.push(chipLayer(stacks, flying, state.palette.chipRing));
      }
      if (rings.length > 0) {
        layers.push(pulseLayer(rings, tokens));
      }

      prune(memory.cards, seenCards);
      prune(memory.chips, seenChips);
      prune(memory.widths, seenWidths);
      const wasInFlight = inFlight;
      inFlight = moving;

      // The simulation still receives every frame, but a settled picture does
      // not need to clear and repaint millions of identical Retina pixels sixty
      // times a second. The previous in-flight count keeps the final tween frame
      // drawable after `moving` reaches zero; a resize is independently dirty
      // because changing the backing-store dimensions clears the canvas.
      if (
        resized ||
        rendered === null ||
        !sameScene(rendered, state) ||
        wasInFlight > 0 ||
        inFlight > 0
      ) {
        renderFrame(surface, layers, tokens);
        rendered = state;
        resized = false;
      }
    },
  };
}
