/**
 * Settlement: the nine rungs of SPEC 4.10, and the insurance net of SPEC 4.7.
 * Items `B13` and `B14`, both Critical.
 *
 * Two pure functions, no state, and nothing that reads a balance. What is here
 * is the arithmetic of a hand that has finished: which rung of SPEC 4.10's
 * table decides it, and the **net** on that hand's wager.
 *
 * **Net, not credit, and the difference is a whole part of the build.** SPEC
 * 4.11 takes the wager out of the balance at the deal and credits back
 * `wager + net` at settlement, which is what makes "cannot wager more than
 * available" structurally impossible rather than a guard in three places. So a
 * losing hand nets `-wager` here and the wallet credits back zero; it does not
 * subtract the wager a second time. The crediting, the four-term identity
 * `chips + committed + insuranceStake - deferredStake`, and the conservation
 * that identity states are `BJ-6`'s to build, and they are graded by `B15` at
 * `BJ-15` and by the 50,000-round soak `H6` at `BJ-12`. None of it is here.
 *
 * **The order is the requirement.** SPEC 4.10 says "evaluated top to bottom" and
 * then says which two orderings matter: equal naturals before either single
 * natural, and player bust before dealer bust. Both are payouts. Rungs 2 and 3
 * reordered turn a push into a 3:2 win against a dealer who also holds 21; rungs
 * 5 and 6 reordered pay a player who busted first and then watched the dealer
 * bust too. Neither reordering is visible in a hand that reaches only one of
 * them, which is why `tests/unit/settlement.test.ts` runs both of them, and a
 * rung 1 that lost the qualifier below, as three separate ladders beside this
 * one, each required to disagree on exactly its own set of inputs.
 *
 * **Rung 1 carries a qualifier because this is a total function.** In play a
 * surrender and a dealer natural cannot both be true: SPEC 4.4's peek resolves a
 * dealer natural before surrender, split or double is offered. Evaluated as a
 * pure function that pair is reachable, and SPEC 4.8 says what it means, late
 * surrender is after the peek "so a dealer natural takes the full wager rather
 * than half". The qualifier is that sentence made arithmetic: with it the hand
 * falls through to rung 4 and loses `wager`, without it rung 1 returns half.
 *
 * **Both natural tests come from SPEC 4.2's single definition** in `hand.ts`,
 * with the split origin supplied per side: the player's own, so that a two-card
 * 21 on a split hand is 21 and pays 1:1 through rungs 7 to 9 rather than 3:2 at
 * rung 3, and never split for the dealer, who holds one hand all round. Values
 * come from `handValue` and bust from `isBust`, both imported rather than
 * counted again here. A second reading of any of the three in this file would
 * drift silently, because it would agree with the first on every hand until a
 * house rule moved.
 *
 * **There is no rounding anywhere in this module, and none is needed.** SPEC
 * 4.11 keeps every reachable wager a multiple of 10, which is what makes
 * `wager x 3 / 2`, `wager / 2` and `2 x stake` exact integers. Integrality is
 * therefore a property of the wager set rather than of this code, so it is not
 * asserted here: it is derived from the chip denominations and the table maxima
 * in `tests/unit/payout-integrality.test.ts`, which is item `B14`. If a payout
 * ever appears to need rounding, the wager reaching this module is off the grid
 * and the defect is upstream in the betting controls, item `B15`. Rounding it
 * here would hide that, and the loss would be a chip at a time.
 *
 * **A wager of 0 settles to negative zero on five of the paths here, and no
 * table allows one.** Rungs 1, 4, 5 and 8 each negate a quantity taken from the
 * wager, and `settleInsurance` negates the stake on its losing branch, so all
 * five return `-0` when handed 0; rungs 2 and 9 return a positive zero, and
 * rungs 3, 6 and 7 pay a positive 0. SPEC 6 puts the lowest table minimum at 10
 * and the deal is blocked below it, so none of it is reachable. It is written
 * down because `-0 === 0` is true while `Object.is(-0, 0)` is false, and
 * `Object.is` is what the test runner's identity assertion uses: a later
 * assertion about a zero delta or a conserved balance, at `BJ-6` or in the soak
 * at `BJ-12`, should be written knowing that rather than discovering it.
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { Card } from './cards';
import type { SplitOrigin } from './hand';
import { handValue, isBust, isNatural } from './hand';

/**
 * The dealer's hand is never a hand created by a split. SPEC 4.6 splits a
 * player's pair; the dealer holds one hand for the whole round.
 *
 * Settled once here, as in `dealer.ts`, rather than at each call, so that the
 * dealer's natural test is a *use* of SPEC 4.2's definition and not a second
 * reading of it.
 */
const UNSPLIT: SplitOrigin = Object.freeze({ fromSplit: false });

