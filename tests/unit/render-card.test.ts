/**
 * Item E3, Minor, 11 points. Armour, not closure.
 *
 *   "Cards carry rank and suit indices in both opposing corners and a correct
 *    centre pip layout for number cards."
 *
 * E3 is a **Demonstration** item: it closes at the ACCEPTANCE section 4
 * session, where a dealt hand is captured at 200 percent zoom against all
 * three felts. This file is the automated armour under that capture, holding
 * the part of the claim a person should not be asked to re-derive by eye:
 * the layout table's structure, both corner indices with the far one rotated,
 * the ink mapping, and the face-down card's silence.
 *
 * The layout structure is checked against `core/cards.ts`'s pip values rather
 * than against the table's own length, and the classic layouts are pinned by
 * two properties a wrong table fails: every layout maps onto itself under a
 * half turn except the 7, whose odd pip is upper-half only. The inversion
 * counts are hand-derived in this file, not read off the module.
 *
 * The drawing is asserted through the recording context in
 * `tests/unit/support/recording-context.ts`: which instructions, under which
 * fill, in which order. Rasterised pixels are the browser suite's half.
 */

import { describe, expect, it } from 'vitest';

import { pipValue, RANKS, SUITS, type Rank, type Suit } from '../../src/core/cards';
import {
  CARD_ASPECT,
  CARD_GEOMETRY,
  cardHeight,
  drawCardShapes,
  drawCardText,
  PIP_LAYOUTS,
  pipInverted,
  suitColour,
  type CardSpec,
  type PipPosition,
  type PipRank,
} from '../../src/render/card';
import { SURFACE } from '../../src/render/tokens';
import { createRecordingContext } from './support/recording-context';

const COURT: readonly Rank[] = ['J', 'Q', 'K'];
const PIP_RANKS = RANKS.filter((rank): rank is PipRank => !COURT.includes(rank));

function spec(overrides: Partial<CardSpec> = {}): CardSpec {
  return {
    rank: '9',
    suit: 'hearts',
    faceUp: true,
    x: 100,
    y: 50,
    width: 50,
    ...overrides,
  };
}

describe('E3: the centre pip layout table', () => {
  it('covers exactly the pip ranks; court cards carry a frame instead', () => {
    expect(Object.keys(PIP_LAYOUTS).sort()).toEqual([...PIP_RANKS].sort());
    expect(PIP_RANKS).toHaveLength(10);
  });

  it('holds one pip per point of pip value, per core/cards', () => {
    // The count comes from the game's value table, not from this table's own
    // length, so a layout that lost a pip disagrees with the rules.
    for (const rank of PIP_RANKS) {
      expect(PIP_LAYOUTS[rank], rank).toHaveLength(pipValue(rank));
    }
  });

  it('places every pip inside the unit field, no two in the same place', () => {
    for (const rank of PIP_RANKS) {
      const layout = PIP_LAYOUTS[rank];
      const seen = new Set<string>();
      for (const position of layout) {
        expect(position.x).toBeGreaterThanOrEqual(0);
        expect(position.x).toBeLessThanOrEqual(1);
        expect(position.y).toBeGreaterThanOrEqual(0);
        expect(position.y).toBeLessThanOrEqual(1);
        seen.add(`${String(position.x)},${String(position.y)}`);
      }
      expect(seen.size, rank).toBe(layout.length);
    }
  });

  it('maps every layout onto itself under a half turn, except the 7', () => {
    // The classic property of printed cards, and the negative control that
    // stops this block passing over an empty or degenerate table: the 7 is
    // REQUIRED to fail the symmetry its neighbours must hold, because its odd
    // pip sits in the upper half only.
    const key = (position: PipPosition): string =>
      `${position.x.toFixed(6)},${position.y.toFixed(6)}`;

    for (const rank of PIP_RANKS) {
      const layout = PIP_LAYOUTS[rank];
      const original = new Set(layout.map(key));
      const rotated = new Set(layout.map((position) => key({ x: 1 - position.x, y: 1 - position.y })));
      if (rank === '7') {
        expect(rotated, rank).not.toEqual(original);
      } else {
        expect(rotated, rank).toEqual(original);
      }
    }
  });

  it('inverts exactly the lower-half pips, counted by hand per rank', () => {
    // Hand-derived from the classic layouts, written out rather than computed
    // from the table under test.
    const invertedByRank: Record<PipRank, number> = {
      A: 0,
      '2': 1,
      '3': 1,
      '4': 2,
      '5': 2,
      '6': 2,
      '7': 2,
      '8': 3,
      '9': 4,
      '10': 5,
    };
    for (const rank of PIP_RANKS) {
      const inverted = PIP_LAYOUTS[rank].filter((position) => pipInverted(position));
      expect(inverted, rank).toHaveLength(invertedByRank[rank]);
      for (const position of inverted) {
        expect(position.y).toBeGreaterThan(0.5);
      }
    }
  });

  it('keeps a playing card taller than wide, on the poker ratio', () => {
    expect(CARD_ASPECT).toBeCloseTo(1.4, 10);
    expect(cardHeight(50)).toBeCloseTo(70, 10);
  });
});

