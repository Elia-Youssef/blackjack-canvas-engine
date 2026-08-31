/**
 * Ranks, suits, cards and the card factory. SPEC 4.2.
 *
 * This module owns what a card *is* and what a rank is *worth*. It owns nothing
 * about hands: totals, soft or hard, bust and natural all live in `hand.ts`, so
 * that the value table has exactly one home and the evaluator has exactly one.
 *
 * **Everything value-related keys on `Rank`, never on `Card`.** A suit changes
 * no total, no predicate and no payout anywhere in this game, and a function
 * that accepts a whole card to read one field of it invites a future reader to
 * assume otherwise. `isAce(card.rank)` at the call site says which field is
 * load-bearing; `isAce(card)` hides it.
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`. The BJ-0 lint
 * boundary enforces all four and this file is inside it.
 */

/** A printed rank. Thirteen of them, and the `Rank` type is the whole set. */
export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

/** A suit. Four of them. Decorative: no suit changes any value in this game. */
export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

/**
 * Every rank, in printed order with the Ace first.
 *
 * The order is the shoe's build order and the order a hand is displayed in, and
 * it is fixed rather than incidental: `BJ-3` shuffles a shoe built from this
 * list with a seeded stream, so a change of order here would change every
 * seeded deal in the project.
 */
export const RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const satisfies readonly Rank[];

/** Every suit, in the shoe's build order. See `RANKS` on why order is fixed. */
export const SUITS = [
  'clubs',
  'diamonds',
  'hearts',
  'spades',
] as const satisfies readonly Suit[];

/** One card. Immutable, by the type and by `Object.freeze` in the factory. */
export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

/**
 * What a rank is worth with an Ace counted as **1**.
 *
 * SPEC 4.2: number cards at printed value, Jack, Queen and King at 10, an Ace
 * at 11 unless that busts the hand. The eleven is not in this table on purpose.
 * An Ace is worth 1 here and `hand.ts` performs the single add-10 adjustment,
 * which keeps the "is it soft" decision in one place instead of two.
 */
const PIP: Readonly<Record<Rank, number>> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 10,
  Q: 10,
  K: 10,
};

/**
 * What a ten-value card is worth.
 *
 * **Not the Ace adjustment**, which is also 10 and is a different ten: that one
 * is the gap between the two readings of an Ace, it is derived as `11 - 1` in
 * `hand.ts`, and coupling the two would mean a house rule that moved either
 * reading of the Ace silently moved the face cards with it.
 */
const TEN = 10;

/**
 * The card factory.
 *
 * Frozen rather than merely typed `readonly`. `readonly` is erased at run time,
 * and a card is handed from the shoe to a hand to the history to the renderer;
 * one stray write anywhere along that chain would corrupt a card that another
 * hand is still holding, with no type error to show for it.
 */
export function card(rank: Rank, suit: Suit): Card {
  return Object.freeze({ rank, suit });
}

/**
 * A rank's value with an Ace counted as 1. SPEC 4.2.
 *
 * The other reading of an Ace is a property of a *hand*, not of a card, because
 * whether the eleven fits depends on the rest of the hand. `hand.ts` owns it.
 */
export function pipValue(rank: Rank): number {
  return PIP[rank];
}

/** True for the Ace, the only rank with two readings. */
export function isAce(rank: Rank): boolean {
  return rank === 'A';
}

/**
 * True for `10`, `J`, `Q` and `K`. SPEC 4.4 and 4.2 both turn on this set: it
 * is what the dealer peeks behind, and it is the other half of a natural.
 *
 * An Ace cannot reach this test. Its pip value is 1, which is what makes the
 * value comparison sufficient rather than needing a second clause about Aces.
 */
export function isTenValue(rank: Rank): boolean {
  return pipValue(rank) === TEN;
}
