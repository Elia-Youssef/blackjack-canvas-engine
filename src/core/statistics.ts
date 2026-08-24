/**
 * SPEC 11's counters and SPEC 9's eleven milestones. Item `J6` at `BJ-10`.
 *
 * Two scopes and one round boundary. SPEC 13 says "session statistics reset on
 * launch; lifetime statistics accumulate. Both are shown, labelled", so both
 * scopes are here, side by side, and `openSession` is the one function allowed
 * to separate them. `statisticsReadout` assembles SPEC 11's list from them.
 *
 * **This module observes and owns nothing else.** DESIGN section 2 makes
 * `table.ts` the only authority, so every number below is folded out of one
 * `TableReadout` taken at SPEC 10's `roundResult`, and three quantities that
 * already have an owner are read rather than copied:
 *
 *   - **The best chip balance is `wallet.ts`'s.** SPEC 6 keys every unlock to
 *     it and SPEC 13 persists it, so a second high-water mark here would be a
 *     copy that drifts. `statisticsReadout` takes a `WalletReadout` and reads
 *     it, and the two table milestones ask `isUnlocked` rather than restating
 *     SPEC 6's two thresholds.
 *   - **The coach's two counters are `strategy.ts`'s.** SPEC 7 puts accuracy
 *     tracking inside the coach and `CoachRecord` already carries a session and
 *     a lifetime pair. It is passed in where it is needed, never held here.
 *     That is also what settles milestone 10's reading below.
 *   - **The chip balance is the wallet's**, and it is read off SPEC 12's round
 *     result, which is the balance after every hand has settled.
 *
 * **Every milestone is decided at the round boundary, in SPEC 9's table
 * order.** One award point means one order, so a round that satisfies three
 * conditions at once awards them in the order SPEC 9 prints them, and a
 * decision counted mid-round is awarded at the end of the round it was made
 * in. Awarding is append-only and guarded by membership, which is SPEC 9's
 * "permanent" and `J6`'s "exactly once" in one line.
 *
 * **Nothing here is monetised.** No function takes a `Wallet`, only its
 * readout, so awarding a milestone cannot move a chip. SPEC 9: "No rewards
 * attached beyond the record itself."
 *
 * **Persistence is `BJ-11`'s, and this document is built to be handed to it.**
 * `Statistics` is a plain frozen value of numbers, booleans and strings, so
 * `JSON.parse(JSON.stringify(stats))` is the same document byte for byte and
 * the awarded list survives it unchanged. That round trip is what
 * `tests/unit/milestones.test.ts` proves for `J6`'s "persist across sessions";
 * the `localStorage` half of the sentence is item `I1`'s versioned document at
 * `BJ-11` and item `I4`'s launch, and is deliberately not built here.
 */

import type { Rung } from './settlement';
import type { CoachAccuracy, CoachRecord } from './strategy';
import { accuracy } from './strategy';
import type { TableReadout } from './table';
import type { TableId, WalletReadout } from './wallet';
import { LOWEST_TABLE, STARTING_CHIPS, TABLES, isUnlocked } from './wallet';

// ---------------------------------------------------------------------------
// SPEC 11's counters
// ---------------------------------------------------------------------------

/**
 * The tallies SPEC 11 shows, for one scope.
 *
 * Five, and they are the five of SPEC 11's readout list that are a count:
 * "hands played, wins, losses, pushes, blackjacks". The best chip balance and
 * the current streak are in that list too and are not here, because the first
 * belongs to `wallet.ts` and the second is not a tally but a running state.
 *
 * **These are counted per hand, not per round.** SPEC 4.6 settles each hand
 * "independently against the single dealer hand" and SPEC 9 counts "100 hands
 * played", so a round split into three hands adds three. That also makes
 * `handsPlayed === wins + losses + pushes` an identity rather than a
 * coincidence, and the test asserts it over every round it drives.
 *
 * `blackjacks` is deliberately not part of that identity: a natural that met a
 * dealer natural is a push and a blackjack at once, which is why SPEC 11 lists
 * it beside the three rather than among them.
 */
export interface Counters {
  /** SPEC 11's "hands played". One per settled hand. */
  readonly handsPlayed: number;
  /** Settled hands whose net was positive. */
  readonly wins: number;
  /** Settled hands whose net was negative, SPEC 4.8's surrender included. */
  readonly losses: number;
  /** Settled hands whose net was zero. */
  readonly pushes: number;
  /** Settled hands on which the player held a natural. SPEC 4.2. */
  readonly blackjacks: number;
}

