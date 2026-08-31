/**
 * Items J1 and J2, both Major, 11 and 8 points.
 *
 *   J1: "Three tables exist with the specified minimums, maximums and unlock
 *        thresholds, and a table cannot be entered without meeting its threshold
 *        and affording its minimum. Every table minimum is at or below the 1000
 *        starting bankroll, so the launch fallback in SPEC 13 is unreachable,
 *        and a test asserts that so raising a minimum above 1000 fails loudly."
 *
 *   J2: "Table unlocks are keyed to the best chip balance ever reached and
 *        survive a bust and a bankroll reset."
 *
 * SPEC 6, SPEC 4.12 and SPEC 13. Both criteria are read clause by clause below
 * and every expected figure is written out from the spec, never imported from
 * the module under test: a sweep that took its thresholds from `TABLES` would
 * shrink to match a threshold that moved and still pass.
 *
 * **Three claims here are about an absence, so each one gets a control.** "A
 * table cannot be entered without meeting its threshold" and "without affording
 * its minimum" are two halves of one predicate, and a predicate missing either
 * half answers correctly for every input that fails the other; "the highest
 * unlocked table" is invisible to any input where only one table is enterable.
 * So a threshold-blind predicate, an affordability-blind predicate and a
 * lowest-first fallback are written out and run beside the shipped ones over the
 * same sweep, each required to disagree on **exactly** its own derived set.
 *
 * **J1's last clause is a requirement about this file.** "A test asserts that,
 * so raising a minimum above 1000 fails loudly" is graded on the test existing
 * and failing, so the minima are asserted directly against 1,000 *and* SPEC 13's
 * fallback is driven over every consistent launch and required never to fire.
 * Raising any minimum past 1,000 fails both.
 *
 * **Scope.** The screens are not here. The bust-out offer of SPEC 4.12 and the
 * start screen's table chooser of SPEC 6 are both graded by `C4` at
 * `BJ-20`. That the balance is not persisted while the
 * unlocks are is `I4` at `BJ-20` and `I1` to `I3` at `BJ-11`. A reset also
 * preserves lifetime statistics and milestones, which live in other modules:
 * `statistics.ts` is built at `BJ-10`, `J6` grades the milestones and `J5` the
 * hand history, while the preservation and the persistence of the statistics
 * themselves are `C4` and `I4` at `BJ-20`. This file asserts only what the
 * wallet itself carries. The betting arithmetic is in
 * `tests/unit/wallet.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { bounded } from './support/drive';

import type { TableId } from '../../src/core/wallet';
import {
  LOWEST_TABLE,
  STARTING_CHIPS,
  TABLES,
  bustOut,
  canEnter,
  createWallet,
  highestEnterableTable,
  isTableId,
  isUnlocked,
  launchTable,
  tableLimits,
  unlockedTables,
} from '../../src/core/wallet';

// ---------------------------------------------------------------------------
// SPEC 6's table, written out
// ---------------------------------------------------------------------------

/** One row of SPEC 6 as this file reads it, in the order SPEC 6 prints them. */
interface SpecRow {
  readonly id: string;
  readonly minimum: number;
  readonly maximum: number;
  /** SPEC 6's "unlocked at", with Bronze's "always" written as 0. */
  readonly unlocksAt: number;
}

const SPEC_6: readonly SpecRow[] = [
  { id: 'bronze', minimum: 10, maximum: 100, unlocksAt: 0 },
  { id: 'silver', minimum: 50, maximum: 500, unlocksAt: 2500 },
  { id: 'gold', minimum: 100, maximum: 2000, unlocksAt: 10000 },
];

/** SPEC 4.11 and SPEC 4.12: the starting bankroll, and what a reset restores. */
const SPEC_STARTING_CHIPS = 1000;

// ---------------------------------------------------------------------------
// The sweep, and the counts derived from its shape
// ---------------------------------------------------------------------------

/**
 * High-water marks, chosen to sit either side of both thresholds and on them.
 * SPEC 6's thresholds are inclusive, so 2,499, 2,500, 9,999 and 10,000 are all
 * here and a comparison that slipped to `>` would move two of them.
 */
const BEST_BALANCES = [0, 1, 999, 1000, 2499, 2500, 2501, 9999, 10000, 10001, 25000] as const;

/** Balances either side of every minimum, and on each of them. */
const CHIP_BALANCES = [0, 5, 9, 10, 11, 49, 50, 51, 99, 100, 101, 500, 1000, 2000] as const;

