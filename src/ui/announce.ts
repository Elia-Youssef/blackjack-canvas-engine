/**
 * The announcement queue, and what a frame's change is worth saying. `BJ-18`,
 * item `G4` (Critical).
 *
 * **This file is not the mirror and does not do the mirror's job.** QUALITY-BAR
 * section 4 is explicit that the two are different mechanisms: "A live region is
 * an event channel, not a representation: it cannot be navigated, re-read or
 * queried, so it does not satisfy 1.1.1, 1.3.1 or 4.1.2 on its own." The mirror
 * in `src/ui/components/mirror.ts` is the representation and satisfies 1.1.1 and
 * 1.3.1; the two regions this queue feeds are the event channel and satisfy
 * 4.1.3. Building one and calling it both is the failure item `G4` exists for,
 * and neither file can stand in for the other: the mirror never announces, and
 * nothing here is navigable.
 *
 * **The law, from QUALITY-BAR section 4, in one sentence each.**
 *
 *   1. *One queue.* Every announcement in the game goes through the object
 *      `createAnnouncementQueue` returns, and the two region elements are
 *      written only by what it emits.
 *   2. *Minimum 500 ms between polite writes.* A screen reader speaks a live
 *      region by replacing what it was about to say, so two writes inside one
 *      speech are one write with the first half missing.
 *   3. *Coalescing.* "A change arriving inside the interval replaces the pending
 *      one rather than queueing behind it." A player mid-deal wants the hand
 *      they now hold, not a recital of how it was assembled.
 *   4. *Except outcomes, which are never dropped.* Assertive entries queue in
 *      arrival order and are never replaced. They are the only entries a player
 *      cannot reconstruct from the mirror a second later, because the felt is
 *      swept at Next Hand.
 *
 * Without rule 2 the four-card deal at SPEC 5's 0.22 s interval clobbers itself
 * before anything is spoken, which is the defect the section names outright and
 * which `tests/unit/announce.test.ts` reproduces with a queue-free control.
 *
 * **The clock is the frame's raw `dt`, and it is neither the motion switch's nor
 * Speed's.** QUALITY-BAR section 4's 500 ms is an accessibility floor: it is how
 * long a speech synthesiser needs, which no setting in this game changes.
 * Reduced motion removes animation and must not change the sequence of states,
 * and Speed multiplies SPEC 5's *pacing* constants; announcement pacing is
 * neither. So the tick below is handed the same unscaled `dt` the machine is,
 * and `resolveMotion` is not consulted here at all. If a later part concludes
 * that Fast should shorten this floor as well, that is a change to QUALITY-BAR
 * section 4 and to item `G4`'s criterion, not an implementation detail.
 *
 * **Nothing in this file touches the DOM.** The queue is a value and the deltas
 * are a pure function of two machine snapshots, which is what lets both be unit
 * tested in Node with no browser at all; `src/ui/components/announcer.ts` is the
 * twenty lines that own the two elements.
 */

import type { Card } from '../core/cards';
import { handValue } from '../core/hand';
import type { MilestoneId } from '../core/statistics';
import type { TableReadout } from '../core/table';
import type { RoundResult } from '../core/types';

import { chips as formatChips, delta as formatDelta } from './format';
import type { Notice } from './state';
import {
  cardText,
  handMirrorName,
  handValueText,
  milestoneText,
  outcomeText,
  phaseText,
  reasonText,
} from './text';

/**
 * QUALITY-BAR section 4's floor between polite writes, in seconds.
 *
 * Seconds rather than milliseconds because the frame's `dt` is in seconds and a
 * unit mismatch here is a defect that looks like a working queue running 1000
 * times too fast. The section states 500 ms; this is that number.
 */
export const POLITE_INTERVAL_SECONDS = 0.5;

/** Which of the two regions an announcement is written to. */
export type AnnouncementPriority = 'polite' | 'assertive';

/** One thing to say, and which region says it. */
export interface Announcement {
  readonly priority: AnnouncementPriority;
  readonly text: string;
}

/** What the queue is holding right now, for a test and for the probe. */
export interface QueueState {
  /** The polite entry waiting, or `null`. At most one, by rule 3. */
  readonly pendingPolite: string | null;
  /** How many outcomes are waiting. Never collapsed, by rule 4. */
  readonly pendingOutcomes: number;
  /** Seconds since the last write. */
  readonly since: number;
}

/** The one queue. */
export interface AnnouncementQueue {
  /** Offer an announcement. Polite entries coalesce; outcomes never do. */
  push(announcement: Announcement): void;
  /**
   * Advance the clock and return what should be written this frame, or `null`.
   *
   * At most one write per frame, which is the whole of rule 2: a frame that
   * emitted two would be two writes with no interval between them.
   */
  tick(dt: number): Announcement | null;
  /** What is waiting. Read by tests and by the accessibility probe. */
  state(): QueueState;
}

