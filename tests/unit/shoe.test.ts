/**
 * Item B2, severity Critical, 14 points.
 *
 *   "Shoe composition is exact for both configured deck counts, 6 and 8, no
 *    other count is reachable, the shuffle is a uniform permutation, and no
 *    card is ever in play twice."
 *
 * Four claims, and the third is the one that needs an argument rather than an
 * assertion. A shuffle either is a uniform permutation or is not, and the two
 * are indistinguishable from any single run, so it is measured: a five-element
 * array is shuffled 120,000 times from a fixed seed and every one of the 120
 * permutations is required to land inside a stated band.
 *
 * **A tolerance that nothing fails is not a tolerance.** Two deliberately
 * broken shuffles run under the same band and are required to miss it:
 *
 *   1. **Fisher-Yates drawing the partner from the whole array**, which is the
 *      classic wrong version. It produces 5^4 equally likely traces over 120
 *      permutations, and 625 does not divide by 120, so the permutations cannot
 *      come out level. The most frequent one arrives at 2.88 times its fair
 *      share, which is 15 times as often as the least frequent one, and lands
 *      59 standard deviations out.
 *   2. **A modulo reduction over a range the bound does not divide.** See the
 *      comment on `moduloNextInt` for why this control narrows its source: at a
 *      bound of 5 over a full 32-bit word the fault is real and unmeasurable,
 *      and `tests/unit/rng.test.ts` catches that case at a bound where it is
 *      visible instead.
 *
 * Both controls run a correct partner: control 1 uses the shipped `nextInt`, so
 * the only defect in it is the loop, and control 2 uses a correct Fisher-Yates,
 * so the only defect in it is the reduction.
 *
 * The alphabet, the deck counts and the 52-card composition are written out
 * here rather than imported from `src/`, on the same reasoning as
 * `hand-value.test.ts`: a sweep that takes its expectations from the code it is
 * checking shrinks to match that code's mistakes.
 *
 * The defensive rebuild of SPEC 4.1 is exercised at the foot of the file. That
 * is engineering coverage for a path this part builds; the item that grades it
 * is not this one and is not closed here.
 */

import { describe, expect, it } from 'vitest';

import type { Card } from '../../src/core/cards';
import type { Rng } from '../../src/core/rng';
import { createRng } from '../../src/core/rng';
import type { DeckCount, Shoe } from '../../src/core/shoe';
import {
  CARDS_PER_DECK,
  DECK_COUNTS,
  DEFAULT_DECKS,
  createShoe,
  cutCardRange,
  isDeckCount,
} from '../../src/core/shoe';

// ---------------------------------------------------------------------------
// The alphabet and the composition, carried here rather than imported
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

/** SPEC 4.1: 6 decks by default, configurable to 6 or 8, and to nothing else. */
const CONFIGURED_DECKS = [6, 8] as const;

/** 13 ranks in 4 suits. Written as the product, asserted as 52. */
const PACK = RANK_LABELS.length * SUIT_LABELS.length;

/** Deck counts SPEC 4.1 does not offer, including the two it cut. */
const UNCONFIGURED_DECKS = [0, 1, 2, 3, 4, 5, 7, 9, 10, 12, 52, -6, -1];

/** Deck counts that are not counts at all. */
const NON_INTEGER_DECKS = [6.5, 7.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY];

// ---------------------------------------------------------------------------
// The uniformity measurement
// ---------------------------------------------------------------------------

/** Five elements: 120 permutations, enough cells to see a lumpy shuffle. */
const PERMUTATION_SIZE = 5;

/** 5!, written out rather than computed, so a wrong size fails here. */
const PERMUTATIONS = 120;

/** 1,000 shuffles per permutation. Under a second, and 31.5 sigma per cell. */
const SHUFFLES = 120_000;

const EXPECTED_PER_PERMUTATION = SHUFFLES / PERMUTATIONS;

