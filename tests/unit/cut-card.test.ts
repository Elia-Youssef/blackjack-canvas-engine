/**
 * Item B3, severity Major, 11 points.
 *
 *   "The cut card is placed leaving 25 to 40 percent of the shoe undealt, and
 *    the reshuffle occurs after the round in which it is reached completes, not
 *    during it. A round never exhausts the cards behind the cut card: 72
 *    worst-case against 78 available on 6 decks, 80 against 104 on 8 decks."
 *
 * Three claims. The first two are behaviour and are driven through the shoe.
 * The third is arithmetic, and SPEC 4.1 gives it as a table of results rather
 * than as a rule, so this file **re-derives every number in that table** and
 * asserts the results:
 *
 *   - 146, the most value one round can consume, from four hands at 30 and a
 *     dealer at 26. SPEC 4.1 gives the three constants and the product.
 *   - 72 and 80, the most cards 146 in value can buy out of a 6-deck and an
 *     8-deck composition, by taking the cheapest cards the shoe holds until one
 *     more would pass the budget.
 *   - 78 and 104, the fewest cards the cut card can leave behind it, from 25
 *     percent of 312 and of 416.
 *   - 6 and 24, what is left over, which is the margin the claim rests on.
 *
 * Nothing in that chain is imported from `src/`. The percentages, the deck
 * counts, the 13 ranks and their values are all written out here, so a shoe
 * that quietly changed any of them fails rather than moves the goalposts. The
 * one thing this file does read from the shoe is `cutCardRange`, and it reads
 * it only to require that the shoe agrees with the derivation.
 *
 * The 25-to-40-percent claim is checked over 2,000 seeded shoes at each size
 * rather than over one, because a single shoe cannot show where the window is,
 * only that one position falls inside it.
 */

import { describe, expect, it } from 'vitest';

import type { Card } from '../../src/core/cards';
import { createRng } from '../../src/core/rng';
import type { DeckCount, Shoe } from '../../src/core/shoe';
import { createShoe, cutCardRange } from '../../src/core/shoe';

// ---------------------------------------------------------------------------
// SPEC 4.1 and 4.2, written out rather than imported
// ---------------------------------------------------------------------------

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

/** SPEC 4.1: 6 decks by default, configurable to 6 or 8, and no other size. */
const CONFIGURED_DECKS = [6, 8] as const;

/** SPEC 4.1: the cut card leaves between 25 and 40 percent of the shoe undealt. */
const MIN_UNDEALT_PERCENT = 25;
const MAX_UNDEALT_PERCENT = 40;

/** SPEC 4.6: three splits, so a round has at most four player hands. */
const MAX_HANDS = 4;

/**
 * SPEC 4.1: a player hand including its busting card totals at most 30.
 *
 * A hand can only take a card at 20 or less, and the largest card is worth 10.
 */
const MAX_PLAYER_VALUE = 30;

/**
 * SPEC 4.1 and 4.9: the dealer totals at most 26.
 *
 * The dealer draws below 17, so the last card lands on 16 at most.
 */
const MAX_DEALER_VALUE = 26;

/** SPEC 4.1: `4 x 30 + 26`. Asserted below to be the 146 the section states. */
const MAX_ROUND_VALUE = MAX_HANDS * MAX_PLAYER_VALUE + MAX_DEALER_VALUE;

/** Shoes built at each size when the question is where the window is. */
const SHOE_SAMPLES = 2000;

// ---------------------------------------------------------------------------
// The derivations
// ---------------------------------------------------------------------------

/** SPEC 4.2, read off the label so this file shares no table with the code. */
function pipOf(label: string): number {
  if (label === 'A') {
    return 1;
  }
  if (label === 'J' || label === 'Q' || label === 'K') {
    return 10;
  }
  return Number(label);
}

/** The full complement of a shoe: 13 ranks, 4 suits, `decks` times over. */
function complementOf(decks: number): number {
  return RANK_LABELS.length * SUIT_LABELS.length * decks;
}