/** What a queue may be built with. The interval is injectable for tests only. */
export interface QueueOptions {
  readonly interval?: number;
}

export function createAnnouncementQueue(options: QueueOptions = {}): AnnouncementQueue {
  const interval = options.interval ?? POLITE_INTERVAL_SECONDS;
  /**
   * Seconds since the last write, started at the interval so the first
   * announcement of a session is spoken on the frame it happens rather than
   * half a second after the page has already moved on.
   */
  let since = interval;
  let pendingPolite: Announcement | null = null;
  const outcomes: Announcement[] = [];

  return {
    push(announcement: Announcement): void {
      if (announcement.priority === 'assertive') {
        // Rule 4. Appended rather than replacing, and never compared against
        // what is already waiting: two hands of a split can settle to the same
        // sentence, and dropping the second because it reads like the first
        // would be dropping an outcome.
        outcomes.push(announcement);
        return;
      }
      // Rule 3, in one line. Whatever was waiting is replaced.
      pendingPolite = announcement;
    },

    tick(dt: number): Announcement | null {
      since += dt;
      if (since < interval) {
        return null;
      }
      // Outcomes first: they are the entries a player cannot recover from the
      // mirror, and they are why the interval applies to this region too. Two
      // outcomes written into one region inside one speech would be rule 2's
      // defect wearing rule 4's clothes, so they take their turn rather than
      // being written the moment they arrive.
      const outcome = outcomes.shift();
      if (outcome !== undefined) {
        since = 0;
        return outcome;
      }
      if (pendingPolite === null) {
        return null;
      }
      const polite = pendingPolite;
      pendingPolite = null;
      since = 0;
      return polite;
    },

    state: (): QueueState => ({
      pendingPolite: pendingPolite?.text ?? null,
      pendingOutcomes: outcomes.length,
      since,
    }),
  };
}

// ---------------------------------------------------------------------------
// What one frame's change is worth saying
// ---------------------------------------------------------------------------

/** The chrome-side facts a delta needs beside the machine's snapshot. */
export interface AnnounceContext {
  /** The most recent refusal, or `null`. SPEC 4.11's reason, as an event. */
  readonly notice: Notice | null;
  /** SPEC 9's awarded milestones, in award order. */
  readonly milestones: readonly MilestoneId[];
}

/** Everything the previous frame said, so this frame can say what moved. */
export interface AnnounceFrame {
  readonly readout: TableReadout;
  readonly context: AnnounceContext;
}

/** A hand's total as a sentence fragment, or nothing while it holds no cards. */
function totalOf(cards: readonly Card[]): string {
  return cards.length === 0 ? '' : ` ${handValueText(handValue(cards))}.`;
}

/** SPEC 12's result, as the one sentence the assertive region carries. */
export function roundOutcomeText(result: RoundResult): string {
  const hands = result.hands
    .map((settled, index) => {
      const net = formatDelta(settled.credit - settled.wager);
      return result.hands.length === 1
        ? `${outcomeText(settled.outcome)}, ${net}`
        : `Hand ${formatChips(index + 1)} ${outcomeText(settled.outcome)}, ${net}`;
    })
    .join('. ');
  const side =
    result.insurance === null
      ? ''
      : ` ${result.insurance.evenMoney ? 'Even money' : 'Insurance'} ` +
        `${formatDelta(result.insurance.net)}.`;
  return `Round result. ${hands}.${side} Balance ${formatChips(result.chips)}.`;
}

/**
 * Everything this frame is worth announcing, in the order it should be said.
 *
 * A pure function of two snapshots, which is what makes it testable without a
 * page and what keeps it honest: a delta computed from the DOM would be a
 * second reading of a state the sync step has already resolved once. The
 * announcer pushes each entry into the queue, and the queue decides which of
 * them a player actually hears.
 *
 * **`previous` is `null` on the first frame of a session, and that frame
 * announces nothing at all.** Two reasons, and the second is the load-bearing
 * one. A session opening by reciting an empty felt would be announcing the
 * absence of a round; and QUALITY-BAR section 4 asks that "both region elements
 * exist in the initial HTML and only their text changes", whose purpose is that
 * a region is in the accessibility tree *before* it is written to, since a
 * region that arrives with its text already in it is not announced by anything.
 * The chrome is built in one turn and the first frame runs synchronously inside
 * it, so a first-frame write would land in the initial tree and be silent
 * anyway. The opening state is the mirror's job, which is the division these two
 * mechanisms exist for.
 */
