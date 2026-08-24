/**
 * Item E4, Minor, 8 points. Armour, not closure.
 *
 *   "Chips render in conventional denominational colours and stack with
 *    visible offset, so a wager reads as chips rather than only as a number."
 *
 * E4 is a **Demonstration** item: it closes at the ACCEPTANCE section 4
 * session, where a 680 wager is built and captured. This file is the
 * automated armour under that capture: the decomposition arithmetic, the
 * stack's offset, the denomination-to-colour plumbing and the single value
 * glyph, all asserted through the recording context because Vitest has no
 * rasteriser. Pixels are the browser suite's half.
 *
 * The decomposition is checked against an independent dynamic-programming
 * minimiser written in this file over the literal denominations 10, 50, 100
 * and 500, not against the module's own list, so a greedy walk that skipped a
 * coin disagrees with something it does not share.
 */

import { describe, expect, it } from 'vitest';

import {
  CHIP_GEOMETRY,
  chipStackLayout,
  drawChipStackShapes,
  drawChipStackText,
  wagerToChips,
  type ChipStackSpec,
} from '../../src/render/chips';
import { CHIP_FILL, CHIP_GLYPH, CHIP_RING } from '../../src/render/tokens';
import { createRecordingContext } from './support/recording-context';

/** The chip set, written out rather than imported, so the sweep is its own. */
const DENOMINATIONS = [10, 50, 100, 500] as const;

/** Fewest chips that make `wager`, by dynamic programming over the set. */
function fewestChips(wager: number): number {
  const chips: number[] = new Array<number>(wager / 10 + 1).fill(Number.POSITIVE_INFINITY);
  chips[0] = 0;
  for (let amount = 10; amount <= wager; amount += 10) {
    for (const denomination of DENOMINATIONS) {
      if (denomination <= amount) {
        const rest = chips[(amount - denomination) / 10];
        const candidate = (rest ?? Number.POSITIVE_INFINITY) + 1;
        const current = chips[amount / 10] ?? Number.POSITIVE_INFINITY;
        if (candidate < current) {
          chips[amount / 10] = candidate;
        }
      }
    }
  }
  return chips[wager / 10] ?? Number.POSITIVE_INFINITY;
}

describe('E4: a wager decomposes into denominations', () => {
  it('turns the demonstration wager of 680 into all four colours', () => {
    // ACCEPTANCE section 4 builds exactly this wager because it is the
    // smallest kind of stack that shows every denominational colour at once.
    expect(wagerToChips(680)).toEqual([500, 100, 50, 10, 10, 10]);
    expect(new Set(wagerToChips(680)).size).toBe(4);
  });

  it('accounts for every reachable wager exactly, largest first', () => {
    // 10 up to the gold table maximum of 2,000, the whole grid SPEC 4.11
    // allows a wager to live on.
    for (let wager = 10; wager <= 2000; wager += 10) {
      const chips = wagerToChips(wager);
      expect(chips.reduce((sum, chip) => sum + chip, 0), String(wager)).toBe(wager);
      for (let index = 1; index < chips.length; index += 1) {
        expect(chips[index] ?? 0).toBeLessThanOrEqual(chips[index - 1] ?? 0);
      }
      for (const chip of chips) {
        expect(DENOMINATIONS).toContain(chip);
      }
    }
  });

  it('uses the fewest chips, checked against an independent minimiser', () => {
    for (let wager = 10; wager <= 2000; wager += 10) {
      expect(wagerToChips(wager).length, String(wager)).toBe(fewestChips(wager));
    }
  });

  it('draws no chips for a zero wager and rejects everything off the grid', () => {
    expect(wagerToChips(0)).toEqual([]);
    // Rejected, never rounded: the wallet's reject-never-clamp stance reaches
    // the renderer too. A 25 wager cannot exist and must not become chips.
    for (const wager of [25, 15, -10, 10.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => wagerToChips(wager), String(wager)).toThrowError(/multiple of 10/);
    }
  });
});

