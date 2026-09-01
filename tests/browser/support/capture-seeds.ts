/**
 * The two demonstration journeys nothing else in the suite drives. `BJ-23`.
 *
 * `peek-seeds.ts`, `action-seeds.ts` and `flow-seeds.ts` are the pattern and
 * the precedent: `boot` takes a seed and never a scripted deck, so a capture
 * that needs a particular round has to find it. This module imports `core/`
 * alone, drives the real machine headlessly in Node, and reports the first seed
 * on each of two shapes that `BlackJack/ACCEPTANCE.md` section 4 asks for and
 * no existing search produces:
 *
 *   - **item `E3`'s card spread**: one played hand carrying an Ace, a face card
 *     and a number card in every suit.
 *   - **item `G4`'s unaided session**: three rounds carrying an insurance
 *     decision, a split, a round result and a bust-out.
 *
 * Two consumers, which is why this is a support module rather than a search
 * inside one test file. `tests/unit/capture-seeds.test.ts` asserts the exact
 * figures the run sheets quote, so a stale sheet is a red unit run;
 * `tests/browser/capture-route.spec.ts` walks the `E3` journey on the real page
 * to prove the capture server's seeded route serves the hand the sheet names.
 *
 * Nothing here reads a clock or a random source: the shoe is `BJ-3`'s seeded
 * stream, so the answers are stable across runs and across engines.
 */

import { createTable, splitRefusal } from '../../../src/core/table';
import type { PhaseKind } from '../../../src/core/types';
import { bustOut, createWallet, tableLimits, type TableId } from '../../../src/core/wallet';

/**
 * How far the searches look before failing loudly rather than returning less.
 *
 * Larger than the other seed modules' limits, and the reason is item `E3`'s
 * shape rather than a lack of confidence: a number card in **each** of four
 * suits needs at least six cards on one hand that still stands, and the first
 * seed that carries it is 11,199. The bound is a guard against an infinite
 * search, not a claim about where the answer is.
 */
const SEED_LIMIT = 30_000;

/** A step large enough to walk a deal quickly; QUALITY-BAR 7's clamp bounds it. */
const SEARCH_STEP = 0.25;

/** No round needs more frames than this to reach its next decision point. */
const SEARCH_FRAMES = 600;

/** Beyond any reachable hand: the four lowest ranks are Aces and twos. */
const HIT_LIMIT = 10;

/** The mark every seated-at-Gold sheet boots with. SPEC 6 keys unlocks to it. */
export const CAPTURE_MARK = 10_000;

/** What the third round leaves at its table, so a drop is offered as well as the reset. */
const BUST_OUT_REMAINDER = 50;

/** SPEC 4.2's face cards, which the `E3` spread needs one of. */
const FACE_RANKS = ['J', 'Q', 'K'];

/** SPEC 4.1's four suits, which the `E3` spread needs a number card in each of. */
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];

/** The smallest legal wager, which the `E3` search bets because it settles nothing. */
export const SPREAD_WAGER = 10;

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

/** Build a wager out of SPEC 4.11's four denominations, largest first. */
function tapTo(table: ReturnType<typeof createTable>, wager: number): void {
  let left = wager;
  for (const denomination of [500, 100, 50, 10] as const) {
    while (left >= denomination) {
      table.apply({ kind: 'tapChip', chip: denomination });
      left -= denomination;
    }
  }
}

/** What item `E3`'s first leg needs: one played hand carrying the whole spread. */
export interface CardSpread {
  readonly seed: number;
  readonly hits: number;
  readonly ranks: readonly string[];
  readonly cards: readonly string[];
}

let spread: CardSpread | null = null;

/**
 * A hand that carries the script's card spread on the real felt.
 *
 * **The parse, adopted at `BJ-23` after the review and ruled by the sheet's
 * owner.** Item `E3`'s capture asks for "an Ace, a face card and a number card
 * of each suit". The strict distributive reading is twelve cards and is
 * unreachable, since no hand in this game holds twelve. The natural parse is
 * "a number card **of each suit**": at least one number card in each of the
 * four suits, plus an Ace and a face card. The criterion's words are kept
 * unchanged and no sheet or CSV was edited.
 *
 * The parse is not pedantry, and the reason is the criterion's very next
 * clause: "number cards use a correct centre pip layout". A hand whose only
 * number cards are spades shows three suit glyphs on cards that have no pip
 * layout to judge, so the capture would exercise one quarter of what the item
 * is for. Under the per-suit parse every suit's pip layout is on camera.
 *
 * The hand must end **stood** rather than busted. Both are capturable, since
 * SPEC 12 leaves the cards on the felt until Next Hand, but a made hand is what
 * a reader should be looking at while judging a corner index, and a busted one
 * invites the wrong question.
 */