/** 3 tables x 11 marks x 14 balances. */
const ENTRY_CASES = SPEC_6.length * BEST_BALANCES.length * CHIP_BALANCES.length;

/**
 * Where a threshold-blind predicate disagrees: locked, and yet affordable.
 *
 * Bronze is never locked, so it contributes nothing. Silver is locked below
 * 2,500, which is 5 of the 11 marks, and affordable at 50 or more, which is 8 of
 * the 14 balances: 40. Gold is locked below 10,000, 8 marks, and affordable at
 * 100 or more, 5 balances: another 40. 0 + 40 + 40 = 80.
 */
const THRESHOLD_BLIND_DISAGREEMENTS = 80;

/**
 * Where an affordability-blind predicate disagrees: unlocked, and yet short.
 *
 * Bronze is unlocked at all 11 marks and unaffordable below 10, which is 3 of
 * the 14 balances: 33. Silver is unlocked at 6 marks and short below 50, 6
 * balances: 36. Gold is unlocked at 3 marks and short below 100, 9 balances:
 * 27. 33 + 36 + 27 = 96.
 */
const AFFORDABILITY_BLIND_DISAGREEMENTS = 96;

/** 11 marks x 14 balances, with no table dimension. */
const FALLBACK_CASES = BEST_BALANCES.length * CHIP_BALANCES.length;

/**
 * Where a lowest-first fallback disagrees with a highest-first one: wherever two
 * or more tables are enterable at once.
 *
 * Silver enterable implies Bronze enterable, since 50 chips clear a 10 minimum,
 * and Gold enterable implies Silver enterable on both counts. So two or more are
 * enterable exactly when Silver is: 6 marks at or above 2,500, crossed with the
 * 8 balances at or above 50. 6 x 8 = 48.
 */
const FALLBACK_ORDER_DISAGREEMENTS = 48;

/**
 * Launches whose persisted table the high-water mark actually unlocks, which is
 * the only kind SPEC 13 persists: Bronze at all 11 marks, Silver at the 6 at or
 * above 2,500, Gold at the 3 at or above 10,000. 11 + 6 + 3 = 20, leaving 13 of
 * the 33 pairs inconsistent.
 */
const CONSISTENT_LAUNCHES = 20;
const INCONSISTENT_LAUNCHES = SPEC_6.length * BEST_BALANCES.length - CONSISTENT_LAUNCHES;

/**
 * The balance the reading control below starts its split round on.
 *
 * Fourteen wins of 100 from the 1,000 starting bankroll reach 2,400, and one win
 * of 50 reaches 2,450: `1000 + 14 x 100 + 50`. That is 50 short of SPEC 6's
 * Silver threshold, which is the margin the whole control turns on.
 */
const WINS_OF_100 = 14;
const MARK_BEFORE_SPLIT = 2450;

/**
 * What the other reading peaks at during that split round.
 *
 * The round commits 100 twice. When the first hand is paid the balance is back
 * at 2,450 and the second hand's 100 is still on the table, so a mark reading
 * `chips + committed` sees `2450 + 100`. The threshold sits strictly between the
 * two figures: 2,450 < 2,500 <= 2,550.
 */
const COMMITTED_READING_PEAK = 2550;

/**
 * SPEC 4.6's split limit, transcribed rather than imported.
 *
 * `MAX_SPLITS` is private to `src/core/table.ts`, and importing it here would
 * be the wrong direction anyway: the figure below is what SPEC 4.6 says, and
 * `tests/unit/split.test.ts` carries the same transcription and drives the real
 * machine to `MAX_SPLITS + 1` hands with it, so the transcription is already
 * pinned to the code somewhere that a divergence fails loudly.
 */
const SPEC_MAX_SPLITS = 3;

/**
 * How many rounds of maximum winning it would take to leave the safe integers.
 *
 * A billion is not a threshold anybody will approach; it is a floor chosen far
 * enough above any reachable play that only a structural change to the table
 * set or the split limit can breach it.
 */
const SAFE_ROUNDS_FLOOR = 1e9;

// ---------------------------------------------------------------------------
// The predicates this file reads out of SPEC 6, and the controls
// ---------------------------------------------------------------------------

function row(id: string): SpecRow {
  const found = SPEC_6.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new RangeError(`${id} is not one of SPEC 6's three tables`);
  }
  return found;
}

/** J1's entry rule, both halves, written from the criterion. */
function entersBySpec(id: string, bestBalance: number, chips: number): boolean {
  const table = row(id);
  return bestBalance >= table.unlocksAt && chips >= table.minimum;
}

