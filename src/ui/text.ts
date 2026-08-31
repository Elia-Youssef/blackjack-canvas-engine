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

import type { Card, Rank, Suit } from '../core/cards';
import type { HandValue } from '../core/hand';
import type { HouseRules } from '../core/rules';
import type { Rung, Outcome } from '../core/settlement';
import type { CellAddress, CoachAction, PreferenceList } from '../core/strategy';
import type { RejectionReason } from '../core/table';
import type { HandInPlay, HandState, InsuranceOffer, Phase, PlayerAction } from '../core/types';
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
 * Why the start screen greys a table, when the machine's one word is not enough.
 * `BJ-21`, the user-approved rider on the chooser's refusal sentence.
 *
 * SPEC 6 gives entry two conditions, an unlock threshold on the best balance
 * ever reached and a table minimum the current balance has to cover, and
 * `core/wallet.ts`'s `canEnter` is their conjunction. The machine answers a
 * refused `chooseTable` with the single reason `table-locked` for either, which
 * is right for a machine: both are the same refusal and nothing downstream of
 * the wallet branches on which. It is not right for a player, who is told "not
 * yet" and cannot tell whether the answer is "win more" or "you cannot afford
 * this table today".
 *
 * So the display reason is derived at the chooser, from the same two readings
 * `canEnter` makes, and these are its two names. **The machine's refusal kinds
 * are untouched**: `RejectionReason` still carries `table-locked` and
 * `table.ts` still returns it, so this is a second sentence for one machine
 * answer rather than a second rule.
 */
export type ChooserRefusal = 'table-not-unlocked' | 'table-unaffordable';

/**
 * Everything the chrome has a sentence for: the machine's reasons, and the
 * chooser's two.
 *
 * A union rather than a second function, because the mirror lists every greyed
 * control on the current screen through one call and the start screen's tables
 * are among them. Widening the parameter keeps every existing caller compiling
 * and keeps the switch below exhaustive over both halves at once.
 */
export type DisplayReason = RejectionReason | ChooserRefusal;

/**
 * Why an action was refused. SPEC 4.11, SPEC 10 and the availability rules of
 * SPEC 4.5, 4.6, 4.7 and 4.8.
 *
 * Nineteen arms and no default, so a reason added to any of the three layers,
 * or to the chooser's pair, is a compile error here rather than a blank line on
 * screen.
 */
