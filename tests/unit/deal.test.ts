/**
 * Item `B6`, Critical, 9 points: "The opening deal is exactly two face-up
 * player cards and one face-up plus one face-down dealer card, in the order
 * player, dealer up, player, dealer down." Built at `BJ-8`, SPEC 4.3.
 *
 * **The criterion is the assertion, and it has four clauses.** Two player
 * cards; one face-up dealer card and one face-down; that order; and "exactly",
 * which is a claim about a count and not only about a sequence. Each one is
 * driven below against the real machine, dealing from a real shoe, and each one
 * is written out from SPEC 4.3 rather than imported from the module under test.
 *
 * **How face-down is observed, and why it is observed rather than read.** The
 * machine holds the dealer's whole hand, because `shouldHit`, the peek and SPEC
 * 4.10's ladder all need it, and publishes only the cards the player may see:
 * `dealerVisible` and a count of how many are not in it. That is `B6`'s chosen
 * representation and it is the same stance `dealer.ts` takes on the peek's
 * result, that a caller cannot leak what it was never handed. So the face-down
 * clause is tested twice: the count says one card is down, and a separate test
 * records every snapshot of a whole round and requires the object that turns
 * out to be the hole card to appear in none of them before the reveal.
 *
 * **Exactly one card in this game is ever face down**, which is why the model
 * derives concealment from the phase instead of carrying a flag per card. A
 * per-card flag would read the same on every card in every reachable state but
 * one. The tests below therefore also drive the two moments the card turns
 * over, SPEC 10's `reveal` and the peek's dealer-natural arm, because a
 * derivation that never flipped would satisfy the count and hide the card
 * forever.
 *
 * **Two negative controls, each required to disagree on a derived set.** A deal
 * that gave the player both cards first has to disagree on exactly the two
 * middle positions of the four, and a deal that dealt the hole card face up has
 * to disagree at exactly the four moments SPEC 4.3 keeps it down. Same device
 * as the shoe's two broken shuffles and the settlement ladder's three
 * reorderings: the control is what makes the claim falsifiable.
 *
 * **What this file does not claim.** The shoe's composition, its uniform
 * shuffle and its cut card are items `B2` and `B3`. The peek itself is `B7`,
 * the dealer's policy `B8`, and the phase order `C2` and `C1`. What is here is
 * the four cards of SPEC 4.3 and where each one went.
 */

import { describe, expect, it } from 'vitest';

import type { Card, Rank } from '../../src/core/cards';
import { RANKS } from '../../src/core/cards';
import type { Table, TableReadout } from '../../src/core/table';
import { OPENING_DEAL, TIMINGS, createTable } from '../../src/core/table';
import type { PhaseKind } from '../../src/core/types';

import { scriptedShoe } from './support/stacked-shoe';

// ---------------------------------------------------------------------------
// SPEC 4.3, transcribed. Nothing below is imported from the module under test.
// ---------------------------------------------------------------------------

/**
 * SPEC 4.3: "Two face-up cards to the player, one face-up and one face-down to
 * the dealer, in the order player, dealer up, player, dealer down."
 *
 * Written as who receives each of the four cards, in order, because that is the
 * half of the sentence a count of cards can see. Which of the dealer's two is
 * face down is the other half and is asserted separately.
 */
const DEAL_ORDER: readonly ('player' | 'dealer')[] = ['player', 'dealer', 'player', 'dealer'];

/** SPEC 4.3: two to the player, two to the dealer, and no more. */
const PLAYER_CARDS = 2;
const DEALER_CARDS = 2;

/** SPEC 4.3: the dealer's second card, and the only card in the game face down. */
const CONCEALED = 1;

/** SPEC 4.3: "The hole card stays concealed until the player's turn ends." */
const CONCEALED_PHASES: readonly PhaseKind[] = ['dealing', 'peek', 'insurance', 'playerTurn'];

/** SPEC 4.11's chip and the wager every round in this file carries. */
const ROUND_WAGER = 50;

/** SPEC 5: one deal interval pays for exactly one card. */
const ONE_CARD = TIMINGS.dealInterval;

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
// Driving the machine, through SPEC 10's controls and nothing else
// ---------------------------------------------------------------------------

function accept(table: Table, intent: Parameters<Table['apply']>[0]): void {
  const result = table.apply(intent);
  if (!result.ok) {
    throw new Error(`${intent.kind} was refused by ${result.layer} as ${result.reason}`);
  }
}

