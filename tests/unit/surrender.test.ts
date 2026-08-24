/**
 * Item `B12`, Major, 11 points: "Surrender is available only on a hand's
 * initial two cards after the peek, never after a split, hit or double, and
 * returns exactly wager/2." Built at `BJ-8`, SPEC 4.8.
 *
 * **The criterion is the assertion, and it has five clauses.** Only on a hand's
 * initial two cards; after the peek; never after a split; never after a hit or
 * a double; and it returns exactly half the wager. SPEC 4.8 adds the sixth this
 * file also drives, "House-rule toggle, default on", which `rules.ts` holds and
 * no item of its own claims.
 *
 * **"After the peek" is enforced by the phase order and is tested as such.**
 * SPEC 10 gives Surrender to `playerTurn` alone, and the only routes into
 * `playerTurn` are through the peek or from an up card SPEC 4.4 never peeks
 * behind, which is an up card no dealer natural can be built on. So the clause
 * cannot be broken by an availability rule; it is broken by a machine that
 * offers the control on the wrong screen. The round below with a dealer natural
 * is what proves it: the peek resolves the round and the player never gets the
 * chance, which is the whole reason SPEC 4.8 says late surrender exists, "so a
 * dealer natural takes the full wager rather than half".
 *
 * **"Returns exactly wager/2" is not arithmetic written here.** SPEC 4.10's
 * rung 1 nets `-wager / 2`, and SPEC 4.11 credits back `wager + net`, so the
 * balance receives `wager - wager / 2`. The tests assert the rung, the net and
 * the balance separately, because a machine that credited half the wager
 * somewhere of its own would produce the right balance from the wrong place and
 * would then pay it twice on the round after.
 *
 * **Two negative controls, each on a derived set.** Early surrender, which is
 * the variant SPEC 4.8 rejects, returns half against a dealer natural where
 * late surrender loses the whole wager: the two differ by exactly `wager / 2`
 * and on exactly the rounds where the peek found one. And an availability rule
 * that forgot the split origin has to disagree on exactly the hands created by
 * a split.
 *
 * **What this file does not claim.** `B13` grades the ladder's nine rungs,
 * `B7` the peek, `B10` the split and `C2` the phase gate. What is here is
 * Surrender.
 */

import { describe, expect, it } from 'vitest';

import type { Rank } from '../../src/core/cards';
import { card } from '../../src/core/cards';
import type { ActionContext, IntentResult, Table, TableOptions } from '../../src/core/table';
import { createTable, surrenderRefusal } from '../../src/core/table';
import type { ChipDenomination } from '../../src/core/wallet';
import type { HandInPlay, PhaseKind, SettledHand } from '../../src/core/types';

import { scriptedShoe } from './support/stacked-shoe';

// ---------------------------------------------------------------------------
// SPEC 4.8, 4.10 and 4.11, transcribed
// ---------------------------------------------------------------------------

/** SPEC 4.8: "Only on a hand's initial two cards". */
const INITIAL_CARDS = 2;

/** SPEC 4.8: "Returns `wager / 2`", so it forfeits the other half. */
const SURRENDER_DIVISOR = 2;

/** SPEC 4.10: rung 1 is the surrender rung, and its outcome is SURRENDER. */
const SURRENDER_RUNG = 1;

/** SPEC 4.10: rung 4 is a dealer natural against anything that is not one. */
const DEALER_NATURAL_RUNG = 4;

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

/** Every phase the round passed through, in order, with no repeats. */
function phasesOf(table: Table, seen: PhaseKind[]): void {
  const kind = table.readout().phase.kind;
  if (seen[seen.length - 1] !== kind) {
    seen.push(kind);
  }
}

/** Drive to the player's turn, or to the round result if the peek ended it. */
function toPlayerTurn(table: Table, seen: PhaseKind[] = []): Table {
  const turn = bounded('driving the machine to the player turn');
  phasesOf(table, seen);
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
    phasesOf(table, seen);
  }
  return table;
}