describe('E3: rank and suit indices in both opposing corners', () => {
  it('prints the rank twice, the far corner under a half-turn rotation', () => {
    const recording = createRecordingContext();
    drawCardText(recording.ctx, spec());

    const texts = recording.calls('fillText');
    expect(texts).toHaveLength(2);
    for (const text of texts) {
      expect(text.args[0]).toBe('9');
      expect(text.args[1]).toBeCloseTo(100 + CARD_GEOMETRY.indexX * 50, 10);
      expect(text.args[2]).toBeCloseTo(50 + CARD_GEOMETRY.indexRankDrop * 50, 10);
    }

    // The far corner is the near one rotated about the card centre: a rotate
    // by pi is recorded between the two glyphs, so the coordinates repeat and
    // the print flips, exactly as on a physical card.
    const first = recording.indexOfCall('fillText', 0);
    const second = recording.indexOfCall('fillText', 1);
    const rotationsBetween = recording.entries
      .slice(first, second)
      .filter((entry) => entry.kind === 'call' && entry.op === 'rotate')
      .map((entry) => (entry.kind === 'call' ? entry.args[0] : undefined));
    expect(rotationsBetween).toContain(Math.PI);
  });

  it('draws the small suit pip at both corners in the shape pass', () => {
    const recording = createRecordingContext();
    drawCardShapes(recording.ctx, spec({ rank: 'A', suit: 'clubs' }));

    const cornerX = 100 + CARD_GEOMETRY.indexX * 50;
    const cornerY = 50 + CARD_GEOMETRY.indexPipDrop * 50;
    const cornerTranslates = recording
      .calls('translate')
      .filter((call) => call.args[0] === cornerX && call.args[1] === cornerY);
    // Once per corner: the second sits under the half-turn transform, so its
    // local coordinates are the same ones.
    expect(cornerTranslates).toHaveLength(2);
  });

  it('sizes the two-glyph 10 narrower than a one-glyph rank', () => {
    const nine = createRecordingContext();
    drawCardText(nine.ctx, spec({ rank: '9' }));
    const ten = createRecordingContext();
    drawCardText(ten.ctx, spec({ rank: '10' }));

    expect(ten.calls('fillText').map((call) => call.args[0])).toEqual(['10', '10']);

    const sizeOf = (value: unknown): number => Number.parseFloat(String(value).replace('bold ', ''));
    const nineFont = sizeOf(nine.valueBefore(nine.indexOfCall('fillText'), 'font'));
    const tenFont = sizeOf(ten.valueBefore(ten.indexOfCall('fillText'), 'font'));
    expect(Number.isFinite(nineFont)).toBe(true);
    expect(tenFont).toBeLessThan(nineFont);
  });
});