/**
 * One cell of a multinomial: `sqrt(N p (1 - p))`, which is 31.49 here.
 *
 * The band is five of these, 157.5 counts on an expected 1,000. A fair shuffle
 * puts one given cell outside five sigma with probability 5.7e-7, so across all
 * 120 cells a run fails by luck about once in 14,000. The seed is fixed, so
 * this is not re-rolled on every build: the run either passes or it does not,
 * and it does.
 *
 * Five sigma is chosen from both ends, and both ends are measured rather than
 * guessed. All three figures below are the worst cell's distance from its
 * expected 1,000, against a band of 157.5:
 *
 *   - the shipped shuffle at this seed, **79**, which is 2.51 sigma. Over five
 *     other seeds it ranged from 66 to 106, so the band is not tuned to one
 *     lucky run.
 *   - the modulo control, **443**, which is 2.8 times the band.
 *   - the biased Fisher-Yates control, **1,889**, which is 12 times the band.
 */
const CELL_SIGMA = Math.sqrt(SHUFFLES * (1 / PERMUTATIONS) * (1 - 1 / PERMUTATIONS));
const TOLERANCE = 5 * CELL_SIGMA;

/** The seed every measurement in this file runs from. */
const SEED = 0x5eed_b12c;

function swapAt(items: number[], left: number, right: number): void {
  const held = items[left];
  const other = items[right];
  if (held === undefined || other === undefined) {
    throw new RangeError(`cannot swap ${String(left)} and ${String(right)}`);
  }
  items[left] = other;
  items[right] = held;
}

/**
 * Control 1: the partner drawn from the whole array instead of the unvisited
 * prefix. Everything else about the loop is correct, and `nextInt` is the
 * shipped one, so this isolates the loop.
 */
function biasedFisherYates(rng: Rng, items: number[]): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    swapAt(items, index, rng.nextInt(items.length));
  }
}

/**
 * Control 2: `%` over a range the bound does not divide.
 *
 * **The source is deliberately four bits wide, and that is the honest version
 * of this control rather than a weakened one.** Reducing a full 32-bit word by
 * `% 5` is genuinely biased, by 2 parts in 10^10, which needs something like
 * 10^19 shuffles to separate from noise. Any test claiming to detect that at
 * 120,000 samples would be claiming a power it does not have. Narrowing the
 * source to 16 values makes the same arithmetic fault 40 percent instead, which
 * this band rejects by 12.9 sigma, and `tests/unit/rng.test.ts` covers the
 * full-width case directly at a bound near 2^32 where it is a factor of two.
 */
function moduloNextInt(rng: Rng, bound: number): number {
  return (rng.nextUint32() >>> 28) % bound;
}

/** Control 2's loop: a correct Fisher-Yates, so only the reduction is wrong. */
function moduloFisherYates(rng: Rng, items: number[]): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    swapAt(items, index, moduloNextInt(rng, index + 1));
  }
}

/** Every permutation of `0` to `size - 1`, as the keys the tally uses. */
function everyPermutationKey(size: number): string[] {
  const keys: string[] = [];
  const stack: number[] = [];
  const used: boolean[] = [];
  const step = (depth: number): void => {
    if (depth === size) {
      keys.push(stack.join(''));
      return;
    }
    for (let value = 0; value < size; value += 1) {
      if (used[value] === true) {
        continue;
      }
      used[value] = true;
      stack.push(value);
      step(depth + 1);
      stack.pop();
      used[value] = false;
    }
  };
  step(0);
  return keys;
}

