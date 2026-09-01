/**
 * The shoe: composition, shuffle, cut card and the defensive rebuild. SPEC 4.1.
 *
 * Items `B2` (Critical) and `B3` (Major). It hands out cards on request and
 * nothing more. Who asks for them, in what order and to which hand is the round
 * module's business at `BJ-8`, and this file deliberately knows none of it.
 *
 * Four claims, in the order SPEC 4.1 makes them:
 *
 *   1. **Six or eight decks, and nothing else.** The type says so and the
 *      constructor says so again, because a deck count arriving from settings
 *      or from storage has been through `JSON.parse` and carries no type at
 *      all. One and two decks were cut for a reason the cut card itself gives:
 *      no cut position in a shoe that small guarantees a round completes.
 *   2. **A uniform permutation, from the seeded stream.** The shoe takes its
 *      own stream through `split()` rather than sharing the one it is handed,
 *      so a future consumer added beside it cannot shift the deal.
 *   3. **A cut card leaving 25 to 40 percent undealt**, and a reshuffle that
 *      happens at the round boundary rather than the moment the cut is reached.
 *      Reshuffling mid-round would be a different game: half the hands on the
 *      table would have been dealt from a shoe that no longer exists.
 *   4. **A defensive rebuild that must never fire.** It is a guarantee, not a
 *      mechanism: a draw on an exhausted shoe rebuilds from a full complement
 *      minus everything in play instead of throwing. Item `B5` at `BJ-12` is
 *      where the soak proves the path is never reached in play.
 *
 * **Why the cut card is a position and not a card count.** A round's card
 * consumption has no small bound, because the cheapest card is an Ace read as
 * 1. Its *value* consumption does: a player hand including its busting card
 * totals at most 30 and the dealer at most 26, so four split hands and a dealer
 * come to at most 146. Turning that value back into a card count depends on how
 * many cheap cards the shoe holds, which is why SPEC 4.1 states the worst case
 * per shoe size, 72 cards on six decks and 80 on eight, and why
 * `tests/unit/cut-card.test.ts` derives both from the composition rather than
 * quoting them.
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { Card } from './cards';
import { RANKS, SUITS, card } from './cards';
import type { Rng } from './rng';

/** The two configured shoe sizes. SPEC 4.1, and there is no third. */
export type DeckCount = 6 | 8;

/** Every configured shoe size, for a settings control to enumerate. */
export const DECK_COUNTS = [6, 8] as const satisfies readonly DeckCount[];

/** The shoe size SPEC 4.1 makes the default. */
export const DEFAULT_DECKS: DeckCount = 6;

/** 52. Derived, so the composition has one source and not two. */
export const CARDS_PER_DECK = RANKS.length * SUITS.length;

/**
 * The window SPEC 4.1 puts the cut card in, as whole percentages.
 *
 * Integers rather than 0.25 and 0.4 so that the bounds below are exact
 * arithmetic on integers. `0.4 * 312` is 124.80000000000001 in a double, which
 * floors correctly today and is a poor thing to have depended on.
 */
export const MIN_UNDEALT_PERCENT = 25;
export const MAX_UNDEALT_PERCENT = 40;

/** How many cards may sit behind the cut card, inclusive at both ends. */
export interface CutCardRange {
  /** At least 25 percent of the shoe, rounded up, so the floor is never under. */
  readonly min: number;
  /** At most 40 percent of the shoe, rounded down, for the same reason. */
  readonly max: number;
}

/**
 * A shoe's state, as everything outside it is allowed to see it.
 *
 * **Three fields read differently after a defensive rebuild, and a consumer
 * that assumes otherwise will misreport.** A rebuild replaces the stack with
 * the complement minus whatever is on the table, so `stacked` drops below
 * `complement`, `undealtAtCut` becomes equal to `stacked` because the cut card
 * goes to the top, and `cutCardReached` stays true right through to the next
 * round boundary. That is the shoe telling the truth about a state it should
 * never be in, and it is deliberate: the reshuffle is still owed and the
 * boundary will pay it.
 */