/** A scope with nothing counted yet, for a first launch and for a test. */
export const NO_COUNTERS: Counters = Object.freeze({
  handsPlayed: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  blackjacks: 0,
});

/**
 * SPEC 4.10's two rungs on which the player held a natural.
 *
 * Rung 3 is the natural that paid 3:2 and rung 2 is the natural that met the
 * dealer's and pushed. **Both are naturals**, so both raise `blackjacks` and
 * both satisfy SPEC 9's "first natural"; reading only rung 3 would mean a
 * player dealt an Ace and a King against a dealer natural was never dealt one.
 * The rung is `settlement.ts`'s own answer to "which clause decided this", so
 * asking it here is not a second reading of SPEC 4.2.
 */
const NATURAL_RUNGS: readonly Rung[] = Object.freeze([2, 3]);

function isNaturalRung(rung: Rung): boolean {
  return NATURAL_RUNGS.includes(rung);
}

// ---------------------------------------------------------------------------
// SPEC 9's eleven
// ---------------------------------------------------------------------------

/**
 * One of SPEC 9's eleven milestones.
 *
 * The names are this module's; the list is SPEC 9's table, row for row, and
 * `MILESTONES` below holds them in that table's order so row `n` of SPEC 9 is
 * element `n - 1`.
 */
export type MilestoneId =
  /** SPEC 9 row 1: first natural. */
  | 'firstNatural'
  /** SPEC 9 row 2: first split win. */
  | 'firstSplitWin'
  /** SPEC 9 row 3: a five-hand win streak. */
  | 'fiveHandStreak'
  /** SPEC 9 row 4: a ten-hand win streak. */
  | 'tenHandStreak'
  /** SPEC 9 row 5: doubling the bankroll. */
  | 'doubledBankroll'
  /** SPEC 9 row 6: reaching Silver. */
  | 'reachedSilver'
  /** SPEC 9 row 7: reaching Gold. */
  | 'reachedGold'
  /** SPEC 9 row 8: 100 hands played. */
  | 'hundredHands'
  /** SPEC 9 row 9: 1,000 hands played. */
  | 'thousandHands'
  /** SPEC 9 row 10: 90 percent basic-strategy accuracy over 100 decisions. */
  | 'ninetyPercentAccuracy'
  /** SPEC 9 row 11: surviving a bankroll below 10 percent and recovering. */
  | 'survivedAndRecovered';

/**
 * SPEC 9's table, in its order. **Eleven, and the count is the point.**
 *
 * SPEC 9 states the number in bold and says why: "reaching each table" is
 * ambiguous on its own, Bronze is unlocked from the start, so reaching it is
 * not an achievement and only Silver and Gold count. `TABLE_MILESTONES` below
 * is where that sentence is written down as code.
 */
export const MILESTONES: readonly MilestoneId[] = Object.freeze([
  'firstNatural',
  'firstSplitWin',
  'fiveHandStreak',
  'tenHandStreak',
  'doubledBankroll',
  'reachedSilver',
  'reachedGold',
  'hundredHands',
  'thousandHands',
  'ninetyPercentAccuracy',
  'survivedAndRecovered',
]);

/**
 * SPEC 6's three tables against SPEC 9's two table milestones.
 *
 * **Bronze is `null` here rather than absent**, because "Bronze is unlocked
 * from the start and is not a milestone" is a sentence that has to be written
 * down somewhere or it gets added back, and item `J6`'s criterion says it in as
 * many words. The mapping is total over `TableId`, so a fourth table cannot be
 * added to SPEC 6 without answering the question here, and the test derives the
 * null entry from `LOWEST_TABLE` rather than naming Bronze a second time.
 */
export const TABLE_MILESTONES: Readonly<Record<TableId, MilestoneId | null>> = Object.freeze({
  bronze: null,
  silver: 'reachedSilver',
  gold: 'reachedGold',
});

/** SPEC 9 row 3. A hand, not a round: a split round can carry it by four. */
export const SHORT_WIN_STREAK = 5;

/** SPEC 9 row 4. */
export const LONG_WIN_STREAK = 10;

