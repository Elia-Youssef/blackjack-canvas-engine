/**
 * Item `J6`, severity Minor, 5 points.
 *
 *   "All eleven milestones award exactly once under their stated conditions and
 *    persist across sessions. Bronze is unlocked from the start and is not a
 *    milestone; Silver and Gold are."
 *
 * SPEC 9's table, transcribed below as `SPEC_9_TABLE` and compared against the
 * module's published list row for row, plus SPEC 11's counters and SPEC 13's
 * two scopes, which are what most of the eleven are counted from.
 *
 * **"Persist across sessions", read as a unit test can prove it.** Persisting
 * anything is `BJ-11`, which the brief for this part puts out of scope in as
 * many words, and item `I1`'s versioned `localStorage` document and item `I4`'s
 * fresh launch are where the browser half is graded. What is provable here is
 * that the record is a plain serialisable value whose round trip is exact,
 * `JSON.parse(JSON.stringify(stats))` deep-equal and re-serialising to the
 * identical string, and that `openSession` carries the milestones and the
 * lifetime counters across a launch while resetting the session ones. That is
 * the reading this file takes, it is stated here so `BJ-11` inherits it, and
 * the wiring is disclosed to `I1` and `I4`.
 *
 * **Two ways of driving one function, and the second is checked against the
 * first.** `observeRound` is pure, so most of the eleven are reached by handing
 * it a built readout: a thousand hands, a bankroll at 10,000, or a hundred
 * coach decisions are not something to deal out card by card. A built readout
 * is a fiction until it is shown to be the same fiction the machine produces,
 * so `roundOf` is compared against a real round of real cards, field by field
 * and observation by observation, before anything else uses it.
 *
 * **The readings SPEC 9 leaves open are pinned here, one test each**, so that
 * changing one is a visible edit rather than a silent drift. They are: a push
 * leaves a win streak alone; doubling the bankroll is measured on the wallet's
 * high-water mark; row 11's 10 percent is 100 chips and its recovery is 1,000,
 * both at rest, with the free reset and a fresh launch clearing the latch; a
 * win is a settled hand with a positive net; and row 10 reads the lifetime
 * coach record, which `BJ-9` leaves untouched while the coach is off.
 *
 * **What this file does not claim.** The hand history is item `J5` in
 * `tests/unit/hand-history.test.ts`. The three coach modes and the accuracy
 * readout end to end are item `J4` at `BJ-20`. SPEC 4.12's preservation clause
 * as a whole is item `C4` at `BJ-20`; what is here is the half of it this
 * module owns.
 */

import { describe, expect, it } from 'vitest';

import type { Rank } from '../../src/core/cards';
import { houseRules } from '../../src/core/rules';
import type { Outcome, Rung } from '../../src/core/settlement';
import type { CoachAccuracy, CoachRecord } from '../../src/core/strategy';
import {
  NO_DECISIONS,
  accuracy,
  openSession as openCoachSession,
  recordDecision,
} from '../../src/core/strategy';
import type { MilestoneId, Statistics } from '../../src/core/statistics';
import {
  ACCURACY_DECISIONS,
  ACCURACY_PERCENT,
  DOUBLED_BANKROLL,
  HUNDRED_HANDS,
  LONG_WIN_STREAK,
  LOW_WATER_CHIPS,
  MILESTONES,
  MILESTONE_TABLES,
  NO_COUNTERS,
  NO_STATISTICS,
  SHORT_WIN_STREAK,
  TABLE_MILESTONES,
  THOUSAND_HANDS,
  isAwarded,
  observeBankrollReset,
  observeRound,
  openSession,
  statisticsReadout,
} from '../../src/core/statistics';
import type { Table, TableReadout } from '../../src/core/table';
import { createTable } from '../../src/core/table';
import type { HandInPlay, Intent, SettledHand } from '../../src/core/types';
import type { TableId, WalletReadout } from '../../src/core/wallet';
import { LOWEST_TABLE, STARTING_CHIPS, TABLES, tableLimits } from '../../src/core/wallet';

import { scriptedShoe } from './support/stacked-shoe';

// ---------------------------------------------------------------------------
// SPEC 9, transcribed
// ---------------------------------------------------------------------------

/**
 * SPEC 9's table, written out from the document rather than imported.
 *
 * The row numbers are SPEC 9's own, so the count, the order and the wording are
 * all checkable against the module's published list without either side being
 * the other's source. SPEC 9 states the count in bold and gives the reason:
 * "Bronze is unlocked from the start, so reaching it is not an achievement and
 * only Silver and Gold count."
 */
const SPEC_9_TABLE: readonly { readonly row: number; readonly text: string; readonly id: MilestoneId }[] =
  Object.freeze([
    Object.freeze({ row: 1, text: 'First natural', id: 'firstNatural' as const }),
    Object.freeze({ row: 2, text: 'First split win', id: 'firstSplitWin' as const }),
    Object.freeze({ row: 3, text: 'A five-hand win streak', id: 'fiveHandStreak' as const }),
    Object.freeze({ row: 4, text: 'A ten-hand win streak', id: 'tenHandStreak' as const }),
    Object.freeze({ row: 5, text: 'Doubling the bankroll', id: 'doubledBankroll' as const }),
    Object.freeze({ row: 6, text: 'Reaching Silver', id: 'reachedSilver' as const }),
    Object.freeze({ row: 7, text: 'Reaching Gold', id: 'reachedGold' as const }),
    Object.freeze({ row: 8, text: '100 hands played', id: 'hundredHands' as const }),
    Object.freeze({ row: 9, text: '1,000 hands played', id: 'thousandHands' as const }),
    Object.freeze({
      row: 10,
      text: '90 percent basic-strategy accuracy over 100 decisions',
      id: 'ninetyPercentAccuracy' as const,
    }),
    Object.freeze({
      row: 11,
      text: 'Surviving a bankroll below 10 percent and recovering to the starting amount',
      id: 'survivedAndRecovered' as const,
    }),
  ]);

/** SPEC 9: "**Eleven** permanent, non-monetised achievements." */
const SPEC_MILESTONE_COUNT = 11;

/** SPEC 6's unlock thresholds, written out from that section's table. */
const SPEC_SILVER_UNLOCK = 2500;
const SPEC_GOLD_UNLOCK = 10000;

