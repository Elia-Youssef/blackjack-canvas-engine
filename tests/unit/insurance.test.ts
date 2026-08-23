/**
 * Item `B11`, Critical, 15 points: "Insurance is offered only on a dealer Ace
 * before any player action, stakes wager/2, pays 2:1 on a dealer natural, is
 * lost otherwise, and even money behaves identically to insuring a natural.
 * When the balance cannot cover an even-money stake, only min(chips, stake)
 * leaves the balance, deferredStake carries the shortfall, settlement subtracts
 * it, the net is +wager on both branches, and the balance never goes negative."
 * Built at `BJ-8`, SPEC 4.7.
 *
 * **The criterion is the assertion, and it is two sentences with nine clauses.**
 * Offered only on a dealer Ace; before any player action; the stake is half the
 * initial wager; 2:1 on a dealer natural; lost otherwise; even money behaves
 * identically; only `min(chips, stake)` leaves the balance; the shortfall is
 * carried and subtracted at settlement; the net is `+wager` on both branches;
 * and the balance never goes negative. SPEC 4.7 adds the two this file also
 * drives, that an ordinary offer is made "only if chips available >= the stake"
 * and that even money "is offered regardless of balance", because they are what
 * makes the shortfall reachable on one path and unreachable on the other.
 *
 * **Where the shortfall is released, and why it is not where it looks like it
 * belongs.** SPEC 4.7 settles the side wager immediately after the peek and
 * says "settlement credits the insurance result and subtracts deferredStake".
 * Doing both at the peek takes the balance negative: on the branch where the
 * stake is lost the credit is zero, and a balance emptied to fund the stake has
 * nothing to take the shortfall from. So `wallet.ts` releases it at the round
 * boundary, which refuses to run until every hand has settled, and the balance
 * is therefore non-negative after **every single application** rather than only
 * at rest. That is the design `B11` chose over fusing the two, and the control
 * below is the design it rejected: the arithmetic of releasing the shortfall
 * with the side wager is written out and required to go negative on exactly the
 * branch where the stake is lost.
 *
 * **The identity is checked as an identity, not as a number.** SPEC 4.11's
 * `chips + committed + insuranceStake - deferredStake` "is conserved except by a
 * settled outcome", so every scenario below is walked frame by frame and the
 * sum is required to move exactly twice: once when the side wager settles and
 * once when the hand does. Taking the offer moves it by nothing at all, and the
 * release at the boundary moves it by nothing at all, which are the two places
 * a three-term reading would be wrong.
 *
 * **What this file does not claim.** `B7` grades the peek, `B13` and `B14` the
 * ladder and the insurance net as pure arithmetic, `B15` the betting controls
 * and `C2` the phase gate. `H6` at `BJ-12` drives the identity across 50,000
 * rounds. What is here is SPEC 4.7's offer, its stake and where the money went.
 */

import { describe, expect, it } from 'vitest';

import type { Rank } from '../../src/core/cards';
import { RANKS } from '../../src/core/cards';
import type { IntentResult, Table, TableOptions, TableReadout } from '../../src/core/table';
import { createTable } from '../../src/core/table';
import type { InsuranceResult, PhaseKind } from '../../src/core/types';
import type { TableLimits, Wallet } from '../../src/core/wallet';
import { createWallet, tableLimits } from '../../src/core/wallet';

import { scriptedShoe } from './support/stacked-shoe';

// ---------------------------------------------------------------------------
// SPEC 4.7 and 4.11, transcribed
// ---------------------------------------------------------------------------

/** SPEC 4.7: "Stake is `wager / 2`". */
const STAKE_DIVISOR = 2;

/** SPEC 4.7: 2:1, so a dealer natural nets `2 x stake` and credits `3 x stake`. */
const INSURANCE_PAYS = 2;
const NATURAL_CREDIT_MULTIPLE = 3;

/** SPEC 4.11: the starting bankroll and the wager these rounds carry. */
const SPEC_STARTING_CHIPS = 1000;
const ROUND_WAGER = 50;
const STAKE = ROUND_WAGER / STAKE_DIVISOR;

/** SPEC 4.11: a natural pays 3:2. */
const NATURAL_NUMERATOR = 3;
const NATURAL_DENOMINATOR = 2;

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

