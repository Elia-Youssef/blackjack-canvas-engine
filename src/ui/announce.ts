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
 * **Rule 3 coalesces within a class, not across all of them, and `AUDIT-2` is
 * why.** One frame of this machine produces several announcements: entering
 * SPEC 10's `reveal` turns the hole card face up in the same step, and SPEC
 * 4.6's split deals onto both halves in the step that splits. With one pending
 * entry the second of them overwrote the first before any tick could write it,
 * so the reveal sentence was spoken in no round at any frame rate and a split's
 * own sentence was always lost (finding `Z5-01`, 42 of 42 reveals silent). Every
 * announcement therefore carries an `AnnouncementKind`, and the pending set
 * holds at most one entry per kind, replaced in place so the order they arrived
 * in is the order they are said in. Two kinds sit outside that: outcomes, by
 * rule 4, and milestones, whose award happens exactly once and can be
 * reconstructed from nothing afterwards (finding `J1-02`), which is the same
 * reading of rule 4's carve-out that outcomes already have.
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
  sideWagerText,
  storageDegradedText,
} from './text';

/**
 * QUALITY-BAR section 4's floor between polite writes, in seconds.
 *
 * Seconds rather than milliseconds because the frame's `dt` is in seconds and a
 * unit mismatch here is a defect that looks like a working queue running 1000
 * times too fast. The section states 500 ms; this is that number.
 */
export const POLITE_INTERVAL_SECONDS = 0.5;

/**
 * How long a refusal stays readable before anything may clear it, in seconds.
 * `AUDIT-2`, finding `J1-01`.
 *
 * The same number as the floor above rather than a second constant, and the
 * derivation is the reason: the queue cannot write two polite entries closer
 * together than one floor, so a reason that survives one floor is a reason the
 * queue had the chance to speak. A shorter window would clear the line before
 * the sentence it carries could be said. It is not a new duration, which
 * matters: QUALITY-BAR section 15 owns every number of that kind, and this
 * layer has no business minting one.
 *
 * It lives here rather than beside the notice it guards because the number is
 * the announcement floor and would otherwise be a copy of it.
 */
export const NOTICE_FLOOR_SECONDS = POLITE_INTERVAL_SECONDS;

/** Which of the two regions an announcement is written to. */
export type AnnouncementPriority = 'polite' | 'assertive';

/**
 * What kind of change an announcement reports, which is what rule 3 coalesces
 * within. `AUDIT-2`, finding `Z5-01`.
 *
 * One kind per thing a player is told about rather than one per sentence: two
 * cards arriving on the same hand inside one interval are still one card to
 * announce, which is rule 3's own example. What must not share a kind is
 * anything a single frame can produce together, because those are exactly the
 * pairs one pending entry collapsed.
 */
export type AnnouncementKind =
  /** SPEC 10's screen changed. */
  | 'phase'
  /** SPEC 4.6's split, which shares its frame with the cards it deals. */
  | 'split'
  /** A card arriving on one of the player's hands. */
  | 'card'
  /** A card arriving in front of the dealer, which can share a frame with one. */
  | 'dealerCard'
  /** Which hand SPEC 4.6 is now asking about. */
  | 'activeHand'
  /** SPEC 4.11's refused action, with its reason. */
  | 'refusal'
  /** SPEC 9's award. Never coalesced: it happens once and is gone. */
  | 'milestone'
  /** SPEC 14's mute, as an event. */
  | 'sound'
  /** QUALITY-BAR section 8's carry, once it has started failing. */
  | 'storage'
  /** SPEC 12's round result and SPEC 4.12's bust-out. Never coalesced. */
  | 'outcome';

/**
 * Every kind, as a value, so nothing can join the union without a decision.
 * The cure round's review, finding `MIN-2`.
 *
 * The union above is a type and the two rules that read it are values: the
 * coalescing carve-out is a `Set` of names and the floor exemption is written at
 * the one site that takes it. Nothing compared the three, so `'storage'` joined
 * the union in this cycle and silently took both defaults, coalescing and
 * waiting, with no line anywhere saying that was the answer. This is the same
 * shape `Z7-04` was cured in one file along, and the same shape `PHASE_KINDS`
 * and `INTENT_KINDS` have carried since `BJ-7`.
 *
 * **The record is what makes the list total.** A kind added to the union with no
 * key here is a missing property and does not compile; a key here that is not a
 * kind is an excess property under `satisfies` and does not compile either. So
 * `Object.keys` is every kind exactly once and the cast below is a statement
 * about that, not a hope. `tests/unit/announce.test.ts` then requires each of
 * them to be classified under both rules, with the count pinned, so the next
 * kind is a red test rather than a default.
 */
