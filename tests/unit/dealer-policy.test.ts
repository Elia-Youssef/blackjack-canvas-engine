/**
 * Item B8, severity Critical, 13 points.
 *
 *   "The dealer hits below 17 and stands on 17 or higher including soft 17,
 *    with no special case in the policy."
 *
 * SPEC 4.9. Two claims in one sentence, and the second is the one that needs the
 * work: "no special case" is a claim about what the policy does *not* contain,
 * and no assertion about a correct answer can see the absence of a branch. So
 * the forbidden branch is written out in this file and run beside the shipped
 * policy over the same sweep, and the two are required to disagree on **exactly
 * the soft 17 hands and nowhere else**. That pins both halves at once: the
 * shipped policy stands on soft 17, and it differs from the hit-soft-17 variant
 * in that one place only, which is what "no special case" means when it is true.
 *
 * **The expected values come from outside the code under test.** Totals are the
 * second implementation in `tests/unit/reference/hand-evaluator.ts`, which
 * imports nothing from `src/` and really searches every reading of the Aces
 * rather than using the add-10-once shortcut `hand.ts` ships, and the threshold
 * is written out here from SPEC 4.9 rather than imported from the module under
 * test. A policy checked against a total the policy itself produced would agree
 * with its own misreading forever. That evaluator is pinned in turn by a block
 * of totals worked out by hand below, so its use here does not rest on another
 * file's tests.
 *
 * What is swept:
 *
 *   1. **Every composition of two to five cards**, 8,554 of them, checked
 *      against the search and against the control. Compositions rather than
 *      orderings because a total does not depend on the order the cards
 *      arrived in, which is a claim rather than an assumption and is checked
 *      separately over every ordered hand of two and three cards.
 *   2. **Every dealer-reachable hand, exhaustively**, by walking the policy
 *      itself: start from every two-card hand, extend by every rank while the
 *      policy says hit, and stop where it says stand. This is the sweep that
 *      reaches past five cards, and it derives rather than quotes the two
 *      numbers that bound the dealer's turn: the highest total the dealer can
 *      finish on, and the longest hand it can finish with.
 *   3. **Every mix of Aces and one other rank up to 21 cards**, the family the
 *      soft-to-hard transition lives in and the one a length-bounded sweep
 *      covers worst.
 *   4. Suits, and card order, each shown to change nothing.
 *
 * Plus the boundary cases named one at a time, with their totals written out.
 *
 * **Scope.** This is the policy alone. The dealer's turn, its pacing, the reveal
 * of the hole card and SPEC 4.9's rule that the dealer draws only when a hand is
 * in contention are the state machine's at `BJ-7`, and none of them is closed
 * here. So is the fact that the dealer never draws at all on a natural, which
 * the peek settles first.
 */

import { describe, expect, it } from 'vitest';

import type { Card } from '../../src/core/cards';
import { RANKS, SUITS, card } from '../../src/core/cards';
import { STANDS_AT, shouldHit } from '../../src/core/dealer';

import type { ReferenceOrigin } from './reference/hand-evaluator';
import { evaluate } from './reference/hand-evaluator';

// ---------------------------------------------------------------------------
// The alphabet and the rule, carried here rather than taken from the code
// ---------------------------------------------------------------------------

/**
 * The 13 rank labels, written out.
 *
 * Deliberately not `RANKS`, on the reasoning `hand-value.test.ts` gives: a sweep
 * that took its alphabet from the module it checks would shrink to match a rank
 * gone missing and still pass. The first test compares the two lists, which is
 * the one place that comparison proves something.
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

type RankLabel = (typeof RANK_LABELS)[number];

const SUIT_LABELS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;

/** SPEC 4.9: "hit while the hand value is below 17". Written out, not imported. */
const STANDS_ON = 17;

/** SPEC 4.2: the highest total that has not bust. */
const LIMIT = 21;

/** The compositions of two to five cards: 91 + 455 + 1,820 + 6,188. */
const COMPOSITION_HANDS = 8_554;

