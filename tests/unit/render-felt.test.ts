/**
 * Item E5, Minor, 8 points. Armour, not closure.
 *
 *   "The felt prints the house rules as a real table does: blackjack pays 3
 *    to 2, dealer must stand on all 17s, insurance pays 2 to 1, and the
 *    active table limits."
 *
 * E5 is a **Demonstration** item: it closes at the ACCEPTANCE section 4
 * session with one capture per table. This file is the automated armour under
 * that capture: the four printed lines with their exact text per table, the
 * print ink, the ground, the load-bearing rail, and the two structural
 * properties the QUALITY-BAR hangs the renderer on, that the bake is
 * deterministic to the instruction and that the per-frame path is one blit
 * with nothing procedural in it.
 *
 * Every expected string below is written out in this file, never read off
 * `feltPrint`, so a dropped or reworded line disagrees with something it does
 * not share. The limits come from `core/wallet.ts`'s real tables, because the
 * felt must print the numbers the wallet enforces.
 */

import { describe, expect, it } from 'vitest';

import { TABLES, tableLimits } from '../../src/core/wallet';
import { bakeFelt, feltPrint, FELT_GEOMETRY, type FeltSpec } from '../../src/render/felt';
import { BORDER, FELT, SURFACE } from '../../src/render/tokens';
import { createRecordingContext, createStyleFreeCanvas } from './support/recording-context';

/** Small enough to keep the grain loop cheap, large enough to be a felt. */
function spec(overrides: Partial<FeltSpec> = {}): FeltSpec {
  return {
    felt: 'bronze',
    limits: { minimum: 10, maximum: 100 },
    width: 64,
    height: 40,
    dpr: 1,
    ...overrides,
  };
}

describe('E5: the printed lines', () => {
  it('prints exactly the four lines SPEC 16 states, in table order', () => {
    expect(feltPrint({ minimum: 10, maximum: 100 })).toEqual([
      'INSURANCE PAYS 2 TO 1',
      'BLACKJACK PAYS 3 TO 2',
      'Dealer must stand on all 17s',
      'MINIMUM 10 - MAXIMUM 100',
    ]);
  });

  it('prints each real table\'s own limits, from the wallet record', () => {
    const expected: Record<string, string> = {
      bronze: 'MINIMUM 10 - MAXIMUM 100',
      silver: 'MINIMUM 50 - MAXIMUM 500',
      gold: 'MINIMUM 100 - MAXIMUM 2000',
    };
    expect(TABLES).toHaveLength(3);
    for (const table of TABLES) {
      const lines = feltPrint(tableLimits(table.id));
      expect(lines[3], table.id).toBe(expected[table.id]);
    }
  });

  it('bakes all four lines onto the felt in the print ink', () => {
    const { canvas, recording } = createStyleFreeCanvas();
    bakeFelt(canvas, spec());

    const texts = recording.calls('fillText');
    expect(texts.map((call) => call.args[0])).toEqual([
      'INSURANCE PAYS 2 TO 1',
      'BLACKJACK PAYS 3 TO 2',
      'Dealer must stand on all 17s',
      'MINIMUM 10 - MAXIMUM 100',
    ]);

    for (const text of texts) {
      const index = recording.entries.indexOf(text);
      expect(recording.valueBefore(index, 'fillStyle')).toBe(SURFACE.print);
      expect(String(recording.valueBefore(index, 'font'))).toContain('serif');
      const y = text.args[2];
      expect(typeof y).toBe('number');
      expect(y as number).toBeGreaterThan(0);
      expect(y as number).toBeLessThan(40);
    }

    // The insurance line sits inside its band, between the two divider rules.
    const insuranceY = texts[0]?.args[2] as number;
    expect(insuranceY).toBeGreaterThan(FELT_GEOMETRY.bandTopY * 40);
    expect(insuranceY).toBeLessThan(FELT_GEOMETRY.bandBottomY * 40);
  });
});

