/**
 * Item `B10`, Critical, 17 points: "Split is correct in full: equal-value
 * gating, maximum three splits into four hands, one card dealt to each, split
 * Aces receiving exactly one card and standing, a two-card 21 on a split hand
 * paying 1:1 rather than 3:2, and Double after split honouring its toggle."
 * Built at `BJ-8`, SPEC 4.6.
 *
 * **The criterion is the assertion, and SPEC 4.6 has ten sentences.** Equal
 * value with equal rank configurable; chips available, with the reason surfaced
 * on the second and third split as well as the first; a split hand may itself
 * be split; at most 3 splits into 4 hands counted across the round; each
 * resulting hand immediately receives one card; split Aces get exactly one card
 * each and stand, and are never resplit; a two-card 21 on a split hand is 21
 * and pays 1:1; Double after split honours its toggle; hands play left to
 * right; each settles independently. Every one of them is driven below.
 *
 * **The index hazard `BJ-7` wrote down is what the settlement tests are
 * about.** `wallet.ts` **appends** a split hand, while SPEC 4.6 plays hands
 * left to right, so the table **inserts** one beside its parent. The two orders
 * come apart at the second split: a resplit of the leftmost of three leaves the
 * table holding the wallet's hands in the order 0, 2, 1. `B10` decided to carry
 * the wallet's index on the hand rather than force one order to be the other,
 * and the four-hand round below is built so that a settlement keyed on the
 * position pays a different set of credits: the misalignment is asserted
 * directly, and the credits it would have produced are written out and required
 * to differ from the ones it did. Settling the wrong hand is a wrong payout.
 *
 * **Three negative controls, each on a set derived from SPEC 4.6.** The same
 * two cards, an Ace and a ten, pay 3:2 unsplit and 1:1 on a split hand, which
 * is the one clause the split flag exists for. A split comparison read as equal
 * rank has to disagree with equal value on exactly the mixed ten-value pairs. A
 * settlement keyed on the table's position rather than the wallet's index has
 * to produce a different credit on the hands the resplit moved.
 *
 * **What this file does not claim.** `B9` grades Double, `B13` the ladder,
 * `B15` the betting arithmetic and `C2` the phase gate. `hand.ts`'s `canSplit`
 * is the pair test alone and its own header says so; what is here is the rest
 * of SPEC 4.6's sentence.
 */

import { describe, expect, it } from 'vitest';

import type { Rank } from '../../src/core/cards';
import { RANKS, card } from '../../src/core/cards';
import { canSplit } from '../../src/core/hand';
import type { ActionContext, Table, TableOptions } from '../../src/core/table';
import { createTable, hitRefusal, splitRefusal } from '../../src/core/table';
import type { HandInPlay, SettledHand } from '../../src/core/types';
import type { TableLimits, Wallet } from '../../src/core/wallet';
import { createWallet, tableLimits } from '../../src/core/wallet';

import { acceptResult as accept, bounded } from './support/drive';
import { scriptedShoe } from './support/stacked-shoe';

// ---------------------------------------------------------------------------
// SPEC 4.6, transcribed
// ---------------------------------------------------------------------------

/**
 * SPEC 4.6: "At most 3 splits per round, producing at most 4 hands, counted
 * across the whole round, not per hand."
 *
 * The four hands are derived from the three splits and the one hand the round
 * was dealt, rather than written down twice, because the two numbers cannot
 * move independently.
 */
const MAX_SPLITS = 3;
const MAX_HANDS = MAX_SPLITS + 1;

/** SPEC 4.6: "Each resulting hand immediately receives one card." */
const CARDS_PER_SPLIT = 2;

/** A hand's initial two cards, which is what SPEC 4.6 compares. */
const INITIAL_CARDS = 2;

/** SPEC 4.11: the starting bankroll and the wager these rounds carry. */
const SPEC_STARTING_CHIPS = 1000;
const ROUND_WAGER = 50;

/** SPEC 4.11: a natural pays 3:2 and every other win pays 1:1. */
const NATURAL_NUMERATOR = 3;
const NATURAL_DENOMINATOR = 2;

/** SPEC 5: a frame long enough to pay for any one timed step below. */
const TICK = 0.25;

/** Bounded, for the reason `wallet.test.ts` gives: a stall must fail loudly. */
const LOOP_LIMIT = 500;

// ---------------------------------------------------------------------------
// Driving the machine
// ---------------------------------------------------------------------------

