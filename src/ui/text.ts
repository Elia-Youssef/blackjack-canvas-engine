/**
 * Every sentence the chrome puts in front of a player, in one place.
 *
 * The rule this file exists to keep is SPEC 4.11's: a blocked action is
 * "blocked, each with a reason surfaced to the player". `core/` answers with a
 * value, never with a sentence, because a sentence is presentation and the
 * module that decides a rule should not be deciding how it reads. This is the
 * other half.
 *
 * **The rejection switch is over `RejectionReason` and never over the wallet's
 * `Refusal`.** `table.ts` composes the three layers into one union, `phase`,
 * `availability` and `wallet`, and switching over the composed union is what
 * makes the compiler catch a reason added to any of them. Switching over
 * `Refusal` alone would compile happily and leave eleven reasons unspoken.
 *
 * QUALITY-BAR section 11 asks that user-facing sentences not be built by string
 * concatenation where that would resist translation later. Each sentence below
 * is one whole string; the only interpolation is of a number a locale formatter
 * has already produced.
 */

import type { Rung, Outcome } from '../core/settlement';
import type { CellAddress, CoachAction, PreferenceList } from '../core/strategy';
import type { RejectionReason } from '../core/table';
import type { PlayerAction } from '../core/types';
import type { MilestoneId } from '../core/statistics';
import {
  ACCURACY_DECISIONS,
  ACCURACY_PERCENT,
  HUNDRED_HANDS,
  LOW_WATER_PERCENT,
  THOUSAND_HANDS,
} from '../core/statistics';
import type { TableId } from '../core/wallet';

import { chips } from './format';

/**
 * Why an action was refused. SPEC 4.11, SPEC 10 and the availability rules of
 * SPEC 4.5, 4.6, 4.7 and 4.8.
 *
 * Seventeen arms and no default, so a reason added to any of the three layers
 * is a compile error here rather than a blank line on screen.
 */
export function reasonText(reason: RejectionReason): string {
  switch (reason) {
    // The phase layer. SPEC 10: the screen does not offer this control.
    case 'wrong-phase':
      return 'That control is not part of this screen.';

    // The availability layer. SPEC 4.5, 4.6, 4.7, 4.8 and 10.
    case 'pending-wager':
      return 'Clear the wager before changing table.';
    case 'hand-resolved':
      return 'This hand has already finished.';
    case 'split-aces':
      return 'A split Ace hand takes one card and stands.';
    case 'not-two-cards':
      return 'Only on a hand of exactly two cards.';
    case 'not-a-pair':
      return 'Those two cards are not a pair.';
    case 'split-limit':
      return 'Three splits a round is the limit.';
    case 'from-split':
      return 'Surrender is not available after a split.';
    case 'surrender-off':
      return 'This table does not offer surrender.';
    case 'double-after-split-off':
      return 'This table does not allow doubling after a split.';
    case 'table-locked':
      return 'That table is not open to you yet.';

    // The wallet layer. SPEC 4.11's own refusals, and SPEC 4.5 and 4.6's funding.
    case 'no-wager':
      return 'Place a wager before dealing.';
    case 'off-grid':
      return 'Every wager is a multiple of 10.';
    case 'above-ceiling':
      return 'That is more than the table maximum or your balance allows.';
    case 'below-minimum':
      return 'That is below the table minimum.';
    case 'nothing-to-repeat':
      return 'There is no previous wager to repeat.';
    case 'insufficient-chips':
      return 'Your balance does not cover that.';
  }
}

/** SPEC 4.10's five outcomes, as a player reads them. */
export function outcomeText(outcome: Outcome): string {
  switch (outcome) {
    case 'BLACKJACK':
      return 'Blackjack';
    case 'PLAYER_WIN':
      return 'Win';
    case 'DEALER_WIN':
      return 'Loss';
    case 'PUSH':
      return 'Push';
    case 'SURRENDER':
      return 'Surrendered';
  }
}

/**
 * SPEC 12's "and its reason": which of SPEC 4.10's nine rungs decided a hand.
 *
 * The rung is carried rather than inferred because the outcome cannot say why:
 * rungs 2 and 9 are both a push and rungs 4, 5 and 8 are all a dealer win.
 * Nine arms, in the ladder's order.
 */