export function reasonText(reason: DisplayReason): string {
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

    // The chooser's two, which are one `table-locked` split by its cause. The
    // machine says the same word for both; the start screen knows which of
    // SPEC 6's two conditions failed, and a player who is told to win more
    // when they merely cannot cover the minimum today has been told the wrong
    // thing. Neither names a number: the button beside the sentence already
    // carries the table's own minimum and maximum, and the balance it is being
    // measured against is a continuous readout on the same screen.
    case 'table-not-unlocked':
      return 'That table unlocks at a higher best balance than you have reached.';
    case 'table-unaffordable':
      return 'Your balance is below that table minimum.';

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

// ---------------------------------------------------------------------------
// `BJ-18`: the sentences the mirror and the announcements are built from
// ---------------------------------------------------------------------------

/**
 * A card as a word. QUALITY-BAR section 4's one concession to the canvas.
 *
 * That section allows "a card's rank and suit" to live solely on canvas, and
 * requires in the same sentence that those glyphs "appear in the mirror as
 * words". This is that sentence: `A` of `spades` is "Ace of spades", never
 * "A spades", because a screen reader reading the letter A beside a suit is
 * reading the glyph rather than the card.
 */
export function cardText(card: Card): string {
  return `${rankText(card.rank)} of ${suitText(card.suit)}`;
}

/** The thirteen ranks as words. `10` is "Ten" and never "one zero". */
export function rankText(rank: Rank): string {
  switch (rank) {
    case 'A':
      return 'Ace';
    case '2':
      return 'Two';
    case '3':
      return 'Three';
    case '4':
      return 'Four';
    case '5':
      return 'Five';
    case '6':
      return 'Six';
    case '7':
      return 'Seven';
    case '8':
      return 'Eight';
    case '9':
      return 'Nine';
    case '10':
      return 'Ten';
    case 'J':
      return 'Jack';
    case 'Q':
      return 'Queen';
    case 'K':
      return 'King';
  }
}

/** The four suits as words. Lower case, because they are read inside a phrase. */
export function suitText(suit: Suit): string {
  switch (suit) {
    case 'clubs':
      return 'clubs';
    case 'diamonds':
      return 'diamonds';
    case 'hearts':
      return 'hearts';
    case 'spades':
      return 'spades';
  }
}

/**
 * A hand's total, as QUALITY-BAR section 4's naming template spells one.
 *
 * The template's own example is "soft 16", so a soft hand is named that way
 * exactly. A hard hand is named "hard 16" rather than "16": the section gives
 * only the soft example, and the symmetric form is the one a player can act on,
 * since "16" alone leaves them to infer that the absence of the word soft means
 * the opposite. SPEC 4.2's own vocabulary carries both words.
 */
export function handValueText(value: HandValue): string {
  return `${value.soft ? 'soft' : 'hard'} ${chips(value.total)}`;
}

/**
 * What one hand is doing right now, as one word.
 *
 * `active` is not a `HandState`: SPEC 4.6 plays hands left to right and the
 * machine names the one it is asking about on the phase, not on the hand, so
 * "active" is a fact about the round rather than about the hand. It is the word
 * QUALITY-BAR section 4's template uses, and `handMirrorName` passes it in.
 */
export function handStateText(state: HandState): string {
  switch (state) {
    case 'live':
      return 'waiting';
    case 'stood':
      return 'standing';
    case 'bust':
      return 'bust';
    case 'doubled':
      return 'doubled';
    case 'surrendered':
      return 'surrendered';
    case 'blackjack':
      return 'blackjack';
  }
}

/** What `handMirrorName` needs about one hand's place in the round. */
export interface HandPlace {
  /** Zero based, the index into `readout.hands`, which is SPEC 4.6's order. */
  readonly index: number;
  /** How many hands the round is carrying. */
  readonly of: number;
  /** Whether the machine is asking about this hand right now. */
  readonly active: boolean;
}

/**
 * QUALITY-BAR section 4's naming template, and nothing else.
 *
 *   "a list of hands, each with an accessible name like 'Hand 2 of 3, active,
 *    soft 16, wager 100'"
 *
 * Four fields in that order, comma separated: the hand's place in the round, its
 * state, its value and its wager. The section's own example is reproduced
 * exactly by a soft 16 in the second of three hands with a wager of 100, and
 * `tests/unit/mirror-text.test.ts` asserts that sentence character for
 * character rather than asserting the shape it happens to have.
 *
 * A hand with no cards has no value to name, so the value field reads "no
 * cards": the template's shape is kept and the field says what is true, which
 * is the reading a list of hands mid-deal needs.
 */
export function handMirrorName(hand: HandInPlay, place: HandPlace, value: HandValue | null): string {
  const state = place.active ? 'active' : handStateText(hand.state);
  const total = value === null ? 'no cards' : handValueText(value);
  return (
    `Hand ${chips(place.index + 1)} of ${chips(place.of)}, ${state}, ` +
    `${total}, wager ${chips(hand.wager)}`
  );
}

/**
 * The dealer's hand as the mirror states it. SPEC 11's own reading.
 *
 * "Dealer visible hand value counts face-up cards only" while the hole card is
 * down, so the concealed card is named as a fact rather than folded into the
 * total. The machine publishes the count of face-down cards, so this cannot
 * name a card the player cannot see.
 */
export function dealerMirrorText(
  visible: readonly Card[],
  concealed: number,
  value: HandValue | null,
): string {
  if (visible.length === 0) {
    return concealed === 0 ? 'Dealer has no cards.' : 'Dealer holds one card face down.';
  }
  const total = value === null ? '' : ` ${handValueText(value)}`;
  const hidden = concealed === 0 ? '' : `, ${chips(concealed)} face down`;
  return `Dealer showing${total}${hidden}.`;
}

/**
 * What SPEC 10's screen is, and what the player is being asked for.
 *
 * One sentence per phase, including the five timed ones, because a mirror that
 * went quiet for the whole of a deal would be a mirror of some of the state. The
 * five carry no instruction, because none of them accepts an intent.
 */
export function phaseText(phase: Phase, hands: number): string {
  switch (phase.kind) {
    case 'start':
      return 'Start screen. Choose a table, then Start.';
    case 'betting':
      return 'Betting. Build a wager from the chips, then Deal.';
    case 'dealing':
      return 'Dealing.';
    case 'peek':
      return 'The dealer is checking for a natural.';
    case 'insurance':
      return phase.offer.evenMoney
        ? 'Even money offered on your natural. Take it or decline it.'
        : 'Insurance offered against a dealer natural. Take it or decline it.';
    case 'playerTurn':
      return hands <= 1
        ? 'Your turn.'
        : `Your turn on hand ${chips(phase.activeHand + 1)} of ${chips(hands)}.`;
    case 'reveal':
      return 'The dealer reveals the hole card.';
    case 'dealerTurn':
      return 'The dealer plays.';
    case 'settling':
      return 'Settling the round.';
    case 'roundResult':
      return 'Round result. Read the hands, then Next Hand.';
    case 'bustOut':
      return 'Out at this table. Drop to a lower table, or take the free reset.';
  }
}

/**
 * The document title, which item `G6` requires to reflect the current state.
 *
 * The state first and the game second, which is the order a tab strip truncates
 * from: a row of tabs all reading "Blackjack" tells a player nothing, and the
 * screen is the part that moves. `document.title` is written from the sync step
 * like every other piece of chrome, and only when it changed.
 */
export function documentTitle(phase: Phase): string {
  return `${screenTitle(phase)} - Blackjack`;
}

/** The short name of one screen, as the title bar carries it. */
export function screenTitle(phase: Phase): string {
  switch (phase.kind) {
    case 'start':
      return 'Choose a table';
    case 'betting':
      return 'Place your wager';
    case 'dealing':
      return 'Dealing';
    case 'peek':
      return 'Dealer peek';
    case 'insurance':
      return phase.offer.evenMoney ? 'Even money' : 'Insurance';
    case 'playerTurn':
      return 'Your turn';
    case 'reveal':
      return 'Dealer reveals';
    case 'dealerTurn':
      return 'Dealer plays';
    case 'settling':
      return 'Settling';
    case 'roundResult':
      return 'Round result';
    case 'bustOut':
      return 'Out at this table';
  }
}

/** SPEC 4.7's offer, as the mirror states the decision being asked for. */
export function offerText(offer: InsuranceOffer): string {
  return offer.evenMoney
    ? `Even money on your natural, for a stake of ${chips(offer.stake)}.`
    : `Insurance against a dealer natural, for a stake of ${chips(offer.stake)}. It pays 2 to 1.`;
}

/**
 * The house rules in force, as real DOM text. QUALITY-BAR section 4.
 *
 * "Anything needed to make a decision, house rules, table limits, hand values,
 * is real DOM text; the canvas may repeat it decoratively." SPEC 16 has the felt
 * print exactly these lines, and this is the reachable copy of them.
 */
export function houseRulesText(rules: HouseRules): string {
  return (
    `${chips(rules.decks)} decks. Dealer stands on all 17s. Blackjack pays 3 to 2. ` +
    `Insurance pays 2 to 1. Double after split ${rules.doubleAfterSplit ? 'on' : 'off'}. ` +
    `Surrender ${rules.surrender ? 'on' : 'off'}. Even money ${rules.evenMoney ? 'on' : 'off'}.`
  );
}

/**
 * One unavailable control, as the mirror lists it. The `BJ-15` review's `MIN-4`.
 *
 *   "a disabled action control's refusal reason lives on `title` only, which
 *    keyboard and touch users cannot reach"
 *
 * The reason is put in three reachable places by this part and this is the
 * navigable one: a list a screen reader user can walk at any time, rather than
 * an event they had to be listening for. The other two are the control's own
 * accessible name, written by `setDisabled`, and the announcement the polite
 * region makes when a press is actually refused.
 */
export function unavailableText(label: string, reason: DisplayReason): string {
  return `${label}: ${reasonText(reason)}`;
}

// ---------------------------------------------------------------------------
// `BJ-21`: the sentences the recovery panel is built from
// ---------------------------------------------------------------------------

/**
 * The recovery panel's heading. `BJ-21`, item `M4`, QUALITY-BAR section 12.
 *
 * Three sentences rather than one, because the panel is a heading, a paragraph
 * and a control, and each is its own whole string here for the reason every
 * other sentence in this file is: a panel that assembled its own prose would be
 * a second place a sentence lived. Nothing about the caught error appears in
 * any of them. What a player can act on is that the game stopped and that
 * reloading starts it again; a message from a stack is neither.
 */
export function recoveryTitle(): string {
  return 'The game stopped';
}

/**
 * What happened, and what was kept. Deliberately exact about the second half:
 * SPEC 13 persists the best balance, the statistics, the milestones, the
 * history and the settings at each round boundary and at each setting change,
 * and it never persisted the chips in play, so a round interrupted here costs
 * that round and nothing else. Promising more than that would be a lie the
 * next reload would tell on.
 */
export function recoveryMessage(): string {
  return (
    'Something went wrong, so the game stopped rather than carry on in a state it ' +
    'could not trust. Everything saved at the end of the last round is still there. ' +
    'Reload to start again.'
  );
}

/** The panel's one action. QUALITY-BAR section 12's "working reload action". */
export function recoveryReloadLabel(): string {
  return 'Reload';
}

/**
 * One milestone row, with whether it has been awarded stated in words.
 *
 * Item `G3`: "no state is conveyed by colour alone". `BJ-18` found this row
 * distinguishing an awarded milestone from an unawarded one by `--bj-positive`
 * against `--bj-text-muted` and by nothing else, which is invisible to a player
 * with a colour-vision deficiency and to every player under forced colors,
 * where both tokens collapse to `CanvasText`. The colour stays, because it is a
 * good glance-level cue; the words are what carry the state.
 */
export function milestoneRowText(milestone: MilestoneId, awarded: boolean): string {
  return `${milestoneText(milestone)}: ${awarded ? 'awarded' : 'not yet'}`;
}
