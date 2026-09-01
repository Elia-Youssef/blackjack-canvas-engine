/**
 * Item B14, severity Critical, 8 points.
 *
 *   "No payout in the game requires rounding. Every reachable wager produces an
 *    integer result for the 3:2 natural, the insurance stake, the 2:1 insurance
 *    payout and the surrender return."
 *
 * SPEC 4.11. The claim is not that the code rounds correctly: it is that nothing
 * in the game ever needs to. That rests entirely on one property of the wager
 * set, which is why this file derives the set rather than assuming it.
 *
 * **The derivation, from SPEC 4.11 and SPEC 6 as written.** The chips are 10,
 * 50, 100 and 500, and a tap adds one to the wager or is rejected, so the
 * reachable initial wagers are the sums of those four denominations up to the
 * table maximum. `Max` computes `floor(min(tableMax, chips) / 10) * 10` and
 * `Repeat` repeats a wager that was already legal, so neither introduces a value
 * the taps could not build. The largest table maximum is Gold's 2,000. Double
 * doubles a hand's wager and a split hand carries an equal wager, so the largest
 * wager a single hand can carry into settlement is 4,000. The balance ceiling
 * only ever removes values, never adds one, and the table minimum only blocks
 * the deal, so the set built here is a **superset** of what can settle, which is
 * the safe direction for a claim that every member of it divides exactly.
 *
 * **A checker that cannot fail is not a checker.** The same checker that finds
 * nothing wrong with the reachable set is run over a 25 wager, the green chip
 * SPEC 4.11 names and rejects, and is required to flag the 37.5 it pays on a
 * natural. It is run once more over a denomination set with the 25 chip added,
 * where the wager set itself stops being a grid of tens, so both the derivation
 * and the arithmetic have a control against them.
 *
 * **No rounding call, checked in the source and not only in the numbers.** A
 * rounding call added to a payout is invisible to every assertion above: on a
 * wager that is a multiple of 10 the payouts are already whole, so rounding one
 * changes nothing that a test at those wagers can see, and it would sit there
 * silently until a denomination changed and then quietly take a chip a round.
 * The first sentence of the criterion is a claim about the code rather than
 * about the numbers, so it is checked against the code.
 *
 * **Scope.** The wager set is derived here from the rules as written; keeping a
 * live wager on that grid is item `B15` at `BJ-15`, whose criterion carries the
 * rejection rule, the disabled chip, and both computed controls in as many
 * words. Crediting `wager + net` to a balance and conserving
 * `chips + committed + insuranceStake - deferredStake` are `B15`'s and the
 * soak's, `H6` at `BJ-12`. Where an insurance stake comes from, that it is half
 * the initial wager and fixed at the offer, and the deferred even-money stake,
 * are item `B11` at `BJ-8`. None of them is closed here.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stripComments as withoutComments } from './support/source-scan';

import type { Card, Rank, Suit } from '../../src/core/cards';
import { card } from '../../src/core/cards';
import { settle, settleInsurance } from '../../src/core/settlement';

// ---------------------------------------------------------------------------
// The rules this file checks against, written out from SPEC 4.11 and SPEC 6
// ---------------------------------------------------------------------------

/** SPEC 4.11: the four chip denominations. Written out, not imported. */
const CHIPS = [10, 50, 100, 500] as const;

/** SPEC 4.11: the grid every reachable wager sits on, and `Max` floors to. */
const GRID = 10;

/** SPEC 6: the three tables, smallest maximum first. */
const TABLE_MINIMA = [10, 50, 100] as const;
const TABLE_MAXIMA = [100, 500, 2000] as const;

/** SPEC 4.5: Double doubles the hand's wager, and nothing multiplies it more. */
const DOUBLE = 2;

/** SPEC 4.11's payout table, as this file reads it. */
const NATURAL_NUMERATOR = 3;
const NATURAL_DENOMINATOR = 2;
const INSURANCE_ODDS = 2;
const HALF = 2;

/** The green chip SPEC 4.11 rejects, and the payout it would owe on a natural. */
const GREEN_CHIP = 25;
const GREEN_CHIP_NATURAL = 37.5;

// ---------------------------------------------------------------------------
// The reachable wager set, built rather than asserted
// ---------------------------------------------------------------------------

/**
 * Every wager the chip taps can build at or below a ceiling.
 *
 * A breadth-first closure over "add one chip", which is exactly what SPEC 4.11
 * offers the player: four chips, each tap adding its denomination, and a tap
 * rejected rather than clamped when it would pass the ceiling. Starting from
 * nothing and keeping every total on the way, since Deal can be pressed at any
 * of them the table minimum allows.
 */