/**
 * Drive a whole round, answering SPEC 4.7's offer as told, and keep every
 * snapshot the machine passed through.
 *
 * The snapshots are what the identity assertions read: SPEC 4.11 says the
 * conserved quantity moves only by a settled outcome, which is a claim about
 * every moment of the round and not about its two ends.
 */
function walk(table: Table, answer: 'takeInsurance' | 'declineInsurance'): readonly TableReadout[] {
  const seen: TableReadout[] = [table.readout()];
  const turn = bounded('walking one round to the round result');
  while (table.readout().phase.kind !== 'roundResult') {
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
        accept(table.apply({ kind: answer }));
        break;
      case 'playerTurn':
        accept(table.apply({ kind: 'stand' }));
        break;
      default:
        table.update(TICK);
    }
    seen.push(table.readout());
  }
  return seen;
}

/** Drive as far as SPEC 4.7's decision point, which SPEC 4.7 gives no timer. */
function toOffer(table: Table): Table {
  const turn = bounded('driving the machine to the insurance offer');
  while (table.readout().phase.kind !== 'insurance') {
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
      default:
        table.update(TICK);
    }
  }
  return table;
}

/** A wallet drained to a chosen balance through SPEC 4.11's own controls. */
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

function tableWith(script: readonly Rank[], options: TableOptions = {}): Table {
  return createTable({ shoe: scriptedShoe(script), ...options });
}

/**
 * The four rounds SPEC 4.7's offer can produce, written in SPEC 4.3's deal
 * order: player, dealer up, player, dealer down.
 *
 * The player's hand is 9 and 7 for a hard 16 where the offer is ordinary, and
 * an Ace and a ten where it is even money, because SPEC 4.7 offers even money
 * on "a player natural against a dealer Ace" and on nothing else. The dealer's
 * hole card is a ten where the peek is to find a natural and a nine where it is
 * not; a nine leaves the dealer on a soft 20, which SPEC 4.9 stands on, so no
 * further card is drawn and the round is fully determined by these four.
 */
const ORDINARY_NATURAL: readonly Rank[] = ['9', 'A', '7', '10'];
const ORDINARY_NO_NATURAL: readonly Rank[] = ['9', 'A', '7', '9'];
const EVEN_MONEY_NATURAL: readonly Rank[] = ['A', 'A', '10', '10'];
const EVEN_MONEY_NO_NATURAL: readonly Rank[] = ['A', 'A', '10', '9'];

/** SPEC 12's insurance result, or `null` when no stake was taken. */
function insuranceOf(table: Table): InsuranceResult | null {
  const { phase } = table.readout();
  if (phase.kind !== 'roundResult') {
    throw new Error(`the round has not finished; the phase is ${phase.kind}`);
  }
  return phase.result.insurance;
}

/** The credit SPEC 12's round result recorded for the one player hand. */
function handCredit(table: Table): number {
  const { phase } = table.readout();
  if (phase.kind !== 'roundResult') {
    throw new Error(`the round has not finished; the phase is ${phase.kind}`);
  }
  return phase.result.hands[0]?.credit ?? Number.NaN;
}

/**
 * Every moment at which SPEC 4.11's conserved quantity moved, and by how much.
 *
 * A list rather than a total, because "moves only by a settled outcome" is a
 * claim about when as well as by how much: a round that moved the identity at
 * the offer and moved it back at the settlement would have the right total.
 *
 * Each movement is labelled with the phase whose step **performed** it, which
 * is the phase the machine was in before the frame rather than after it. SPEC
 * 10's timed steps transition as they finish, so the side wager settles inside
 * `peek` and hands on in the same step, and the hand settles inside `settling`
 * and hands on to the round result. Labelling by the phase that followed would
 * name the screen the player is looking at rather than the step that moved the
 * money.
 */
function movements(seen: readonly TableReadout[]): readonly { phase: PhaseKind; by: number }[] {
  const moves: { phase: PhaseKind; by: number }[] = [];
  for (let index = 1; index < seen.length; index += 1) {
    const previous = seen[index - 1];
    const before = previous?.wallet.conserved ?? 0;
    const after = seen[index]?.wallet.conserved ?? 0;
    if (after !== before) {
      moves.push({ phase: previous?.phase.kind ?? 'start', by: after - before });
    }
  }
  return moves;
}

