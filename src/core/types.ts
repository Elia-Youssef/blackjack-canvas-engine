/**
 * The game's discriminated unions: SPEC 10's eleven phases, the intents that
 * drive them, and the hand a round is played on. Built at `BJ-7` as part of
 * item `C2`, Critical.
 *
 * DESIGN section 1 gives this file "discriminated unions for Phase, Intent,
 * Outcome, HandState" and DESIGN section 2 gives the shape of the first of
 * them. It is the only module `BJ-7` adds beside `table.ts`, and it is on that
 * list rather than invented for this part.
 *
 * **Types only, and no behaviour at all.** Nothing here decides anything: the
 * legality of an intent, the transition between two phases and every timer are
 * `table.ts`'s, which DESIGN section 2 makes "the only authority". A predicate
 * added here would be a second authority over the same question, and the two
 * would agree until the day one moved.
 *
 * **`Outcome` is re-exported rather than re-declared.** `settlement.ts` at
 * `BJ-5` declares it, since settlement is the only thing that produces one, and
 * that file's header named this module as the one that would absorb it. A
 * second declaration is exactly what it warned against, and moving the first
 * would edit a merged part and leave the derivation in
 * `tests/unit/payout-integrality.test.ts` describing a module the union had
 * left. So the union has one declaration and this file is where the rest of the
 * game imports it from.
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { Card } from './cards';
import type { ChipDenomination, TableId } from './wallet';

export type { Outcome } from './settlement';

// ---------------------------------------------------------------------------
// SPEC 10: the eleven phases
// ---------------------------------------------------------------------------

/**
 * The name of a phase. SPEC 10 lists eleven and there is no twelfth.
 *
 * Split out from `Phase` because the legality table, the readout and every
 * assertion about "which screen is this" want the tag and not the payload.
 */
export type PhaseKind =
  | 'start'
  | 'betting'
  | 'dealing'
  | 'peek'
  | 'insurance'
  | 'playerTurn'
  | 'reveal'
  | 'dealerTurn'
  | 'settling'
  | 'roundResult'
  | 'bustOut';

/**
 * One card of SPEC 4.3's opening deal, as the `dealing` queue holds it.
 *
 * SPEC 4.3 deals player, dealer up, player, dealer down, so `playerCard`
 * appears twice in the queue and the two dealer steps once each. The queue is
 * the machine's; that the cards really arrive face up, face down and in that
 * order is item `B6` at `BJ-8`, whose criterion states the order in as many
 * words.
 */
export type DealStep = 'playerCard' | 'dealerUp' | 'dealerHole';

/**
 * What SPEC 4.7 puts in front of the player on a dealer Ace.
 *
 * `stake` is `wager / 2` of the **initial** wager per SPEC 4.11, fixed at the
 * offer and unaffected by any later split or double. `evenMoney` is SPEC 4.7's
 * other reading of the same stake, offered when the player holds a natural, and
 * it is a field of the offer rather than a second intent because SPEC 4.7
 * settles even money "through the ordinary insurance path": one stake, one
 * resolution, one net.
 *
 * Taking the stake out of the balance, the 2:1 payout, the deferred remainder
 * and the `+wager` net on both even-money branches are all item `B11` at
 * `BJ-8`, whose criterion names every one of them.
 */
export interface InsuranceOffer {
  readonly stake: number;
  readonly evenMoney: boolean;
}

/**
 * One hand as SPEC 12's round result prints it.
 *
 * `credit` is what SPEC 4.11's settlement handed back, `wager + net`, so a lost
 * hand credits zero and a push credits the wager. The outcome and its reason,
 * both hand values, the insurance result and the coach verdict are the other
 * six things SPEC 12 asks for, and they are item `C8` at `BJ-15`; the net that
 * produces the credit comes from `settlement.ts`'s ladder, wired at `BJ-8`.
 */
export interface SettledHand {
  readonly wager: number;
  readonly credit: number;
}

/** SPEC 12's round result, as much of it as the machine owns. */
export interface RoundResult {
  readonly hands: readonly SettledHand[];
  /** SPEC 12's "resulting balance", read after every hand has settled. */
  readonly chips: number;
}

/**
 * The eleven phases of SPEC 10, in that section's order. DESIGN section 2.
 *
 * **`insurance` is a phase and not a step inside `peek`.** SPEC 4.4 requires
 * the offer to be made and closed *before the peek result is applied*, because
 * insurance can only win on the branch the peek decides and would otherwise
 * resolve after the one outcome it can win on. Folding it into `peek` puts the
 * offer on the wrong side of that line, and SPEC 10 says so directly.
 *
 * Four of the eleven carry a payload and seven do not, which is DESIGN section
 * 2's table exactly. A payload is here when the phase cannot be rendered or
 * advanced without it: the deal queue is what `dealing` counts down, the offer
 * is what `insurance` is asking, the active hand is what `playerTurn` is about,
 * and the result is what `roundResult` prints. Nothing else needs one, and a
 * field added to a phase that does not need it is a second copy of state
 * `table.ts` already holds.
 */
