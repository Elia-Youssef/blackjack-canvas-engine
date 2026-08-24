/**
 * A shoe that deals a written-down list of cards, for the round tests of
 * `BJ-8`. Support code, not a second implementation and not an oracle.
 *
 * **Why the tests need one.** Items `B6`, `B9`, `B10`, `B11` and `B12` are all
 * claims about what happens when specific cards arrive: a pair of Aces against
 * a dealer Ace, a hand of exactly two cards, a natural facing a ten-value up
 * card. Hunting for a seed that happens to deal one of those is slow to write,
 * unreadable at the call site, and silently wrong the day the shoe's build
 * order changes. Writing the cards down makes each assertion exact and makes
 * the arithmetic in the test checkable by hand.
 *
 * **What it deliberately is not.** It holds no game rule. It does not know what
 * a hand is, what a natural is, how many cards a round takes or when a round
 * ends. The real shoe's composition, its uniform shuffle, its cut card and its
 * defensive rebuild are items `B2` and `B3`, and they are graded against
 * `src/core/shoe.ts` in `tests/unit/shoe.test.ts` and
 * `tests/unit/cut-card.test.ts`. Nothing here stands in for any of that: this
 * is a source of cards in a chosen order, and the round tests that use it also
 * run rounds through the real seeded shoe so that the machine is never only
 * ever seen against a fixture.
 *
 * **It runs out loudly.** A script too short for the round it was written for
 * throws by name rather than quietly dealing something else, because a test
 * that drew an unintended card would assert the wrong arithmetic and pass.
 */

import type { Card, Rank, Suit } from '../../../src/core/cards';
import { SUITS, card } from '../../../src/core/cards';
import type { DeckCount, Shoe, ShoeReadout } from '../../../src/core/shoe';

/** SPEC 4.1's default shoe size, written out rather than imported as a value. */
const SCRIPTED_DECKS: DeckCount = 6;

/** 52 cards a deck, so the readout reports a plausible complement. */
const CARDS_PER_DECK = 52;

/**
 * One card from a rank, in a suit nothing in this game reads.
 *
 * `cards.ts` says a suit changes no value, predicate or payout anywhere, so a
 * script names ranks and this fills in the rest. Where a test needs two cards
 * of the same rank to be distinguishable it passes the suit itself.
 */
export function rank(name: Rank, suit: Suit = 'spades'): Card {
  return card(name, suit);
}

/**
 * A shoe from a list of ranks, in the order they are to be dealt.
 *
 * SPEC 4.3 deals player, dealer up, player, dealer down, so a round's opening
 * four ranks read in exactly that order at the call site and every card after
 * them is drawn in the order the round asks for them. The suits cycle, so no
 * two cards in a script are the same object and a hand of four eights looks
 * like a hand a real shoe could deal; nothing in the game reads a suit, which
 * `cards.ts` states as the reason its predicates all key on `Rank`.
 */
export function scriptedShoe(ranks: readonly Rank[]): Shoe {
  return stackedShoe(
    ranks.map((name, index) => rank(name, SUITS[index % SUITS.length] ?? 'spades')),
  );
}

/**
 * A shoe that deals `script` in order and then refuses to deal anything.
 *
 * `endRound` reports that it did not reshuffle, because a scripted shoe has no
 * cut card to reach; a test about SPEC 4.1's reshuffle uses the real shoe.
 */
export function stackedShoe(script: readonly Card[]): Shoe {
  const stack = [...script];
  const inPlay: Card[] = [];
  let dealt = 0;

  function draw(): Card {
    const next = stack[dealt];
    if (next === undefined) {
      throw new RangeError(
        `the scripted shoe holds ${String(stack.length)} cards and the round asked for one more`,
      );
    }
    dealt += 1;
    inPlay.push(next);
    return next;
  }

  function cardsRemaining(): number {
    return stack.length - dealt;
  }

  function readout(): ShoeReadout {
    return Object.freeze({
      decks: SCRIPTED_DECKS,
      complement: SCRIPTED_DECKS * CARDS_PER_DECK,
      stacked: stack.length,
      dealt,
      remaining: cardsRemaining(),
      penetration: stack.length === 0 ? 1 : dealt / stack.length,
      undealtAtCut: cardsRemaining(),
      cutCardReached: false,
      inPlay: inPlay.length,
      rebuilds: 0,
    });
  }

  return Object.freeze({
    decks: SCRIPTED_DECKS,
    draw,
    cardsRemaining,
    cutCardReached: (): boolean => false,
    endRound: (): boolean => {
      inPlay.length = 0;
      return false;
    },
    readout,
  });
}
