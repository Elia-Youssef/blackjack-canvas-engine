/**
 * The independent hand evaluator. Item B1.
 *
 * **This file must not import anything from `src/`.** It exists so that the
 * expected values in `tests/unit/hand-value.test.ts` come from somewhere other
 * than the code under test. An evaluator checked against itself proves that it
 * is self-consistent, which is not the claim B1 makes; two implementations
 * written from the same paragraph, disagreeing where either is wrong, is.
 *
 * It is written from SPEC 4.2 as prose, and deliberately not from the paragraph
 * of that section that states an implementation:
 *
 *   "Number cards at printed value. Jack, Queen and King at 10. An Ace is 11
 *    unless that busts the hand, in which case 1. Multiple Aces adjust to the
 *    highest total not exceeding 21."
 *
 *   "A natural (blackjack) is an Ace plus a ten-value card as a hand's first
 *    two cards on an unsplit hand."
 *
 * So this one **searches**. It tries every number of Aces read as 11, from none
 * to all of them, and keeps the highest total that does not exceed 21, falling
 * back to the lowest total when none does. The game's evaluator does not search
 * at all: it totals with every Ace as 1 and adds 10 at most once. The point of
 * the sweep is that those two produce the same answer for every hand, which is
 * what makes the shortcut safe to ship.
 *
 * Counting how many Aces are read as 11, rather than enumerating which ones,
 * loses nothing: two Aces in a hand are interchangeable, so two assignments
 * with the same number of elevens give the same total by construction.
 *
 * Rank labels are plain strings here, not the game's `Rank` type, so that this
 * file shares no declaration with the code it is checking. Values are derived
 * from the label itself rather than from a table, for the same reason.
 */

/** The Ace, the only rank with two readings. */
const ACE = 'A';

/** The three ranks worth ten that are not printed with a number. */
const FACES = ['J', 'Q', 'K'];

/** The two readings of an Ace. */
const LOW = 1;
const HIGH = 11;

/** The highest total that has not bust. */
const LIMIT = 21;

/** What one non-Ace rank is worth: printed value, or ten for a face card. */
function fixedValue(label: string): number {
  if (label === ACE) {
    throw new Error('an Ace has no single fixed value; it is 1 or 11');
  }
  if (FACES.includes(label)) {
    return 10;
  }
  if (/^[0-9]+$/.test(label)) {
    return Number(label);
  }
  throw new Error(`not a rank: ${label}`);
}

/** True for a ten-value card: `10`, `J`, `Q` or `K`, and never an Ace. */
export function isTenValueRank(label: string): boolean {
  return label !== ACE && fixedValue(label) === 10;
}

/** The verdict on one hand. */
export interface ReferenceHand {
  readonly total: number;
  readonly soft: boolean;
  readonly bust: boolean;
  readonly natural: boolean;
}

/** Whether the hand was produced by a split. SPEC 4.6. */
export interface ReferenceOrigin {
  readonly fromSplit: boolean;
}

/**
 * Evaluate a hand given as a list of rank labels.
 *
 * `ranks` is in dealt order, which nothing here reads: a hand's value does not
 * depend on the order its cards arrived in, and the sweep proves that by
 * running every ordering of every hand of up to five cards through it.
 */
export function evaluate(
  ranks: readonly string[],
  origin: ReferenceOrigin,
): ReferenceHand {
  const aces = ranks.filter((label) => label === ACE).length;
  let base = 0;
  for (const label of ranks) {
    if (label !== ACE) {
      base += fixedValue(label);
    }
  }

  // Every reading of the Aces, from all of them low to all of them high.
  let best: { total: number; elevens: number } | null = null;
  let lowest: { total: number; elevens: number } | null = null;
  for (let elevens = 0; elevens <= aces; elevens += 1) {
    const total = base + elevens * HIGH + (aces - elevens) * LOW;
    if (lowest === null || total < lowest.total) {
      lowest = { total, elevens };
    }
    if (total <= LIMIT && (best === null || total > best.total)) {
      best = { total, elevens };
    }
  }

  // "the highest total not exceeding 21", or, when no reading of the Aces gets
  // under the limit, "1", which is the lowest total there is.
  const chosen = best ?? lowest;
  if (chosen === null) {
    throw new Error('the search produced no reading at all');
  }

  return {
    total: chosen.total,
    // Soft means an Ace is being read as 11 to reach this total.
    soft: chosen.elevens > 0,
    bust: chosen.total > LIMIT,
    natural:
      !origin.fromSplit &&
      ranks.length === 2 &&
      ranks.filter((label) => label === ACE).length === 1 &&
      ranks.filter((label) => isTenValueRank(label)).length === 1,
  };
}