function reachableByTapping(denominations: readonly number[], ceiling: number): Set<number> {
  const found = new Set<number>();
  const pending = [0];
  while (pending.length > 0) {
    const wager = pending.pop();
    if (wager === undefined) {
      throw new RangeError('the closure lost a wager it had queued');
    }
    for (const chip of denominations) {
      const next = wager + chip;
      if (next <= ceiling && !found.has(next)) {
        found.add(next);
        pending.push(next);
      }
    }
  }
  return found;
}

/** The largest wager any single hand can carry, per the derivation above. */
const LARGEST_TABLE_MAXIMUM = Math.max(...TABLE_MAXIMA);
const LARGEST_HAND_WAGER = LARGEST_TABLE_MAXIMUM * DOUBLE;

/** Initial wagers: the taps, at the largest table maximum there is. */
const INITIAL_WAGERS = reachableByTapping(CHIPS, LARGEST_TABLE_MAXIMUM);

/**
 * Wagers a single hand can carry into settlement: an initial wager, or a doubled
 * one. A split hand carries an equal wager, so splitting adds no value the two
 * lines below do not already hold.
 */
const HAND_WAGERS = new Set<number>([
  ...INITIAL_WAGERS,
  ...[...INITIAL_WAGERS].map((wager) => wager * DOUBLE),
]);

/**
 * Sizes, derived rather than observed. The taps reach every multiple of 10 from
 * 10 to 2,000, which is 200 values, because 10 is itself a chip and the other
 * three are multiples of it. Doubling those gives every multiple of 20 from 20
 * to 4,000; the half of them at or below 2,000 are already in the first set, and
 * the 100 above it are not.
 */
const INITIAL_WAGER_COUNT = 200;
const HAND_WAGER_COUNT = 300;

// ---------------------------------------------------------------------------
// The checker, and the four payouts of SPEC 4.11
// ---------------------------------------------------------------------------

/** One payout that did not come out whole. */
interface Fraction {
  readonly wager: number;
  readonly payout: string;
  readonly value: number;
}

/**
 * Every payout of SPEC 4.11's table that is not a whole number of chips.
 *
 * The four the criterion names, plus Double and Split, which the same table
 * lists as exact for trivial reasons and which are cheap to include. The stake
 * is halved first and the 2:1 payout is taken from the halved figure, because
 * that is the order SPEC 4.7 does it in: a stake that was not whole would carry
 * a fraction into the payout.
 */