/** Shuffle `SHUFFLES` times and tally which permutation came out. */
function tally(shuffleOnce: (items: number[]) => void): Map<string, number> {
  const counts = new Map<string, number>();
  for (let run = 0; run < SHUFFLES; run += 1) {
    const items: number[] = [];
    for (let value = 0; value < PERMUTATION_SIZE; value += 1) {
      items.push(value);
    }
    shuffleOnce(items);
    const key = items.join('');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** The furthest any of the 120 cells sits from its expected count. */
function worstDeviation(counts: Map<string, number>): number {
  let worst = 0;
  for (const key of everyPermutationKey(PERMUTATION_SIZE)) {
    const seen = counts.get(key) ?? 0;
    worst = Math.max(worst, Math.abs(seen - EXPECTED_PER_PERMUTATION));
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Shoe helpers
// ---------------------------------------------------------------------------

function keyOf(held: Card): string {
  return `${held.rank}:${held.suit}`;
}

/** Every rank in every suit, as the 52 keys a deck is made of. */
function packKeys(): string[] {
  const keys: string[] = [];
  for (const rank of RANK_LABELS) {
    for (const suit of SUIT_LABELS) {
      keys.push(`${rank}:${suit}`);
    }
  }
  return keys;
}

function countByKey(cards: readonly Card[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const held of cards) {
    const key = keyOf(held);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Draw until the current stack is empty. Never crosses a round boundary. */
function drawEverything(shoe: Shoe): Card[] {
  const drawn: Card[] = [];
  while (shoe.cardsRemaining() > 0) {
    drawn.push(shoe.draw());
  }
  return drawn;
}

/**
 * Require the shoe to be a fresh, fully reshuffled, correctly cut complement.
 *
 * Draining it is part of the assertion rather than a side effect: a shoe that
 * says `stacked` is a complement and then deals something other than one full
 * pack per deck has told the truth about a lie, and the composition is the only
 * reading that catches that.
 */
function expectFreshShoe(shoe: Shoe, decks: DeckCount, rebuildsSoFar: number): void {
  const complement = decks * CARDS_PER_DECK;
  const range = cutCardRange(decks);
  const readout = shoe.readout();
  expect(readout.stacked).toBe(complement);
  expect(readout.dealt).toBe(0);
  expect(readout.remaining).toBe(complement);
  expect(readout.inPlay).toBe(0);
  expect(readout.penetration).toBe(0);
  expect(readout.cutCardReached).toBe(false);
  expect(readout.undealtAtCut).toBeGreaterThanOrEqual(range.min);
  expect(readout.undealtAtCut).toBeLessThanOrEqual(range.max);
  // The rebuild counter is a record of what happened, not a state to clear.
  expect(readout.rebuilds).toBe(rebuildsSoFar);

  const drawn = drawEverything(shoe);
  expect(drawn).toHaveLength(complement);
  const counts = countByKey(drawn);
  expect([...counts.keys()].sort()).toEqual([...packKeys()].sort());
  for (const key of packKeys()) {
    expect(counts.get(key)).toBe(decks);
  }
}

function draws(rng: Rng, count: number): number[] {
  const out: number[] = [];
  for (let n = 0; n < count; n += 1) {
    out.push(rng.nextUint32());
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('the alphabet and the sizes this file measures against', () => {
  it('is 13 ranks in 4 suits, which is 52 cards to a deck', () => {
    expect(new Set(RANK_LABELS).size).toBe(13);
    expect(new Set(SUIT_LABELS).size).toBe(4);
    expect(PACK).toBe(52);
    expect(CARDS_PER_DECK).toBe(PACK);
    expect(packKeys()).toHaveLength(52);
    expect(new Set(packKeys()).size).toBe(52);
  });

  it('offers 6 and 8 decks, with 6 the default. SPEC 4.1', () => {
    expect([...DECK_COUNTS]).toEqual([...CONFIGURED_DECKS]);
    expect(DEFAULT_DECKS).toBe(6);
  });

  it('enumerates 120 permutations of five elements', () => {
    const keys = everyPermutationKey(PERMUTATION_SIZE);
    expect(keys).toHaveLength(PERMUTATIONS);
    expect(new Set(keys).size).toBe(PERMUTATIONS);
    expect(EXPECTED_PER_PERMUTATION).toBe(1000);
  });
});

describe('B2: composition is exact for both configured deck counts', () => {
  for (const decks of CONFIGURED_DECKS) {
    it(`deals ${String(decks * 52)} cards, each of the 52 exactly ${String(decks)} times`, () => {
      const shoe = createShoe(decks, createRng(SEED + decks));
      expect(shoe.decks).toBe(decks);
      expect(shoe.cardsRemaining()).toBe(decks * 52);

      const drawn = drawEverything(shoe);
      expect(drawn).toHaveLength(decks * 52);

      const counts = countByKey(drawn);
      expect([...counts.keys()].sort()).toEqual([...packKeys()].sort());
      for (const key of packKeys()) {
        expect(counts.get(key)).toBe(decks);
      }
    });

    it(`puts no card in play twice across a whole ${String(decks)}-deck shoe`, () => {
      const shoe = createShoe(decks, createRng(SEED + decks * 7));
      const drawn = drawEverything(shoe);
      const counts = countByKey(drawn);

      let overdrawn = 0;
      for (const [, seen] of counts) {
        if (seen > decks) {
          overdrawn += 1;
        }
      }
      expect(overdrawn).toBe(0);
      expect(shoe.cardsRemaining()).toBe(0);
      expect(shoe.readout().rebuilds).toBe(0);
    });
  }

  it('reaches every rank and every suit on both sizes', () => {
    for (const decks of CONFIGURED_DECKS) {
      const drawn = drawEverything(createShoe(decks, createRng(SEED - decks)));
      expect(new Set(drawn.map((held) => held.rank)).size).toBe(13);
      expect(new Set(drawn.map((held) => held.suit)).size).toBe(4);
    }
  });
});

describe('B2: no deck count outside 6 and 8 is reachable', () => {
  it('refuses every other whole number of decks', () => {
    for (const decks of UNCONFIGURED_DECKS) {
      expect(isDeckCount(decks)).toBe(false);
      expect(() => createShoe(decks as DeckCount, createRng(SEED))).toThrow(RangeError);
    }
  });

  it('refuses a deck count that is not a whole number', () => {
    for (const decks of NON_INTEGER_DECKS) {
      expect(isDeckCount(decks)).toBe(false);
      expect(() => createShoe(decks as DeckCount, createRng(SEED))).toThrow(RangeError);
    }
  });

  it('accepts 6 and 8, and nothing between them', () => {
    for (const decks of CONFIGURED_DECKS) {
      expect(isDeckCount(decks)).toBe(true);
    }
    expect(isDeckCount(7)).toBe(false);
  });
});

describe('B2: the shuffle is a uniform permutation', () => {
  it('keeps all 120 permutations inside five standard deviations', () => {
    const rng = createRng(SEED);
    const counts = tally((items) => {
      rng.shuffle(items);
    });
    expect(counts.size).toBe(PERMUTATIONS);
    expect(worstDeviation(counts)).toBeLessThan(TOLERANCE);
  });

  it('rejects Fisher-Yates drawing its partner from the whole array', () => {
    const rng = createRng(SEED);
    const counts = tally((items) => {
      biasedFisherYates(rng, items);
    });
    expect(worstDeviation(counts)).toBeGreaterThan(TOLERANCE);
  });

  it('rejects a modulo reduction over a range the bound does not divide', () => {
    const rng = createRng(SEED);
    const counts = tally((items) => {
      moduloFisherYates(rng, items);
    });
    expect(worstDeviation(counts)).toBeGreaterThan(TOLERANCE);
  });

  it('leaves the array a permutation of what it was given', () => {
    const rng = createRng(SEED);
    for (let run = 0; run < 200; run += 1) {
      const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      rng.shuffle(items);
      expect([...items].sort((left, right) => left - right)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
      ]);
    }
  });

  it('leaves an empty and a single-element array alone', () => {
    const rng = createRng(SEED);
    const empty: number[] = [];
    rng.shuffle(empty);
    expect(empty).toEqual([]);
    const one = [7];
    rng.shuffle(one);
    expect(one).toEqual([7]);
  });
});

/**
 * Seeding and the split stream, which SPEC 4.1 requires and B2 does not claim.
 *
 * Engineering coverage for what this part builds, on the same footing as the
 * rebuild block below. The item that grades determinism and the split stream is
 * not this one and is not closed here.
 */
describe('the shoe is seeded, reproducible and on its own stream', () => {
  it('deals the same shoe from the same seed', () => {
    const first = drawEverything(createShoe(6, createRng(4242))).map(keyOf);
    const second = drawEverything(createShoe(6, createRng(4242))).map(keyOf);
    expect(first).toEqual(second);
  });

  it('deals a different shoe from a different seed', () => {
    const first = drawEverything(createShoe(6, createRng(4242))).map(keyOf);
    const second = drawEverything(createShoe(6, createRng(4243))).map(keyOf);
    expect(first).not.toEqual(second);
  });

  /**
   * SPEC 4.1: the shoe takes its own stream through `split()`, so a consumer
   * added beside it later cannot shift the deal. Building a shoe from a session
   * stream must therefore leave that stream's own sequence exactly as it was.
   */
  it('takes a split stream and does not consume the one it was given', () => {
    const untouched = draws(createRng(99), 32);
    const source = createRng(99);
    createShoe(6, source);
    expect(draws(source, 32)).toEqual(untouched);
  });

  it('gives two shoes split from one stream different orders', () => {
    const source = createRng(99);
    const first = drawEverything(createShoe(6, source)).map(keyOf);
    const second = drawEverything(createShoe(6, source)).map(keyOf);
    expect(first).not.toEqual(second);
  });
});

/**
 * The defensive rebuild of SPEC 4.1, which must never fire in play.
 *
 * Forcing it needs a round that outruns the cards behind the cut card, which
 * SPEC 4.1's worst case says cannot happen when the round is a real one: this
 * test simply keeps drawing without ending the round. The claim being checked
 * is the invariant the rebuild exists to preserve, that a card on the table can
 * never come back out of the shoe.
 *
 * Engineering coverage for a path this part builds. The item that grades the
 * path is not this one and is not closed here.
 */
describe('the defensive rebuild preserves the no-duplicate invariant', () => {
  for (const decks of CONFIGURED_DECKS) {
    it(`rebuilds ${String(decks)} decks from the complement minus what is in play`, () => {
      const shoe = createShoe(decks, createRng(SEED + decks * 31));
      const complement = decks * 52;
      const behind = shoe.readout().undealtAtCut;

      // A first round that stops one card short of the cut card, so the round
      // boundary passes without a reshuffle and nothing is left in play.
      for (let n = 0; n < complement - behind - 1; n += 1) {
        shoe.draw();
      }
      expect(shoe.cutCardReached()).toBe(false);
      expect(shoe.endRound()).toBe(false);
      expect(shoe.readout().inPlay).toBe(0);
      expect(shoe.cardsRemaining()).toBe(behind + 1);

      // A second round that drains the stack without ever ending.
      const held: Card[] = [];
      while (shoe.cardsRemaining() > 0) {
        held.push(shoe.draw());
      }
      expect(shoe.readout().rebuilds).toBe(0);
      expect(held).toHaveLength(behind + 1);

      // The draw that has to rebuild, and everything the rebuild produced.
      held.push(shoe.draw());
      expect(shoe.readout().rebuilds).toBe(1);
      while (shoe.cardsRemaining() > 0) {
        held.push(shoe.draw());
      }

      // Everything that has been in play during this round is now exactly one
      // full complement: the rebuild handed back the cards not on the table and
      // no others, so nothing was in play twice.
      expect(held).toHaveLength(complement);
      const counts = countByKey(held);
      expect([...counts.keys()].sort()).toEqual([...packKeys()].sort());
      for (const key of packKeys()) {
        expect(counts.get(key)).toBe(decks);
      }
    });
  }

  it('refuses to invent a card when the whole shoe is already in play', () => {
    const shoe = createShoe(6, createRng(SEED + 1));
    while (shoe.cardsRemaining() > 0) {
      shoe.draw();
    }
    expect(() => shoe.draw()).toThrow(RangeError);

    // The rebuild ran and found nothing to rebuild from, which is the one state
    // in which the stack is empty. The readout has to survive being taken here:
    // penetration is 1 rather than `0 / 0`, so nothing downstream is handed a
    // NaN to draw a shoe meter from.
    const readout = shoe.readout();
    expect(readout.stacked).toBe(0);
    expect(readout.remaining).toBe(0);
    expect(readout.penetration).toBe(1);
    expect(readout.rebuilds).toBe(1);
  });

  /**
   * The boundary the rebuild leaves owing.
   *
   * `rebuild()` puts the cut card at the top (`cutAt = 0`), which is the whole
   * mechanism behind two claims the module makes in prose: that
   * `cutCardReached` stays true "right through to the next round boundary", and
   * that "`endRound` therefore reshuffles properly at the boundary". Nothing
   * called `endRound()` on a shoe with `rebuilds > 0` before these three cases,
   * so both claims rested on a line no test reached and no mutation broke.
   *
   * Three post-rebuild states, at both configured sizes: a rebuild that handed
   * some cards back, a rebuild that found nothing to hand back, and the control
   * beside them, an exactly drained stack that never rebuilt at all.
   */
  describe('and the next round boundary repays the reshuffle it still owes', () => {
    for (const decks of CONFIGURED_DECKS) {
      it(`recovers a ${String(decks)}-deck shoe from a partial rebuild`, () => {
        const shoe = createShoe(decks, createRng(SEED + 4100 + decks));
        const complement = decks * CARDS_PER_DECK;

        // A first round well inside the cut, so the boundary passes cleanly and
        // 60 cards leave play. Those 60 are what the rebuild will hand back.
        for (let n = 0; n < 60; n += 1) {
          shoe.draw();
        }
        expect(shoe.endRound()).toBe(false);

        // A round that never ends: drain the stack, then force the rebuild.
        drawEverything(shoe);
        expect(shoe.readout().rebuilds).toBe(0);
        shoe.draw();

        const afterRebuild = shoe.readout();
        expect(afterRebuild.rebuilds).toBe(1);
        expect(afterRebuild.stacked).toBe(60);
        expect(afterRebuild.stacked).toBeLessThan(afterRebuild.complement);
        // The three readings the module documents for this state.
        expect(afterRebuild.undealtAtCut).toBe(afterRebuild.stacked);
        expect(afterRebuild.cutCardReached).toBe(true);
        expect(afterRebuild.inPlay).toBe(complement - 60 + 1);

        expect(shoe.endRound()).toBe(true);
        expectFreshShoe(shoe, decks, 1);
      });

      it(`recovers a ${String(decks)}-deck shoe from a rebuild that found nothing`, () => {
        const shoe = createShoe(decks, createRng(SEED + 4200 + decks));
        drawEverything(shoe);
        // Every card is in play, so the rebuild has nothing to hand back.
        expect(() => shoe.draw()).toThrow(RangeError);
        const exhausted = shoe.readout();
        expect(exhausted.stacked).toBe(0);
        expect(exhausted.penetration).toBe(1);
        expect(exhausted.rebuilds).toBe(1);
        expect(exhausted.cutCardReached).toBe(true);

        expect(shoe.endRound()).toBe(true);
        expectFreshShoe(shoe, decks, 1);
      });

      it(`reshuffles a ${String(decks)}-deck stack drained exactly, with no rebuild`, () => {
        const shoe = createShoe(decks, createRng(SEED + 4300 + decks));
        drawEverything(shoe);
        expect(shoe.readout().rebuilds).toBe(0);
        expect(shoe.readout().dealt).toBe(decks * CARDS_PER_DECK);
        expect(shoe.endRound()).toBe(true);
        expectFreshShoe(shoe, decks, 0);
      });
    }
  });
});
