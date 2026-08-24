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

import { INTENT_KINDS, type RejectionReason } from '../../src/core/table';
import type { Rank, Suit } from '../../src/core/cards';
import type { FeltSpec } from '../../src/render/felt';
import { SCENE_GEOMETRY, handCentre, handLayout, needsRebake } from '../../src/render/scene';
import { createFrameLoop } from '../../src/ui/loop';
import { OVERLAY_IDS, OVERLAY_TITLES } from '../../src/ui/state';
import { actionText, outcomeText, playerActionText, reasonText, rungText } from '../../src/ui/text';

// ---------------------------------------------------------------------------
// SPEC 4.11's "with a reason surfaced to the player"
// ---------------------------------------------------------------------------

/**
 * Every reason the three layers of `table.ts` can answer with.
 *
 * A total `Record` rather than a list, so the compiler decides whether it is
 * complete: a reason added to `RejectionReason` and not added here is a type
 * error, where a list would simply be short and the tests below would keep
 * passing over the gap. `table.ts` deliberately does not export the union as a
 * value, for the reason its legality table gives, so this is written out.
 */
const REASON_COVERAGE: Readonly<Record<RejectionReason, true>> = {
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
};

const EVERY_REASON = Object.keys(REASON_COVERAGE) as RejectionReason[];

describe('B15 armour: every refusal has a sentence, and no two share one', () => {
  it('covers all seventeen reasons of the three layers', () => {
    // The count is the union's, and it is stated so that a reason quietly
    // removed from `RejectionReason` is as visible as one quietly added.
    expect(EVERY_REASON).toHaveLength(17);
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
};

describe('the felt is rebaked on drift and on nothing else', () => {
  it('does not rebake when nothing moved', () => {
    expect(needsRebake(BASE, { ...BASE })).toBe(false);
  });

  it('rebakes when any of the six fields moves', () => {
    expect(needsRebake(BASE, { ...BASE, felt: 'silver' })).toBe(true);
    expect(needsRebake(BASE, { ...BASE, width: 801 })).toBe(true);
    expect(needsRebake(BASE, { ...BASE, height: 451 })).toBe(true);
    expect(needsRebake(BASE, { ...BASE, dpr: 2 })).toBe(true);
    expect(needsRebake(BASE, { ...BASE, limits: { minimum: 50, maximum: 100 } })).toBe(true);
    expect(needsRebake(BASE, { ...BASE, limits: { minimum: 10, maximum: 500 } })).toBe(true);
  });
});

describe('a hand is laid out centred, and grows without moving off centre', () => {
  const card = (rank: Rank, suit: Suit): { rank: Rank; suit: Suit } => ({ rank, suit });
  const two = [card('A', 'spades'), card('K', 'hearts')];
  const four = [...two, card('3', 'clubs'), card('9', 'diamonds')];

  it('centres a hand on the point it is given', () => {
    const width = 96;
    for (const cards of [two, four]) {
      const laid = handLayout(cards, 400, 100, width, cards.length);
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
    const laid = handLayout(four, 400, 100, 100, 4);
    const step = 100 * SCENE_GEOMETRY.cardStep;
    for (let index = 1; index < laid.length; index += 1) {
      expect((laid[index]?.x ?? 0) - (laid[index - 1]?.x ?? 0)).toBeCloseTo(step, 6);
    }
  });

  it('draws exactly the face-up cards face up, and the rest face down', () => {
    // SPEC 4.3: the dealer's hole card is the only face-down card in the game,
    // and the machine publishes a count rather than the card.
    const laid = handLayout(two, 400, 100, 96, 1);
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
