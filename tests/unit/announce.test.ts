/**
 * The announcement queue's timing law, and what a frame's change is worth
 * saying. Armour under item `G4` (Critical), built at `BJ-18`.
 *
 * `G4` is a **Demonstration** item: its capture is a screen reader session at
 * ACCEPTANCE section 4, and no test in this repository can close it. What these
 * tests grade is the half of it that is arithmetic, which is the half most
 * likely to be silently wrong: QUALITY-BAR section 4's queue is four sentences
 * of timing, and a queue that obeyed three of them would look correct on screen
 * and be inaudible in use.
 *
 *   "One queue, minimum 500 ms between polite writes, coalescing: a change
 *    arriving inside the interval replaces the pending one rather than queueing
 *    behind it, except outcomes, which are never dropped. ... Without this,
 *    Blackjack's four-card deal at 0.22 s intervals clobbers itself before
 *    anything is spoken."
 *
 * **The named negative control is that last sentence, constructed.** The section
 * names the four-card deal as the case the queue exists for, so the deal is
 * driven at SPEC 5's own `dealInterval` through both a queue and a
 * deliberately queue-free writer, and the law-checker below is required to
 * accept one and reject the other. A checker that passed both would be
 * asserting nothing, which is exactly how a queue like this stops working
 * without anything going red.
 *
 * The deltas are graded against a **real machine**: `announcementsFor` is a pure
 * function of two `TableReadout`s, so a scripted shoe can produce the exact
 * rounds item `G4`'s criterion names, a split and a bust-out among them, and the
 * announcements are read off the readouts the machine really published rather
 * than off a shape invented here.
 *
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RANKS, type Rank } from '../../src/core/cards';
import type { MilestoneId } from '../../src/core/statistics';
import { MAX_STEP, TIMINGS, createTable, type Speed, type Table } from '../../src/core/table';
import type { Intent } from '../../src/core/types';
import { createWallet, type Wallet } from '../../src/core/wallet';
import {
  ANNOUNCEMENT_KINDS,
  POLITE_INTERVAL_SECONDS,
  announcementsFor,
  createAnnouncementQueue,
  roundOutcomeText,
  type AnnounceFrame,
  type Announcement,
  type AnnouncementKind,
} from '../../src/ui/announce';
import type { Notice } from '../../src/ui/state';
import { storageDegradedText } from '../../src/ui/text';

import { acceptResult as accept, bounded } from './support/drive';
import { scriptedShoe } from './support/stacked-shoe';

/** QUALITY-BAR section 4's floor, written out rather than only imported. */
const HALF_A_SECOND = 0.5;

/** A frame at 60 fps, which is what the deal below is stepped in. */
const FRAME = 1 / 60;

/** SPEC 4.11's starting bankroll and a wager Bronze takes. */
const ROUND_WAGER = 50;

/** Bounded, so a stalled drive fails loudly rather than hanging the suite. */
const LOOP_LIMIT = 2000;

// ---------------------------------------------------------------------------
// The law, and a checker that can reject
// ---------------------------------------------------------------------------

/** One write, as an observer of a live region would see it. */
interface Write {
  readonly at: number;
  readonly priority: Announcement['priority'];
  readonly text: string;
}

/**
 * Whether a sequence of writes obeys QUALITY-BAR section 4's interval.
 *
 * Returned rather than asserted, so the same function can be pointed at a
 * queue-free writer and required to answer `false`. A checker that is only ever
 * run against the implementation it is checking is not a checker.
 */
function respectsInterval(writes: readonly Write[], interval = HALF_A_SECOND): boolean {
  for (let index = 1; index < writes.length; index += 1) {
    const previous = writes[index - 1];
    const current = writes[index];
    if (previous === undefined || current === undefined) {
      return false;
    }
    // A tolerance of one frame: the queue writes on the first frame at or after
    // the interval, and a frame is not an instant.
    if (current.at - previous.at < interval - FRAME) {
      return false;
    }
  }
  return true;
}

/** Drive a schedule of pushes through the queue and record what it wrote. */
function runQueue(
  schedule: readonly { readonly at: number; readonly announcement: Announcement }[],
  seconds: number,
): readonly Write[] {
  const queue = createAnnouncementQueue();
  const writes: Write[] = [];
  const pending = [...schedule];
  for (let frame = 0; frame * FRAME <= seconds; frame += 1) {
    const now = frame * FRAME;
    while (pending.length > 0 && (pending[0]?.at ?? Infinity) <= now) {
      const next = pending.shift();
      if (next !== undefined) {
        queue.push(next.announcement);
      }
    }
    const due = queue.tick(FRAME);
    if (due !== null) {
      writes.push({ at: now, priority: due.priority, text: due.text });
    }
  }
  return writes;
}

/**
 * The same schedule with no queue at all: every push written the moment it
 * arrives. This is the behaviour QUALITY-BAR section 4 describes as clobbering
 * itself, and it exists here so the checker above has something to reject.
 */
function runWithoutQueue(
  schedule: readonly { readonly at: number; readonly announcement: Announcement }[],
): readonly Write[] {
  return schedule.map((entry) => ({
    at: entry.at,
    priority: entry.announcement.priority,
    text: entry.announcement.text,
  }));
}

/** SPEC 4.3's four opening cards, at SPEC 5's own interval. */
const FOUR_CARD_DEAL = ['Ace of spades', 'Ten of clubs', 'Five of hearts', 'One card face down'].map(
  (text, index) => ({
    at: index * TIMINGS.dealInterval,
    announcement: { priority: 'polite', kind: 'card', text } as const satisfies Announcement,
  }),
);

/** SPEC 10's peek screen, as `phaseText` words it. `AUDIT-2` finding `J1-03`. */
const PEEK_SENTENCE = 'The dealer is checking for a natural.';