/** SPEC 4.11: the starting bankroll, and the wager these rounds carry. */
const SPEC_STARTING_CHIPS = 1000;
const ROUND_WAGER = 10;

/** SPEC 5: a frame long enough to pay for any one timed step. */
const TICK = 0.25;

const LOOP_LIMIT = 2000;

function bounded(label: string): () => void {
  let turns = 0;
  return () => {
    turns += 1;
    if (turns > LOOP_LIMIT) {
      throw new RangeError(`${label} did not finish inside ${String(LOOP_LIMIT)} turns`);
    }
  };
}

// ---------------------------------------------------------------------------
// A round, built rather than dealt
// ---------------------------------------------------------------------------

/** One settled hand, as a round to be observed carries it. */
interface HandSpec {
  readonly wager: number;
  /** SPEC 4.11's `wager + net`. A loss credits zero and a push the wager. */
  readonly credit: number;
  readonly outcome: Outcome;
  readonly rung: Rung;
  /** SPEC 4.6: set at the split and never recomputed. */
  readonly fromSplit?: boolean;
}

/** A win, a loss, a push and the two natural rungs, at the round wager. */
const WIN: HandSpec = Object.freeze({
  wager: ROUND_WAGER,
  credit: 2 * ROUND_WAGER,
  outcome: 'PLAYER_WIN',
  rung: 7,
});
const LOSS: HandSpec = Object.freeze({
  wager: ROUND_WAGER,
  credit: 0,
  outcome: 'DEALER_WIN',
  rung: 8,
});
const PUSH: HandSpec = Object.freeze({
  wager: ROUND_WAGER,
  credit: ROUND_WAGER,
  outcome: 'PUSH',
  rung: 9,
});
const NATURAL: HandSpec = Object.freeze({
  wager: ROUND_WAGER,
  credit: (ROUND_WAGER * 5) / 2,
  outcome: 'BLACKJACK',
  rung: 3,
});
const NATURAL_PUSH: HandSpec = Object.freeze({
  wager: ROUND_WAGER,
  credit: ROUND_WAGER,
  outcome: 'PUSH',
  rung: 2,
});
const SURRENDER: HandSpec = Object.freeze({
  wager: ROUND_WAGER,
  credit: ROUND_WAGER / 2,
  outcome: 'SURRENDER',
  rung: 1,
});
const SPLIT_WIN: HandSpec = Object.freeze({ ...WIN, fromSplit: true });
const SPLIT_LOSS: HandSpec = Object.freeze({ ...LOSS, fromSplit: true });

interface RoundSpec {
  /** `table.ts`'s round counter after this round closed. */
  readonly rounds: number;
  /** SPEC 12's resulting balance, at rest. */
  readonly chips?: number;
  /** SPEC 6's high-water mark. */
  readonly bestBalance?: number;
  readonly hands: readonly HandSpec[];
  /** SPEC 4.7's settled side wager, as its net alone. */
  readonly insuranceNet?: number;
  readonly table?: TableId;
}

/**
 * A `TableReadout` at SPEC 10's `roundResult`, built to order.
 *
 * Every field the readout publishes is filled, because `observeRound` is
 * entitled to read any of them and a partial object typed into place would make
 * this a fiction the compiler agreed to. The cards are the ones a hand would
 * have to hold to settle the way the spec says it did; nothing below reads
 * them, and `agrees with a real round` proves that claim rather than assuming
 * it.
 */
function roundOf(spec: RoundSpec): TableReadout {
  const chips = spec.chips ?? SPEC_STARTING_CHIPS;
  const bestBalance = spec.bestBalance ?? Math.max(chips, SPEC_STARTING_CHIPS);
  const hands: readonly HandInPlay[] = Object.freeze(
    spec.hands.map((hand, index) =>
      Object.freeze({
        cards: Object.freeze([
          Object.freeze({ rank: '10' as Rank, suit: 'spades' as const }),
          Object.freeze({ rank: '7' as Rank, suit: 'hearts' as const }),
        ]),
        wager: hand.wager,
        state: 'stood' as const,
        fromSplit: hand.fromSplit ?? false,
        fromSplitAces: false,
        walletHand: index,
      }),
    ),
  );
  const settled: readonly SettledHand[] = Object.freeze(
    spec.hands.map((hand) =>
      Object.freeze({
        wager: hand.wager,
        credit: hand.credit,
        outcome: hand.outcome,
        rung: hand.rung,
      }),
    ),
  );
  const insuranceNet = spec.insuranceNet ?? 0;
  const wallet: WalletReadout = Object.freeze({
    chips,
    wager: 0,
    previousWager: spec.hands[0]?.wager ?? 0,
    committed: 0,
    insuranceStake: 0,
    deferredStake: 0,
    conserved: chips,
    bestBalance,
    hands: Object.freeze([]),
  });
  return Object.freeze({
    phase: Object.freeze({
      kind: 'roundResult' as const,
      result: Object.freeze({
        hands: settled,
        insurance:
          insuranceNet === 0
            ? null
            : Object.freeze({
                stake: ROUND_WAGER / 2,
                net: insuranceNet,
                credit: ROUND_WAGER / 2 + insuranceNet,
                deferred: 0,
                evenMoney: false,
              }),
        chips,
        actions: Object.freeze(['stand' as const]),
      }),
    }),
    table: spec.table ?? LOWEST_TABLE.id,
    rules: houseRules(),
    hands,
    dealerVisible: Object.freeze([
      Object.freeze({ rank: '10' as Rank, suit: 'clubs' as const }),
      Object.freeze({ rank: '9' as Rank, suit: 'diamonds' as const }),
    ]),
    dealerConcealed: 0,
    elapsed: 0,
    queued: Object.freeze([]),
    rounds: spec.rounds,
    splits: 0,
    shoe: Object.freeze({
      decks: 6 as const,
      complement: 312,
      stacked: 312,
      dealt: 10,
      remaining: 302,
      penetration: 10 / 312,
      undealtAtCut: 200,
      cutCardReached: false,
      inPlay: 0,
      rebuilds: 0,
    }),
    wallet,
  });
}