/**
 * SPEC 9 row 5's "doubling the bankroll", as a number.
 *
 * The bankroll is SPEC 4.11's starting 1,000, which is also what SPEC 13 opens
 * every launch at and what SPEC 4.12's free reset restores, so "the bankroll"
 * has one value in this game and doubling it is 2,000. Derived from
 * `STARTING_CHIPS` rather than written out, so a change to the bankroll moves
 * this with it.
 */
export const DOUBLED_BANKROLL = STARTING_CHIPS * 2;

/** SPEC 9 row 8. */
export const HUNDRED_HANDS = 100;

/** SPEC 9 row 9. */
export const THOUSAND_HANDS = 1000;

/** SPEC 9 row 10's "over 100 decisions". */
export const ACCURACY_DECISIONS = 100;

/** SPEC 9 row 10's "90 percent". */
export const ACCURACY_PERCENT = 90;

/** SPEC 9 row 11's "10 percent", of SPEC 4.11's starting bankroll. */
export const LOW_WATER_PERCENT = 10;

/**
 * SPEC 9 row 11's "below 10 percent", as a number of chips.
 *
 * `(1000 * 10) / 100 = 100`, exactly, and the reading it fixes is **10 percent
 * of the starting bankroll** rather than of the best balance ever reached. The
 * second reading would make the same fall a different achievement for two
 * players, and would move under a player whose high-water mark rose after the
 * fall. The recovery target is `STARTING_CHIPS` itself, which is SPEC 9's "the
 * starting amount" with no arithmetic at all.
 */
export const LOW_WATER_CHIPS = (STARTING_CHIPS * LOW_WATER_PERCENT) / 100;

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/**
 * Everything this module remembers, as one plain value.
 *
 * Frozen and replaced rather than mutated, in `strategy.ts`'s shape, so a
 * caller holding last round's figures keeps last round's figures. Every field
 * is a number, a boolean or a string, so SPEC 13's document at `BJ-11` is a
 * `JSON.stringify` away and needs no encoder.
 */
export interface Statistics {
  /** SPEC 13's session scope. Reset by `openSession` and by nothing else. */
  readonly session: Counters;
  /** SPEC 13's lifetime scope. Accumulates across launches and resets. */
  readonly lifetime: Counters;
  /**
   * SPEC 11's "current streak": consecutive hands won, and never negative.
   *
   * **A count of wins in a row, not a signed run.** SPEC 11 gives one number
   * and SPEC 9 rows 3 and 4 ask only about win streaks, so a losing run has
   * nothing to key on and inventing a sign would be a second concept in one
   * field. A loss sets it to zero; a push leaves it exactly as it was, for the
   * reason `observeRound` gives at the line that decides it.
   *
   * Session scoped: a streak is a run of hands in front of the player, and
   * SPEC 13's persisted list names lifetime statistics and no streak.
   */
  readonly streak: number;
  /**
   * How many rounds this session has been observed, for the boundary guard.
   *
   * SPEC 10 puts the settlement at one place and `table.ts` counts rounds
   * there, so a caller that observed a round twice, which a chrome polling the
   * readout every frame would do, is a caller that double counted everything
   * below. `observeRound` refuses a round that is not the next one, in the
   * house style: a `Refusal` would put a programming error on screen as
   * something the player did wrong. Session scoped because `table.ts`'s count
   * is, so a persisted lifetime figure cannot collide with it.
   */
  readonly rounds: number;
  /** SPEC 9's awarded milestones, in award order. Append-only, never removed. */
  readonly milestones: readonly MilestoneId[];
  /**
   * SPEC 9 row 11's first half, latched: the balance has been below 10 percent.
   *
   * **Session scoped, and cleared by SPEC 4.12's free reset.** Row 11 is
   * "surviving a bankroll below 10 percent and recovering to the starting
   * amount", and neither the reset nor a fresh launch is a recovery: both hand
   * the player 1,000 chips. A latch that survived either would award row 11 to
   * every player who ever busted out and pressed the free reset, which is the
   * opposite of what the row is for. `observeBankrollReset` and `openSession`
   * are the two functions that clear it, and both do nothing else to the
   * record.
   */
  readonly belowLowWater: boolean;
}