export function announcementsFor(
  previous: AnnounceFrame | null,
  next: AnnounceFrame,
): readonly Announcement[] {
  const said: Announcement[] = [];
  const { readout } = next;
  const prior = previous;

  if (prior === null) {
    return said;
  }
  const before = prior.readout;

  // SPEC 10's screen changed. The two screens a player cannot reconstruct from
  // the felt a moment later are the two that go to the assertive region, which
  // is QUALITY-BAR section 4's "reserved for round and match outcomes" read
  // against this game's phases: the round result is the round outcome and the
  // bust-out is the session's.
  if (before.phase.kind !== readout.phase.kind) {
    if (readout.phase.kind === 'roundResult') {
      said.push({ priority: 'assertive', text: roundOutcomeText(readout.phase.result) });
    } else if (readout.phase.kind === 'bustOut') {
      said.push({
        priority: 'assertive',
        text:
          `Out at this table. Your balance is ${formatChips(readout.wallet.chips)}, ` +
          'below the table minimum.',
      });
    } else {
      said.push({ priority: 'polite', text: phaseText(readout.phase, readout.hands.length) });
    }
  }

  // SPEC 4.6's split. The hand count only ever rises inside a round, and the
  // sweep at Next Hand takes it to zero, which is not a split and is already
  // covered by the phase change above.
  if (readout.hands.length > before.hands.length && readout.phase.kind === 'playerTurn') {
    said.push({
      priority: 'polite',
      text: `Split. ${formatChips(readout.hands.length)} hands in play.`,
    });
  }

  // A card arriving, per hand. One sentence per hand per frame: the deal adds
  // one card per step, and a frame that added two to one hand is a frame whose
  // first card the player never needed separately.
  //
  // **Keyed on the wallet's index, never on the position in the list**, and that
  // is the split hazard `core/types.ts` writes down: `table.ts` **inserts** a
  // split hand beside its parent, because SPEC 4.6 plays hands left to right,
  // while `wallet.ts` **appends** it. So a second split shifts every hand to the
  // right of it one place along, and a comparison by position would see a hand
  // that had only moved as a hand that had just been dealt a card: a resplit of
  // the leftmost of three hands would announce a card nobody drew, on a hand
  // that had been standing since before the split. `HandInPlay.walletHand` is
  // stable for the whole round and exists for exactly this reading.
  readout.hands.forEach((hand, index) => {
    const had =
      before.hands.find((earlier) => earlier.walletHand === hand.walletHand)?.cards.length ?? 0;
    if (hand.cards.length <= had) {
      return;
    }
    const arrived = hand.cards[hand.cards.length - 1];
    if (arrived === undefined) {
      return;
    }
    const where = readout.hands.length === 1 ? '' : `Hand ${formatChips(index + 1)}: `;
    said.push({
      priority: 'polite',
      text: `${where}${cardText(arrived)}.${totalOf(hand.cards)}`,
    });
  });

  // The dealer's own cards, including the hole card turning face up: the
  // machine publishes the face-up cards, so the reveal is a card arriving here
  // rather than a second rule about which cards count.
  if (readout.dealerVisible.length > before.dealerVisible.length) {
    const arrived = readout.dealerVisible[readout.dealerVisible.length - 1];
    if (arrived !== undefined) {
      said.push({
        priority: 'polite',
        text: `Dealer: ${cardText(arrived)}.${totalOf(readout.dealerVisible)}`,
      });
    }
  }

  // SPEC 4.6's left-to-right play: which hand the machine is now asking about.
  if (
    readout.phase.kind === 'playerTurn' &&
    before.phase.kind === 'playerTurn' &&
    readout.phase.activeHand !== before.phase.activeHand
  ) {
    const active = readout.hands[readout.phase.activeHand];
    if (active !== undefined) {
      said.push({
        priority: 'polite',
        text: `${handMirrorName(
          active,
          { index: readout.phase.activeHand, of: readout.hands.length, active: true },
          active.cards.length === 0 ? null : handValue(active.cards),
        )}.`,
      });
    }
  }

  // SPEC 4.11's "with a reason surfaced to the player", as an event. The `BJ-15`
  // review recorded that a refusal reached keyboard and touch users through
  // `title` alone; this is the half of the answer that reaches a player who was
  // not looking at the notice line. The mirror carries the standing half.
  const reason = next.context.notice;
  if (reason !== null && reason !== prior.context.notice) {
    said.push({ priority: 'polite', text: reasonText(reason.reason) });
  }

  // SPEC 9's milestones, which are awarded exactly once each.
  if (next.context.milestones.length > prior.context.milestones.length) {
    for (const id of next.context.milestones.slice(prior.context.milestones.length)) {
      said.push({ priority: 'polite', text: `Milestone: ${milestoneText(id)}.` });
    }
  }

  return said;
}