export interface ShoeReadout {
  /** 6 or 8. SPEC 4.1. */
  readonly decks: DeckCount;
  /** The full complement, `decks * 52`. Fixed for the shoe's life. */
  readonly complement: number;
  /**
   * Cards in the current stack, dealt and undealt together. Equal to
   * `complement` everywhere except between a defensive rebuild and the round
   * boundary that follows it.
   */
  readonly stacked: number;
  /** Cards drawn from the current stack. */
  readonly dealt: number;
  /** Cards not yet drawn. */
  readonly remaining: number;
  /**
   * `dealt / stacked`: 0 at a fresh shoe, 1 at an exhausted one.
   *
   * Against the **current stack**, not against `complement`, so it stays a
   * meaningful fraction after a rebuild has made the two differ. An empty stack
   * reads 1 rather than `NaN`.
   */
  readonly penetration: number;
  /**
   * Cards that will still be undealt when the cut card surfaces. Equal to
   * `stacked` after a defensive rebuild, which puts the cut card at the top.
   */
  readonly undealtAtCut: number;
  /**
   * True once the cut card has been reached. SPEC 4.1. A defensive rebuild
   * leaves it true, because the reshuffle it implies is still owed.
   */
  readonly cutCardReached: boolean;
  /** Cards drawn since the round began, and so still on the table. */
  readonly inPlay: number;
  /**
   * How often the defensive rebuild has fired. SPEC 4.1 says never, and the
   * soak that grades that is a later part's.
   */
  readonly rebuilds: number;
}

/** The whole contract. Dealing is `BJ-8`'s, and none of it is here. */
export interface Shoe {
  /** 6 or 8. SPEC 4.1. */
  readonly decks: DeckCount;
  /** The next card. Never a card already in play. */
  draw(): Card;
  /** Cards left in the current stack. */
  cardsRemaining(): number;
  /** True once the cut card has surfaced. SPEC 4.1. */
  cutCardReached(): boolean;
  /**
   * The round boundary, called once after a round completes and before the
   * next deal. Reshuffles if and only if the cut card was reached, and returns
   * whether it did. Everything dealt in the round stops being in play either
   * way.
   */
  endRound(): boolean;
  /** The state, for a readout and for a test. */
  readout(): ShoeReadout;
}

/** True for a configured shoe size. SPEC 4.1 offers 6 and 8 and no others. */
export function isDeckCount(value: number): value is DeckCount {
  return DECK_COUNTS.some((count) => count === value);
}

/**
 * Refuse a deck count SPEC 4.1 does not configure, in SPEC 4.1's own words.
 *
 * Exported because `table.ts` has to ask the same question at the same moment
 * the caller can still do something about it: `setRules` stages a record that
 * `createShoe` will not accept until three phases later, by which time
 * `wallet.commitInitial` has spent the wager. One sentence, one owner; a second
 * spelling of it in the machine would be the drift the whole module avoids.
 */
export function assertDeckCount(value: number): void {
  if (!isDeckCount(value)) {
    throw new RangeError(
      `SPEC 4.1 configures 6 or 8 decks; ${String(value)} is not a shoe size this game deals`,
    );
  }
}

/**
 * Where the cut card may sit, in cards behind it. SPEC 4.1.
 *
 * Rounded inward at both ends, so the window is never wider than the percentage
 * pair states: up at the minimum, down at the maximum. On the two configured
 * sizes both percentages of the minimum land on whole cards anyway, and the
 * rounding only bites at the top.
 */
export function cutCardRange(decks: DeckCount): CutCardRange {
  assertDeckCount(decks);
  const complement = decks * CARDS_PER_DECK;
  return Object.freeze({
    min: Math.ceil((complement * MIN_UNDEALT_PERCENT) / 100),
    max: Math.floor((complement * MAX_UNDEALT_PERCENT) / 100),
  });
}

/** A card's identity as a multiset key, so a rebuild can subtract by value. */
function keyOf(held: Card): string {
  return `${held.rank}:${held.suit}`;
}