/** A record with nothing counted yet, for a first launch and for a test. */
export const NO_STATISTICS: Statistics = Object.freeze({
  session: NO_COUNTERS,
  lifetime: NO_COUNTERS,
  streak: 0,
  rounds: 0,
  milestones: Object.freeze([]),
  belowLowWater: false,
});

/**
 * A new session. SPEC 13: the session counters restart and the lifetime ones
 * do not.
 *
 * The whole reason there are two scopes, and the mirror of
 * `strategy.openSession`, which the caller invokes on the `CoachRecord` at the
 * same moment. The milestones and the lifetime tallies survive, because SPEC 9
 * calls milestones permanent and SPEC 13 persists both.
 */
export function openSession(stats: Statistics): Statistics {
  return Object.freeze({
    session: NO_COUNTERS,
    lifetime: stats.lifetime,
    streak: 0,
    rounds: 0,
    milestones: stats.milestones,
    belowLowWater: false,
  });
}

/**
 * SPEC 4.12's free bankroll reset, as this module sees it.
 *
 * "A reset preserves the best chip balance, all lifetime statistics, milestones
 * and unlocks." Three of those four belong to `wallet.ts`; the ones here are
 * preserved by writing every field out rather than by a spread, so the
 * preservation is visible at the line that performs it and item `C4` at
 * `BJ-20` has something to read. The **session** counters are preserved too:
 * SPEC 13 resets those on launch, and a reset is not a launch.
 *
 * The one field that moves is SPEC 9 row 11's latch, for the reason its own
 * comment gives.
 */
export function observeBankrollReset(stats: Statistics): Statistics {
  return Object.freeze({
    session: stats.session,
    lifetime: stats.lifetime,
    streak: stats.streak,
    rounds: stats.rounds,
    milestones: stats.milestones,
    belowLowWater: false,
  });
}

/** Whether SPEC 9 has already awarded this one. */
export function isAwarded(stats: Statistics, id: MilestoneId): boolean {
  return stats.milestones.includes(id);
}

// ---------------------------------------------------------------------------
// The round boundary
// ---------------------------------------------------------------------------

/** What one observed round did to the record, and what it awarded. */
export interface RoundObservation {
  readonly statistics: Statistics;
  /** Milestones awarded by this round, in SPEC 9's table order. Usually none. */
  readonly awarded: readonly MilestoneId[];
}

/** One settled hand folded into a scope. */
function count(counters: Counters, net: number, natural: boolean): Counters {
  return Object.freeze({
    handsPlayed: counters.handsPlayed + 1,
    wins: counters.wins + (net > 0 ? 1 : 0),
    losses: counters.losses + (net < 0 ? 1 : 0),
    pushes: counters.pushes + (net > 0 || net < 0 ? 0 : 1),
    blackjacks: counters.blackjacks + (natural ? 1 : 0),
  });
}

/**
 * SPEC 9 row 10, as integers.
 *
 * The same inequality as `accuracy(counters) >= 90` with the division cleared,
 * so the threshold is decided without a float comparison landing on the exact
 * boundary. `accuracy` is still the one place the percentage itself is
 * computed, and `statisticsReadout` below is what shows it; the test drives
 * both across the boundary and requires them to agree.
 *
 * **The scope is lifetime**, because SPEC 9's milestones are permanent and a
 * player who was accurate over a hundred decisions on Tuesday did not stop
 * having been. **The window is every decision, not the last hundred**: a
 * rolling window would need a ring of decisions that SPEC 8 does not describe
 * and SPEC 13 does not persist, so "over 100 decisions" is read as the record
 * being at least that long.
 *
 * **With the coach off this cannot move**, and that is by construction rather
 * than by a branch: `strategy.observe` returns the record untouched when the
 * mode is `off`, so the counters this reads never rise. `BJ-9` parked that
 * reading and item `J4` at `BJ-20` grades it; nothing here counts a decision of
 * its own, so the two cannot come apart.
 */
function accurateEnough(coach: CoachRecord): boolean {
  const { decisions, matched } = coach.lifetime;
  return decisions >= ACCURACY_DECISIONS && matched * 100 >= ACCURACY_PERCENT * decisions;
}

