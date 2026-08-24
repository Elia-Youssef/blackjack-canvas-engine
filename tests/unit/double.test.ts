/**
 * Item `B9`, Critical, 11 points: "Double Down is permitted only on exactly two
 * cards with sufficient chips, deals exactly one card, ends the hand, and is
 * unavailable on a split Ace hand." Built at `BJ-8`, SPEC 4.5 and 4.6.
 *
 * **The criterion is the assertion, and it has five clauses.** Exactly two
 * cards; sufficient chips; exactly one card dealt; the hand ends; and never on
 * a split Ace hand. SPEC 4.5's own row adds the sixth this file also drives,
 * "Permitted after a split when DAS is on", which is a house-rule toggle and is
 * `B10`'s last clause read from the Double side.
 *
 * **Two of the clauses are refusals, and a refusal has a layer.** SPEC 4.5's
 * "exactly two cards" is a property of the hand and is answered by the
 * availability layer; "chips available >= the hand's wager" is a property of
 * the balance and is answered by the wallet, which already decides exactly that
 * question inside `commitDouble`. The tests assert which layer refused as well
 * as that something did, because `B15` at `BJ-15` has to put a different
 * sentence in front of the player for each and a machine that answered both
 * from one place would give it one.
 *
 * **The split-Ace clause is driven twice, and neither way is redundant.** SPEC
 * 4.6 stands a split Ace hand automatically, so it is never the active hand and
 * the phase gate turns Double down before the rule is consulted: that is the
 * machine's answer and it is asserted. But a rule enforced only by another
 * rule's side effect is one edit away from being enforced nowhere, so the
 * availability predicate is also called directly on a live split-Ace hand, a
 * state play cannot build. That is `settlement.ts`'s rung 1 precedent exactly:
 * a total function has to be right on inputs a round never assembles.
 *
 * **One negative control, on a derived set.** An availability rule that forgot
 * the card count has to disagree with SPEC 4.5 on exactly the 12 hands of the
 * 64-hand sweep that are live, not split Aces and not holding two cards. Same
 * device as the shoe's two broken shuffles and the settlement ladder's three
 * reorderings.
 *
 * **What this file does not claim.** `B10` grades the split itself, `B13` the
 * ladder that pays the doubled wager, `B15` the betting arithmetic and `C2` the
 * phase gate. What is here is Double.
 */

import { describe, expect, it } from 'vitest';

import { card } from '../../src/core/cards';
import type { ActionContext, IntentResult, Table } from '../../src/core/table';
import { createTable, doubleRefusal } from '../../src/core/table';
import type { HandInPlay, HandState } from '../../src/core/types';
import type { TableLimits, Wallet } from '../../src/core/wallet';
import { createWallet, tableLimits } from '../../src/core/wallet';

import { scriptedShoe } from './support/stacked-shoe';

// ---------------------------------------------------------------------------
// SPEC 4.5, 4.6 and 4.11, transcribed
// ---------------------------------------------------------------------------

/** SPEC 4.5: Double wants "exactly two cards". */
const INITIAL_CARDS = 2;

/** SPEC 4.5: "Double this hand's wager", so the wager is multiplied by this. */
const DOUBLE = 2;

/** SPEC 4.5: "one card", and SPEC 4.11 does not change the count. */
const ONE_CARD = 1;

/** SPEC 4.11: the starting bankroll and the wager these rounds carry. */
const SPEC_STARTING_CHIPS = 1000;
const ROUND_WAGER = 50;

/** SPEC 5: a frame long enough to pay for any one timed step below. */
const TICK = 0.25;

/** Bounded, for the reason `wallet.test.ts` gives: a stall must fail loudly. */
const LOOP_LIMIT = 500;

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
// Driving the machine
// ---------------------------------------------------------------------------

function accept(result: IntentResult): IntentResult {
  if (!result.ok) {
    throw new Error(`${result.kind} was refused by ${result.layer} as ${result.reason}`);
  }
  return result;
}