/** Every card the shoe holds, as pip values, cheapest first. */
function pipsAscending(decks: number): number[] {
  const pips: number[] = [];
  for (const rank of RANK_LABELS) {
    const copies = SUIT_LABELS.length * decks;
    for (let copy = 0; copy < copies; copy += 1) {
      pips.push(pipOf(rank));
    }
  }
  return pips.sort((left, right) => left - right);
}

/**
 * The most cards a round bounded by `budget` in value can consume.
 *
 * Cheapest first, because that is what buys the most cards per point of value,
 * and stopping at the first card that would pass the budget is sufficient: the
 * list is ascending, so nothing after it fits either.
 */
function worstCaseCards(decks: number, budget: number): number {
  let spent = 0;
  let cards = 0;
  for (const pip of pipsAscending(decks)) {
    if (spent + pip > budget) {
      break;
    }
    spent += pip;
    cards += 1;
  }
  return cards;
}

/** The fewest cards the cut card may leave behind it: 25 percent, rounded up. */
function minBehindCut(decks: number): number {
  return Math.ceil((complementOf(decks) * MIN_UNDEALT_PERCENT) / 100);
}

/** The most: 40 percent, rounded down. */
function maxBehindCut(decks: number): number {
  return Math.floor((complementOf(decks) * MAX_UNDEALT_PERCENT) / 100);
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

const sampled = new Map<number, readonly number[]>();

/** Where the cut card landed in `SHOE_SAMPLES` seeded shoes of one size. */
function positionsFor(decks: DeckCount): readonly number[] {
  const already = sampled.get(decks);
  if (already !== undefined) {
    return already;
  }
  const positions: number[] = [];
  for (let seed = 0; seed < SHOE_SAMPLES; seed += 1) {
    positions.push(createShoe(decks, createRng(seed)).readout().undealtAtCut);
  }
  sampled.set(decks, positions);
  return positions;
}

function keyOf(held: Card): string {
  return `${held.rank}:${held.suit}`;
}

/** Draw to the cut card, returning what came out on the way. */
function drawToTheCut(shoe: Shoe): Card[] {
  const drawn: Card[] = [];
  while (!shoe.cutCardReached()) {
    drawn.push(shoe.draw());
  }
  return drawn;
}

function countByKey(cards: readonly Card[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const held of cards) {
    const key = keyOf(held);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('the numbers SPEC 4.1 states, re-derived here', () => {
  it('makes a shoe 312 cards on 6 decks and 416 on 8', () => {
    expect(complementOf(6)).toBe(312);
    expect(complementOf(8)).toBe(416);
  });

  it('bounds one round at 146 in value', () => {
    expect(MAX_HANDS).toBe(4);
    expect(MAX_PLAYER_VALUE).toBe(30);
    expect(MAX_DEALER_VALUE).toBe(26);
    expect(MAX_ROUND_VALUE).toBe(146);
  });

  it('buys 72 cards with that value on 6 decks and 80 on 8', () => {
    expect(worstCaseCards(6, MAX_ROUND_VALUE)).toBe(72);
    expect(worstCaseCards(8, MAX_ROUND_VALUE)).toBe(80);
  });

  it('cannot buy one more card at either size', () => {
    for (const decks of CONFIGURED_DECKS) {
      const pips = pipsAscending(decks);
      const cards = worstCaseCards(decks, MAX_ROUND_VALUE);
      let spent = 0;
      for (let index = 0; index < cards; index += 1) {
        const pip = pips[index];
        if (pip === undefined) {
          throw new RangeError(`no card at ${String(index)}`);
        }
        spent += pip;
      }
      const nextPip = pips[cards];
      expect(nextPip).toBeDefined();
      expect(spent + (nextPip ?? 0)).toBeGreaterThan(MAX_ROUND_VALUE);
    }
  });

  it('leaves 78 to 124 cards behind the cut on 6 decks, 104 to 166 on 8', () => {
    expect(minBehindCut(6)).toBe(78);
    expect(maxBehindCut(6)).toBe(124);
    expect(minBehindCut(8)).toBe(104);
    expect(maxBehindCut(8)).toBe(166);
  });

  it('agrees with the window the shoe places its cut card in', () => {
    for (const decks of CONFIGURED_DECKS) {
      expect(cutCardRange(decks)).toEqual({
        min: minBehindCut(decks),
        max: maxBehindCut(decks),
      });
    }
  });
});

describe('B3: a round never exhausts the cards behind the cut card', () => {
  it('covers the worst case with 6 cards to spare on 6 decks and 24 on 8', () => {
    expect(worstCaseCards(6, MAX_ROUND_VALUE)).toBeLessThanOrEqual(minBehindCut(6));
    expect(worstCaseCards(8, MAX_ROUND_VALUE)).toBeLessThanOrEqual(minBehindCut(8));
    expect(minBehindCut(6) - worstCaseCards(6, MAX_ROUND_VALUE)).toBe(6);
    expect(minBehindCut(8) - worstCaseCards(8, MAX_ROUND_VALUE)).toBe(24);
  });

  it('covers it at every cut position 2,000 seeded shoes actually produced', () => {
    for (const decks of CONFIGURED_DECKS) {
      const worst = worstCaseCards(decks, MAX_ROUND_VALUE);
      let tightest = Number.POSITIVE_INFINITY;
      for (const behind of positionsFor(decks)) {
        tightest = Math.min(tightest, behind);
      }
      expect(tightest).toBeGreaterThanOrEqual(worst);
    }
  });
});

describe('B3: the cut card leaves 25 to 40 percent of the shoe undealt', () => {
  for (const decks of CONFIGURED_DECKS) {
    const bounds = `${String(minBehindCut(decks))} to ${String(maxBehindCut(decks))}`;

    it(`never places it outside ${bounds} cards on ${String(decks)} decks`, () => {
      const positions = positionsFor(decks);
      expect(positions).toHaveLength(SHOE_SAMPLES);

      let lowest = Number.POSITIVE_INFINITY;
      let highest = Number.NEGATIVE_INFINITY;
      for (const behind of positions) {
        lowest = Math.min(lowest, behind);
        highest = Math.max(highest, behind);
      }

      // Exact equality, not containment. Over 2,000 draws a given position of
      // the 47 is missed with probability 3e-19, so the observed extremes are
      // the window's own ends, and a window that has been narrowed as well as
      // one that has been widened fails here.
      expect(lowest).toBe(minBehindCut(decks));
      expect(highest).toBe(maxBehindCut(decks));
    });

    it(`spreads it evenly across that window on ${String(decks)} decks`, () => {
      const positions = positionsFor(decks);
      const min = minBehindCut(decks);
      const max = maxBehindCut(decks);
      const slots = max - min + 1;

      const counts = new Map<number, number>();
      let total = 0;
      for (const behind of positions) {
        counts.set(behind, (counts.get(behind) ?? 0) + 1);
        total += behind;
      }

      // Every position taken at least once, and none more than five standard
      // deviations off its expected share of the sample.
      expect(counts.size).toBe(slots);
      const expected = SHOE_SAMPLES / slots;
      const sigma = Math.sqrt(SHOE_SAMPLES * (1 / slots) * (1 - 1 / slots));
      for (let behind = min; behind <= max; behind += 1) {
        expect(Math.abs((counts.get(behind) ?? 0) - expected)).toBeLessThan(5 * sigma);
      }

      // The mean catches an asymmetric reshaping inside the window: a draw that
      // still reaches both ends but piles up against one of them passes both
      // checks above and fails this one. It is not the test for a window that
      // has moved or narrowed, and it is worth being exact about that: a
      // one-card shift is only 3.3 standard errors on 6 decks against a
      // six-error band, so this test alone would let it through. The
      // exact-extremes assertion in the case above is what catches that.
      //
      // The standard error of the mean of a uniform draw over `slots` positions
      // is `sqrt((slots^2 - 1) / 12 / SHOE_SAMPLES)`, which is 0.30 cards on 6
      // decks and 0.41 on 8; six of those is the band below.
      const midpoint = (min + max) / 2;
      const spread = Math.sqrt((slots * slots - 1) / 12 / SHOE_SAMPLES);
      expect(Math.abs(total / SHOE_SAMPLES - midpoint)).toBeLessThan(6 * spread);
    });
  }
});

describe('B3: the reshuffle waits for the round to complete', () => {
  for (const decks of CONFIGURED_DECKS) {
    it(`keeps dealing from the same stack past the cut card on ${String(decks)} decks`, () => {
      const shoe = createShoe(decks, createRng(1234 + decks));
      const complement = complementOf(decks);
      const behind = shoe.readout().undealtAtCut;

      const before = drawToTheCut(shoe);
      expect(before).toHaveLength(complement - behind);
      expect(shoe.cutCardReached()).toBe(true);
      expect(shoe.cardsRemaining()).toBe(behind);

      // Everything behind the cut card comes out of the same stack: the count
      // falls by one per draw, no card repeats, and nothing is rebuilt.
      const after: Card[] = [];
      while (shoe.cardsRemaining() > 0) {
        const remainingBefore = shoe.cardsRemaining();
        after.push(shoe.draw());
        expect(shoe.cardsRemaining()).toBe(remainingBefore - 1);
        expect(shoe.cutCardReached()).toBe(true);
      }
      expect(after).toHaveLength(behind);

      const readout = shoe.readout();
      expect(readout.stacked).toBe(complement);
      expect(readout.undealtAtCut).toBe(behind);
      expect(readout.rebuilds).toBe(0);
      expect(readout.penetration).toBe(1);

      const counts = countByKey([...before, ...after]);
      expect(counts.size).toBe(52);
      for (const [, seen] of counts) {
        expect(seen).toBe(decks);
      }
    });
  }

  it('does nothing at a round boundary the cut card has not been reached at', () => {
    const shoe = createShoe(6, createRng(555));
    expect(shoe.endRound()).toBe(false);
    expect(shoe.readout().dealt).toBe(0);

    const first = keyOf(shoe.draw());
    const second = keyOf(shoe.draw());
    expect(shoe.endRound()).toBe(false);

    const readout = shoe.readout();
    expect(readout.dealt).toBe(2);
    expect(readout.remaining).toBe(310);
    expect(readout.inPlay).toBe(0);
    expect(readout.cutCardReached).toBe(false);
    expect([first, second]).toHaveLength(2);
  });

  it('reshuffles at the first round boundary after the cut card', () => {
    const shoe = createShoe(6, createRng(777));
    const firstCut = shoe.readout().undealtAtCut;

    const before = drawToTheCut(shoe).map(keyOf);
    shoe.draw();
    shoe.draw();
    expect(shoe.readout().inPlay).toBe(before.length + 2);

    expect(shoe.endRound()).toBe(true);

    const readout = shoe.readout();
    expect(readout.dealt).toBe(0);
    expect(readout.stacked).toBe(312);
    expect(readout.remaining).toBe(312);
    expect(readout.inPlay).toBe(0);
    expect(readout.cutCardReached).toBe(false);
    expect(readout.rebuilds).toBe(0);
    expect(readout.undealtAtCut).toBeGreaterThanOrEqual(minBehindCut(6));
    expect(readout.undealtAtCut).toBeLessThanOrEqual(maxBehindCut(6));

    // A fresh shuffle of a fresh complement, not a rewound pointer.
    const after: string[] = [];
    for (let n = 0; n < before.length; n += 1) {
      after.push(keyOf(shoe.draw()));
    }
    expect(after).not.toEqual(before);
    expect(firstCut).toBeGreaterThanOrEqual(minBehindCut(6));

    while (shoe.cardsRemaining() > 0) {
      after.push(keyOf(shoe.draw()));
    }
    expect(after).toHaveLength(312);
    const counts = new Map<string, number>();
    for (const key of after) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(52);
    for (const [, seen] of counts) {
      expect(seen).toBe(6);
    }
  });

  it('reshuffles once, at the boundary, however far past the cut it was', () => {
    const shoe = createShoe(8, createRng(888));
    drawToTheCut(shoe);
    for (let n = 0; n < 40; n += 1) {
      shoe.draw();
    }
    expect(shoe.cutCardReached()).toBe(true);
    expect(shoe.endRound()).toBe(true);
    expect(shoe.cutCardReached()).toBe(false);
    expect(shoe.endRound()).toBe(false);
    expect(shoe.readout().remaining).toBe(416);
    expect(shoe.readout().rebuilds).toBe(0);
  });
});
