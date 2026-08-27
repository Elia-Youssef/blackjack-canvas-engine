/**
 * Which game event fires which audio cue. `BJ-19`, item `K5`.
 *
 *   "Every cue named in the audio section is emitted on its stated trigger
 *    exactly once, and on no other trigger."
 *
 * SPEC 15 names thirteen cues and says no more about them than their names, so
 * the trigger of each is the game event its name denotes. That derivation is
 * written out below, cue by cue, and it is a **pure function of two frames**,
 * each frame being what the composition root already holds after a `drain` and
 * an `update`: the machine's snapshot, the accepted intent (or `null`), and
 * the awarded milestones. Nothing here listens to the DOM, reads the chrome
 * back, or holds state of its own, which is what lets
 * `tests/unit/cues.test.ts` drive the real machine headlessly and assert both
 * halves of the criterion: the exactly-once half and the no-other-trigger
 * half, the second as negative controls.
 *
 * **One observation point, and this module is it.** The double-fire hazard in
 * a design like this is chrome sync and an audio observer each seeing one
 * transition and each firing a cue for it, and the answer is not to be careful
 * but to be one place: the composition root computes the frame's cues at the
 * same boundary it already computes the coach's observations and the
 * announcer's deltas, hands them to the engine once, and nothing else in the
 * project offers a cue to anything. `src/main.ts` carries the call and the
 * comment tying it to this paragraph.
 *
 * **Reduced motion and Speed cannot change what fires.** The inputs below are
 * the machine's state and the intent the frame accepted; the motion policy and
 * the Speed setting decide how the presentation moves inside the windows those
 * states define, and neither appears here. A round played under either mode
 * produces the same cues in the same order, which item `K5`'s spec drives in
 * the browser over both arms of each.
 *
 * **Exactly once is per trigger occurrence, not per round.** A split deals two
 * cards and one round can settle four hands and a milestone at once; the
 * derivation below counts occurrences and the caller hears a stack, which is
 * the design rather than an accident of it.
 *
 * The thirteen mappings, stated once here and asserted in the tests:
 *
 *   - **card deal**: a card joined a hand, or the dealer drew one face up, or
 *     the hole card was dealt face down. Each card is one occurrence.
 *   - **card flip**: the hole card turned face up, which is the one frame
 *     `dealerConcealed` falls. The peek is expressly not this: it looks at the
 *     card without turning it, so it fires nothing.
 *   - **chip place**: the wager rose at the betting controls, one occurrence
 *     per accepted wager-raising intent (`tapChip`, `max`, `repeat`).
 *   - **chip clear**: the wager went to nothing while the betting screen
 *     stayed, which is the `clear` intent. The deal's commit also empties the
 *     wager, and is not a clear: the money moved to the table rather than back
 *     to the balance, and the phase change distinguishes the two.
 *   - **button press**: an intent was accepted. Every accepted intent in this
 *     game arrives from a press, and a press that does something more
 *     specific stacks its cues: a Hit is one button press and one card deal.
 *   - **win / blackjack / push / loss**: one occurrence per settled hand, at
 *     the frame the round result arrives, by outcome. A natural is the
 *     blackjack cue and not the win cue; a push is neither win nor loss; a
 *     surrender and a dealer win are both a loss, because five outcomes
 *     divide among four result cues and the two negative finishes share one.
 *   - **bust**: a hand went over 21, at the frame it happened, once per hand
 *     and once for the dealer. The settlement that follows a bust is the loss
 *     cue's business, not a second bust.
 *   - **shuffle**: the shoe reshuffled at the round boundary, which is the one
 *     frame `shoe.dealt` falls, because within a stack that number only ever
 *     rises.
 *   - **milestone**: one occurrence per award, in award order.
 *   - **bust out**: the frame the session runs out at its table, which is the
 *     entry to SPEC 10's `bustOut`.
 *
 * **What has no cue, on purpose.** The insurance offer, its acceptance and its
 * settlement fire nothing that SPEC 15 names: the stake is not the wager (so
 * no chip cue), and its result is not a hand outcome (so no result cue). The
 * peek fires nothing, per `cardFlip` above. A refused intent fires nothing,
 * because a refusal is not a press that did anything, and the notice line and
 * the announcement queue already carry it twice. The chrome's presentation
 * controls are silent for the same reason read forward: the overlay openers
 * and close, the coach, Speed and surface-size settings, and the mute itself
 * queue no intent, so `applied` never carries them and the button-press cue is
 * the machine's acceptances rather than the page's clicks.
 */

import { handValue } from '../core/hand';
import type { MilestoneId } from '../core/statistics';
import type { TableReadout } from '../core/table';
import type { IntentKind } from '../core/types';

import type { CueId } from './audio';

/** What one frame offers the derivation. Built by the composition root. */
export interface CueFrame {
  /** The intent the frame's drain accepted, or `null` when it accepted none. */
  readonly applied: IntentKind | null;
  /** The machine's snapshot, after the drain and the update. */
  readonly readout: TableReadout;
  /** SPEC 9's awarded milestones, in award order. */
  readonly milestones: readonly MilestoneId[];
}

/**
 * Everything this frame is worth hearing, in the order the events happened.
 *
 * `previous` is `null` on the first frame of a session and that frame fires
 * nothing, for the announcer's own reason: a session that opened with the
 * sounds of a state arriving would be scoring its own title screen.
 */