const KIND_PRESENT = {
  phase: true,
  split: true,
  card: true,
  dealerCard: true,
  activeHand: true,
  refusal: true,
  milestone: true,
  sound: true,
  storage: true,
  outcome: true,
} as const satisfies Record<AnnouncementKind, true>;

/** The kinds, in the union's own order, for a census and for a sweep. */
export const ANNOUNCEMENT_KINDS: readonly AnnouncementKind[] = Object.freeze(
  Object.keys(KIND_PRESENT) as AnnouncementKind[],
);

/** One thing to say, and which region says it. */
export interface Announcement {
  readonly priority: AnnouncementPriority;
  /** What changed, which decides what this entry may replace. */
  readonly kind: AnnouncementKind;
  readonly text: string;
  /**
   * Written on the frame it arrives, ahead of rule 2's floor.
   *
   * **One sentence in the game carries this, and it is a ruling rather than an
   * implementation choice.** SPEC 10 gives the dealer's peek a screen of its
   * own, and SPEC 5's Fast multiplier makes that screen 0.18 s long, which is
   * inside the 500 ms floor: the sentence was still pending when the player's
   * turn arrived and the next phase sentence replaced it, so a screen-reader
   * player at Fast was never told the dealer was checking, in any round, while
   * a sighted player watched the screen go by (finding `J1-03`). The ruling at
   * `AUDIT-2` is that this sentence is exempt from the floor: it is always
   * spoken and never dropped, and the price, accepted, is that whatever the
   * region was carrying may be replaced sooner than a floor after it was
   * written. The alternative readings were both worse: shortening the floor
   * changes an accessibility number for every sentence in the game, and making
   * Fast keep the peek screen open longer changes what Speed means.
   *
   * **The exemption is one sentence and the class is wider, and the rest of the
   * class is accepted rather than cured.** Any screen shorter than the floor can
   * lose its own sentence to the sentence that follows it, and two cases were
   * put to the user at `AUDIT-2` and accepted as documented behaviour:
   *
   *   1. **The reveal sentence.** `TIMINGS.revealPause` is 0.45 s, which is
   *      under the floor at Normal before Fast is involved at all, so a player
   *      who presses Stand on the reveal screen's first frame can have the
   *      reveal sentence replaced before it is written. Natural pacing speaks
   *      it, and `tests/unit/announce.test.ts` pins that at the frame rates it
   *      measures, so what is accepted is the first-frame press and not the
   *      ordinary round.
   *   2. **The peek screen at Fast on a hostile clock** (finding `J1-04`). At
   *      Fast the screen is 0.18 s and QUALITY-BAR section 7's clamp lets one
   *      long frame carry the machine straight through it, so the screen is
   *      never rendered and no sentence is due for it; at Normal it renders.
   *      That is a rendering fact rather than an announcement one, which is why
   *      the exemption above does not reach it.
   *
   * Both are declared here because this is the file the floor lives in, and the
   * reason neither is cured is the reason given for the exemption: the two cures
   * available change an accessibility number for every sentence in the game, or
   * change what Speed means.
   */
  readonly immediate?: boolean;
}

