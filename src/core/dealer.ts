/**
 * The dealer: when to draw another card, and what the peek returns. SPEC 4.9
 * and 4.4. Items `B8` and `B7`, both Critical.
 *
 * Two primitives, and deliberately no loop between them. The dealer's turn, the
 * pacing of it, the reveal of the hole card and the SPEC 4.9 gate that stops the
 * dealer drawing when no hand is in contention all belong to the state machine
 * at `BJ-7`; settlement is `BJ-5`'s. What is here is the pair of questions those
 * parts have to ask, kept in one place so that neither of them answers one for
 * itself.
 *
 * **The policy is one comparison and has no branch for a soft total.** SPEC 4.9
 * is S17: hit while the value is below 17, stand on 17 or higher, soft 17
 * included. By the time the comparison is made, `hand.ts` has already settled
 * every reading of every Ace, so softness has nothing left to contribute and a
 * case for it could only ever change the answer on soft 17. That change is the
 * hit-soft-17 variant, which is a different game and the wrong one here. The
 * rule is printed on the felt.
 *
 * **The peek is two predicates and one bit.** SPEC 4.4 has the dealer look
 * behind an Ace or a ten-value up card, and offer insurance on an Ace alone.
 * Those are separate predicates rather than two fields of one result because the
 * phase machine has to run the offer to its close before the peek result is
 * applied. The contract is written out on `offersInsurance`.
 *
 * **A peek returns one of two shared constants and carries nothing else.** SPEC
 * 4.4 requires the peek to leak nothing when there is no natural. A result that
 * carried the hole card, or a field that only one branch filled, or merely a
 * different shape on each branch, would hand the caller something it can render,
 * log, time or serialise, and all four of those reach a player eventually. So
 * there are exactly two results in this module, both frozen, with one key
 * between them, and two peeks that found no natural return the very same object:
 * not even its identity separates a hole card of 2 from a hole card of 9.
 *
 * The timing and animation halves of that sentence in SPEC 4.4 are presentation,
 * and are graded by item `E6` at `BJ-14`, whose demonstration captures a peek on
 * both branches and requires them identical in motion and pacing. What a headless
 * module can guarantee is that a caller cannot leak what it was never handed.
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { Card, Rank } from './cards';
import { isAce, isTenValue } from './cards';
import type { SplitOrigin } from './hand';
import { handValue, isNatural } from './hand';

/**
 * The dealer's hand is never a hand created by a split.
 *
 * SPEC 4.6 splits a player's pair; the dealer holds one hand for the whole
 * round. Settling the origin once here, rather than at the call, is what keeps
 * the natural test in this file a *use* of SPEC 4.2's single definition instead
 * of a second reading of it.
 */
const UNSPLIT: SplitOrigin = Object.freeze({ fromSplit: false });

/**
 * The total the dealer stands on. SPEC 4.9.
 *
 * Exported so that a coach, a readout or a test can name the threshold rather
 * than writing 17 somewhere the felt cannot correct it.
 */
export const STANDS_AT = 17;

/**
 * True when the dealer takes another card. SPEC 4.9, item `B8`.
 *
 * The whole policy. One comparison on the same soft-aware evaluator the player
 * reads, with no case for soft totals, which is exactly what makes this S17:
 * `hand.ts` has already chosen the reading of every Ace, so a soft 17 arrives
 * here as 17 and stands like any other 17.
 *
 * **A hand over 21 is not asked to draw either**, and that falls out of the same
 * comparison rather than needing a bust clause: a bust total is above 21, which
 * is above 17. A policy that answered "hit" on a hand already over 21 would deal
 * a card to a hand that has finished, and the busting card is the one card the
 * dealer's own draw is most likely to be asked about.
 *
 * It takes the cards and not a total on purpose. A caller holding a total it
 * worked out elsewhere could hand this function a number counted some other way,
 * and the one property `B8` rests on is that the dealer and the player read the
 * same evaluator.
 *
 * This is not the dealer's turn. Whoever loops over it decides when the turn
 * starts, whether SPEC 4.9's contention gate lets the dealer draw at all, and
 * how fast the cards land, and all three are `BJ-7`'s.
 */
export function shouldHit(cards: readonly Card[]): boolean {
  return handValue(cards).total < STANDS_AT;
}

