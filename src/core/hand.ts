/**
 * Hand evaluation, SPEC 4.2. Item B1, severity Critical.
 *
 * `canSplit` at the foot of this file is the pair test of SPEC 4.6 and is
 * **not** part of B1: item `B10` grades Split, and it grades the round-level
 * gates that decide whether the pair test is even asked. See the comment there.
 *
 * Value, soft or hard, bust, natural and the split pair test. Nothing else: the
 * shoe, the dealer, the wager and the settlement ladder are other modules, and
 * every one of them reads its totals from here rather than counting again.
 *
 * **The Ace adjustment is applied at most once, and there is no search.** Total
 * the hand with every Ace as 1, then add 10 if the hand holds an Ace and the
 * result still fits in 21. Two Aces can never both count 11, because 11 + 11 is
 * already 22 before the rest of the hand, so a second adjustment can never be
 * the best total and never needs trying. SPEC 4.2 states the rule as "multiple
 * Aces adjust to the highest total not exceeding 21", which is a search; this
 * is the closed form of it.
 *
 * That closed form is the whole reason item B1 exists and the whole reason its
 * expected values come from somewhere else. `tests/unit/reference/` holds a
 * second evaluator written from the specification's wording rather than from
 * this file, and it really does search: it tries every count of Aces read as 11
 * and keeps the best total. The two agree over every hand of up to five cards,
 * which is what turns the paragraph above from an argument into a proof.
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`.
 */

import type { Card, Rank } from './cards';
import { isAce, isTenValue, pipValue } from './cards';

/** The highest total that has not bust. SPEC 4.2. */
export const TARGET = 21;

/**
 * The two readings of an Ace, and the gap between them.
 *
 * The gap is 10 and so is a face card, and they are not the same ten. This one
 * is `11 - 1`, so it is derived rather than typed, and a house rule that ever
 * moved either reading would move it with them.
 */
const ACE_LOW = 1;
const ACE_HIGH = 11;
const ACE_ADJUSTMENT = ACE_HIGH - ACE_LOW;

/** A hand's total, and whether an Ace is being read as 11 to reach it. */
export interface HandValue {
  /** The best total not exceeding 21, or the lowest total if none fits. */
  readonly total: number;
  /** True when an Ace is counted as 11. SPEC 4.2 calls this a soft hand. */
  readonly soft: boolean;
}

/**
 * Whether a hand was produced by a split. SPEC 4.6 sets it once, at split time.
 *
 * Taken as a named field rather than a bare boolean argument on purpose. A
 * positional flag here is the exact mistake this part is guarding against: a
 * call site that passes it the wrong way round turns every split hand's 21 into
 * a 3:2 payout, and it reads correctly right up until settlement.
 */
export interface SplitOrigin {
  readonly fromSplit: boolean;
}

/** How SPEC 4.6 compares a hand's first two cards. Default is `equalValue`. */
export type SplitRule = 'equalValue' | 'equalRank';

/**
 * The two cards of a two-card hand, or `null` for any other length.
 *
 * `noUncheckedIndexedAccess` cannot see that a length test narrows an index, so
 * the pair is unpacked and proved once here instead of at each of the two call
 * sites below.
 */
function pair(cards: readonly Card[]): readonly [Card, Card] | null {
  if (cards.length !== 2) {
    return null;
  }
  const [first, second] = cards;
  if (first === undefined || second === undefined) {
    return null;
  }
  return [first, second];
}

/**
 * A hand's value. SPEC 4.2.
 *
 * An empty hand is 0 and hard, which is what a hand is before its first card
 * and is never a special case anywhere else.
 */
export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let holdsAce = false;
  for (const held of cards) {
    total += pipValue(held.rank);
    holdsAce ||= isAce(held.rank);
  }

  // The add-10-once rule. `total` here counts every Ace as 1, so this is the
  // only adjustment there is, and the hand is soft exactly when it applied.
  const soft = holdsAce && total + ACE_ADJUSTMENT <= TARGET;
  return { total: soft ? total + ACE_ADJUSTMENT : total, soft };
}

/**
 * True when the hand is over 21. SPEC 4.2 and 4.5.
 *
 * Strictly over. A hand of exactly 21 stands automatically per SPEC 4.5, which
 * is a different thing from busting and is decided elsewhere.
 */
export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).total > TARGET;
}

/**
 * True for a natural, also called a blackjack. SPEC 4.2.
 *
 * An Ace plus a ten-value card, as the **first two cards of an unsplit hand**.
 * All three clauses are load-bearing and each one is a payout:
 *
 * - A two-card 21 on a hand created by a split is 21, not a natural, and pays
 *   1:1 rather than 3:2. SPEC 4.6.
 * - A 21 reached in three or more cards is never a natural.
 * - Rungs 2 and 3 of the settlement ladder in SPEC 4.10 both inherit this one
 *   definition rather than restating it, so they cannot drift apart from it or
 *   from each other.
 *
 * The Ace test and the ten-value test cannot be satisfied by the same card, so
 * on a two-card hand "holds an Ace and holds a ten-value card" is exactly "one
 * of each".
 */
export function isNatural(cards: readonly Card[], origin: SplitOrigin): boolean {
  if (origin.fromSplit) {
    return false;
  }
  const two = pair(cards);
  if (two === null) {
    return false;
  }
  const ranks: readonly Rank[] = [two[0].rank, two[1].rank];
  return ranks.some(isAce) && ranks.some(isTenValue);
}

/**
 * The pair test of SPEC 4.6: whether a hand's first two cards may be split.
 *
 * **This is the pair test alone.** Split is also gated on the chip balance, on
 * the three-splits-and-four-hands limit counted across the round, and on split
 * Aces never being resplit. Those are properties of the round rather than of
 * two cards, they live in the round module, and item `B10` grades them there.
 * A caller must not read a `true` from here as "Split is available".
 *
 * Under `equalValue` any two ten-value cards pair, so a King and a Jack may be
 * split; under `equalRank` they may not. The comparison uses the pip value, so
 * an Ace is compared as 1, and that choice is free: no other rank is worth 1,
 * and no other rank is worth 11 either, so an Ace pairs only with an Ace under
 * either reading of it.
 */
export function canSplit(cards: readonly Card[], rule: SplitRule): boolean {
  const two = pair(cards);
  if (two === null) {
    return false;
  }
  const [first, second] = two;
  return rule === 'equalRank'
    ? first.rank === second.rank
    : pipValue(first.rank) === pipValue(second.rank);
}
