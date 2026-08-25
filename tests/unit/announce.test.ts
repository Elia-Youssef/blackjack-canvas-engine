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

import { describe, expect, it } from 'vitest';

import { RANKS, type Rank } from '../../src/core/cards';
import type { MilestoneId } from '../../src/core/statistics';
import { TIMINGS, createTable, type IntentResult, type Table } from '../../src/core/table';
import type { Intent } from '../../src/core/types';
import { createWallet, type Wallet } from '../../src/core/wallet';
import {
  POLITE_INTERVAL_SECONDS,
  announcementsFor,
  createAnnouncementQueue,
  roundOutcomeText,
  type AnnounceFrame,
  type Announcement,
} from '../../src/ui/announce';
import type { Notice } from '../../src/ui/state';

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
    announcement: { priority: 'polite', text } as const satisfies Announcement,
  }),
);

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
    const writes = runQueue([{ at: 0, announcement: { priority: 'polite', text: 'Betting.' } }], 1);
    expect(writes[0]?.at).toBe(0);
  });

  it('never drops an outcome, however fast they arrive', () => {
    const outcomes = ['Hand 1 Win', 'Hand 2 Loss', 'Hand 3 Push'].map((text, index) => ({
      at: index * TIMINGS.dealInterval,
      announcement: { priority: 'assertive', text } as const satisfies Announcement,
    }));
    const writes = runQueue(outcomes, 4);
    expect(writes.map((write) => write.text)).toEqual(outcomes.map((entry) => entry.announcement.text));
    expect(respectsInterval(writes)).toBe(true);
  });

  it('would drop two of those three if outcomes coalesced, which is the control', () => {
    // The same three entries offered as polite, which is the coalescing arm.
    // Two of the three never reach a region, which is what rule 4 forbids and
    // what makes the assertion above a real one.
    const coalesced = runQueue(
      ['Hand 1 Win', 'Hand 2 Loss', 'Hand 3 Push'].map((text, index) => ({
        at: index * TIMINGS.dealInterval,
        announcement: { priority: 'polite', text } as const satisfies Announcement,
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
        { at: 0, announcement: { priority: 'polite', text: 'Dealer plays.' } },
        { at: 0.1, announcement: { priority: 'polite', text: 'Dealer: Ten of clubs.' } },
        { at: 0.2, announcement: { priority: 'assertive', text: 'Round result.' } },
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
        queue.push({ priority: 'polite', text: `frame ${String(frame)}` });
        if (queue.tick(dt) !== null) {
          writes += 1;
        }
      }
      return writes;
    });
    expect(new Set(counts).size, `writes per second by frame rate: ${counts.join(', ')}`).toBe(1);
  });

  it('reports what it is holding, and holds at most one polite entry', () => {
    const queue = createAnnouncementQueue();
    queue.tick(1);
    queue.push({ priority: 'polite', text: 'one' });
    queue.push({ priority: 'polite', text: 'two' });
    queue.push({ priority: 'assertive', text: 'outcome one' });
    queue.push({ priority: 'assertive', text: 'outcome two' });
    expect(queue.state().pendingPolite).toBe('two');
    expect(queue.state().pendingOutcomes).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// The deltas, against a real machine
// ---------------------------------------------------------------------------

function bounded(label: string): () => void {
  let turns = 0;
  return () => {
    turns += 1;
    if (turns > LOOP_LIMIT) {
      throw new RangeError(`${label} did not finish inside ${String(LOOP_LIMIT)} turns`);
    }
  };
}

function accept(result: IntentResult): IntentResult {
  if (!result.ok) {
    throw new Error(`${result.kind} was refused by ${result.layer} as ${result.reason}`);
  }
  return result;
}

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
function session(table: Table, notice: Notice | null = null, milestones: readonly MilestoneId[] = []): Session {
  const said: Announcement[] = [];
  const record: Session = { table, said, frame: null };
  const observe = (): void => {
    const next: AnnounceFrame = { readout: table.readout(), context: { notice, milestones } };
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
  const turn = bounded(`driving to ${wanted.join(' or ')}`);
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
      context: { notice: null, milestones: [] },
    };
    expect(announcementsFor(null, first)).toEqual([]);
  });

  it('says nothing on a frame where nothing moved', () => {
    const table = tableOn(['8', '9', '8', '9']);
    const frame: AnnounceFrame = {
      readout: table.readout(),
      context: { notice: null, milestones: [] },
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
    const turn = bounded('playing the split hands out');
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

    const settle = bounded('dealing the split hands');
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
    const base = { readout: table.readout(), context: { notice: null, milestones: [] } } as const;
    const refused: Notice = { intent: 'deal', layer: 'wallet', reason: 'no-wager' };
    const withNotice: AnnounceFrame = { readout: table.readout(), context: { notice: refused, milestones: [] } };
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
      context: { notice: null, milestones: [] },
    };
    const after: AnnounceFrame = {
      readout: table.readout(),
      context: { notice: null, milestones: ['firstNatural'] },
    };
    expect(announcementsFor(before, after)).toEqual([
      { priority: 'polite', text: 'Milestone: First natural.' },
    ]);
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
    const turn = bounded('reaching the bust-out');
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
    const driven = session(tableOn(RANKS.flatMap((each) => [each, each]))) as Driven;
    runTo(driven, ['playerTurn', 'roundResult']);
    for (const entry of driven.said) {
      expect(/\b(?:A|J|Q|K)\b/.test(entry.text), `${entry.text} names a rank glyph`).toBe(false);
    }
  });
});