/**
 * A shoe. SPEC 4.1, items `B2` and `B3`.
 *
 * `source` is the session stream. The shoe splits its own child from it and
 * never touches `source` again, which is what SPEC 4.1 means by the deal being
 * stable against a consumer added later.
 */
export function createShoe(decks: DeckCount, source: Rng): Shoe {
  assertDeckCount(decks);

  const stream = source.split();
  const complement = decks * CARDS_PER_DECK;
  const range = cutCardRange(decks);

  /** Cards drawn since the round began, and so still on the table. */
  const inPlay: Card[] = [];

  let stack: Card[] = [];
  let dealt = 0;
  /** How many cards may be dealt before the cut card surfaces. */
  let cutAt = 0;
  let rebuilds = 0;

  /** Every rank in every suit, `decks` times over. */
  function buildComplement(): Card[] {
    const built: Card[] = [];
    for (let deck = 0; deck < decks; deck += 1) {
      for (const rank of RANKS) {
        for (const suit of SUITS) {
          built.push(card(rank, suit));
        }
      }
    }
    return built;
  }

  function cutCardReached(): boolean {
    return dealt >= cutAt;
  }

  /** A full complement, shuffled, with the cut card freshly placed. */
  function reshuffle(): void {
    stack = buildComplement();
    stream.shuffle(stack);
    dealt = 0;
    const behind = range.min + stream.nextInt(range.max - range.min + 1);
    cutAt = stack.length - behind;
  }

  /**
   * The path SPEC 4.1 says must never be reached.
   *
   * A full complement minus every card in play, so the no-duplicate invariant
   * survives: a card on the table cannot come back out of the shoe. Subtracted
   * by rank and suit rather than by object identity, because a card that has
   * been through a hand, a history entry or a saved game is the same card
   * whether or not it is the same object.
   *
   * The cut card goes to the top, which is what a shoe that has already run
   * past its own cut deserves. `endRound` therefore reshuffles properly at the
   * boundary, and the readout does not pretend a fresh cut was placed.
   */
  function rebuild(): void {
    const owed = new Map<string, number>();
    for (const held of inPlay) {
      const key = keyOf(held);
      owed.set(key, (owed.get(key) ?? 0) + 1);
    }

    const fresh: Card[] = [];
    for (const held of buildComplement()) {
      const key = keyOf(held);
      const outstanding = owed.get(key) ?? 0;
      if (outstanding > 0) {
        owed.set(key, outstanding - 1);
        continue;
      }
      fresh.push(held);
    }

    stream.shuffle(fresh);
    stack = fresh;
    dealt = 0;
    cutAt = 0;
    rebuilds += 1;
  }

  function draw(): Card {
    if (dealt >= stack.length) {
      rebuild();
    }
    const drawn = stack[dealt];
    if (drawn === undefined) {
      throw new RangeError(
        'every card in the shoe is already in play, so there is nothing left to rebuild from',
      );
    }
    dealt += 1;
    inPlay.push(drawn);
    return drawn;
  }

  function cardsRemaining(): number {
    return stack.length - dealt;
  }

  function endRound(): boolean {
    inPlay.length = 0;
    if (!cutCardReached()) {
      return false;
    }
    reshuffle();
    return true;
  }

  function readout(): ShoeReadout {
    return Object.freeze({
      decks,
      complement,
      stacked: stack.length,
      dealt,
      remaining: cardsRemaining(),
      // Fully penetrated rather than `0 / 0`. A stack is only empty after a
      // rebuild found nothing to rebuild from, and a readout taken there must
      // not hand a NaN to whatever is drawing the shoe meter.
      penetration: stack.length === 0 ? 1 : dealt / stack.length,
      undealtAtCut: stack.length - cutAt,
      cutCardReached: cutCardReached(),
      inPlay: inPlay.length,
      rebuilds,
    });
  }

  reshuffle();

  return Object.freeze({ decks, draw, cardsRemaining, cutCardReached, endRound, readout });
}