/**
 * Soft 17 hands among those compositions, and the whole reason the control has
 * something to catch. Nine of them, and they can be listed by hand: a soft 17
 * is a hand holding an Ace whose cards total 7 with every Ace read as 1, so no
 * ten-value card can be in it, and the count is the number of ways to write 7
 * as an unordered sum of parts from 1 to 7 that includes a 1 and uses at most
 * five parts.
 *
 *   A-6, A-A-5, A-2-4, A-3-3, A-A-A-4, A-A-2-3, A-2-2-2, A-A-A-A-3, A-A-A-2-2
 */
const SOFT_17_COMPOSITIONS = 9;

/**
 * The highest total the dealer can finish on, and the longest hand it can hold.
 * Both are asserted against the reachability walk rather than quoted at it.
 *
 * **26.** The dealer draws only at 16 or less and the largest card is worth 10,
 * so no finished hand exceeds 26, and 10-6-10 reaches it.
 *
 * **12 cards.** Every card adds at least 1 to the total read with Aces low, so
 * length is bought with Aces. A hand holding an Ace and totalling 7 to 11 low is
 * soft 17 to soft 21 and has already finished, so the run of Aces has to stop at
 * six and jump the gap in one card of 6 or more. Six Aces is soft 16, a 6 makes
 * it hard 12, and four more Aces bring it to hard 16, which draws once more:
 * 6 + 1 + 4 + 1 is 12. Without an Ace the floor per card is 2, and eight 2s is
 * hard 16, which finishes at nine.
 */
const HIGHEST_FINISHED_TOTAL = 26;
const LONGEST_DEALER_HAND = 12;

/**
 * How many distinct hands the dealer can hold, as the walk finds them.
 *
 * Unlike the two figures above this one is not derived by hand: it is the size
 * of the reachable space, pinned so that a policy which drew one card more or
 * one card less has to come back through this line and say so. The two bounds
 * it sits beside are the claims; this is a fingerprint.
 */
const REACHABLE_HANDS = 6_142;

// ---------------------------------------------------------------------------
// The totals, from the second implementation, and the two policies over them
// ---------------------------------------------------------------------------

/** A total and whether an Ace is read as 11 to reach it. */
interface Reading {
  readonly total: number;
  readonly soft: boolean;
}

/**
 * The dealer holds one hand all round, so no total here is a split hand's.
 * `evaluate` asks for the origin because SPEC 4.6 makes a natural depend on it;
 * nothing in `B8` reads that flag.
 */
const UNSPLIT: ReferenceOrigin = { fromSplit: false };

/**
 * A hand's value, from `tests/unit/reference/hand-evaluator.ts`.
 *
 * That file is this project's second implementation of SPEC 4.2: it imports
 * nothing from `src/`, derives rank values from the label rather than a table,
 * and **searches** every reading of the Aces where `hand.ts` adds 10 at most
 * once. Writing a third copy of the same search in this file would be a second
 * place for the same misreading to live; the block of hand-worked totals below
 * is what stops the shared one being trusted blindly here.
 *
 * Narrowed to the two fields this file uses, so the pin block can compare a
 * whole value rather than picking fields out of it.
 */
function value(labels: readonly RankLabel[]): Reading {
  const evaluated = evaluate(labels, UNSPLIT);
  return { total: evaluated.total, soft: evaluated.soft };
}

/**
 * SPEC 4.9 as this file reads it: hit while the value is below 17.
 *
 * One comparison, and no clause about softness, which is the point: a soft 17
 * is a 17 by the time the value has been taken. It answers "does the dealer
 * take another card", so a `true` here is a hit under the stand-on-17 rule.
 */
function s17SaysHit(labels: readonly RankLabel[]): boolean {
  return value(labels).total < STANDS_ON;
}

/**
 * The negative control: the hit-soft-17 house rule SPEC 4.9 names and rejects.
 *
 * Identical to the policy above except on a soft 17, which is exactly the claim
 * being made. It is run over every hand the shipped policy is run over, and the
 * two are required to differ on the soft 17 hands and to agree everywhere else.
 * Without it, a policy that hit soft 17 would fail only the handful of tests
 * that happened to name one.
 */
function hitsSoft17(labels: readonly RankLabel[]): boolean {
  const reading = value(labels);
  return reading.total < STANDS_ON || (reading.soft && reading.total === STANDS_ON);
}