export function cuesFor(previous: CueFrame | null, next: CueFrame): readonly CueId[] {
  const cues: CueId[] = [];
  if (previous === null) {
    return cues;
  }
  const before = previous.readout;
  const now = next.readout;

  // The button press, first because it is the frame's own event: the press
  // happened before anything it did. A refusal is not here, because `applied`
  // carries acceptances only.
  if (next.applied !== null) {
    cues.push('buttonPress');
  }

  // The split. SPEC 4.6 separates the pair and deals one card to each half,
  // and the parent half's card replaces the card it lost, so a comparison of
  // card counts alone cannot see it: the parent's count does not move and the
  // new hand's rises from zero. A hand count that rises **during a round** has
  // one cause in the whole machine, which is the split; the first hand is
  // born at the deal with no cards and is not one, which is why the guard
  // reads "the round already had hands" rather than "the count rose". The
  // frame is recognised by that and charged the two cards SPEC 4.6 actually
  // dealt. No other hand can change on this frame: the frame accepted one
  // intent and it was the split.
  const split = before.hands.length > 0 && now.hands.length > before.hands.length;
  if (split) {
    cues.push('cardDeal', 'cardDeal');
  } else {
    // Cards joining hands, keyed by `walletHand` for the split hazard the
    // announcer writes down at length: `table.ts` inserts a split hand beside
    // its parent while `wallet.ts` appends it, so position in the list is not
    // stable and the wallet's index is.
    for (const hand of now.hands) {
      const had = before.hands.find((earlier) => earlier.walletHand === hand.walletHand);
      const grew = hand.cards.length - (had?.cards.length ?? 0);
      for (let card = 0; card < grew; card += 1) {
        cues.push('cardDeal');
      }
    }
  }

  // The dealer's cards. Three shapes, told apart by the concealed count:
  // a face-up card arrives (the count holds), the hole card is dealt face
  // down (the count rises), and the hole card turns over (the count falls).
  // The reveal is the flip and not a deal, so the growth in `dealerVisible`
  // on that frame is charged to the flip alone.
  //
  // **Two branches reveal the hole card inside the frame it was dealt, and on
  // both the cue is the deal's, on purpose.** A player natural against an up
  // card SPEC 4.4 never peeks behind ends the deal by branching straight to
  // the reveal in the same step that dealt the hole card, and a compressed
  // frame at Fast can carry the last deal step and the peek's natural arm in
  // one update. In both, `dealerConcealed` is zero on both sides of the
  // frame: no frame boundary ever observed the card face down, so there is
  // no fall to read and the arriving card is charged as a deal. That is the
  // visual's answer too, not an excuse borrowed from it: the play surface's
  // flip animation keys on concealment it previously observed, so on these
  // branches the card tweens in and never flips, and the audio and the felt
  // agree. A flip cue with no flip on screen would be item `K4`'s parity
  // broken in the name of a count.
  const flipped = now.dealerConcealed < before.dealerConcealed;
  if (flipped) {
    cues.push('cardFlip');
  } else {
    for (let card = 0; card < now.dealerVisible.length - before.dealerVisible.length; card += 1) {
      cues.push('cardDeal');
    }
    for (let card = 0; card < now.dealerConcealed - before.dealerConcealed; card += 1) {
      cues.push('cardDeal');
    }
    // The dealer's bust, on the draw that made it. A busted dealer never
    // draws again, `shouldHit` stops nothing else from stopping earlier, and
    // the value is read from the face-up cards only, which is all this
    // derivation is ever shown.
    if (now.dealerVisible.length > before.dealerVisible.length && handValue(now.dealerVisible).total > 21) {
      cues.push('bust');
    }
  }

  // The chips, at the controls and only there. The wager rising is a chip
  // placed; the wager falling to nothing while the betting screen stays is a
  // clear; the wager falling because the deal committed it is neither, and
  // the phase tells those two falls apart.
  if (now.wallet.wager > before.wallet.wager && now.phase.kind === 'betting') {
    cues.push('chipPlace');
  }
  if (
    before.wallet.wager > 0 &&
    now.wallet.wager === 0 &&
    before.phase.kind === 'betting' &&
    now.phase.kind === 'betting'
  ) {
    cues.push('chipClear');
  }

  // The player's busts, at the frame the hand went over, once per hand. The
  // state rather than the value, because the value is the announcer's to read
  // aloud and the state is the machine's own record of the event.
  for (const hand of now.hands) {
    const had = before.hands.find((earlier) => earlier.walletHand === hand.walletHand);
    if (hand.state === 'bust' && had?.state !== 'bust') {
      cues.push('bust');
    }
  }

  // The round boundary: results, and the shuffle if the shoe crossed its cut
  // card. Both belong to the one frame the round result arrives, because
  // `settleRound` settles every hand and asks the shoe for its boundary in
  // the same step.
  if (before.phase.kind !== 'roundResult' && now.phase.kind === 'roundResult') {
    for (const settled of now.phase.result.hands) {
      if (settled.outcome === 'BLACKJACK') {
        cues.push('blackjack');
      } else if (settled.outcome === 'PLAYER_WIN') {
        cues.push('win');
      } else if (settled.outcome === 'PUSH') {
        cues.push('push');
      } else {
        // `DEALER_WIN` and `SURRENDER`: the two negative finishes share the
        // one cue SPEC 15 gives them.
        cues.push('loss');
      }
    }
    // Within a stack `dealt` only rises; a fall is a new stack, which is the
    // reshuffle `shoe.endRound` performed at this boundary.
    if (now.shoe.dealt < before.shoe.dealt) {
      cues.push('shuffle');
    }
  }

  // The session's end at this table.
  if (before.phase.kind !== 'bustOut' && now.phase.kind === 'bustOut') {
    cues.push('bustOut');
  }

  // SPEC 9's awards, which are exactly once each by the statistics module's
  // own guard; one cue per award, in award order.
  const awarded = next.milestones.length - previous.milestones.length;
  for (let index = 0; index < awarded; index += 1) {
    cues.push('milestone');
  }

  return cues;
}