/**
 * What a natural pays. SPEC 4.11: 3:2.
 *
 * Both terms of the ratio in one place, so that a house rule moving the headline
 * payout to 6:5 moves them together, and so that the felt can print "blackjack
 * pays 3 to 2" from the number the ladder actually uses. Printing it is item
 * `E5` and is not built here.
 *
 * The 2 in this ratio is a lower term, not a half. `SURRENDER_DIVISOR` below is
 * a half, and the two are separate for the reason `cards.ts` keeps `TEN` apart
 * from the Ace adjustment: they are equal today and would not move together.
 */
export const NATURAL_PAYS = Object.freeze({ numerator: 3, denominator: 2 });

/**
 * What insurance pays. SPEC 4.7: 2:1, so a dealer natural nets `2 x stake`.
 *
 * An integer multiplier rather than a ratio, because the lower term of 2:1 is 1
 * and writing `/ 1` would suggest a division that can fail. The felt prints
 * "insurance pays 2 to 1" from this, again at `E5`.
 */
export const INSURANCE_PAYS = 2;

/** SPEC 4.8: late surrender returns `wager / 2`, so it forfeits the other half. */
const SURRENDER_DIVISOR = 2;

/**
 * The five outcomes of SPEC 4.10, spelled as that table spells them.
 *
 * Declared here because settlement is the only thing that produces one. DESIGN
 * section 1 puts the game's discriminated unions in `core/types.ts`, which
 * arrives with the phase machine at `BJ-7`; when it does it absorbs this union
 * rather than restating it, which is why the name is exported from a module that
 * has no other reason to export a type.
 */
export type Outcome = 'SURRENDER' | 'PUSH' | 'BLACKJACK' | 'DEALER_WIN' | 'PLAYER_WIN';

/** Which row of SPEC 4.10's table decided a hand. One to nine, in its order. */
export type Rung = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * The player side of one settlement.
 *
 * A named shape on each side rather than two card arrays, because two positional
 * `Card[]` arguments are silently swappable at the call site and the swap reads
 * correctly: every push would still push. `SplitOrigin` is here for the same
 * reason `hand.ts` gives for taking it as a field instead of a bare boolean.
 *
 * `wager` is a single hand's current wager, per SPEC 4.11: after a double it is
 * the doubled amount, and each hand of a split carries its own. The initial
 * wager, which the table minimum and maximum govern and which the insurance
 * stake is half of, is the betting module's and is not needed here.
 */
export interface PlayerHand {
  readonly cards: readonly Card[];
  readonly wager: number;
  /** True when SPEC 4.8's surrender was taken on this hand. */
  readonly surrendered: boolean;
  /** Whether this hand came from a split. SPEC 4.6, and rung 3 turns on it. */
  readonly origin: SplitOrigin;
}

/** The dealer side. One hand, and no origin: SPEC 4.6 never splits it. */
export interface DealerHand {
  readonly cards: readonly Card[];
}

/**
 * What one settled hand comes to.
 *
 * `rung` is carried because B13 is a claim about *order*, and outcome and net
 * cannot express it on their own: rungs 2 and 9 are both a push of 0, and rungs
 * 4, 5 and 8 are all a dealer win of `-wager`. With the deciding rung in the
 * result, "this hand pushed at rung 2 and not at rung 9" is an assertion rather
 * than an inference. It is also the reason SPEC 12's round result can name why a
 * hand settled the way it did, which is item `C8` and is not built here.
 */
export interface HandSettlement {
  readonly outcome: Outcome;
  /** The net on this hand's wager. The wallet credits `wager + net`. */
  readonly net: number;
  readonly rung: Rung;
}

/**
 * One decided hand, frozen.
 *
 * Frozen for the reason the card factory is: a settlement is handed from here to
 * the wallet, to the round result and into the last rounds of history, and a
 * write anywhere along that chain would change a number that has already been
 * shown to the player, with no type error to show for it.
 */
function decided(rung: Rung, outcome: Outcome, net: number): HandSettlement {
  return Object.freeze({ outcome, net, rung });
}

/**
 * SPEC 4.11's `wager x 3 / 2`, and the one payout in the game that is not a
 * whole multiple of the wager.
 *
 * Exact for the same reason every other payout is: SPEC 4.11 keeps the wager a
 * multiple of 10, so the halving cannot leave a fraction. Named rather than
 * inlined so the ladder's rungs all read the same width, and so a house rule
 * moving the headline payout has one place to move.
 */
function naturalPayout(wager: number): number {
  return (wager * NATURAL_PAYS.numerator) / NATURAL_PAYS.denominator;
}

