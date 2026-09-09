/**
 * Session seeds that walk SPEC 10's phases in the orders item `C1` and item
 * `C3` need, found rather than staged. `BJ-20`.
 *
 * `peek-seeds.ts` and `action-seeds.ts` are the pattern and the precedent:
 * `boot` takes a seed and never a scripted deck, so a spec that needs a
 * particular round has to find it. This module imports `core/` alone, drives
 * the real machine headlessly in Node, and reports the first seed on each of
 * four shapes:
 *
 *   - **an Ace-up round that asks the insurance question and plays on**: the
 *     up card is an Ace, the hole card is not a natural, the player's own
 *     first two cards are not a natural either, and the dealer draws after
 *     the reveal, so the round passes through `insurance`, `peek`,
 *     `playerTurn`, `reveal`, `dealerTurn` and `settling` before its result.
 *   - **a ten-value-up round that peeks without asking**: the up card is a
 *     ten, the hole card is not a natural, and the dealer again draws, so the
 *     round passes through `peek` and the same tail without ever offering
 *     insurance.
 *   - **a split whose hands settle differently**: a pair that splits, whose
 *     left hand wins and whose right hand loses against the one dealer hand,
 *     which is item `C3`'s "each settles independently" as a literal round
 *     rather than an inference from two equal ones.
 *   - **two bust-outs in one session, whose offers differ**, added at `BJ-23`.
 *     `doubleBustJourney` below carries the whole reasoning.
 *
 * Nothing here reads a clock or a random source: the shoe is `BJ-3`'s seeded
 * stream, so the answers are stable across runs and across engines.
 */

import { handValue } from '../../../src/core/hand';
import { createTable, doubleRefusal, splitRefusal } from '../../../src/core/table';
import type { PhaseKind } from '../../../src/core/types';
import {
  bustOut,
  canFund,
  createWallet,
  tableLimits,
  type TableId,
} from '../../../src/core/wallet';

/** How far each search looks before failing loudly rather than returning less. */
const SEED_LIMIT = 6000;

/** A step large enough to walk a deal quickly; QUALITY-BAR 7's clamp bounds it. */
const SEARCH_STEP = 0.25;

/** No round needs more frames than this to reach its next decision point. */
const SEARCH_FRAMES = 600;

/**
 * How many hits one hand is offered before the search gives its seed up.
 *
 * A hand cannot take more than eight cards without passing 21, since the four
 * lowest ranks in the shoe are Aces and twos, so a limit of ten is past every
 * reachable hand and is a guard against a loop rather than a rule about play.
 */
const HIT_LIMIT = 10;

/** The wager every search bets: Bronze-legal, and splittable twice over. */
export const FLOW_WAGER = 50;

/** The shape the Ace-up search needs, as the spec will read it back. */
export interface AceUpSeed {
  readonly seed: number;
}

/** The shape the ten-up search needs. */
export interface TenUpSeed {
  readonly seed: number;
}

/** The split search's answer, with what the round it found settles to. */
export interface SplitSeed {
  readonly seed: number;
  /** `true` when the LEFT hand is the winning one, which the spec asserts. */
  readonly leftWins: boolean;
}

/**
 * Step the machine until it leaves SPEC 10's five timed phases.
 *
 * The insurance question is returned rather than answered, on `action-seeds`'s
 * reasoning: a search that answered offers for itself would hand back seeds
 * whose rounds stop at screens the caller is not expecting.
 */
function settle(table: ReturnType<typeof createTable>): PhaseKind {
  for (let frame = 0; frame < SEARCH_FRAMES; frame += 1) {
    const kind = table.readout().phase.kind;
    if (
      kind === 'dealing' ||
      kind === 'peek' ||
      kind === 'reveal' ||
      kind === 'dealerTurn' ||
      kind === 'settling'
    ) {
      table.update(SEARCH_STEP);
      continue;
    }
    return kind;
  }
  throw new Error('a search round never reached a decision point');
}

/** Step the machine to its round result, or give the seed up as unusable. */
function toResult(table: ReturnType<typeof createTable>): boolean {
  for (let frame = 0; frame < SEARCH_FRAMES; frame += 1) {
    const kind = table.readout().phase.kind;
    if (kind === 'roundResult') {
      return true;
    }
    if (kind === 'playerTurn' || kind === 'insurance') {
      return false;
    }
    table.update(SEARCH_STEP);
  }
  return false;
}

