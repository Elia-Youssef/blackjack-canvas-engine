/**
 * Session seeds that walk SPEC 10's phases in the orders item `C1` and item
 * `C3` need, found rather than staged. `BJ-20`.
 *
 * `peek-seeds.ts` and `action-seeds.ts` are the pattern and the precedent:
 * `boot` takes a seed and never a scripted deck, so a spec that needs a
 * particular round has to find it. This module imports `core/` alone, drives
 * the real machine headlessly in Node, and reports the first seed on each of
 * three shapes:
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
 *
 * Nothing here reads a clock or a random source: the shoe is `BJ-3`'s seeded
 * stream, so the answers are stable across runs and across engines.
 */

import { handValue } from '../../../src/core/hand';
import { createTable, splitRefusal } from '../../../src/core/table';
import type { PhaseKind } from '../../../src/core/types';
import { canFund } from '../../../src/core/wallet';

/** How far each search looks before failing loudly rather than returning less. */
const SEED_LIMIT = 6000;

/** A step large enough to walk a deal quickly; QUALITY-BAR 7's clamp bounds it. */
const SEARCH_STEP = 0.25;

/** No round needs more frames than this to reach its next decision point. */
const SEARCH_FRAMES = 600;

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
