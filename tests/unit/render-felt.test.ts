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
import {
  bakeFelt,
  bakeGrainTiles,
  feltPrint,
  FELT_GEOMETRY,
  sameGrain,
  type FeltSpec,
  type GrainTiles,
} from '../../src/render/felt';
import {
  BORDER,
  feltColour,
  FELT,
  STANDARD_PALETTE,
  SURFACE,
  type FeltName,
} from '../../src/render/tokens';
import { createRecordingContext, createStyleFreeCanvas } from './support/recording-context';

/** Small enough to keep the bake cheap, large enough to be a felt. */
function spec(overrides: Partial<FeltSpec> = {}): FeltSpec {
  return {
    felt: 'bronze',
    limits: { minimum: 10, maximum: 100 },
    width: 64,
    height: 40,
    dpr: 1,
    palette: STANDARD_PALETTE,
    ...overrides,
  };
}

/** The grain pair a bake needs, in the felt colour the spec names. */
function tiles(felt: FeltName = 'bronze', dpr = 1): GrainTiles {
  return bakeGrainTiles(() => createStyleFreeCanvas().canvas, {
    felt: feltColour(STANDARD_PALETTE.surface, felt),
    dpr,
  });
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
    bakeFelt(canvas, spec(), () => tiles());

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
      bakeFelt(canvas, spec({ felt }), () => tiles(felt));
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
    bakeFelt(canvas, spec(), () => tiles());

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
    bakeFelt(canvas, spec(), () => tiles());

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
    bakeFelt(canvas, spec(), () => tiles());

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

    // The grain reaches the felt as tiles, clipped to the table, half lifting
    // and half sinking. **No cell is drawn into the felt at all**, which is the
    // whole of `BJ-22`'s fix round for item `H4`: the segments are the cost, so
    // they are paid once into a square and blitted from there.
    expect(recording.calls('clip')).toHaveLength(1);
    expect(recording.calls('rect'), 'a cell was drawn into the felt').toHaveLength(0);

    const side = FELT_GEOMETRY.noiseTileCells * FELT_GEOMETRY.noiseCell;
    const blits = recording.calls('drawImage');
    expect(blits).toHaveLength(2 * Math.ceil(64 / side) * Math.ceil(40 / side));

    const operations = new Set<unknown>();
    for (const blit of blits) {
      const index = recording.entries.indexOf(blit);
      operations.add(recording.valueBefore(index, 'globalCompositeOperation'));
      // The alpha is in the baked pixels, so the blit runs at full opacity: a
      // blit that also dimmed would apply the strength twice.
      expect(recording.valueBefore(index, 'globalAlpha')).toBe(1);
      expect(blit.args.slice(3)).toEqual([side, side]);
    }
    expect(operations).toEqual(new Set(['multiply', 'screen']));
  });

  it('bakes every grain cell into the pair, in the felt colour, under the ceiling', () => {
    // The colour claim the test above used to carry for the cells themselves:
    // both effects are the felt hex composited over itself, so no colour exists
    // here beyond the SPEC 16 palette. It moved with the cells.
    const canvases: ReturnType<typeof createStyleFreeCanvas>[] = [];
    const pair = bakeGrainTiles(
      () => {
        const made = createStyleFreeCanvas();
        canvases.push(made);
        return made.canvas;
      },
      { felt: FELT.bronze, dpr: 1 },
    );
    expect(canvases).toHaveLength(2);
    expect(pair.side).toBe(FELT_GEOMETRY.noiseTileCells * FELT_GEOMETRY.noiseCell);

    let cells = 0;
    for (const { recording } of canvases) {
      const drawn = recording.calls('rect');
      // Neither square is empty, or "half lifting and half sinking" would be
      // true of a pair with everything in one of them.
      expect(drawn.length).toBeGreaterThan(0);
      cells += drawn.length;
      for (const cell of drawn) {
        const index = recording.entries.indexOf(cell);
        expect(recording.valueBefore(index, 'fillStyle')).toBe(FELT.bronze);
        const alpha = recording.valueBefore(index, 'globalAlpha');
        expect(typeof alpha).toBe('number');
        expect(alpha as number).toBeGreaterThan(0);
        expect(alpha as number).toBeLessThanOrEqual(FELT_GEOMETRY.noiseAlpha);
        expect(cell.args.slice(2)).toEqual([FELT_GEOMETRY.noiseCell, FELT_GEOMETRY.noiseCell]);
      }
    }
    // Every cell of the square, in exactly one of the two: a hash that answered
    // one direction for everything would fail the emptiness check above, and a
    // cell counted twice would fail this.
    expect(cells).toBe(FELT_GEOMETRY.noiseTileCells ** 2);
  });

  it('refuses a pair baked for another colour or another backing-store scale', () => {
    // A cache in front of a bake invites exactly one failure, serving the pair
    // that was made for something else. It is an error rather than a silently
    // wrong texture.
    const { canvas } = createStyleFreeCanvas();
    expect(() => bakeFelt(canvas, spec(), () => tiles('gold'))).toThrow(/another colour/);
    expect(() => bakeFelt(canvas, spec(), () => tiles('bronze', 2))).toThrow(/backing-store scale/);
    expect(sameGrain({ felt: FELT.bronze, dpr: 1 }, { felt: FELT.bronze, dpr: 1 })).toBe(true);
    expect(sameGrain({ felt: FELT.bronze, dpr: 1 }, { felt: FELT.gold, dpr: 1 })).toBe(false);
    expect(sameGrain({ felt: FELT.bronze, dpr: 1 }, { felt: FELT.bronze, dpr: 2 })).toBe(false);
  });

  it('bakes the same instructions twice from the same spec', () => {
    // The determinism the BJ-22 visual baselines diff for pixels, asserted
    // here at the instruction level. The length guard is the negative control:
    // two empty recordings are also equal. One grain pair across both bakes,
    // because a blit records the square it copied and two squares baked from
    // one spec are equal in pixels without being the same object; the squares'
    // own determinism is the test below.
    const pair = tiles();
    const first = createStyleFreeCanvas();
    bakeFelt(first.canvas, spec(), () => pair);
    const second = createStyleFreeCanvas();
    bakeFelt(second.canvas, spec(), () => pair);

    expect(first.recording.entries.length).toBeGreaterThan(50);
    expect(first.recording.entries).toEqual(second.recording.entries);

    // And a different table bakes different instructions, so the equality
    // above is not an artefact of a recorder that sees nothing.
    const gold = createStyleFreeCanvas();
    bakeFelt(gold.canvas, spec({ felt: 'gold' }), () => tiles('gold'));
    expect(gold.recording.entries).not.toEqual(second.recording.entries);
  });

  it('bakes the same grain squares twice from the same grain spec', () => {
    // **The determinism the visual baselines diff, at the level it now lives
    // at.** The cells moved out of the felt bake and into the squares at
    // `BJ-22`'s fix round, and the claim moved with them: a seeded hash bakes
    // the same texture on every run, and a random source cannot.
    const streams = (felt: FeltName): unknown[][] => {
      const made: ReturnType<typeof createStyleFreeCanvas>[] = [];
      bakeGrainTiles(
        () => {
          const one = createStyleFreeCanvas();
          made.push(one);
          return one.canvas;
        },
        { felt: feltColour(STANDARD_PALETTE.surface, felt), dpr: 1 },
      );
      return made.map((one) => [...one.recording.entries]);
    };

    const first = streams('bronze');
    const second = streams('bronze');
    expect(first[0]?.length ?? 0).toBeGreaterThan(1_000);
    expect(first).toEqual(second);

    // The control: a different felt colour bakes the same *shape* in a
    // different ink, so the equality above is a finding rather than a recorder
    // that saw nothing.
    expect(streams('gold')).not.toEqual(second);
  });
});

describe('E5: the frame path is a blit', () => {
  it('draws the baked canvas per frame and regenerates nothing', () => {
    // QUALITY-BAR 1: the felt, its grain and its printed rules render once
    // into an offscreen canvas; nothing procedural is regenerated per frame.
    const { canvas } = createStyleFreeCanvas();
    const layer = bakeFelt(canvas, spec(), () => tiles());

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