/** Run out to SPEC 12's result, standing on every hand still live. */
function toRoundResult(table: Table, seen: PhaseKind[] = []): Table {
  const turn = bounded('driving the machine to the round result');
  phasesOf(table, seen);
  while (table.readout().phase.kind !== 'roundResult') {
    turn();
    if (table.readout().phase.kind === 'playerTurn') {
      accept(table.apply({ kind: 'stand' }));
    } else {
      table.update(TICK);
    }
    phasesOf(table, seen);
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

/** A table dealing a written-down script, at SPEC 4.8's default rules. */
function dealing(script: readonly Rank[], options: TableOptions = {}): Table {
  return createTable({ shoe: scriptedShoe(script), ...options });
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
function context(surrender = true): ActionContext {
  return Object.freeze({
    rules: Object.freeze({
      decks: 6,
      doubleAfterSplit: true,
      surrender,
      evenMoney: true,
      splitRule: 'equalValue' as const,
    }),
    splits: 0,
  });
}

/**
 * A round the player surrenders, written in SPEC 4.3's deal order.
 *
 * Sixteen against a dealer 7 with a 7 behind it, which is the textbook
 * surrender. The dealer's 14 would draw, and the point of the round is that it
 * does not: SPEC 4.9 gives the dealer no card when no hand is in contention,
 * and a surrendered hand is not. So four cards are the whole round.
 */
const SIXTEEN_VERSUS_SEVEN: readonly Rank[] = ['9', '7', '7', '7'];

/**
 * The same round with the dealer's draws written in, for the cases the player
 * does not surrender.
 *
 * Fourteen draws once and the ten carries it to 24, so the round finishes. The
 * shorter script above is deliberately exactly four cards: a round that reached
 * `dealerTurn` after a surrender would ask it for a fifth and say so loudly.
 */
const SIXTEEN_PLAYED_OUT: readonly Rank[] = ['9', '7', '7', '7', '10'];

// ---------------------------------------------------------------------------
// SPEC 4.8: available on the initial two cards, and what it returns
// ---------------------------------------------------------------------------

describe('B12: Surrender ends the hand and returns exactly half the wager', () => {
  it('is available on the initial two cards and ends the hand at once', () => {
    const table = toPlayerTurn(dealing(SIXTEEN_VERSUS_SEVEN));
    const before = table.readout();
    expect(before.hands[0]?.cards.length).toBe(INITIAL_CARDS);
    expect(before.hands[0]?.state).toBe('live');
    expect(before.rules.surrender).toBe(true);

    accept(table.apply({ kind: 'surrender' }));
    const after = table.readout();
    expect(after.hands[0]?.state).toBe('surrendered');
    // "the hand ends immediately": no card was dealt and the turn is over.
    expect(after.hands[0]?.cards.length).toBe(INITIAL_CARDS);
    expect(after.shoe.inPlay).toBe(before.shoe.inPlay);
    expect(after.phase.kind).toBe('reveal');
  });

  it('returns exactly wager/2 through rung 1, and takes the other half', () => {
    const table = toPlayerTurn(dealing(SIXTEEN_VERSUS_SEVEN));
    accept(table.apply({ kind: 'surrender' }));
    toRoundResult(table);

    const settled = resultOf(table)[0];
    expect(settled?.outcome).toBe('SURRENDER');
    expect(settled?.rung).toBe(SURRENDER_RUNG);
    // SPEC 4.11 credits `wager + net`, and SPEC 4.10's rung 1 nets `-wager/2`.
    expect(settled?.credit).toBe(ROUND_WAGER / SURRENDER_DIVISOR);
    expect(settled?.credit).toBe(25);
    // The balance is down by exactly half the wager, and by nothing else.
    expect(table.readout().wallet.chips).toBe(
      SPEC_STARTING_CHIPS - ROUND_WAGER / SURRENDER_DIVISOR,
    );
    expect(table.readout().wallet.conserved).toBe(table.readout().wallet.chips);
    expect(table.readout().wallet.committed).toBe(0);
  });

  it('returns half of whatever the wager was, over three of them', () => {
    let checked = 0;
    for (const chip of [10, 50, 100] as readonly ChipDenomination[]) {
      const table = dealing(SIXTEEN_VERSUS_SEVEN);
      accept(table.apply({ kind: 'start' }));
      accept(table.apply({ kind: 'tapChip', chip }));
      accept(table.apply({ kind: 'deal' }));
      toPlayerTurn(table);
      accept(table.apply({ kind: 'surrender' }));
      toRoundResult(table);

      const returned = resultOf(table)[0]?.credit ?? Number.NaN;
      expect(returned, `wager ${String(chip)}`).toBe(chip / SURRENDER_DIVISOR);
      // SPEC 4.11's 10-chip grid is what makes every one of these an integer,
      // which is why the game has no rounding rule anywhere.
      expect(Number.isInteger(returned)).toBe(true);
      expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS - chip / SURRENDER_DIVISOR);
      checked += 1;
    }
    expect(checked).toBe(3);
    // Three different answers, so no constant fits any of them.
    expect(new Set([10, 50, 100].map((wager) => wager / SURRENDER_DIVISOR)).size).toBe(3);
  });

  /**
   * SPEC 4.9: "A hand is in contention if it is neither busted nor
   * surrendered... If none is, the hole card is still revealed, the dealer
   * takes no card, and the round settles."
   *
   * The dealer is sitting on 14 and would certainly draw, so a round that
   * passed through `dealerTurn` here would be one where the gate did nothing.
   */
  it('leaves the dealer no card to draw, because a surrendered hand is out', () => {
    const seen: PhaseKind[] = [];
    const table = toPlayerTurn(dealing(SIXTEEN_VERSUS_SEVEN), seen);
    accept(table.apply({ kind: 'surrender' }));
    toRoundResult(table, seen);

    expect(seen).toContain('reveal');
    expect(seen).not.toContain('dealerTurn');
    // The dealer's two cards, face up, and nothing on top of them.
    expect(table.readout().dealerVisible.map((held) => held.rank)).toEqual(['7', '7']);
    expect(table.readout().dealerConcealed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.8: never after a split, a hit or a double
// ---------------------------------------------------------------------------

describe('B12: Surrender is unavailable after a split, a hit or a double', () => {
  it('refuses after a hit, because the hand no longer holds two cards', () => {
    // 9 and 7 and a 2 is 18 and still live, so the hand is available in every
    // way except the one this clause is about.
    const table = toPlayerTurn(dealing(['9', '7', '7', '7', '2', '10']));
    accept(table.apply({ kind: 'hit' }));
    const before = table.readout();
    expect(before.hands[0]?.cards.length).toBe(INITIAL_CARDS + 1);
    expect(before.hands[0]?.state).toBe('live');

    const result = table.apply({ kind: 'surrender' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.layer).toBe('availability');
      expect(result.reason).toBe('not-two-cards');
      expect(result.kind).toBe('surrender');
    }
    expect(table.readout()).toEqual(before);
  });

  it('refuses after a split, on both halves, even though each holds two cards', () => {
    const table = toPlayerTurn(dealing(['8', '7', '8', '7', '3', '4', '10']));
    accept(table.apply({ kind: 'split' }));
    const before = table.readout();
    expect(before.hands.length).toBe(2);
    // Both halves hold exactly two cards, so the card count cannot be what
    // refuses them: SPEC 4.8's "not available after a split" is a clause of its
    // own and this is the round that shows it.
    for (const hand of before.hands) {
      expect(hand.cards.length).toBe(INITIAL_CARDS);
      expect(hand.fromSplit).toBe(true);
    }

    const first = table.apply({ kind: 'surrender' });
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.layer).toBe('availability');
      expect(first.reason).toBe('from-split');
    }
    expect(table.readout()).toEqual(before);

    // And on the second hand too, once the first has stood.
    accept(table.apply({ kind: 'stand' }));
    const second = table.apply({ kind: 'surrender' });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('from-split');
    }
  });

  it('refuses after a double, because the double already ended the hand', () => {
    const table = toPlayerTurn(dealing(['5', '7', '6', '7', '10', '9']));
    accept(table.apply({ kind: 'double' }));
    expect(table.readout().hands[0]?.state).toBe('doubled');
    // SPEC 4.5 ends the hand on a double, so SPEC 10's player turn is over and
    // the phase refuses before any rule about the hand is consulted.
    const result = table.apply({ kind: 'surrender' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.layer).toBe('phase');
      expect(result.reason).toBe('wrong-phase');
    }
    // The rule itself agrees, asked directly about a hand in that state.
    expect(
      surrenderRefusal(
        handOf({ cards: [card('5', 'spades'), card('6', 'hearts')], state: 'doubled' }),
        context(),
      ),
    ).toBe('hand-resolved');
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.8: late surrender, which is what "after the peek" means
// ---------------------------------------------------------------------------

describe('B12: Surrender comes after the peek, so a dealer natural takes it all', () => {
  it('never offers the control on a round the peek resolved', () => {
    // A ten-value up card with an Ace behind it is SPEC 4.2's natural, and SPEC
    // 4.4 peeks behind a ten and resolves the round before any player action.
    const seen: PhaseKind[] = [];
    const table = toPlayerTurn(dealing(['9', '10', '7', 'A']), seen);
    expect(seen).toContain('peek');
    expect(seen).not.toContain('playerTurn');
    expect(table.readout().phase.kind).toBe('roundResult');

    const result = table.apply({ kind: 'surrender' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.layer).toBe('phase');
      expect(result.reason).toBe('wrong-phase');
    }
  });

  /**
   * The control, and it is the variant SPEC 4.8 names and rejects.
   *
   * Early surrender is offered before the peek, so a player facing a dealer
   * natural would give up half the wager instead of all of it. Late surrender
   * cannot reach that round at all, so the hand settles at rung 4 for the whole
   * wager. The two readings differ by exactly `wager / 2`, and on exactly the
   * rounds where the peek found a natural.
   */
  it('loses the whole wager to a dealer natural, not the half early surrender would', () => {
    const table = toPlayerTurn(dealing(['9', '10', '7', 'A']));
    const settled = resultOf(table)[0];
    expect(settled?.rung).toBe(DEALER_NATURAL_RUNG);
    expect(settled?.outcome).toBe('DEALER_WIN');
    expect(settled?.credit).toBe(0);
    expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS - ROUND_WAGER);

    // What early surrender would have returned, written out.
    const earlySurrenderReturn = ROUND_WAGER / SURRENDER_DIVISOR;
    expect(settled?.credit).not.toBe(earlySurrenderReturn);
    expect(earlySurrenderReturn - (settled?.credit ?? 0)).toBe(ROUND_WAGER / SURRENDER_DIVISOR);

    // And on a round the peek did not resolve, the same control returns exactly
    // that half, so the two readings differ on the dealer natural and nowhere
    // else.
    const late = toPlayerTurn(dealing(SIXTEEN_VERSUS_SEVEN));
    accept(late.apply({ kind: 'surrender' }));
    toRoundResult(late);
    expect(resultOf(late)[0]?.credit).toBe(earlySurrenderReturn);
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.8: the house-rule toggle, default on
// ---------------------------------------------------------------------------

describe('B12: Surrender honours its house-rule toggle, which SPEC 4.8 defaults on', () => {
  it('is on by default, and no caller has to say so', () => {
    expect(createTable().readout().rules.surrender).toBe(true);
    expect(surrenderRefusal(handOf({ cards: [card('9', 'spades'), card('7', 'hearts')] }), context())).toBe(
      null,
    );
  });

  it('refuses with the toggle named when the house does not offer it', () => {
    const table = toPlayerTurn(dealing(SIXTEEN_PLAYED_OUT, { rules: { surrender: false } }));
    const before = table.readout();
    expect(before.rules.surrender).toBe(false);
    expect(before.hands[0]?.cards.length).toBe(INITIAL_CARDS);

    const result = table.apply({ kind: 'surrender' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.layer).toBe('availability');
      expect(result.reason).toBe('surrender-off');
    }
    expect(table.readout()).toEqual(before);

    // The toggle is about the table and not about the hand, so it answers first
    // and it answers for every hand.
    expect(
      surrenderRefusal(
        handOf({ cards: [card('9', 'spades'), card('7', 'hearts')], fromSplit: true }),
        context(false),
      ),
    ).toBe('surrender-off');
    // The rest of the round runs exactly as it would have.
    accept(table.apply({ kind: 'stand' }));
    toRoundResult(table);
    expect(resultOf(table)[0]?.rung).not.toBe(SURRENDER_RUNG);
  });
});

// ---------------------------------------------------------------------------
// The availability rule, and the control that forgot the split
// ---------------------------------------------------------------------------

describe('B12: the availability rule answers SPEC 4.8 and nothing else', () => {
  /**
   * Every shape SPEC 4.8's clauses can distinguish.
   *
   * Three card counts crossed with both split origins, two states and both
   * readings of the toggle: 3 x 2 x 2 x 2 = 24.
   */
  const LENGTHS = [1, 2, 3] as const;
  const FLAGS = [false, true] as const;
  const STATES = ['live', 'stood'] as const;
  const SWEEP_SIZE = LENGTHS.length * FLAGS.length * STATES.length * FLAGS.length;

  interface Cell {
    readonly hand: HandInPlay;
    readonly context: ActionContext;
  }

  function sweep(): readonly Cell[] {
    const cells: Cell[] = [];
    for (const length of LENGTHS) {
      for (const fromSplit of FLAGS) {
        for (const state of STATES) {
          for (const toggle of FLAGS) {
            cells.push({
              hand: handOf({
                cards: Array.from({ length }, () => card('5', 'clubs')),
                fromSplit,
                state,
              }),
              context: context(toggle),
            });
          }
        }
      }
    }
    return cells;
  }

  it('sweeps every shape of hand the rule can be asked about', () => {
    expect(sweep().length).toBe(SWEEP_SIZE);
    expect(sweep().length).toBe(24);
  });

  /**
   * SPEC 4.8's rule without "not available after a split", which is the
   * misreading that matters: a split hand holds exactly two cards and has taken
   * no action of its own, so every other clause passes it.
   *
   * The two readings disagree on every live split hand at a table that offers
   * surrender, whatever it is holding: on two cards the control permits what
   * SPEC 4.8 forbids, and on one or three it names the card count where SPEC
   * 4.8 names the split. That is 3 card counts x 1 origin of 2 x 1 state of 2 x
   * 1 toggle of 2, which is 3 of the 24. The two-card cell is the one the rule
   * exists for, and it is asserted on its own below.
   */
  it('disagrees with a rule that forgot the split on exactly its own hands', () => {
    function withoutTheSplit(hand: HandInPlay, where: ActionContext): string | null {
      if (!where.rules.surrender) {
        return 'surrender-off';
      }
      if (hand.state !== 'live') {
        return 'hand-resolved';
      }
      if (hand.cards.length !== INITIAL_CARDS) {
        return 'not-two-cards';
      }
      return null;
    }

    const differ = sweep().filter(
      (cell) =>
        surrenderRefusal(cell.hand, cell.context) !== withoutTheSplit(cell.hand, cell.context),
    );
    expect(differ.length).toBe(LENGTHS.length);
    expect(differ.length).toBe(3);
    for (const cell of differ) {
      expect(cell.hand.fromSplit).toBe(true);
      expect(cell.hand.state).toBe('live');
      expect(cell.context.rules.surrender).toBe(true);
      expect(surrenderRefusal(cell.hand, cell.context)).toBe('from-split');
    }

    // The cell the clause exists for: two cards, from a split, and the control
    // would have allowed it. Exactly one of the 24 is that shape.
    const allowed = differ.filter((cell) => withoutTheSplit(cell.hand, cell.context) === null);
    expect(allowed.length).toBe(1);
    expect(allowed[0]?.hand.cards.length).toBe(INITIAL_CARDS);
  });

  it('permits exactly the unsplit, live, two-card hand at a table that offers it', () => {
    const permitted = sweep().filter((cell) => surrenderRefusal(cell.hand, cell.context) === null);
    expect(permitted.length).toBe(1);
    const only = permitted[0];
    expect(only?.hand.fromSplit).toBe(false);
    expect(only?.hand.state).toBe('live');
    expect(only?.hand.cards.length).toBe(INITIAL_CARDS);
    expect(only?.context.rules.surrender).toBe(true);
  });
});
