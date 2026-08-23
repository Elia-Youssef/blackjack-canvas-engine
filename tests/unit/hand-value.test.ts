/**
 * Item B1, severity Critical, 17 points.
 *
 *   "Hand evaluation is correct for every distinct hand of up to five cards,
 *    checked against an independently written evaluator: value, soft or hard,
 *    bust, and natural detection."
 *
 * The expected values in this file come from `reference/hand-evaluator.ts`,
 * which imports nothing from `src/` and which searches every reading of the
 * Aces instead of using the game's add-10-once shortcut. That separation is the
 * item: an evaluator agreeing with itself proves consistency, not correctness,
 * and a misreading of SPEC 4.2 shared by the code and its test is invisible.
 *
 * **"Every distinct hand" is swept as ranks, and suits are proved irrelevant
 * separately.** A hand is a sequence of ranks and a sequence of suits, and no
 * value, predicate or payout in this game reads a suit. Sweeping both together
 * would mean 52 to the fifth power of hands to make the same point; sweeping
 * ranks exhaustively and then showing that every suit assignment of a hand
 * gives the same answer covers the space without pretending the two halves are
 * one. The rank sweep still varies the suits, so no hand in it is single-suited
 * and every hand of four cards or more carries all four suits.
 *
 * What is swept, and why each range is where it is:
 *
 *   1. **Every ordered hand of one to five cards**, 402,233 of them. Five is
 *      the length B1 names. Ordered rather than by composition, so that an
 *      evaluator that reads the first card differently from the rest, or that
 *      accumulates in the wrong direction, is caught rather than averaged out.
 *   2. **Every composition of six to eight cards**, 194,922 of them. Past what
 *      the item asks for, because a hand does not stop at five: SPEC 4.1 puts
 *      the worst case at 21 cards.
 *   3. **Every hand of `k` Aces and `n` copies of one other rank**, at every
 *      length up to 21. This is the family the add-10-once rule lives or dies
 *      on, and the uniform sample in 4 would almost never produce it.
 *   4. **A deterministic sample at each length from nine to twenty-one.** Fixed
 *      seed, no `Math.random()`, so a failure here reproduces exactly.
 *
 * Plus suit invariance, the natural definition against its three traps, and the
 * pair test of SPEC 4.6.
 *
 * Two counts are asserted rather than trusted: the number of hands the sweep
 * visited, and the 13 rank labels it swept over. A sweep that quietly stopped
 * covering five-card hands would otherwise pass, and so would one that ran over
 * a `RANKS` list with a rank missing from it.
 */

import { describe, expect, it } from 'vitest';

import type { Card, Rank, Suit } from '../../src/core/cards';
import { RANKS, SUITS, card, isAce, isTenValue, pipValue } from '../../src/core/cards';
import type { SplitRule } from '../../src/core/hand';
import { TARGET, canSplit, handValue, isBust, isNatural } from '../../src/core/hand';

import { evaluate, isTenValueRank } from './reference/hand-evaluator';

// ---------------------------------------------------------------------------
// The alphabet, carried here rather than taken from the code under test
// ---------------------------------------------------------------------------

/**
 * The 13 rank labels, written out.
 *
 * Deliberately not `RANKS`. If the sweep took its alphabet from the module it
 * is checking, a `RANKS` missing a rank would shrink the sweep to match and
 * every assertion below would still pass. The first test asserts the two are
 * the same list, which is the only place that comparison is safe to make.
 */
const RANK_LABELS = [
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
] as const;

const SUIT_LABELS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;

/** The length B1 names, and the length of sweep 1. */
const EXHAUSTIVE_LENGTH = 5;

/** How far the composition sweep runs past the length B1 names. */
const COMPOSITION_LENGTH = 8;

/** The worst-case hand of SPEC 4.1: 21 Aces, at exactly 21. */
const LONGEST_HAND = 21;

/** Hands drawn at each length from `COMPOSITION_LENGTH + 1` to `LONGEST_HAND`. */
const SAMPLES_PER_LENGTH = 500;

