/**
 * SPEC 8's hand history: the last 50 completed rounds. Item `J5` at `BJ-10`.
 *
 * SPEC 8 is one paragraph and it is the whole contract: "The last **50**
 * completed rounds, reviewable from the table and from the game-over screen.
 * Each entry: the player hands and their values, the dealer hand and its value,
 * every action taken, the wager, the outcome, the chip delta, and the coach
 * verdict if the coach was on. Cleared only by a full data reset."
 *
 * **Seven field groups, and deliberately not an eighth.** An entry carries what
 * that sentence lists and nothing more. There is no timestamp, because `core/`
 * has no clock and SPEC 8 asks for none; no table name and no resulting
 * balance, because SPEC 8 lists neither and SPEC 12's round result is the
 * screen where the balance belongs; and no separate insurance line, for the
 * reason `delta` gives below. The completeness sweep in
 * `tests/unit/hand-history.test.ts` writes SPEC 8's list out and requires the
 * entry's keys to be **exactly** the mapped set, so a field quietly added here
 * fails as loudly as one quietly dropped.
 *
 * **An entry outlives the felt, so it carries the cards.** `table.ts` sweeps
 * at `Next Hand`, which is why SPEC 12's `SettledHand` deliberately does not
 * copy the two hand values: at the round result the cards are still there to be
 * evaluated. A history entry is read rounds later, so the cards come with it
 * and their values come with them, computed by `hand.ts`'s `handValue` at
 * record time. That is the same function and not a second reading of SPEC 4.2;
 * the test asserts every stored value still equals `handValue` of the cards
 * beside it, so the pair cannot drift.
 *
 * **Newest first.** SPEC 8 says "the last 50" and calls the list reviewable
 * without fixing an order, so index 0 is the round that just finished. A player
 * opening the overlay is looking for the hand they just played.
 *
 * **Persistence is `BJ-11`'s.** A `History` is an array of frozen plain values,
 * so `JSON.parse(JSON.stringify(history))` is the same document byte for byte
 * and every entry survives it intact. That round trip is what this part proves
 * for `J5`'s "survives a reload"; the `localStorage` half of the sentence is
 * item `I1`'s versioned document at `BJ-11` and item `I4`'s launch, and is
 * deliberately not built here.
 */

import type { Card } from './cards';
import { handValue } from './hand';
import type { Outcome, Rung } from './settlement';
import type { CoachVerdict } from './strategy';
import type { TableReadout } from './table';
import type { PlayerAction } from './types';

/** SPEC 8's "the last **50** completed rounds". */
export const HISTORY_LIMIT = 50;

/**
 * One settled hand, as SPEC 8's first, fourth, fifth and sixth fields.
 *
 * `wager`, `outcome` and `rung` are SPEC 12's `SettledHand` carried through
 * unchanged, because `settlement.ts` decided them and a second spelling would
 * drift. The rung is here because SPEC 12 calls it the outcome's reason and a
 * history row that says `DEALER_WIN` without saying whether the player busted,
 * the dealer drew to 20 or the dealer held a natural is not reviewable, which
 * is the word SPEC 8 uses.
 */
export interface HistoryHand {
  /** SPEC 8's "the player hands", in deal order. */
  readonly cards: readonly Card[];
  /** SPEC 8's "and their values": `handValue(cards).total` at record time. */
  readonly value: number;
  /** This hand's wager, doubled or split as SPEC 4.11 left it. */
  readonly wager: number;
  /** SPEC 4.10's verdict on this hand. */
  readonly outcome: Outcome;
  /** Which of SPEC 4.10's nine rungs decided it. SPEC 12's "reason". */
  readonly rung: Rung;
  /** SPEC 4.10's "net on the hand's wager": `credit - wager`. */
  readonly delta: number;
}

/** One completed round, as SPEC 8 describes an entry. */
export interface HistoryEntry {
  /** SPEC 8's "the player hands and their values", in SPEC 4.6's play order. */
  readonly hands: readonly HistoryHand[];
  /** SPEC 8's "the dealer hand", hole card included: the round is over. */
  readonly dealer: readonly Card[];
  /** SPEC 8's "and its value". */
  readonly dealerValue: number;
  /** SPEC 8's "every action taken", in the order the machine accepted them. */
  readonly actions: readonly PlayerAction[];
  /**
   * SPEC 8's "the wager": the round's initial wager, which SPEC 4.11 makes the
   * one quantity the table minimum and maximum govern. Each hand's own wager,
   * which a double or a split moved, is on the hand.
   */
  readonly wager: number;
  /**
   * SPEC 8's "the chip delta", for the round.
   *
   * **The whole round, side wager included**, so this is what the balance
   * actually moved between the deal and the boundary and not merely the sum of
   * the hands above it. SPEC 4.7's stake leaves the balance at the offer and
   * comes back at the peek, and its unfunded remainder is subtracted at the
   * boundary; the three together come to exactly the insurance net, so adding
   * that one number is the complete account. SPEC 8 lists one chip delta and no
   * insurance line, so the money is kept whole rather than split into a field
   * SPEC 8 does not name; SPEC 12's round result is where the breakdown is
   * shown, at the moment it matters. `tests/unit/hand-history.test.ts` proves
   * the identity against the balance before the deal.
   */
  readonly delta: number;
  /**
   * SPEC 8's "the coach verdict if the coach was on".
   *
   * `null` means the coach was off for this round, which is a different
   * sentence from an empty list: a round played with the coach on that offered
   * no decision the chart has an opinion about, a dealer natural found at the
   * peek, records `[]`. One verdict per counted decision, in the order they
   * were made, because SPEC 4.6 can put four hands and a dozen decisions in one
   * round and SPEC 8's singular is written for the common one.
   *
   * The verdicts are handed in rather than read off the readout, because
   * `strategy.ts` is a pure comparison that the composition root drives at each
   * decision and `table.ts` deliberately cannot see it: "this is the whole of
   * the coach's effect on the game: none."
   */
  readonly coach: readonly CoachVerdict[] | null;
}

