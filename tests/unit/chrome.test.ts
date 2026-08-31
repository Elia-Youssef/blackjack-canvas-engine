/**
 * Unit armour under the chrome BJ-15 built. No acceptance item is claimed here.
 *
 * `M1`, `C5`, `C8` and `B15` are graded by the review checklist and by the three
 * Playwright specs over the built `dist/`, which is where a DOM element, a
 * rendered box and a real round can be seen. What this file covers is the part
 * of that part which is arithmetic and does not need a browser: the refusal
 * sentences, the scene arrangement, the felt's rebake test and the frame loop's
 * one conversion. Every one of them is a place a defect would be invisible until
 * a screenshot, and none of them needs a page to be checked.
 */

import { describe, expect, it } from 'vitest';

import { INTENT_KINDS } from '../../src/core/table';
import type { Rank, Suit } from '../../src/core/cards';
import { STARTING_CHIPS, TABLES, canEnter, isUnlocked } from '../../src/core/wallet';
import type { FeltSpec } from '../../src/render/felt';
import {
  SCENE_GEOMETRY,
  fanFor,
  handCentre,
  handLayout,
  needsRebake,
  type Fan,
} from '../../src/render/scene';
import { HIGH_CONTRAST_PALETTE, STANDARD_PALETTE } from '../../src/render/tokens';
import { tableRefusal } from '../../src/ui/availability';
import { createFrameLoop } from '../../src/ui/loop';
import { OVERLAY_IDS, OVERLAY_TITLES } from '../../src/ui/state';
import {
  actionText,
  outcomeText,
  playerActionText,
  reasonText,
  rungText,
  type DisplayReason,
} from '../../src/ui/text';

// ---------------------------------------------------------------------------
// SPEC 4.11's "with a reason surfaced to the player"
// ---------------------------------------------------------------------------

/**
 * Every reason the three layers of `table.ts` can answer with, and the two the
 * chooser derives.
 *
 * A total `Record` rather than a list, so the compiler decides whether it is
 * complete: a reason added to `DisplayReason` and not added here is a type
 * error, where a list would simply be short and the tests below would keep
 * passing over the gap. `table.ts` deliberately does not export the union as a
 * value, for the reason its legality table gives, so this is written out.
 *
 * `BJ-21` widened it by two. The machine still answers `table-locked` for both
 * of SPEC 6's entry conditions; the start screen derives which one failed and
 * says so, and those two sentences are graded here beside the seventeen.
 *
 * AUDIT-1 widened it by one more, on the same precedent: `above-ceiling` also
 * carries two player meanings, a chip whose denomination this table has no use
 * for and a tap that would carry the wager past the ceiling, and the betting
 * bar used to hold the first of them as a private literal while the mirror
 * spoke the second. `chip-over-ceiling` is the display-only split. No machine
 * refusal kind moved for either.
 */
const REASON_COVERAGE: Readonly<Record<DisplayReason, true>> = {
  'wrong-phase': true,
  'pending-wager': true,
  'hand-resolved': true,
  'split-aces': true,
  'not-two-cards': true,
  'not-a-pair': true,
  'split-limit': true,
  'from-split': true,
  'surrender-off': true,
  'double-after-split-off': true,
  'table-locked': true,
  'no-wager': true,
  'off-grid': true,
  'above-ceiling': true,
  'below-minimum': true,
  'nothing-to-repeat': true,
  'insufficient-chips': true,
  'table-not-unlocked': true,
  'table-unaffordable': true,
  'chip-over-ceiling': true,
};

const EVERY_REASON = Object.keys(REASON_COVERAGE) as DisplayReason[];