/**
 * Settle one player hand against the dealer's. SPEC 4.10, item `B13`.
 *
 * The nine rungs in the table's order, top to bottom, first match wins. Rung 9
 * is the only unconditional return in the function, so totality is the
 * compiler's to check rather than a claim in a comment: rungs 7 and 8 take the
 * two strict comparisons and everything left over is equal values.
 *
 * It settles one hand. SPEC 4.6 has each hand of a split settle independently
 * against the single dealer hand, so a round with four hands calls this four
 * times with four wagers and one dealer side; nothing here knows how many hands
 * there are. Whether the dealer drew at all, and SPEC 4.9's rule that it does
 * not when no hand is in contention, are the phase machine's at `BJ-7`.
 */
export function settle(player: PlayerHand, dealer: DealerHand): HandSettlement {
  const wager = player.wager;
  const playerNatural = isNatural(player.cards, player.origin);
  const dealerNatural = isNatural(dealer.cards, UNSPLIT);

  // Rung 1. Surrendered, and the dealer holds no natural. SPEC 4.8.
  if (player.surrendered && !dealerNatural) {
    return decided(1, 'SURRENDER', -(wager / SURRENDER_DIVISOR));
  }

  // Rung 2. Equal naturals push. Before rung 3, or a natural would beat a
  // natural.
  if (playerNatural && dealerNatural) {
    return decided(2, 'PUSH', 0);
  }

  // Rung 3. Player natural, and by rung 2 the dealer has none. Pays 3:2.
  if (playerNatural) {
    return decided(3, 'BLACKJACK', naturalPayout(wager));
  }

  // Rung 4. Dealer natural against anything that is not one. Takes the whole
  // wager, including from a hand that surrendered, per rung 1's qualifier.
  if (dealerNatural) {
    return decided(4, 'DEALER_WIN', -wager);
  }

  // Rung 5. Player bust. Before rung 6, or a player who busted first would be
  // paid for the dealer busting after.
  if (isBust(player.cards)) {
    return decided(5, 'DEALER_WIN', -wager);
  }

  // Rung 6. Dealer bust, with the player's hand still live.
  if (isBust(dealer.cards)) {
    return decided(6, 'PLAYER_WIN', wager);
  }

  // Rungs 7 to 9 are the comparison. Neither hand is bust by here, so both
  // totals are 21 or less and the three rungs are a trichotomy.
  const playerValue = handValue(player.cards).total;
  const dealerValue = handValue(dealer.cards).total;

  // Rung 7. Player value over dealer value. This is where a split hand's
  // two-card 21 wins, at 1:1, per SPEC 4.6.
  if (playerValue > dealerValue) {
    return decided(7, 'PLAYER_WIN', wager);
  }

  // Rung 8. Player value under dealer value.
  if (playerValue < dealerValue) {
    return decided(8, 'DEALER_WIN', -wager);
  }

  // Rung 9. Equal values. Everything the two comparisons above left.
  return decided(9, 'PUSH', 0);
}

/**
 * Settle the insurance side wager. SPEC 4.7, and part of item `B14`.
 *
 * **This resolves before the ladder, not with it.** SPEC 4.7 settles insurance
 * immediately after the peek and SPEC 4.10 ends with "insurance settles
 * separately, before this ladder". The two are separate functions here because
 * they answer at different moments in the round and against different stakes;
 * the ordering itself is a property of the running round rather than of a pure
 * function, so it becomes enforceable where the phases exist, and item `C1`
 * grades the phase order end to end at `BJ-20`. Nothing in this file sequences
 * them.
 *
 * The net, not the credit. SPEC 4.7 credits the balance `3 x stake` on a dealer
 * natural, which is the stake returned plus `2 x stake` paid on top, so the net
 * on the side wager is `+2 x stake`; on no dealer natural the stake is lost and
 * the net is `-stake`. Returning the net puts this function in the same framing
 * as the ladder, a delta on a stake rather than a balance to write, and leaves
 * the crediting in one place, the wallet at `BJ-6`. The two do not share a
 * shape, and deliberately: a settled hand carries an outcome and the rung that
 * decided it as well as a number, so it comes back as a frozen record, while a
 * side wager is the number and nothing else.
 *
 * **Even money is not a second path and is not here.** SPEC 4.7 implements it as
 * an ordinary insurance stake of `wager / 2` settled through this function, with
 * the hand then settling normally through the ladder, pushing at rung 2 or
 * paying 3:2 at rung 3, for a net of `+wager` either way. Where the balance
 * cannot cover that stake, `deferredStake` carries the shortfall and settlement
 * subtracts it. Both belong to item `B11` at `BJ-8`, and neither is built here:
 * this function takes a stake and a bit and knows nothing about where the stake
 * came from or whether all of it left the balance.
 *
 * The stake is `wager / 2` of the **initial** wager, fixed at the offer and
 * unaffected by a later split or double. Computing it is the offer's, at `B11`.
 */
export function settleInsurance(stake: number, dealerNatural: boolean): number {
  return dealerNatural ? INSURANCE_PAYS * stake : -stake;
}