// ---------------------------------------------------------------------------
// Building hands
// ---------------------------------------------------------------------------

function labelAt(index: number): RankLabel {
  const label = RANK_LABELS[index];
  if (label === undefined) {
    throw new RangeError(`no rank at index ${String(index)}`);
  }
  return label;
}

function suitAt(index: number): (typeof SUIT_LABELS)[number] {
  const suit = SUIT_LABELS[index];
  if (suit === undefined) {
    throw new RangeError(`no suit at index ${String(index)}`);
  }
  return suit;
}

/** Cards for a list of labels, with the suit varying so no hand is one suit. */
function hand(labels: readonly RankLabel[]): Card[] {
  return labels.map((label, index) => card(label, suitAt(index % SUIT_LABELS.length)));
}

/** Every composition of `length` cards: non-decreasing, so no order repeats. */
function eachComposition(length: number, visit: (labels: readonly RankLabel[]) => void): void {
  const stack: RankLabel[] = [];
  const step = (depth: number, from: number): void => {
    if (depth === length) {
      visit(stack);
      return;
    }
    for (let rank = from; rank < RANK_LABELS.length; rank += 1) {
      stack.push(labelAt(rank));
      step(depth + 1, rank);
      stack.pop();
    }
  };
  step(0, 0);
}

/** Every ordered hand of `length` cards. */
function eachOrdered(length: number, visit: (labels: readonly RankLabel[]) => void): void {
  const stack: RankLabel[] = [];
  const step = (depth: number): void => {
    if (depth === length) {
      visit(stack);
      return;
    }
    for (let rank = 0; rank < RANK_LABELS.length; rank += 1) {
      stack.push(labelAt(rank));
      step(depth + 1);
      stack.pop();
    }
  };
  step(0);
}

// ---------------------------------------------------------------------------
// The ledger: the policy, and the control, over the same hands
// ---------------------------------------------------------------------------

const MAX_REPORTED = 12;

interface Ledger {
  /** Check one hand against the search and against the control. */
  readonly check: (labels: readonly RankLabel[]) => void;
  readonly visited: () => number;
  readonly softSeventeens: () => number;
  readonly disagreements: () => number;
  /** The empty string when everything agreed, otherwise a report. */
  readonly summary: () => string;
}

function createLedger(): Ledger {
  let visited = 0;
  let softSeventeens = 0;
  let disagreements = 0;
  let failures = 0;
  const reported: string[] = [];

  function note(labels: readonly RankLabel[], complaint: string): void {
    failures += 1;
    if (reported.length < MAX_REPORTED) {
      reported.push(`[${labels.join(' ')}] ${complaint}`);
    }
  }

  return {
    check(labels) {
      visited += 1;
      const reading = value(labels);
      const hits = shouldHit(hand(labels));
      const wanted = s17SaysHit(labels);
      if (hits !== wanted) {
        const totalled = `${String(reading.total)}${reading.soft ? ' soft' : ' hard'}`;
        note(labels, `${totalled}: policy says ${hits ? 'hit' : 'stand'}, SPEC 4.9 says the other`);
      }

      // The control. A disagreement is allowed on a soft 17 and nowhere else,
      // and is required on every one of them.
      const soft17 = reading.soft && reading.total === STANDS_ON;
      if (soft17) {
        softSeventeens += 1;
      }
      const differs = hits !== hitsSoft17(labels);
      if (differs) {
        disagreements += 1;
      }
      if (differs !== soft17) {
        note(
          labels,
          soft17
            ? 'is a soft 17 and the hit-soft-17 control agreed with the policy on it'
            : 'is not a soft 17 and the hit-soft-17 control disagreed with the policy on it',
        );
      }
    },
    visited: () => visited,
    softSeventeens: () => softSeventeens,
    disagreements: () => disagreements,
    summary: () => {
      if (failures === 0) {
        return '';
      }
      const head = `${String(failures)} failures over ${String(visited)} hands checked`;
      const more = failures - reported.length;
      const tail = more > 0 ? `\n  ... and ${String(more)} more` : '';
      return `${head}:\n  ${reported.join('\n  ')}${tail}`;
    },
  };
}