describe('G4 armour: the queue obeys QUALITY-BAR section 4 and the checker can reject', () => {
  it('states the interval the section states', () => {
    expect(POLITE_INTERVAL_SECONDS).toBe(HALF_A_SECOND);
  });

  it('rejects the queue-free writer on the exact case the section names', () => {
    // The four-card deal, unqueued: four writes inside 0.66 s. This is the
    // control, and it has to fail, or every assertion below is vacuous.
    const clobbered = runWithoutQueue(FOUR_CARD_DEAL);
    expect(clobbered).toHaveLength(4);
    expect(respectsInterval(clobbered), 'the control must breach the interval').toBe(false);
  });

  it('holds the interval through the same four-card deal', () => {
    const writes = runQueue(FOUR_CARD_DEAL, 3);
    expect(respectsInterval(writes), 'the queue must hold the interval').toBe(true);
    // Fewer writes than pushes, which is the coalescing working rather than a
    // number chosen here: four cards inside 0.66 s cannot be four writes.
    expect(writes.length).toBeLessThan(FOUR_CARD_DEAL.length);
    expect(writes.length).toBeGreaterThan(0);
  });

  it('coalesces by replacing the pending entry, never by queueing behind it', () => {
    const writes = runQueue(FOUR_CARD_DEAL, 3).map((write) => write.text);
    // The first card is written the moment it arrives, because nothing has been
    // said yet. The second and third both land inside the interval that follows,
    // so the next write is the **third** card: the second was replaced while it
    // waited and is never spoken at all. A queue that queued behind rather than
    // replacing would speak the second here and stay a card behind for the rest
    // of the deal, which is the failure mode QUALITY-BAR section 4 describes.
    expect(writes[0]).toBe('Ace of spades');
    expect(writes[1]).toBe('Five of hearts');
    expect(writes, writes.join(' / ')).not.toContain('Ten of clubs');
  });

  it('writes the first announcement on the frame it arrives', () => {
    const writes = runQueue(
      [{ at: 0, announcement: { priority: 'polite', kind: 'phase', text: 'Betting.' } }],
      1,
    );
    expect(writes[0]?.at).toBe(0);
  });

  it('never drops an outcome, however fast they arrive', () => {
    const outcomes = ['Hand 1 Win', 'Hand 2 Loss', 'Hand 3 Push'].map((text, index) => ({
      at: index * TIMINGS.dealInterval,
      announcement: { priority: 'assertive', kind: 'outcome', text } as const satisfies Announcement,
    }));
    const writes = runQueue(outcomes, 4);
    expect(writes.map((write) => write.text)).toEqual(outcomes.map((entry) => entry.announcement.text));
    expect(respectsInterval(writes)).toBe(true);
  });

  it('would drop two of those three if outcomes coalesced, which is the control', () => {
    // The same three entries offered as polite entries of one class, which is
    // the coalescing arm. Two of the three never reach a region, which is what
    // rule 4 forbids and what makes the assertion above a real one. The class
    // matters from `AUDIT-2` onward: coalescing is per class, so three entries
    // of three different classes would all be spoken and the control would
    // stop controlling.
    const coalesced = runQueue(
      ['Hand 1 Win', 'Hand 2 Loss', 'Hand 3 Push'].map((text, index) => ({
        at: index * TIMINGS.dealInterval,
        announcement: { priority: 'polite', kind: 'card', text } as const satisfies Announcement,
      })),
      4,
    );
    expect(coalesced.length).toBeLessThan(3);
  });

  it('lets an outcome overtake a polite entry that is already waiting', () => {
    const writes = runQueue(
      [
        // The first entry is spoken at once and starts the interval. The next
        // two both arrive while the queue is closed, so the write that follows
        // has a choice to make, and rule 4 decides it.
        { at: 0, announcement: { priority: 'polite', kind: 'phase', text: 'Dealer plays.' } },
        { at: 0.1, announcement: { priority: 'polite', kind: 'dealerCard', text: 'Dealer: Ten of clubs.' } },
        { at: 0.2, announcement: { priority: 'assertive', kind: 'outcome', text: 'Round result.' } },
      ],
      3,
    );
    expect(writes[0]?.priority).toBe('polite');
    expect(writes[1]?.priority).toBe('assertive');
    expect(writes[1]?.text).toBe('Round result.');
    // And the polite entry it overtook is still spoken afterwards, rather than
    // being lost to the outcome that jumped it.
    expect(writes[2]?.text).toBe('Dealer: Ten of clubs.');
  });

  it('spaces writes by wall clock rather than by frames', () => {
    // The same one-second schedule stepped at three frame rates. The queue is
    // ticked with `dt`, so a 15 fps page and a 240 fps page must space their
    // writes identically; a queue that counted frames would not.
    const counts = [15, 60, 240].map((fps) => {
      const queue = createAnnouncementQueue();
      const dt = 1 / fps;
      let writes = 0;
      for (let frame = 0; frame < fps; frame += 1) {
        queue.push({ priority: 'polite', kind: 'card', text: `frame ${String(frame)}` });
        if (queue.tick(dt) !== null) {
          writes += 1;
        }
      }
      return writes;
    });
    expect(new Set(counts).size, `writes per second by frame rate: ${counts.join(', ')}`).toBe(1);
  });

  it('reports what it is holding: one polite entry per class, and every outcome', () => {
    // **`AUDIT-2` finding `Z5-01` moved this law from one pending entry to one
    // per class**, and both halves are asserted here. Two changes of the SAME
    // class still collapse to the newer, which is rule 3 unchanged; two of
    // different classes both wait, which is the whole of the cure. The
    // replacement happens **in place**, so the order the entries arrived in is
    // the order they are said in: the card below was offered first and is still
    // first after being replaced.
    const queue = createAnnouncementQueue();
    queue.tick(1);
    queue.push({ priority: 'polite', kind: 'card', text: 'one' });
    queue.push({ priority: 'polite', kind: 'card', text: 'two' });
    queue.push({ priority: 'polite', kind: 'phase', text: 'a screen' });
    queue.push({ priority: 'assertive', kind: 'outcome', text: 'outcome one' });
    queue.push({ priority: 'assertive', kind: 'outcome', text: 'outcome two' });
    expect(queue.state().pendingPolite).toBe('two');
    expect(queue.state().pendingPolites).toEqual(['two', 'a screen']);
    expect(queue.state().pendingOutcomes).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// AUDIT-2: the classes a polite entry coalesces within
// ---------------------------------------------------------------------------

describe('AUDIT-2: polite entries coalesce by class, and two of the classes never drop', () => {
  it('makes every kind carry both decisions, so a new one cannot default', () => {
    // The cure round's review, finding `MIN-2`. `'storage'` joined the union in
    // this cycle and took both defaults, coalescing and waiting for the floor,
    // with nothing anywhere stating that was the answer: the union is a type,
    // the carve-out is a `Set` and the exemption is written at its one site, and
    // nothing compared the three. Both rows below are keyed by the union itself,
    // so a kind added to `announce.ts` with no row here does not compile, and
    // the count is pinned so a row added without a kind does not pass.
    const COALESCES: Readonly<Record<AnnouncementKind, boolean>> = {
      phase: true,
      split: true,
      card: true,
      dealerCard: true,
      activeHand: true,
      refusal: true,
      // Rule 4's carve-out: awarded once and reconstructible from nothing.
      milestone: false,
      sound: true,
      // Said at the edge, so a second copy inside one interval is the same
      // event and replacing it loses nothing.
      storage: true,
      // Rule 4 itself.
      outcome: false,
    };
    const EXEMPT_FROM_THE_FLOOR: Readonly<Record<AnnouncementKind, boolean>> = {
      // SPEC 10's peek screen at Fast, and only that screen: the ruling is one
      // sentence wide and `Announcement.immediate` carries it.
      phase: true,
      split: false,
      card: false,
      dealerCard: false,
      activeHand: false,
      refusal: false,
      milestone: false,
      sound: false,
      storage: false,
      outcome: false,
    };

    expect(ANNOUNCEMENT_KINDS, 'a kind arrived or left with no decision taken').toHaveLength(10);
    expect(new Set(ANNOUNCEMENT_KINDS).size).toBe(ANNOUNCEMENT_KINDS.length);

    // And the rows are the shipped behaviour rather than a comment: two entries
    // of one kind inside one interval either become one or queue, and which of
    // those happened is read off the queue's own state.
    for (const kind of ANNOUNCEMENT_KINDS) {
      const queue = createAnnouncementQueue();
      const priority = kind === 'outcome' ? 'assertive' : 'polite';
      queue.push({ priority, kind, text: 'first' });
      queue.push({ priority, kind, text: 'second' });
      const waiting =
        kind === 'outcome' ? queue.state().pendingOutcomes : queue.state().pendingPolites.length;
      expect(waiting, `${kind} does not coalesce the way its row says`).toBe(
        COALESCES[kind] ? 1 : 2,
      );
    }

    // The immediacy half is a property of the sentence rather than of the
    // queue, so it is accounted at the one site that writes it: exactly one
    // kind is exempt, and the shipped file sets the flag exactly once.
    const exempt = ANNOUNCEMENT_KINDS.filter((kind) => EXEMPT_FROM_THE_FLOOR[kind]);
    expect(exempt).toEqual(['phase']);
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'ui', 'announce.ts'),
      'utf8',
    );
    expect(source.split('immediate: true').length - 1, 'a second sentence took the exemption').toBe(
      1,
    );
    expect(source).toContain("...(readout.phase.kind === 'peek' ? { immediate: true } : {}),");
  });

  it('never drops a milestone, however promptly the next screen arrives', () => {
    // **Finding `J1-02`**, as arithmetic. SPEC 9 awards a milestone exactly
    // once and never re-announces it, so a milestone replaced while it waits is
    // destroyed rather than delayed: a 45-round session at natural pacing
    // awarded four and spoke none, because pressing Next Hand inside the floor
    // pushes the betting screen's own sentence over the top of it. The award
    // and the screen are different classes now, and the milestone class is the
    // second entry QUALITY-BAR section 4's rule 4 carve-out covers.
    const writes = runQueue(
      [
        { at: 0, announcement: { priority: 'polite', kind: 'phase', text: 'Settling the round.' } },
        {
          at: 0.1,
          announcement: {
            priority: 'polite',
            kind: 'milestone',
            text: 'Milestone: First natural.',
          },
        },
        {
          at: 0.25,
          announcement: { priority: 'polite', kind: 'phase', text: 'Betting. Build a wager.' },
        },
      ],
      4,
    ).map((write) => write.text);
    expect(writes, writes.join(' / ')).toContain('Milestone: First natural.');
    // And the screen that used to destroy it is still spoken, which is what
    // makes this a queue rather than a milestone with a veto.
    expect(writes, writes.join(' / ')).toContain('Betting. Build a wager.');
  });

  it('speaks every milestone a single frame awarded', () => {
    // The other trigger of the same defect, and the one that needs no timing at
    // all: `milestones.test.ts` already pins that one round can award more than
    // one, and one pending entry could only ever speak the last of them.
    const three = ['First natural', 'First split win', 'A five-hand win streak'].map((name) => ({
      at: 0,
      announcement: {
        priority: 'polite',
        kind: 'milestone',
        text: `Milestone: ${name}.`,
      } as const satisfies Announcement,
    }));
    const writes = runQueue(three, 5).map((write) => write.text);
    expect(writes).toEqual(three.map((entry) => entry.announcement.text));
    expect(respectsInterval(runQueue(three, 5)), 'and they still take their turn').toBe(true);
  });

  it('writes SPEC 10 peek sentence on the frame it arrives, ahead of the floor', () => {
    // **Finding `J1-03`, and the ruling on it.** At Fast the peek screen lasts
    // 0.18 s, which is inside the 0.5 s floor, so the sentence was still
    // pending when the player's turn arrived and the next phase sentence
    // replaced it: a screen-reader player at Fast was never told the dealer was
    // checking, in any round, while a sighted player saw the screen. The
    // ruling exempts this one sentence from the floor rather than shortening
    // the floor or changing what Fast means.
    const schedule = [
      {
        at: 0,
        announcement: {
          priority: 'polite',
          kind: 'dealerCard',
          text: 'Dealer: Ten of clubs. hard 10.',
        } as const satisfies Announcement,
      },
      {
        at: 0.1,
        announcement: {
          priority: 'polite',
          kind: 'phase',
          immediate: true,
          text: PEEK_SENTENCE,
        } as const satisfies Announcement,
      },
      // 0.18 s after the peek, which is SPEC 5's `PEEK_PAUSE` under the Fast
      // multiplier, measured on the shipped page at 182 to 185 ms.
      {
        at: 0.28,
        announcement: {
          priority: 'polite',
          kind: 'phase',
          text: 'Your turn.',
        } as const satisfies Announcement,
      },
    ];
    const writes = runQueue(schedule, 3);
    const texts = writes.map((write) => write.text);
    expect(texts, texts.join(' / ')).toContain(PEEK_SENTENCE);
    // Not dropped, and not at the cost of the sentence that follows it.
    expect(texts, texts.join(' / ')).toContain('Your turn.');
    const spokenAt = writes.find((write) => write.text === PEEK_SENTENCE)?.at ?? Infinity;
    expect(spokenAt, 'the exemption is what makes it audible at Fast').toBeLessThan(HALF_A_SECOND);
  });

  it('loses that sentence with the exemption dropped, which is the control', () => {
    // The same schedule with `immediate` gone. The peek sentence and the
    // player-turn sentence are one class, so rule 3 replaces the first with the
    // second and the exemption is the only thing standing between them. A
    // cure that had quietly made every entry immediate would fail here.
    const writes = runQueue(
      [
        {
          at: 0,
          announcement: {
            priority: 'polite',
            kind: 'dealerCard',
            text: 'Dealer: Ten of clubs. hard 10.',
          } as const satisfies Announcement,
        },
        {
          at: 0.1,
          announcement: {
            priority: 'polite',
            kind: 'phase',
            text: PEEK_SENTENCE,
          } as const satisfies Announcement,
        },
        {
          at: 0.28,
          announcement: {
            priority: 'polite',
            kind: 'phase',
            text: 'Your turn.',
          } as const satisfies Announcement,
        },
      ],
      3,
    ).map((write) => write.text);
    expect(writes, writes.join(' / ')).not.toContain(PEEK_SENTENCE);
    expect(writes, writes.join(' / ')).toContain('Your turn.');
  });

  it('holds the floor for everything that is not exempt', () => {
    // The exemption is one sentence wide. Every other schedule in this file
    // still obeys rule 2, and this is the assertion that says so about a
    // schedule containing an exempt entry: the writes that are not the exempt
    // one are still spaced by the floor.
    const writes = runQueue(
      [
        {
          at: 0,
          announcement: { priority: 'polite', kind: 'card', text: 'first' } as const,
        },
        {
          at: 0.1,
          announcement: {
            priority: 'polite',
            kind: 'phase',
            immediate: true,
            text: PEEK_SENTENCE,
          } as const,
        },
        {
          at: 0.15,
          announcement: { priority: 'polite', kind: 'refusal', text: 'refused' } as const,
        },
      ],
      3,
    );
    const ordinary = writes.filter((write) => write.text !== PEEK_SENTENCE);
    expect(respectsInterval(ordinary), ordinary.map((w) => `${String(w.at)} ${w.text}`).join(' / '))
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The deltas, against a real machine
// ---------------------------------------------------------------------------

/** Everything one drive announced, with the readouts it announced them from. */
interface Session {
  readonly table: Table;
  /** Every announcement, in the order the deltas produced them. */
  readonly said: readonly Announcement[];
  /** The frame the drive finished on. */
  frame: AnnounceFrame | null;
}

/**
 * A drive that folds the deltas exactly as the announcer does.
 *
 * The announcer holds the previous frame and asks for the difference on every
 * sync; this does the same over a scripted round, which is what makes the
 * assertions below assertions about the shipped derivation rather than about a
 * copy of it.
 */
function session(table: Table, notice: Notice | null = null, awarded: readonly MilestoneId[] = []): Session {
  const said: Announcement[] = [];
  const record: Session = { table, said, frame: null };
  const observe = (): void => {
    const next: AnnounceFrame = {
      readout: table.readout(),
      context: { notice, awarded, muted: false, carryDegraded: false },
    };
    said.push(...announcementsFor(record.frame, next));
    record.frame = next;
  };
  observe();
  return Object.assign(record, {
    step(dt: number): void {
      table.update(dt);
      observe();
    },
    apply(intent: Intent): void {
      accept(table.apply(intent));
      observe();
    },
  });
}

type Driven = Session & { step(dt: number): void; apply(intent: Intent): void };

/** Run the machine forward until it reaches one of the named phases. */
function runTo(driven: Driven, wanted: readonly string[]): void {
  const turn = bounded(`driving to ${wanted.join(' or ')}`, LOOP_LIMIT);
  while (!wanted.includes(driven.table.readout().phase.kind)) {
    turn();
    const { phase, wallet } = driven.table.readout();
    switch (phase.kind) {
      case 'start':
        driven.apply({ kind: 'start' });
        break;
      case 'betting':
        driven.apply(
          wallet.wager === 0 ? { kind: 'tapChip', chip: ROUND_WAGER } : { kind: 'deal' },
        );
        break;
      case 'insurance':
        driven.apply({ kind: 'declineInsurance' });
        break;
      case 'playerTurn':
        driven.apply({ kind: 'stand' });
        break;
      case 'roundResult':
        driven.apply({ kind: 'nextHand' });
        break;
      default:
        driven.step(FRAME);
    }
  }
}

/** A table on a written-down shoe, so the round below is the round asserted. */
function tableOn(ranks: readonly Rank[], wallet: Wallet = createWallet()): Table {
  return createTable({ wallet, table: 'bronze', rules: {}, seed: 1, shoe: scriptedShoe(ranks) });
}

describe('G4 armour: what a frame is worth announcing', () => {
  it('says nothing at all on the first frame of a session', () => {
    const table = tableOn(['8', '9', '8', '9']);
    const first: AnnounceFrame = {
      readout: table.readout(),
      context: { notice: null, awarded: [], muted: false, carryDegraded: false },
    };
    expect(announcementsFor(null, first)).toEqual([]);
  });

  it('says nothing on a frame where nothing moved', () => {
    const table = tableOn(['8', '9', '8', '9']);
    const frame: AnnounceFrame = {
      readout: table.readout(),
      context: { notice: null, awarded: [], muted: false, carryDegraded: false },
    };
    expect(announcementsFor(frame, frame)).toEqual([]);
  });

  it('names every card of the opening deal, as words, with the total it made', () => {
    const driven = session(tableOn(['A', 'K', '5', '9', '3'])) as Driven;
    runTo(driven, ['playerTurn', 'roundResult']);
    const polite = driven.said.filter((entry) => entry.priority === 'polite').map((e) => e.text);
    // The suits are the scripted shoe's cycle; the words and the totals are the
    // announcement's. An Ace alone is a soft 11, and the same Ace with a five is
    // a soft 16, which is the reading `hand.ts` publishes and this repeats.
    expect(polite, polite.join(' / ')).toContain('Ace of clubs. soft 11.');
    expect(polite, polite.join(' / ')).toContain('Five of hearts. soft 16.');
    expect(polite.some((text) => text.startsWith('Dealer: King of'))).toBe(true);
    // The face-down card is never named, because the machine never publishes it.
    expect(polite.some((text) => text.includes('Nine of'))).toBe(false);
  });

  it('announces the round result assertively, with the outcome and the balance', () => {
    const driven = session(tableOn(['10', '9', '9', '8', '7'])) as Driven;
    runTo(driven, ['roundResult']);
    const outcomes = driven.said.filter((entry) => entry.priority === 'assertive');
    expect(outcomes).toHaveLength(1);
    const { phase } = driven.table.readout();
    if (phase.kind !== 'roundResult') {
      throw new Error('the drive did not reach the round result');
    }
    expect(outcomes[0]?.text).toBe(roundOutcomeText(phase.result));
    expect(outcomes[0]?.text).toContain('Round result.');
    expect(outcomes[0]?.text).toContain('Balance');
  });

  it('announces a split and then names each hand as the machine moves between them', () => {
    // A pair of eights, split, each hand drawing to a stand. The dealer's up
    // card is a nine, so the round plays out with no offer to decline.
    const driven = session(tableOn(['8', '9', '8', '7', '10', '2', '9'])) as Driven;
    runTo(driven, ['playerTurn']);
    driven.apply({ kind: 'split' });
    const turn = bounded('playing the split hands out', LOOP_LIMIT);
    while (driven.table.readout().phase.kind === 'playerTurn') {
      turn();
      const before = driven.table.readout().phase;
      if (before.kind === 'playerTurn' && driven.table.readout().hands[before.activeHand]?.cards.length === 1) {
        driven.step(FRAME);
        continue;
      }
      driven.apply({ kind: 'stand' });
    }
    const polite = driven.said.filter((entry) => entry.priority === 'polite').map((e) => e.text);
    expect(polite, polite.join(' / ')).toContain('Split. 2 hands in play.');
    // Once there are two hands, a card names which one it went to.
    expect(polite.some((text) => text.startsWith('Hand 2: ')), polite.join(' / ')).toBe(true);
    // And the move to the second hand is announced with the naming template.
    expect(polite.some((text) => text.startsWith('Hand 2 of 2, active,')), polite.join(' / ')).toBe(
      true,
    );
  });

  it('announces no card for a hand that a second split only moved along', () => {
    // The index hazard `core/types.ts` records, reaching the announcements.
    // `table.ts` inserts a split hand beside its parent and `wallet.ts` appends
    // it, so a resplit of the leftmost hand shifts the hand on its right one
    // place along. A delta computed by position would read that shift as a card
    // arriving on a hand that has not been touched since before the split.
    //
    // The deal is 8, 9, 8, 5: a pair of eights against a nine, with no offer to
    // decline. The first split deals an eight to the left hand and a three to
    // the right, so the left hand is a pair again; the second split moves the
    // right hand from index 1 to index 2 without changing a card in it.
    const driven = session(tableOn(['8', '9', '8', '5', '8', '3', '4', '6', '7', '2'])) as Driven;
    runTo(driven, ['playerTurn']);
    driven.apply({ kind: 'split' });

    const settle = bounded('dealing the split hands', LOOP_LIMIT);
    while ((driven.table.readout().hands[0]?.cards.length ?? 0) < 2) {
      settle();
      driven.step(FRAME);
    }
    const moved = driven.table.readout().hands[1];
    expect(moved?.cards.map((card) => card.rank), 'the second hand is not the one expected').toEqual(
      ['8', '3'],
    );

    const before = driven.said.length;
    driven.apply({ kind: 'split' });
    const after = driven.table.readout();
    expect(after.hands.length, 'the second split did not happen').toBe(3);
    expect(after.hands[2]?.walletHand, 'the moved hand is not where the hazard puts it').toBe(
      moved?.walletHand,
    );

    // Everything announced from the second split onward. The hand that moved
    // must not appear as a card arriving; its cards are the same cards.
    const since = driven.said.slice(before).map((entry) => entry.text);
    expect(since.some((text) => text.startsWith('Hand 3: ')), since.join(' / ')).toBe(false);
  });

  it('announces a refusal once, and again only when a different one arrives', () => {
    const table = tableOn(['8', '9', '8', '9']);
    const quiet = { notice: null, awarded: [] as readonly MilestoneId[], muted: false, carryDegraded: false };
    const base = { readout: table.readout(), context: quiet } as const;
    const refused: Notice = { layer: 'wallet', reason: 'no-wager' };
    const withNotice: AnnounceFrame = {
      readout: table.readout(),
      context: { notice: refused, awarded: [], muted: false, carryDegraded: false },
    };
    const said = announcementsFor(base, withNotice);
    expect(said.map((entry) => entry.text)).toEqual(['Place a wager before dealing.']);
    // The same notice object on the next frame is the same refusal, not a new
    // one: a per-frame announcement would repeat it sixty times a second.
    expect(announcementsFor(withNotice, withNotice)).toEqual([]);
  });

  it('announces a milestone the frame it is awarded', () => {
    const table = tableOn(['8', '9', '8', '9']);
    const before: AnnounceFrame = {
      readout: table.readout(),
      context: { notice: null, awarded: [], muted: false, carryDegraded: false },
    };
    const after: AnnounceFrame = {
      readout: table.readout(),
      context: { notice: null, awarded: ['firstNatural'], muted: false, carryDegraded: false },
    };
    expect(announcementsFor(before, after)).toEqual([
      { priority: 'polite', kind: 'milestone', text: 'Milestone: First natural.' },
    ]);
  });

  it('announces a mute change in words, once per change', () => {
    // `BJ-19`, item `K3`. The control carries `aria-pressed` for the standing
    // state; this is the event half, through the one queue, in words rather
    // than in a colour or an underline. Same state on the next frame says
    // nothing, like every other announcement here.
    const table = tableOn(['8', '9', '8', '9']);
    const frameOf = (muted: boolean): AnnounceFrame => ({
      readout: table.readout(),
      context: { notice: null, awarded: [], muted, carryDegraded: false },
    });
    expect(announcementsFor(frameOf(false), frameOf(true))).toEqual([
      { priority: 'polite', kind: 'sound', text: 'Sound muted.' },
    ]);
    expect(announcementsFor(frameOf(true), frameOf(false))).toEqual([
      { priority: 'polite', kind: 'sound', text: 'Sound on.' },
    ]);
    expect(announcementsFor(frameOf(true), frameOf(true))).toEqual([]);
  });

  it('says the carry is failing once, at the edge and not at every write', () => {
    // `AUDIT-2`, finding `J3-02`. QUALITY-BAR section 8's last clause reached
    // the player through the Settings panel alone, and only on the route the
    // boot probe could see: a quota-full origin threw on every write, stored
    // nothing, and said nothing. This is the event half, and the shape it takes
    // is the mute's: a rising edge rather than a state, so a session that keeps
    // failing keeps quiet and one that starts failing again says so again.
    const table = tableOn(['8', '9', '8', '9']);
    const frameOf = (carryDegraded: boolean): AnnounceFrame => ({
      readout: table.readout(),
      context: { notice: null, awarded: [], muted: false, carryDegraded },
    });
    expect(announcementsFor(frameOf(false), frameOf(true))).toEqual([
      { priority: 'polite', kind: 'storage', text: storageDegradedText() },
    ]);
    // The frames after it, which are every frame of the rest of the session on
    // an origin that stays full.
    expect(announcementsFor(frameOf(true), frameOf(true))).toEqual([]);
    // And nothing at all on the way back: the panel's line is the standing
    // state, and a sentence about storage working is a sentence about a
    // mechanism nobody asked about.
    expect(announcementsFor(frameOf(true), frameOf(false))).toEqual([]);
    // A write that landed genuinely restored the carry, so a second failure is
    // a second event.
    expect(announcementsFor(frameOf(false), frameOf(true))).toHaveLength(1);
  });

  it('says it on a boot that is already failing, which is the blocked origin', () => {
    // The cure round's review, on the shipped page: an origin that refuses site
    // data throws on the `localStorage` property access itself, so
    // `persistence.ts` reports the carry degraded from the first frame and there
    // is no undegraded frame in front of it. Read against a real previous frame
    // the edge was unreachable on that route, and the review measured what that
    // cost: the Settings note appeared and the polite region stayed empty, on
    // the one route QUALITY-BAR section 8's clause names first. The absent frame
    // counts as an undegraded one.
    const table = tableOn(['8', '9', '8', '9']);
    const frameOf = (carryDegraded: boolean): AnnounceFrame => ({
      readout: table.readout(),
      context: { notice: null, awarded: [], muted: false, carryDegraded },
    });
    expect(announcementsFor(null, frameOf(true))).toEqual([
      { priority: 'polite', kind: 'storage', text: storageDegradedText() },
    ]);
    // Once, like every other edge: the second frame of that session is not a
    // second event.
    expect(announcementsFor(frameOf(true), frameOf(true))).toEqual([]);
    // And nothing else came with it. The first frame stays silent about the
    // game, which is what the early return in `announcementsFor` is for: this
    // sentence is about the browser and is true before a card is dealt, and a
    // first frame that recited the felt as well would be the defect that return
    // exists to stop.
    expect(announcementsFor(null, frameOf(false))).toEqual([]);
    expect(
      announcementsFor(null, frameOf(true)).map((entry) => entry.kind),
    ).toEqual(['storage']);
  });

  it('announces the bust-out assertively, which is the session outcome', () => {
    // SPEC 4.12's screen, reached the way `tests/browser/support/action-seeds.ts`
    // reaches it: 950 of a 1,000 chip bankroll at Gold, lost in one round,
    // leaving 50 against a 100 minimum. The unlock is a high-water mark on the
    // wallet rather than a played-up balance, which is what `bestBalance` is.
    const wallet = createWallet({ bestBalance: 10_000 });
    const table = createTable({
      wallet,
      table: 'gold',
      rules: {},
      seed: 1,
      shoe: scriptedShoe(['5', '10', '6', '10', '10', '10']),
    });
    const driven = session(table) as Driven;
    const turn = bounded('reaching the bust-out', LOOP_LIMIT);
    while (driven.table.readout().phase.kind !== 'bustOut') {
      turn();
      const { phase, wallet: money } = driven.table.readout();
      switch (phase.kind) {
        case 'start':
          driven.apply({ kind: 'start' });
          break;
        case 'betting':
          if (money.wager < 950) {
            driven.apply({ kind: 'tapChip', chip: money.wager < 500 ? 500 : money.wager < 900 ? 100 : 50 });
          } else {
            driven.apply({ kind: 'deal' });
          }
          break;
        case 'playerTurn':
          driven.apply({ kind: 'stand' });
          break;
        case 'roundResult':
          driven.apply({ kind: 'nextHand' });
          break;
        default:
          driven.step(FRAME);
      }
    }
    const outcomes = driven.said.filter((entry) => entry.priority === 'assertive');
    expect(outcomes.some((entry) => entry.text.startsWith('Out at this table.'))).toBe(true);
    // Two outcomes, in order: the round that lost, then the session that ended.
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]?.text.startsWith('Round result.')).toBe(true);
  });

  it('never announces a rank as its glyph', () => {
    // QUALITY-BAR section 4 allows a card's rank and suit to live on canvas and
    // requires them in the mirror "as words". The same rule holds here: an
    // announcement carrying `A` or `10` would be reading the glyph aloud.
    //
    // **A digit scan cannot do this job here and the card sentence can.**
    // `AUDIT-2`, finding `Z7-02`: the letter regex below covers four of the
    // thirteen ranks, and an announcement legitimately carries digits, a wager
    // and a hard or soft total among them, so the nine numeric ranks have to be
    // reached another way. Every card an announcement names arrives as
    // "<Rank> of <suit>", so the word in front of a suit is read out and
    // required to be one of the thirteen. `2` regressing to its glyph is then a
    // red test, which it was not before.
    // One card sentence, as the announcements build it.
    const CARD_SENTENCE = /(\S+) of (?:clubs|diamonds|hearts|spades)\b/g;
    const words = new Set([
      'Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Jack', 'Queen', 'King',
    ]);
    const driven = session(tableOn(RANKS.flatMap((each) => [each, each]))) as Driven;
    runTo(driven, ['playerTurn', 'roundResult']);
    // The loop below is vacuously true over an empty drive, which is the shape
    // every other sweep in this suite guards against.
    expect(driven.said.length, 'the drive announced nothing').toBeGreaterThan(0);
    let named = 0;
    for (const entry of driven.said) {
      expect(/\b(?:A|J|Q|K)\b/.test(entry.text), `${entry.text} names a rank glyph`).toBe(false);
      for (const match of entry.text.matchAll(CARD_SENTENCE)) {
        named += 1;
        expect(words.has(match[1] ?? ''), `${entry.text} names a rank as its glyph`).toBe(true);
      }
    }
    expect(named, 'the drive named no card at all').toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// AUDIT-2: the composition the announcer actually runs
// ---------------------------------------------------------------------------

/**
 * Everything a drive **wrote** to each region, in the order it was written.
 *
 * Every test above this line grades one half at a time: the delta tests read
 * `announcementsFor`'s return value directly and the queue tests push one entry
 * per simulated instant. `src/ui/components/announcer.ts` composes them the
 * other way round, pushing **every** entry one frame produced and then ticking
 * once, and finding `Z5-01` measured a whole class of sentences that no round
 * could speak in that composition while nothing above moved at all. So the
 * driver below is the shipped shape, and what it records is what a region was
 * really written with.
 */
interface Spoken {
  readonly polite: readonly string[];
  readonly assertive: readonly string[];
}

function speak(
  table: Table,
  plan: (table: Table) => Intent | null,
  step = FRAME,
  seconds = 10,
): Spoken {
  const queue = createAnnouncementQueue();
  const polite: string[] = [];
  const assertive: string[] = [];
  let previous: AnnounceFrame | null = null;
  for (let frame = 0; frame * step < seconds; frame += 1) {
    const intent = plan(table);
    if (intent !== null) {
      table.apply(intent);
    }
    table.update(step);
    const next: AnnounceFrame = {
      readout: table.readout(),
      context: { notice: null, awarded: [], muted: false, carryDegraded: false },
    };
    for (const announcement of announcementsFor(previous, next)) {
      queue.push(announcement);
    }
    previous = next;
    const due = queue.tick(step);
    if (due !== null) {
      (due.priority === 'polite' ? polite : assertive).push(due.text);
    }
  }
  return { polite, assertive };
}

/**
 * One round, standing after `dwell` seconds of the player's turn.
 *
 * The dwell is the finding's own construction and it is load-bearing: the
 * queue writes one polite entry per floor, so a player who stands in the same
 * breath as their second card is a player whose queue is still working through
 * the deal. `Z5-01` measured a 1 s dwell, which is a fast player rather than a
 * patient one.
 */
function standingPlan(dwell: number, step: number): (table: Table) => Intent | null {
  let waited = 0;
  return (table) => {
    const { phase, wallet } = table.readout();
    switch (phase.kind) {
      case 'start':
        return { kind: 'start' };
      case 'betting':
        return wallet.wager === 0 ? { kind: 'tapChip', chip: ROUND_WAGER } : { kind: 'deal' };
      case 'insurance':
        return { kind: 'declineInsurance' };
      case 'playerTurn':
        waited += step;
        return waited > dwell ? { kind: 'stand' } : null;
      default:
        // Including `roundResult`: the drive sits there so the queue can drain,
        // which is the difference between an entry that is late and one that is
        // lost.
        return null;
    }
  };
}

/**
 * A frame that dealt to the player and to the dealer in one machine step.
 *
 * `playerCards` is how many cards the player held once the frame was done, so
 * the arm can grade the frame that dealt their **last** card of the deal and
 * nothing later can legitimately replace the sentence it produced.
 */
interface SharedFrame {
  readonly player: string;
  readonly dealer: string;
  readonly playerCards: number;
}

/** What one hitched deal produced together, and what a region was written with. */
interface StutteredDeal {
  readonly shared: readonly SharedFrame[];
  readonly polite: readonly string[];
}

/** Every position in a 60 fps opening deal that the one long frame can take. */
const HITCH_POSITIONS: readonly number[] = Array.from({ length: 60 }, (_unused, at) => at);

/**
 * One opening deal at 60 fps with a single long frame inserted at `hitchAt`.
 *
 * `MAX_STEP` rather than a number chosen here: it is the largest delta the
 * machine will consume, so this is the worst frame a real page can deliver and
 * not a synthetic one. The shoe gives the dealer a nine, so there is no peek
 * screen and no offer to decline, and the deal is the only thing happening.
 *
 * The queue is drained afterwards with no further machine steps, which is what
 * makes the assertions about **loss** rather than about lateness: everything
 * still waiting is written before the run is read.
 */
function stutteredDeal(speed: Speed, hitchAt: number): StutteredDeal {
  const table = tableOn(['Q', '9', '5', '8', '3']);
  table.setSpeed(speed);
  const queue = createAnnouncementQueue();
  const polite: string[] = [];
  const shared: SharedFrame[] = [];
  let previous: AnnounceFrame | null = null;

  const write = (step: number): void => {
    const due = queue.tick(step);
    if (due !== null && due.priority === 'polite') {
      polite.push(due.text);
    }
  };
  const observe = (step: number): void => {
    const next: AnnounceFrame = {
      readout: table.readout(),
      context: { notice: null, awarded: [], muted: false, carryDegraded: false },
    };
    const produced = announcementsFor(previous, next);
    previous = next;
    // Told apart by the sentence rather than by the kind, so this reads the
    // same before and after the fix: the point of the arm is the frame that
    // produced both, whatever kinds the two entries carry.
    const cards = produced.filter(
      (entry) => entry.kind === 'card' || entry.kind === 'dealerCard',
    );
    const dealer = cards.find((entry) => entry.text.startsWith('Dealer: '));
    const player = cards.find((entry) => !entry.text.startsWith('Dealer: '));
    if (dealer !== undefined && player !== undefined) {
      shared.push({
        player: player.text,
        dealer: dealer.text,
        playerCards: next.readout.hands[0]?.cards.length ?? 0,
      });
    }
    for (const announcement of produced) {
      queue.push(announcement);
    }
    write(step);
  };

  accept(table.apply({ kind: 'start' }));
  observe(FRAME);
  accept(table.apply({ kind: 'tapChip', chip: ROUND_WAGER }));
  observe(FRAME);
  accept(table.apply({ kind: 'deal' }));
  observe(FRAME);

  const dealing = bounded('dealing through a hitch', LOOP_LIMIT);
  let frame = 0;
  while (table.readout().phase.kind === 'dealing') {
    dealing();
    const step = frame === hitchAt ? MAX_STEP : FRAME;
    table.update(step);
    observe(step);
    frame += 1;
  }

  const draining = bounded('draining the queue after the deal', LOOP_LIMIT);
  while (queue.state().pendingPolites.length > 0 || queue.state().pendingOutcomes > 0) {
    draining();
    write(FRAME);
  }
  return { shared, polite };
}

describe('AUDIT-2: what one frame produced, a region actually says', () => {
  it.each([
    ['60 fps', 1 / 60],
    ['144 fps', 1 / 144],
  ])('speaks the reveal sentence at %s, which one pending entry could not reach', (_name, step) => {
    // **Finding `Z5-01`, arm 1, driven as the finding drove it**: the scripted
    // shoe, a 50 wager and a stand one second into the player's turn, at both
    // of the frame rates it measured. Entering SPEC 10's `reveal` turns the
    // hole card face up in the same machine step, so the phase sentence and
    // the dealer's card are produced by ONE frame; the card was pushed second
    // and overwrote the sentence before any tick could write it, which is why
    // 42 of 42 reveals were silent and why the frame rate made no difference.
    const spoken = speak(tableOn(['10', '9', '10', '10']), standingPlan(1, step), step);
    expect(spoken.polite, spoken.polite.join(' / ')).toContain(
      'The dealer reveals the hole card.',
    );
    // And the card that used to overwrite it is still spoken, so the cure is a
    // queue rather than a swap of which of the two is lost.
    expect(
      spoken.polite.some((text) => text.startsWith('Dealer: Ten of')),
      spoken.polite.join(' / '),
    ).toBe(true);
    // In that order, which is what `announcementsFor` promises and what one
    // pending entry could not keep.
    expect(
      spoken.polite.indexOf('The dealer reveals the hole card.'),
      spoken.polite.join(' / '),
    ).toBeLessThan(spoken.polite.findIndex((text) => text.startsWith('Dealer: Ten of')));
  });

  it('speaks the split sentence, which shared its frame with a dealt card', () => {
    // **Finding `Z5-01`, arm 2.** SPEC 4.6 deals onto both halves in the step
    // that splits, so `Split. 2 hands in play.` and `Hand 2: <card>` are one
    // frame's work and the card won.
    let split = false;
    let waited = 0;
    const table = tableOn(['8', '9', '8', '7', '10', '2', '9']);
    const spoken = speak(table, (playing) => {
      const { phase, wallet } = playing.readout();
      switch (phase.kind) {
        case 'start':
          return { kind: 'start' };
        case 'betting':
          return wallet.wager === 0 ? { kind: 'tapChip', chip: ROUND_WAGER } : { kind: 'deal' };
        case 'insurance':
          return { kind: 'declineInsurance' };
        case 'playerTurn': {
          waited += FRAME;
          if (!split) {
            // The same one-second dwell before the split that the reveal arm
            // takes before the stand, and for the same reason.
            if (waited <= 1) {
              return null;
            }
            split = true;
            return { kind: 'split' };
          }
          // A hand still being dealt its second card is not a hand to stand on.
          const hand = playing.readout().hands[phase.activeHand];
          return hand === undefined || hand.cards.length < 2 ? null : { kind: 'stand' };
        }
        default:
          return null;
      }
    });
    expect(spoken.polite, spoken.polite.join(' / ')).toContain('Split. 2 hands in play.');
  });

  it.each([
    ['normal' as const],
    ['fast' as const],
  ])('speaks both cards of a frame that dealt two, at %s speed', (speed) => {
    // **The review's `R-1` construction, as an arm.** The two arms above drive
    // steady frames, and steady frames deal one card each: `table.ts`'s
    // `update` drains the deal queue in a `while` loop against the accumulator,
    // so a frame long enough for two deal steps takes two, and SPEC 4.3 deals
    // player, dealer, player, dealer. A frame that takes steps two and three
    // therefore produces the dealer's up card **and** the player's second card
    // together, which is the pair that shared one `AnnouncementKind` until this
    // fix round: the dealer's entry replaced the player's in place and the
    // player's card was spoken in no round at all.
    //
    // The hitch is one long frame in an otherwise 60 fps deal, swept over every
    // position the deal has, which is how the review measured it: at `normal`
    // four of sixty positions reach the two-step frame and at `fast` fourteen
    // do, because the multiplier shortens the interval the accumulator is
    // measured against while `MAX_STEP` does not move.
    const runs = HITCH_POSITIONS.map((at) => stutteredDeal(speed, at));
    // Only the frames that dealt the player's **last** card of the deal are
    // graded, and that is not a convenience: a player card produced earlier can
    // still be replaced by the next player card under rule 3, which is
    // coalescing working rather than the defect. After the player's second card
    // no further card of either kind arrives, the dealer's hole card being
    // concealed, so both sentences must be spoken or one was destroyed.
    const graded = runs.filter((run) => run.shared.some((frame) => frame.playerCards === 2));
    expect(
      graded.length,
      'no hitch position produced a frame that dealt to both, so this arm asserts nothing',
    ).toBeGreaterThan(0);
    for (const run of graded) {
      const frame = run.shared.find((each) => each.playerCards === 2);
      expect(run.polite, `the player's card: ${run.polite.join(' / ')}`).toContain(frame?.player);
      expect(run.polite, `the dealer's card: ${run.polite.join(' / ')}`).toContain(frame?.dealer);
    }
  });

  it('still speaks the round outcome, and still spaces every write it makes', () => {
    // The control on both cures at once. A queue that had stopped collapsing
    // would speak every card of the deal, and a queue whose polite side had
    // grown past its outcomes would delay the one entry rule 4 protects.
    const spoken = speak(tableOn(['10', '9', '10', '10']), standingPlan(1, FRAME));
    expect(spoken.assertive.some((text) => text.startsWith('Round result.'))).toBe(true);
    expect(spoken.assertive).toHaveLength(1);
    // Four cards are dealt at SPEC 5's 0.22 s interval and the floor is 0.5 s,
    // so the deal cannot be spoken card for card however the classes are cut.
    const cards = spoken.polite.filter((text) => /\bof (?:clubs|diamonds|hearts|spades)\b/.test(text));
    expect(cards.length).toBeLessThan(5);
  });
});