/** Advance timed phases until the player is asked to act, or the round ends. */
function toPlayerTurn(table: Table): Table {
  const turn = bounded('driving the machine to the player turn');
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

/** Run the round out to SPEC 12's result, standing on anything still live. */
function toRoundResult(table: Table): Table {
  const turn = bounded('driving the machine to the round result');
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

/**
 * A wallet drained to a chosen balance through its own controls.
 *
 * The same device `phase-legality.test.ts` uses for SPEC 4.12's bust-out: the
 * wallet has no setter, so a balance is reached by losing rounds at wagers SPEC
 * 4.11 allows. Bronze takes 10 to 100, so any multiple of 10 at or below 1,000
 * is reachable, and every intermediate wager is on SPEC 4.11's grid.
 */
function walletAt(target: number): Wallet {
  const wallet = createWallet();
  const bronze: TableLimits = tableLimits('bronze');
  const turn = bounded(`draining a wallet to ${String(target)}`);
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

/**
 * A round in which the player holds 11 against a dealer 14.
 *
 * Eleven is the textbook double: two cards, live, and nowhere near 21. The
 * dealer's 14 draws once and busts on the ten that follows, so the round always
 * reaches SPEC 4.10's rung 6 and the payout is on whatever wager the hand is
 * carrying by then.
 */
function elevenAgainstFourteen(): Table {
  return createTable({ shoe: scriptedShoe(['5', '7', '6', '7', '10', '9']) });
}

/** A round in which the player holds a pair of eights, for the split path. */
function pairOfEights(rules: Parameters<typeof createTable>[0] = {}): Table {
  return createTable({
    shoe: scriptedShoe(['8', '7', '8', '7', '3', '4', '10', '10', '10']),
    ...rules,
  });
}

/** A round in which the player holds a pair of Aces. */
function pairOfAces(): Table {
  return createTable({ shoe: scriptedShoe(['A', '7', 'A', '7', '9', '9', '10', '10']) });
}

/** One hand for the availability predicate, built rather than dealt. */
function handOf(
  overrides: Partial<HandInPlay> & { readonly cards: HandInPlay['cards'] },
): HandInPlay {
  return Object.freeze({
    wager: ROUND_WAGER,
    state: 'live' as HandState,
    fromSplit: false,
    fromSplitAces: false,
    walletHand: 0,
    ...overrides,
  });
}

/** The house-rule context, with Double after split as SPEC 4.6 defaults it. */
function context(doubleAfterSplit = true): ActionContext {
  return Object.freeze({
    rules: Object.freeze({
      decks: 6,
      doubleAfterSplit,
      surrender: true,
      evenMoney: true,
      splitRule: 'equalValue',
    }),
    splits: 0,
  });
}

// ---------------------------------------------------------------------------
// SPEC 4.5: one card, the wager doubled, the hand over
// ---------------------------------------------------------------------------

describe('B9: Double deals exactly one card, doubles the wager and ends the hand', () => {
  it('takes one card, doubles the wager and leaves the hand finished', () => {
    const table = toPlayerTurn(elevenAgainstFourteen());
    const before = table.readout();
    expect(before.phase.kind).toBe('playerTurn');
    expect(before.hands[0]?.cards.length).toBe(INITIAL_CARDS);
    expect(before.hands[0]?.wager).toBe(ROUND_WAGER);
    expect(before.wallet.chips).toBe(SPEC_STARTING_CHIPS - ROUND_WAGER);
    expect(before.wallet.committed).toBe(ROUND_WAGER);

    accept(table.apply({ kind: 'double' }));
    const after = table.readout();

    // "deals exactly one card"
    expect(after.hands[0]?.cards.length).toBe(INITIAL_CARDS + ONE_CARD);
    expect(after.shoe.inPlay).toBe(before.shoe.inPlay + ONE_CARD);
    expect(after.shoe.remaining).toBe(before.shoe.remaining - ONE_CARD);

    // "Double this hand's wager", and SPEC 4.11's increment leaves the balance.
    expect(after.hands[0]?.wager).toBe(ROUND_WAGER * DOUBLE);
    expect(after.wallet.chips).toBe(before.wallet.chips - ROUND_WAGER);
    expect(after.wallet.committed).toBe(ROUND_WAGER * DOUBLE);
    // SPEC 4.11's identity does not move: the chips became committed.
    expect(after.wallet.conserved).toBe(before.wallet.conserved);

    // "ends the hand": the hand is no longer live and the turn is over, which
    // on a one-hand round is SPEC 10's reveal.
    expect(after.hands[0]?.state).toBe('doubled');
    expect(after.phase.kind).toBe('reveal');
  });

  it('is refused a second time, because the hand it ended is no longer active', () => {
    const table = toPlayerTurn(elevenAgainstFourteen());
    accept(table.apply({ kind: 'double' }));
    const after = table.readout();

    const again = table.apply({ kind: 'double' });
    expect(again.ok).toBe(false);
    if (!again.ok) {
      // The phase, not the hand: SPEC 10 gives Double to `playerTurn` alone and
      // the turn ended when the last live hand did.
      expect(again.layer).toBe('phase');
      expect(again.reason).toBe('wrong-phase');
    }
    expect(table.readout()).toEqual(after);
  });

  it('pays the doubled wager at settlement, not the wager that was dealt', () => {
    // 5 and 6 doubled into a ten is 21; the dealer's 14 draws a nine and busts,
    // which is SPEC 4.10's rung 6 and pays `+wager` on the wager the hand is
    // carrying by then, which is the doubled one.
    const table = toPlayerTurn(elevenAgainstFourteen());
    accept(table.apply({ kind: 'double' }));
    toRoundResult(table);
    const state = table.readout();
    expect(state.phase.kind).toBe('roundResult');
    if (state.phase.kind !== 'roundResult') {
      return;
    }
    const hand = state.phase.result.hands[0];
    expect(hand?.wager).toBe(ROUND_WAGER * DOUBLE);
    expect(hand?.outcome).toBe('PLAYER_WIN');
    expect(hand?.rung).toBe(6);
    expect(hand?.credit).toBe(ROUND_WAGER * DOUBLE * 2);
    // Bankroll: 1,000 less 50 at the deal, less 50 at the double, plus 200.
    expect(state.wallet.chips).toBe(SPEC_STARTING_CHIPS + ROUND_WAGER * DOUBLE);
    expect(state.wallet.conserved).toBe(state.wallet.chips);
  });

  it('records a bust rather than a double when the one card busts the hand', () => {
    // 10 and 6 for 16, doubled into a ten. SPEC 4.9's contention gate asks
    // whether a hand busted, and a hand can be doubled and bust at once, so the
    // state has to say bust or the dealer would draw for a hand that is gone.
    const table = toPlayerTurn(
      createTable({ shoe: scriptedShoe(['10', '7', '6', '7', '10', '10']) }),
    );
    accept(table.apply({ kind: 'double' }));
    const after = table.readout();
    expect(after.hands[0]?.cards.length).toBe(INITIAL_CARDS + ONE_CARD);
    expect(after.hands[0]?.wager).toBe(ROUND_WAGER * DOUBLE);
    expect(after.hands[0]?.state).toBe('bust');

    // SPEC 4.9: no hand is in contention, so the hole card is revealed, the
    // dealer takes no card at all and the round settles. The dealer's hand is
    // still the two cards of the deal, face up, at SPEC 12's round result.
    const settled = toRoundResult(table).readout();
    expect(settled.dealerVisible.length).toBe(INITIAL_CARDS);
    expect(settled.dealerConcealed).toBe(0);
    expect(settled.phase.kind).toBe('roundResult');
    if (settled.phase.kind === 'roundResult') {
      expect(settled.phase.result.hands[0]?.rung).toBe(5);
      expect(settled.phase.result.hands[0]?.outcome).toBe('DEALER_WIN');
      expect(settled.phase.result.hands[0]?.credit).toBe(0);
      expect(settled.phase.result.hands[0]?.wager).toBe(ROUND_WAGER * DOUBLE);
    }
    // 1,000 less 50 at the deal and 50 at the double, and nothing back.
    expect(settled.wallet.chips).toBe(SPEC_STARTING_CHIPS - ROUND_WAGER * DOUBLE);
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.5: "Exactly two cards, chips available >= the hand's wager"
// ---------------------------------------------------------------------------

describe('B9: Double is permitted only on exactly two cards with sufficient chips', () => {
  it('refuses on three cards, at the availability layer, and changes nothing', () => {
    const table = toPlayerTurn(
      createTable({ shoe: scriptedShoe(['5', '7', '6', '7', '2', '10', '10']) }),
    );
    // A hit first: 5 and 6 and a 2 is 13, still live, so the hand is available
    // in every way except the one this clause is about.
    accept(table.apply({ kind: 'hit' }));
    const before = table.readout();
    expect(before.hands[0]?.cards.length).toBe(INITIAL_CARDS + ONE_CARD);
    expect(before.hands[0]?.state).toBe('live');
    expect(before.phase.kind).toBe('playerTurn');

    const result = table.apply({ kind: 'double' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.layer).toBe('availability');
      expect(result.reason).toBe('not-two-cards');
      expect(result.kind).toBe('double');
    }
    // A refusal changes nothing at all: no card, no chip, no state.
    expect(table.readout()).toEqual(before);
  });

  it('refuses when the balance cannot cover the increment, at the wallet layer', () => {
    // 90 chips, 50 wagered, 40 left against an increment of 50.
    const table = toPlayerTurn(
      createTable({
        wallet: walletAt(90),
        shoe: scriptedShoe(['5', '7', '6', '7', '10', '9']),
      }),
    );
    const before = table.readout();
    expect(before.wallet.chips).toBe(40);
    expect(before.hands[0]?.wager).toBe(ROUND_WAGER);

    const result = table.apply({ kind: 'double' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The wallet, not the hand: SPEC 4.6 requires the reason to be surfaced
      // and `wallet.ts` is what decides whether a wager can be funded, so a
      // second reading here would be the one that drifts.
      expect(result.layer).toBe('wallet');
      expect(result.reason).toBe('insufficient-chips');
    }
    expect(table.readout()).toEqual(before);
  });

  it('permits a balance exactly equal to the increment, which is what >= means', () => {
    // 100 chips, 50 wagered, 50 left against an increment of 50.
    const table = toPlayerTurn(
      createTable({
        wallet: walletAt(100),
        shoe: scriptedShoe(['5', '7', '6', '7', '10', '9']),
      }),
    );
    expect(table.readout().wallet.chips).toBe(ROUND_WAGER);
    accept(table.apply({ kind: 'double' }));
    expect(table.readout().wallet.chips).toBe(0);
    expect(table.readout().hands[0]?.wager).toBe(ROUND_WAGER * DOUBLE);
    expect(table.readout().wallet.conserved).toBe(ROUND_WAGER * DOUBLE);
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.5 and 4.6: never on a split Ace hand, and DAS honours its toggle
// ---------------------------------------------------------------------------

describe('B9: Double is unavailable on a split Ace hand', () => {
  it('leaves no split Ace hand to double, because SPEC 4.6 stands them both', () => {
    const table = toPlayerTurn(pairOfAces());
    expect(table.readout().hands[0]?.cards.length).toBe(INITIAL_CARDS);
    accept(table.apply({ kind: 'split' }));

    const after = table.readout();
    expect(after.hands.length).toBe(2);
    for (const hand of after.hands) {
      expect(hand.fromSplitAces).toBe(true);
      expect(hand.cards.length).toBe(INITIAL_CARDS);
      expect(hand.state).toBe('stood');
    }
    // No live hand, so SPEC 10's player turn is over and Double is refused by
    // the phase before any rule about the hand is consulted.
    expect(after.phase.kind).toBe('reveal');
    const result = table.apply({ kind: 'double' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.layer).toBe('phase');
      expect(result.reason).toBe('wrong-phase');
    }
  });

  /**
   * The rule itself, asked of a hand play cannot build.
   *
   * A live split-Ace hand is unreachable because SPEC 4.6 stands one the moment
   * its single card lands. The rule still has to be right about it: a machine
   * that dropped the auto-stand tomorrow would otherwise be permitting Double
   * on split Aces with nothing to catch it.
   */
  it('refuses the rule on a live split Ace hand, which play never assembles', () => {
    const splitAce = handOf({
      cards: [card('A', 'spades'), card('9', 'hearts')],
      fromSplit: true,
      fromSplitAces: true,
    });
    expect(doubleRefusal(splitAce, context())).toBe('split-aces');
    // And the clause outranks the ones that would otherwise answer, so a split
    // Ace hand is refused for being one whatever else is true of it: a hand
    // that has already resolved, and a hand holding one card rather than the
    // two SPEC 4.5 wants, both come back with the same reason.
    expect(doubleRefusal({ ...splitAce, state: 'stood' }, context())).toBe('split-aces');
    const oneCard = handOf({
      cards: [card('A', 'spades')],
      fromSplit: true,
      fromSplitAces: true,
    });
    expect(oneCard.cards.length).not.toBe(INITIAL_CARDS);
    expect(doubleRefusal(oneCard, context())).toBe('split-aces');
  });

  it('permits Double after a split when SPEC 4.6 DAS toggle is on, which is the default', () => {
    const table = toPlayerTurn(pairOfEights());
    accept(table.apply({ kind: 'split' }));
    const split = table.readout();
    expect(split.rules.doubleAfterSplit).toBe(true);
    expect(split.hands.length).toBe(2);
    expect(split.hands[0]?.fromSplit).toBe(true);
    expect(split.hands[0]?.cards.length).toBe(INITIAL_CARDS);

    accept(table.apply({ kind: 'double' }));
    const after = table.readout();
    expect(after.hands[0]?.state).toBe('doubled');
    expect(after.hands[0]?.wager).toBe(ROUND_WAGER * DOUBLE);
    expect(after.hands[0]?.cards.length).toBe(INITIAL_CARDS + ONE_CARD);
    // The turn moves on to the second hand, which is untouched.
    expect(after.phase.kind).toBe('playerTurn');
    expect(after.hands[1]?.wager).toBe(ROUND_WAGER);
    expect(after.hands[1]?.state).toBe('live');
  });

  it('refuses Double after a split when the toggle is off, and names the toggle', () => {
    const table = toPlayerTurn(pairOfEights({ rules: { doubleAfterSplit: false } }));
    accept(table.apply({ kind: 'split' }));
    const before = table.readout();
    expect(before.rules.doubleAfterSplit).toBe(false);
    expect(before.hands[0]?.fromSplit).toBe(true);

    const result = table.apply({ kind: 'double' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.layer).toBe('availability');
      expect(result.reason).toBe('double-after-split-off');
    }
    expect(table.readout()).toEqual(before);

    // The toggle is about split hands and only about them: the same table
    // doubles an unsplit hand without complaint.
    const unsplit = toPlayerTurn(
      createTable({
        rules: { doubleAfterSplit: false },
        shoe: scriptedShoe(['5', '7', '6', '7', '10', '9']),
      }),
    );
    accept(unsplit.apply({ kind: 'double' }));
    expect(unsplit.readout().hands[0]?.state).toBe('doubled');
  });
});

// ---------------------------------------------------------------------------
// The negative control, on a derived set
// ---------------------------------------------------------------------------

describe('B9: the availability rule disagrees with a reading that forgot the cards', () => {
  /**
   * Every hand the rule can be asked about, inside a bounded shape.
   *
   * Four card counts crossed with both split origins, both split-Ace flags,
   * two states and both readings of the DAS toggle: 4 x 2 x 2 x 2 x 2 = 64.
   * Some of the 64 are combinations play never builds, a split-Ace hand that is
   * not from a split among them, which is the point: the rule is a total
   * function and has to answer them.
   */
  const LENGTHS = [1, 2, 3, 4] as const;
  const FLAGS = [false, true] as const;
  const STATES: readonly HandState[] = ['live', 'stood'];
  const SWEEP_SIZE = LENGTHS.length * FLAGS.length * FLAGS.length * STATES.length * FLAGS.length;

  interface Cell {
    readonly hand: HandInPlay;
    readonly context: ActionContext;
  }

  function sweep(): readonly Cell[] {
    const cells: Cell[] = [];
    for (const length of LENGTHS) {
      for (const fromSplit of FLAGS) {
        for (const fromSplitAces of FLAGS) {
          for (const state of STATES) {
            for (const das of FLAGS) {
              cells.push({
                hand: handOf({
                  cards: Array.from({ length }, () => ({ rank: '5', suit: 'clubs' }) as const),
                  fromSplit,
                  fromSplitAces,
                  state,
                }),
                context: context(das),
              });
            }
          }
        }
      }
    }
    return cells;
  }

  it('sweeps every shape of hand the rule can be asked about', () => {
    expect(sweep().length).toBe(SWEEP_SIZE);
    expect(sweep().length).toBe(64);
  });

  /**
   * SPEC 4.5's Double row without its card count, which is the misreading that
   * matters: it is invisible on every two-card hand, which is every hand a
   * player sees the button on, and permits doubling a hand that has hit.
   *
   * It has to disagree on exactly the hands that are live, are not split Aces
   * and are not holding two cards: 3 lengths of 4, one of the two split-Ace
   * flags, one of the two states, both split origins and both toggles, which is
   * 3 x 1 x 1 x 2 x 2 = 12.
   */
  it('disagrees with a rule that dropped the card count on exactly 12 of the 64', () => {
    function withoutCardCount(hand: HandInPlay, where: ActionContext): string | null {
      if (hand.fromSplitAces) {
        return 'split-aces';
      }
      if (hand.state !== 'live') {
        return 'hand-resolved';
      }
      if (hand.fromSplit && !where.rules.doubleAfterSplit) {
        return 'double-after-split-off';
      }
      return null;
    }

    const differ = sweep().filter(
      (cell) => doubleRefusal(cell.hand, cell.context) !== withoutCardCount(cell.hand, cell.context),
    );
    const expected = (LENGTHS.length - 1) * 1 * 1 * FLAGS.length * FLAGS.length;
    expect(differ.length).toBe(expected);
    expect(differ.length).toBe(12);
    for (const cell of differ) {
      expect(cell.hand.state).toBe('live');
      expect(cell.hand.fromSplitAces).toBe(false);
      expect(cell.hand.cards.length).not.toBe(INITIAL_CARDS);
      expect(doubleRefusal(cell.hand, cell.context)).toBe('not-two-cards');
      expect(withoutCardCount(cell.hand, cell.context)).not.toBe('not-two-cards');
    }
  });

  it('permits exactly the hands SPEC 4.5 permits, over the same sweep', () => {
    const permitted = sweep().filter((cell) => doubleRefusal(cell.hand, cell.context) === null);
    // Two cards, live, not split Aces, and either unsplit or with DAS on:
    // 1 length x 1 state x 1 flag x (unsplit: 2 toggles + split: 1 toggle) = 3.
    expect(permitted.length).toBe(3);
    for (const cell of permitted) {
      expect(cell.hand.cards.length).toBe(INITIAL_CARDS);
      expect(cell.hand.state).toBe('live');
      expect(cell.hand.fromSplitAces).toBe(false);
      expect(cell.hand.fromSplit ? cell.context.rules.doubleAfterSplit : true).toBe(true);
    }
  });
});