/** Whether the dealer's visible cards include at least one draw past two. */
function dealerDrewCards(table: ReturnType<typeof createTable>): boolean {
  return table.readout().dealerVisible.length > 2;
}

/** Is this rank one of the ten-value cards SPEC 4.4 peeks behind? */
function isTenUp(rank: string): boolean {
  return rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K';
}

let aceUp: number | null = null;

/**
 * A seed whose round offers insurance, survives its peek, hands the player a
 * decision, and draws the dealer out. Searched once and remembered.
 */
export function aceUpRound(): AceUpSeed {
  if (aceUp !== null) {
    return Object.freeze({ seed: aceUp });
  }
  for (let seed = 1; seed <= SEED_LIMIT; seed += 1) {
    const table = createTable({ seed });
    table.apply({ kind: 'start' });
    table.apply({ kind: 'tapChip', chip: FLOW_WAGER });
    table.apply({ kind: 'deal' });
    if (settle(table) !== 'insurance') {
      continue;
    }
    // The player's own hand must be an ordinary one: a natural turns the offer
    // into even money, which is a different sentence than the one C1 walks.
    const dealt = table.readout().hands[0];
    const ranks = dealt?.cards.map((card) => card.rank) ?? [];
    const hasAce = ranks.includes('A');
    const hasTen = ranks.some((rank) => isTenUp(rank));
    if (hasAce && hasTen) {
      continue;
    }
    table.apply({ kind: 'declineInsurance' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }
    table.apply({ kind: 'stand' });
    if (!toResult(table)) {
      continue;
    }
    if (!dealerDrewCards(table)) {
      continue;
    }
    aceUp = seed;
    return Object.freeze({ seed });
  }
  throw new Error('no seed inside the search limit carries the Ace-up round');
}

let tenUp: number | null = null;

/**
 * A seed whose up card is a ten-value one, so the peek runs with no offer to
 * make, and whose dealer draws after the reveal. Searched once and remembered.
 */
export function tenUpRound(): TenUpSeed {
  if (tenUp !== null) {
    return Object.freeze({ seed: tenUp });
  }
  for (let seed = 1; seed <= SEED_LIMIT; seed += 1) {
    const table = createTable({ seed });
    table.apply({ kind: 'start' });
    table.apply({ kind: 'tapChip', chip: FLOW_WAGER });
    table.apply({ kind: 'deal' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }
    const up = table.readout().dealerVisible[0]?.rank;
    if (up === undefined || !isTenUp(up)) {
      continue;
    }
    table.apply({ kind: 'stand' });
    if (!toResult(table)) {
      continue;
    }
    if (!dealerDrewCards(table)) {
      continue;
    }
    tenUp = seed;
    return Object.freeze({ seed });
  }
  throw new Error('no seed inside the search limit carries the ten-up round');
}

/** The review-mode search's answer: the round, and how many hits climb it. */
export interface MismatchSeed {
  readonly seed: number;
  /** Hits that raise the dealt hand to a hard 17 to 20 without busting. */
  readonly climbs: number;
}

let mismatch: MismatchSeed | null = null;

/**
 * A seed whose first round deals a hand under 17 that climbs to a hard 17 to
 * 20 on hits and still stands, so one more hit is a guaranteed strategy
 * mismatch: no chart in SPEC 7's matrix hits a hard seventeen or better. The
 * landing must be hard, because a soft 17 or 18 is a hand several cells
 * genuinely hit and the mismatch would stop being guaranteed. `coach.spec.ts`
 * replays the exact drive, one seeded round where the live retry it replaced
 * ran up to eight against a 30 second budget; the `BJ-20` review timed that
 * shape out under full-suite load on the slowest engine, and this hunt is its
 * cure.
 */
export function coachMismatchRound(): MismatchSeed {
  if (mismatch !== null) {
    return mismatch;
  }
  for (let seed = 1; seed <= SEED_LIMIT; seed += 1) {
    const table = createTable({ seed });
    table.apply({ kind: 'start' });
    table.apply({ kind: 'tapChip', chip: FLOW_WAGER });
    table.apply({ kind: 'deal' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }
    const dealt = table.readout().hands[0];
    if (dealt === undefined || handValue(dealt.cards).total >= 17) {
      continue;
    }
    let climbs = 0;
    let landed = false;
    for (let hits = 0; hits < 6 && !landed; hits += 1) {
      table.apply({ kind: 'hit' });
      if (settle(table) !== 'playerTurn') {
        break;
      }
      climbs += 1;
      const hand = table.readout().hands[0];
      if (hand === undefined) {
        break;
      }
      const value = handValue(hand.cards);
      if (value.total >= 17) {
        if (value.total > 20 || value.soft) {
          break;
        }
        landed = true;
      }
    }
    if (!landed || climbs < 1) {
      continue;
    }
    table.apply({ kind: 'hit' });
    if (settle(table) === 'playerTurn') {
      table.apply({ kind: 'stand' });
    }
    if (!toResult(table)) {
      continue;
    }
    mismatch = Object.freeze({ seed, climbs });
    return mismatch;
  }
  throw new Error('no seed inside the search limit climbs to a hard seventeen');
}

let splitDiff: SplitSeed | null = null;

/**
 * A seed whose pair splits into a winning left hand and a losing right one,
 * against the single dealer hand. Searched once and remembered.
 *
 * The route is the plain one a player takes: split, stand the left hand, one
 * hit on the right, stand whatever is left of it. A seed qualifies only when
 * the two settled outcomes are a win and a loss, which is the independence
 * item `C3` asserts as a fact about the round rather than as an absence of
 * evidence.
 */
export function differingSplit(): SplitSeed {
  if (splitDiff !== null) {
    return splitDiff;
  }
  for (let seed = 1; seed <= SEED_LIMIT; seed += 1) {
    const table = createTable({ seed });
    table.apply({ kind: 'start' });
    table.apply({ kind: 'tapChip', chip: FLOW_WAGER });
    table.apply({ kind: 'deal' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }
    const dealt = table.readout();
    const hand = dealt.hands[0];
    if (hand === undefined) {
      continue;
    }
    if (splitRefusal(hand, { rules: dealt.rules, splits: dealt.splits }) !== null) {
      continue;
    }
    if (!canFund(hand.wager, dealt.wallet.chips)) {
      continue;
    }
    table.apply({ kind: 'split' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }
    const turned = table.readout();
    if (turned.phase.kind !== 'playerTurn') {
      continue;
    }
    if (turned.phase.activeHand !== 0) {
      continue;
    }
    table.apply({ kind: 'stand' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }
    const rightTurn = table.readout();
    if (rightTurn.phase.kind !== 'playerTurn' || rightTurn.phase.activeHand !== 1) {
      continue;
    }
    table.apply({ kind: 'hit' });
    if (settle(table) === 'playerTurn') {
      table.apply({ kind: 'stand' });
    }
    for (let frame = 0; frame < SEARCH_FRAMES; frame += 1) {
      const kind = table.readout().phase.kind;
      if (kind === 'roundResult') {
        break;
      }
      table.update(SEARCH_STEP);
    }
    const finished = table.readout();
    if (finished.phase.kind !== 'roundResult') {
      continue;
    }
    const hands = finished.phase.result.hands;
    if (hands.length !== 2) {
      continue;
    }
    const left = hands[0];
    const right = hands[1];
    if (left === undefined || right === undefined) {
      continue;
    }
    const won = (outcome: string): boolean => outcome === 'PLAYER_WIN' || outcome === 'BLACKJACK';
    const lost = (outcome: string): boolean => outcome === 'DEALER_WIN';
    if (won(left.outcome) && lost(right.outcome)) {
      splitDiff = Object.freeze({ seed, leftWins: true });
      return splitDiff;
    }
    if (won(right.outcome) && lost(left.outcome)) {
      splitDiff = Object.freeze({ seed, leftWins: false });
      return splitDiff;
    }
  }
  throw new Error('no seed inside the search limit splits into differing outcomes');
}

/** The four-hand search's answer, with what the round it found ends holding. */
export interface FourWaySeed {
  readonly seed: number;
  /** How many cards each hand holds at the round result, in play order. */
  readonly cards: readonly number[];
}

let fourWay: FourWaySeed | null = null;

/**
 * A seed whose first round splits all the way to SPEC 4.6's four hands.
 *
 * `AUDIT-2`'s findings `Z3-01`, `J5-01`, `J1-06` and `J5-02` are all measured
 * at the widest picture the game can draw, and four hands is that picture:
 * `src/core/table.ts` caps a round at three splits, so four bands sharing one
 * surface is the most pressure item `E8`'s fan can be put under by playing.
 *
 * The route is the one the browser spec drives, press for press: split whenever
 * the machine offers it and the balance funds it, then stand every hand. The
 * search reports the card counts the round ends with so the spec can state the
 * shape it is measuring rather than discovering it, and a retune that stops the
 * seed reaching four hands fails here rather than quietly grading two.
 */
export function fourWaySplit(): FourWaySeed {
  if (fourWay !== null) {
    return fourWay;
  }
  for (let seed = 1; seed <= SEED_LIMIT; seed += 1) {
    const table = createTable({ seed });
    table.apply({ kind: 'start' });
    table.apply({ kind: 'tapChip', chip: FLOW_WAGER });
    table.apply({ kind: 'deal' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const dealt = table.readout();
      const active = dealt.phase.kind === 'playerTurn' ? dealt.phase.activeHand : -1;
      const hand = active < 0 ? undefined : dealt.hands[active];
      if (hand === undefined) {
        break;
      }
      if (splitRefusal(hand, { rules: dealt.rules, splits: dealt.splits }) !== null) {
        break;
      }
      if (!canFund(hand.wager, dealt.wallet.chips)) {
        break;
      }
      table.apply({ kind: 'split' });
      if (settle(table) !== 'playerTurn') {
        break;
      }
    }
    if (table.readout().hands.length !== 4) {
      continue;
    }
    for (let stands = 0; stands < 8; stands += 1) {
      if (table.readout().phase.kind !== 'playerTurn') {
        break;
      }
      table.apply({ kind: 'stand' });
      settle(table);
    }
    for (let frame = 0; frame < SEARCH_FRAMES; frame += 1) {
      if (table.readout().phase.kind === 'roundResult') {
        break;
      }
      table.update(SEARCH_STEP);
    }
    const finished = table.readout();
    if (finished.phase.kind !== 'roundResult' || finished.hands.length !== 4) {
      continue;
    }
    fourWay = Object.freeze({
      seed,
      cards: Object.freeze(finished.hands.map((hand) => hand.cards.length)),
    });
    return fourWay;
  }
  throw new Error('no seed inside the search limit splits into four hands');
}

// ---------------------------------------------------------------------------
// BJ-23: the double-bust journey, and the second offer a first one cannot see
// ---------------------------------------------------------------------------

/**
 * The high-water mark the journey boots with, so Gold is seated at all.
 *
 * The same figure `tests/browser/support/action-seeds.ts` brings for the same
 * reason: SPEC 6 keys the unlocks to the best balance ever reached, and a
 * session that has to earn 10,000 before it can sit at Gold is not a browser
 * test.
 */
export const JOURNEY_MARK = 10_000;

/** Where the journey starts. Gold, because it is the only table with two below it. */
export const JOURNEY_TABLE: TableId = 'gold';

/** Where the first offer is taken. The middle table, so the second offer is shorter. */
export const JOURNEY_DROP: TableId = 'silver';

/**
 * The chips the first round taps, and the wager they build. SPEC 4.11's grid.
 *
 * **460 is derived rather than chosen.** The bankroll starts at
 * `STARTING_CHIPS`, a doubled hand that busts loses `2 x wager`, and the
 * balance left has to land in one band: below Gold's minimum, which is what
 * SPEC 4.12 fires the bust-out on, and at or above Silver's minimum, so the
 * screen offers **both** lower tables rather than one. That is `1000 - 2w`
 * inside `[50, 100)`, so `w` inside `(450, 475]`, and on the 10 grid that
 * leaves 460 and 470. 460 is the lower of the two and leaves 80 chips, which
 * funds the second round's wager with something over.
 *
 * **The double is a choice, not a necessity, and the counterexample is
 * recorded here so the next reader does not rediscover it as a bug.** An
 * earlier version of this comment said no plain loss could reach the band.
 * That is false: the same arithmetic on an undoubled wager needs `w` inside
 * `(900, 950]`, and on the grid that band holds **five** wagers, 910 to 950,
 * not only the 950 `action-seeds.ts` takes. The `BJ-23` review constructed one
 * by driving the real machine: seed 3, an undoubled 910 lost at Gold, leaves 90
 * chips and offers `[bronze, silver]`; drop to Silver, lose 50, and 40 chips
 * offer `[bronze]`. Two differing offers, no double anywhere.
 *
 * **What the double buys is a second property in the same journey.** SPEC 4.5
 * records a doubled hand that busts as `bust` rather than as `doubled`, and
 * `double-bust.spec.ts` asserts both halves off the machine, that the hand
 * carried `2 x JOURNEY_WAGER` and that the cards ended it. No plain loss
 * reaches that, so the doubled route grades the rebuild coupling `BJ-20`
 * recorded **and** the doubled-bust recording in one seeded session, which is
 * why it is the route taken.
 */
export const JOURNEY_WAGER = 460;

/** The tap sequence that builds it, on SPEC 4.11's four denominations. */
export const JOURNEY_CHIPS = [100, 100, 100, 100, 50, 10] as const;

/**
 * The second round's wager: Silver's own minimum, which 80 chips can fund.
 *
 * It cannot be doubled and is not meant to be. After the commit the balance
 * holds 30, which is less than the equal wager `commitDouble` asks for, so the
 * second round busts its hand by hitting instead. Silver's minimum is also its
 * floor, so there is no smaller legal wager to leave more behind.
 */
export const JOURNEY_SECOND_WAGER = 50;

/** What the double-bust search reports back to the spec that replays it. */
export interface DoubleBustSeed {
  readonly seed: number;
  /** Hits the second round needs before its hand busts. Pinned by the spec. */
  readonly hits: number;
  /** The lower tables the first bust-out offers, lowest first. */
  readonly firstOffer: readonly TableId[];
  /** The lower tables the second offers, after the drop. A strict subset. */
  readonly secondOffer: readonly TableId[];
}

let doubleBust: DoubleBustSeed | null = null;

/**
 * A session that busts out twice, and whose second offer is not its first.
 *
 * **What this closes.** `BJ-20` shipped the bust-out screen's lower-table list
 * behind a rebuild key: `src/ui/components/screens.ts` joins the offer's table
 * ids and rebuilds the buttons only when that string changes. Its `C4` ledger
 * entry originally mutated the key itself, and the sweep at `BJ-20` recorded
 * the entry as an evidence defect: **no single-bust-out spec can observe a
 * broken key at all.** The cached string starts `null`, so the first offer is
 * built whatever the key says, and a session that reaches the screen once
 * never asks the cache a second question. The entry was re-pointed at the
 * build loop, which one bust-out does grade, and the coupling was recorded as
 * an open gap with this part as its home.
 *
 * **What makes the gap observable.** Two bust-outs in one session whose offers
 * differ. The first is at Gold with 80 chips left, which both lower tables can
 * still be entered on; the drop takes the player to Silver, and the second is
 * at Silver with 30 chips left, which only Bronze can. A stale cache therefore
 * leaves a Drop to Silver button on the screen of a player who is sitting at
 * Silver, which is the exact defect the key exists to prevent and the exact
 * thing one bust-out cannot show.
 *
 * **The search states the property rather than the answer.** A qualifying seed
 * has to leave the two offers overlapping but not equal: the first carries the
 * table the journey drops to, the second is non-empty and a strict subset of
 * the first, and it no longer names the seat the player is in. A retune of
 * SPEC 6's tables that broke any of those fails here, loudly, rather than
 * quietly handing back a journey whose second screen happens to look like its
 * first. The two balances are checked against `tableLimits` for the same
 * reason, so no figure in this file is a number the search trusts twice.
 */
export function doubleBustJourney(): DoubleBustSeed {
  if (doubleBust !== null) {
    return doubleBust;
  }
  const start = tableLimits(JOURNEY_TABLE);
  const dropped = tableLimits(JOURNEY_DROP);
  for (let seed = 1; seed <= SEED_LIMIT; seed += 1) {
    const table = createTable({
      seed,
      table: JOURNEY_TABLE,
      wallet: createWallet({ bestBalance: JOURNEY_MARK }),
    });
    table.apply({ kind: 'start' });
    for (const denomination of JOURNEY_CHIPS) {
      table.apply({ kind: 'tapChip', chip: denomination });
    }
    if (table.readout().wallet.wager !== JOURNEY_WAGER) {
      throw new Error('the double-bust search could not build its wager');
    }
    table.apply({ kind: 'deal' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }

    // The double has to be legal on the cards and funded by the balance, which
    // are the two questions `src/ui/components/actions.ts` greys the control
    // with. Asked of `core/` rather than re-derived from the ranks.
    const dealt = table.readout();
    const hand = dealt.hands[0];
    if (hand === undefined) {
      continue;
    }
    if (doubleRefusal(hand, { rules: dealt.rules, splits: dealt.splits }) !== null) {
      continue;
    }
    if (!canFund(hand.wager, dealt.wallet.chips)) {
      continue;
    }

    table.apply({ kind: 'double' });
    // SPEC 4.5 gives a doubled hand exactly one card, and `table.ts` records a
    // doubled hand that busts as `bust` rather than as `doubled`. A hand that
    // survived its card would leave the round's outcome to the dealer, and the
    // journey needs a loss it does not have to hope for.
    if (table.readout().hands[0]?.state !== 'bust') {
      continue;
    }
    if (settle(table) !== 'roundResult') {
      continue;
    }
    const afterFirst = table.readout().wallet.chips;
    if (afterFirst >= start.minimum || afterFirst < dropped.minimum) {
      continue;
    }

    table.apply({ kind: 'nextHand' });
    if (table.readout().phase.kind !== 'bustOut') {
      continue;
    }
    const firstOffer = bustOut(JOURNEY_TABLE, JOURNEY_MARK, afterFirst).lowerTables;
    if (!firstOffer.includes(JOURNEY_DROP)) {
      continue;
    }

    table.apply({ kind: 'dropTable', table: JOURNEY_DROP });
    if (table.readout().phase.kind !== 'betting') {
      continue;
    }
    table.apply({ kind: 'tapChip', chip: JOURNEY_SECOND_WAGER });
    if (table.readout().wallet.wager !== JOURNEY_SECOND_WAGER) {
      continue;
    }
    table.apply({ kind: 'deal' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }

    // Hit until the hand is over 21. A hand that reached exactly 21 stands
    // automatically, per SPEC 4.5, and leaves the round for the dealer to
    // decide, so such a seed is skipped rather than played on.
    let hits = 0;
    let busted = false;
    for (let attempt = 0; attempt < HIT_LIMIT; attempt += 1) {
      table.apply({ kind: 'hit' });
      hits += 1;
      const kind = settle(table);
      if (table.readout().hands[0]?.state === 'bust') {
        busted = true;
        break;
      }
      if (kind !== 'playerTurn') {
        break;
      }
    }
    if (!busted || settle(table) !== 'roundResult') {
      continue;
    }
    const afterSecond = table.readout().wallet.chips;
    if (afterSecond >= dropped.minimum) {
      continue;
    }

    table.apply({ kind: 'nextHand' });
    if (table.readout().phase.kind !== 'bustOut') {
      continue;
    }
    const secondOffer = bustOut(JOURNEY_DROP, JOURNEY_MARK, afterSecond).lowerTables;
    if (secondOffer.length === 0 || secondOffer.length >= firstOffer.length) {
      continue;
    }
    if (secondOffer.includes(JOURNEY_DROP)) {
      continue;
    }
    if (!secondOffer.every((id) => firstOffer.includes(id))) {
      continue;
    }

    doubleBust = Object.freeze({
      seed,
      hits,
      firstOffer: Object.freeze([...firstOffer]),
      secondOffer: Object.freeze([...secondOffer]),
    });
    return doubleBust;
  }
  throw new Error('no seed inside the search limit busts out twice with differing offers');
}