describe('B15 armour: every refusal has a sentence, and no two share one', () => {
  it('covers all seventeen reasons of the three layers, and the three display splits', () => {
    // The count is the union's, and it is stated so that a reason quietly
    // removed from `DisplayReason` is as visible as one quietly added.
    expect(EVERY_REASON).toHaveLength(20);
  });

  it('answers every reason with a non-empty sentence', () => {
    for (const reason of EVERY_REASON) {
      const text = reasonText(reason);
      expect(text.length, reason).toBeGreaterThan(0);
      expect(text.trim(), reason).toBe(text);
    }
  });

  it('gives each reason a sentence of its own', () => {
    // Two reasons sharing a sentence is the defect a switch with a fallthrough
    // produces, and it reads as working until a player is told the wrong thing.
    const sentences = EVERY_REASON.map(reasonText);
    expect(new Set(sentences).size).toBe(EVERY_REASON.length);
  });

  it('names the ceiling and the minimum as different refusals', () => {
    // The two SPEC 4.11 is most explicit about, and the two `B15` grades in the
    // browser. Rejected over the ceiling is not the same sentence as blocked
    // under the minimum, and a player has to be able to tell them apart.
    expect(reasonText('above-ceiling')).not.toBe(reasonText('below-minimum'));
    expect(reasonText('above-ceiling')).toMatch(/maximum|balance/i);
    expect(reasonText('below-minimum')).toMatch(/minimum/i);
  });

  it('splits the greyed chip from the refused tap, which are two facts', () => {
    // SPEC 4.11's other doubled word, and `src/ui/components/betting.ts`'s own
    // header distinguishes them: a 500 at Bronze is a denomination this table
    // has no use for, whatever is on the board, while a 50 that would carry a
    // 90 wager past a 100 ceiling is a tap. One sentence for both told a
    // screen-reader user the greyed chip was over the ceiling because of the
    // wager it would build, which is not why it is greyed.
    expect(reasonText('chip-over-ceiling')).not.toBe(reasonText('above-ceiling'));
    expect(reasonText('chip-over-ceiling')).toMatch(/chip/i);
    expect(reasonText('chip-over-ceiling')).toMatch(/maximum|balance/i);
  });

  it('splits the chooser refusal by which of SPEC 6 two conditions failed', () => {
    // `BJ-21`'s rider. The machine's one `table-locked` covers both, and a
    // player told "not open to you yet" when their best balance has long
    // passed the threshold has been told to do the wrong thing about it.
    expect(reasonText('table-not-unlocked')).not.toBe(reasonText('table-unaffordable'));
    expect(reasonText('table-not-unlocked')).not.toBe(reasonText('table-locked'));
    expect(reasonText('table-unaffordable')).not.toBe(reasonText('table-locked'));
    // Each names its own cause: the unlock is about the best balance ever
    // reached, and the shortfall is about the table's minimum.
    expect(reasonText('table-not-unlocked')).toMatch(/unlocks|best balance/i);
    expect(reasonText('table-unaffordable')).toMatch(/minimum/i);
  });
});

describe('BJ-21 rider: which chooser refusal each table earns', () => {
  it('asks core for both readings and never invents a comparison', () => {
    // Silver unlocks at 2,500 and its minimum is 50; Gold unlocks at 10,000
    // with a minimum of 100. The three cases below are the only three there
    // are, and each is checked against `canEnter`, which is the predicate the
    // machine itself refuses with.
    expect(tableRefusal('bronze', STARTING_CHIPS, STARTING_CHIPS)).toBeNull();

    // Never reached the threshold: locked, whatever today's balance is.
    expect(tableRefusal('silver', STARTING_CHIPS, 5_000)).toBe('table-not-unlocked');
    expect(isUnlocked('silver', STARTING_CHIPS)).toBe(false);

    // Reached it once, and cannot cover the minimum today.
    expect(tableRefusal('gold', 25_000, 10)).toBe('table-unaffordable');
    expect(isUnlocked('gold', 25_000)).toBe(true);

    // Reached it and can afford it: no refusal at all.
    expect(tableRefusal('gold', 25_000, STARTING_CHIPS)).toBeNull();
  });

  it('answers null exactly when the machine would let the player in', () => {
    // The property, rather than three examples: the split may change which
    // sentence a player reads and may never change who gets in.
    for (const table of TABLES) {
      for (const best of [0, 999, 2_500, 9_999, 10_000, 25_000]) {
        for (const chips of [0, 10, 49, 50, 99, 100, STARTING_CHIPS]) {
          expect(
            tableRefusal(table.id, best, chips) === null,
            `${table.id} at best ${String(best)} with ${String(chips)}`,
          ).toBe(canEnter(table.id, best, chips));
        }
      }
    }
  });
});