// ---------------------------------------------------------------------------
// The reachability walk
// ---------------------------------------------------------------------------

interface Reachable {
  /** Every hand the dealer can hold, canonical and deduplicated. */
  readonly visited: number;
  /** Hands the policy finishes on, by total. */
  readonly finishedTotals: Set<number>;
  /** Finished hands whose total is reached with an Ace read as 11. */
  readonly finishedSoftTotals: Set<number>;
  readonly longest: number;
  readonly longestHand: readonly RankLabel[];
  readonly highestTotal: number;
  readonly lowestFinishedTotal: number;
  /** Hands where the policy and this file's reading of SPEC 4.9 differ. */
  readonly mismatches: string[];
}

/**
 * Every hand the dealer can actually be holding, walked from the policy itself.
 *
 * Start at every two-card hand, and extend by every rank for as long as the
 * policy says hit. Hands are canonicalised as non-decreasing rank lists, so two
 * orders of the same cards are walked once; order changes no total, and the
 * ordered sweep below is what proves that rather than assuming it.
 *
 * The walk terminates because every card adds at least 1 to the total read with
 * Aces low and no hand is extended past 16.
 */
function walkReachableHands(): Reachable {
  const seen = new Set<string>();
  const finishedTotals = new Set<number>();
  const finishedSoftTotals = new Set<number>();
  const mismatches: string[] = [];
  let visited = 0;
  let longest = 0;
  let longestHand: readonly RankLabel[] = [];
  let highestTotal = 0;
  let lowestFinishedTotal = Number.POSITIVE_INFINITY;

  const pending: RankLabel[][] = [];

  /** Queue a hand unless it has been walked already. */
  function offer(labels: readonly RankLabel[]): void {
    const key = labels.join(' ');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    pending.push([...labels]);
  }

  eachComposition(2, offer);

  while (pending.length > 0) {
    const labels = pending.pop();
    if (labels === undefined) {
      throw new RangeError('the walk lost a hand it had queued');
    }
    const key = labels.join(' ');
    visited += 1;

    const reading = value(labels);
    const hits = shouldHit(hand(labels));
    if (hits !== s17SaysHit(labels)) {
      mismatches.push(`[${key}] at ${String(reading.total)}: policy says ${String(hits)}`);
    }
    if (reading.total > highestTotal) {
      highestTotal = reading.total;
    }
    if (labels.length > longest) {
      longest = labels.length;
      longestHand = [...labels];
    }

    if (!hits) {
      finishedTotals.add(reading.total);
      if (reading.soft) {
        finishedSoftTotals.add(reading.total);
      }
      if (reading.total < lowestFinishedTotal) {
        lowestFinishedTotal = reading.total;
      }
      continue;
    }

    for (let rank = 0; rank < RANK_LABELS.length; rank += 1) {
      const grown = [...labels, labelAt(rank)];
      grown.sort((left, right) => RANK_LABELS.indexOf(left) - RANK_LABELS.indexOf(right));
      offer(grown);
    }
  }

  return {
    visited,
    finishedTotals,
    finishedSoftTotals,
    longest,
    longestHand,
    highestTotal,
    lowestFinishedTotal,
    mismatches,
  };
}

/** A sorted list from a set, for comparing against a range. */
function sorted(values: Set<number>): number[] {
  return [...values].sort((left, right) => left - right);
}