/** The control that forgot the threshold. It seats a player at a locked table. */
function entersIgnoringThreshold(id: string, chips: number): boolean {
  return chips >= row(id).minimum;
}

/** The control that forgot the money. It seats a player who cannot post a bet. */
function entersIgnoringAffordability(id: string, bestBalance: number): boolean {
  return bestBalance >= row(id).unlocksAt;
}

/** SPEC 13's fallback, scanned from the wrong end. */
function lowestEnterableBySpec(bestBalance: number, chips: number): string | null {
  const found = SPEC_6.find((table) => bestBalance >= table.unlocksAt && chips >= table.minimum);
  return found === undefined ? null : found.id;
}

/** SPEC 13's fallback as written: the highest unlocked table the balance affords. */
function highestEnterableBySpec(bestBalance: number, chips: number): string | null {
  for (let index = SPEC_6.length - 1; index >= 0; index -= 1) {
    const table = SPEC_6[index];
    if (table !== undefined && bestBalance >= table.unlocksAt && chips >= table.minimum) {
      return table.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Driving a wallet, for the clauses that are about a history and not a number
// ---------------------------------------------------------------------------

type Wallet = ReturnType<typeof createWallet>;

/**
 * Every loop below is bounded, and that is not tidiness.
 *
 * A test that drives a wallet until a balance moves is a test a mutation can
 * hang: a commit that stopped taking the wager out of the balance never reaches
 * zero, and a synchronous loop is not something a per-test timeout can
 * interrupt. Counting the turns turns that into a loud failure, which is a
 * detection rather than a suite that never finishes.
 */
const LOOP_LIMIT = 1000;

/** Build a wager out of chip taps, largest first, asserting every tap lands. */
function place(wallet: Wallet, id: TableId, target: number): void {
  const limits = tableLimits(id);
  const turn = bounded('building a wager out of chip taps', LOOP_LIMIT);
  for (const chip of [500, 100, 50, 10] as const) {
    while (wallet.readout().wager + chip <= target) {
      turn();
      const result = wallet.tap(chip, limits);
      expect(result.ok).toBe(true);
    }
  }
  expect(wallet.readout().wager).toBe(target);
}

/** One round at one wager, settled at the net given. Nothing is split. */
function playRound(wallet: Wallet, id: TableId, wager: number, net: number): void {
  place(wallet, id, wager);
  const commit = wallet.commitInitial(tableLimits(id));
  expect(commit.ok).toBe(true);
  wallet.settleHand(0, net);
  wallet.endRound();
}

// ---------------------------------------------------------------------------
// J1, clause 1: three tables, with the specified numbers
// ---------------------------------------------------------------------------

describe('J1: three tables exist with the specified minimums, maximums and thresholds', () => {
  it('ships exactly the three rows of SPEC 6, in SPEC 6 order', () => {
    expect(TABLES.length).toBe(SPEC_6.length);
    expect(TABLES.length).toBe(3);
    expect(TABLES.map((table) => table.id)).toEqual(['bronze', 'silver', 'gold']);
    expect(
      TABLES.map((table) => ({
        id: table.id,
        minimum: table.minimum,
        maximum: table.maximum,
        unlocksAt: table.unlocksAt,
      })),
    ).toEqual(SPEC_6);
  });

  it('answers by name, and refuses a name SPEC 6 does not carry', () => {
    for (const table of SPEC_6) {
      expect(isTableId(table.id)).toBe(true);
      const limits = tableLimits(table.id as TableId);
      expect(limits.minimum).toBe(table.minimum);
      expect(limits.maximum).toBe(table.maximum);
      expect(limits.unlocksAt).toBe(table.unlocksAt);
    }
    expect(isTableId('platinum')).toBe(false);
    expect(isTableId('')).toBe(false);
    const unknownName: string = 'platinum';
    expect(() => tableLimits(unknownName as TableId)).toThrow(RangeError);
  });

  it('rises in all three columns, which is what makes lower and highest mean anything', () => {
    for (let index = 1; index < TABLES.length; index += 1) {
      const lower = TABLES[index - 1];
      const upper = TABLES[index];
      expect(lower).toBeDefined();
      expect(upper).toBeDefined();
      if (lower === undefined || upper === undefined) {
        continue;
      }
      expect(upper.minimum).toBeGreaterThan(lower.minimum);
      expect(upper.maximum).toBeGreaterThan(lower.maximum);
      expect(upper.unlocksAt).toBeGreaterThan(lower.unlocksAt);
    }
    expect(LOWEST_TABLE.id).toBe('bronze');
  });

  it('unlocks Bronze at every balance there is, which is SPEC 6 saying always', () => {
    expect(row('bronze').unlocksAt).toBe(0);
    for (const best of BEST_BALANCES) {
      expect(isUnlocked('bronze', best)).toBe(true);
    }
  });

  it('opens each table exactly at its threshold and not one chip earlier', () => {
    expect(isUnlocked('silver', 2499)).toBe(false);
    expect(isUnlocked('silver', 2500)).toBe(true);
    expect(isUnlocked('gold', 9999)).toBe(false);
    expect(isUnlocked('gold', 10000)).toBe(true);
    expect(unlockedTables(0).map((table) => table.id)).toEqual(['bronze']);
    expect(unlockedTables(2499).map((table) => table.id)).toEqual(['bronze']);
    expect(unlockedTables(2500).map((table) => table.id)).toEqual(['bronze', 'silver']);
    expect(unlockedTables(9999).map((table) => table.id)).toEqual(['bronze', 'silver']);
    expect(unlockedTables(10000).map((table) => table.id)).toEqual(['bronze', 'silver', 'gold']);
  });

  /**
   * Why SPEC 6 states no maximum balance, written down where it can rot loudly.
   *
   * Nothing anywhere caps the bankroll, and nothing needs to, but the argument
   * for that had never been recorded and so could not fail. It is this: the
   * initial wager is capped at the table maximum however rich the player is, at
   * most `MAX_SPLITS + 1` hands can be in play, and each of them may double
   * once, so the largest net gain any single round can produce is
   * `hands x 2 x maximum` and growth is additive rather than multiplicative.
   * Dividing `Number.MAX_SAFE_INTEGER` by that ceiling gives the number of
   * consecutive maximum-win rounds it would take to leave the exactly
   * representable integers, and the assertion is that the number is absurd.
   *
   * The reading it protects is the one the money math rests on everywhere: every
   * chip figure in this game is an exact integer, and `settleHand`, `recordBest`
   * and SPEC 13's persisted mark all assume so without saying it. A table set or
   * a split limit that broke this would break that silently.
   */
  it('needs no balance maximum, because the per-round ceiling puts one absurdly far off', () => {
    const hands = SPEC_MAX_SPLITS + 1;
    const richest = Math.max(...TABLES.map((limits) => limits.maximum));
    // Every hand doubled and every one of them winning 1:1.
    const perRound = hands * 2 * richest;
    expect(perRound).toBe(16_000);

    const rounds = Math.floor(Number.MAX_SAFE_INTEGER / perRound);
    expect(rounds).toBeGreaterThan(SAFE_ROUNDS_FLOOR);
    // For the record rather than as a threshold: 562 billion rounds, which at
    // an optimistic four seconds a round and no losing round ever is 71,000
    // years of continuous play.
    expect(rounds).toBe(562_949_953_421);

    // And the starting bankroll is a safe integer to begin with, which is the
    // other end of the same claim.
    expect(Number.isSafeInteger(STARTING_CHIPS)).toBe(true);
    for (const limits of TABLES) {
      expect(Number.isSafeInteger(limits.maximum)).toBe(true);
      expect(Number.isSafeInteger(limits.unlocksAt)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// J1, clause 2: the entry predicate, and its two controls
// ---------------------------------------------------------------------------

describe('J1: a table cannot be entered without its threshold and its minimum', () => {
  it('agrees with the criterion on all 462 cases', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const table of SPEC_6) {
      for (const best of BEST_BALANCES) {
        for (const chips of CHIP_BALANCES) {
          checked += 1;
          const wanted = entersBySpec(table.id, best, chips);
          const got = canEnter(table.id as TableId, best, chips);
          if (got !== wanted) {
            wrong.push(`${table.id} at best ${String(best)} on ${String(chips)}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(checked).toBe(ENTRY_CASES);
    expect(checked).toBe(462);
  });

  /**
   * The control. Without it the sweep above proves only that the predicate
   * agrees with a predicate, and a predicate missing the threshold half agrees
   * everywhere the money already says no.
   */
  it('disagrees with a threshold-blind predicate on exactly the 80 locked-but-affordable cases', () => {
    const disagreements: string[] = [];
    for (const table of SPEC_6) {
      for (const best of BEST_BALANCES) {
        for (const chips of CHIP_BALANCES) {
          const shipped = canEnter(table.id as TableId, best, chips);
          if (shipped !== entersIgnoringThreshold(table.id, chips)) {
            disagreements.push(`${table.id}:${String(best)}:${String(chips)}`);
            // Every disagreement is the control letting a locked table through.
            expect(shipped).toBe(false);
            expect(best).toBeLessThan(row(table.id).unlocksAt);
            expect(chips).toBeGreaterThanOrEqual(row(table.id).minimum);
          }
        }
      }
    }
    expect(disagreements.length).toBe(THRESHOLD_BLIND_DISAGREEMENTS);
    expect(disagreements.length).toBe(80);
  });

  /** The other half, and the one a rich player who lost it all would find. */
  it('disagrees with an affordability-blind predicate on exactly the 96 short cases', () => {
    const disagreements: string[] = [];
    for (const table of SPEC_6) {
      for (const best of BEST_BALANCES) {
        for (const chips of CHIP_BALANCES) {
          const shipped = canEnter(table.id as TableId, best, chips);
          if (shipped !== entersIgnoringAffordability(table.id, best)) {
            disagreements.push(`${table.id}:${String(best)}:${String(chips)}`);
            expect(shipped).toBe(false);
            expect(best).toBeGreaterThanOrEqual(row(table.id).unlocksAt);
            expect(chips).toBeLessThan(row(table.id).minimum);
          }
        }
      }
    }
    expect(disagreements.length).toBe(AFFORDABILITY_BLIND_DISAGREEMENTS);
    expect(disagreements.length).toBe(96);
  });

  it('keeps an unlocked table shut to a balance that cannot post its minimum', () => {
    // The case the criterion is really about: Gold reached, Gold lost.
    expect(isUnlocked('gold', 10000)).toBe(true);
    expect(canEnter('gold', 10000, 99)).toBe(false);
    expect(canEnter('gold', 10000, 100)).toBe(true);
    expect(canEnter('silver', 2500, 49)).toBe(false);
    expect(canEnter('silver', 2500, 50)).toBe(true);
    expect(canEnter('bronze', 0, 9)).toBe(false);
    expect(canEnter('bronze', 0, 10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// J1, clause 3 and 4: every minimum under 1,000, so SPEC 13 never falls back
// ---------------------------------------------------------------------------

describe('J1: every minimum is at or below 1000, so SPEC 13 never falls back', () => {
  /**
   * The loud failure the criterion asks for, stated as plainly as it can be.
   * Raising any minimum above the starting bankroll fails here first.
   */
  it('ships no table minimum above the 1000 starting bankroll', () => {
    expect(STARTING_CHIPS).toBe(SPEC_STARTING_CHIPS);
    for (const table of TABLES) {
      expect(table.minimum).toBeLessThanOrEqual(SPEC_STARTING_CHIPS);
    }
    // And the largest of them, named, so the margin is visible rather than implied.
    expect(Math.max(...TABLES.map((table) => table.minimum))).toBe(100);
  });

  it('opens every consistent launch at the persisted table, all 20 of them', () => {
    let consistent = 0;
    for (const table of SPEC_6) {
      for (const best of BEST_BALANCES) {
        if (best < table.unlocksAt) {
          continue;
        }
        consistent += 1;
        const choice = launchTable(table.id as TableId, best);
        expect(choice.table).toBe(table.id);
        expect(choice.fromFallback).toBe(false);
      }
    }
    expect(consistent).toBe(CONSISTENT_LAUNCHES);
    expect(consistent).toBe(20);
  });

  /**
   * The fallback is unreachable, not absent: SPEC 13 says the loader still
   * carries it. The 13 pairs SPEC 13 does not persist are what exercise it, and
   * it has to answer with a table the launch balance can actually enter.
   */
  it('still answers on the 13 launches SPEC 13 cannot persist', () => {
    let inconsistent = 0;
    for (const table of SPEC_6) {
      for (const best of BEST_BALANCES) {
        if (best >= table.unlocksAt) {
          continue;
        }
        inconsistent += 1;
        const choice = launchTable(table.id as TableId, best);
        expect(choice.fromFallback).toBe(true);
        expect(choice.table).toBe(highestEnterableBySpec(best, SPEC_STARTING_CHIPS));
        expect(canEnter(choice.table, best, SPEC_STARTING_CHIPS)).toBe(true);
      }
    }
    expect(inconsistent).toBe(INCONSISTENT_LAUNCHES);
    expect(inconsistent).toBe(13);
  });

  it('picks the highest enterable table, agreeing with SPEC 13 on all 154 cases', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const best of BEST_BALANCES) {
      for (const chips of CHIP_BALANCES) {
        checked += 1;
        const got = highestEnterableTable(best, chips);
        const wanted = highestEnterableBySpec(best, chips);
        if ((got === null ? null : got.id) !== wanted) {
          wrong.push(`best ${String(best)} on ${String(chips)}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(checked).toBe(FALLBACK_CASES);
    expect(checked).toBe(154);
    // Below the lowest minimum there is nothing to enter, which SPEC 4.12 calls
    // being out at the table rather than an error.
    expect(highestEnterableTable(25000, 9)).toBeNull();
    expect(highestEnterableTable(25000, 10)?.id).toBe('bronze');
  });

  /**
   * The control for "highest". A lowest-first scan answers identically wherever
   * only one table is enterable, which is most of the sweep and all of a fresh
   * account, so it would sit undetected until a player unlocked Silver.
   */
  it('disagrees with a lowest-first scan on exactly the 48 multi-table cases', () => {
    const disagreements: string[] = [];
    for (const best of BEST_BALANCES) {
      for (const chips of CHIP_BALANCES) {
        const highest = highestEnterableTable(best, chips);
        const lowest = lowestEnterableBySpec(best, chips);
        if ((highest === null ? null : highest.id) !== lowest) {
          disagreements.push(`${String(best)}:${String(chips)}`);
          expect(lowest).toBe('bronze');
        }
      }
    }
    expect(disagreements.length).toBe(FALLBACK_ORDER_DISAGREEMENTS);
    expect(disagreements.length).toBe(48);
  });
});

// ---------------------------------------------------------------------------
// J2: the unlocks are a high-water mark
// ---------------------------------------------------------------------------

describe('J2: unlocks are keyed to the best chip balance ever reached', () => {
  it('starts a wallet at the bankroll it has and calls that its best', () => {
    const wallet = createWallet();
    const state = wallet.readout();
    expect(state.chips).toBe(SPEC_STARTING_CHIPS);
    expect(state.bestBalance).toBe(SPEC_STARTING_CHIPS);
    expect(isUnlocked('bronze', state.bestBalance)).toBe(true);
    expect(isUnlocked('silver', state.bestBalance)).toBe(false);
    expect(isUnlocked('gold', state.bestBalance)).toBe(false);
  });

  it('raises the mark on a win and never lowers it on a loss', () => {
    const wallet = createWallet();
    const marks: number[] = [wallet.readout().bestBalance];
    // Fifteen wins of 100 at Bronze, which is the table a fresh account has.
    for (let round = 0; round < 15; round += 1) {
      playRound(wallet, 'bronze', 100, 100);
      marks.push(wallet.readout().bestBalance);
    }
    expect(wallet.readout().chips).toBe(SPEC_STARTING_CHIPS + 15 * 100);
    expect(wallet.readout().bestBalance).toBe(2500);
    expect(isUnlocked('silver', wallet.readout().bestBalance)).toBe(true);

    // And then give it all back, at the Silver table the mark just opened.
    for (let round = 0; round < 5; round += 1) {
      playRound(wallet, 'silver', 500, -500);
      marks.push(wallet.readout().bestBalance);
    }
    expect(wallet.readout().chips).toBe(0);
    expect(wallet.readout().bestBalance).toBe(2500);

    for (let index = 1; index < marks.length; index += 1) {
      const previous = marks[index - 1];
      const current = marks[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous === undefined || current === undefined) {
        continue;
      }
      expect(current).toBeGreaterThanOrEqual(previous);
    }
    expect(marks.length).toBe(21);
  });

  /**
   * The control. An unlock read off the current balance agrees with the shipped
   * one on every winning session and differs only after a loss, which is exactly
   * the moment the criterion is about.
   */
  it('differs from an unlock read off the current balance once the balance falls', () => {
    const wallet = createWallet();
    for (let round = 0; round < 15; round += 1) {
      playRound(wallet, 'bronze', 100, 100);
    }
    expect(wallet.readout().bestBalance).toBe(2500);
    expect(wallet.readout().chips).toBe(2500);
    // Agreed here, and only here.
    expect(isUnlocked('silver', wallet.readout().bestBalance)).toBe(true);
    expect(isUnlocked('silver', wallet.readout().chips)).toBe(true);

    playRound(wallet, 'silver', 500, -500);
    expect(wallet.readout().chips).toBe(2000);
    expect(isUnlocked('silver', wallet.readout().bestBalance)).toBe(true);
    expect(isUnlocked('silver', wallet.readout().chips)).toBe(false);
  });

  /**
   * The reading control, and the one question "best chip balance ever reached"
   * actually leaves open: the balance, or the balance plus what is still
   * committed.
   *
   * **Every single-hand round makes the two equal**, which is why no other test
   * in this file can tell them apart. SPEC 4.11 takes the wager out of the
   * balance at the deal and credits it back at settlement, so through a one-hand
   * round the sum only ever reads what the balance read before the deal. They
   * come apart in exactly one place: a split hand paid while its sibling is
   * still on the table. There the sum marks money that is still at risk.
   *
   * The figures are placed so SPEC 6's Silver threshold sits strictly between
   * them. The balance arrives on 2,450, 50 short of 2,500. A 100 wager split
   * into two hands, the first won and the second lost, ends on 2,450 again, so
   * the round makes nothing; between the two settlements the balance is 2,450
   * with 100 still committed, so the other reading peaks at 2,550, 50 past the
   * threshold. One reading leaves Silver locked. The other unlocks it
   * permanently, on a round that won no chips.
   */
  it('marks the balance and never the money still on the table', () => {
    const wallet = createWallet();
    for (let round = 0; round < WINS_OF_100; round += 1) {
      playRound(wallet, 'bronze', 100, 100);
    }
    playRound(wallet, 'bronze', 50, 50);
    expect(wallet.readout().chips).toBe(MARK_BEFORE_SPLIT);
    expect(wallet.readout().bestBalance).toBe(MARK_BEFORE_SPLIT);
    expect(MARK_BEFORE_SPLIT).toBeLessThan(row('silver').unlocksAt);
    expect(isUnlocked('silver', wallet.readout().bestBalance)).toBe(false);

    /** The reading this test is a control against, taken at every step. */
    const committedReading: number[] = [];
    const record = (): void => {
      const state = wallet.readout();
      committedReading.push(state.chips + state.committed);
    };

    place(wallet, 'bronze', 100);
    record();
    expect(wallet.commitInitial(tableLimits('bronze')).ok).toBe(true);
    record();
    expect(wallet.commitSplit(0).ok).toBe(true);
    record();
    wallet.settleHand(0, 100);
    record();
    wallet.settleHand(1, -100);
    record();
    wallet.endRound();
    record();

    // The round won nothing, so the balance and its mark are where they were.
    expect(wallet.readout().chips).toBe(MARK_BEFORE_SPLIT);
    expect(wallet.readout().bestBalance).toBe(MARK_BEFORE_SPLIT);
    expect(isUnlocked('silver', wallet.readout().bestBalance)).toBe(false);
    expect(unlockedTables(wallet.readout().bestBalance).map((table) => table.id)).toEqual([
      'bronze',
    ]);

    // And the other reading really does cross the threshold in the same round,
    // or this test would be pinning a difference that is not there.
    expect(Math.max(...committedReading)).toBe(COMMITTED_READING_PEAK);
    expect(COMMITTED_READING_PEAK).toBeGreaterThanOrEqual(row('silver').unlocksAt);
    expect(isUnlocked('silver', Math.max(...committedReading))).toBe(true);
  });
});

describe('J2: unlocks survive a bust and a bankroll reset', () => {
  /** Wins a wallet up to a mark, then loses every chip it has. */
  function bustFrom(target: number, table: TableId, wager: number): Wallet {
    const wallet = createWallet();
    const up = bounded('winning up to the high-water mark', LOOP_LIMIT);
    while (wallet.readout().bestBalance < target) {
      up();
      playRound(wallet, table, wager, wager);
    }
    const down = bounded('losing the bankroll back down', LOOP_LIMIT);
    while (wallet.readout().chips >= wager) {
      down();
      playRound(wallet, table, wager, -wager);
    }
    return wallet;
  }

  it('keeps Silver after a bust to nothing, and keeps it through the reset', () => {
    const wallet = bustFrom(2500, 'bronze', 100);
    expect(wallet.readout().bestBalance).toBeGreaterThanOrEqual(2500);
    expect(wallet.readout().chips).toBe(0);

    // Busted out: below every minimum, so no table is enterable at all.
    const state = wallet.readout();
    expect(canEnter('bronze', state.bestBalance, state.chips)).toBe(false);
    expect(isUnlocked('silver', state.bestBalance)).toBe(true);
    const offer = bustOut('silver', state.bestBalance, state.chips);
    expect(offer.out).toBe(true);
    expect(offer.lowerTables).toEqual([]);
    expect(offer.resetTo).toBe(SPEC_STARTING_CHIPS);
    expect(offer.resetTable).toBe('bronze');

    const markBeforeReset = state.bestBalance;
    wallet.reset();
    const after = wallet.readout();
    expect(after.chips).toBe(SPEC_STARTING_CHIPS);
    expect(after.bestBalance).toBe(markBeforeReset);
    expect(isUnlocked('silver', after.bestBalance)).toBe(true);
    expect(canEnter('silver', after.bestBalance, after.chips)).toBe(true);
    expect(unlockedTables(after.bestBalance).map((table) => table.id)).toEqual([
      'bronze',
      'silver',
    ]);
  });

  it('keeps Gold the same way, over the threshold the reset is furthest below', () => {
    const wallet = bustFrom(10000, 'bronze', 100);
    const mark = wallet.readout().bestBalance;
    expect(mark).toBeGreaterThanOrEqual(10000);
    expect(isUnlocked('gold', mark)).toBe(true);

    wallet.reset();
    const after = wallet.readout();
    expect(after.chips).toBe(SPEC_STARTING_CHIPS);
    expect(after.bestBalance).toBe(mark);
    // 1,000 chips is a tenth of Gold's threshold and still affords its minimum,
    // which is the whole reason SPEC 13's fallback never fires.
    expect(canEnter('gold', after.bestBalance, after.chips)).toBe(true);
    expect(launchTable('gold', after.bestBalance).fromFallback).toBe(false);
  });

  it('survives repeated resets, which SPEC 4.12 makes free and unlimited', () => {
    const wallet = bustFrom(2500, 'bronze', 100);
    const mark = wallet.readout().bestBalance;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      wallet.reset();
      expect(wallet.readout().chips).toBe(SPEC_STARTING_CHIPS);
      expect(wallet.readout().bestBalance).toBe(mark);
    }
    expect(isUnlocked('silver', wallet.readout().bestBalance)).toBe(true);
  });

  it('carries a persisted mark into a fresh wallet, which is how it crosses a session', () => {
    // SPEC 13 persists the best balance and not the chips, so a new wallet
    // starts at 1,000 with the unlocks the mark already bought. Reading and
    // writing that document is BJ-11's, items I1 to I3.
    const wallet = createWallet({ bestBalance: 12000 });
    const state = wallet.readout();
    expect(state.chips).toBe(SPEC_STARTING_CHIPS);
    expect(state.bestBalance).toBe(12000);
    expect(unlockedTables(state.bestBalance).map((table) => table.id)).toEqual([
      'bronze',
      'silver',
      'gold',
    ]);
    expect(() => createWallet({ bestBalance: 999 })).toThrow(RangeError);
    expect(() => createWallet({ bestBalance: Number.NaN })).toThrow(RangeError);
    expect(() => createWallet({ bestBalance: 1000.5 })).toThrow(RangeError);
  });

  it('offers a lower table when one is still affordable, per SPEC 4.12', () => {
    // Unlocked to Gold, down to 60 chips: Silver's 50 is affordable, Gold's 100
    // is not, and the offer names only what is really on.
    const offer = bustOut('gold', 12000, 60);
    expect(offer.out).toBe(true);
    expect(offer.lowerTables).toEqual(['bronze', 'silver']);

    // Not out at all, and the reset is still offered because SPEC 4.12 always
    // offers it. Item L4 at BJ-21 grades that it is free and unlimited.
    const solvent = bustOut('gold', 12000, 5000);
    expect(solvent.out).toBe(false);
    expect(solvent.lowerTables).toEqual(['bronze', 'silver']);
    expect(solvent.resetTo).toBe(SPEC_STARTING_CHIPS);

    // SPEC 4.12 says "falls below the table minimum", so landing exactly on it
    // is still in the game and the last hand at Silver is playable.
    expect(bustOut('silver', 12000, 50).out).toBe(false);
    expect(bustOut('silver', 12000, 49).out).toBe(true);

    // A locked lower table is not an offer. Silver is out of reach at this mark.
    const lowMark = bustOut('bronze', 0, 5);
    expect(lowMark.out).toBe(true);
    expect(lowMark.lowerTables).toEqual([]);
  });
});