export type Phase =
  | { readonly kind: 'start' }
  | { readonly kind: 'betting' }
  | { readonly kind: 'dealing'; readonly queue: readonly DealStep[] }
  | { readonly kind: 'peek' }
  | { readonly kind: 'insurance'; readonly offer: InsuranceOffer }
  | { readonly kind: 'playerTurn'; readonly activeHand: number }
  | { readonly kind: 'reveal' }
  | { readonly kind: 'dealerTurn' }
  | { readonly kind: 'settling' }
  | { readonly kind: 'roundResult'; readonly result: RoundResult }
  | { readonly kind: 'bustOut' };

// ---------------------------------------------------------------------------
// SPEC 10: what the player can do, and nothing else
// ---------------------------------------------------------------------------

/**
 * The name of an intent. Seventeen, read off SPEC 10's flow diagram.
 *
 * **The three overlays are not here.** SPEC 10 makes Settings, How to Play and
 * Statistics "reachable at any time and never blocking state", so they are
 * chrome rather than moves: item `C5` at `BJ-15` grades that opening and then
 * closing any overlay leaves game state unchanged. An overlay intent would put
 * three rows in the legality table that are legal in all eleven phases and mean
 * nothing, and would invite a later part to route a real transition through one.
 */
export type IntentKind =
  | 'chooseTable'
  | 'start'
  | 'tapChip'
  | 'clear'
  | 'repeat'
  | 'max'
  | 'deal'
  | 'takeInsurance'
  | 'declineInsurance'
  | 'hit'
  | 'stand'
  | 'double'
  | 'split'
  | 'surrender'
  | 'nextHand'
  | 'dropTable'
  | 'resetBankroll';

/**
 * One thing the player asked for. SPEC 10's diagram, as a union.
 *
 * Three of the seventeen carry data and the rest are bare. `tapChip` carries
 * which chip, because SPEC 4.11 has four denominations and the tap is rejected
 * rather than clamped when the one chosen does not fit; `chooseTable` and
 * `dropTable` carry which table, because SPEC 6 and SPEC 4.12 both name a
 * destination. Nothing carries a hand index: SPEC 4.6 plays hands left to
 * right and the active hand is the machine's, so an index on the intent would
 * let the chrome act on a hand the machine is not on.
 *
 * Every field is `readonly`, so an intent that has been queued cannot be edited
 * before it is drained. That is the whole of the guarantee: a caller that
 * defeats the type gets the behaviour it built.
 */
export type Intent =
  | { readonly kind: 'chooseTable'; readonly table: TableId }
  | { readonly kind: 'start' }
  | { readonly kind: 'tapChip'; readonly chip: ChipDenomination }
  | { readonly kind: 'clear' }
  | { readonly kind: 'repeat' }
  | { readonly kind: 'max' }
  | { readonly kind: 'deal' }
  | { readonly kind: 'takeInsurance' }
  | { readonly kind: 'declineInsurance' }
  | { readonly kind: 'hit' }
  | { readonly kind: 'stand' }
  | { readonly kind: 'double' }
  | { readonly kind: 'split' }
  | { readonly kind: 'surrender' }
  | { readonly kind: 'nextHand' }
  | { readonly kind: 'dropTable'; readonly table: TableId }
  | { readonly kind: 'resetBankroll' };

// ---------------------------------------------------------------------------
// The hand a round is played on. DESIGN section 2.
// ---------------------------------------------------------------------------

/**
 * What a hand is doing. DESIGN section 2's six states.
 *
 * `live` is the only non-terminal one. SPEC 4.9 begins the dealer's turn once
 * every hand has reached one of the other five, and warns that by the time the
 * hole card is revealed no hand is `live` any more, so a live-hand test at that
 * moment would mean the dealer never draws at all.
 */
export type HandState = 'live' | 'stood' | 'bust' | 'doubled' | 'surrendered' | 'blackjack';

/**
 * One player hand, mid-round. DESIGN section 2.
 *
 * **Named `HandInPlay` rather than DESIGN section 2's `PlayerHand`, and the
 * reason is not tidiness.** `settlement.ts` already exports a `PlayerHand`,
 * which is the player *side of a settlement*: cards, one wager, whether the
 * hand surrendered, and its split origin. `BJ-8` has to import both in one
 * file to settle a round, and two types of the same name in one directory is
 * how a call site ends up passing the wrong one. The fields below are DESIGN
 * section 2's exactly; only the name differs.
 *
 * `fromSplit` is what makes a two-card 21 pay 1:1 instead of 3:2 and
 * `fromSplitAces` is what forbids hitting, per SPEC 4.6. Both are set once at
 * split time and never recomputed, so the rule cannot drift. Setting them is
 * item `B10` at `BJ-8`.
 */
export interface HandInPlay {
  readonly cards: readonly Card[];
  readonly wager: number;
  readonly state: HandState;
  readonly fromSplit: boolean;
  readonly fromSplitAces: boolean;
}