/**
 * The hands sweep 1 visits: 13 + 169 + 2,197 + 28,561 + 371,293.
 *
 * Hard-coded rather than recomputed from `EXHAUSTIVE_LENGTH`. Derived from the
 * same constant it is guarding, it would follow that constant down and a sweep
 * cut back to four cards would report success over a smaller space.
 */
const EXHAUSTIVE_HANDS = 402_233;

/** The hands sweep 2 visits: C(18,6) + C(19,7) + C(20,8). Hard-coded, as above. */
const COMPOSITION_HANDS = 194_922;

// ---------------------------------------------------------------------------
// Building hands
// ---------------------------------------------------------------------------

function labelAt(index: number): Rank {
  const label = RANK_LABELS[index];
  if (label === undefined) {
    throw new RangeError(`no rank at index ${String(index)}`);
  }
  return label;
}

function suitAt(index: number): Suit {
  const suit = SUIT_LABELS[index];
  if (suit === undefined) {
    throw new RangeError(`no suit at index ${String(index)}`);
  }
  return suit;
}

/**
 * One card per rank and per position in a hand, built once.
 *
 * The suit varies with both, so no hand in the sweep is single-suited and every
 * hand of four cards or more carries all four suits. Cards are immutable, so
 * one instance can be shared by every hand that needs it; the sweeps below deal
 * several million cards, and building each of them fresh would measure the
 * allocator rather than the evaluator.
 */
const CARD_AT: readonly Card[] = (() => {
  const built: Card[] = [];
  for (let rank = 0; rank < RANK_LABELS.length; rank += 1) {
    for (let position = 0; position < LONGEST_HAND; position += 1) {
      built.push(card(labelAt(rank), suitAt((rank + position) % SUIT_LABELS.length)));
    }
  }
  return built;
})();

function cardFor(rankIndex: number, position: number): Card {
  const found = CARD_AT[rankIndex * LONGEST_HAND + (position % LONGEST_HAND)];
  if (found === undefined) {
    throw new RangeError(`no card for rank ${String(rankIndex)} at ${String(position)}`);
  }
  return found;
}

