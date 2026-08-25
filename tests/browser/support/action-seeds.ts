/**
 * Session seeds that reach the two rounds item `D2` cannot otherwise drive.
 *
 * `tests/browser/support/peek-seeds.ts` is the pattern and the precedent, down
 * to the reasoning: `boot` takes a **seed** and never a scripted deck, so a spec
 * that needs a particular deal has to find it rather than stage it. This module
 * imports `core/` alone, drives the real machine headlessly in Node, and reports
 * the first seed that lands on each shape. The shoe is `BJ-3`'s seeded stream,
 * so the answers are stable across runs and across engines.
 *
 * Two shapes are needed, and each is one of SPEC 10's screens that a fresh
 * launch does not pass through:
 *
 *   - **a pair**, so `split` is a legal action rather than a greyed control. It
 *     is the one player action whose availability depends on the cards rather
 *     than on the house rules.
 *   - **a bust-out**, so SPEC 4.12's screen exists at all. It carries two
 *     intents, `dropTable` and `resetBankroll`, that appear nowhere else, and
 *     reaching it means a real balance played down below a real table minimum.
 */

import { splitRefusal, createTable, type Table } from '../../../src/core/table';
import type { PhaseKind } from '../../../src/core/types';
import { canFund, createWallet, tableLimits } from '../../../src/core/wallet';

/** How far each search looks before failing loudly rather than returning less. */
const SEED_LIMIT = 4000;

/** A step large enough to walk a deal quickly; QUALITY-BAR 7's clamp bounds it. */
const SEARCH_STEP = 0.25;

/** No opening deal needs more frames than this to reach a decision point. */
const SEARCH_FRAMES = 500;

/** The wager the split search bets, which Bronze takes and 1,000 chips funds. */
export const SPLIT_WAGER = 50;

/**
 * The wager the bust-out search bets at Gold.
 *
 * 950 of a 1,000 chip bankroll, on the 10 grid, above Gold's 100 minimum and
 * below its 2,000 maximum. A lost round leaves 50 chips: below Gold's minimum,
 * which is what SPEC 4.12 keys the bust-out to, and at or above both lower
 * tables' minimums, so the screen offers a drop as well as the free reset.
 */
export const BUST_OUT_WAGER = 950;

/**
 * Step the machine until it leaves SPEC 10's five timed phases.
 *
 * `insurance` is returned rather than answered, and that is deliberate: a search
 * that declined the offer for itself would hand back a seed whose round stops at
 * a screen the spec is not expecting, and the spec would wait for a player's
 * turn that has not been asked for yet. Both searches below therefore reject a
 * seed whose deal makes an offer, and `tests/browser/support/peek-seeds.ts` is
 * where a seed that makes one deliberately comes from.
 */
function settle(table: Table): PhaseKind {
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

let pair: number | null = null;

/**
 * Whether one seed carries the whole of item `D2`'s four-action round.
 *
 * **The search replays the route rather than describing it**, and it has to:
 * "a splittable pair" is not the condition, because a pair of tens split against
 * an Ace makes 21 on the first hand and SPEC 4.6 stands it without asking, which
 * is what seed 1 does. A seed qualifies only if each of the four presses the
 * spec makes is still legal when the spec makes it, so the search performs them
 * and reads the machine after each.
 *
 * The legality of the split itself is asked of `core/`, with the same two
 * functions `src/ui/components/actions.ts` greys the control with, rather than
 * being re-derived from the ranks. The rest is read off the phase: what the
 * route needs at each step is an active hand with a decision left on it.
 */
function carriesSplitRoute(seed: number): boolean {
  const table = createTable({ seed });
  table.apply({ kind: 'start' });
  table.apply({ kind: 'tapChip', chip: SPLIT_WAGER });
  table.apply({ kind: 'deal' });
  if (settle(table) !== 'playerTurn') {
    return false;
  }

  const dealt = table.readout();
  const hand = dealt.hands[0];
  if (hand === undefined) {
    return false;
  }
  if (splitRefusal(hand, { rules: dealt.rules, splits: dealt.splits }) !== null) {
    return false;
  }
  if (!canFund(hand.wager, dealt.wallet.chips)) {
    return false;
  }

  table.apply({ kind: 'split' });
  if (settle(table) !== 'playerTurn') {
    return false;
  }
  const split = table.readout();
  // Two hands, the first of them still asking for a decision. A first hand that
  // reached 21 on its second card has already stood, and the route's Double
  // would land on the second hand instead.
  if (split.hands.length !== 2 || split.phase.kind !== 'playerTurn') {
    return false;
  }
  if (split.phase.activeHand !== 0 || split.hands[0]?.cards.length !== 2) {
    return false;
  }

  table.apply({ kind: 'double' });
  if (settle(table) !== 'playerTurn') {
    return false;
  }
  const doubled = table.readout();
  if (doubled.phase.kind !== 'playerTurn' || doubled.phase.activeHand !== 1) {
    return false;
  }

  table.apply({ kind: 'hit' });
  if (settle(table) !== 'playerTurn') {
    // The hit busted the second hand, which ends the round and leaves the
    // route's Stand with nothing to stand on.
    return false;
  }
  table.apply({ kind: 'stand' });
  return settle(table) === 'roundResult';
}

/** A seed that carries the split, double, hit and stand round. Remembered. */
export function splitSeed(): number {
  if (pair !== null) {
    return pair;
  }
  for (let seed = 1; seed <= SEED_LIMIT; seed += 1) {
    if (carriesSplitRoute(seed)) {
      pair = seed;
      return seed;
    }
  }
  throw new Error('no seed inside the search limit carries the split route');
}

let bustOut: number | null = null;

/**
 * A seed that busts a Gold bankroll out in one round. Searched and remembered.
 *
 * The round is played the way the spec will play it: the whole wager, Stand, and
 * whatever the dealer does. A seed qualifies only when the balance afterwards is
 * below Gold's minimum, which is the condition SPEC 4.12 fires on, so a push or
 * a win is skipped rather than accommodated.
 */
export function bustOutSeed(): number {
  if (bustOut !== null) {
    return bustOut;
  }
  const gold = tableLimits('gold');
  for (let seed = 1; seed <= SEED_LIMIT; seed += 1) {
    const table = createTable({
      seed,
      table: 'gold',
      wallet: createWallet({ bestBalance: 10_000 }),
    });
    table.apply({ kind: 'start' });
    for (const chip of [500, 100, 100, 100, 100, 50] as const) {
      table.apply({ kind: 'tapChip', chip });
    }
    if (table.readout().wallet.wager !== BUST_OUT_WAGER) {
      throw new Error('the bust-out search could not build its wager');
    }
    table.apply({ kind: 'deal' });
    if (settle(table) === 'playerTurn') {
      table.apply({ kind: 'stand' });
    }
    if (settle(table) !== 'roundResult') {
      continue;
    }
    const { chips } = table.readout().wallet;
    if (chips < gold.minimum && chips >= tableLimits('silver').minimum) {
      bustOut = seed;
      return seed;
    }
  }
  throw new Error('no seed inside the search limit busts a Gold bankroll out in one round');
}