export function cardSpreadRound(): CardSpread {
  if (spread !== null) {
    return spread;
  }
  for (let seed = 1; seed <= SEED_LIMIT; seed += 1) {
    const table = createTable({ seed });
    table.apply({ kind: 'start' });
    table.apply({ kind: 'tapChip', chip: SPREAD_WAGER });
    table.apply({ kind: 'deal' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }
    let hits = 0;
    for (let attempt = 0; attempt < HIT_LIMIT; attempt += 1) {
      table.apply({ kind: 'hit' });
      hits += 1;
      if (settle(table) !== 'playerTurn') {
        break;
      }
    }
    const hand = table.readout().hands[0];
    if (hand === undefined || hand.state !== 'stood') {
      continue;
    }
    const ranks = hand.cards.map((card) => card.rank);
    if (!ranks.includes('A')) {
      continue;
    }
    if (!ranks.some((rank) => FACE_RANKS.includes(rank))) {
      continue;
    }
    const numbered = new Set(
      hand.cards
        .filter((card) => card.rank !== 'A' && !FACE_RANKS.includes(card.rank))
        .map((card) => String(card.suit)),
    );
    if (SUITS.some((suit) => !numbered.has(suit))) {
      continue;
    }
    spread = Object.freeze({
      seed,
      hits,
      ranks: Object.freeze([...ranks]),
      cards: Object.freeze(hand.cards.map((card) => `${card.rank}-${String(card.suit)}`)),
    });
    return spread;
  }
  throw new Error('no seed inside the search limit deals a number card in every suit');
}

/** What item `G4`'s sheet needs a session to contain, in one seed. */
export interface ScreenReaderSession {
  readonly seed: number;
  readonly wagers: readonly number[];
  readonly hits: number;
  readonly offer: readonly TableId[];
}

let session: ScreenReaderSession | null = null;

/**
 * A session carrying every screen item `G4`'s script names, in three rounds.
 *
 * The script is "place a wager, take an insurance decision, split a pair, play
 * both hands, reach a round result, and bust out", unaided and in one sitting,
 * so the three rounds have to be one session on one seed rather than three
 * separately staged deals. The round shapes are searched in the order the
 * operator will meet them:
 *
 *   1. the up card is an Ace, so SPEC 4.7's offer is made and the decision is
 *      the operator's;
 *   2. the deal is a fundable pair, so Split is available and both hands play;
 *   3. the wager is everything above a remainder, and the hand is hit past 21,
 *      so the loss is the operator's own action rather than the dealer's luck
 *      and the balance lands below Gold's minimum with the lower tables still
 *      affordable. A bust-out whose offer is empty would leave the free reset
 *      as the only control on the screen, and the mirror has less to say.
 *
 * Rounds two and three are required to go straight to a player's turn, so the
 * session contains exactly one insurance decision and the sheet can name the
 * presses exactly.
 */
export function screenReaderSession(): ScreenReaderSession {
  if (session !== null) {
    return session;
  }
  const gold = tableLimits('gold');
  for (let seed = 1; seed <= SEED_LIMIT; seed += 1) {
    const table = createTable({
      seed,
      table: 'gold',
      wallet: createWallet({ bestBalance: CAPTURE_MARK }),
    });
    table.apply({ kind: 'start' });

    tapTo(table, gold.minimum);
    if (table.readout().wallet.wager !== gold.minimum) {
      continue;
    }
    table.apply({ kind: 'deal' });
    if (settle(table) !== 'insurance') {
      continue;
    }
    table.apply({ kind: 'declineInsurance' });
    const afterOffer = settle(table);
    if (afterOffer === 'playerTurn') {
      table.apply({ kind: 'stand' });
    } else if (afterOffer !== 'roundResult') {
      continue;
    }
    if (settle(table) !== 'roundResult') {
      continue;
    }
    table.apply({ kind: 'nextHand' });
    if (table.readout().phase.kind !== 'betting') {
      continue;
    }

    tapTo(table, gold.minimum);
    if (table.readout().wallet.wager !== gold.minimum) {
      continue;
    }
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
    if (dealt.wallet.chips < hand.wager) {
      continue;
    }
    table.apply({ kind: 'split' });
    let stands = 0;
    while (settle(table) === 'playerTurn' && stands < HIT_LIMIT) {
      table.apply({ kind: 'stand' });
      stands += 1;
    }
    const split = table.readout();
    if (split.phase.kind !== 'roundResult' || split.phase.result.hands.length !== 2) {
      continue;
    }
    table.apply({ kind: 'nextHand' });
    if (table.readout().phase.kind !== 'betting') {
      continue;
    }

    const wager = table.readout().wallet.chips - BUST_OUT_REMAINDER;
    if (wager < gold.minimum || wager > gold.maximum) {
      continue;
    }
    tapTo(table, wager);
    if (table.readout().wallet.wager !== wager) {
      continue;
    }
    table.apply({ kind: 'deal' });
    if (settle(table) !== 'playerTurn') {
      continue;
    }
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
    const left = table.readout().wallet.chips;
    if (left !== BUST_OUT_REMAINDER) {
      continue;
    }
    table.apply({ kind: 'nextHand' });
    if (table.readout().phase.kind !== 'bustOut') {
      continue;
    }
    const offer = bustOut('gold', CAPTURE_MARK, left).lowerTables;
    if (offer.length === 0) {
      continue;
    }
    session = Object.freeze({
      seed,
      wagers: Object.freeze([gold.minimum, gold.minimum, wager]),
      hits,
      offer: Object.freeze([...offer]),
    });
    return session;
  }
  throw new Error('no seed inside the search limit carries the screen-reader session');
}