/** Start, wager and Deal, so the machine is sitting at the top of the queue. */
function toDealing(table: Table): Table {
  accept(table, { kind: 'start' });
  accept(table, { kind: 'tapChip', chip: ROUND_WAGER });
  accept(table, { kind: 'deal' });
  return table;
}

/** Pay for exactly one card of SPEC 4.3's deal. */
function oneCard(table: Table): TableReadout {
  table.update(ONE_CARD);
  return table.readout();
}

/** How many cards the dealer holds, face up and face down together. */
function dealerHeld(state: TableReadout): number {
  return state.dealerVisible.length + state.dealerConcealed;
}

/** How many cards the player's single hand holds. */
function playerHeld(state: TableReadout): number {
  return state.hands[0]?.cards.length ?? 0;
}

/**
 * A round whose up card is chosen, so the branch after the deal is chosen.
 *
 * The player holds 9 and 7 for a hard 16, which is live and is neither 21 nor a
 * natural, so no branch is skipped by the hand being finished. The hole card is
 * a 7, which can make no natural behind any up card. The tens carry the dealer
 * to the end of its turn whatever the up card left it on.
 */
function roundShowing(up: Rank): Table {
  return createTable({ shoe: scriptedShoe(['9', up, '7', '7', '10', '10']) });
}

/** Every card the readout publishes, player side and dealer side together. */
function published(state: TableReadout): readonly Card[] {
  return [...state.hands.flatMap((hand) => [...hand.cards]), ...state.dealerVisible];
}

/** Drive a whole round, keeping every snapshot it passed through. */
function transcript(table: Table): readonly TableReadout[] {
  const seen: TableReadout[] = [table.readout()];
  const turn = bounded('driving one round to the round result');
  while (table.readout().phase.kind !== 'roundResult') {
    turn();
    const state = table.readout();
    switch (state.phase.kind) {
      case 'start':
        accept(table, { kind: 'start' });
        break;
      case 'betting':
        accept(
          table,
          state.wallet.wager === 0
            ? { kind: 'tapChip', chip: ROUND_WAGER }
            : { kind: 'deal' },
        );
        break;
      case 'insurance':
        accept(table, { kind: 'declineInsurance' });
        break;
      case 'playerTurn':
        accept(table, { kind: 'stand' });
        break;
      default:
        table.update(ONE_CARD);
    }
    seen.push(table.readout());
  }
  return seen;
}

// ---------------------------------------------------------------------------
// SPEC 4.3, clause by clause
// ---------------------------------------------------------------------------