/** What the queue is holding right now, for a test and for the probe. */
export interface QueueState {
  /** The next polite entry due, or `null`. */
  readonly pendingPolite: string | null;
  /**
   * Every polite entry waiting, in the order they will be said.
   *
   * At most one per `AnnouncementKind` by rule 3, except milestones, which are
   * never collapsed. Before `AUDIT-2` this was one entry in total, and the
   * sentences a single frame produced beside another sentence could not be
   * spoken at all.
   */
  readonly pendingPolites: readonly string[];
  /** How many outcomes are waiting. Never collapsed, by rule 4. */
  readonly pendingOutcomes: number;
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

/**
 * The polite kind that is queued rather than coalesced. `AUDIT-2`, `J1-02`.
 *
 * SPEC 9 awards a milestone exactly once and never re-announces it, so an award
 * replaced while it waits is destroyed rather than delayed: the finding's
 * 45-round session at natural pacing awarded four and spoke none, because
 * pressing Next Hand inside the floor pushes the betting screen's own sentence
 * over the top of it. That is the case QUALITY-BAR section 4's rule 4 carve-out
 * describes, "entries a player cannot reconstruct", and the round outcome is
 * already treated that way. A `Set` of one rather than a comparison, because the
 * next entry that earns the treatment should be a name in this list.
 */
const NEVER_COALESCED: ReadonlySet<AnnouncementKind> = new Set<AnnouncementKind>(['milestone']);

export function createAnnouncementQueue(options: QueueOptions = {}): AnnouncementQueue {
  const interval = options.interval ?? POLITE_INTERVAL_SECONDS;
  /**
   * Seconds since the last write, started at the interval so the first
   * announcement of a session is spoken on the frame it happens rather than
   * half a second after the page has already moved on.
   */
  let since = interval;
  /**
   * The polite entries waiting, in the order they will be said.
   *
   * Bounded by the number of kinds plus the milestones a session has left to
   * award, so it cannot grow with the length of a session: everything but the
   * milestone kind replaces its own predecessor rather than joining the line.
   */
  const polite: Announcement[] = [];
  /** The one entry exempt from rule 2, or `null`. See `Announcement.immediate`. */
  let immediate: Announcement | null = null;
  const outcomes: Announcement[] = [];

  /** What is waiting, in the order it will be said. The exempt entry is first. */
  function waiting(): readonly Announcement[] {
    return immediate === null ? polite : [immediate, ...polite];
  }

  return {
    push(announcement: Announcement): void {
      if (announcement.priority === 'assertive') {
        // Rule 4. Appended rather than replacing, and never compared against
        // what is already waiting: two hands of a split can settle to the same
        // sentence, and dropping the second because it reads like the first
        // would be dropping an outcome. Checked before the exemption below so
        // an outcome can never leave the queue rule 4 puts it in.
        outcomes.push(announcement);
        return;
      }
      if (announcement.immediate === true) {
        immediate = announcement;
        return;
      }
      if (NEVER_COALESCED.has(announcement.kind)) {
        polite.push(announcement);
        return;
      }
      // Rule 3, within the kind. Whatever of this kind was waiting is replaced,
      // **in place**: an entry that moved to the back of the line would be said
      // after sentences it arrived before, and `announcementsFor` returns its
      // entries in the order they should be said.
      const held = polite.findIndex((entry) => entry.kind === announcement.kind);
      if (held === -1) {
        polite.push(announcement);
        return;
      }
      polite[held] = announcement;
    },

    tick(dt: number): Announcement | null {
      since += dt;
      if (immediate !== null) {
        // Ahead of the floor and ahead of everything waiting, which is the
        // whole of the exemption: the sentence is about a screen that is
        // already going away. The clock is reset with it, so the floor governs
        // everything after it exactly as before.
        const due = immediate;
        immediate = null;
        since = 0;
        return due;
      }
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
      const next = polite.shift();
      if (next === undefined) {
        return null;
      }
      since = 0;
      return next;
    },

    state: (): QueueState => ({
      pendingPolite: waiting()[0]?.text ?? null,
      pendingPolites: waiting().map((entry) => entry.text),
      pendingOutcomes: outcomes.length,
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
  /**
   * SPEC 9's milestones **this frame** awarded, in award order. Usually empty.
   *
   * The list `observeRound` returned for the frame rather than a slice off the
   * end of two milestone records: `statistics.ts` is where an award is decided
   * and a delta computed here would agree with it only while that record stays
   * append-only.
   */
  readonly awarded: readonly MilestoneId[];
  /**
   * SPEC 14's mute, as this frame resolved it. `BJ-19`, item `K3`.
   *
   * The announcement queue is how a mute press reaches a player who was not
   * looking at the control: the `aria-pressed` state is the standing half and
   * this sentence is the event half, which is the same division every other
   * state in this file takes.
   */
  readonly muted: boolean;
  /**
   * Whether nothing written now will be there next session. `AUDIT-2`, finding
   * `J3-02`.
   *
   * QUALITY-BAR section 8's last clause, as an event. The standing half is the
   * Settings panel's own line, which a player reaches by opening a panel; this
   * is the half that reaches one who never does. It is the composition root's
   * `carryDegraded` rather than the boot probe's `durable`, because the two
   * routes to the same loss are a store the browser refused and a store that
   * throws on every write, and only the first is answered at boot.
   */
  readonly carryDegraded: boolean;
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
      : ` ${sideWagerText(result.insurance.evenMoney)} ` +
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
 * **"In the order it should be said" is a promise the queue keeps, and until
 * `AUDIT-2` it did not.** One frame can produce several entries and the queue
 * held one; the last of them won and the rest were never spoken. Each entry
 * now carries the `AnnouncementKind` it belongs to, the queue holds one per
 * kind and replaces in place, and the order this function returns is the order
 * a region is written in.
 *
 * **`previous` is `null` on the first frame of a session, and that frame
 * announces nothing about the game.** Two reasons, and the second is the
 * load-bearing one. A session opening by reciting an empty felt would be
 * announcing the absence of a round; and QUALITY-BAR section 4 asks that "both
 * region elements exist in the initial HTML and only their text changes", whose
 * purpose is that a region is in the accessibility tree *before* it is written
 * to, since a region that arrives with its text already in it is not announced
 * by anything. The chrome is built in one turn and the first frame runs
 * synchronously inside it, so a first-frame write would land in the initial tree
 * and be silent anyway. The opening state is the mirror's job, which is the
 * division these two mechanisms exist for.
 *
 * **The one sentence a first frame can carry is the carry's**, and the reason is
 * that it is not a fact about the game: `carryAnnouncements` says why. Which
 * frame is the first observed one is `src/ui/components/announcer.ts`'s to
 * decide, and it skips the composition root's synchronous boot frame so that
 * this sentence is a change to a region already in the tree rather than text a
 * region arrived carrying.
 */
export function announcementsFor(
  previous: AnnounceFrame | null,
  next: AnnounceFrame,
): readonly Announcement[] {
  const said: Announcement[] = [];
  const { readout } = next;
  const prior = previous;

  if (prior === null) {
    return carryAnnouncements(null, next);
  }
  const before = prior.readout;

  // SPEC 10's screen changed. The two screens a player cannot reconstruct from
  // the felt a moment later are the two that go to the assertive region, which
  // is QUALITY-BAR section 4's "reserved for round and match outcomes" read
  // against this game's phases: the round result is the round outcome and the
  // bust-out is the session's.
  if (before.phase.kind !== readout.phase.kind) {
    if (readout.phase.kind === 'roundResult') {
      said.push({
        priority: 'assertive',
        kind: 'outcome',
        text: roundOutcomeText(readout.phase.result),
      });
    } else if (readout.phase.kind === 'bustOut') {
      said.push({
        priority: 'assertive',
        kind: 'outcome',
        text:
          `Out at this table. Your balance is ${formatChips(readout.wallet.chips)}, ` +
          'below the table minimum.',
      });
    } else {
      said.push({
        priority: 'polite',
        kind: 'phase',
        text: phaseText(readout.phase, readout.hands.length),
        // The one exempt sentence. SPEC 5's Fast multiplier makes the peek
        // screen 0.18 s long, which is shorter than the floor between polite
        // writes, so this sentence was still pending when the player's turn
        // arrived and the player-turn sentence replaced it: at Fast it was
        // announced in no round at all (finding `J1-03`). The ruling at
        // `AUDIT-2` exempts it; `Announcement.immediate` carries the reasoning
        // and what the exemption costs. It is a property of the screen rather
        // than of the Speed setting because this file is deliberately blind to
        // Speed, which its own header states and which the announcement floor
        // depends on.
        ...(readout.phase.kind === 'peek' ? { immediate: true } : {}),
      });
    }
  }

  // SPEC 4.6's split. The hand count only ever rises inside a round, and the
  // sweep at Next Hand takes it to zero, which is not a split and is already
  // covered by the phase change above.
  if (readout.hands.length > before.hands.length && readout.phase.kind === 'playerTurn') {
    said.push({
      priority: 'polite',
      kind: 'split',
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
      kind: 'card',
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
        // **A kind of its own, because a dealer card and a player card CAN be
        // produced by one frame**, and the reviewer of `AUDIT-2`'s cure round
        // measured it: `table.ts`'s `update` drains the deal queue in a `while`
        // loop against the accumulator, so a frame long enough for two deal
        // steps takes two, and SPEC 4.3 deals player, dealer, player, dealer. A
        // frame that takes steps two and three produces this sentence beside
        // the player's second card, and while the two shared a kind this one
        // replaced that one in place: at the default Speed four of sixty hitch
        // positions in a 60 fps deal lost the player's card, at Fast fourteen
        // of sixty. That is the pair rule 3 must not coalesce, which is what
        // this union's own rule says, so the kind is split rather than the
        // comment corrected. The reveal frame is unaffected either way: the
        // sentence it produces beside this one is a phase sentence.
        kind: 'dealerCard',
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
        kind: 'activeHand',
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
    said.push({ priority: 'polite', kind: 'refusal', text: reasonText(reason.reason) });
  }

  // SPEC 9's milestones, which are awarded exactly once each. The kind is the
  // one polite kind that queues rather than coalescing, for the reason
  // `NEVER_COALESCED` gives.
  for (const id of next.context.awarded) {
    said.push({ priority: 'polite', kind: 'milestone', text: `Milestone: ${milestoneText(id)}.` });
  }

  // SPEC 14's mute, as an event. `BJ-19`: the control carries `aria-pressed`
  // for the standing state and this is the half that reaches a player who was
  // not looking at it, in words rather than in a colour or an underline.
  if (next.context.muted !== prior.context.muted) {
    said.push({
      priority: 'polite',
      kind: 'sound',
      text: next.context.muted ? 'Sound muted.' : 'Sound on.',
    });
  }

  said.push(...carryAnnouncements(prior, next));

  return said;
}

/**
 * QUALITY-BAR section 8's last clause, as an event. `AUDIT-2`, finding `J3-02`.
 *
 * **The rising edge, so it is said once and not once per write.** The carry
 * fails at a write and stays failed until one lands, and a quota-full origin
 * fails every one of them: this fires on the frame the first one throws and on
 * no frame after it, however many rounds follow. A write that lands after a
 * failure genuinely restored the carry, because every write sends the whole
 * document, so a later failure is a second event and is said again rather than
 * suppressed.
 *
 * **A boot that is already degraded is the rising edge**, and until the cure
 * round's review it was the case this sentence never reached. There are two
 * routes to the same loss and only one of them starts at a write: an origin
 * that refuses site data throws on the property access itself, so
 * `persistence.ts` answers `carryDegraded` from the first frame, and an edge
 * read against the frame before could never be satisfied on it. The review
 * measured exactly that on the shipped page: the Settings note appeared and the
 * polite region stayed empty, on the one route QUALITY-BAR section 8's clause
 * names first. So the absent frame counts as an undegraded one, `null` included,
 * and the boot case says it once like any other edge.
 *
 * That is why this is the one sentence `announcementsFor` will return for a
 * first frame. Every other sentence there describes the felt, and a session
 * opening by reciting an empty felt is what that early return exists to stop;
 * this one describes the browser, is true before a card is dealt, and is the
 * half that reaches a player who never opens a panel.
 *
 * There is no falling-edge sentence. "Your progress is being saved again" is a
 * sentence about a mechanism a player never asked about, and the panel's own
 * line is what carries the standing state in both directions.
 */
function carryAnnouncements(
  prior: AnnounceFrame | null,
  next: AnnounceFrame,
): readonly Announcement[] {
  const wasDegraded = prior?.context.carryDegraded ?? false;
  if (!next.context.carryDegraded || wasDegraded) {
    return [];
  }
  return [{ priority: 'polite', kind: 'storage', text: storageDegradedText() }];
}