/** The four-term identity, recomputed from the four terms it is made of. */
function identityHolds(seen: readonly TableReadout[]): boolean {
  return seen.every(
    (state) =>
      state.wallet.conserved ===
      state.wallet.chips +
        state.wallet.committed +
        state.wallet.insuranceStake -
        state.wallet.deferredStake,
  );
}

// ---------------------------------------------------------------------------
// SPEC 4.7: offered only on a dealer Ace, before the player acts
// ---------------------------------------------------------------------------

describe('B11: the offer is made on a dealer Ace and on nothing else', () => {
  it('reaches SPEC 10 insurance on exactly one of the thirteen up cards', () => {
    let offered = 0;
    for (const up of RANKS) {
      // The player holds 9 and 7 so no hand is finished before the branch, and
      // the hole card is a 7 so no up card can make a natural behind it.
      const table = tableWith(['9', up, '7', '7', '10', '10']);
      const seen = walk(table, 'declineInsurance').map((state) => state.phase.kind);
      if (seen.includes('insurance')) {
        offered += 1;
        expect(up).toBe('A');
      }
    }
    expect(offered).toBe(1);
    expect(RANKS.filter((rank) => rank === 'A').length).toBe(offered);
  });

  it('refuses the answer on every screen SPEC 10 does not offer it on', () => {
    const table = tableWith(ORDINARY_NO_NATURAL);
    // Before the deal.
    for (const kind of ['takeInsurance', 'declineInsurance'] as const) {
      const early = table.apply({ kind });
      expect(early.ok).toBe(false);
      if (!early.ok) {
        expect(early.layer).toBe('phase');
      }
    }
    // And after it: once the peek has been applied the offer is closed, which
    // is SPEC 4.4's ordering and is what stops it resolving after the only
    // branch it can win on.
    accept(table.apply({ kind: 'start' }));
    accept(table.apply({ kind: 'tapChip', chip: ROUND_WAGER }));
    accept(table.apply({ kind: 'deal' }));
    const turn = bounded('driving past the offer');
    while (table.readout().phase.kind !== 'playerTurn') {
      turn();
      if (table.readout().phase.kind === 'insurance') {
        accept(table.apply({ kind: 'declineInsurance' }));
        continue;
      }
      table.update(TICK);
    }
    const late = table.apply({ kind: 'takeInsurance' });
    expect(late.ok).toBe(false);
    if (!late.ok) {
      expect(late.layer).toBe('phase');
      expect(late.reason).toBe('wrong-phase');
    }
  });

  it('makes the offer before any player action, on the initial two cards', () => {
    const table = toOffer(tableWith(ORDINARY_NO_NATURAL));
    const state = table.readout();
    expect(state.phase.kind).toBe('insurance');
    // SPEC 4.4: "The player holds exactly one hand carrying exactly the initial
    // wager, because the peek precedes split, double and surrender."
    expect(state.hands.length).toBe(1);
    expect(state.hands[0]?.cards.length).toBe(2);
    expect(state.hands[0]?.wager).toBe(ROUND_WAGER);
    expect(state.hands[0]?.state).toBe('live');
    expect(state.splits).toBe(0);
    // And the hole card is still down, so the offer is made blind.
    expect(state.dealerConcealed).toBe(1);
    expect(state.dealerVisible.map((card) => card.rank)).toEqual(['A']);
    // SPEC 4.7: "The decision point has no timer."
    for (let frame = 0; frame < 40; frame += 1) {
      table.update(TICK);
    }
    expect(table.readout()).toEqual(state);
  });

  it('stakes half the initial wager, and half of nothing else', () => {
    let checked = 0;
    for (const wager of [10, 50, 100] as const) {
      const table = tableWith(ORDINARY_NO_NATURAL);
      accept(table.apply({ kind: 'start' }));
      accept(table.apply({ kind: 'tapChip', chip: wager }));
      accept(table.apply({ kind: 'deal' }));
      const turn = bounded('driving to the offer');
      while (table.readout().phase.kind !== 'insurance') {
        turn();
        table.update(TICK);
      }
      const { phase } = table.readout();
      if (phase.kind === 'insurance') {
        expect(phase.offer.stake).toBe(wager / STAKE_DIVISOR);
        // SPEC 4.11's 10-chip grid is what makes every one of these an integer.
        expect(Number.isInteger(phase.offer.stake)).toBe(true);
      }
      checked += 1;
    }
    expect(checked).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.7: 2:1 on a dealer natural, lost otherwise
// ---------------------------------------------------------------------------

describe('B11: the side wager pays 2:1 on a dealer natural and is lost otherwise', () => {
  it('credits three times the stake when the peek finds a natural', () => {
    const table = tableWith(ORDINARY_NATURAL);
    const seen = walk(table, 'takeInsurance');
    const insurance = insuranceOf(table);

    expect(insurance?.stake).toBe(STAKE);
    expect(insurance?.net).toBe(INSURANCE_PAYS * STAKE);
    expect(insurance?.credit).toBe(NATURAL_CREDIT_MULTIPLE * STAKE);
    expect(insurance?.deferred).toBe(0);
    expect(insurance?.evenMoney).toBe(false);

    // The hand loses the whole wager to the dealer's natural, rung 4, so the
    // round comes out level: `-wager` on the hand and `+2 x stake` beside it.
    expect(handCredit(table)).toBe(0);
    expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS);

    // The identity moved twice and by exactly the two nets.
    expect(identityHolds(seen)).toBe(true);
    expect(movements(seen)).toEqual([
      { phase: 'peek', by: INSURANCE_PAYS * STAKE },
      { phase: 'settling', by: -ROUND_WAGER },
    ]);
  });

  it('loses the stake when the peek finds none, and resolves it there', () => {
    const table = tableWith(ORDINARY_NO_NATURAL);
    const seen = walk(table, 'takeInsurance');

    const atOffer = seen.find((state) => state.phase.kind === 'insurance');
    const atPeek = seen.find((state) => state.phase.kind === 'peek');
    // SPEC 4.7: "Resolved immediately after the peek." The stake is open at the
    // offer and gone by the time the peek hands on.
    expect(atOffer?.wallet.insuranceStake).toBe(0);
    expect(atPeek?.wallet.insuranceStake).toBe(STAKE);
    const afterPeek = seen.find((state) => state.phase.kind === 'playerTurn');
    expect(afterPeek?.wallet.insuranceStake).toBe(0);

    const insurance = insuranceOf(table);
    expect(insurance?.net).toBe(-STAKE);
    expect(insurance?.credit).toBe(0);
    // 1,000 less the 50 the hand lost and the 25 the stake lost.
    expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS - ROUND_WAGER - STAKE);
    expect(identityHolds(seen)).toBe(true);
    expect(movements(seen)).toEqual([
      { phase: 'peek', by: -STAKE },
      { phase: 'settling', by: -ROUND_WAGER },
    ]);
  });

  it('takes nothing and records nothing when the offer is declined', () => {
    const table = tableWith(ORDINARY_NATURAL);
    const seen = walk(table, 'declineInsurance');
    expect(insuranceOf(table)).toBeNull();
    for (const state of seen) {
      expect(state.wallet.insuranceStake).toBe(0);
      expect(state.wallet.deferredStake).toBe(0);
    }
    // The hand alone: a dealer natural against a hard 16 is rung 4.
    expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS - ROUND_WAGER);
    expect(movements(seen)).toEqual([{ phase: 'settling', by: -ROUND_WAGER }]);
  });

  it('is offered only when the balance covers the stake, on the ordinary path', () => {
    // 60 chips, 50 wagered, 10 left against a stake of 25.
    const table = toOffer(tableWith(ORDINARY_NO_NATURAL, { wallet: walletAt(60) }));
    const before = table.readout();
    expect(before.wallet.chips).toBe(10);
    const { phase } = before;
    expect(phase.kind).toBe('insurance');
    if (phase.kind === 'insurance') {
      expect(phase.offer.stake).toBe(STAKE);
      // Not even money: the player holds 16 and not a natural.
      expect(phase.offer.evenMoney).toBe(false);
    }

    const result = table.apply({ kind: 'takeInsurance' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.layer).toBe('availability');
      expect(result.reason).toBe('insufficient-chips');
    }
    // A refusal changes nothing, and the offer is still open to decline.
    expect(table.readout()).toEqual(before);
    accept(table.apply({ kind: 'declineInsurance' }));
    expect(table.readout().phase.kind).toBe('peek');
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.7: even money, funded
// ---------------------------------------------------------------------------

describe('B11: even money is an insurance stake, and nets the wager either way', () => {
  it('offers it on a player natural against a dealer Ace, and not otherwise', () => {
    const evenMoney = toOffer(tableWith(EVEN_MONEY_NO_NATURAL));
    const offered = evenMoney.readout().phase;
    expect(offered.kind).toBe('insurance');
    if (offered.kind === 'insurance') {
      expect(offered.offer.evenMoney).toBe(true);
      expect(offered.offer.stake).toBe(STAKE);
    }

    const ordinary = toOffer(tableWith(ORDINARY_NO_NATURAL));
    const plain = ordinary.readout().phase;
    if (plain.kind === 'insurance') {
      expect(plain.offer.evenMoney).toBe(false);
    }

    // SPEC 4.7's house-rule toggle, default on. Off, the same natural is
    // offered insurance on the ordinary terms instead.
    const off = toOffer(tableWith(EVEN_MONEY_NO_NATURAL, { rules: { evenMoney: false } }));
    const withoutIt = off.readout().phase;
    expect(off.readout().rules.evenMoney).toBe(false);
    if (withoutIt.kind === 'insurance') {
      expect(withoutIt.offer.evenMoney).toBe(false);
      expect(withoutIt.offer.stake).toBe(STAKE);
    }
  });

  it('nets the wager on the dealer natural branch, through rung 2', () => {
    const table = tableWith(EVEN_MONEY_NATURAL);
    const seen = walk(table, 'takeInsurance');
    const insurance = insuranceOf(table);

    expect(insurance?.evenMoney).toBe(true);
    expect(insurance?.stake).toBe(STAKE);
    expect(insurance?.net).toBe(INSURANCE_PAYS * STAKE);
    expect(insurance?.deferred).toBe(0);
    // SPEC 4.7: "pushing at rung 2 against a dealer natural".
    expect(handCredit(table)).toBe(ROUND_WAGER);
    // +wager, which is `2 x stake` and `2 x (wager / 2)`.
    expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS + ROUND_WAGER);
    expect(identityHolds(seen)).toBe(true);
    // The hand pushes at rung 2, so the settlement moves the identity by
    // nothing at all and there is one movement in the round rather than two.
    expect(movements(seen)).toEqual([{ phase: 'peek', by: ROUND_WAGER }]);
  });

  it('nets the wager on the other branch too, through rung 3 at 3:2', () => {
    const table = tableWith(EVEN_MONEY_NO_NATURAL);
    const seen = walk(table, 'takeInsurance');
    const insurance = insuranceOf(table);

    expect(insurance?.net).toBe(-STAKE);
    expect(insurance?.credit).toBe(0);
    // SPEC 4.7: "paying 3:2 at rung 3 otherwise".
    expect(handCredit(table)).toBe(
      ROUND_WAGER + (ROUND_WAGER * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR,
    );
    // `-stake` on the side wager and `+wager x 3 / 2` on the hand is `+wager`.
    expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS + ROUND_WAGER);
    expect(identityHolds(seen)).toBe(true);
    expect(movements(seen)).toEqual([
      { phase: 'peek', by: -STAKE },
      { phase: 'settling', by: (ROUND_WAGER * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR },
    ]);
  });

  /**
   * "Even money behaves identically to insuring a natural", which is SPEC 4.7's
   * whole design: it is not a payout, it is an automatic stake settled through
   * the ordinary path. Modelling it as a payout pays the player twice, so the
   * assertion is that the hand is still in the round and still settles.
   */
  it('leaves the hand in the round rather than paying it out at the offer', () => {
    const table = tableWith(EVEN_MONEY_NO_NATURAL);
    const seen = walk(table, 'takeInsurance');
    // The hand settled through SPEC 4.10's ladder, at a rung, like any other.
    const { phase } = table.readout();
    expect(phase.kind).toBe('roundResult');
    if (phase.kind === 'roundResult') {
      expect(phase.result.hands.length).toBe(1);
      expect(phase.result.hands[0]?.rung).toBe(3);
      expect(phase.result.hands[0]?.outcome).toBe('BLACKJACK');
    }
    // And the balance moved once at the peek and once at the settlement, never
    // at the offer: a payout at the offer would be a third movement.
    expect(movements(seen).length).toBe(2);
    const atOffer = seen.filter((state) => state.phase.kind === 'insurance');
    expect(atOffer.length).toBeGreaterThan(0);
    for (const state of atOffer) {
      expect(state.wallet.conserved).toBe(SPEC_STARTING_CHIPS);
    }
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.7: the deferred even-money stake
// ---------------------------------------------------------------------------

describe('B11: an even-money stake the balance cannot cover is deferred, not waived', () => {
  /** 60 chips: 50 leaves at the deal and 10 is left against a stake of 25. */
  const SHORT_BALANCE = 60;
  const FUNDED = 10;
  const SHORTFALL = STAKE - FUNDED;

  function shortRound(script: readonly Rank[]): Table {
    return tableWith(script, { wallet: walletAt(SHORT_BALANCE) });
  }

  it('is offered regardless of balance, unlike the ordinary stake', () => {
    const table = toOffer(shortRound(EVEN_MONEY_NO_NATURAL));
    const { phase } = table.readout();
    expect(table.readout().wallet.chips).toBe(FUNDED);
    expect(phase.kind).toBe('insurance');
    if (phase.kind === 'insurance') {
      expect(phase.offer.evenMoney).toBe(true);
      expect(phase.offer.stake).toBe(STAKE);
      expect(phase.offer.stake).toBeGreaterThan(table.readout().wallet.chips);
    }
    // SPEC 4.7: "It is offered regardless of balance." The same shortfall on the
    // ordinary path is refused, which is the sentence above it in that section.
    accept(table.apply({ kind: 'takeInsurance' }));
  });

  it('takes only min(chips, stake) out of the balance and carries the rest', () => {
    const table = toOffer(shortRound(EVEN_MONEY_NO_NATURAL));
    const before = table.readout().wallet;
    accept(table.apply({ kind: 'takeInsurance' }));
    const after = table.readout().wallet;

    expect(after.chips).toBe(0);
    expect(before.chips - after.chips).toBe(FUNDED);
    expect(FUNDED).toBe(Math.min(before.chips, STAKE));
    expect(after.insuranceStake).toBe(STAKE);
    expect(after.deferredStake).toBe(SHORTFALL);
    expect(after.deferredStake).toBe(STAKE - Math.min(before.chips, STAKE));
    // SPEC 4.7: "which the offer leaves unchanged". The identity does not move.
    expect(after.conserved).toBe(before.conserved);
    expect(after.conserved).toBe(SHORT_BALANCE);
  });

  it('nets the wager on the dealer natural branch, with the balance never negative', () => {
    const table = shortRound(EVEN_MONEY_NATURAL);
    const seen = walk(table, 'takeInsurance');

    for (const state of seen) {
      expect(state.wallet.chips, `negative at ${state.phase.kind}`).toBeGreaterThanOrEqual(0);
    }
    expect(identityHolds(seen)).toBe(true);
    expect(insuranceOf(table)?.deferred).toBe(SHORTFALL);
    expect(insuranceOf(table)?.net).toBe(INSURANCE_PAYS * STAKE);
    // +wager, from 60 to 110.
    expect(table.readout().wallet.chips).toBe(SHORT_BALANCE + ROUND_WAGER);
    expect(table.readout().wallet.deferredStake).toBe(0);
    expect(table.readout().wallet.conserved).toBe(SHORT_BALANCE + ROUND_WAGER);
    expect(movements(seen)).toEqual([{ phase: 'peek', by: ROUND_WAGER }]);
  });

  it('nets the wager on the other branch too, with the balance never negative', () => {
    const table = shortRound(EVEN_MONEY_NO_NATURAL);
    const seen = walk(table, 'takeInsurance');

    for (const state of seen) {
      expect(state.wallet.chips, `negative at ${state.phase.kind}`).toBeGreaterThanOrEqual(0);
    }
    expect(identityHolds(seen)).toBe(true);
    expect(insuranceOf(table)?.deferred).toBe(SHORTFALL);
    expect(insuranceOf(table)?.net).toBe(-STAKE);
    expect(table.readout().wallet.chips).toBe(SHORT_BALANCE + ROUND_WAGER);
    expect(table.readout().wallet.deferredStake).toBe(0);
    expect(movements(seen)).toEqual([
      { phase: 'peek', by: -STAKE },
      { phase: 'settling', by: (ROUND_WAGER * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR },
    ]);
  });

  /**
   * "Settlement subtracts it", and the release is not itself an outcome.
   *
   * `chips` falls by the shortfall and `deferredStake` falls to zero, and the
   * identity subtracts that term, so the sum does not move. A round that
   * treated the release as a loss would show a third movement; one that waived
   * the shortfall would leave the player the balance twice over.
   */
  it('releases the shortfall at the boundary without moving the identity', () => {
    const table = shortRound(EVEN_MONEY_NO_NATURAL);
    const seen = walk(table, 'takeInsurance');

    const outstanding = seen.filter((state) => state.wallet.deferredStake > 0);
    const released = seen.filter((state) => state.wallet.deferredStake === 0);
    expect(outstanding.length).toBeGreaterThan(0);
    expect(released.length).toBeGreaterThan(0);
    // It is outstanding from the offer to the boundary and gone after it.
    for (const state of outstanding) {
      expect(state.wallet.deferredStake).toBe(SHORTFALL);
      expect(['insurance', 'peek', 'playerTurn', 'reveal', 'dealerTurn', 'settling']).toContain(
        state.phase.kind,
      );
    }
    // The whole shortfall, and not a chip more: the player paid 10 of the 25
    // and settlement took the other 15.
    const last = seen[seen.length - 1];
    const beforeRelease = seen.find((state) => state.phase.kind === 'settling');
    expect(beforeRelease?.wallet.deferredStake).toBe(SHORTFALL);
    expect(last?.wallet.deferredStake).toBe(0);
    // Two movements and no third: the release is accounting, not an outcome.
    expect(movements(seen).length).toBe(2);
  });

  /**
   * The negative control, and it is the design `B11` rejected.
   *
   * Releasing the shortfall with the side wager instead of at the round
   * boundary is the obvious reading of "settlement subtracts it", and it takes
   * the balance below zero on exactly the branch where the stake is lost: the
   * credit there is zero, and a balance emptied to fund the stake has nothing
   * for the shortfall to come out of. The arithmetic is written out rather than
   * built, because what is being rejected is an ordering and not a number.
   */
  it('disagrees with releasing the shortfall at the peek, on exactly the losing branch', () => {
    /** What the balance would be, released with the side wager. */
    function releasedAtThePeek(dealerNatural: boolean): number {
      const funded = Math.min(FUNDED, STAKE);
      const balanceAfterStake = FUNDED - funded;
      const insuranceCredit = dealerNatural ? NATURAL_CREDIT_MULTIPLE * STAKE : 0;
      return balanceAfterStake + insuranceCredit - (STAKE - funded);
    }

    const branches = [true, false] as const;
    const negative = branches.filter((dealerNatural) => releasedAtThePeek(dealerNatural) < 0);
    expect(negative.length).toBe(1);
    expect(negative[0]).toBe(false);
    expect(releasedAtThePeek(false)).toBe(-SHORTFALL);
    expect(releasedAtThePeek(true)).toBe(NATURAL_CREDIT_MULTIPLE * STAKE - SHORTFALL);

    // And the machine, on that same branch, never goes below zero.
    let lowest = Number.POSITIVE_INFINITY;
    for (const state of walk(shortRound(EVEN_MONEY_NO_NATURAL), 'takeInsurance')) {
      lowest = Math.min(lowest, state.wallet.chips);
    }
    expect(lowest).toBe(0);
    expect(lowest).toBeGreaterThanOrEqual(0);
  });

  /**
   * The other misreading SPEC 4.7 names: "Treating the deferral as a waived
   * stake would credit the player the shortfall twice."
   *
   * A waived stake never records the shortfall, so nothing is subtracted and
   * the player ends the round 15 chips up on both branches. The two readings
   * differ by exactly the shortfall, every time.
   */
  it('disagrees with a waived shortfall by exactly the shortfall, on both branches', () => {
    let compared = 0;
    for (const script of [EVEN_MONEY_NATURAL, EVEN_MONEY_NO_NATURAL]) {
      const table = shortRound(script);
      walk(table, 'takeInsurance');
      const actual = table.readout().wallet.chips;
      // Waived: the same round with the release never applied.
      const waived = actual + SHORTFALL;
      expect(actual).toBe(SHORT_BALANCE + ROUND_WAGER);
      expect(waived - actual).toBe(SHORTFALL);
      expect(waived).not.toBe(SHORT_BALANCE + ROUND_WAGER);
      compared += 1;
    }
    expect(compared).toBe(2);
  });
});