describe('E5: the table itself', () => {
  it('grounds the felt in the named table\'s own colour', () => {
    for (const felt of ['bronze', 'silver', 'gold'] as const) {
      const { canvas, recording } = createStyleFreeCanvas();
      bakeFelt(canvas, spec({ felt }));
      const firstFill = recording.indexOfCall('fill');
      expect(firstFill).toBeGreaterThan(-1);
      expect(recording.valueBefore(firstFill, 'fillStyle'), felt).toBe(FELT[felt]);
    }
  });

  it('strokes the rail in its token and never below the border floor', () => {
    // SPEC 16: no felt clears 3:1 against the dark ground; the rail is the
    // boundary that carries it. At this bake size the proportional width
    // would be under a logical pixel, so the floor is what keeps the
    // boundary real.
    const { canvas, recording } = createStyleFreeCanvas();
    bakeFelt(canvas, spec());

    const railStrokes = recording.calls('stroke').filter((call) => {
      const index = recording.entries.indexOf(call);
      return recording.valueBefore(index, 'strokeStyle') === SURFACE.rail;
    });
    expect(railStrokes).toHaveLength(1);
    const railStroke = railStrokes[0];
    const index = railStroke === undefined ? -1 : recording.entries.indexOf(railStroke);
    const width = recording.valueBefore(index, 'lineWidth');
    expect(typeof width).toBe('number');
    expect(width as number).toBeGreaterThanOrEqual(BORDER.thick);
  });

  it('rules the insurance band with two divider lines in the print ink', () => {
    const { canvas, recording } = createStyleFreeCanvas();
    bakeFelt(canvas, spec());

    const bandStrokes = recording.calls('stroke').filter((call) => {
      const index = recording.entries.indexOf(call);
      return (
        recording.valueBefore(index, 'strokeStyle') === SURFACE.print &&
        recording.valueBefore(index, 'lineWidth') === BORDER.hair
      );
    });
    expect(bandStrokes).toHaveLength(2);
  });

  it('shades and grains the felt with its own colour only', () => {
    // SPEC 16 asks for "a gradient with subtle noise", and the token contract
    // forbids inventing a colour to do it with. Both effects are the felt hex
    // composited over itself, so the vignette's every stop and the grain's
    // fill are the one committed colour.
    const { canvas, recording } = createStyleFreeCanvas();
    bakeFelt(canvas, spec());

    const gradients = recording.calls('createRadialGradient');
    expect(gradients).toHaveLength(1);
    const vignette = recording
      .sets('fillStyle')
      .map((set) => set.value)
      .find((value) => typeof value === 'object' && value !== null && 'stops' in value);
    expect(vignette).toEqual({
      gradient: 'createRadialGradient',
      args: [32, 20, 0, 32, 20, Math.hypot(64, 40) / 2],
      stops: [
        { offset: 0, color: `${FELT.bronze}00` },
        { offset: FELT_GEOMETRY.vignetteStart, color: `${FELT.bronze}00` },
        { offset: 1, color: `${FELT.bronze}52` },
      ],
    });

    // The grain: one cell per SPACE[1] square, clipped to the table, half
    // lifting and half sinking, never past the alpha ceiling.
    expect(recording.calls('clip')).toHaveLength(1);
    const cells = recording.calls('fillRect');
    expect(cells).toHaveLength(Math.ceil(64 / 4) * Math.ceil(40 / 4));

    const operations = new Set<unknown>();
    for (const cell of cells) {
      const index = recording.entries.indexOf(cell);
      operations.add(recording.valueBefore(index, 'globalCompositeOperation'));
      const alpha = recording.valueBefore(index, 'globalAlpha');
      expect(typeof alpha).toBe('number');
      expect(alpha as number).toBeGreaterThanOrEqual(0);
      expect(alpha as number).toBeLessThanOrEqual(FELT_GEOMETRY.noiseAlpha);
    }
    expect(operations).toEqual(new Set(['multiply', 'screen']));
  });

  it('bakes the same instructions twice from the same spec', () => {
    // The determinism the BJ-22 visual baselines will diff for pixels,
    // asserted here at the instruction level. The length guard is the
    // negative control: two empty recordings are also equal.
    const first = createStyleFreeCanvas();
    bakeFelt(first.canvas, spec());
    const second = createStyleFreeCanvas();
    bakeFelt(second.canvas, spec());

    expect(first.recording.entries.length).toBeGreaterThan(200);
    expect(first.recording.entries).toEqual(second.recording.entries);

    // And a different table bakes different instructions, so the equality
    // above is not an artefact of a recorder that sees nothing.
    const gold = createStyleFreeCanvas();
    bakeFelt(gold.canvas, spec({ felt: 'gold' }));
    expect(gold.recording.entries).not.toEqual(second.recording.entries);
  });
});

describe('E5: the frame path is a blit', () => {
  it('draws the baked canvas per frame and regenerates nothing', () => {
    // QUALITY-BAR 1: the felt, its grain and its printed rules render once
    // into an offscreen canvas; nothing procedural is regenerated per frame.
    const { canvas } = createStyleFreeCanvas();
    const layer = bakeFelt(canvas, spec());

    const frame = createRecordingContext();
    layer.drawShapes(frame.ctx);
    expect(frame.entries).toHaveLength(1);
    const blit = frame.entries[0];
    expect(blit?.kind).toBe('call');
    expect(blit?.kind === 'call' ? blit.op : '').toBe('drawImage');
    expect(blit?.kind === 'call' ? blit.args.slice(1) : []).toEqual([0, 0, 64, 40]);

    const text = createRecordingContext();
    layer.drawText(text.ctx);
    expect(text.entries).toHaveLength(0);
  });
});