/** Every integer from `from` to `to`, inclusive. */
function range(from: number, to: number): number[] {
  const built: number[] = [];
  for (let n = from; n <= to; n += 1) {
    built.push(n);
  }
  return built;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('the alphabet and the threshold this file checks against', () => {
  it('is the same 13 ranks the game deals', () => {
    expect([...RANKS]).toEqual([...RANK_LABELS]);
    expect(new Set(RANKS).size).toBe(13);
  });

  it('is the same 4 suits the game deals', () => {
    expect([...SUITS]).toEqual([...SUIT_LABELS]);
  });

  it('stands on the 17 SPEC 4.9 prints on the felt', () => {
    expect(STANDS_AT).toBe(STANDS_ON);
    expect(STANDS_ON).toBe(17);
  });
});

/**
 * The reference evaluator, pinned inside this file's use of it.
 *
 * Every expected verdict below rests on these totals, so they are worked out by
 * hand and written down rather than taken from any implementation: a shared
 * second implementation is only worth having while something independent still
 * checks it, and `B1`'s sweep proving it agrees with `hand.ts` is the wrong kind
 * of check to lean on here, since agreement is exactly what would survive a
 * misreading held in common. The list walks the boundary this part turns on:
 * the soft 17s in four shapes, a soft 17 gone hard, hard 16 and hard 17, and
 * two bust hands.
 */
describe('the totals this file checks against, pinned by hand', () => {
  const totals: readonly [readonly RankLabel[], number, boolean][] = [
    [['A'], 11, true],
    [['A', '5'], 16, true],
    [['A', '6'], 17, true],
    [['A', '7'], 18, true],
    [['A', '10'], 21, true],
    [['A', 'A'], 12, true],
    [['A', 'A', '5'], 17, true],
    [['A', '2', '4'], 17, true],
    [['A', 'A', 'A', '4'], 17, true],
    [['A', '6', '10'], 17, false],
    [['10', '6'], 16, false],
    [['10', '7'], 17, false],
    [['K', '7'], 17, false],
    [['10', '10'], 20, false],
    [['10', '6', '10'], 26, false],
    [['10', '10', '2'], 22, false],
    [['2', '2', '2', '2', '2', '2', '2', '2'], 16, false],
  ];

  for (const [labels, total, soft] of totals) {
    it(`reads ${labels.join('-')} as ${String(total)}${soft ? ' soft' : ' hard'}`, () => {
      expect(value(labels)).toEqual({ total, soft });
    });
  }

  it('reads a hand of Aces the way a search does, not the way a table would', () => {
    // Eleven Aces is exactly 21 with one of them read high; the twelfth cannot
    // be adjusted at all. A search and the shipped shortcut agree here, and B1
    // is where that agreement is proved over every hand.
    expect(value(Array<RankLabel>(11).fill('A'))).toEqual({ total: 21, soft: true });
    expect(value(Array<RankLabel>(12).fill('A'))).toEqual({ total: 12, soft: false });
  });
});

describe('B8: the policy over every composition of two to five cards', () => {
  const ledger = createLedger();
  const pairHard = new Set<number>();
  const pairSoft = new Set<number>();
  const manyHard = new Set<number>();
  const manySoft = new Set<number>();

  for (let length = 2; length <= 5; length += 1) {
    eachComposition(length, (labels) => {
      ledger.check(labels);
      const reading = value(labels);
      const hard = length === 2 ? pairHard : manyHard;
      const soft = length === 2 ? pairSoft : manySoft;
      (reading.soft ? soft : hard).add(reading.total);
    });
  }

  it('hits below 17 and stands at 17 or above on every one of them', () => {
    expect(ledger.summary()).toBe('');
    expect(ledger.visited()).toBe(COMPOSITION_HANDS);
  });

  it('differs from the hit-soft-17 variant on the nine soft 17s and nowhere else', () => {
    expect(ledger.softSeventeens()).toBe(SOFT_17_COMPOSITIONS);
    expect(ledger.disagreements()).toBe(SOFT_17_COMPOSITIONS);
    expect(ledger.summary()).toBe('');
  });

  /**
   * The sweep is stated by total as well as by hand, because B8 is a claim
   * about totals: every hard total from the lowest two cards can make to the
   * highest a dealer can reach, and every soft total there is, in a two-card
   * form and in a longer one.
   *
   * The three gaps are impossibilities rather than omissions. Hard 4 and hard 5
   * cannot be made in three cards, because three cards with no usable Ace start
   * at 2-2-2, and any hand holding an Ace at that total is reading it as 11.
   * Soft 12 cannot be made in three, because the only soft 12 is A-A. And no
   * two-card hand is hard 21 or more, since the highest two cards are 10-10.
   */
  it('covers every hard total to 26 and every soft total, in both forms', () => {
    expect(sorted(pairHard)).toEqual(range(4, 20));
    expect(sorted(pairSoft)).toEqual(range(12, 21));

    for (const total of range(6, HIGHEST_FINISHED_TOTAL)) {
      expect(manyHard.has(total)).toBe(true);
    }
    expect(manyHard.has(4)).toBe(false);
    expect(manyHard.has(5)).toBe(false);

    expect(sorted(manySoft)).toEqual(range(13, 21));
    expect(manySoft.has(12)).toBe(false);
  });
});

describe('B8: every hand the dealer can reach, walked from the policy', () => {
  const walk = walkReachableHands();

  it('agrees with SPEC 4.9 on every reachable hand', () => {
    expect(walk.mismatches).toEqual([]);
    expect(walk.visited).toBe(REACHABLE_HANDS);
  });

  it('finishes on 17 through 26 and never above 26', () => {
    expect(sorted(walk.finishedTotals)).toEqual(range(STANDS_ON, HIGHEST_FINISHED_TOTAL));
    expect(walk.lowestFinishedTotal).toBe(STANDS_ON);
    expect(walk.highestTotal).toBe(HIGHEST_FINISHED_TOTAL);
  });

  it('finishes soft on 17 through 21, so soft 17 really does stand', () => {
    expect(sorted(walk.finishedSoftTotals)).toEqual(range(STANDS_ON, LIMIT));
  });

  it('holds at most twelve cards', () => {
    expect(walk.longest).toBe(LONGEST_DEALER_HAND);
    expect(walk.longestHand.length).toBe(LONGEST_DEALER_HAND);
  });

  /**
   * The hand the derivation above builds, played out in dealt order rather than
   * in the walk's canonical one: six Aces to soft 16, a 6 to jump the soft 17
   * to soft 21 band in one card, then Aces to hard 16. Eleven cards, every one
   * of which the policy asks for, and a twelfth that ends it whatever it is.
   */
  it('plays the longest hand out card by card', () => {
    const dealt: readonly RankLabel[] = ['A', 'A', 'A', 'A', 'A', 'A', '6', 'A', 'A', 'A', 'A'];
    expect(dealt.length).toBe(LONGEST_DEALER_HAND - 1);
    for (let held = 2; held <= dealt.length; held += 1) {
      expect(shouldHit(hand(dealt.slice(0, held)))).toBe(true);
    }
    for (const label of RANK_LABELS) {
      expect(shouldHit(hand([...dealt, label]))).toBe(false);
    }
  });
});

describe('B8: Aces mixed with one other rank, up to 21 cards', () => {
  it('hits and stands correctly over every one of them', () => {
    const ledger = createLedger();
    for (const other of RANK_LABELS) {
      if (other === 'A') {
        continue;
      }
      for (let length = 1; length <= 21; length += 1) {
        for (let aces = 0; aces <= length; aces += 1) {
          const labels: RankLabel[] = [];
          for (let n = 0; n < aces; n += 1) {
            labels.push('A');
          }
          for (let n = aces; n < length; n += 1) {
            labels.push(other);
          }
          ledger.check(labels);
        }
      }
    }
    expect(ledger.summary()).toBe('');
    // 12 other ranks x the 252 (length, Ace count) pairs up to 21 cards.
    expect(ledger.visited()).toBe(12 * 252);
  });

  it('hits a hand of Aces until the seventh, which is soft 17', () => {
    const aces = (count: number): Card[] => hand(Array<RankLabel>(count).fill('A'));
    expect(shouldHit(aces(1))).toBe(true);
    expect(shouldHit(aces(6))).toBe(true);
    expect(shouldHit(aces(7))).toBe(false);
    expect(value(Array<RankLabel>(6).fill('A'))).toEqual({ total: 16, soft: true });
    expect(value(Array<RankLabel>(7).fill('A'))).toEqual({ total: 17, soft: true });
  });
});

describe('B8: the boundary cases, one at a time', () => {
  function hits(...labels: readonly RankLabel[]): boolean {
    return shouldHit(hand(labels));
  }

  it('hits hard 16', () => {
    expect(hits('10', '6')).toBe(true);
    expect(hits('9', '7')).toBe(true);
    expect(hits('K', '4', '2')).toBe(true);
    expect(hits('7', '5', '4')).toBe(true);
  });

  it('stands on hard 17', () => {
    expect(hits('10', '7')).toBe(false);
    expect(hits('9', '8')).toBe(false);
    expect(hits('K', '7')).toBe(false);
    expect(hits('10', '4', '3')).toBe(false);
  });

  it('hits soft 16', () => {
    expect(hits('A', '5')).toBe(true);
    expect(hits('A', '2', '3')).toBe(true);
    expect(hits('A', 'A', '4')).toBe(true);
  });

  /** The one this part exists for. SPEC 4.9: soft 17 stands. */
  it('stands on soft 17, in every shape a soft 17 comes in', () => {
    expect(hits('A', '6')).toBe(false);
    expect(hits('A', '2', '4')).toBe(false);
    expect(hits('A', '3', '3')).toBe(false);
    expect(hits('A', 'A', '5')).toBe(false);
    expect(hits('A', 'A', 'A', '4')).toBe(false);
    expect(hits('A', 'A', '2', '3')).toBe(false);
    expect(hits('A', '2', '2', '2')).toBe(false);
    expect(hits('A', 'A', 'A', 'A', '3')).toBe(false);
    expect(hits('A', 'A', 'A', '2', '2')).toBe(false);
  });

  it('stands on soft 18 and above', () => {
    expect(hits('A', '7')).toBe(false);
    expect(hits('A', 'A', '6')).toBe(false);
    expect(hits('A', '9')).toBe(false);
    expect(hits('A', '10')).toBe(false);
  });

  /** A soft 17 that has gone hard is still a 17, and still stands. */
  it('stands on A-6-10, which is 17 with the Ace back at one', () => {
    expect(value(['A', '6', '10'])).toEqual({ total: 17, soft: false });
    expect(hits('A', '6', '10')).toBe(false);
    expect(hits('A', '6', 'K')).toBe(false);
  });

  /**
   * A hand over 21 has finished. The policy answers "stand" without a bust
   * clause, because a bust total is above 21 and so above 17: a policy that
   * said "hit" here would deal a card to a hand that is already out.
   */
  it('never draws to a hand that has already bust', () => {
    expect(hits('10', '6', '10')).toBe(false);
    expect(hits('10', '10', '2')).toBe(false);
    expect(hits('K', 'Q', 'J')).toBe(false);
    expect(hits('10', '10', '10', '10', '10')).toBe(false);
  });

  /**
   * Not a state the dealer's turn reaches, and answered by the same comparison
   * anyway. A dealer holding no cards or one card is mid-deal, and SPEC 4.3 is
   * what puts the next card there rather than the policy.
   */
  it('answers a hand that is still being dealt without a special case', () => {
    expect(shouldHit([])).toBe(true);
    expect(hits('A')).toBe(true);
    expect(hits('10')).toBe(true);
  });
});

describe('B8: the policy reads ranks, and nothing else', () => {
  it('gives the same answer whatever the suits are', () => {
    const mismatches: string[] = [];
    let compared = 0;

    for (let length = 2; length <= 3; length += 1) {
      eachComposition(length, (labels) => {
        const baseline = shouldHit(labels.map((label) => card(label, 'clubs')));
        const assignments = SUIT_LABELS.length ** length;
        for (let n = 0; n < assignments; n += 1) {
          let rest = n;
          const cards: Card[] = [];
          for (const label of labels) {
            cards.push(card(label, suitAt(rest % SUIT_LABELS.length)));
            rest = Math.floor(rest / SUIT_LABELS.length);
          }
          compared += 1;
          if (shouldHit(cards) !== baseline) {
            const dealt = cards.map((held) => `${held.rank} of ${held.suit}`).join(', ');
            mismatches.push(`${dealt}: differs from the same ranks in clubs`);
          }
        }
      });
    }
    expect(mismatches).toEqual([]);
    // 91 two-card compositions x 16 suit assignments, plus 455 three-card x 64.
    expect(compared).toBe(91 * 16 + 455 * 64);
  });

  it('gives the same answer whatever order the cards arrived in', () => {
    const ledger = createLedger();
    for (let length = 2; length <= 3; length += 1) {
      eachOrdered(length, (labels) => {
        ledger.check(labels);
      });
    }
    expect(ledger.summary()).toBe('');
    expect(ledger.visited()).toBe(13 ** 2 + 13 ** 3);
  });
});
