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
  WIN_PULSE_INK,
  type Motion,
  type PacingName,
  type Point,
} from './animate';
import { drawCardShapes, drawCardText, cardHeight, type CardSpec } from './card';
import {
  CHIP_GEOMETRY,
  drawChipStackShapes,
  drawChipStackText,
  wagerToChips,
  type ChipStackSpec,
} from './chips';
import { bakeFelt, type FeltLayer, type FeltLimits, type FeltSpec } from './felt';
import {
  createSurface,
  renderFrame,
  roundedRectPath,
  type ScenePasses,
  type Surface,
  type SurfaceCanvas,
  type SurfaceSizing,
} from './surface';
import type { ChipDenomination, FeltName } from './tokens';

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
}

/**
 * Whether a baked felt still matches what a frame wants.
 *
 * Exported because it is the whole of the caching rule and because the
 * composition root has to be able to ask it. Four fields decide: the table's
 * colour, its printed limits, the logical size and the backing-store scale. A
 * change in any of them means the baked pixels are wrong for this frame.
 */
export function needsRebake(current: FeltSpec, next: FeltSpec): boolean {
  return (
    current.felt !== next.felt ||
    current.width !== next.width ||
    current.height !== next.height ||
    current.dpr !== next.dpr ||
    current.limits.minimum !== next.limits.minimum ||
    current.limits.maximum !== next.limits.maximum
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
  cardWidth: number,
  faceUpCount: number,
  total: number = laidWidth(cards.length, cardWidth),
): readonly CardSpec[] {
  const step = cardWidth * SCENE_GEOMETRY.cardStep;
  const left = centreX - total / 2;
  return cards.map((card, index) => ({
    rank: card.rank,
    suit: card.suit,
    faceUp: index < faceUpCount,
    x: left + index * step,
    y: topY,
    width: cardWidth,
  }));
}

/** The width `count` overlapping cards occupy. Zero cards occupy nothing. */
export function laidWidth(count: number, cardWidth: number): number {
  return count === 0 ? 0 : cardWidth + (count - 1) * cardWidth * SCENE_GEOMETRY.cardStep;
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

/** Advance an ageing thing, capped at its own span. */
function advance(timer: Ageing, dt: number, motion: Motion): void {
  const span = motion.seconds(timer.pacing);
  timer.age = Math.min(timer.age + dt, span);
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

/** Drop every key that did not appear this frame. */
function prune(memory: Map<string, Ageing>, seen: Set<string>): void {
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

function pruneEasings(memory: Map<string, Easing>, seen: Set<string>): void {
  for (const key of [...memory.keys()]) {
    if (!seen.has(key)) {
      memory.delete(key);
    }
  }
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
function cardLayer(cards: readonly DrawnCard[]): ScenePasses {
  return {
    drawShapes(ctx: CanvasRenderingContext2D): void {
      for (const card of cards) {
        withFlip(ctx, card, drawCardShapes);
      }
    },
    drawText(ctx: CanvasRenderingContext2D): void {
      for (const card of cards) {
        withFlip(ctx, card, drawCardText);
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
function withTurn(ctx: CanvasRenderingContext2D, chip: FlyingChip): void {
  ctx.save();
  ctx.translate(chip.spec.x, chip.spec.y);
  ctx.rotate(chip.angle);
  ctx.translate(-chip.spec.x, -chip.spec.y);
  drawChipStackShapes(ctx, chip.spec);
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
function chipLayer(stacks: readonly ChipStackSpec[], flying: readonly FlyingChip[]): ScenePasses {
  return {
    drawShapes(ctx: CanvasRenderingContext2D): void {
      for (const stack of stacks) {
        drawChipStackShapes(ctx, stack);
      }
      for (const chip of flying) {
        withTurn(ctx, chip);
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
function pulseLayer(rings: readonly PulseRing[]): ScenePasses {
  return {
    drawShapes(ctx: CanvasRenderingContext2D): void {
      for (const ring of rings) {
        if (ring.alpha <= 0) {
          continue;
        }
        ctx.save();
        ctx.globalAlpha = ring.alpha;
        ctx.strokeStyle = WIN_PULSE_INK;
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
  /** The spec the felt is currently baked from. For a drift check and a test. */
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
   * A fresh offscreen canvas for the felt bake.
   *
   * A factory rather than a canvas, because a rebake at a new size needs a new
   * one and because this module must not reach for `document` to make it: every
   * module under `src/render/` runs headless under Vitest, which is what let
   * `BJ-13` assert an instruction stream rather than a screenshot.
   */
  readonly offscreen: () => SurfaceCanvas;
  readonly sizing: SurfaceSizing;
}

/** Build the play surface. The felt bakes on the first frame, not here. */
export function createPlaySurface(options: PlaySurfaceOptions): PlaySurface {
  const surface = createSurface(options.canvas, options.sizing);
  let felt: FeltLayer | null = null;
  const memory: SceneMemory = newMemory();
  let inFlight = 0;

  function feltFor(state: SceneState): FeltLayer {
    const wanted: FeltSpec = {
      felt: state.felt,
      limits: state.limits,
      width: surface.width,
      height: surface.height,
      dpr: surface.dpr,
    };
    if (felt === null || needsRebake(felt.spec, wanted)) {
      felt = bakeFelt(options.offscreen(), wanted);
    }
    return felt;
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
      if (felt === null) {
        throw new Error('scene: the felt has not been baked; render a frame first');
      }
      return felt.spec;
    },

    resize(sizing: SurfaceSizing): void {
      surface.resize(sizing);
    },

    tweensInFlight: () => inFlight,

    render(state: SceneState, dt: number): void {
      const { width, height } = surface;
      const { motion } = state;
      const cardWidth = width * SCENE_GEOMETRY.cardX;
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
      ): readonly DrawnCard[] {
        // SPEC 5's hand re-centre: the laid width eases to its new value, so the
        // cards already on the felt slide apart as one rather than jumping.
        const laid = easeToward(
          memory.widths,
          key,
          laidWidth(cards.length, cardWidth),
          dt,
          motion,
          seenWidths,
        );
        if (laid.moving) {
          moving += 1;
        }
        const specs = handLayout(cards, centre, topY, cardWidth, faceUpCount, laid.value);
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

      const layers: ScenePasses[] = [feltFor(state)];
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
      if (dealerCards.length > 0) {
        layers.push(
          cardLayer(
            travelled(
              'd',
              dealerCards,
              width / 2,
              height * SCENE_GEOMETRY.dealerY,
              state.dealer.length,
              flipAt === null ? null : { index: HOLE_CARD, progress: flipAt },
            ),
          ),
        );
      }

      // The player's hands, left to right, each with its own committed stack.
      const stacks: ChipStackSpec[] = [];
      const flying: FlyingChip[] = [];
      const rings: PulseRing[] = [];
      state.hands.forEach((hand, index) => {
        const key = `h${String(index)}`;
        const centre = handCentre(index, state.hands.length, width);
        const topY = height * SCENE_GEOMETRY.handY;
        const drawn = travelled(key, hand.cards, centre, topY, hand.cards.length, null);
        layers.push(cardLayer(drawn));

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
        layers.push(chipLayer(stacks, flying));
      }
      if (rings.length > 0) {
        layers.push(pulseLayer(rings));
      }

      prune(memory.cards, seenCards);
      prune(memory.chips, seenChips);
      pruneEasings(memory.widths, seenWidths);
      inFlight = moving;

      renderFrame(surface, layers);
    },
  };
}
