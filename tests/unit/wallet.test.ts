/**
 * The wallet and the betting controls of SPEC 4.11, built at `BJ-6`.
 *
 * **No acceptance item closes here.** `J1` and `J2` are graded in
 * `tests/unit/tables.test.ts`, which is the evidence artifact both name. What is
 * checked in this file is built at `BJ-6` and graded later: `B15` at `BJ-15`
 * carries the rejection rule, the disabled chip, the two computed controls,
 * Deal blocked below the minimum and the four-term identity in as many words,
 * and the 50,000-round soak `H6` at `BJ-12` carries the identity again over a
 * whole session. Neither can run before the chip controls and the round module
 * exist. This file is the unit-level evidence underneath both, so that a defect
 * in the arithmetic is found here rather than through a browser.
 *
 * **Every expected figure is written out from SPEC 4.11 and SPEC 6**, never
 * imported from the module: a sweep that took the denominations or the table
 * maxima from `wallet.ts` would shrink to match one that moved.
 *
 * **The three traps, as three sweeps with controls.** SPEC 4.11 says a chip tap
 * over the ceiling is rejected and changes nothing, that Deal below the minimum
 * is blocked rather than raised, and that only `Max` and `Repeat` compute a
 * value and both compute a legal one. Each is a claim about something the code
 * must *not* do, which no assertion about a correct answer can see, so a
 * clamping tap, a `Max` without its floor, a `Max` without its balance term, a
 * `Repeat` that reads affordability as the balance alone and a `Repeat` that
 * raises to the table minimum are all written out and run beside the shipped
 * functions, each required to disagree on exactly its own derived set.
 *
 * **Two of the identity's four terms are zero throughout.** SPEC 4.7's insurance
 * stake and the unfunded part of an even-money stake arrive with item `B11` at
 * `BJ-8`, so nothing here can move them and no control over them is possible
 * yet. What this file can hold is the shape: the readout's own field list is
 * asserted, so a term dropped from the identity is a failure rather than a
 * silent narrowing back to the three-term form the soak `H6` names as its
 * negative control.
 */

import { describe, expect, it } from 'vitest';

import { bounded } from './support/drive';

import type {
  BetResult,
  ChipDenomination,
  CommitResult,
  Refusal,
  TableId,
  TableLimits,
} from '../../src/core/wallet';
import {
  CHIP_DENOMINATIONS,
  NO_WAGER,
  STARTING_CHIPS,
  WAGER_GRID,
  chipEnabled,
  createWallet,
  dealRefusal,
  isChipDenomination,
  maxWager,
  repeatWager,
  tableLimits,
  tapChip,
  wagerCeiling,
} from '../../src/core/wallet';

// ---------------------------------------------------------------------------
// SPEC 4.11 and SPEC 6, written out
// ---------------------------------------------------------------------------

/** SPEC 4.11: the four denominations, and the grid they all sit on. */
const CHIPS = [10, 50, 100, 500] as const;
const GRID = 10;

/** SPEC 4.11 and 4.12: the starting bankroll and what a reset restores. */
const SPEC_STARTING_CHIPS = 1000;

/** SPEC 6's three tables, by the two numbers the betting rules use. */
interface SpecLimits {
  readonly id: TableId;
  readonly minimum: number;
  readonly maximum: number;
}

const LIMITS: readonly SpecLimits[] = [
  { id: 'bronze', minimum: 10, maximum: 100 },
  { id: 'silver', minimum: 50, maximum: 500 },
  { id: 'gold', minimum: 100, maximum: 2000 },
];

/** SPEC 4.11's ceiling, as this file reads it: min(table maximum, balance). */
function ceilingBySpec(maximum: number, chips: number): number {
  return Math.min(maximum, chips);
}

// ---------------------------------------------------------------------------
// Narrowing helpers, so a result is read rather than asserted around
// ---------------------------------------------------------------------------

function wagerOf(result: BetResult | CommitResult): number {
  if (!result.ok) {
    throw new Error(`expected an accepted wager, got the refusal ${result.reason}`);
  }
  return result.wager;
}

function reasonOf(result: BetResult | CommitResult): Refusal {
  if (result.ok) {
    throw new Error(`expected a refusal, got the wager ${String(result.wager)}`);
  }
  return result.reason;
}

type Wallet = ReturnType<typeof createWallet>;

/**
 * Every loop below is bounded, and that is not tidiness.
 *
 * A tap that clamped instead of refusing would stop moving the wager, and a
 * commit that stopped taking the wager out of the balance would leave a balance
 * that never falls. Either turns a `while` into a loop that never ends, and a
 * synchronous loop is not something a per-test timeout can interrupt. Counting
 * the turns makes both a loud failure, which is a detection.
 */
const LOOP_LIMIT = 1000;

/** Build a wager out of chip taps, largest first. Every tap must land. */
function place(wallet: Wallet, limits: TableLimits, target: number): void {
  const turn = bounded('building a wager out of chip taps', LOOP_LIMIT);
  for (const chip of [500, 100, 50, 10] as const) {
    while (wallet.readout().wager + chip <= target) {
      turn();
      expect(wagerOf(wallet.tap(chip, limits))).toBe(wallet.readout().wager);
    }
  }
  expect(wallet.readout().wager).toBe(target);
}

// ---------------------------------------------------------------------------
// The starting state, and the shape the identity is written in
// ---------------------------------------------------------------------------