describe('C8 armour: the round result has a word for every verdict', () => {
  it('spells all five outcomes of SPEC 4.10 distinctly', () => {
    const spelled = (['SURRENDER', 'PUSH', 'BLACKJACK', 'DEALER_WIN', 'PLAYER_WIN'] as const).map(
      outcomeText,
    );
    expect(new Set(spelled).size).toBe(5);
    for (const text of spelled) {
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('spells all nine rungs of SPEC 4.10 distinctly', () => {
    // The rung is SPEC 12's "reason", and it exists because the outcome cannot
    // say why: rungs 2 and 9 are both a push, and 4, 5 and 8 are all a loss.
    const spelled = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map(rungText);
    expect(new Set(spelled).size).toBe(9);
    expect(rungText(2)).not.toBe(rungText(9));
    expect(new Set([rungText(4), rungText(5), rungText(8)]).size).toBe(3);
  });

  it('spells every action a history entry can record', () => {
    const actions = ['hit', 'stand', 'double', 'split', 'surrender'] as const;
    for (const action of actions) {
      expect(playerActionText(action)).toBe(actionText(action));
    }
    // SPEC 4.7's two intents are actions the player took and are not chart
    // decisions, so they have their own words and are not in `CoachAction`.
    expect(playerActionText('takeInsurance')).not.toBe(playerActionText('declineInsurance'));
    expect(INTENT_KINDS).toContain('takeInsurance');
  });
});

describe('C5 armour: SPEC 10 has three overlays and no fourth', () => {
  it('titles each of the three, distinctly', () => {
    expect(OVERLAY_IDS).toHaveLength(3);
    const titles = OVERLAY_IDS.map((id) => OVERLAY_TITLES[id]);
    expect(new Set(titles).size).toBe(3);
    for (const title of titles) {
      expect(title.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// The scene arrangement
// ---------------------------------------------------------------------------

const BASE: FeltSpec = {
  felt: 'bronze',
  limits: { minimum: 10, maximum: 100 },
  width: 800,
  height: 450,
  dpr: 1,
  palette: STANDARD_PALETTE,
};

/** A fan at a given card width, at the natural pitch. `BJ-22`, item `E8`. */
function naturalFan(cardWidth: number, count: number): Fan {
  return fanFor(count, Number.POSITIVE_INFINITY, cardWidth, cardWidth);
}

describe('the felt is rebaked on drift and on nothing else', () => {
  it('does not rebake when nothing moved', () => {
    expect(needsRebake(BASE, { ...BASE })).toBe(false);
  });

  it('rebakes when any of the seven fields moves', () => {
    expect(needsRebake(BASE, { ...BASE, felt: 'silver' })).toBe(true);
    expect(needsRebake(BASE, { ...BASE, width: 801 })).toBe(true);
    expect(needsRebake(BASE, { ...BASE, height: 451 })).toBe(true);
    expect(needsRebake(BASE, { ...BASE, dpr: 2 })).toBe(true);
    expect(needsRebake(BASE, { ...BASE, limits: { minimum: 50, maximum: 100 } })).toBe(true);
    expect(needsRebake(BASE, { ...BASE, limits: { minimum: 10, maximum: 500 } })).toBe(true);
    // `BJ-22`, item `G9`: the play-surface set is part of the bake. A
    // forced-colors frame that kept the standard bake would blit a textured
    // standard felt under high-contrast cards.
    expect(needsRebake(BASE, { ...BASE, palette: HIGH_CONTRAST_PALETTE })).toBe(true);
  });
});

describe('a hand is laid out centred, and grows without moving off centre', () => {
  const card = (rank: Rank, suit: Suit): { rank: Rank; suit: Suit } => ({ rank, suit });
  const two = [card('A', 'spades'), card('K', 'hearts')];
  const four = [...two, card('3', 'clubs'), card('9', 'diamonds')];

  it('centres a hand on the point it is given', () => {
    const width = 96;
    for (const cards of [two, four]) {
      const laid = handLayout(cards, 400, 100, naturalFan(width, cards.length), cards.length);
      const first = laid[0];
      const last = laid[laid.length - 1];
      expect(first).toBeDefined();
      expect(last).toBeDefined();
      const left = first?.x ?? 0;
      const right = (last?.x ?? 0) + width;
      expect((left + right) / 2).toBeCloseTo(400, 6);
    }
  });

  it('overlaps the cards by the geometry step and no more', () => {
    const laid = handLayout(four, 400, 100, naturalFan(100, 4), 4);
    // The population first, as the neighbouring test does: every assertion here
    // is inside the loop, so a `handLayout` that returned nothing would run the
    // body zero times and report a green test that graded no card at all.
    expect(laid).toHaveLength(four.length);
    const step = 100 * SCENE_GEOMETRY.cardStep;
    for (let index = 1; index < laid.length; index += 1) {
      expect((laid[index]?.x ?? 0) - (laid[index - 1]?.x ?? 0)).toBeCloseTo(step, 6);
    }
  });

  it('draws exactly the face-up cards face up, and the rest face down', () => {
    // SPEC 4.3: the dealer's hole card is the only face-down card in the game,
    // and the machine publishes a count rather than the card.
    const laid = handLayout(two, 400, 100, naturalFan(96, 2), 1);
    expect(laid.map((spec) => spec.faceUp)).toEqual([true, false]);
  });

  it('shares the felt between split hands, left to right', () => {
    expect(handCentre(0, 1, 1000)).toBe(500);
    expect([0, 1].map((index) => handCentre(index, 2, 1000))).toEqual([250, 750]);
    const four = [0, 1, 2, 3].map((index) => handCentre(index, 4, 1000));
    expect(four).toEqual([125, 375, 625, 875]);
    // Ascending, and symmetric about the middle: SPEC 4.6 plays them in order.
    expect([...four].sort((a, b) => a - b)).toEqual(four);
  });
});

// ---------------------------------------------------------------------------
// The frame loop
// ---------------------------------------------------------------------------

describe('the frame loop converts timestamps into one delta per frame', () => {
  /** A scheduler a test drives by hand, with no clock and no animation frame. */
  function manual(): {
    schedule: (callback: (timestamp: number) => void) => number;
    cancel: (handle: number) => void;
    tick: (timestamp: number) => void;
    cancelled: number[];
  } {
    let pending: ((timestamp: number) => void) | null = null;
    let next = 1;
    const cancelled: number[] = [];
    return {
      schedule(callback): number {
        pending = callback;
        return next++;
      },
      cancel(handle): void {
        cancelled.push(handle);
        pending = null;
      },
      tick(timestamp): void {
        const callback = pending;
        pending = null;
        callback?.(timestamp);
      },
      cancelled,
    };
  }

  it('reports zero on the first frame of a run and seconds after it', () => {
    const clock = manual();
    const deltas: number[] = [];
    const loop = createFrameLoop({
      onFrame: (dt) => deltas.push(dt),
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    loop.start();
    clock.tick(1000);
    clock.tick(1016);
    clock.tick(1516);

    // There is no previous frame to measure the first one from, and inventing
    // one would advance the game by an interval nobody waited.
    expect(deltas).toEqual([0, 0.016, 0.5]);
  });

  it('stops scheduling, and starts a fresh run from zero again', () => {
    const clock = manual();
    const deltas: number[] = [];
    const loop = createFrameLoop({
      onFrame: (dt) => deltas.push(dt),
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    loop.start();
    expect(loop.running()).toBe(true);
    clock.tick(100);
    clock.tick(200);
    loop.stop();
    expect(loop.running()).toBe(false);
    expect(clock.cancelled).toHaveLength(1);

    // Nothing is delivered while stopped.
    clock.tick(300);
    expect(deltas).toEqual([0, 0.1]);

    loop.start();
    clock.tick(9000);
    expect(deltas).toEqual([0, 0.1, 0]);
  });

  it('is idempotent on start, so a double start cannot run two loops', () => {
    const clock = manual();
    const deltas: number[] = [];
    const loop = createFrameLoop({
      onFrame: (dt) => deltas.push(dt),
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    loop.start();
    loop.start();
    clock.tick(50);
    expect(deltas).toEqual([0]);
    loop.stop();
    expect(clock.cancelled).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// BJ-20: the loop's answer to a hidden tab. QUALITY-BAR section 7, item C7.
// ---------------------------------------------------------------------------

/**
 * A page whose visibility the test controls, which is the platform half the
 * loop reads. `EventTarget` carries the listener machinery; the one field the
 * handler reads is settable here because a test that could not choose the
 * answer would be re-reading the runner's own tab state.
 */
class FakePage extends EventTarget {
  visibilityState: string = 'visible';

  hide(): void {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }

  show(): void {
    this.visibilityState = 'visible';
    this.dispatchEvent(new Event('visibilitychange'));
  }

  leave(): void {
    this.dispatchEvent(new Event('pagehide'));
  }
}

describe('a hidden tab pauses the loop and a visible one resumes it', () => {
  /** The manual scheduler the existing loop tests above use. */
  function manual(): {
    schedule: (callback: (timestamp: number) => void) => number;
    cancel: (handle: number) => void;
    tick: (timestamp: number) => void;
  } {
    let pending: ((timestamp: number) => void) | null = null;
    let next = 1;
    return {
      schedule(callback): number {
        pending = callback;
        return next++;
      },
      cancel(): void {
        pending = null;
      },
      tick(timestamp): void {
        const callback = pending;
        pending = null;
        callback?.(timestamp);
      },
    };
  }

  it('stops on hidden, writes, and resumes with no gap penalty', () => {
    const clock = manual();
    const page = new FakePage();
    const deltas: number[] = [];
    const hidden: number[] = [];
    const loop = createFrameLoop({
      onFrame: (dt) => deltas.push(dt),
      schedule: clock.schedule,
      cancel: clock.cancel,
      visibility: page,
      page: page,
      onHidden: () => hidden.push(deltas.length),
    });

    loop.start();
    clock.tick(1000);
    clock.tick(1016);

    page.hide();
    // Nothing schedules while the tab is hidden, so however long the page
    // stays away, no frame and no delta is produced.
    clock.tick(99_000);
    expect(deltas, 'no frame ran while hidden').toEqual([0, 0.016]);
    expect(hidden, 'the write happened once, at the pause').toEqual([2]);

    page.show();
    clock.tick(99_016);
    // The resumed frame is the first frame of a fresh run: zero, not a 98-second
    // gap, which is SPEC 3's "no penalty applied" as this loop's own clause.
    expect(deltas).toEqual([0, 0.016, 0]);
  });

  it('stops on pagehide and never restarts', () => {
    const clock = manual();
    const page = new FakePage();
    let frames = 0;
    let writes = 0;
    const loop = createFrameLoop({
      onFrame: () => {
        frames += 1;
      },
      schedule: clock.schedule,
      cancel: clock.cancel,
      visibility: page,
      page: page,
      onHidden: () => {
        writes += 1;
      },
    });

    loop.start();
    clock.tick(1000);
    page.leave();
    clock.tick(2000);
    page.show();
    clock.tick(3000);

    expect(frames, 'the page that left ran exactly one frame').toBe(1);
    expect(writes, 'the write happened on the way out').toBe(1);
    expect(loop.running()).toBe(false);
  });

  it('ignores both events once stopped deliberately, and after dispose', () => {
    const clock = manual();
    const page = new FakePage();
    let writes = 0;
    const loop = createFrameLoop({
      onFrame: () => undefined,
      schedule: clock.schedule,
      cancel: clock.cancel,
      visibility: page,
      page: page,
      onHidden: () => {
        writes += 1;
      },
    });

    loop.start();
    clock.tick(1000);
    loop.stop();
    page.hide();
    page.show();
    expect(writes, 'a stopped game does not write').toBe(0);
    expect(loop.running(), 'a stopped game does not restart on show').toBe(false);

    loop.start();
    clock.tick(1016);
    loop.dispose();
    page.hide();
    page.show();
    expect(writes, 'a disposed game does not write').toBe(0);
    expect(loop.running(), 'a disposed game stays stopped').toBe(false);
  });
});