function toPlayerTurn(table: Table): Table {
  const turn = bounded('driving the machine to the player turn', LOOP_LIMIT);
  while (!['playerTurn', 'roundResult'].includes(table.readout().phase.kind)) {
    turn();
    const state = table.readout();
    switch (state.phase.kind) {
      case 'start':
        accept(table.apply({ kind: 'start' }));
        break;
      case 'betting':
        accept(
          state.wallet.wager === 0
            ? table.apply({ kind: 'tapChip', chip: ROUND_WAGER })
            : table.apply({ kind: 'deal' }),
        );
        break;
      case 'insurance':
        accept(table.apply({ kind: 'declineInsurance' }));
        break;
      default:
        table.update(TICK);
    }
  }
  return table;
}

/** Run out to SPEC 12's result, standing on every hand still live. */
function toRoundResult(table: Table): Table {
  const turn = bounded('driving the machine to the round result', LOOP_LIMIT);
  while (table.readout().phase.kind !== 'roundResult') {
    turn();
    if (table.readout().phase.kind === 'playerTurn') {
      accept(table.apply({ kind: 'stand' }));
      continue;
    }
    table.update(TICK);
  }
  return table;
}

/** SPEC 12's round result, or a loud failure. */
function resultOf(table: Table): readonly SettledHand[] {
  const { phase } = table.readout();
  if (phase.kind !== 'roundResult') {
    throw new Error(`the round has not finished; the phase is ${phase.kind}`);
  }
  return phase.result.hands;
}

/** Which hand SPEC 4.6 is playing, or `-1` when the turn is over. */
function activeHand(table: Table): number {
  const { phase } = table.readout();
  return phase.kind === 'playerTurn' ? phase.activeHand : -1;
}

/** A wallet drained to a chosen balance through SPEC 4.11's own controls. */
function walletAt(target: number): Wallet {
  const wallet = createWallet();
  const bronze: TableLimits = tableLimits('bronze');
  const turn = bounded(`draining a wallet to ${String(target)}`, LOOP_LIMIT);
  while (wallet.readout().chips > target) {
    turn();
    const wager = Math.min(bronze.maximum, wallet.readout().chips - target);
    for (const chip of [500, 100, 50, 10] as const) {
      while (wallet.readout().wager + chip <= wager) {
        turn();
        // A refused tap is a loud failure rather than another turn of this
        // loop, which is what `phase-legality.test.ts`'s own chip builder
        // does. Without it a tap that started refusing would leave this
        // spinning forever, and no per-test timeout can interrupt a
        // synchronous loop.
        if (!wallet.tap(chip, bronze).ok) {
          throw new Error(`a ${String(chip)} chip was refused while building ${String(wager)}`);
        }
      }
    }
    if (!wallet.commitInitial(bronze).ok) {
      throw new Error(`the wallet refused a ${String(wager)} commit while draining`);
    }
    wallet.settleHand(0, -wager);
    wallet.endRound();
  }
  if (wallet.readout().chips !== target) {
    throw new Error(`expected ${String(target)} chips, found ${String(wallet.readout().chips)}`);
  }
  return wallet;
}

/** A table dealing a written-down script, at SPEC 4.6's default rules. */
function dealing(script: readonly Rank[], options: TableOptions = {}): Table {
  return toPlayerTurn(createTable({ shoe: scriptedShoe(script), ...options }));
}

/** One hand for the availability predicate, built rather than dealt. */
function handOf(overrides: Partial<HandInPlay> & { readonly cards: HandInPlay['cards'] }): HandInPlay {
  return Object.freeze({
    wager: ROUND_WAGER,
    state: 'live' as const,
    fromSplit: false,
    fromSplitAces: false,
    walletHand: 0,
    ...overrides,
  });
}

/** SPEC 14's house rules, as the availability rules are asked against them. */
function context(splits = 0, splitRule: 'equalValue' | 'equalRank' = 'equalValue'): ActionContext {
  return Object.freeze({
    rules: Object.freeze({
      decks: 6,
      doubleAfterSplit: true,
      surrender: true,
      evenMoney: true,
      splitRule,
    }),
    splits,
  });
}

/**
 * The four-hand round the settlement tests turn on.
 *
 * Read in SPEC 4.3's deal order and then in the order the round asks for them:
 * a pair of eights against a dealer 7 with a 7 behind it, then two eights so
 * the first split leaves two more pairs, then an eight and a three, then an
 * eight and a two, then a nine for a double, then a four to carry the dealer to
 * 18. Every split is of the **leftmost** hand, which is the shape that pulls
 * the wallet's commit order and SPEC 4.6's play order apart.
 */
const FOUR_HANDS: readonly Rank[] = [
  '8', '7', '8', '7', // the deal: player 8 8, dealer 7 up and 7 down
  '8', '8', //           first split: both halves become a pair again
  '8', '3', //           second split, of the leftmost: a pair and an 11
  '8', '2', //           third split, of the leftmost: a pair and a 10
  '9', //                the double, on the hand holding 10
  '4', //                the dealer's one draw, from 14 to 18
];