describe('SPEC 4.11: a wallet starts at 1000 with nothing on the table', () => {
  it('starts where SPEC 4.11 says, with the four-term identity at the bankroll', () => {
    const state = createWallet().readout();
    expect(state.chips).toBe(SPEC_STARTING_CHIPS);
    expect(STARTING_CHIPS).toBe(SPEC_STARTING_CHIPS);
    expect(state.wager).toBe(NO_WAGER);
    expect(state.previousWager).toBe(NO_WAGER);
    expect(state.committed).toBe(0);
    expect(state.insuranceStake).toBe(0);
    expect(state.deferredStake).toBe(0);
    expect(state.conserved).toBe(SPEC_STARTING_CHIPS);
    expect(state.bestBalance).toBe(SPEC_STARTING_CHIPS);
    expect(state.hands).toEqual([]);
  });

  /**
   * The identity's shape, not its arithmetic. Two of the four terms cannot move
   * until `B11` at `BJ-8`, so the only thing a test can hold today is that they
   * are there to be moved: a readout narrowed back to `chips + committed` passes
   * every number in this file and fails the first insured round.
   */
  it('publishes all four terms of the conserved quantity and the sum of them', () => {
    const state = createWallet().readout();
    expect(Object.keys(state)).toEqual([
      'chips',
      'wager',
      'previousWager',
      'committed',
      'insuranceStake',
      'deferredStake',
      'conserved',
      'bestBalance',
      'hands',
    ]);
    expect(state.conserved).toBe(
      state.chips + state.committed + state.insuranceStake - state.deferredStake,
    );
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('carries SPEC 4.11 denominations and nothing else', () => {
    expect([...CHIP_DENOMINATIONS]).toEqual([...CHIPS]);
    expect(WAGER_GRID).toBe(GRID);
    for (const chip of CHIPS) {
      expect(isChipDenomination(chip)).toBe(true);
      expect(chip % GRID).toBe(0);
    }
    // The green chip SPEC 4.11 names and rejects, and the reason it is rejected
    // is item B14's arithmetic, not this file's.
    expect(isChipDenomination(25)).toBe(false);
    expect(isChipDenomination(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The chip tap: rejected, never clamped
// ---------------------------------------------------------------------------

/**
 * Wagers, chips and balances for the counted Bronze grid. 4 x 4 x 3 = 48.
 *
 * The 45 is deliberately off the 10 grid, because it is the balance that makes
 * the clamping control below produce a wager no chip tap could build.
 */
const TAP_WAGERS = [0, 50, 90, 100] as const;
const TAP_BALANCES = [45, 100, 5000] as const;

/**
 * Refusals in that grid, derived from SPEC 4.11's ceiling of min(100, balance).
 *
 * At a balance of 45 the ceiling is 45: from a wager of 0 only the 10 chip fits,
 * so 3 refusals, and from 50, 90 and 100 every chip is over, so 4 each. 15.
 * At a balance of 100 or 5000 the ceiling is 100: from 0 only the 500 chip is
 * over, so 1; from 50 the 100 and 500 chips are, so 2; from 90 only the 10 chip
 * fits, so 3; from 100 nothing fits, so 4. 1 + 2 + 3 + 4 = 10, twice over.
 * 15 + 10 + 10 = 35 refusals out of 48, leaving 13 taps accepted.
 */
const TAP_CASES = TAP_WAGERS.length * CHIPS.length * TAP_BALANCES.length;
const TAP_REFUSALS = 35;
const TAP_ACCEPTANCES = 13;

/** The wider property sweep: 9 wagers x 4 chips x 6 balances x 3 tables. */
const WIDE_WAGERS = [0, 10, 50, 90, 100, 400, 500, 1500, 2000] as const;
const WIDE_BALANCES = [0, 10, 60, 100, 1000, 5000] as const;
const WIDE_TAP_CASES = WIDE_WAGERS.length * CHIPS.length * WIDE_BALANCES.length * LIMITS.length;

describe('SPEC 4.11: a chip tap over the ceiling is rejected and changes nothing', () => {
  it('refuses exactly 35 of the 48 taps on the Bronze grid, and accepts 13', () => {
    const bronze = tableLimits('bronze');
    let refusals = 0;
    let acceptances = 0;
    let checked = 0;
    for (const wager of TAP_WAGERS) {
      for (const chip of CHIPS) {
        for (const chips of TAP_BALANCES) {
          checked += 1;
          const result = tapChip(wager, chip, bronze, chips);
          if (wager + chip > ceilingBySpec(100, chips)) {
            refusals += 1;
            expect(reasonOf(result)).toBe('above-ceiling');
          } else {
            acceptances += 1;
            expect(wagerOf(result)).toBe(wager + chip);
          }
        }
      }
    }
    expect(checked).toBe(TAP_CASES);
    expect(checked).toBe(48);
    expect(refusals).toBe(TAP_REFUSALS);
    expect(acceptances).toBe(TAP_ACCEPTANCES);
    expect(refusals + acceptances).toBe(48);
  });

  it('adds exactly the denomination or nothing at all, over all 648 cases', () => {
    let checked = 0;
    let refusals = 0;
    for (const table of LIMITS) {
      const limits = tableLimits(table.id);
      for (const wager of WIDE_WAGERS) {
        for (const chip of CHIPS) {
          for (const chips of WIDE_BALANCES) {
            checked += 1;
            const result = tapChip(wager, chip, limits, chips);
            const ceiling = ceilingBySpec(table.maximum, chips);
            if (wager + chip > ceiling) {
              refusals += 1;
              expect(result.ok).toBe(false);
              // A refusal carries no wager at all, so there is nothing for a
              // caller to mistake for a corrected one.
              expect(Object.keys(result)).toEqual(['ok', 'reason']);
            } else {
              expect(wagerOf(result)).toBe(wager + chip);
            }
          }
        }
      }
    }
    expect(checked).toBe(WIDE_TAP_CASES);
    expect(checked).toBe(648);
    // Both branches are really in the sweep, or the assertions above are half idle.
    expect(refusals).toBeGreaterThan(0);
    expect(refusals).toBeLessThan(checked);
  });

  /**
   * The control. A tap that clamps returns a legal-looking wager on exactly the
   * inputs the shipped one refuses, so every assertion about an accepted tap
   * agrees with it and the defect only shows as a wager the player did not
   * build. It also puts a wager off the 10 grid on the board wherever the
   * ceiling is not a multiple of 10.
   */
  it('disagrees with a clamping tap on every case, and only there', () => {
    const bronze = tableLimits('bronze');
    let clampedOffGrid = 0;
    let disagreements = 0;
    for (const wager of TAP_WAGERS) {
      for (const chip of CHIPS) {
        for (const chips of TAP_BALANCES) {
          const ceiling = ceilingBySpec(100, chips);
          const clamped = Math.min(wager + chip, ceiling);
          const result = tapChip(wager, chip, bronze, chips);
          if (wager + chip > ceiling) {
            disagreements += 1;
            expect(result.ok).toBe(false);
            expect(clamped).toBe(ceiling);
            if (ceiling % GRID !== 0) {
              clampedOffGrid += 1;
            }
          } else {
            expect(wagerOf(result)).toBe(clamped);
          }
        }
      }
    }
    expect(disagreements).toBe(TAP_REFUSALS);
    // The 15 refusals at a balance of 45 would all have clamped to 45, which is
    // a wager no chip tap can build and which owes 67.5 on a 3:2 natural.
    expect(clampedOffGrid).toBe(15);
  });

  it('leaves the wallet exactly as it was when it refuses', () => {
    const bronze = tableLimits('bronze');
    const wallet = createWallet();
    place(wallet, bronze, 90);
    const before = wallet.readout();
    expect(before.wager).toBe(90);

    const refused = wallet.tap(50, bronze);
    expect(reasonOf(refused)).toBe('above-ceiling');
    const after = wallet.readout();
    expect(after).toEqual(before);
    // Not raised to the ceiling, which is what a clamp would have done.
    expect(after.wager).toBe(90);
    expect(after.wager).not.toBe(100);

    // And the tap that does fit still lands, so the refusal above was about the
    // arithmetic and not about the wallet having stopped accepting taps.
    expect(wagerOf(wallet.tap(10, bronze))).toBe(100);
  });

  it('disables a chip whose denomination alone is over the ceiling, and no other', () => {
    const bronze = tableLimits('bronze');
    const gold = tableLimits('gold');
    // SPEC 4.11 disables the 500 chip at a Bronze table because 500 can never
    // be wagered there at any point in the round.
    expect(chipEnabled(500, bronze, 5000)).toBe(false);
    expect(chipEnabled(100, bronze, 5000)).toBe(true);
    // A chip that fits the table but not the balance is disabled too.
    expect(chipEnabled(100, gold, 60)).toBe(false);
    expect(chipEnabled(50, gold, 60)).toBe(true);
    // And a chip that fits both is enabled even where this tap would be refused,
    // which is the distinction: the tap is a thing the player may attempt.
    expect(chipEnabled(50, bronze, 5000)).toBe(true);
    expect(reasonOf(tapChip(90, 50, bronze, 5000))).toBe('above-ceiling');
  });

  it('refuses a denomination SPEC 4.11 does not offer rather than wagering it', () => {
    const bronze = tableLimits('bronze');
    const greenChip: number = 25;
    expect(() => tapChip(0, greenChip as ChipDenomination, bronze, 1000)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Max: the only control that computes, and it computes on the grid
// ---------------------------------------------------------------------------

/** 20 balances, either side of every table maximum and off the grid. */
const MAX_BALANCES = [
  0, 5, 9, 10, 11, 45, 49, 50, 99, 100, 101, 137, 499, 500, 999, 1000, 1999, 2000, 2001, 5000,
] as const;

const MAX_CASES = MAX_BALANCES.length * LIMITS.length;

/**
 * Where a `Max` without its floor disagrees: wherever the ceiling is not already
 * a multiple of 10.
 *
 * At Bronze the ceiling is min(100, balance), which is off the grid at 5, 9, 11,
 * 45, 49 and 99: 6. At Silver, min(500, balance), add 101, 137 and 499: 9. At
 * Gold, min(2000, balance), add 999 and 1999 to those: 11. 6 + 9 + 11 = 26.
 */
const UNFLOORED_DISAGREEMENTS = 26;

/**
 * Where a `Max` without its balance term disagrees: wherever the balance is
 * below the table maximum, since every maximum is already on the grid.
 *
 * Bronze has 9 of the 20 balances below 100, Silver 13 below 500 and Gold 17
 * below 2,000. 9 + 13 + 17 = 39.
 */
const TABLE_ONLY_DISAGREEMENTS = 39;

describe('SPEC 4.11: Max floors to the 10 grid and never passes the ceiling', () => {
  it('is the largest multiple of 10 at or below the ceiling, on all 60 cases', () => {
    let checked = 0;
    for (const table of LIMITS) {
      const limits = tableLimits(table.id);
      for (const chips of MAX_BALANCES) {
        checked += 1;
        const value = maxWager(limits, chips);
        const ceiling = ceilingBySpec(table.maximum, chips);
        expect(value % GRID).toBe(0);
        expect(value).toBeLessThanOrEqual(ceiling);
        expect(value + GRID).toBeGreaterThan(ceiling);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(wagerCeiling(limits, chips)).toBe(ceiling);
      }
    }
    expect(checked).toBe(MAX_CASES);
    expect(checked).toBe(60);
    // The two figures SPEC 4.11's own example turns on, written out.
    expect(maxWager(tableLimits('gold'), 137)).toBe(130);
    expect(maxWager(tableLimits('gold'), 5000)).toBe(2000);
    expect(maxWager(tableLimits('bronze'), 5000)).toBe(100);
    expect(maxWager(tableLimits('bronze'), 9)).toBe(0);
  });

  /** The control for the floor: without it, Max leaves the grid on 26 balances. */
  it('disagrees with an unfloored Max on exactly the 26 off-grid ceilings', () => {
    let disagreements = 0;
    for (const table of LIMITS) {
      const limits = tableLimits(table.id);
      for (const chips of MAX_BALANCES) {
        const ceiling = ceilingBySpec(table.maximum, chips);
        if (maxWager(limits, chips) !== ceiling) {
          disagreements += 1;
          expect(ceiling % GRID).not.toBe(0);
        }
      }
    }
    expect(disagreements).toBe(UNFLOORED_DISAGREEMENTS);
    expect(disagreements).toBe(26);
  });

  /** The control for the balance term: without it, Max wagers money that is not there. */
  it('disagrees with a table-only Max on exactly the 39 short balances', () => {
    let disagreements = 0;
    for (const table of LIMITS) {
      const limits = tableLimits(table.id);
      const tableOnly = Math.floor(table.maximum / GRID) * GRID;
      for (const chips of MAX_BALANCES) {
        if (maxWager(limits, chips) !== tableOnly) {
          disagreements += 1;
          expect(chips).toBeLessThan(table.maximum);
          // The control would have committed more than the wallet holds.
          expect(tableOnly).toBeGreaterThan(chips);
        }
      }
    }
    expect(disagreements).toBe(TABLE_ONLY_DISAGREEMENTS);
    expect(disagreements).toBe(39);
  });

  it('sets the wallet to what it computed, and to nothing else', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    expect(wagerOf(wallet.max(bronze))).toBe(100);
    expect(wallet.readout().wager).toBe(100);
    // Max again is idempotent: it computes from the balance, not from the board.
    expect(wagerOf(wallet.max(bronze))).toBe(100);
    expect(wagerOf(wallet.clear())).toBe(NO_WAGER);
    expect(wallet.readout().wager).toBe(NO_WAGER);
  });
});

// ---------------------------------------------------------------------------
// Repeat: the other control that computes
// ---------------------------------------------------------------------------

/** 8 previous wagers, including 0 for "no round has been dealt yet". */
const PREVIOUS_WAGERS = [0, 10, 50, 100, 200, 500, 1000, 2000] as const;
const REPEAT_BALANCES = [0, 9, 10, 50, 100, 250, 500, 1000, 2000, 5000] as const;
const REPEAT_CASES = PREVIOUS_WAGERS.length * REPEAT_BALANCES.length * LIMITS.length;

/**
 * Where reading "affordable" as the balance alone disagrees: wherever the
 * previous wager fits the balance and passes the table maximum.
 *
 * At Bronze, maximum 100, the previous wagers over it are 200, 500, 1,000 and
 * 2,000, affordable on 5, 4, 3 and 2 of the 10 balances: 14. At Silver, maximum
 * 500, they are 1,000 and 2,000, on 3 and 2: 5. At Gold, maximum 2,000, none.
 * 14 + 5 + 0 = 19.
 */
const BALANCE_ONLY_DISAGREEMENTS = 19;

/**
 * Where a Repeat that raised a small wager to the table minimum disagrees.
 *
 * Bronze's minimum is 10 and no previous wager in the grid is under it: 0. At
 * Silver, minimum 50, only a previous 10 is under it, accepted on the 8 balances
 * of 10 or more: 8. At Gold, minimum 100, a previous 10 on 8 balances and a
 * previous 50 on 7: 15. 0 + 8 + 15 = 23.
 */
const RAISED_TO_MINIMUM_DISAGREEMENTS = 23;

describe('SPEC 4.11: Repeat computes the previous wager, and only a legal one', () => {
  it('agrees with the criterion on all 240 cases', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const table of LIMITS) {
      const limits = tableLimits(table.id);
      for (const previous of PREVIOUS_WAGERS) {
        for (const chips of REPEAT_BALANCES) {
          checked += 1;
          const result = repeatWager(previous, limits, chips);
          const ceiling = ceilingBySpec(table.maximum, chips);
          if (previous <= 0) {
            if (result.ok || result.reason !== 'nothing-to-repeat') {
              wrong.push(`${table.id}: nothing to repeat at ${String(chips)}`);
            }
          } else if (previous > ceiling) {
            if (result.ok || result.reason !== 'above-ceiling') {
              wrong.push(`${table.id}: ${String(previous)} over ${String(ceiling)}`);
            }
          } else if (!result.ok || result.wager !== previous) {
            wrong.push(`${table.id}: ${String(previous)} on ${String(chips)}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(checked).toBe(REPEAT_CASES);
    expect(checked).toBe(240);
  });

  /**
   * The control for reading "affordable" as the balance alone. It is the reading
   * SPEC 4.11's word invites and it produces an illegal wager the first time a
   * player carries a Gold wager to a Silver table, which is exactly what "only
   * Max and Repeat compute a value, and they compute a legal one" forbids.
   */
  it('disagrees with a balance-only Repeat on exactly the 19 over-maximum cases', () => {
    let disagreements = 0;
    for (const table of LIMITS) {
      const limits = tableLimits(table.id);
      for (const previous of PREVIOUS_WAGERS) {
        for (const chips of REPEAT_BALANCES) {
          const shipped = repeatWager(previous, limits, chips);
          const balanceOnly = previous > 0 && previous <= chips;
          if (shipped.ok !== balanceOnly) {
            disagreements += 1;
            expect(shipped.ok).toBe(false);
            expect(previous).toBeGreaterThan(table.maximum);
            expect(previous).toBeLessThanOrEqual(chips);
          }
        }
      }
    }
    expect(disagreements).toBe(BALANCE_ONLY_DISAGREEMENTS);
    expect(disagreements).toBe(19);
  });

  /**
   * The other reading, and the one the traps warn about. SPEC 4.11 blocks Deal
   * below the table minimum rather than raising the wager to it, so `Repeat`
   * hands back the small wager and the player taps up. A `Repeat` that raised it
   * would be the same defect as a clamping tap, in the one control allowed to
   * compute.
   */
  it('hands back a below-minimum wager rather than raising it, on 23 cases', () => {
    let belowMinimum = 0;
    for (const table of LIMITS) {
      const limits = tableLimits(table.id);
      for (const previous of PREVIOUS_WAGERS) {
        for (const chips of REPEAT_BALANCES) {
          const shipped = repeatWager(previous, limits, chips);
          if (shipped.ok && shipped.wager < table.minimum) {
            belowMinimum += 1;
            expect(shipped.wager).toBe(previous);
            expect(shipped.wager).not.toBe(table.minimum);
            // And Deal then refuses it, which is where the minimum belongs.
            expect(dealRefusal(shipped.wager, limits, chips)).toBe('below-minimum');
          }
        }
      }
    }
    expect(belowMinimum).toBe(RAISED_TO_MINIMUM_DISAGREEMENTS);
    expect(belowMinimum).toBe(23);
  });

  it('has nothing to repeat before the first deal, and the last initial wager after it', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    expect(reasonOf(wallet.repeat(bronze))).toBe('nothing-to-repeat');
    expect(wallet.readout().wager).toBe(NO_WAGER);

    place(wallet, bronze, 60);
    expect(wagerOf(wallet.commitInitial(bronze))).toBe(60);
    // The controls empty at the deal, which is what leaves Repeat something to do.
    expect(wallet.readout().wager).toBe(NO_WAGER);
    expect(wallet.readout().previousWager).toBe(60);
    wallet.settleHand(0, 60);
    wallet.endRound();
    expect(wagerOf(wallet.repeat(bronze))).toBe(60);
    expect(wallet.readout().wager).toBe(60);
  });

  it('repeats the initial wager and not what a double left the hand carrying', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    place(wallet, bronze, 50);
    wallet.commitInitial(bronze);
    wallet.commitDouble(0);
    expect(wallet.readout().hands[0]?.wager).toBe(100);
    // SPEC 4.11: the initial wager is the one the table governs and the one the
    // insurance stake is half of, so it is the one Repeat repeats.
    expect(wallet.readout().previousWager).toBe(50);
    wallet.settleHand(0, -100);
    wallet.endRound();
    expect(wagerOf(wallet.repeat(bronze))).toBe(50);
  });

  it('refuses a repeat the current table or balance cannot take, changing nothing', () => {
    const wallet = createWallet();
    const gold = tableLimits('gold');
    const bronze = tableLimits('bronze');
    place(wallet, gold, 500);
    wallet.commitInitial(gold);
    wallet.settleHand(0, 500);
    wallet.endRound();
    expect(wallet.readout().previousWager).toBe(500);

    const before = wallet.readout();
    expect(reasonOf(wallet.repeat(bronze))).toBe('above-ceiling');
    expect(wallet.readout()).toEqual(before);
    expect(wallet.readout().wager).toBe(NO_WAGER);
  });
});

// ---------------------------------------------------------------------------
// Deal: blocked below the minimum, never raised to it
// ---------------------------------------------------------------------------

describe('SPEC 4.11: Deal is blocked below the table minimum, never raised to it', () => {
  it('names the reason for each of the four ways a wager can be invalid', () => {
    const silver = tableLimits('silver');
    expect(dealRefusal(0, silver, 1000)).toBe('no-wager');
    expect(dealRefusal(-10, silver, 1000)).toBe('no-wager');
    expect(dealRefusal(25, silver, 1000)).toBe('off-grid');
    expect(dealRefusal(510, silver, 1000)).toBe('above-ceiling');
    expect(dealRefusal(300, silver, 200)).toBe('above-ceiling');
    expect(dealRefusal(40, silver, 1000)).toBe('below-minimum');
    expect(dealRefusal(50, silver, 1000)).toBeNull();
    expect(dealRefusal(500, silver, 1000)).toBeNull();
  });

  /**
   * Where both bounds are broken at once, which is the only place the order of
   * the two checks is visible.
   *
   * A balance below the table minimum breaks both together: every wager the
   * minimum would accept is already more money than there is. The two checks
   * swapped answer identically on every other input, so without these four cases
   * the documented order is a comment rather than a property. SPEC 4.11 makes
   * the ceiling the bound a tap enforces, so the honest answer is that the money
   * is not there; "below the minimum" would send the player to tap chips up,
   * which is the one move that cannot help them here.
   */
  it('answers above-ceiling first where a wager breaks both bounds', () => {
    const probes = [
      { table: 'silver', wager: 10, chips: 5 },
      { table: 'silver', wager: 40, chips: 30 },
      { table: 'gold', wager: 90, chips: 60 },
      { table: 'gold', wager: 10, chips: 5 },
    ] as const;
    let pinned = 0;
    for (const probe of probes) {
      const spec = LIMITS.find((table) => table.id === probe.table);
      expect(spec).toBeDefined();
      if (spec === undefined) {
        continue;
      }
      // Both bounds really are broken, or the case is not the one being pinned.
      expect(probe.wager).toBeGreaterThan(ceilingBySpec(spec.maximum, probe.chips));
      expect(probe.wager).toBeLessThan(spec.minimum);
      expect(probe.wager % GRID).toBe(0);
      expect(dealRefusal(probe.wager, tableLimits(spec.id), probe.chips)).toBe('above-ceiling');
      pinned += 1;
    }
    expect(pinned).toBe(probes.length);
    expect(pinned).toBe(4);
  });

  it('refuses the commit and leaves the board exactly where it was', () => {
    const wallet = createWallet();
    const silver = tableLimits('silver');
    place(wallet, silver, 10);
    const before = wallet.readout();

    const result = wallet.commitInitial(silver);
    expect(reasonOf(result)).toBe('below-minimum');
    const after = wallet.readout();
    expect(after).toEqual(before);
    // Not raised to 50, which is the trap. The chips are still in the balance,
    // no hand exists, and Repeat has nothing to repeat.
    expect(after.wager).toBe(10);
    expect(after.chips).toBe(SPEC_STARTING_CHIPS);
    expect(after.committed).toBe(0);
    expect(after.hands).toEqual([]);
    expect(after.previousWager).toBe(NO_WAGER);

    // Tapping up to the minimum is the player's move, and then it deals.
    place(wallet, silver, 50);
    expect(wagerOf(wallet.commitInitial(silver))).toBe(50);
  });

  it('refuses an empty board rather than dealing at nothing', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    expect(reasonOf(wallet.commitInitial(bronze))).toBe('no-wager');
    expect(wallet.readout().hands).toEqual([]);
    expect(wallet.readout().chips).toBe(SPEC_STARTING_CHIPS);
  });

  /**
   * `settle()` is a total function and answers any wager, including one off the
   * 10 grid, so the grid has to be held here. No control in this module can
   * build one, which is precisely why the commit checks again: the defect this
   * catches arrives from a caller, not from a tap.
   */
  it('refuses an off-grid wager even though no control can build one', () => {
    for (const table of LIMITS) {
      const limits = tableLimits(table.id);
      for (const wager of [5, 15, 25, 55, 105, 999] as const) {
        if (wager % GRID === 0) {
          continue;
        }
        expect(dealRefusal(wager, limits, 5000)).toBe('off-grid');
      }
    }
    // Every wager the controls can build clears the grid check by construction.
    const wallet = createWallet();
    const gold = tableLimits('gold');
    for (const chip of CHIPS) {
      wallet.tap(chip, gold);
      expect(wallet.readout().wager % GRID).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// The wager leaves the balance, and the identity moves only by a settled outcome
// ---------------------------------------------------------------------------

/** One round of the conservation script. */
interface Plan {
  readonly wager: number;
  /** Which hand index to split, in order. Each adds one hand. */
  readonly splits: readonly number[];
  /** Which hand index to double, in order. */
  readonly doubles: readonly number[];
  /** The net on each hand, in hand order. SPEC 4.10 produces these. */
  readonly nets: readonly number[];
  /** Chip taps needed to build the wager, largest denomination first. */
  readonly taps: number;
}

/**
 * Six rounds at a Bronze table, chosen so every commitment path is exercised and
 * the nets cancel: +100, then -50 and +50, then +20, then -100, +100 and 0, then
 * -60, then -60. The sum is zero, so the balance ends where it started.
 */
const PLANS: readonly Plan[] = [
  { wager: 100, splits: [], doubles: [], nets: [100], taps: 1 },
  { wager: 50, splits: [0], doubles: [], nets: [-50, 50], taps: 1 },
  { wager: 10, splits: [], doubles: [0], nets: [20], taps: 1 },
  { wager: 100, splits: [0, 1], doubles: [], nets: [-100, 100, 0], taps: 1 },
  { wager: 60, splits: [], doubles: [], nets: [-60], taps: 2 },
  { wager: 30, splits: [], doubles: [0], nets: [-60], taps: 3 },
];

/**
 * Wallet calls the script makes: per plan, its taps plus one commit, one call
 * per split and per double, one settlement per hand and one round boundary.
 * 4 + 6 + 5 + 8 + 5 + 7 = 35.
 */
const SCRIPT_CALLS = 35;

/** The highest balance the script reaches, and so the mark it leaves behind. */
const SCRIPT_BEST_BALANCE = 1120;

/** One step of the script, for the checker below. */
interface Step {
  readonly kind: 'bet' | 'commit' | 'settle' | 'boundary';
  readonly moved: number;
  readonly net: number;
}

/**
 * Steps whose movement no settled outcome explains. SPEC 4.11: the conserved
 * quantity moves by a settlement's net and by nothing else.
 */
function unexplained(steps: readonly Step[]): string[] {
  return steps
    .filter((step) => step.moved !== (step.kind === 'settle' ? step.net : 0))
    .map((step) => `${step.kind} moved ${String(step.moved)} against ${String(step.net)}`);
}

describe('SPEC 4.11: the wager leaves the balance and the identity moves only on a settlement', () => {
  it('runs the six-round script with every step explained by its net', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    const steps: Step[] = [];
    let calls = 0;

    /** Record one wallet call: what moved, and what should have. */
    function step(kind: Step['kind'], net: number, act: () => void): void {
      const before = wallet.readout().conserved;
      act();
      calls += 1;
      steps.push({ kind, moved: wallet.readout().conserved - before, net });
    }

    for (const plan of PLANS) {
      let taps = 0;
      const turn = bounded('building the round wager', LOOP_LIMIT);
      for (const chip of [500, 100, 50, 10] as const) {
        while (wallet.readout().wager + chip <= plan.wager) {
          turn();
          step('bet', 0, () => {
            expect(wallet.tap(chip, bronze).ok).toBe(true);
          });
          taps += 1;
        }
      }
      expect(taps).toBe(plan.taps);
      expect(wallet.readout().wager).toBe(plan.wager);

      step('commit', 0, () => {
        expect(wagerOf(wallet.commitInitial(bronze))).toBe(plan.wager);
      });
      for (const hand of plan.splits) {
        step('commit', 0, () => {
          expect(wallet.commitSplit(hand).ok).toBe(true);
        });
      }
      for (const hand of plan.doubles) {
        step('commit', 0, () => {
          expect(wallet.commitDouble(hand).ok).toBe(true);
        });
      }
      expect(wallet.readout().hands.length).toBe(plan.nets.length);

      plan.nets.forEach((net, hand) => {
        step('settle', net, () => {
          const held = wallet.readout().hands[hand]?.wager ?? 0;
          expect(wallet.settleHand(hand, net)).toBe(held + net);
        });
      });
      step('boundary', 0, () => {
        wallet.endRound();
      });
      expect(wallet.readout().committed).toBe(0);
      expect(wallet.readout().hands).toEqual([]);
    }

    expect(unexplained(steps)).toEqual([]);
    expect(calls).toBe(SCRIPT_CALLS);
    expect(calls).toBe(35);
    // The nets cancel, so the balance is back where it started.
    expect(wallet.readout().chips).toBe(SPEC_STARTING_CHIPS);
    expect(wallet.readout().conserved).toBe(SPEC_STARTING_CHIPS);
    expect(wallet.readout().bestBalance).toBe(SCRIPT_BEST_BALANCE);
  });

  /**
   * The checker's own control. A checker that found nothing wrong in a correct
   * script has proved only that it was pointed at one.
   */
  it('flags a commit that moved the quantity and a settlement that overpaid', () => {
    expect(unexplained([{ kind: 'commit', moved: -100, net: 0 }])).not.toEqual([]);
    expect(unexplained([{ kind: 'settle', moved: 110, net: 100 }])).not.toEqual([]);
    expect(unexplained([{ kind: 'boundary', moved: 1, net: 0 }])).not.toEqual([]);
    expect(unexplained([{ kind: 'bet', moved: -10, net: 0 }])).not.toEqual([]);
    expect(unexplained([{ kind: 'settle', moved: -50, net: -50 }])).toEqual([]);
  });

  it('takes the wager out of the balance at the deal and credits back wager plus net', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    place(wallet, bronze, 100);
    wallet.commitInitial(bronze);
    expect(wallet.readout().chips).toBe(900);
    expect(wallet.readout().committed).toBe(100);
    expect(wallet.readout().conserved).toBe(SPEC_STARTING_CHIPS);

    // A lost hand credits back nothing. It is not subtracted a second time.
    expect(wallet.settleHand(0, -100)).toBe(0);
    expect(wallet.readout().chips).toBe(900);
    expect(wallet.readout().committed).toBe(0);

    // A push credits back the wager exactly, and a natural credits 2.5 times it.
    wallet.endRound();
    place(wallet, bronze, 100);
    wallet.commitInitial(bronze);
    expect(wallet.settleHand(0, 0)).toBe(100);
    expect(wallet.readout().chips).toBe(900);
    wallet.endRound();
    place(wallet, bronze, 100);
    wallet.commitInitial(bronze);
    expect(wallet.settleHand(0, 150)).toBe(250);
    expect(wallet.readout().chips).toBe(1050);
  });

  /**
   * SPEC 4.10 returns a negative zero on five of its paths at a wager of zero,
   * which no table allows but which a soak driving the ladder directly can hand
   * back. `-0 === 0` is true while `Object.is(-0, 0)` is false, so the credit is
   * compared with `===` rather than with the runner's identity assertion.
   */
  it('credits a net of negative zero as a zero delta', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    place(wallet, bronze, 100);
    wallet.commitInitial(bronze);
    const credit = wallet.settleHand(0, -0);
    expect(credit === 100).toBe(true);
    expect(wallet.readout().chips === SPEC_STARTING_CHIPS).toBe(true);

    wallet.endRound();
    place(wallet, bronze, 100);
    wallet.commitInitial(bronze);
    // A total loss credits exactly zero, and the sign of that zero is not a fact
    // about the wallet worth asserting either way.
    const nothing = wallet.settleHand(0, -100);
    expect(nothing === 0).toBe(true);
    expect(wallet.readout().chips === 900).toBe(true);
  });

  it('never lets the balance go negative across the whole script', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    let lowest = wallet.readout().chips;
    for (let round = 0; round < 40; round += 1) {
      const target = maxWager(bronze, wallet.readout().chips);
      if (target < 10) {
        break;
      }
      place(wallet, bronze, target);
      wallet.commitInitial(bronze);
      lowest = Math.min(lowest, wallet.readout().chips);
      wallet.settleHand(0, -target);
      lowest = Math.min(lowest, wallet.readout().chips);
      wallet.endRound();
    }
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(wallet.readout().chips).toBe(0);
    expect(wallet.readout().conserved).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Splits and doubles: funded by the balance, and not governed by the table
// ---------------------------------------------------------------------------

describe('SPEC 4.11: only the initial wager is governed by the table maximum', () => {
  it('lets a split and a double carry the total committed above it', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    place(wallet, bronze, 100);
    expect(wagerOf(wallet.commitInitial(bronze))).toBe(100);
    expect(wagerOf(wallet.commitSplit(0))).toBe(100);
    expect(wagerOf(wallet.commitDouble(0))).toBe(200);
    const state = wallet.readout();
    expect(state.committed).toBe(300);
    // Three times the table maximum, which SPEC 4.11 allows in as many words.
    expect(state.committed).toBeGreaterThan(100);
    expect(state.chips).toBe(700);
    expect(state.conserved).toBe(SPEC_STARTING_CHIPS);
    expect(state.hands.map((hand) => hand.wager)).toEqual([200, 100]);
  });

  it('refuses a split or a double the balance cannot fund, changing nothing', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    // Spend down to 40 chips, then commit 40 of them so the balance is empty.
    for (let round = 0; round < 24; round += 1) {
      place(wallet, bronze, 40);
      wallet.commitInitial(bronze);
      wallet.settleHand(0, -40);
      wallet.endRound();
    }
    expect(wallet.readout().chips).toBe(40);
    place(wallet, bronze, 40);
    wallet.commitInitial(bronze);
    expect(wallet.readout().chips).toBe(0);

    const before = wallet.readout();
    expect(reasonOf(wallet.commitDouble(0))).toBe('insufficient-chips');
    expect(wallet.readout()).toEqual(before);
    expect(reasonOf(wallet.commitSplit(0))).toBe('insufficient-chips');
    expect(wallet.readout()).toEqual(before);
    expect(wallet.readout().hands.length).toBe(1);
  });

  it('funds a double at exactly the balance it needs and not one chip more', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    for (let round = 0; round < 22; round += 1) {
      place(wallet, bronze, 40);
      wallet.commitInitial(bronze);
      wallet.settleHand(0, -40);
      wallet.endRound();
    }
    expect(wallet.readout().chips).toBe(120);
    place(wallet, bronze, 60);
    wallet.commitInitial(bronze);
    expect(wallet.readout().chips).toBe(60);
    expect(wagerOf(wallet.commitDouble(0))).toBe(120);
    expect(wallet.readout().chips).toBe(0);
    expect(wallet.readout().committed).toBe(120);
    expect(wallet.readout().conserved).toBe(120);
  });

  it('funds a split at exactly the balance it needs, for the same reason', () => {
    const wallet = createWallet();
    const gold = tableLimits('gold');
    place(wallet, gold, 500);
    wallet.commitInitial(gold);
    expect(wallet.readout().chips).toBe(500);
    expect(wagerOf(wallet.commitSplit(0))).toBe(500);
    expect(wallet.readout().chips).toBe(0);
    expect(wallet.readout().hands.map((hand) => hand.wager)).toEqual([500, 500]);
    expect(wallet.readout().committed).toBe(1000);
    expect(wallet.readout().conserved).toBe(SPEC_STARTING_CHIPS);
  });

  it('settles each hand of a split independently against its own wager', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    place(wallet, bronze, 50);
    wallet.commitInitial(bronze);
    wallet.commitSplit(0);
    wallet.commitDouble(1);
    expect(wallet.readout().hands.map((hand) => hand.wager)).toEqual([50, 100]);
    expect(wallet.readout().committed).toBe(150);

    expect(wallet.settleHand(0, 50)).toBe(100);
    expect(wallet.readout().committed).toBe(100);
    expect(wallet.readout().hands[0]?.settled).toBe(true);
    expect(wallet.readout().hands[0]?.wager).toBe(50);
    expect(wallet.settleHand(1, -100)).toBe(0);
    expect(wallet.readout().committed).toBe(0);
    expect(wallet.readout().chips).toBe(950);
  });
});

// ---------------------------------------------------------------------------
// The round boundary and the reset, as disciplines rather than as offers
// ---------------------------------------------------------------------------

describe('SPEC 4.10 and 4.12: the boundary and the reset refuse to lose money', () => {
  it('refuses to close a round with a hand still committed', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    place(wallet, bronze, 50);
    wallet.commitInitial(bronze);
    wallet.commitSplit(0);
    wallet.settleHand(0, 0);
    expect(() => {
      wallet.endRound();
    }).toThrow(RangeError);
    wallet.settleHand(1, 0);
    wallet.endRound();
    expect(wallet.readout().conserved).toBe(SPEC_STARTING_CHIPS);
  });

  it('refuses a second settlement of the same hand, and an index no hand carries', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    place(wallet, bronze, 50);
    wallet.commitInitial(bronze);
    wallet.settleHand(0, 0);
    expect(() => wallet.settleHand(0, 0)).toThrow(RangeError);
    expect(() => wallet.settleHand(1, 0)).toThrow(RangeError);
    expect(() => wallet.commitDouble(4)).toThrow(RangeError);
  });

  it('refuses a second initial wager inside one round', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    place(wallet, bronze, 50);
    wallet.commitInitial(bronze);
    place(wallet, bronze, 50);
    expect(() => wallet.commitInitial(bronze)).toThrow(RangeError);
  });

  it('refuses a reset mid-round, which would create the difference out of nothing', () => {
    const wallet = createWallet();
    const bronze = tableLimits('bronze');
    place(wallet, bronze, 50);
    wallet.commitInitial(bronze);
    expect(() => {
      wallet.reset();
    }).toThrow(RangeError);
    wallet.settleHand(0, -50);
    wallet.endRound();
    wallet.reset();
    expect(wallet.readout().chips).toBe(SPEC_STARTING_CHIPS);
  });

  /**
   * `endRound` refuses two states and `reset` refuses the same two, which is
   * what its doc-block claims. The stake arm is unreachable through `table.ts`
   * (it only takes a side wager with a hand in play), so it is driven straight
   * at the wallet: the point of the guard is that the wallet does not lean on
   * the caller's shape for a term the identity is still counting.
   */
  it('refuses a reset with a side wager still open, on both terms', () => {
    const funded = createWallet();
    funded.takeInsurance(100);
    expect(funded.readout().insuranceStake).toBe(100);
    expect(funded.readout().hands).toEqual([]);
    expect(() => {
      funded.endRound();
    }).toThrow(RangeError);
    expect(() => {
      funded.reset();
    }).toThrow(RangeError);
    // Nothing moved: the refusal is the whole behaviour.
    expect(funded.readout().chips).toBe(SPEC_STARTING_CHIPS - 100);
    expect(funded.readout().conserved).toBe(SPEC_STARTING_CHIPS);

    // The fourth term on its own: a stake larger than the balance funds what it
    // can and defers the rest, and the deferred remainder is money still owed.
    const deferred = createWallet();
    deferred.takeInsurance(SPEC_STARTING_CHIPS + 500);
    expect(deferred.readout().deferredStake).toBe(500);
    expect(deferred.readout().insuranceStake).toBe(SPEC_STARTING_CHIPS + 500);
    expect(() => {
      deferred.reset();
    }).toThrow(RangeError);
    expect(deferred.readout().conserved).toBe(SPEC_STARTING_CHIPS);
  });

  it('clears the board on a reset, since the wager was built at the old table', () => {
    const wallet = createWallet();
    const gold = tableLimits('gold');
    // The whole bankroll, which is Gold's ceiling on a fresh account.
    place(wallet, gold, 1000);
    expect(wallet.readout().wager).toBe(1000);
    wallet.reset();
    expect(wallet.readout().wager).toBe(NO_WAGER);
    expect(wallet.readout().chips).toBe(SPEC_STARTING_CHIPS);
    expect(wallet.readout().conserved).toBe(SPEC_STARTING_CHIPS);
  });
});