/**
 * True when the dealer peeks at the hole card. SPEC 4.4, item `B7`.
 *
 * An Ace or a ten-value up card, and no other rank: those are the only two up
 * cards a natural can be built on, so any other peek would be a look at a
 * concealed card that could not change anything.
 *
 * Keyed on the rank rather than on the card, per `cards.ts`: no suit changes any
 * value, predicate or payout in this game, and a function that took a whole card
 * to read one field of it would invite a later reader to assume otherwise.
 */
export function peeksOn(up: Rank): boolean {
  return isAce(up) || isTenValue(up);
}

/**
 * True when the insurance and even-money offers of SPEC 4.7 are made. SPEC 4.4.
 *
 * An Ace up card and nothing else. On a ten-value up card no offer is made and
 * the peek applies at once.
 *
 * **This is a separate predicate from `peek`, and the separation is the ordering
 * contract.** SPEC 4.4 requires the offers to be made and closed *before the
 * peek result is applied*, because insurance can only win on the branch the peek
 * decides: resolved after it, the side wager could only ever be lost. Asking
 * "is an offer owed" without asking "is there a natural" is what lets the phase
 * machine fit the entire offer between the two.
 *
 * Nothing in this file sequences them, because there is no phase here to
 * sequence them with. The ordering becomes enforceable at `BJ-7`, where the
 * `insurance` phase exists, and is graded there. What this file owes that part
 * is a peek whose result can be held back, which is what these two predicates
 * and the constants below are for.
 */
export function offersInsurance(up: Rank): boolean {
  return isAce(up);
}

/**
 * What a peek tells the rest of the game. SPEC 4.4, item `B7`.
 *
 * One field, because one bit is the entire result: the round either resolves
 * now or carries on exactly as it would have. Anything else on this interface,
 * even a field the natural branch alone fills, is a difference a caller can
 * measure between the two branches and eventually show.
 */
export interface PeekResult {
  /** True when the up card and the hole card are a natural. SPEC 4.2. */
  readonly dealerNatural: boolean;
}

/**
 * The two results there are.
 *
 * Shared constants rather than a fresh object per peek, so that every result of
 * a given branch is indistinguishable from every other result of that branch by
 * anything at all, identity included. Frozen, so a caller cannot decorate one
 * with the card it did not receive and pass it on.
 */
const DEALER_NATURAL: PeekResult = Object.freeze({ dealerNatural: true });
const NO_DEALER_NATURAL: PeekResult = Object.freeze({ dealerNatural: false });

/**
 * The peek behind an Ace or a ten-value up card. SPEC 4.4, item `B7`.
 *
 * The natural test comes from `isNatural` in `hand.ts` and is not re-derived
 * here. SPEC 4.2 defines a natural once and rungs 2 and 3 of the settlement
 * ladder inherit that definition; a local "an Ace and a ten" written out again
 * in this file is precisely the drift `hand.ts` exists to prevent, and it would
 * drift silently, because the two agree on every hand until a house rule moves.
 *
 * **Any other up card is refused rather than answered.** Returning "no natural"
 * for a 7 would be a true statement and a bad one: SPEC 4.3 keeps the hole card
 * concealed until the player's turn ends, except for the peek, so a call on a
 * non-peek up card is a phase ordering error that has already handed a concealed
 * card to a function that has no business looking at it. Refusing turns that
 * error into a failing test at `BJ-7`; answering it would make "ask every round
 * and ignore the answer" a habit, and a habit is what a renderer eventually
 * reads. It would also quietly turn this into a general "does the dealer hold a
 * natural" test, which is settlement's question at a different moment.
 *
 * The refusal is decided by the up card alone, which every player can already
 * see, and its message names the up card only. Nothing about the hole card
 * reaches a log or a stack trace by this path.
 */
export function peek(upCard: Card, holeCard: Card): PeekResult {
  if (!peeksOn(upCard.rank)) {
    throw new RangeError(
      `SPEC 4.4 peeks behind an Ace or a ten-value up card only; ${upCard.rank} is neither`,
    );
  }
  return isNatural([upCard, holeCard], UNSPLIT) ? DEALER_NATURAL : NO_DEALER_NATURAL;
}