export function rungText(rung: Rung): string {
  switch (rung) {
    case 1:
      return 'Surrendered before the dealer played, half the wager returned.';
    case 2:
      return 'Both hands were naturals, so the hand pushed.';
    case 3:
      return 'A natural, paid three to two.';
    case 4:
      return 'The dealer held a natural.';
    case 5:
      return 'The hand went over 21.';
    case 6:
      return 'The dealer went over 21.';
    case 7:
      return 'The hand beat the dealer.';
    case 8:
      return 'The dealer beat the hand.';
    case 9:
      return 'Equal values, so the hand pushed.';
  }
}

/**
 * SPEC 8's "every action taken", as a history line names one.
 *
 * Seven arms rather than `actionText`'s five: SPEC 4.7's two insurance intents
 * are actions the player took and are recorded in the journal, and neither is a
 * `CoachAction`, because basic strategy has no opinion about the side wager.
 */
export function playerActionText(action: PlayerAction): string {
  switch (action) {
    case 'takeInsurance':
      return 'Insurance';
    case 'declineInsurance':
      return 'Declined insurance';
    case 'hit':
    case 'stand':
    case 'double':
    case 'split':
    case 'surrender':
      return actionText(action);
  }
}

/** SPEC 4.5's actions, as the coach names one. */
export function actionText(action: CoachAction): string {
  switch (action) {
    case 'hit':
      return 'Hit';
    case 'stand':
      return 'Stand';
    case 'double':
      return 'Double Down';
    case 'split':
      return 'Split';
    case 'surrender':
      return 'Surrender';
  }
}

/**
 * Which cell of SPEC 7's table answered, as one readable phrase.
 *
 * The three arms are `strategy.ts`'s three surfaces, and the phrase is what
 * SPEC 7's "explains it in one line" is built from: a player who is told only
 * that they were wrong has been scolded, which SPEC 7 says the coach never does.
 */
export function addressText(address: CellAddress): string {
  switch (address.surface) {
    case 'hard':
      return `a hard ${chips(address.total)} against ${address.up}`;
    case 'soft':
      return `a soft ${chips(address.total)} against ${address.up}`;
    case 'pair':
      return `a pair of ${address.pair}s against ${address.up}`;
  }
}

/**
 * A cell's preference list, as a phrase. "surrender, then hit".
 *
 * The whole list rather than the first entry, because `recommend` walks it down
 * to the first legal action and a player shown only the head would be told to
 * surrender at a table that does not offer it.
 */
export function preferenceText(preference: PreferenceList): string {
  return preference.map((action) => actionText(action).toLowerCase()).join(', then ');
}

/** SPEC 6's three tables, by name. */
export function tableText(table: TableId): string {
  switch (table) {
    case 'bronze':
      return 'Bronze';
    case 'silver':
      return 'Silver';
    case 'gold':
      return 'Gold';
  }
}

/** SPEC 9's eleven milestones, row for row. */
export function milestoneText(milestone: MilestoneId): string {
  switch (milestone) {
    case 'firstNatural':
      return 'First natural';
    case 'firstSplitWin':
      return 'First split win';
    case 'fiveHandStreak':
      return 'A five-hand win streak';
    case 'tenHandStreak':
      return 'A ten-hand win streak';
    case 'doubledBankroll':
      return 'Doubling the bankroll';
    case 'reachedSilver':
      return 'Reaching Silver';
    case 'reachedGold':
      return 'Reaching Gold';
    // The four numeric rows read their numbers off SPEC 9's own constants, so a
    // threshold that moves in `statistics.ts` cannot leave a stale label behind,
    // and the grouping is the locale's rather than this file's.
    case 'hundredHands':
      return `${chips(HUNDRED_HANDS)} hands played`;
    case 'thousandHands':
      return `${chips(THOUSAND_HANDS)} hands played`;
    case 'ninetyPercentAccuracy':
      return `${chips(ACCURACY_PERCENT)} percent accuracy over ${chips(ACCURACY_DECISIONS)} decisions`;
    case 'survivedAndRecovered':
      return `Survived below ${chips(LOW_WATER_PERCENT)} percent and recovered`;
  }
}