/** Fold a run of built rounds into a record, from a chosen starting point. */
function observeAll(
  stats: Statistics,
  rounds: readonly Omit<RoundSpec, 'rounds'>[],
  coach: CoachRecord = NO_DECISIONS,
): Statistics {
  let current = stats;
  for (const spec of rounds) {
    current = observeRound(current, roundOf({ ...spec, rounds: current.rounds + 1 }), coach).statistics;
  }
  return current;
}

/** `count` rounds of one shape, folded in. */
function repeated(
  stats: Statistics,
  spec: Omit<RoundSpec, 'rounds'>,
  count: number,
  coach: CoachRecord = NO_DECISIONS,
): Statistics {
  return observeAll(stats, Array.from({ length: count }, () => spec), coach);
}

/** A coach record with a chosen lifetime accuracy, built through `strategy.ts`. */
function coachAt(decisions: number, matched: number): CoachRecord {
  let record: CoachRecord = NO_DECISIONS;
  for (let index = 0; index < decisions; index += 1) {
    record = recordDecision(record, index < matched);
  }
  return record;
}

// ---------------------------------------------------------------------------
// Driving the real machine, for the rounds that are about cards
// ---------------------------------------------------------------------------

function accept(table: Table, intent: Intent): void {
  const result = table.apply(intent);
  if (!result.ok) {
    throw new Error(`${result.kind} was refused by ${result.layer} as ${result.reason}`);
  }
}

type Policy = (table: Table) => void;

const stand: Policy = (table) => {
  accept(table, { kind: 'stand' });
};

const splitThenStand: Policy = (table) => {
  if (table.readout().hands.length === 1) {
    accept(table, { kind: 'split' });
    return;
  }
  accept(table, { kind: 'stand' });
};

/** Drive one round of a written-down script to SPEC 12's result. */
function playRound(table: Table, policy: Policy = stand): TableReadout {
  const turn = bounded('driving one round to SPEC 12 result');
  for (;;) {
    const state = table.readout();
    if (state.phase.kind === 'roundResult') {
      return state;
    }
    turn();
    switch (state.phase.kind) {
      case 'start':
        accept(table, { kind: 'start' });
        break;
      case 'betting':
        if (state.wallet.wager === 0) {
          accept(table, { kind: 'tapChip', chip: ROUND_WAGER });
        } else {
          accept(table, { kind: 'deal' });
        }
        break;
      case 'insurance':
        accept(table, { kind: 'declineInsurance' });
        break;
      case 'playerTurn':
        policy(table);
        break;
      case 'bustOut':
        throw new Error('SPEC 4.12 bust-out reached; these rounds are wagered to avoid it');
      default:
        table.update(TICK);
    }
  }
}

function dealing(script: readonly Rank[]): Table {
  return createTable({ shoe: scriptedShoe(script) });
}

/** Player A,K against a dealer 17. SPEC 4.10 rung 3, and SPEC 9 row 1. */
const PLAYER_NATURAL: readonly Rank[] = Object.freeze(['A', '9', 'K', '8']);

/** Both naturals. SPEC 4.10 rung 2, a push, and still a natural. */
const BOTH_NATURAL: readonly Rank[] = Object.freeze(['A', 'A', 'K', 'K']);

/** A pair of eights split into two winners against a busting dealer. */
const SPLIT_ROUND: readonly Rank[] = Object.freeze(['8', '9', '8', '7', '2', '3', '10']);

/** A pair of sixes split into two losers against a dealer 20. */
const SPLIT_LOST: readonly Rank[] = Object.freeze(['6', '10', '6', '10', '2', '3']);