/** SPEC 8's list. Newest first, and never longer than `HISTORY_LIMIT`. */
export type History = readonly HistoryEntry[];

/** An empty history, for a first launch and for a full data reset. */
export const NO_HISTORY: History = Object.freeze([]);

/**
 * Record one completed round. SPEC 8, item `J5`.
 *
 * The readout must be at SPEC 10's `roundResult`, which is the only phase
 * carrying a settled round and the only one where the felt still holds the
 * cards the entry is made of. Anything else is a caller defect and is thrown
 * rather than refused, in the house style.
 *
 * **The hole card has to be face up here, and that is asserted rather than
 * assumed.** SPEC 8 wants "the dealer hand and its value", and `dealerVisible`
 * is the face-up cards alone: on the four concealed phases it would be the up
 * card by itself and this would silently record a one-card dealer hand.
 * `roundResult` is past SPEC 10's reveal on every path, including the peek's
 * dealer natural, so `dealerConcealed` is zero, and the check is what makes
 * that a fact rather than a reading of the phase list.
 *
 * **The two orders are the same order, and the length check is why.** SPEC 12's
 * result is built with one `map` over the felt's hands, so `result.hands[i]`
 * and `readout.hands[i]` are the same hand, left to right in SPEC 4.6's play
 * order. Neither is the wallet's commit order, which is what `walletHand`
 * exists for and what this never touches.
 *
 * **There is no "already recorded" guard here, and that is a handoff rather
 * than an omission.** `statistics.ts` can refuse a round it has already
 * counted, because it carries a session round number and `table.ts` publishes
 * one to compare it against. This list cannot: SPEC 8 names no round index
 * among an entry's fields, and SPEC 13 persists the list across sessions where
 * `table.ts`'s counter starts again from zero, so a counter stored here would
 * have to be cleared on load and would then be guarding nothing. The discipline
 * is the caller's, the way SPEC 4.1's reshuffle is: `shoe.ts` cannot see a
 * round ending either, so the round module tells it. `BJ-11` and `BJ-19` record
 * once per boundary, at the same place they call `observeRound`, which does
 * carry the guard and would throw on a second call for the same round.
 */
export function record(
  history: History,
  readout: TableReadout,
  coach: readonly CoachVerdict[] | null,
): History {
  const { phase } = readout;
  if (phase.kind !== 'roundResult') {
    throw new RangeError(
      `SPEC 8 records a completed round; the phase is ${phase.kind} and carries no result`,
    );
  }
  if (readout.dealerConcealed !== 0) {
    throw new RangeError(
      'SPEC 8 records the dealer hand and its value, and the hole card is still down',
    );
  }
  const settled = phase.result.hands;
  if (settled.length !== readout.hands.length) {
    throw new RangeError(
      `${String(settled.length)} settled hands against ${String(readout.hands.length)} on the ` +
        'felt; SPEC 12 prints one result per hand in play order',
    );
  }

  const hands: readonly HistoryHand[] = Object.freeze(
    settled.map((hand, index) => {
      const inPlay = readout.hands[index];
      if (inPlay === undefined) {
        throw new RangeError(`hand ${String(index)} settled but is not on the felt`);
      }
      return Object.freeze({
        cards: Object.freeze([...inPlay.cards]),
        value: handValue(inPlay.cards).total,
        wager: hand.wager,
        outcome: hand.outcome,
        rung: hand.rung,
        delta: hand.credit - hand.wager,
      });
    }),
  );

  const insurance = phase.result.insurance;
  const entry: HistoryEntry = Object.freeze({
    hands,
    dealer: Object.freeze([...readout.dealerVisible]),
    dealerValue: handValue(readout.dealerVisible).total,
    actions: phase.result.actions,
    wager: readout.wallet.previousWager,
    delta:
      hands.reduce((total, hand) => total + hand.delta, 0) +
      (insurance === null ? 0 : insurance.net),
    coach: coach === null ? null : Object.freeze([...coach]),
  });

  return Object.freeze([entry, ...history].slice(0, HISTORY_LIMIT));
}

/**
 * SPEC 8's "cleared only by a full data reset".
 *
 * It takes no argument because there is no partial clear and nothing to keep:
 * item `I5` at `BJ-20` puts the one control behind a confirmation in Settings,
 * and this is what that control calls. **SPEC 4.12's free bankroll reset is not
 * it**: that reset preserves the history, because SPEC 8 names a full data
 * reset and SPEC 4.12 names the balance. The test drives a bust-out and a reset
 * and requires the entries to still be there.
 */
export function clear(): History {
  return NO_HISTORY;
}