function fractionsIn(wagers: Iterable<number>): Fraction[] {
  const found: Fraction[] = [];
  for (const wager of wagers) {
    const stake = wager / HALF;
    const payouts: readonly [string, number][] = [
      ['the 3:2 natural', (wager * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR],
      ['the insurance stake', stake],
      ['the 2:1 insurance payout', INSURANCE_ODDS * stake],
      ['the surrender return', wager / HALF],
      ['the double', wager * DOUBLE],
      ['the split wager', wager],
    ];
    for (const [payout, value] of payouts) {
      if (!Number.isInteger(value)) {
        found.push({ wager, payout, value });
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Hands that reach each rung, for the deltas at every wager
// ---------------------------------------------------------------------------

type Deal = {
  readonly rung: number;
  readonly player: readonly Rank[];
  readonly dealer: readonly Rank[];
  readonly surrendered: boolean;
  readonly net: (wager: number) => number;
};

/**
 * One deal per rung of SPEC 4.10, with the net written out as a formula.
 *
 * The formulas are this file's own reading of the table, so the sweep below
 * checks the exact figure at every wager rather than only that it came out
 * whole. None of these hands is from a split, which changes no arithmetic: a
 * split hand's 21 settles at rung 7 for the same `+wager` rung 6 pays.
 */
const DEALS: readonly Deal[] = [
  {
    rung: 1,
    player: ['10', '6'],
    dealer: ['10', '7'],
    surrendered: true,
    net: (wager) => -(wager / HALF),
  },
  { rung: 2, player: ['A', 'K'], dealer: ['A', 'Q'], surrendered: false, net: () => 0 },
  {
    rung: 3,
    player: ['A', 'K'],
    dealer: ['10', '7'],
    surrendered: false,
    net: (wager) => (wager * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR,
  },
  {
    rung: 4,
    player: ['7', '7', '7'],
    dealer: ['A', 'Q'],
    surrendered: false,
    net: (wager) => -wager,
  },
  {
    rung: 5,
    player: ['10', '10', '2'],
    dealer: ['10', '6', '10'],
    surrendered: false,
    net: (wager) => -wager,
  },
  {
    rung: 6,
    player: ['10', '10'],
    dealer: ['10', '6', '10'],
    surrendered: false,
    net: (wager) => wager,
  },
  {
    rung: 7,
    player: ['10', '10'],
    dealer: ['10', '7'],
    surrendered: false,
    net: (wager) => wager,
  },
  {
    rung: 8,
    player: ['10', '7'],
    dealer: ['10', '10'],
    surrendered: false,
    net: (wager) => -wager,
  },
  { rung: 9, player: ['10', '10'], dealer: ['10', '10'], surrendered: false, net: () => 0 },
];

const SUIT: Suit = 'spades';

function hand(ranks: readonly Rank[]): Card[] {
  return ranks.map((rank) => card(rank, SUIT));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('B14: the reachable wager set, derived from SPEC 4.11 and SPEC 6', () => {
  it('is every multiple of 10 from 10 to the largest table maximum', () => {
    const wanted: number[] = [];
    for (let wager = GRID; wager <= LARGEST_TABLE_MAXIMUM; wager += GRID) {
      wanted.push(wager);
    }
    expect([...INITIAL_WAGERS].sort((left, right) => left - right)).toEqual(wanted);
    expect(INITIAL_WAGERS.size).toBe(INITIAL_WAGER_COUNT);
    expect(LARGEST_TABLE_MAXIMUM).toBe(2000);
  });

  it('reaches 4,000 once a hand doubles, and nothing above it', () => {
    expect(HAND_WAGERS.size).toBe(HAND_WAGER_COUNT);
    expect(Math.max(...HAND_WAGERS)).toBe(LARGEST_HAND_WAGER);
    expect(LARGEST_HAND_WAGER).toBe(4000);
    expect(Math.min(...HAND_WAGERS)).toBe(GRID);
  });

  it('holds nothing off the 10-chip grid, which is the whole property', () => {
    for (const wager of HAND_WAGERS) {
      expect(wager % GRID).toBe(0);
    }
    expect(HAND_WAGERS.has(GREEN_CHIP)).toBe(false);
  });

  it('cannot be widened by the table minima, which only block the deal', () => {
    for (const minimum of TABLE_MINIMA) {
      expect(INITIAL_WAGERS.has(minimum)).toBe(true);
      expect(minimum % GRID).toBe(0);
    }
    for (const maximum of TABLE_MAXIMA) {
      expect(INITIAL_WAGERS.has(maximum)).toBe(true);
      // Each table's own ceiling reaches the same grid, one table at a time.
      const own = reachableByTapping(CHIPS, maximum);
      expect(Math.max(...own)).toBe(maximum);
      for (const wager of own) {
        expect(INITIAL_WAGERS.has(wager)).toBe(true);
      }
    }
  });
});

describe('B14: every payout of SPEC 4.11 comes out whole', () => {
  it('finds no fraction anywhere in the reachable set', () => {
    expect(fractionsIn(HAND_WAGERS)).toEqual([]);
  });

  it('divides the 3:2 natural, the stake, the 2:1 payout and the surrender', () => {
    for (const wager of HAND_WAGERS) {
      expect(Number.isInteger((wager * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR)).toBe(true);
      expect(Number.isInteger(wager / HALF)).toBe(true);
      expect(Number.isInteger(INSURANCE_ODDS * (wager / HALF))).toBe(true);
    }
    // The four figures at the two ends of the set, written out.
    expect((10 * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR).toBe(15);
    expect(10 / HALF).toBe(5);
    expect(INSURANCE_ODDS * (10 / HALF)).toBe(10);
    expect((4000 * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR).toBe(6000);
    expect(4000 / HALF).toBe(2000);
    expect(INSURANCE_ODDS * (4000 / HALF)).toBe(4000);
  });

  /**
   * The control. Without it the checker above proves only that it was pointed at
   * a set with nothing wrong in it.
   */
  it('flags the 37.5 a 25 chip would owe on a natural', () => {
    const flagged = fractionsIn([GREEN_CHIP]);
    expect(flagged).not.toEqual([]);
    const natural = flagged.filter((fraction) => fraction.payout === 'the 3:2 natural');
    expect(natural).toEqual([
      { wager: GREEN_CHIP, payout: 'the 3:2 natural', value: GREEN_CHIP_NATURAL },
    ]);
    // And the stake and the surrender return both land on a half chip.
    expect(flagged.map((fraction) => fraction.value)).toContain(12.5);
  });

  /**
   * The same control one level up, at the derivation rather than the arithmetic.
   * A denomination set holding the green chip stops producing a grid of tens,
   * and the fractions follow from that alone.
   */
  it('flags a whole denomination set that includes the 25 chip', () => {
    const withGreen = reachableByTapping([...CHIPS, GREEN_CHIP], LARGEST_TABLE_MAXIMUM);
    expect(withGreen.has(GREEN_CHIP)).toBe(true);
    expect([...withGreen].some((wager) => wager % GRID !== 0)).toBe(true);
    expect(fractionsIn(withGreen)).not.toEqual([]);
  });
});

describe('B14: the ladder pays a whole number of chips at every reachable wager', () => {
  it('settles all nine rungs exactly, at all 300 wagers', () => {
    const wrong: string[] = [];
    const rungsSeen = new Set<number>();
    let settled = 0;

    for (const wager of HAND_WAGERS) {
      for (const deal of DEALS) {
        const result = settle(
          {
            cards: hand(deal.player),
            wager,
            surrendered: deal.surrendered,
            origin: { fromSplit: false },
          },
          { cards: hand(deal.dealer) },
        );
        settled += 1;
        rungsSeen.add(result.rung);
        const wanted = deal.net(wager);
        if (result.rung !== deal.rung || result.net !== wanted) {
          wrong.push(
            `${String(wager)} at rung ${String(deal.rung)}: got rung ${String(result.rung)} ` +
              `paying ${String(result.net)}, wanted ${String(wanted)}`,
          );
        }
        if (!Number.isInteger(result.net)) {
          wrong.push(`${String(wager)} at rung ${String(deal.rung)}: ${String(result.net)}`);
        }
      }
    }

    expect(wrong).toEqual([]);
    expect(settled).toBe(HAND_WAGER_COUNT * DEALS.length);
    expect([...rungsSeen].sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('pays 3:2 and half a wager exactly at the smallest and largest wager', () => {
    const natural = (wager: number): number =>
      settle(
        {
          cards: hand(['A', 'K']),
          wager,
          surrendered: false,
          origin: { fromSplit: false },
        },
        { cards: hand(['10', '7']) },
      ).net;
    const surrender = (wager: number): number =>
      settle(
        { cards: hand(['10', '6']), wager, surrendered: true, origin: { fromSplit: false } },
        { cards: hand(['10', '7']) },
      ).net;

    expect(natural(10)).toBe(15);
    expect(natural(4000)).toBe(6000);
    expect(surrender(10)).toBe(-5);
    expect(surrender(4000)).toBe(-2000);
  });
});

describe('B14: the insurance net is exact at every reachable stake', () => {
  it('nets 2 x stake on a dealer natural and -stake otherwise', () => {
    let checked = 0;
    for (const wager of INITIAL_WAGERS) {
      // SPEC 4.7: the stake is half the initial wager, so a doubled or split
      // wager never reaches this line. Computing it is item B11's at BJ-8.
      const stake = wager / HALF;
      expect(Number.isInteger(stake)).toBe(true);
      const won = settleInsurance(stake, true);
      const lost = settleInsurance(stake, false);
      expect(won).toBe(INSURANCE_ODDS * stake);
      expect(lost).toBe(-stake);
      expect(Number.isInteger(won)).toBe(true);
      expect(Number.isInteger(lost)).toBe(true);
      // SPEC 4.7 credits the balance 3 x stake on a win: the stake returned,
      // plus 2 x stake paid on top. The crediting is the wallet's at BJ-6; that
      // the two readings agree is arithmetic and belongs here.
      expect(stake + won).toBe(3 * stake);
      checked += 1;
    }
    expect(checked).toBe(INITIAL_WAGER_COUNT);
  });

  it('is exact on the smallest stake there is, which is 5 chips', () => {
    expect(10 / HALF).toBe(5);
    expect(settleInsurance(5, true)).toBe(10);
    expect(settleInsurance(5, false)).toBe(-5);
    // An odd stake is not a problem: 2:1 on it is still whole, which is why the
    // wager and not the stake is the quantity SPEC 4.11 keeps on a grid.
    expect(settleInsurance(15, true)).toBe(30);
  });
});

/**
 * "No payout in the game requires rounding" is a claim about the code, and the
 * numbers above cannot see it: on a wager that is a multiple of 10 a rounding
 * call changes nothing, so it would pass every assertion in this file and every
 * assertion in `settlement.test.ts` while sitting in the payout waiting for a
 * denomination to move.
 *
 * The scan is the settlement module alone, because it is the only module that
 * computes a payout. The wallet arrives at `BJ-6` and its arithmetic is graded
 * by `B15` and by the soak `H6`.
 */
describe('B14: no rounding call exists in the settlement module', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../src/core/settlement.ts', import.meta.url)),
    'utf8',
  );

  /**
   * Every way a payout could be rounded, including the bitwise idioms.
   *
   * Those were held back while the scan read raw text, because `| 0` cannot be
   * told from a union type with a zero member. Stripping the comments does not
   * fix that on its own, but the module's two unions are `Outcome`, whose
   * members are strings, and `Rung`, which runs 1 to 9, so no collision exists
   * in the code today and the pattern is carried. If a zero ever joins a union
   * here the answer is to narrow the pattern, not to drop it: the whole point of
   * this block is that a truncation added to a payout is invisible in the
   * numbers. The shift patterns anchor the zero so that a real shift by another
   * amount stays legal, since a shift is not a rounding call in itself.
   */
  const ROUNDING = [
    /\bMath\s*\.\s*round\b/,
    /\bMath\s*\.\s*floor\b/,
    /\bMath\s*\.\s*ceil\b/,
    /\bMath\s*\.\s*trunc\b/,
    /\.\s*toFixed\s*\(/,
    /\.\s*toPrecision\s*\(/,
    /~~/,
    />>>?\s*0\b/,
    /<<\s*0\b/,
    /\^\s*0\b/,
    /\|\s*0\b/,
    /\bparseInt\s*\(/,
  ];

  /** Which patterns fire on a piece of source, comments removed first. */
  function scan(text: string): string[] {
    const code = withoutComments(text);
    return ROUNDING.filter((pattern) => pattern.test(code)).map((pattern) => pattern.toString());
  }

  it('reads the module it is scanning, and still holds it after the strip', () => {
    // A scan of a file that failed to load, or of a strip that ate the code
    // along with the prose, would pass every check below.
    expect(source).toContain('export function settle(');
    expect(source).toContain('export function settleInsurance(');
    expect(source.length).toBeGreaterThan(1000);
    const code = withoutComments(source);
    expect(code).toContain('export function settle(');
    expect(code).toContain('export function settleInsurance(');
    expect(code).toContain('naturalPayout(wager)');
    expect(code.length).toBeGreaterThan(500);
  });

  it('holds none of the twelve ways to round a number', () => {
    expect(scan(source)).toEqual([]);
  });

  /**
   * The other half of the strip: prose naming a rounding call must not fire the
   * gate. Both comment forms, because the two are stripped by different
   * expressions and only one of them was ever going to be tested by accident.
   */
  it('does not fire on a comment that names one', () => {
    expect(scan(`${source}\n// never Math.round here\n`)).toEqual([]);
    expect(scan(`${source}\n/* not Math.floor, and not ~~ either */\n`)).toEqual([]);
    expect(scan(`${source}\n// no parseInt, no 1 | 0, no 1 >> 0\n`)).toEqual([]);
  });

  /** The scan has to be able to see each one, or it is proving nothing. */
  it('would see one if it were there, for every pattern on the list', () => {
    const rounded = [
      'const a = Math.round(1.5);',
      'const b = Math.floor(1.5);',
      'const c = Math.ceil(1.5);',
      'const d = Math.trunc(1.5);',
      'const e = (1.5).toFixed(0);',
      'const f = (1.5).toPrecision(1);',
      'const g = ~~1.5;',
      'const h = 3 >> 0;',
      'const i = 3 >>> 0;',
      'const j = 3 << 0;',
      'const k = 3 ^ 0;',
      'const l = 3 | 0;',
      "const m = parseInt('1.5', 10);",
      "const n = Number.parseInt('1.5', 10);",
    ];
    for (const pattern of ROUNDING) {
      const fired = rounded.filter((sample) =>
        scan(`${source}\n${sample}`).includes(pattern.toString()),
      );
      expect(fired.length, `nothing fires ${pattern.toString()}`).toBeGreaterThan(0);
    }
    // And a shift by any other amount is not a rounding call, so it stays legal.
    expect(scan(`${source}\nconst o = 3 >>> 8;`)).toEqual([]);
  });
});