describe('B6: the opening deal is four cards, in SPEC 4.3 order', () => {
  it('queues exactly four steps, two to the player and two to the dealer', () => {
    const table = toDealing(createTable({ seed: 7 }));
    const { phase } = table.readout();
    expect(phase.kind).toBe('dealing');
    if (phase.kind === 'dealing') {
      expect([...phase.queue]).toEqual(['playerCard', 'dealerUp', 'playerCard', 'dealerHole']);
    }
    // Derived from SPEC 4.3's sentence rather than counted off the queue.
    expect(OPENING_DEAL.length).toBe(DEAL_ORDER.length);
    expect(OPENING_DEAL.length).toBe(PLAYER_CARDS + DEALER_CARDS);
    expect(OPENING_DEAL.length).toBe(4);
    expect(OPENING_DEAL.filter((step) => step === 'playerCard').length).toBe(PLAYER_CARDS);
    expect(OPENING_DEAL.filter((step) => step !== 'playerCard').length).toBe(DEALER_CARDS);
  });

  /**
   * The order, one card at a time, read off who is holding what after each.
   *
   * SPEC 5 pays for one card per deal interval, so four intervals is four
   * cards, and the readout after each says where that card went. Nothing here
   * reads the deal queue: the claim is about cards arriving, not about a plan
   * to deal them.
   */
  it('deals player, dealer, player, dealer, one card at a time', () => {
    const table = toDealing(createTable({ seed: 11 }));
    const before = table.readout();
    expect(playerHeld(before)).toBe(0);
    expect(dealerHeld(before)).toBe(0);

    const received: ('player' | 'dealer')[] = [];
    let player = 0;
    let dealer = 0;
    for (let step = 0; step < DEAL_ORDER.length; step += 1) {
      const state = oneCard(table);
      const grewPlayer = playerHeld(state) - player;
      const grewDealer = dealerHeld(state) - dealer;
      // Exactly one card arrived, and it went to exactly one of them.
      expect(grewPlayer + grewDealer, `step ${String(step + 1)}`).toBe(1);
      received.push(grewPlayer === 1 ? 'player' : 'dealer');
      player = playerHeld(state);
      dealer = dealerHeld(state);
    }

    expect(received).toEqual([...DEAL_ORDER]);
    expect(player).toBe(PLAYER_CARDS);
    expect(dealer).toBe(DEALER_CARDS);
  });

  /**
   * "Exactly", which is the clause a sequence assertion cannot see: a deal that
   * dealt a fifth card in the right order would still read `player, dealer,
   * player, dealer` at the first four.
   */
  it('stops at exactly four, and takes exactly four cards out of the shoe', () => {
    const table = toDealing(createTable({ seed: 13 }));
    const before = table.readout().shoe;
    expect(before.inPlay).toBe(0);

    for (let step = 0; step < DEAL_ORDER.length; step += 1) {
      oneCard(table);
    }
    const dealt = table.readout();
    expect(dealt.phase.kind).not.toBe('dealing');
    expect(playerHeld(dealt)).toBe(PLAYER_CARDS);
    expect(dealerHeld(dealt)).toBe(DEALER_CARDS);

    // The cards are the shoe's, so the shoe is four lighter and holds four in
    // play. A deal that invented cards would leave both numbers alone.
    expect(dealt.shoe.remaining).toBe(before.remaining - OPENING_DEAL.length);
    expect(dealt.shoe.dealt).toBe(before.dealt + OPENING_DEAL.length);
    expect(dealt.shoe.inPlay).toBe(OPENING_DEAL.length);

    // And no further card arrives on the screen the deal handed to, however
    // many frames go by, because SPEC 10 gives that screen no timer.
    for (let frame = 0; frame < 20; frame += 1) {
      table.update(ONE_CARD);
    }
    expect(playerHeld(table.readout())).toBe(PLAYER_CARDS);
    expect(dealerHeld(table.readout())).toBe(DEALER_CARDS);
  });

  /**
   * The control for the order above, and it is not idle.
   *
   * A deal that gave the player both cards before the dealer either would pass
   * every assertion about counts and every assertion about the total. It
   * differs from SPEC 4.3 at exactly the two middle positions, which is derived
   * here rather than counted off a run.
   */
  it('disagrees with a deal that gave the player both cards first, on exactly 2 positions', () => {
    const bothFirst: readonly ('player' | 'dealer')[] = ['player', 'player', 'dealer', 'dealer'];
    const differ = DEAL_ORDER.filter((who, index) => who !== bothFirst[index]);
    expect(differ.length).toBe(2);
    expect(DEAL_ORDER[1]).toBe('dealer');
    expect(bothFirst[1]).toBe('player');
    expect(DEAL_ORDER[2]).toBe('player');
    expect(bothFirst[2]).toBe('dealer');

    // And the machine really is on SPEC 4.3's side of that disagreement.
    const table = toDealing(createTable({ seed: 17 }));
    oneCard(table);
    expect(playerHeld(table.readout())).toBe(1);
    expect(dealerHeld(table.readout())).toBe(0);
    oneCard(table);
    expect(playerHeld(table.readout())).toBe(1);
    expect(dealerHeld(table.readout())).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// One face up and one face down, and which one is which
// ---------------------------------------------------------------------------

describe('B6: one dealer card face up, one face down, in that order', () => {
  it('shows the dealer first card and conceals the second', () => {
    const table = toDealing(createTable({ seed: 23 }));
    oneCard(table);
    oneCard(table);

    // Two cards dealt: the dealer holds one and it is face up, which is what
    // makes the second the hole card rather than the first.
    const upOnly = table.readout();
    expect(dealerHeld(upOnly)).toBe(1);
    expect(upOnly.dealerVisible.length).toBe(1);
    expect(upOnly.dealerConcealed).toBe(0);
    const upCard = upOnly.dealerVisible[0];
    expect(upCard).toBeDefined();

    oneCard(table);
    oneCard(table);
    const dealt = table.readout();
    expect(dealerHeld(dealt)).toBe(DEALER_CARDS);
    expect(dealt.dealerConcealed).toBe(CONCEALED);
    expect(dealt.dealerVisible.length).toBe(DEALER_CARDS - CONCEALED);
    // The same card is still the one showing: the second card went underneath.
    expect(dealt.dealerVisible[0]).toBe(upCard);
  });

  it('shows both of the player cards, because SPEC 4.3 deals neither face down', () => {
    const table = toDealing(createTable({ seed: 29 }));
    for (let step = 0; step < DEAL_ORDER.length; step += 1) {
      oneCard(table);
    }
    const hand = table.readout().hands[0];
    expect(hand?.cards.length).toBe(PLAYER_CARDS);
    // The readout conceals dealer cards and only dealer cards. A count of one
    // face-down card in the whole game is the model this item chose, and this
    // is the half of it that says the player's side carries none.
    expect(table.readout().dealerConcealed).toBe(CONCEALED);
    expect(published(table.readout()).length).toBe(PLAYER_CARDS + DEALER_CARDS - CONCEALED);
  });

  /**
   * The leak test, which is the one a count cannot make.
   *
   * A machine could report one concealed card and publish it anyway. So a whole
   * round is driven with every snapshot kept, the hole card is identified after
   * the reveal has turned it over, and it is required to appear in none of the
   * snapshots taken before then. The comparison is by object identity, because
   * a six-deck shoe holds six of every card and a player hand may legitimately
   * hold one equal to it: what must not have escaped is *that* card.
   */
  it('never publishes the hole card while SPEC 4.3 keeps it concealed', () => {
    const table = createTable({ seed: 31 });
    const seen = transcript(table);

    const revealed = seen.find((state) => state.phase.kind === 'reveal');
    expect(revealed, 'the round reached SPEC 10 reveal').toBeDefined();
    const holeCard = revealed?.dealerVisible[1];
    expect(holeCard, 'the hole card is face up from the reveal onward').toBeDefined();
    expect(revealed?.dealerConcealed).toBe(0);

    let checked = 0;
    for (const state of seen) {
      if (!CONCEALED_PHASES.includes(state.phase.kind)) {
        continue;
      }
      checked += 1;
      expect(state.dealerVisible, `published in ${state.phase.kind}`).not.toContain(holeCard);
      // And the truth is still told about how many cards are held.
      if (dealerHeld(state) === DEALER_CARDS) {
        expect(state.dealerConcealed).toBe(CONCEALED);
        expect(state.dealerVisible.length).toBe(1);
      }
    }
    // The round really passed through the concealed phases, so the loop above
    // is not vacuously clean.
    expect(checked).toBeGreaterThan(0);
  });

  /**
   * The control for the concealment, and the reason it is not idle.
   *
   * A machine that dealt the hole card face up reports zero concealed cards
   * everywhere. It has to disagree with SPEC 4.3 at every snapshot taken in one
   * of the four phases that keep the card down, and to agree at every other,
   * which is what makes "the card turns over" a claim as well.
   */
  it('disagrees with a hole card dealt face up, at exactly the concealed phases', () => {
    const seen = transcript(createTable({ seed: 37 }));

    let down = 0;
    let up = 0;
    for (const state of seen) {
      if (dealerHeld(state) < DEALER_CARDS) {
        continue;
      }
      // The misreading: never conceal anything.
      const faceUpDeal = 0;
      if (state.dealerConcealed === faceUpDeal) {
        up += 1;
        expect(CONCEALED_PHASES).not.toContain(state.phase.kind);
      } else {
        down += 1;
        expect(CONCEALED_PHASES).toContain(state.phase.kind);
        expect(state.dealerConcealed).toBe(CONCEALED);
      }
    }
    // Both sides of the disagreement really happen: the card is down for part
    // of the round and up for the rest, so neither reading is trivially right.
    expect(down).toBeGreaterThan(0);
    expect(up).toBeGreaterThan(0);
  });

  /**
   * SPEC 4.4's other way of turning the card over: the peek found a natural, so
   * SPEC 10 goes straight to `settling` and the round resolves before any
   * player action. The card is face up there, because the player is being shown
   * the hand that beat them.
   */
  it('turns the hole card up when the peek resolved the round', () => {
    // A ten-value up card with an Ace behind it is SPEC 4.2's natural, and SPEC
    // 4.4 peeks behind a ten. The player holds 9 and 7, so the hand is live and
    // is not what ends the round.
    const table = createTable({ shoe: scriptedShoe(['9', '10', '7', 'A']) });
    const seen = transcript(table);
    const kinds = seen.map((state) => state.phase.kind);
    expect(kinds).toContain('peek');
    expect(kinds).not.toContain('playerTurn');
    expect(kinds).not.toContain('reveal');

    const settling = seen.find((state) => state.phase.kind === 'settling');
    expect(settling).toBeDefined();
    expect(settling?.dealerConcealed).toBe(0);
    expect(settling?.dealerVisible.length).toBe(DEALER_CARDS);
    expect(settling?.dealerVisible[1]?.rank).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// The up card the branch reads is the card that was dealt
// ---------------------------------------------------------------------------

describe('B6: the dealt up card is the one SPEC 10 branches on', () => {
  it('shows the rank the shoe dealt, for all thirteen of them', () => {
    let checked = 0;
    for (const up of RANKS) {
      const table = roundShowing(up);
      toDealing(table);
      for (let step = 0; step < DEAL_ORDER.length; step += 1) {
        oneCard(table);
      }
      const state = table.readout();
      expect(state.dealerVisible[0]?.rank, `up card ${up}`).toBe(up);
      expect(state.dealerConcealed).toBe(CONCEALED);
      // SPEC 10's three successors to `dealing`, chosen by the card that was
      // actually dealt. `C2` grades the branch itself; what is here is that it
      // read the dealt card and not something supplied beside it.
      const expected =
        up === 'A' ? 'insurance' : ['10', 'J', 'Q', 'K'].includes(up) ? 'peek' : 'playerTurn';
      expect(state.phase.kind, `up card ${up}`).toBe(expected);
      checked += 1;
    }
    expect(checked).toBe(RANKS.length);
    expect(checked).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.1: the cards come from the seeded shoe, so the deal replays
// ---------------------------------------------------------------------------

describe('B6: the deal is the seeded shoe, so the same seed deals the same cards', () => {
  /** Every card of the opening deal, in the order it arrived. */
  function openingCards(seed: number): readonly string[] {
    const table = toDealing(createTable({ seed }));
    const drawn: string[] = [];
    let player = 0;
    for (let step = 0; step < DEAL_ORDER.length; step += 1) {
      const state = oneCard(table);
      const hand = state.hands[0]?.cards ?? [];
      if (hand.length > player) {
        const card = hand[hand.length - 1];
        drawn.push(`player:${String(card?.rank)}${String(card?.suit)}`);
        player = hand.length;
        continue;
      }
      const visible = state.dealerVisible;
      const card = visible[visible.length - 1];
      // The hole card is concealed, so what is recorded on the fourth step is
      // that a dealer card arrived and nothing about which one it was.
      drawn.push(
        state.dealerConcealed > 0
          ? 'dealer:concealed'
          : `dealer:${String(card?.rank)}${String(card?.suit)}`,
      );
    }
    return drawn;
  }

  it('deals an identical opening on the same seed, and a different one on another', () => {
    const first = openingCards(101);
    const second = openingCards(101);
    expect(second).toEqual([...first]);
    expect(first.length).toBe(OPENING_DEAL.length);

    // A different seed is a different shoe. Two seeded shoes agreeing on all
    // four cards would be a coincidence worth roughly one in a quarter million,
    // so a run that matched here would be a defect and not bad luck.
    const other = openingCards(102);
    expect(other).not.toEqual([...first]);
  });

  /**
   * SPEC 4.1's round boundary, which the round module owns and the shoe cannot
   * see for itself: "the shoe reshuffles after the current round completes".
   *
   * The observable half of that here is `inPlay`, the cards the shoe believes
   * are still on the table. A machine that never told the shoe a round had
   * ended would let it grow every round, so the second deal below would report
   * eight cards in play instead of four and the defensive rebuild would start
   * excluding cards nobody is holding.
   */
  it('closes the shoe round at the settlement, so the next deal starts clean', () => {
    const table = createTable({ seed: 4711 });
    transcript(table);
    // The round has settled, so nothing the round dealt is in play any more.
    expect(table.readout().phase.kind).toBe('roundResult');
    expect(table.readout().shoe.inPlay).toBe(0);

    accept(table, { kind: 'nextHand' });
    const before = table.readout().shoe;
    expect(table.readout().phase.kind).toBe('betting');
    accept(table, { kind: 'tapChip', chip: ROUND_WAGER });
    accept(table, { kind: 'deal' });
    for (let step = 0; step < DEAL_ORDER.length; step += 1) {
      oneCard(table);
    }
    const second = table.readout().shoe;
    expect(second.inPlay).toBe(OPENING_DEAL.length);
    expect(second.dealt).toBe(before.dealt + OPENING_DEAL.length);
    expect(second.remaining).toBe(before.remaining - OPENING_DEAL.length);
  });

  it('deals the same round twice from one seed, cards and outcome alike', () => {
    function round(seed: number): string {
      const seen = transcript(createTable({ seed }));
      const last = seen[seen.length - 1];
      const result = last?.phase.kind === 'roundResult' ? last.phase.result : null;
      return JSON.stringify({
        phases: seen.map((state) => state.phase.kind),
        dealer: last?.dealerVisible.map((card) => `${card.rank}${card.suit}`),
        hands: result?.hands,
        chips: result?.chips,
      });
    }
    expect(round(2026)).toBe(round(2026));
    expect(round(2026)).not.toBe(round(2027));
  });
});
