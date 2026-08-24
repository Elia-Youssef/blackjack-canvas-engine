/**
 * The play surface, composed. What the composition root hands to the canvas.
 *
 * `BJ-13` built the four drawing modules and proved each one on its own: the
 * felt bakes once and blits, a card knows its corners and its pips, a chip stack
 * knows its offsets. Nothing put them together into a table, because there was
 * no game to read a table off. This is that assembly, and it exists for item
 * `M1`: the canvas draws the felt, the cards and the chips, **and nothing else**.
 * No button, no readout, no panel, no label and no menu is drawn here, and there
 * is no hit test in this file or anywhere else under `src/render/`.
 *
 * **No acceptance item is claimed by this file.** `E3`, `E4` and `E5` are
 * Demonstration items that close at the ACCEPTANCE section 4 session, and the
 * behaviour they capture is `BJ-13`'s. What is added here is the arrangement:
 * where a hand sits, how a split's hands share the felt, and where the wager
 * stands.
 *
 * Two properties are load bearing and are tested rather than assumed:
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
 */

import type { Card, Rank, Suit } from '../core/cards';

import { drawCardShapes, drawCardText, type CardSpec } from './card';
import {
  drawChipStackShapes,
  drawChipStackText,
  wagerToChips,
  type ChipStackSpec,
} from './chips';
import { bakeFelt, type FeltLayer, type FeltLimits, type FeltSpec } from './felt';
import {
  createSurface,
  renderFrame,
  type ScenePasses,
  type Surface,
  type SurfaceCanvas,
  type SurfaceSizing,
} from './surface';
import type { FeltName } from './tokens';

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

/** One player hand as the felt shows it. */
export interface SceneHand {
  readonly cards: readonly Card[];
  /** The wager committed on this hand, drawn as a stack beneath it. */
  readonly wager: number;
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
 * split's share of the felt. The hand is laid out from its own total width so
 * it stays centred as it grows, which is what SPEC 5's "hand re-centre" tween
 * animates at `BJ-14`; this is the arrangement that tween interpolates between.
 */
export function handLayout(
  cards: readonly { readonly rank: Rank; readonly suit: Suit }[],
  centreX: number,
  topY: number,
  cardWidth: number,
  faceUpCount: number,
): readonly CardSpec[] {
  const step = cardWidth * SCENE_GEOMETRY.cardStep;
  const total = cards.length === 0 ? 0 : cardWidth + (cards.length - 1) * step;
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

/** The horizontal centre of hand `index` of `count`, in logical units. */
export function handCentre(index: number, count: number, width: number): number {
  return (width * (index * 2 + 1)) / (count * 2);
}

/** A layer that draws one list of cards in both passes. */
function cardLayer(cards: readonly CardSpec[]): ScenePasses {
  return {
    drawShapes(ctx: CanvasRenderingContext2D): void {
      for (const card of cards) {
        drawCardShapes(ctx, card);
      }
    },
    drawText(ctx: CanvasRenderingContext2D): void {
      for (const card of cards) {
        drawCardText(ctx, card);
      }
    },
  };
}

/** A layer that draws one list of chip stacks in both passes. */
function chipLayer(stacks: readonly ChipStackSpec[]): ScenePasses {
  return {
    drawShapes(ctx: CanvasRenderingContext2D): void {
      for (const stack of stacks) {
        drawChipStackShapes(ctx, stack);
      }
    },
    drawText(ctx: CanvasRenderingContext2D): void {
      for (const stack of stacks) {
        drawChipStackText(ctx, stack);
      }
    },
  };
}

/** The play surface: a sized canvas, a cached felt, and one frame entry point. */
export interface PlaySurface {
  readonly surface: Surface;
  /** The spec the felt is currently baked from. For a drift check and a test. */
  feltSpec(): FeltSpec;
  /** Resize the backing store. The felt rebakes on the next frame. */
  resize(sizing: SurfaceSizing): void;
  /** One frame. Clear, felt, cards, chips, in that order. */
  render(state: SceneState): void;
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

    render(state: SceneState): void {
      const { width, height } = surface;
      const cardWidth = width * SCENE_GEOMETRY.cardX;
      const chipRadius = width * SCENE_GEOMETRY.chipX;
      const layers: ScenePasses[] = [feltFor(state)];

      // The dealer, centred, with the hole card drawn face down when the
      // machine says one is concealed. SPEC 4.3.
      const dealerCards = [...state.dealer];
      for (let index = 0; index < state.dealerConcealed; index += 1) {
        dealerCards.push({ rank: CONCEALED_RANK, suit: CONCEALED_SUIT });
      }
      if (dealerCards.length > 0) {
        layers.push(
          cardLayer(
            handLayout(
              dealerCards,
              width / 2,
              height * SCENE_GEOMETRY.dealerY,
              cardWidth,
              state.dealer.length,
            ),
          ),
        );
      }

      // The player's hands, left to right, each with its own committed stack.
      const stacks: ChipStackSpec[] = [];
      state.hands.forEach((hand, index) => {
        const centre = handCentre(index, state.hands.length, width);
        layers.push(
          cardLayer(
            handLayout(hand.cards, centre, height * SCENE_GEOMETRY.handY, cardWidth, hand.cards.length),
          ),
        );
        if (hand.wager > 0) {
          stacks.push({
            x: centre,
            y: height * SCENE_GEOMETRY.handChipY,
            radius: chipRadius,
            chips: wagerToChips(hand.wager),
          });
        }
      });

      // SPEC 4.11's pending wager, on the felt while it is being built.
      if (state.pendingWager > 0) {
        stacks.push({
          x: width / 2,
          y: height * SCENE_GEOMETRY.pendingChipY,
          radius: chipRadius,
          chips: wagerToChips(state.pendingWager),
        });
      }
      if (stacks.length > 0) {
        layers.push(chipLayer(stacks));
      }

      renderFrame(surface, layers);
    },
  };
}