describe('E4: the stack layout', () => {
  const stack: ChipStackSpec = { x: 100, y: 200, radius: 20, chips: wagerToChips(680) };

  it('raises each chip by the offset fraction of the radius, largest at the bottom', () => {
    const placements = chipStackLayout(stack);
    expect(placements).toHaveLength(6);
    expect(placements[0]?.denomination).toBe(500);
    expect(placements[placements.length - 1]?.denomination).toBe(10);

    for (let index = 0; index < placements.length; index += 1) {
      const placement = placements[index];
      expect(placement?.x).toBe(100);
      expect(placement?.y).toBeCloseTo(200 - index * CHIP_GEOMETRY.stackOffset * 20, 10);
    }
    // Strictly rising, which is the "visible offset" half of the criterion:
    // a zero or negative offset stacks the chips into one circle and the
    // wager collapses back into a number.
    for (let index = 1; index < placements.length; index += 1) {
      expect(placements[index]?.y ?? 0).toBeLessThan(placements[index - 1]?.y ?? 0);
    }
  });

  it('keeps the offset larger than the ring, so every sliver shows its fill', () => {
    // Derived, not decorative: the visible band of a buried chip is the
    // offset, the top of that band is its ring, and only the excess shows the
    // denomination colour the demonstration confirms.
    expect(CHIP_GEOMETRY.stackOffset).toBeGreaterThan(CHIP_GEOMETRY.ring);
  });

  it('turns each chip in the stack so the edge pattern does not extrude', () => {
    const placements = chipStackLayout(stack);
    const angles = new Set(placements.map((placement) => placement.angle));
    expect(angles.size).toBe(placements.length);
    expect(placements[1]?.angle).toBeCloseTo(CHIP_GEOMETRY.dashTurn, 10);
  });
});

describe('E4: the drawing', () => {
  const stack: ChipStackSpec = { x: 100, y: 200, radius: 20, chips: [500, 10] };

  it('fills each chip in its own denominational colour, bottom up', () => {
    const recording = createRecordingContext();
    drawChipStackShapes(recording.ctx, stack);
    expect(recording.entries.length).toBeGreaterThan(0);

    const chipFills = recording.sets('fillStyle').map((set) => set.value);
    expect(chipFills).toEqual([CHIP_FILL[500], CHIP_FILL[10]]);
  });

  it('rings every chip in the edge token, dashes included', () => {
    const recording = createRecordingContext();
    drawChipStackShapes(recording.ctx, stack);

    const strokes = recording.calls('stroke');
    // Per chip: one solid ring plus the edge dashes.
    expect(strokes).toHaveLength(2 * (1 + CHIP_GEOMETRY.dashCount));
    for (const stroke of strokes) {
      const index = recording.entries.indexOf(stroke);
      expect(recording.valueBefore(index, 'strokeStyle')).toBe(CHIP_RING);
    }

    // One full circle fill and one ring per chip, six dashes each: 16 arcs.
    expect(recording.calls('arc')).toHaveLength(2 * (2 + CHIP_GEOMETRY.dashCount));
  });

  it('starts the second chip\'s dashes a turn later than the first', () => {
    const recording = createRecordingContext();
    drawChipStackShapes(recording.ctx, stack);

    // Dash arcs are the ones at the dash radius.
    const dashStarts = recording
      .calls('arc')
      .filter((call) => call.args[2] === stack.radius * CHIP_GEOMETRY.dashRadius)
      .map((call) => call.args[3]);
    expect(dashStarts).toHaveLength(2 * CHIP_GEOMETRY.dashCount);
    expect(dashStarts[0]).toBe(0);
    expect(dashStarts[CHIP_GEOMETRY.dashCount]).toBeCloseTo(CHIP_GEOMETRY.dashTurn, 10);
  });

  it('prints one value glyph, on the top chip, in the glyph token', () => {
    const recording = createRecordingContext();
    drawChipStackText(recording.ctx, stack);

    const texts = recording.calls('fillText');
    expect(texts).toHaveLength(1);
    const glyph = texts[0];
    expect(glyph?.args[0]).toBe('10');
    expect(glyph?.args[1]).toBe(100);
    expect(glyph?.args[2]).toBeCloseTo(200 - CHIP_GEOMETRY.stackOffset * 20, 10);

    const index = recording.indexOfCall('fillText');
    expect(recording.valueBefore(index, 'fillStyle')).toBe(CHIP_GLYPH);
    expect(String(recording.valueBefore(index, 'font'))).toContain('bold');
  });

  it('draws nothing at all for an empty stack', () => {
    const shapes = createRecordingContext();
    drawChipStackShapes(shapes.ctx, { ...stack, chips: [] });
    expect(shapes.entries).toHaveLength(0);

    const text = createRecordingContext();
    drawChipStackText(text.ctx, { ...stack, chips: [] });
    expect(text.entries).toHaveLength(0);
  });
});