describe('E3: the face draws its layout and its inks', () => {
  it('sends hearts and diamonds to the red ink, clubs and spades to the black', () => {
    const expected: Record<Suit, string> = {
      hearts: SURFACE.rankRed,
      diamonds: SURFACE.rankRed,
      clubs: SURFACE.rankBlack,
      spades: SURFACE.rankBlack,
    };
    for (const suit of SUITS) {
      expect(suitColour(suit), suit).toBe(expected[suit]);
    }
  });

  it('draws every pip of the layout at its mapped field position', () => {
    for (const rank of ['7', '10'] as const) {
      const recording = createRecordingContext();
      const card = spec({ rank, suit: 'spades' });
      drawCardShapes(recording.ctx, card);

      const height = cardHeight(card.width);
      const fieldX = card.x + CARD_GEOMETRY.fieldX * card.width;
      const fieldY = card.y + CARD_GEOMETRY.fieldY * height;
      const fieldW = CARD_GEOMETRY.fieldWidth * card.width;
      const fieldH = CARD_GEOMETRY.fieldHeightY * height;

      const translates = recording.calls('translate').map((call) => call.args);
      for (const position of PIP_LAYOUTS[rank]) {
        expect(translates, `${rank} pip at ${String(position.x)},${String(position.y)}`).toContainEqual([
          fieldX + position.x * fieldW,
          fieldY + position.y * fieldH,
        ]);
      }
    }
  });

  it('paints the face under the suit ink it belongs to', () => {
    const recording = createRecordingContext();
    drawCardShapes(recording.ctx, spec({ rank: '5', suit: 'diamonds' }));
    const fillStyles = recording.sets('fillStyle').map((set) => set.value);
    expect(fillStyles).toContain(SURFACE.rankRed);
    expect(fillStyles).not.toContain(SURFACE.rankBlack);
  });

  it('lays the light margin down first, under everything on the card', () => {
    // The margin is the load-bearing boundary of SPEC 16: the first thing any
    // card paints, face up or down, is the light base the felt is separated by.
    for (const faceUp of [true, false]) {
      const recording = createRecordingContext();
      drawCardShapes(recording.ctx, spec({ faceUp }));
      const firstFill = recording.indexOfCall('fill');
      expect(firstFill).toBeGreaterThan(-1);
      expect(recording.valueBefore(firstFill, 'fillStyle')).toBe(SURFACE.cardMargin);
    }
  });

  it('frames a court card instead of pipping it, with its centre letter', () => {
    const recording = createRecordingContext();
    drawCardShapes(recording.ctx, spec({ rank: 'K', suit: 'spades' }));
    expect(recording.calls('strokeRect')).toHaveLength(1);

    const text = createRecordingContext();
    drawCardText(text.ctx, spec({ rank: 'K', suit: 'spades' }));
    const glyphs = text.calls('fillText');
    expect(glyphs).toHaveLength(3);
    const centre = glyphs[2];
    expect(centre?.args[0]).toBe('K');
    expect(centre?.args[1]).toBeCloseTo(100 + 25, 10);
    expect(centre?.args[2]).toBeCloseTo(50 + 35, 10);
  });
});

describe('E3: a face-down card conceals everything it knows', () => {
  it('draws the back and the margin, and nothing derived from rank or suit', () => {
    // SPEC 4.3 keeps the hole card concealed; the renderer's half of that is
    // that a face-down spec draws no rank, no suit shape and no suit ink. The
    // face-up run beside it is the control that proves the recorder would
    // have seen them.
    const down = createRecordingContext();
    const card = spec({ rank: 'A', suit: 'hearts', faceUp: false });
    drawCardShapes(down.ctx, card);
    drawCardText(down.ctx, card);

    expect(down.calls('fillText')).toHaveLength(0);
    expect(down.calls('translate')).toHaveLength(0);
    const inks = down.sets('fillStyle').map((set) => set.value);
    expect(inks).not.toContain(SURFACE.rankRed);
    expect(inks).not.toContain(SURFACE.rankBlack);
    expect(inks).toContain(SURFACE.cardMargin);
    expect(inks).toContain(SURFACE.cardBack);

    // The back's pinstripe frame keeps the margin ink as its one ornament.
    const frame = down.indexOfCall('strokeRect');
    expect(frame).toBeGreaterThan(-1);
    expect(down.valueBefore(frame, 'strokeStyle')).toBe(SURFACE.cardMargin);

    const up = createRecordingContext();
    drawCardShapes(up.ctx, { ...card, faceUp: true });
    drawCardText(up.ctx, { ...card, faceUp: true });
    expect(up.calls('fillText').length).toBeGreaterThan(0);
    expect(up.calls('translate').length).toBeGreaterThan(0);
  });
});