/**
 * Fold one completed round into the record. SPEC 11's counters, SPEC 9's
 * milestones, and item `J6`'s "exactly once".
 *
 * The readout must be at SPEC 10's `roundResult`, which is the only phase that
 * carries a settled round, and it must be the round after the one last
 * observed. Both are caller defects rather than player actions and are thrown
 * rather than refused, the way `wallet.endRound` refuses a boundary with a hand
 * still committed.
 *
 * **The cards are still on the felt here, and that is what makes one argument
 * enough.** `table.ts` sweeps at `Next Hand` and not at the settlement, so this
 * one readout carries SPEC 12's result, the hands it settled with their
 * `fromSplit` flags, and the wallet, and nothing has to be threaded in beside
 * it. The `CoachRecord` is the exception, for the reason the header gives.
 *
 * **What a win is, once, for every counter and both streak milestones.** A
 * settled hand's net is `credit - wager`, which is SPEC 4.10's own "Net on the
 * hand's wager": positive is a win, negative a loss, zero a push. Read from the
 * net rather than from the outcome name so that SPEC 4.8's surrender, which is
 * its own outcome and returns half the wager, lands in losses without a fourth
 * bucket SPEC 11 does not have. `-0` compares equal to zero here, which is the
 * `=== 0` semantics `BJ-5` asked every consumer of an off-grid wager to keep.
 */
export function observeRound(
  stats: Statistics,
  readout: TableReadout,
  coach: CoachRecord,
): RoundObservation {
  const { phase } = readout;
  if (phase.kind !== 'roundResult') {
    throw new RangeError(
      `SPEC 11 counts a settled round; the phase is ${phase.kind} and carries no result`,
    );
  }
  if (readout.rounds !== stats.rounds + 1) {
    throw new RangeError(
      `round ${String(readout.rounds)} is not the one after ${String(stats.rounds)}; ` +
        'SPEC 10 settles once per round and this record has already counted it',
    );
  }
  const settled = phase.result.hands;
  if (settled.length !== readout.hands.length) {
    throw new RangeError(
      `${String(settled.length)} settled hands against ${String(readout.hands.length)} on the ` +
        'felt; SPEC 12 prints one result per hand in play order',
    );
  }

  let session = stats.session;
  let lifetime = stats.lifetime;
  let streak = stats.streak;
  /**
   * The longest run this round reached, not the run it ended on.
   *
   * SPEC 9 rows 3 and 4 are "a five-hand win streak" and "a ten-hand win
   * streak", and a streak that a later hand of the same split round broke still
   * happened. Awarding on the streak left standing at the boundary would lose
   * the run to the hand after it, which is a different rule and not the one
   * SPEC 9 states.
   */
  let peak = streak;
  let natural = false;
  let splitWin = false;

  settled.forEach((hand, index) => {
    const inPlay = readout.hands[index];
    if (inPlay === undefined) {
      throw new RangeError(`hand ${String(index)} settled but is not on the felt`);
    }
    const net = hand.credit - hand.wager;
    const wasNatural = isNaturalRung(hand.rung);
    session = count(session, net, wasNatural);
    lifetime = count(lifetime, net, wasNatural);
    natural = natural || wasNatural;
    // SPEC 9 row 2 is a **split win**, so both halves of the sentence are read
    // off the same hand: `fromSplit` is set at the split and never recomputed,
    // and the net is the same one every counter above used.
    splitWin = splitWin || (inPlay.fromSplit && net > 0);
    // SPEC 11's current streak. A win extends it and a loss ends it; **a push
    // leaves it exactly where it was**, because a hand the player did not lose
    // is no reason to take a run away from them and a hand they did not win is
    // no reason to extend it. SPEC 11 does not say which of the three it is,
    // so this is the reading, in one expression, and the test pins it.
    streak = net > 0 ? streak + 1 : net < 0 ? 0 : streak;
    peak = streak > peak ? streak : peak;
  });

  const chips = phase.result.chips;
  const best = readout.wallet.bestBalance;
  // SPEC 9 row 11's first half, latched at rest. `endRound` has run by the time
  // this phase exists, so nothing is committed and `chips` is the whole
  // bankroll: the balance the row is about is the one the player is looking at.
  const belowLowWater = stats.belowLowWater || chips < LOW_WATER_CHIPS;

  const met: Readonly<Record<MilestoneId, boolean>> = Object.freeze({
    // Rows 1 and 2 say "first", and the membership guard below is what makes
    // them first. The condition itself is only "this round had one".
    firstNatural: natural,
    firstSplitWin: splitWin,
    fiveHandStreak: peak >= SHORT_WIN_STREAK,
    tenHandStreak: peak >= LONG_WIN_STREAK,
    // Row 5 on the high-water mark rather than the balance at rest, because
    // SPEC 6 already keeps that mark, keys every unlock to it and persists it,
    // and because a bankroll doubled and then lost inside one round was still
    // doubled. `>=` and not `===`, since a single 3:2 natural can step over it.
    doubledBankroll: best >= DOUBLED_BANKROLL,
    // Rows 6 and 7 through SPEC 6's own predicate, so the two thresholds live
    // in `wallet.ts` alone. `TABLE_MILESTONES` is where Bronze's absence is
    // stated.
    reachedSilver: isUnlocked('silver', best),
    reachedGold: isUnlocked('gold', best),
    // Rows 8 and 9 on the lifetime scope: SPEC 9's milestones are permanent, so
    // the hands that count are every hand the player has played.
    hundredHands: lifetime.handsPlayed >= HUNDRED_HANDS,
    thousandHands: lifetime.handsPlayed >= THOUSAND_HANDS,
    ninetyPercentAccuracy: accurateEnough(coach),
    // Row 11's second half. "Recovering to the starting amount" is the balance
    // at rest reaching 1,000 again, measured at the same boundary as the fall.
    survivedAndRecovered: belowLowWater && chips >= STARTING_CHIPS,
  });

  const awarded = MILESTONES.filter((id) => met[id] && !stats.milestones.includes(id));

  return Object.freeze({
    statistics: Object.freeze({
      session,
      lifetime,
      streak,
      rounds: readout.rounds,
      milestones:
        awarded.length === 0
          ? stats.milestones
          : Object.freeze([...stats.milestones, ...awarded]),
      belowLowWater,
    }),
    awarded: Object.freeze(awarded),
  });
}