// ---------------------------------------------------------------------------
// SPEC 4.6: the pair test, and the house comparison it uses
// ---------------------------------------------------------------------------

describe('B10: Split is offered on an equal-value pair, and equal rank is a toggle', () => {
  it('splits any two ten-value cards under the default comparison', () => {
    // SPEC 4.6: "equal value, so any two ten-value cards may be split", and
    // SPEC 14 makes equal value the default rather than something chosen here.
    const table = dealing(['K', '7', '10', '7', '9', '9', '4']);
    expect(table.readout().rules.splitRule).toBe('equalValue');
    expect(table.readout().hands[0]?.cards.map((held) => held.rank)).toEqual(['K', '10']);
    accept(table.apply({ kind: 'split' }));
    expect(table.readout().hands.length).toBe(2);
  });

  it('refuses the same two cards when the house compares by rank', () => {
    const table = dealing(['K', '7', '10', '7', '9', '9', '4'], {
      rules: { splitRule: 'equalRank' },
    });
    expect(table.readout().rules.splitRule).toBe('equalRank');
    const before = table.readout();
    const result = table.apply({ kind: 'split' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.layer).toBe('availability');
      expect(result.reason).toBe('not-a-pair');
    }
    expect(table.readout()).toEqual(before);

    // The toggle narrows the comparison and does not switch it off: two kings
    // are a pair under either reading.
    const kings = dealing(['K', '7', 'K', '7', '9', '9', '4'], {
      rules: { splitRule: 'equalRank' },
    });
    accept(kings.apply({ kind: 'split' }));
    expect(kings.readout().hands.length).toBe(2);
  });

  it('refuses a hand that is not a pair at all, and changes nothing', () => {
    const table = dealing(['9', '7', '7', '7', '10', '10']);
    const before = table.readout();
    const result = table.apply({ kind: 'split' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.layer).toBe('availability');
      expect(result.reason).toBe('not-a-pair');
    }
    expect(table.readout()).toEqual(before);
  });

  /**
   * The control for the comparison, on a set derived from SPEC 4.2's value
   * table rather than counted off a run.
   *
   * The two readings differ on exactly the ordered pairs of distinct ten-value
   * ranks: four such ranks give 4 x 4 = 16 ordered pairs, of which the 4 with
   * matching ranks agree, so 12 disagree. No other rank shares its value with
   * another, so 13 x 13 = 169 ordered pairs produce exactly those 12.
   */
  it('disagrees with an equal-rank reading on exactly the 12 mixed ten-value pairs', () => {
    const differ: string[] = [];
    let compared = 0;
    for (const first of RANKS) {
      for (const second of RANKS) {
        compared += 1;
        const cards = [card(first, 'spades'), card(second, 'hearts')];
        if (canSplit(cards, 'equalValue') !== canSplit(cards, 'equalRank')) {
          differ.push(`${first}${second}`);
        }
      }
    }
    expect(compared).toBe(RANKS.length * RANKS.length);
    expect(compared).toBe(169);
    const tenValue = ['10', 'J', 'Q', 'K'];
    expect(differ.length).toBe(tenValue.length * tenValue.length - tenValue.length);
    expect(differ.length).toBe(12);
    for (const pair of differ) {
      const [a, b] = [pair.slice(0, pair.length - 1), pair.slice(pair.length - 1)];
      // Every disagreement is a mixed ten-value pair, and nothing else is.
      expect(tenValue.some((rank) => pair.startsWith(rank))).toBe(true);
      expect(a === b).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.6: three splits, four hands, counted across the round
// ---------------------------------------------------------------------------

describe('B10: at most three splits into four hands, counted across the round', () => {
  it('splits three times, inserts each hand beside its parent and then refuses', () => {
    const table = dealing(FOUR_HANDS);
    expect(table.readout().splits).toBe(0);

    for (let split = 1; split <= MAX_SPLITS; split += 1) {
      accept(table.apply({ kind: 'split' }));
      const state = table.readout();
      expect(state.splits, `after split ${String(split)}`).toBe(split);
      expect(state.hands.length).toBe(split + 1);
      // SPEC 4.6 plays hands left to right, so the split of the leftmost hand
      // leaves the leftmost hand active.
      expect(activeHand(table)).toBe(0);
    }

    const before = table.readout();
    expect(before.hands.length).toBe(MAX_HANDS);
    expect(before.hands.length).toBe(4);
    // The cap and not the pair: the hand in front of it really is splittable.
    expect(canSplit(before.hands[0]?.cards ?? [], 'equalValue')).toBe(true);

    const fourth = table.apply({ kind: 'split' });
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.layer).toBe('availability');
      expect(fourth.reason).toBe('split-limit');
    }
    expect(table.readout()).toEqual(before);
  });

  /**
   * "Counted across the whole round, not per hand", which is the clause a cap
   * kept per hand would pass on every round with one split in it.
   *
   * After three splits every one of the four hands is refused, including the
   * three that have been split no times at all.
   */
  it('caps the round and not the hand, so every hand is refused once three are taken', () => {
    const table = dealing(FOUR_HANDS);
    for (let split = 0; split < MAX_SPLITS; split += 1) {
      accept(table.apply({ kind: 'split' }));
    }
    const where = Object.freeze({ rules: table.readout().rules, splits: table.readout().splits });
    let refused = 0;
    let capped = 0;
    for (const hand of table.readout().hands) {
      // Every one of the four is refused. Two of them still hold a pair and
      // are refused by the cap; the other two never were pairs and are refused
      // by SPEC 4.6's comparison, which is the more specific sentence and is
      // asked first. Both counts are derived from the round's own cards.
      expect(splitRefusal(hand, where)).not.toBe(null);
      if (canSplit(hand.cards, 'equalValue')) {
        expect(splitRefusal(hand, where)).toBe('split-limit');
        capped += 1;
      } else {
        expect(splitRefusal(hand, where)).toBe('not-a-pair');
      }
      refused += 1;
    }
    expect(refused).toBe(MAX_HANDS);
    expect(refused).toBe(4);
    expect(capped).toBe(2);
    // And the count really is the round's: one fewer split and the same hands
    // are available again.
    for (const hand of table.readout().hands.filter((held) => canSplit(held.cards, 'equalValue'))) {
      expect(splitRefusal(hand, Object.freeze({ rules: where.rules, splits: MAX_SPLITS - 1 }))).toBe(
        null,
      );
    }
  });

  it('resets the count at the round boundary, so the next round may split again', () => {
    const table = dealing(['8', '7', '8', '7', '9', '9', '4', ...FOUR_HANDS]);
    accept(table.apply({ kind: 'split' }));
    expect(table.readout().splits).toBe(1);
    toRoundResult(table);
    // SPEC 12's round result still shows the round that was played.
    expect(table.readout().splits).toBe(1);
    accept(table.apply({ kind: 'nextHand' }));
    expect(table.readout().splits).toBe(0);
    expect(table.readout().hands).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.6: one card to each resulting hand, and the flags set once
// ---------------------------------------------------------------------------

describe('B10: each resulting hand immediately receives one card', () => {
  it('separates the pair, deals one card to each and takes two from the shoe', () => {
    const table = dealing(['8', '7', '8', '7', '3', '4', '10']);
    const before = table.readout();
    expect(before.hands.length).toBe(1);
    expect(before.hands[0]?.cards.map((held) => held.rank)).toEqual(['8', '8']);

    accept(table.apply({ kind: 'split' }));
    const after = table.readout();
    expect(after.hands.length).toBe(2);
    // One card of the pair each, plus one dealt card each.
    expect(after.hands[0]?.cards.map((held) => held.rank)).toEqual(['8', '3']);
    expect(after.hands[1]?.cards.map((held) => held.rank)).toEqual(['8', '4']);
    for (const hand of after.hands) {
      expect(hand.cards.length).toBe(CARDS_PER_SPLIT);
    }
    // Exactly two cards left the shoe, so neither hand was dealt twice.
    expect(after.shoe.inPlay).toBe(before.shoe.inPlay + 2);
    expect(after.shoe.remaining).toBe(before.shoe.remaining - 2);
  });

  it('carries an equal wager on the new hand and takes it out of the balance', () => {
    const table = dealing(['8', '7', '8', '7', '3', '4', '10']);
    const before = table.readout();
    accept(table.apply({ kind: 'split' }));
    const after = table.readout();

    expect(after.hands[0]?.wager).toBe(ROUND_WAGER);
    expect(after.hands[1]?.wager).toBe(ROUND_WAGER);
    expect(after.wallet.chips).toBe(before.wallet.chips - ROUND_WAGER);
    expect(after.wallet.committed).toBe(ROUND_WAGER * 2);
    // SPEC 4.11's identity does not move: the chips became committed.
    expect(after.wallet.conserved).toBe(before.wallet.conserved);
  });

  it('sets fromSplit on both halves, once, and never recomputes it', () => {
    const table = dealing(['8', '7', '8', '7', '3', '4', '2', '10']);
    accept(table.apply({ kind: 'split' }));
    for (const hand of table.readout().hands) {
      // The parent as well as the child: SPEC 4.6's "a two-card 21 on a split
      // hand is 21, not a natural" is about both of them.
      expect(hand.fromSplit).toBe(true);
      expect(hand.fromSplitAces).toBe(false);
    }
    // And it survives a card arriving on the hand afterwards.
    accept(table.apply({ kind: 'hit' }));
    expect(table.readout().hands[0]?.cards.length).toBe(3);
    expect(table.readout().hands[0]?.fromSplit).toBe(true);
  });

  it('plays the hands left to right, advancing the active hand each time', () => {
    const table = dealing(FOUR_HANDS);
    for (let split = 0; split < MAX_SPLITS; split += 1) {
      accept(table.apply({ kind: 'split' }));
    }
    const seen: number[] = [];
    const turn = bounded('standing on four hands left to right', LOOP_LIMIT);
    while (table.readout().phase.kind === 'playerTurn') {
      turn();
      seen.push(activeHand(table));
      accept(table.apply({ kind: 'stand' }));
    }
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(seen.length).toBe(MAX_HANDS);
    // SPEC 4.9: the turn ends when no hand is live, and the reveal follows.
    expect(table.readout().phase.kind).toBe('reveal');
    for (const hand of table.readout().hands) {
      expect(hand.state).toBe('stood');
    }
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.6: "Requires chips available >= that hand's wager"
// ---------------------------------------------------------------------------

describe('B10: the balance gates the split, on the second and third as well', () => {
  it('refuses the second split with the reason surfaced, and changes nothing', () => {
    // 140 chips: 50 leaves at the deal, 50 at the first split, and 40 is left
    // against the 50 the second would need.
    const table = dealing(['8', '7', '8', '7', '8', '8', '10', '10'], {
      wallet: walletAt(140),
    });
    accept(table.apply({ kind: 'split' }));
    const before = table.readout();
    expect(before.wallet.chips).toBe(40);
    expect(before.hands.length).toBe(2);
    // The pair and the cap are both fine, so the balance is the only bar.
    expect(canSplit(before.hands[0]?.cards ?? [], 'equalValue')).toBe(true);
    expect(before.splits).toBeLessThan(MAX_SPLITS);

    const second = table.apply({ kind: 'split' });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      // The wallet, not the availability layer: `wallet.ts` already decides
      // whether a wager can be funded, and a second reading would drift.
      expect(second.layer).toBe('wallet');
      expect(second.reason).toBe('insufficient-chips');
    }
    expect(table.readout()).toEqual(before);
  });

  it('refuses the third split the same way, which is what "including" means', () => {
    // 190 chips: 50 at the deal and 50 at each of two splits leaves 40.
    const table = dealing(['8', '7', '8', '7', '8', '8', '8', '8', '10', '10'], {
      wallet: walletAt(190),
    });
    accept(table.apply({ kind: 'split' }));
    accept(table.apply({ kind: 'split' }));
    const before = table.readout();
    expect(before.wallet.chips).toBe(40);
    expect(before.splits).toBe(2);
    expect(before.hands.length).toBe(3);

    const third = table.apply({ kind: 'split' });
    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.layer).toBe('wallet');
      expect(third.reason).toBe('insufficient-chips');
    }
    expect(table.readout()).toEqual(before);
  });

  it('permits a balance exactly equal to the wager, which is what >= means', () => {
    // 100 chips: 50 at the deal leaves exactly the 50 the split needs.
    const table = dealing(['8', '7', '8', '7', '3', '4', '10'], { wallet: walletAt(100) });
    expect(table.readout().wallet.chips).toBe(ROUND_WAGER);
    accept(table.apply({ kind: 'split' }));
    expect(table.readout().wallet.chips).toBe(0);
    expect(table.readout().hands.length).toBe(2);
    expect(table.readout().wallet.conserved).toBe(ROUND_WAGER * 2);
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.6: split Aces get one card each, stand, and are never resplit
// ---------------------------------------------------------------------------

describe('B10: split Aces receive exactly one card each and stand automatically', () => {
  it('ends the player turn the moment the Aces are split', () => {
    const table = dealing(['A', '7', 'A', '7', '10', '9', '4']);
    accept(table.apply({ kind: 'split' }));
    const after = table.readout();

    expect(after.hands.length).toBe(2);
    for (const hand of after.hands) {
      expect(hand.fromSplit).toBe(true);
      expect(hand.fromSplitAces).toBe(true);
      // "exactly one card each": the Ace it kept, plus one.
      expect(hand.cards.length).toBe(CARDS_PER_SPLIT);
      expect(hand.cards[0]?.rank).toBe('A');
      // "and stand automatically"
      expect(hand.state).toBe('stood');
    }
    expect(after.phase.kind).toBe('reveal');

    // No hit, no double, no resplit: SPEC 10 gives all three to `playerTurn`
    // and the turn is over, so the phase refuses each before any rule is asked.
    for (const kind of ['hit', 'double', 'split'] as const) {
      const result = table.apply({ kind });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.layer).toBe('phase');
        expect(result.reason).toBe('wrong-phase');
      }
    }
  });

  it('stands a split Ace hand that drew another Ace, rather than offering a resplit', () => {
    // A pair of Aces on a split Ace hand is the case the auto-stand and the
    // no-resplit rule both cover, and a soft 12 is a hand a player would
    // certainly hit if the rule were not there.
    const table = dealing(['A', '7', 'A', '7', 'A', '9', '4']);
    accept(table.apply({ kind: 'split' }));
    const hands = table.readout().hands;
    expect(hands[0]?.cards.map((held) => held.rank)).toEqual(['A', 'A']);
    expect(hands[0]?.state).toBe('stood');
    expect(canSplit(hands[0]?.cards ?? [], 'equalValue')).toBe(true);
    expect(table.readout().phase.kind).toBe('reveal');
  });

  /**
   * The rule itself, asked of a hand play cannot build.
   *
   * SPEC 4.6 stands a split Ace hand the moment its one card lands, so a live
   * one is unreachable and the phase gate is what turns Split down. A rule
   * enforced only by another rule's side effect is one edit away from being
   * enforced nowhere, so the predicate is asked directly. That is
   * `settlement.ts`'s rung 1 precedent: a total function has to be right about
   * inputs a round never assembles.
   */
  it('refuses the rule on a live split Ace pair, which play never assembles', () => {
    const splitAces = handOf({
      cards: [card('A', 'spades'), card('A', 'hearts')],
      fromSplit: true,
      fromSplitAces: true,
    });
    expect(canSplit(splitAces.cards, 'equalValue')).toBe(true);
    expect(splitRefusal(splitAces, context())).toBe('split-aces');
    // The clause outranks every other, so a split Ace hand is refused for being
    // one whether or not the cap has been reached and whatever else is true.
    expect(splitRefusal(splitAces, context(MAX_SPLITS))).toBe('split-aces');
    expect(splitRefusal({ ...splitAces, state: 'stood' }, context())).toBe('split-aces');
  });

  it('ends a round begun by splitting Aces with exactly two hands', () => {
    const table = dealing(['A', '7', 'A', '7', '10', '9', '4']);
    accept(table.apply({ kind: 'split' }));
    toRoundResult(table);
    expect(table.readout().hands.length).toBe(2);
    expect(resultOf(table).length).toBe(2);
    expect(table.readout().splits).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.6: "A two-card 21 on a split hand is 21, not a natural. Pays 1:1."
// ---------------------------------------------------------------------------

describe('B10: a two-card 21 on a split hand pays 1:1 and not 3:2', () => {
  it('settles an Ace and a ten on a split hand at rung 7, for the wager', () => {
    // Split Aces, the first drawing a ten. Twenty-one in two cards, on a hand
    // created by a split. The dealer finishes on 18, so the hand wins.
    const table = dealing(['A', '7', 'A', '7', '10', '9', '4']);
    accept(table.apply({ kind: 'split' }));
    toRoundResult(table);
    const hands = table.readout().hands;
    expect(hands[0]?.cards.map((held) => held.rank)).toEqual(['A', '10']);
    expect(hands[0]?.fromSplit).toBe(true);
    // Not `blackjack`: SPEC 4.2's natural excludes a hand created by a split.
    expect(hands[0]?.state).toBe('stood');

    const settled = resultOf(table)[0];
    expect(settled?.outcome).toBe('PLAYER_WIN');
    expect(settled?.rung).toBe(7);
    // 1:1, so `wager + wager`, and not `wager + wager x 3 / 2`.
    expect(settled?.credit).toBe(ROUND_WAGER * 2);
    expect(settled?.credit).not.toBe(
      ROUND_WAGER + (ROUND_WAGER * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR,
    );
  });

  /**
   * The same clause reached through SPEC 4.5's auto-stand rather than through
   * SPEC 4.6's Ace rule, which is the general path.
   *
   * A pair of tens split, the first drawing an Ace: twenty-one in two cards on
   * a hand created by a split, and nothing about Aces forced it to stop. It has
   * to stand rather than stay live, it has to be 21 rather than a natural, and
   * it has to pay 1:1. Its sibling is 19 and is still live, so the turn moves
   * to it, which is what makes the auto-stand visible at all.
   */
  it('stands a split hand that reached 21, without calling it a natural', () => {
    const table = dealing(['10', '7', '10', '7', 'A', '9', '4']);
    accept(table.apply({ kind: 'split' }));
    const hands = table.readout().hands;

    expect(hands[0]?.cards.map((held) => held.rank)).toEqual(['10', 'A']);
    expect(hands[0]?.state).toBe('stood');
    expect(hands[0]?.fromSplitAces).toBe(false);
    expect(hands[1]?.cards.map((held) => held.rank)).toEqual(['10', '9']);
    expect(hands[1]?.state).toBe('live');
    // SPEC 4.6 plays left to right, and the first hand is already finished.
    expect(activeHand(table)).toBe(1);

    toRoundResult(table);
    const settled = resultOf(table)[0];
    expect(settled?.rung).toBe(7);
    expect(settled?.outcome).toBe('PLAYER_WIN');
    expect(settled?.credit).toBe(ROUND_WAGER * 2);
  });

  /**
   * The control, and it is the same two cards.
   *
   * An Ace and a ten dealt to an unsplit hand is SPEC 4.2's natural and pays
   * 3:2 at rung 3. The only difference between the two rounds is where the hand
   * came from, which is exactly what the split flag records, so the pair of
   * assertions is the clause rather than an illustration of it.
   */
  it('pays the same two cards 3:2 when the hand was never split', () => {
    const table = toRoundResult(dealing(['A', '7', '10', '7', '4']));
    const hands = table.readout().hands;
    expect(hands[0]?.cards.map((held) => held.rank)).toEqual(['A', '10']);
    expect(hands[0]?.fromSplit).toBe(false);
    expect(hands[0]?.state).toBe('blackjack');

    const settled = resultOf(table)[0];
    expect(settled?.outcome).toBe('BLACKJACK');
    expect(settled?.rung).toBe(3);
    expect(settled?.credit).toBe(
      ROUND_WAGER + (ROUND_WAGER * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR,
    );
    expect(settled?.credit).toBe(125);
    // The two rounds differ by 25 chips on identical cards, which is the whole
    // of what `fromSplit` is for.
    expect(settled?.credit).not.toBe(ROUND_WAGER * 2);
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.6: each hand settles independently, against the right wallet hand
// ---------------------------------------------------------------------------

describe('B10: four hands settle independently, each against its own wallet hand', () => {
  /** The four-hand round, with the second hand doubled, played to the end. */
  function fourHandRound(): Table {
    const table = dealing(FOUR_HANDS);
    for (let split = 0; split < MAX_SPLITS; split += 1) {
      accept(table.apply({ kind: 'split' }));
    }
    accept(table.apply({ kind: 'stand' })); // hand 1 of 4
    accept(table.apply({ kind: 'double' })); // hand 2 of 4, on 10
    return toRoundResult(table);
  }

  /**
   * The misalignment, stated as data rather than as prose.
   *
   * Three splits of the leftmost hand: the wallet appends 1, then 2, then 3,
   * while the table inserts each new hand at position 1. So the play order
   * holds the wallet's hands as 0, 3, 2, 1.
   */
  it('holds the wallet hands in an order the position no longer gives', () => {
    const table = dealing(FOUR_HANDS);
    for (let split = 0; split < MAX_SPLITS; split += 1) {
      accept(table.apply({ kind: 'split' }));
    }
    expect(table.readout().hands.map((hand) => hand.walletHand)).toEqual([0, 3, 2, 1]);
    // The first split alone cannot show it: appending and inserting agree while
    // there is nothing to the right of the parent.
    const once = dealing(FOUR_HANDS);
    accept(once.apply({ kind: 'split' }));
    expect(once.readout().hands.map((hand) => hand.walletHand)).toEqual([0, 1]);
  });

  it('settles each of the four on its own cards, wager and rung', () => {
    const table = fourHandRound();
    const hands = table.readout().hands;
    expect(hands.map((hand) => hand.cards.map((held) => held.rank).join(''))).toEqual([
      '88',
      '829',
      '83',
      '88',
    ]);
    // The dealer drew one card to 18, so three hands are under it and the
    // doubled 19 is over it. Different rungs on one dealer hand is what SPEC
    // 4.6's "settles independently" means.
    expect(table.readout().dealerVisible.map((held) => held.rank)).toEqual(['7', '7', '4']);

    const settled = resultOf(table);
    expect(settled.length).toBe(MAX_HANDS);
    expect(settled.map((hand) => hand.rung)).toEqual([8, 7, 8, 8]);
    expect(settled.map((hand) => hand.outcome)).toEqual([
      'DEALER_WIN',
      'PLAYER_WIN',
      'DEALER_WIN',
      'DEALER_WIN',
    ]);
    expect(settled.map((hand) => hand.wager)).toEqual([
      ROUND_WAGER,
      ROUND_WAGER * 2,
      ROUND_WAGER,
      ROUND_WAGER,
    ]);
  });

  /**
   * The credits, and the counterfactual the index decision is about.
   *
   * Each hand is credited `wager + net`. Keyed on `walletHand` the four come to
   * 0, 200, 0 and 0. Keyed on the table's position instead, the doubled net of
   * `+100` would land on wallet hand 1, which carries 50, and the losing net of
   * `-50` would land on wallet hand 3, which carries 100: 0, 150, 0 and 50.
   * Both sets total 200, because a permutation cannot change a sum, so the
   * total is exactly the assertion that would not have caught it.
   */
  it('credits the doubled hand its own doubled wager, and not its neighbour', () => {
    const table = fourHandRound();
    const settled = resultOf(table);
    const credits = settled.map((hand) => hand.credit);

    expect(credits).toEqual([0, ROUND_WAGER * 4, 0, 0]);
    expect(credits).toEqual([0, 200, 0, 0]);

    // What settling by position would have produced, written out.
    const byPosition = [0, 150, 0, 50];
    expect(credits).not.toEqual(byPosition);
    // And the total cannot tell them apart, which is why it is not the check.
    const total = (values: readonly number[]): number => values.reduce((sum, one) => sum + one, 0);
    expect(total(credits)).toBe(total(byPosition));

    // 1,000 less four 50s and one doubling 50, plus the 200 credited back.
    expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS - 5 * ROUND_WAGER + 200);
    expect(table.readout().wallet.chips).toBe(950);
    expect(table.readout().wallet.conserved).toBe(950);
    expect(table.readout().wallet.committed).toBe(0);
  });

  it('honours Double after split on the toggle, from the split side', () => {
    // SPEC 4.6's last house rule, asserted here as well as on the Double side,
    // because the clause is in both criteria and the two read the same record.
    const on = dealing(FOUR_HANDS);
    accept(on.apply({ kind: 'split' }));
    expect(on.readout().rules.doubleAfterSplit).toBe(true);
    expect(on.apply({ kind: 'double' }).ok).toBe(true);

    const off = dealing(FOUR_HANDS, { rules: { doubleAfterSplit: false } });
    accept(off.apply({ kind: 'split' }));
    const refused = off.apply({ kind: 'double' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.layer).toBe('availability');
      expect(refused.reason).toBe('double-after-split-off');
    }
  });
});

// ---------------------------------------------------------------------------
// The availability rule, swept
// ---------------------------------------------------------------------------

describe('B10: the availability rule answers SPEC 4.6 and nothing else', () => {
  it('permits exactly a live, non-Ace-split pair inside the cap', () => {
    const pair = handOf({ cards: [card('8', 'spades'), card('8', 'hearts')] });
    expect(splitRefusal(pair, context(0))).toBe(null);
    expect(splitRefusal(pair, context(MAX_SPLITS - 1))).toBe(null);
    expect(splitRefusal(pair, context(MAX_SPLITS))).toBe('split-limit');
    expect(splitRefusal({ ...pair, state: 'stood' }, context())).toBe('hand-resolved');
    expect(splitRefusal({ ...pair, fromSplitAces: true }, context())).toBe('split-aces');

    const mixed = handOf({ cards: [card('8', 'spades'), card('9', 'hearts')] });
    expect(splitRefusal(mixed, context())).toBe('not-a-pair');
    expect(splitRefusal(mixed, context(0, 'equalRank'))).toBe('not-a-pair');

    const tens = handOf({ cards: [card('K', 'spades'), card('10', 'hearts')] });
    expect(splitRefusal(tens, context())).toBe(null);
    expect(splitRefusal(tens, context(0, 'equalRank'))).toBe('not-a-pair');

    const three = handOf({
      cards: [card('8', 'spades'), card('8', 'hearts'), card('2', 'clubs')],
    });
    // Three cards are not a pair, which `canSplit` answers and this does not
    // re-derive: SPEC 4.6 compares "a hand's initial two cards".
    expect(splitRefusal(three, context())).toBe('not-a-pair');
    expect(three.cards.length).toBeGreaterThan(INITIAL_CARDS);
  });

  /**
   * SPEC 4.6's "No hit" on a split Ace hand, asked of the rule directly.
   *
   * The machine never offers it, because a split Ace hand stands the moment its
   * card lands and the phase gate turns every action down. The rule is still
   * the rule, and it is the one that would have to hold if the auto-stand ever
   * moved, so it is asked here for the reason `settlement.ts`'s rung 1
   * qualifier is: a total function has to be right about inputs play cannot
   * assemble.
   */
  it('refuses Hit on a live split Ace hand, which play never assembles', () => {
    const splitAce = handOf({
      cards: [card('A', 'spades'), card('5', 'hearts')],
      fromSplit: true,
      fromSplitAces: true,
    });
    expect(hitRefusal(splitAce)).toBe('split-aces');
    // And it is the split-Ace clause and not the state: an ordinary live hand
    // of the same shape is available.
    expect(hitRefusal({ ...splitAce, fromSplitAces: false })).toBe(null);
    expect(hitRefusal({ ...splitAce, fromSplitAces: false, state: 'stood' })).toBe('hand-resolved');
  });
});