/** Fill `cards` and `labels` in place from a list of rank indices. */
function materialise(rankIndices: readonly number[], cards: Card[], labels: Rank[]): void {
  cards.length = 0;
  labels.length = 0;
  let position = 0;
  for (const rankIndex of rankIndices) {
    const held = cardFor(rankIndex, position);
    cards.push(held);
    labels.push(held.rank);
    position += 1;
  }
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

interface Ledger {
  /** Compare one hand in one origin against the reference. */
  readonly check: (cards: readonly Card[], labels: readonly Rank[], fromSplit: boolean) => void;
  /** How many hands have been checked. */
  readonly visited: () => number;
  /** The empty string when everything agreed, otherwise a report. */
  readonly summary: () => string;
}

const MAX_REPORTED = 12;

function createLedger(): Ledger {
  let visited = 0;
  let failures = 0;
  const reported: string[] = [];

  function disagree(
    labels: readonly Rank[],
    fromSplit: boolean,
    field: string,
    got: number | boolean,
    want: number | boolean,
  ): void {
    failures += 1;
    if (reported.length < MAX_REPORTED) {
      const origin = fromSplit ? 'split' : 'unsplit';
      reported.push(
        `[${labels.join(' ')}] ${origin}: ${field} is ${String(got)}, reference says ${String(want)}`,
      );
    }
  }

  return {
    check(cards, labels, fromSplit) {
      visited += 1;
      const want = evaluate(labels, { fromSplit });
      const value = handValue(cards);
      if (value.total !== want.total) {
        disagree(labels, fromSplit, 'total', value.total, want.total);
      }
      if (value.soft !== want.soft) {
        disagree(labels, fromSplit, 'soft', value.soft, want.soft);
      }
      const bust = isBust(cards);
      if (bust !== want.bust) {
        disagree(labels, fromSplit, 'bust', bust, want.bust);
      }
      const natural = isNatural(cards, { fromSplit });
      if (natural !== want.natural) {
        disagree(labels, fromSplit, 'natural', natural, want.natural);
      }
    },
    visited: () => visited,
    summary: () => {
      if (failures === 0) {
        return '';
      }
      const head = `${String(failures)} disagreements over ${String(visited)} hands checked`;
      const more = failures - reported.length;
      const tail = more > 0 ? `\n  ... and ${String(more)} more` : '';
      return `${head}:\n  ${reported.join('\n  ')}${tail}`;
    },
  };
}

/** Run one hand through the ledger in both origins. SPEC 4.6. */
function checkBothOrigins(ledger: Ledger, cards: readonly Card[], labels: readonly Rank[]): void {
  ledger.check(cards, labels, false);
  ledger.check(cards, labels, true);
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

/** Every ordered list of `length` rank indices. Order matters here. */
function eachOrdered(length: number, visit: (rankIndices: readonly number[]) => void): void {
  const stack: number[] = [];
  const step = (depth: number): void => {
    if (depth === length) {
      visit(stack);
      return;
    }
    for (let rank = 0; rank < RANK_LABELS.length; rank += 1) {
      stack.push(rank);
      step(depth + 1);
      stack.pop();
    }
  };
  step(0);
}

/** Every composition of `length` cards: non-decreasing, so no order repeats. */
function eachComposition(length: number, visit: (rankIndices: readonly number[]) => void): void {
  const stack: number[] = [];
  const step = (depth: number, from: number): void => {
    if (depth === length) {
      visit(stack);
      return;
    }
    for (let rank = from; rank < RANK_LABELS.length; rank += 1) {
      stack.push(rank);
      step(depth + 1, rank);
      stack.pop();
    }
  };
  step(0, 0);
}

/**
 * A fixed-seed generator, so the sampled hands are the same on every machine
 * and on every run. `Math.random()` would make a failure here unreproducible,
 * which is the reason SPEC 4.1 bans it from the game as well.
 */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('the alphabet the sweep runs over', () => {
  it('is the same 13 ranks the game deals', () => {
    expect([...RANKS]).toEqual([...RANK_LABELS]);
    expect(new Set(RANKS).size).toBe(13);
  });

  it('is the same 4 suits the game deals', () => {
    expect([...SUITS]).toEqual([...SUIT_LABELS]);
    expect(new Set(SUITS).size).toBe(4);
  });

  it('agrees with the reference on which ranks are worth ten', () => {
    for (const label of RANK_LABELS) {
      expect(isTenValue(label)).toBe(isTenValueRank(label));
    }
    expect(RANK_LABELS.filter((label) => isTenValue(label))).toEqual(['10', 'J', 'Q', 'K']);
    expect(RANK_LABELS.filter((label) => isAce(label))).toEqual(['A']);
  });

  it('values an Ace low and a face card at ten', () => {
    expect(pipValue('A')).toBe(1);
    expect(pipValue('J')).toBe(10);
    expect(pipValue('Q')).toBe(10);
    expect(pipValue('K')).toBe(10);
    expect(pipValue('7')).toBe(7);
    expect(TARGET).toBe(21);
  });
});

describe('the card factory', () => {
  it('keeps the rank and suit it was given', () => {
    const held = card('Q', 'hearts');
    expect(held.rank).toBe('Q');
    expect(held.suit).toBe('hearts');
  });

  it('produces 52 distinct cards and no duplicates', () => {
    const seen = new Set<string>();
    for (const rank of RANK_LABELS) {
      for (const suit of SUIT_LABELS) {
        const held = card(rank, suit);
        seen.add(`${held.rank}-${held.suit}`);
      }
    }
    expect(seen.size).toBe(52);
  });

  it('freezes the card, so a shared card cannot be edited in place', () => {
    const held = card('A', 'spades');
    expect(Object.isFrozen(held)).toBe(true);
    const mutable = held as { rank: Rank };
    expect(() => {
      mutable.rank = 'K';
    }).toThrow(TypeError);
    expect(held.rank).toBe('A');
  });
});

describe('B1: every hand against an independently written evaluator', () => {
  it('agrees on every ordered hand of one to five cards', () => {
    const ledger = createLedger();
    const cards: Card[] = [];
    const labels: Rank[] = [];
    for (let length = 1; length <= EXHAUSTIVE_LENGTH; length += 1) {
      eachOrdered(length, (rankIndices) => {
        materialise(rankIndices, cards, labels);
        checkBothOrigins(ledger, cards, labels);
      });
    }
    expect(ledger.summary()).toBe('');
    expect(ledger.visited()).toBe(EXHAUSTIVE_HANDS * 2);
  });

  it('agrees on every composition of six to eight cards', () => {
    const ledger = createLedger();
    const cards: Card[] = [];
    const labels: Rank[] = [];
    for (let length = EXHAUSTIVE_LENGTH + 1; length <= COMPOSITION_LENGTH; length += 1) {
      eachComposition(length, (rankIndices) => {
        materialise(rankIndices, cards, labels);
        checkBothOrigins(ledger, cards, labels);
      });
    }
    expect(ledger.summary()).toBe('');
    expect(ledger.visited()).toBe(COMPOSITION_HANDS * 2);
  });

  it('agrees on every mix of Aces and one other rank, up to 21 cards', () => {
    const ledger = createLedger();
    const cards: Card[] = [];
    const labels: Rank[] = [];
    const ace = RANK_LABELS.indexOf('A');
    for (let other = 0; other < RANK_LABELS.length; other += 1) {
      if (other === ace) {
        continue;
      }
      for (let length = 1; length <= LONGEST_HAND; length += 1) {
        for (let aces = 0; aces <= length; aces += 1) {
          const rankIndices: number[] = [];
          for (let n = 0; n < aces; n += 1) {
            rankIndices.push(ace);
          }
          for (let n = aces; n < length; n += 1) {
            rankIndices.push(other);
          }
          materialise(rankIndices, cards, labels);
          checkBothOrigins(ledger, cards, labels);
        }
      }
    }
    expect(ledger.summary()).toBe('');
    // 12 other ranks x the 252 (length, ace count) pairs up to 21 cards.
    expect(ledger.visited()).toBe(12 * 252 * 2);
  });

  it('agrees on a fixed sample at every length from nine to twenty-one', () => {
    const ledger = createLedger();
    const cards: Card[] = [];
    const labels: Rank[] = [];
    const next = sequence(0x5eed_1a17);
    for (let length = COMPOSITION_LENGTH + 1; length <= LONGEST_HAND; length += 1) {
      for (let sample = 0; sample < SAMPLES_PER_LENGTH; sample += 1) {
        const rankIndices: number[] = [];
        for (let n = 0; n < length; n += 1) {
          rankIndices.push(next() % RANK_LABELS.length);
        }
        materialise(rankIndices, cards, labels);
        checkBothOrigins(ledger, cards, labels);
      }
    }
    expect(ledger.summary()).toBe('');
    expect(ledger.visited()).toBe((LONGEST_HAND - COMPOSITION_LENGTH) * SAMPLES_PER_LENGTH * 2);
  });

  /**
   * Every suit assignment of every two-card and three-card composition, on all
   * four of B1's sub-claims and in both origins.
   *
   * **All four, not just the total.** Natural detection is the sub-claim that
   * most needs this: it is the predicate rungs 2 and 3 of the settlement ladder
   * inherit, and at two cards this covers every natural in all 16 of its
   * ordered suit pairs, single-suited ones included.
   *
   * Exhaustive at two and three cards rather than at five, where the same sweep
   * would be another 4.5 million hands to make a point already made. Between
   * them these two lengths put every rank in every suit in each of the first
   * three places of a hand, and the rank sweep above carries all four suits
   * through every hand longer than three cards.
   */
  it('gives the same answer whatever the suits are', () => {
    const mismatches: string[] = [];
    let compared = 0;

    const verdict = (hand: readonly Card[]): string => {
      const value = handValue(hand);
      const unsplit = isNatural(hand, { fromSplit: false });
      const split = isNatural(hand, { fromSplit: true });
      return [value.total, value.soft, isBust(hand), unsplit, split].join('/');
    };

    for (let length = 2; length <= 3; length += 1) {
      eachComposition(length, (rankIndices) => {
        const ranks = rankIndices.map(labelAt);
        const baseline = verdict(ranks.map((rank) => card(rank, 'clubs')));
        const assignments = SUIT_LABELS.length ** length;
        for (let n = 0; n < assignments; n += 1) {
          let rest = n;
          const hand: Card[] = [];
          for (const rank of ranks) {
            hand.push(card(rank, suitAt(rest % SUIT_LABELS.length)));
            rest = Math.floor(rest / SUIT_LABELS.length);
          }
          compared += 1;
          const got = verdict(hand);
          if (got !== baseline) {
            const dealt = hand.map((held) => `${held.rank} of ${held.suit}`).join(', ');
            mismatches.push(`${dealt}: ${got}, all clubs gives ${baseline}`);
          }
        }
      });
    }
    expect(mismatches).toEqual([]);
    // 91 two-card compositions x 16 suit assignments, plus 455 three-card x 64.
    expect(compared).toBe(91 * 16 + 455 * 64);
  });
});

describe('the add-10-once rule, stated as its own claims', () => {
  function hand(...ranks: readonly Rank[]): Card[] {
    return ranks.map((rank, index) => card(rank, suitAt(index % SUIT_LABELS.length)));
  }

  it('is 0 and hard before the first card', () => {
    expect(handValue([])).toEqual({ total: 0, soft: false });
    expect(isBust([])).toBe(false);
  });

  it('reads a lone Ace as 11', () => {
    expect(handValue(hand('A'))).toEqual({ total: 11, soft: true });
  });

  it('never reads two Aces as 11 at once', () => {
    expect(handValue(hand('A', 'A'))).toEqual({ total: 12, soft: true });
    expect(handValue(hand('A', 'A', 'A'))).toEqual({ total: 13, soft: true });
  });

  it('drops the Ace back to 1 as soon as 11 would bust', () => {
    expect(handValue(hand('A', '9'))).toEqual({ total: 20, soft: true });
    expect(handValue(hand('A', '9', '5'))).toEqual({ total: 15, soft: false });
    expect(handValue(hand('A', '9', '5', 'A'))).toEqual({ total: 16, soft: false });
  });

  it('keeps the Ace at 11 when the total lands on exactly 21', () => {
    expect(handValue(hand('A', '5', '5'))).toEqual({ total: 21, soft: true });
    expect(isBust(hand('A', '5', '5'))).toBe(false);
  });

  it('busts strictly above 21, never at 21', () => {
    expect(isBust(hand('K', 'Q'))).toBe(false);
    expect(isBust(hand('K', 'Q', 'A'))).toBe(false);
    expect(handValue(hand('K', 'Q', 'A')).total).toBe(21);
    expect(isBust(hand('K', 'Q', '2'))).toBe(true);
    expect(handValue(hand('K', 'Q', '2'))).toEqual({ total: 22, soft: false });
  });

  it('reaches 21 on eleven Aces and goes hard on the twelfth', () => {
    const aces = (count: number): Card[] => hand(...Array<Rank>(count).fill('A'));
    expect(handValue(aces(11))).toEqual({ total: 21, soft: true });
    expect(handValue(aces(12))).toEqual({ total: 12, soft: false });
    expect(handValue(aces(LONGEST_HAND))).toEqual({ total: 21, soft: false });
    expect(isBust(aces(LONGEST_HAND))).toBe(false);
  });
});

describe('a natural, and the three things that are not one', () => {
  function hand(...ranks: readonly Rank[]): Card[] {
    return ranks.map((rank, index) => card(rank, suitAt(index % SUIT_LABELS.length)));
  }

  const UNSPLIT = { fromSplit: false } as const;
  const SPLIT = { fromSplit: true } as const;

  it('is an Ace and a ten-value card, in either order and any suit', () => {
    for (const ten of ['10', 'J', 'Q', 'K'] as const) {
      expect(isNatural(hand('A', ten), UNSPLIT)).toBe(true);
      expect(isNatural(hand(ten, 'A'), UNSPLIT)).toBe(true);
    }
    expect(isNatural([card('A', 'spades'), card('K', 'spades')], UNSPLIT)).toBe(true);
  });

  it('is not a two-card 21 on a hand created by a split. SPEC 4.6', () => {
    expect(handValue(hand('A', 'K')).total).toBe(21);
    expect(isNatural(hand('A', 'K'), SPLIT)).toBe(false);
    for (const ten of ['10', 'J', 'Q', 'K'] as const) {
      expect(isNatural(hand('A', ten), SPLIT)).toBe(false);
      expect(isNatural(hand(ten, 'A'), SPLIT)).toBe(false);
    }
  });

  it('is not a 21 reached in three or more cards', () => {
    expect(handValue(hand('7', '7', '7')).total).toBe(21);
    expect(isNatural(hand('7', '7', '7'), UNSPLIT)).toBe(false);
    expect(handValue(hand('A', '5', '5')).total).toBe(21);
    expect(isNatural(hand('A', '5', '5'), UNSPLIT)).toBe(false);
    expect(isNatural(hand('A', 'K', 'K'), UNSPLIT)).toBe(false);
  });

  it('is not any other two-card hand, and no two-card 21 is anything else', () => {
    let naturals = 0;
    let twentyOnes = 0;
    for (const first of RANK_LABELS) {
      for (const second of RANK_LABELS) {
        const two = hand(first, second);
        const natural = isNatural(two, UNSPLIT);
        if (natural) {
          naturals += 1;
        }
        if (handValue(two).total === TARGET) {
          twentyOnes += 1;
          expect(natural).toBe(true);
        }
      }
    }
    // A with each of 10, J, Q and K, and each of those with A: 8 ordered pairs.
    expect(naturals).toBe(8);
    expect(twentyOnes).toBe(8);
  });

  it('is never true before two cards or after them', () => {
    expect(isNatural([], UNSPLIT)).toBe(false);
    expect(isNatural(hand('A'), UNSPLIT)).toBe(false);
    expect(isNatural(hand('A', 'K', '10', 'J'), UNSPLIT)).toBe(false);
  });
});

describe('the pair test of SPEC 4.6', () => {
  function hand(...ranks: readonly Rank[]): Card[] {
    return ranks.map((rank, index) => card(rank, suitAt(index % SUIT_LABELS.length)));
  }

  /** The split value of a rank, read here as 11 for an Ace rather than 1. */
  function splitValue(label: Rank): number {
    if (label === 'A') {
      return 11;
    }
    return isTenValueRank(label) ? 10 : Number(label);
  }

  it('pairs by value on every one of the 169 ordered rank pairs', () => {
    let pairs = 0;
    for (const first of RANK_LABELS) {
      for (const second of RANK_LABELS) {
        const want = splitValue(first) === splitValue(second);
        expect(canSplit(hand(first, second), 'equalValue')).toBe(want);
        pairs += 1;
      }
    }
    expect(pairs).toBe(169);
  });

  it('pairs by rank on every one of the 169 ordered rank pairs', () => {
    for (const first of RANK_LABELS) {
      for (const second of RANK_LABELS) {
        expect(canSplit(hand(first, second), 'equalRank')).toBe(first === second);
      }
    }
  });

  it('splits any two ten-value cards by value and only matching ones by rank', () => {
    expect(canSplit(hand('K', 'J'), 'equalValue')).toBe(true);
    expect(canSplit(hand('K', 'J'), 'equalRank')).toBe(false);
    expect(canSplit(hand('10', 'Q'), 'equalValue')).toBe(true);
    expect(canSplit(hand('10', 'Q'), 'equalRank')).toBe(false);
    expect(canSplit(hand('K', 'K'), 'equalRank')).toBe(true);
  });

  it('pairs an Ace only with an Ace, under either reading of the Ace', () => {
    for (const other of RANK_LABELS) {
      const want = other === 'A';
      expect(canSplit(hand('A', other), 'equalValue')).toBe(want);
      expect(canSplit(hand('A', other), 'equalRank')).toBe(want);
    }
  });

  it('is false for any hand that is not exactly two cards', () => {
    const rules: readonly SplitRule[] = ['equalValue', 'equalRank'];
    for (const rule of rules) {
      expect(canSplit([], rule)).toBe(false);
      expect(canSplit(hand('8'), rule)).toBe(false);
      expect(canSplit(hand('8', '8', '8'), rule)).toBe(false);
      expect(canSplit(hand('8', '8', '8', '8'), rule)).toBe(false);
    }
  });
});