// ---------------------------------------------------------------------------
// SPEC 11's readout
// ---------------------------------------------------------------------------

/** One scope as SPEC 11 and SPEC 7 show it together. */
export interface ScopeReadout extends Counters {
  /** SPEC 7's running percentage for this scope, or `null` before the first. */
  readonly accuracy: number | null;
}

/**
 * SPEC 11's statistics, both scopes, labelled and separately readable.
 *
 * SPEC 13 requires both to be shown, so this returns both rather than a
 * selected one. `bestBalance` and `streak` sit outside the two scopes because
 * neither is a tally: the first is `wallet.ts`'s high-water mark, which is a
 * lifetime quantity with no session counterpart, and the second is one running
 * state that SPEC 11 lists once.
 */
export interface StatisticsReadout {
  readonly session: ScopeReadout;
  readonly lifetime: ScopeReadout;
  /** SPEC 11's "best chip balance", read from `wallet.ts` and not copied. */
  readonly bestBalance: number;
  /** SPEC 11's "current streak". */
  readonly streak: number;
}

function scope(counters: Counters, coach: CoachAccuracy): ScopeReadout {
  return Object.freeze({ ...counters, accuracy: accuracy(coach) });
}

/**
 * SPEC 11's continuous readout, assembled from the three modules that own it.
 *
 * Nothing is stored to build this: the counters are this module's, the best
 * balance is the wallet's and the two percentages are the coach's. An assembled
 * value rather than a stored one is the same stance `strategy.ts` takes on the
 * percentage itself, and for the same reason: a derived figure kept beside the
 * numbers it came from is the drift this project's document gate exists to
 * catch.
 */
export function statisticsReadout(
  stats: Statistics,
  wallet: WalletReadout,
  coach: CoachRecord,
): StatisticsReadout {
  return Object.freeze({
    session: scope(stats.session, coach.session),
    lifetime: scope(stats.lifetime, coach.lifetime),
    bestBalance: wallet.bestBalance,
    streak: stats.streak,
  });
}

/**
 * SPEC 6's tables that reaching is an achievement: every one but the lowest.
 *
 * Exported for the test that ties `TABLE_MILESTONES` to SPEC 6 rather than to a
 * written-out pair of names, so a fourth table added to SPEC 6 without a
 * milestone fails the arithmetic instead of passing quietly.
 */
export const MILESTONE_TABLES: readonly TableId[] = Object.freeze(
  TABLES.filter((limits) => limits.id !== LOWEST_TABLE.id).map((limits) => limits.id),
);