describe('J6: SPEC 9 milestones', () => {
  describe('eleven, and the count is the criterion', () => {
    it('publishes exactly the eleven rows of SPEC 9 table, in its order', () => {
      expect(SPEC_9_TABLE).toHaveLength(SPEC_MILESTONE_COUNT);
      expect(SPEC_9_TABLE.map((row) => row.row)).toEqual(
        Array.from({ length: SPEC_MILESTONE_COUNT }, (_, index) => index + 1),
      );
      expect(MILESTONES).toHaveLength(SPEC_MILESTONE_COUNT);
      expect([...MILESTONES]).toEqual(SPEC_9_TABLE.map((row) => row.id));
    });

    it('names every id once, so the list cannot hold a duplicate', () => {
      expect(new Set(MILESTONES).size).toBe(SPEC_MILESTONE_COUNT);
    });
  });

  describe('Bronze is unlocked from the start and is not a milestone', () => {
    it('names no milestone after the table SPEC 6 never locks', () => {
      for (const id of MILESTONES) {
        expect(id.toLowerCase()).not.toContain(LOWEST_TABLE.id);
      }
    });

    it('maps exactly the tables above the lowest to a milestone, and that one to none', () => {
      expect(Object.keys(TABLE_MILESTONES).sort()).toEqual(TABLES.map((limits) => limits.id).sort());
      const unclaimed = Object.entries(TABLE_MILESTONES)
        .filter(([, id]) => id === null)
        .map(([table]) => table);
      expect(unclaimed).toEqual([LOWEST_TABLE.id]);
      expect([...MILESTONE_TABLES]).toEqual(['silver', 'gold']);
      for (const table of MILESTONE_TABLES) {
        const id = TABLE_MILESTONES[table];
        expect(id).not.toBeNull();
        expect(MILESTONES).toContain(id);
      }
    });

    it('awards nothing for sitting at Bronze with the starting bankroll', () => {
      const stats = repeated(NO_STATISTICS, { hands: [LOSS], chips: SPEC_STARTING_CHIPS }, 3);
      expect(isAwarded(stats, 'reachedSilver')).toBe(false);
      expect(isAwarded(stats, 'reachedGold')).toBe(false);
      expect(stats.milestones).toEqual([]);
    });

    it('unlocks Silver and Gold at SPEC 6 thresholds and not before', () => {
      expect(tableLimits('silver').unlocksAt).toBe(SPEC_SILVER_UNLOCK);
      expect(tableLimits('gold').unlocksAt).toBe(SPEC_GOLD_UNLOCK);

      const belowSilver = observeAll(NO_STATISTICS, [
        { hands: [WIN], bestBalance: SPEC_SILVER_UNLOCK - ROUND_WAGER },
      ]);
      expect(isAwarded(belowSilver, 'reachedSilver')).toBe(false);

      const atSilver = observeAll(NO_STATISTICS, [
        { hands: [WIN], bestBalance: SPEC_SILVER_UNLOCK },
      ]);
      expect(isAwarded(atSilver, 'reachedSilver')).toBe(true);
      expect(isAwarded(atSilver, 'reachedGold')).toBe(false);

      const atGold = observeAll(NO_STATISTICS, [{ hands: [WIN], bestBalance: SPEC_GOLD_UNLOCK }]);
      expect(isAwarded(atGold, 'reachedSilver')).toBe(true);
      expect(isAwarded(atGold, 'reachedGold')).toBe(true);
    });
  });

  describe('the built round agrees with a real one', () => {
    it('produces the same observation from a dealt round and its transcription', () => {
      const real = playRound(dealing(PLAYER_NATURAL));
      if (real.phase.kind !== 'roundResult') {
        throw new Error(`the round did not finish; the phase is ${real.phase.kind}`);
      }
      const settled = real.phase.result.hands;
      expect(settled).toHaveLength(1);
      // SPEC 12's resulting balance is the balance at rest: `wallet.endRound`
      // has run by this phase, so nothing is committed and the two readings of
      // "the chips" agree. SPEC 9 row 11 can be measured from either, and the
      // built round below carries one number into both.
      expect(real.phase.result.chips).toBe(real.wallet.chips);
      expect(real.wallet.committed).toBe(0);

      const built = roundOf({
        rounds: real.rounds,
        chips: real.wallet.chips,
        bestBalance: real.wallet.bestBalance,
        hands: settled.map((hand) => ({
          wager: hand.wager,
          credit: hand.credit,
          outcome: hand.outcome,
          rung: hand.rung,
        })),
      });

      expect(observeRound(NO_STATISTICS, built, NO_DECISIONS)).toEqual(
        observeRound(NO_STATISTICS, real, NO_DECISIONS),
      );
    });
  });

  describe('SPEC 9 row 1: first natural', () => {
    it('awards on a natural that paid, driven through real cards', () => {
      const observation = observeRound(
        NO_STATISTICS,
        playRound(dealing(PLAYER_NATURAL)),
        NO_DECISIONS,
      );
      expect(observation.awarded).toContain('firstNatural');
      expect(observation.statistics.lifetime.blackjacks).toBe(1);
    });

    it('awards on a natural that met the dealer own and pushed, SPEC 4.10 rung 2', () => {
      const observation = observeRound(NO_STATISTICS, playRound(dealing(BOTH_NATURAL)), NO_DECISIONS);
      expect(observation.awarded).toContain('firstNatural');
      expect(observation.statistics.lifetime.blackjacks).toBe(1);
      expect(observation.statistics.lifetime.pushes).toBe(1);
    });

    it('awards nothing on a round with no natural in it', () => {
      const stats = repeated(NO_STATISTICS, { hands: [WIN] }, 3);
      expect(isAwarded(stats, 'firstNatural')).toBe(false);
      expect(stats.lifetime.blackjacks).toBe(0);
    });
  });

  describe('SPEC 9 row 2: first split win', () => {
    it('awards on a split hand that won, driven through real cards', () => {
      const observation = observeRound(
        NO_STATISTICS,
        playRound(dealing(SPLIT_ROUND), splitThenStand),
        NO_DECISIONS,
      );
      expect(observation.awarded).toContain('firstSplitWin');
      expect(observation.statistics.lifetime.handsPlayed).toBe(2);
      expect(observation.statistics.lifetime.wins).toBe(2);
    });

    it('awards nothing when both split hands lost', () => {
      const observation = observeRound(
        NO_STATISTICS,
        playRound(dealing(SPLIT_LOST), splitThenStand),
        NO_DECISIONS,
      );
      expect(observation.awarded).not.toContain('firstSplitWin');
      expect(observation.statistics.lifetime.losses).toBe(2);
    });

    it('awards nothing for an unsplit win, however many there are', () => {
      const stats = repeated(NO_STATISTICS, { hands: [WIN] }, 20);
      expect(isAwarded(stats, 'firstSplitWin')).toBe(false);
    });
  });

  describe('SPEC 9 rows 3 and 4: five- and ten-hand win streaks', () => {
    /**
     * The thresholds are asserted as the literals SPEC 9 prints, and then
     * driven at the hand either side of each. Driving the constant alone proves
     * nothing about the constant: a run written as `SHORT_WIN_STREAK - 1` then
     * `+ 1` passes for any value it could hold, so the two rows below would
     * agree with a five that had become a four and a ten that had become a
     * nine. Both numbers are therefore written out here as well.
     */
    it('publishes SPEC 9 two streak lengths as the numbers that section prints', () => {
      expect(SHORT_WIN_STREAK).toBe(5);
      expect(LONG_WIN_STREAK).toBe(10);
    });

    it('awards the five at the fifth consecutive hand and not the fourth', () => {
      const four = repeated(NO_STATISTICS, { hands: [WIN] }, 4);
      expect(four.streak).toBe(4);
      expect(isAwarded(four, 'fiveHandStreak')).toBe(false);

      const five = repeated(four, { hands: [WIN] }, 1);
      expect(five.streak).toBe(5);
      expect(isAwarded(five, 'fiveHandStreak')).toBe(true);
      expect(isAwarded(five, 'tenHandStreak')).toBe(false);
    });

    it('awards the ten at the tenth consecutive hand and not the ninth', () => {
      const nine = repeated(NO_STATISTICS, { hands: [WIN] }, 9);
      expect(nine.streak).toBe(9);
      expect(isAwarded(nine, 'fiveHandStreak')).toBe(true);
      expect(isAwarded(nine, 'tenHandStreak')).toBe(false);

      const ten = repeated(nine, { hands: [WIN] }, 1);
      expect(ten.streak).toBe(10);
      expect(isAwarded(ten, 'fiveHandStreak')).toBe(true);
      expect(isAwarded(ten, 'tenHandStreak')).toBe(true);
    });

    it('awards neither row again however far past ten the run goes', () => {
      const long = repeated(NO_STATISTICS, { hands: [WIN] }, 25);
      expect(long.streak).toBe(25);
      expect(long.milestones.filter((id) => id === 'fiveHandStreak')).toHaveLength(1);
      expect(long.milestones.filter((id) => id === 'tenHandStreak')).toHaveLength(1);
    });

    it('counts a streak in hands, so a split round can carry it by two', () => {
      const stats = repeated(NO_STATISTICS, { hands: [SPLIT_WIN, SPLIT_WIN] }, 2);
      expect(stats.streak).toBe(4);
      expect(stats.lifetime.handsPlayed).toBe(4);
    });

    it('ends a streak on a loss', () => {
      const broken = observeAll(NO_STATISTICS, [
        { hands: [WIN] },
        { hands: [WIN] },
        { hands: [LOSS] },
        { hands: [WIN] },
      ]);
      expect(broken.streak).toBe(1);
      expect(isAwarded(broken, 'fiveHandStreak')).toBe(false);
    });

    /**
     * The reading. SPEC 11 gives one "current streak" and SPEC 9 rows 3 and 4
     * ask only about win streaks, so what a push does to a run is not stated. A
     * push leaves it exactly where it was: a hand the player did not lose is no
     * reason to take a run away from them, and one they did not win is no
     * reason to extend it. Flipping this reading is one expression in
     * `observeRound`, and this test is what would have to move with it.
     */
    it('leaves a streak exactly where it was on a push, the documented reading', () => {
      const stats = observeAll(NO_STATISTICS, [
        { hands: [WIN] },
        { hands: [WIN] },
        { hands: [PUSH] },
        { hands: [WIN] },
      ]);
      expect(stats.streak).toBe(3);
      expect(stats.lifetime.pushes).toBe(1);

      const five = observeAll(stats, [{ hands: [PUSH] }, { hands: [WIN] }, { hands: [WIN] }]);
      expect(five.streak).toBe(SHORT_WIN_STREAK);
      expect(isAwarded(five, 'fiveHandStreak')).toBe(true);
    });

    /**
     * The other reading SPEC 9 leaves open. A five-hand run that the last hand
     * of the same split round broke still happened, so the milestone is decided
     * on the longest run the round reached and not on the run it ended with.
     */
    it('awards on a run a later hand of the same round broke', () => {
      const four = repeated(NO_STATISTICS, { hands: [WIN] }, SHORT_WIN_STREAK - 1);
      const observation = observeRound(
        four,
        roundOf({ rounds: four.rounds + 1, hands: [SPLIT_WIN, SPLIT_LOSS] }),
        NO_DECISIONS,
      );
      expect(observation.awarded).toContain('fiveHandStreak');
      expect(observation.statistics.streak).toBe(0);
    });
  });

  describe('SPEC 9 row 5: doubling the bankroll', () => {
    it('derives the target from SPEC 4.11 starting bankroll', () => {
      expect(DOUBLED_BANKROLL).toBe(2 * STARTING_CHIPS);
      expect(DOUBLED_BANKROLL).toBe(2 * SPEC_STARTING_CHIPS);
    });

    /**
     * The reading: the wallet's high-water mark, not the balance at rest. SPEC 6
     * already keeps that mark, keys every unlock to it and persists it, and a
     * bankroll doubled and then lost was still doubled. Measuring the balance
     * instead would mean a player who reached 2,000 and lost it never doubled.
     */
    it('awards on the high-water mark, so a bankroll doubled and lost still counts', () => {
      const short = observeAll(NO_STATISTICS, [
        { hands: [WIN], chips: 500, bestBalance: DOUBLED_BANKROLL - ROUND_WAGER },
      ]);
      expect(isAwarded(short, 'doubledBankroll')).toBe(false);

      const doubled = observeAll(NO_STATISTICS, [
        { hands: [WIN], chips: 500, bestBalance: DOUBLED_BANKROLL },
      ]);
      expect(isAwarded(doubled, 'doubledBankroll')).toBe(true);
    });
  });

  describe('SPEC 9 rows 8 and 9: 100 and 1,000 hands played', () => {
    it('awards the hundredth on the hundredth hand and not the ninety-ninth', () => {
      const ninetyNine = repeated(NO_STATISTICS, { hands: [LOSS] }, HUNDRED_HANDS - 1);
      expect(ninetyNine.lifetime.handsPlayed).toBe(HUNDRED_HANDS - 1);
      expect(isAwarded(ninetyNine, 'hundredHands')).toBe(false);

      const hundred = repeated(ninetyNine, { hands: [LOSS] }, 1);
      expect(hundred.lifetime.handsPlayed).toBe(HUNDRED_HANDS);
      expect(isAwarded(hundred, 'hundredHands')).toBe(true);
      expect(isAwarded(hundred, 'thousandHands')).toBe(false);
    });

    it('counts hands and not rounds, so a four-hand round advances it by four', () => {
      const stats = repeated(NO_STATISTICS, { hands: [LOSS, LOSS, LOSS, LOSS] }, 25);
      expect(stats.lifetime.handsPlayed).toBe(HUNDRED_HANDS);
      expect(isAwarded(stats, 'hundredHands')).toBe(true);
    });

    it('awards the thousandth on the lifetime scope, which a new session carries', () => {
      const first = repeated(NO_STATISTICS, { hands: [LOSS, LOSS] }, THOUSAND_HANDS / 4);
      const second = repeated(openSession(first), { hands: [LOSS, LOSS] }, THOUSAND_HANDS / 4);
      expect(second.session.handsPlayed).toBe(THOUSAND_HANDS / 2);
      expect(second.lifetime.handsPlayed).toBe(THOUSAND_HANDS);
      expect(isAwarded(second, 'thousandHands')).toBe(true);
    });
  });

  describe('SPEC 9 row 10: 90 percent accuracy over 100 decisions', () => {
    it('publishes SPEC 9 two numbers', () => {
      expect(ACCURACY_DECISIONS).toBe(100);
      expect(ACCURACY_PERCENT).toBe(90);
    });

    it('awards at exactly 90 over exactly 100 and not one short of either', () => {
      const round: Omit<RoundSpec, 'rounds'> = { hands: [WIN] };
      expect(
        isAwarded(
          observeAll(NO_STATISTICS, [round], coachAt(ACCURACY_DECISIONS - 1, ACCURACY_DECISIONS - 1)),
          'ninetyPercentAccuracy',
        ),
      ).toBe(false);
      expect(
        isAwarded(
          observeAll(NO_STATISTICS, [round], coachAt(ACCURACY_DECISIONS, ACCURACY_PERCENT - 1)),
          'ninetyPercentAccuracy',
        ),
      ).toBe(false);
      expect(
        isAwarded(
          observeAll(NO_STATISTICS, [round], coachAt(ACCURACY_DECISIONS, ACCURACY_PERCENT)),
          'ninetyPercentAccuracy',
        ),
      ).toBe(true);
    });

    it('agrees with the percentage strategy.ts publishes, across the boundary', () => {
      for (let matched = 85; matched <= 95; matched += 1) {
        const coach = coachAt(ACCURACY_DECISIONS, matched);
        const percentage = accuracy(coach.lifetime);
        const awarded = isAwarded(
          observeAll(NO_STATISTICS, [{ hands: [WIN] }], coach),
          'ninetyPercentAccuracy',
        );
        expect(awarded).toBe(percentage !== null && percentage >= ACCURACY_PERCENT);
      }
    });

    /**
     * The reading, and it is `BJ-9`'s carried forward rather than a new one.
     * `strategy.observe` returns the record untouched while the coach is off,
     * so a session played with the coach off counts no decisions and this row
     * cannot move. Nothing in `statistics.ts` counts a decision of its own,
     * which is what stops the two coming apart.
     */
    it('accrues nothing while the coach is off, because the record cannot move', () => {
      const stats = repeated(NO_STATISTICS, { hands: [WIN] }, 200, NO_DECISIONS);
      expect(isAwarded(stats, 'ninetyPercentAccuracy')).toBe(false);
      expect(NO_DECISIONS.lifetime.decisions).toBe(0);
    });

    it('reads the lifetime scope, so a new session does not undo it', () => {
      const perfect = coachAt(ACCURACY_DECISIONS, ACCURACY_DECISIONS);
      const stats = observeAll(NO_STATISTICS, [{ hands: [WIN] }], perfect);
      expect(isAwarded(stats, 'ninetyPercentAccuracy')).toBe(true);
      expect(isAwarded(openSession(stats), 'ninetyPercentAccuracy')).toBe(true);
    });

    it('awards on a lifetime record whose session scope was just reopened', () => {
      // The two scopes only differ after `strategy.openSession`, so this is the
      // one shape that tells them apart. A row 10 read on the session scope
      // would refuse a player who earned it and then opened the game again.
      const relaunched = openCoachSession(coachAt(ACCURACY_DECISIONS, ACCURACY_DECISIONS));
      expect(relaunched.session.decisions).toBe(0);
      expect(relaunched.lifetime.decisions).toBe(ACCURACY_DECISIONS);
      expect(
        isAwarded(
          observeAll(NO_STATISTICS, [{ hands: [WIN] }], relaunched),
          'ninetyPercentAccuracy',
        ),
      ).toBe(true);
    });
  });

  describe('SPEC 9 row 11: surviving below 10 percent and recovering', () => {
    it('derives 10 percent from SPEC 4.11 starting bankroll', () => {
      expect(LOW_WATER_CHIPS).toBe(STARTING_CHIPS / 10);
      expect(LOW_WATER_CHIPS).toBe(100);
    });

    /**
     * The reading: below 10 percent is `chips < 100` at rest and recovery is
     * `chips >= 1,000` at rest, both measured at the round boundary where
     * nothing is committed and the balance is the whole bankroll.
     */
    it('latches below 100 and awards on the return to 1,000, and not before', () => {
      const fallen = observeAll(NO_STATISTICS, [{ hands: [LOSS], chips: LOW_WATER_CHIPS - 1 }]);
      expect(fallen.belowLowWater).toBe(true);
      expect(isAwarded(fallen, 'survivedAndRecovered')).toBe(false);

      const partway = observeAll(fallen, [{ hands: [WIN], chips: SPEC_STARTING_CHIPS - 1 }]);
      expect(isAwarded(partway, 'survivedAndRecovered')).toBe(false);

      const recovered = observeAll(partway, [{ hands: [WIN], chips: SPEC_STARTING_CHIPS }]);
      expect(isAwarded(recovered, 'survivedAndRecovered')).toBe(true);
    });

    it('does not latch at exactly 10 percent, which is not below it', () => {
      const stats = observeAll(NO_STATISTICS, [{ hands: [LOSS], chips: LOW_WATER_CHIPS }]);
      expect(stats.belowLowWater).toBe(false);
    });

    it('awards nothing to a player who never fell', () => {
      const stats = repeated(NO_STATISTICS, { hands: [WIN], chips: 5000 }, 5);
      expect(isAwarded(stats, 'survivedAndRecovered')).toBe(false);
    });

    /**
     * The trap, and the reading that defuses it. SPEC 4.12's free reset hands
     * the player 1,000 chips, so a latch that survived it would award row 11 to
     * every player who ever busted out and pressed the button. The reset clears
     * the latch and changes nothing else.
     */
    it('is cleared by SPEC 4.12 free reset, so a bail-out is not a recovery', () => {
      const fallen = observeAll(NO_STATISTICS, [{ hands: [LOSS], chips: 5 }]);
      expect(fallen.belowLowWater).toBe(true);

      const afterReset = observeBankrollReset(fallen);
      expect(afterReset.belowLowWater).toBe(false);

      const played = observeAll(afterReset, [{ hands: [WIN], chips: SPEC_STARTING_CHIPS }]);
      expect(isAwarded(played, 'survivedAndRecovered')).toBe(false);
    });

    /**
     * The positive path after a reset, which nothing else pins. Clearing the
     * latch must **disarm** row 11, not retire it: a player who takes the free
     * reset, falls again and climbs back out on their own has done exactly what
     * the row describes, and a clear written as "this row is finished" rather
     * than "the fall does not count" would pass every other test in this block.
     */
    it('stays awardable after a reset, on a second fall the player climbed out of', () => {
      const bailedOut = observeBankrollReset(
        observeAll(NO_STATISTICS, [{ hands: [LOSS], chips: 5 }]),
      );
      expect(bailedOut.belowLowWater).toBe(false);
      expect(isAwarded(bailedOut, 'survivedAndRecovered')).toBe(false);

      const fellAgain = observeAll(bailedOut, [
        { hands: [LOSS], chips: LOW_WATER_CHIPS - 1 },
      ]);
      expect(fellAgain.belowLowWater).toBe(true);
      expect(isAwarded(fellAgain, 'survivedAndRecovered')).toBe(false);

      const recovered = observeAll(fellAgain, [{ hands: [WIN], chips: SPEC_STARTING_CHIPS }]);
      expect(isAwarded(recovered, 'survivedAndRecovered')).toBe(true);
      expect(recovered.milestones.filter((id) => id === 'survivedAndRecovered')).toHaveLength(1);
    });

    it('is cleared by a fresh launch, for the same reason', () => {
      const fallen = observeAll(NO_STATISTICS, [{ hands: [LOSS], chips: 5 }]);
      const relaunched = openSession(fallen);
      expect(relaunched.belowLowWater).toBe(false);

      const played = observeAll(relaunched, [{ hands: [WIN], chips: SPEC_STARTING_CHIPS }]);
      expect(isAwarded(played, 'survivedAndRecovered')).toBe(false);
    });

    it('survives a real bust-out and free reset without awarding', () => {
      const table = createTable({ seed: 2 });
      let stats: Statistics = NO_STATISTICS;
      const turn = bounded('draining the bankroll to SPEC 10 bust-out');
      while (table.readout().phase.kind !== 'bustOut') {
        turn();
        const state = table.readout();
        switch (state.phase.kind) {
          case 'start':
            accept(table, { kind: 'start' });
            break;
          case 'betting':
            if (state.wallet.wager === 0) {
              accept(table, { kind: 'max' });
            } else {
              accept(table, { kind: 'deal' });
            }
            break;
          case 'insurance':
            accept(table, { kind: 'declineInsurance' });
            break;
          case 'playerTurn':
            accept(table, { kind: 'stand' });
            break;
          case 'roundResult':
            stats = observeRound(stats, state, NO_DECISIONS).statistics;
            accept(table, { kind: 'nextHand' });
            break;
          default:
            table.update(TICK);
        }
      }
      expect(stats.belowLowWater).toBe(true);

      const afterReset = observeBankrollReset(stats);
      accept(table, { kind: 'resetBankroll' });
      expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS);
      expect(afterReset.belowLowWater).toBe(false);
      expect(isAwarded(afterReset, 'survivedAndRecovered')).toBe(false);
    });
  });

  describe('exactly once, and permanent', () => {
    it('awards each milestone once however many times its condition is met', () => {
      const stats = repeated(
        NO_STATISTICS,
        { hands: [NATURAL, SPLIT_WIN], bestBalance: SPEC_GOLD_UNLOCK, chips: SPEC_GOLD_UNLOCK },
        60,
      );
      // Every one of the eleven except the accuracy row, which needs a coach
      // record, and the recovery row, which needs a fall.
      for (const id of MILESTONES) {
        const times = stats.milestones.filter((awarded) => awarded === id).length;
        expect(times).toBeLessThanOrEqual(1);
      }
      expect(stats.milestones.filter((id) => id === 'firstNatural')).toHaveLength(1);
      expect(stats.milestones.filter((id) => id === 'firstSplitWin')).toHaveLength(1);
      expect(stats.milestones.filter((id) => id === 'fiveHandStreak')).toHaveLength(1);
      expect(stats.milestones.filter((id) => id === 'hundredHands')).toHaveLength(1);
      expect(new Set(stats.milestones).size).toBe(stats.milestones.length);
    });

    it('reports a milestone as awarded on the round that awarded it and never again', () => {
      const spec: Omit<RoundSpec, 'rounds'> = { hands: [NATURAL] };
      let stats = NO_STATISTICS;
      const first = observeRound(stats, roundOf({ ...spec, rounds: 1 }), NO_DECISIONS);
      stats = first.statistics;
      expect(first.awarded).toContain('firstNatural');

      const second = observeRound(stats, roundOf({ ...spec, rounds: 2 }), NO_DECISIONS);
      expect(second.awarded).not.toContain('firstNatural');
      expect(second.statistics.milestones.filter((id) => id === 'firstNatural')).toHaveLength(1);
    });

    it('awards in SPEC 9 table order when one round satisfies several', () => {
      const stats = repeated(NO_STATISTICS, { hands: [WIN] }, SHORT_WIN_STREAK - 1);
      const observation = observeRound(
        stats,
        roundOf({
          rounds: stats.rounds + 1,
          hands: [NATURAL, SPLIT_WIN],
          bestBalance: SPEC_GOLD_UNLOCK,
        }),
        NO_DECISIONS,
      );
      const order = MILESTONES.filter((id) => observation.awarded.includes(id));
      expect([...observation.awarded]).toEqual([...order]);
      expect(observation.awarded.length).toBeGreaterThan(1);
    });

    it('never removes an awarded milestone, at a reset or at a new session', () => {
      const earned = observeAll(NO_STATISTICS, [{ hands: [NATURAL] }]);
      expect(isAwarded(earned, 'firstNatural')).toBe(true);
      expect(isAwarded(observeBankrollReset(earned), 'firstNatural')).toBe(true);
      expect(isAwarded(openSession(earned), 'firstNatural')).toBe(true);
      expect(isAwarded(openSession(observeBankrollReset(earned)), 'firstNatural')).toBe(true);
    });

    it('is non-monetised: the observation carries a record and nothing else', () => {
      const readout = roundOf({ rounds: 1, hands: [NATURAL] });
      const before = JSON.stringify(readout.wallet);
      const observation = observeRound(NO_STATISTICS, readout, NO_DECISIONS);
      expect(Object.keys(observation).sort()).toEqual(['awarded', 'statistics']);
      expect(JSON.stringify(readout.wallet)).toBe(before);
    });
  });

  describe('SPEC 11 counters, in SPEC 13 two scopes', () => {
    it('keeps hands played equal to wins plus losses plus pushes', () => {
      const stats = observeAll(NO_STATISTICS, [
        { hands: [WIN] },
        { hands: [LOSS, PUSH] },
        { hands: [NATURAL] },
        { hands: [NATURAL_PUSH] },
        { hands: [SURRENDER] },
      ]);
      for (const scope of [stats.session, stats.lifetime]) {
        expect(scope.handsPlayed).toBe(scope.wins + scope.losses + scope.pushes);
      }
      expect(stats.lifetime.handsPlayed).toBe(6);
      expect(stats.lifetime.wins).toBe(2);
      expect(stats.lifetime.losses).toBe(2);
      expect(stats.lifetime.pushes).toBe(2);
      // Two naturals, one of which pushed, so blackjacks is not one of the three.
      expect(stats.lifetime.blackjacks).toBe(2);
    });

    it('counts SPEC 4.8 surrender as a loss, since SPEC 11 has no fourth bucket', () => {
      const stats = observeAll(NO_STATISTICS, [{ hands: [SURRENDER] }]);
      expect(stats.lifetime.losses).toBe(1);
      expect(stats.lifetime.wins).toBe(0);
      expect(stats.lifetime.pushes).toBe(0);
      expect(stats.streak).toBe(0);
    });

    it('resets the session scope at a launch and carries the lifetime one', () => {
      const first = repeated(NO_STATISTICS, { hands: [WIN] }, 7);
      expect(first.session).toEqual(first.lifetime);

      const second = openSession(first);
      expect(second.session).toEqual(NO_COUNTERS);
      expect(second.lifetime).toEqual(first.lifetime);
      expect(second.streak).toBe(0);
      expect(second.rounds).toBe(0);

      const played = repeated(second, { hands: [LOSS] }, 3);
      expect(played.session.handsPlayed).toBe(3);
      expect(played.lifetime.handsPlayed).toBe(10);
    });

    it('preserves both scopes across SPEC 4.12 free reset, which is not a launch', () => {
      const before = repeated(NO_STATISTICS, { hands: [WIN] }, 4);
      const after = observeBankrollReset(before);
      expect(after.session).toEqual(before.session);
      expect(after.lifetime).toEqual(before.lifetime);
      expect(after.streak).toBe(before.streak);
      expect(after.milestones).toEqual(before.milestones);
    });

    it('assembles SPEC 11 readout from the three modules that own its parts', () => {
      const stats = repeated(NO_STATISTICS, { hands: [WIN] }, 3);
      const coach: CoachRecord = Object.freeze({
        session: Object.freeze<CoachAccuracy>({ decisions: 4, matched: 3 }),
        lifetime: Object.freeze<CoachAccuracy>({ decisions: 40, matched: 34 }),
      });
      const wallet = roundOf({ rounds: 1, hands: [WIN], bestBalance: 4200 }).wallet;
      const readout = statisticsReadout(stats, wallet, coach);

      expect(readout.session.handsPlayed).toBe(3);
      expect(readout.lifetime.handsPlayed).toBe(3);
      expect(readout.session.accuracy).toBe(75);
      expect(readout.lifetime.accuracy).toBe(85);
      expect(readout.bestBalance).toBe(4200);
      expect(readout.streak).toBe(3);
    });

    it('shows no accuracy at all before the first decision, rather than zero', () => {
      const readout = statisticsReadout(
        NO_STATISTICS,
        roundOf({ rounds: 1, hands: [WIN] }).wallet,
        NO_DECISIONS,
      );
      expect(readout.session.accuracy).toBeNull();
      expect(readout.lifetime.accuracy).toBeNull();
    });
  });

  describe('persist across sessions', () => {
    function rehydrated(stats: Statistics): Statistics {
      return JSON.parse(JSON.stringify(stats)) as Statistics;
    }

    it('round-trips through JSON deep-equal and byte-identical', () => {
      const stats = observeAll(NO_STATISTICS, [
        { hands: [NATURAL] },
        { hands: [SPLIT_WIN, SPLIT_WIN], bestBalance: SPEC_SILVER_UNLOCK },
        { hands: [LOSS], chips: 40 },
      ]);
      expect(stats.milestones.length).toBeGreaterThan(0);
      const serialised = JSON.stringify(stats);
      expect(rehydrated(stats)).toEqual(stats);
      expect(JSON.stringify(rehydrated(stats))).toBe(serialised);
    });

    it('keeps every awarded milestone awarded through the round trip', () => {
      const stats = observeAll(NO_STATISTICS, [
        { hands: [NATURAL, SPLIT_WIN], bestBalance: SPEC_GOLD_UNLOCK },
      ]);
      const back = openSession(rehydrated(stats));
      for (const id of stats.milestones) {
        expect(isAwarded(back, id)).toBe(true);
      }
      expect(back.lifetime).toEqual(stats.lifetime);
      expect(back.session).toEqual(NO_COUNTERS);
    });

    it('carries no undefined and no key a round trip would lose', () => {
      const stats = observeAll(NO_STATISTICS, [{ hands: [WIN] }]);
      expect(Object.keys(rehydrated(stats)).sort()).toEqual(Object.keys(stats).sort());
      for (const value of Object.values(stats)) {
        expect(value).toBeDefined();
      }
    });
  });

  describe('what it refuses', () => {
    it('refuses a readout that is not at SPEC 10 round result', () => {
      const table = dealing(PLAYER_NATURAL);
      accept(table, { kind: 'start' });
      expect(() => observeRound(NO_STATISTICS, table.readout(), NO_DECISIONS)).toThrow(
        /settled round/,
      );
    });

    it('refuses the same round twice, which is what a polling caller would do', () => {
      const readout = roundOf({ rounds: 1, hands: [WIN] });
      const once = observeRound(NO_STATISTICS, readout, NO_DECISIONS).statistics;
      expect(once.lifetime.handsPlayed).toBe(1);
      expect(() => observeRound(once, readout, NO_DECISIONS)).toThrow(/already counted/);
    });

    it('refuses a round that skipped one, so nothing is counted twice or lost', () => {
      const stats = observeRound(NO_STATISTICS, roundOf({ rounds: 1, hands: [WIN] }), NO_DECISIONS)
        .statistics;
      expect(() => observeRound(stats, roundOf({ rounds: 3, hands: [WIN] }), NO_DECISIONS)).toThrow(
        /is not the one after/,
      );
    });

    it('refuses a result whose hand count disagrees with the felt', () => {
      const readout = roundOf({ rounds: 1, hands: [WIN, WIN] });
      const short: TableReadout = Object.freeze({
        ...readout,
        hands: Object.freeze(readout.hands.slice(0, 1)),
      });
      expect(() => observeRound(NO_STATISTICS, short, NO_DECISIONS)).toThrow(/settled hands/);
    });
  });
});
