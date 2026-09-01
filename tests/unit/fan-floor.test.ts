/**
 * The card-legibility fan floor. Item `E8`'s appended clause, built at `BJ-22`.
 *
 *   "At every breakpoint, no card renders narrower than 60 CSS px and no fan
 *    pitch narrower than the corner-index column of the card beneath it; under
 *    pressure the fan compresses to its pitch floor before any card shrinks,
 *    cards then shrink to the width floor, and past both floors the hand band
 *    overflows into the pannable stage rather than breaking either. At 60 px
 *    the ten's corner index, the smallest glyph on any card, renders at 8.0 px
 *    bold."
 *
 * The clause is about an **order**, so this file asserts the order and not only
 * the endpoints. `tests/browser/fan-floor.spec.ts` measures the same thing in
 * rendered pixels on the shipped page at descending viewports; what is here is
 * the arithmetic, exhaustively, which a browser cannot sweep.
 *
 * The two numbers come from `tests/reference/design-contract.md` the way every
 * colour and duration does, and neither is repeated here: the contract is read
 * and compared, so a floor changed in the code without the contract moving is a
 * red suite rather than a silently different game.
 *
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolveMotion } from '../../src/render/animate';
import { CARD_GEOMETRY } from '../../src/render/card';
import {
  CARD_WIDTH_FLOOR,
  FAN_PITCH_FLOOR,
  SCENE_GEOMETRY,
  createPlaySurface,
  fanCardWidth,
  fanFor,
  handLayout,
  laidWidth,
  naturalCardWidth,
  type Fan,
  type FanBand,
} from '../../src/render/scene';
import { STANDARD_PALETTE } from '../../src/render/tokens';

import { createStyleFreeCanvas } from './support/recording-context';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTRACT = readFileSync(join(PROJECT_ROOT, 'tests', 'reference', 'design-contract.md'), 'utf8');

/** `| \`name\` | value |` from the contract, as a number. */
function contractValue(name: string): number {
  const row = new RegExp(`\\|\\s*\`${name}\`\\s*\\|\\s*([\\d.]+)\\s*\\|`).exec(CONTRACT);
  expect(row?.[1], `${name} is not in the design contract`).toBeDefined();
  return Number(row?.[1]);
}

/** A fan at the natural pitch, for a band with all the room in the world. */
function unpressured(count: number, cardWidth: number): Fan {
  return fanFor(count, Number.POSITIVE_INFINITY, cardWidth, cardWidth);
}

describe('E8: the floors are the contract, not a number chosen in the code', () => {
  it('takes the card width floor from the design contract', () => {
    expect(CARD_WIDTH_FLOOR).toBe(contractValue('card-width-floor'));
  });

  it('derives the pitch floor from the corner index rather than restating it', () => {
    // The criterion names the floor rather than numbering it: "no fan pitch
    // narrower than the corner-index column of the card beneath it". `indexX` is
    // the column's centre, so the column is twice it. The contract carries the
    // resulting fraction and this asserts the derivation reaches it, so moving
    // the index moves the floor and moving only one of them is red.
    expect(FAN_PITCH_FLOOR).toBeCloseTo(2 * CARD_GEOMETRY.indexX, 12);
    expect(FAN_PITCH_FLOOR).toBeCloseTo(contractValue('fan-pitch-floor'), 12);
    expect(SCENE_GEOMETRY.cardStep).toBeCloseTo(contractValue('fan-pitch-natural'), 12);
    // And the floor is genuinely tighter than the natural pitch, or there is no
    // compression to order.
    expect(FAN_PITCH_FLOOR).toBeLessThan(SCENE_GEOMETRY.cardStep);
  });

  it('renders the ten index at the size the criterion states, at the floor', () => {
    // The criterion's last sentence, computed: `indexFont` times the ten's
    // narrower face times the width floor. The ten is the smallest glyph on any
    // card because it is the only two-character rank and the only one that takes
    // `indexTenScale`, which this asserts rather than assumes.
    const ten = CARD_GEOMETRY.indexFont * CARD_GEOMETRY.indexTenScale * CARD_WIDTH_FLOOR;
    expect(Math.round(ten * 10) / 10).toBe(contractValue('ten-index-px-at-floor'));
    expect(CARD_GEOMETRY.indexTenScale).toBeLessThan(1);
  });
});

describe('E8: no card is ever drawn narrower than the floor', () => {
  it('floors the natural width on a surface too small to earn it', () => {
    // The measured surfaces this game actually produces. 1207 is a 1440 x 900
    // desktop, 766 a 900 x 700 window, 341 a 667 x 375 phone in landscape, 308 a
    // 390 x 844 phone, and 144 the smallest surface any supported viewport
    // yields. Every one of the last three drew a card under 27 px before this
    // part; the ten's index on the 144 surface was 1.5 px.
    expect(naturalCardWidth(1207)).toBeCloseTo(1207 * SCENE_GEOMETRY.cardX, 9);
    expect(naturalCardWidth(766)).toBeCloseTo(CARD_WIDTH_FLOOR, 9);
    for (const surfaceWidth of [341, 308, 144]) {
      expect(naturalCardWidth(surfaceWidth), `surface ${String(surfaceWidth)}`).toBe(
        CARD_WIDTH_FLOOR,
      );
    }
  });

  it('never resolves a width below the floor, however hard the band is squeezed', () => {
    for (let surfaceWidth = 64; surfaceWidth <= 2048; surfaceWidth += 7) {
      const natural = naturalCardWidth(surfaceWidth);
      for (let hands = 1; hands <= 4; hands += 1) {
        for (let count = 1; count <= 21; count += 1) {
          const bands: FanBand[] = [
            { count: 2, room: surfaceWidth },
            ...Array.from({ length: hands }, () => ({ count, room: surfaceWidth / hands })),
          ];
          const width = fanCardWidth(bands, natural);
          expect(width, `${String(surfaceWidth)}px / ${String(hands)} hands`).toBeGreaterThanOrEqual(
            CARD_WIDTH_FLOOR,
          );
          expect(width).toBeLessThanOrEqual(natural);
          const fan = fanFor(count, surfaceWidth / hands, width, natural);
          expect(fan.pitchRatio).toBeGreaterThanOrEqual(FAN_PITCH_FLOOR);
          expect(fan.pitchRatio).toBeLessThanOrEqual(SCENE_GEOMETRY.cardStep);
        }
      }
    }
  });
});

describe('E8: the four states, in the order the criterion states them', () => {
  // One wide surface, four split hands, and a hand that keeps drawing. Every
  // number below is the surface a 1440 x 900 desktop actually produces.
  const surfaceWidth = 1207;
  const natural = naturalCardWidth(surfaceWidth);
  const hands = 4;
  const room = surfaceWidth / hands;

  /** The frame's resolved fan for one hand of `count` cards. */
  function frame(count: number): Fan {
    const bands: FanBand[] = [
      { count: 2, room: surfaceWidth },
      ...Array.from({ length: hands }, () => ({ count, room })),
    ];
    return fanFor(count, room, fanCardWidth(bands, natural), natural);
  }

  it('leaves an unpressured band at the natural pitch and the natural width', () => {
    const fan = frame(3);
    expect(fan.regime).toBe('natural');
    expect(fan.cardWidth).toBeCloseTo(natural, 9);
    expect(fan.pitchRatio).toBeCloseTo(SCENE_GEOMETRY.cardStep, 9);
    expect(fan.overflow).toBe(0);
  });

  it('compresses the pitch first, and does not touch the width while it can', () => {
    const fan = frame(7);
    expect(fan.regime).toBe('pitch-compressed');
    // The whole of the clause's "before any card shrinks": the width is still
    // the natural one.
    expect(fan.cardWidth).toBeCloseTo(natural, 9);
    expect(fan.pitchRatio).toBeLessThan(SCENE_GEOMETRY.cardStep);
    expect(fan.pitchRatio).toBeGreaterThan(FAN_PITCH_FLOOR);
    // And the band fits exactly, which is what "compresses to fit" means.
    expect(fan.laid).toBeCloseTo(room, 6);
    expect(fan.overflow).toBe(0);
  });

  it('shrinks the width only once the pitch is pinned at its floor', () => {
    const fan = frame(11);
    expect(fan.regime).toBe('width-shrunk');
    expect(fan.pitchRatio).toBeCloseTo(FAN_PITCH_FLOOR, 9);
    expect(fan.cardWidth).toBeLessThan(natural);
    expect(fan.cardWidth).toBeGreaterThan(CARD_WIDTH_FLOOR);
    expect(fan.laid).toBeCloseTo(room, 6);
    expect(fan.overflow).toBe(0);
  });

  it('overflows past both floors, with both floors intact', () => {
    const fan = frame(21);
    expect(fan.regime).toBe('overflow');
    // "past both floors the hand band overflows into the pannable stage rather
    // than breaking either": both are exactly at their floor and the excess is
    // reported rather than absorbed.
    expect(fan.cardWidth).toBe(CARD_WIDTH_FLOOR);
    expect(fan.pitchRatio).toBeCloseTo(FAN_PITCH_FLOOR, 9);
    expect(fan.overflow).toBeGreaterThan(0);
    expect(fan.laid).toBeCloseTo(room + fan.overflow, 6);
  });

  it('walks the four states in order as one hand grows, and never back', () => {
    // The order is the clause. A resolution that shrank the card first would
    // pass every endpoint assertion above and fail this one.
    const order = ['natural', 'pitch-compressed', 'width-shrunk', 'overflow'];
    let seen = 0;
    let lastWidth = Number.POSITIVE_INFINITY;
    let lastRatio = Number.POSITIVE_INFINITY;
    for (let count = 1; count <= 24; count += 1) {
      const fan = frame(count);
      const rank = order.indexOf(fan.regime);
      expect(rank, `${String(count)} cards resolved to ${fan.regime}`).toBeGreaterThanOrEqual(seen);
      seen = rank;
      // Neither lever ever moves back up as the pressure rises.
      expect(fan.cardWidth).toBeLessThanOrEqual(lastWidth + 1e-9);
      expect(fan.pitchRatio).toBeLessThanOrEqual(lastRatio + 1e-9);
      lastWidth = fan.cardWidth;
      lastRatio = fan.pitchRatio;
      // And the width never moves at all while the pitch still has room to give.
      if (fan.pitchRatio > FAN_PITCH_FLOOR + 1e-9) {
        expect(fan.cardWidth, `${String(count)} cards shrank before the pitch bottomed`).toBeCloseTo(
          natural,
          9,
        );
      }
    }
    expect(seen, 'the sweep never reached the overflow state').toBe(order.length - 1);
  });
});

describe('E8: one width for the whole frame, and the tightest band decides it', () => {
  it('gives every hand the same card, however uneven the hands are', () => {
    // A table does not deal one seat a bigger card than the seat beside it, and
    // a hand whose cards changed size as it drew would fight SPEC 5's re-centre.
    const surfaceWidth = 1207;
    const natural = naturalCardWidth(surfaceWidth);
    const room = surfaceWidth / 4;
    const bands: FanBand[] = [
      { count: 2, room: surfaceWidth },
      { count: 2, room },
      { count: 12, room },
      { count: 3, room },
      { count: 2, room },
    ];
    const width = fanCardWidth(bands, natural);
    expect(width).toBeLessThan(natural);
    for (const band of bands) {
      expect(fanFor(band.count, band.room, width, natural).cardWidth).toBe(width);
    }
    // The tightest band is the twelve-card one, and it is the one that fits
    // exactly at the pitch floor.
    expect(fanFor(12, room, width, natural).laid).toBeCloseTo(room, 6);
  });

  it('ignores a band with no cards in it', () => {
    const natural = naturalCardWidth(1207);
    expect(fanCardWidth([{ count: 0, room: 1 }], natural)).toBe(natural);
    expect(fanFor(0, 10, natural, natural).laid).toBe(0);
  });
});

describe('E8: the pitch is what the layout actually spaces the cards by', () => {
  const cards = [
    { rank: 'A', suit: 'spades' },
    { rank: '10', suit: 'hearts' },
    { rank: 'K', suit: 'clubs' },
  ] as const;

  it('spaces neighbouring cards by the fan pitch and centres the band', () => {
    for (const fan of [unpressured(3, 96), fanFor(3, 150, 60, 90)]) {
      const laid = handLayout(cards, 400, 100, fan, 3);
      expect(laid).toHaveLength(3);
      for (let index = 1; index < laid.length; index += 1) {
        expect((laid[index]?.x ?? 0) - (laid[index - 1]?.x ?? 0)).toBeCloseTo(fan.pitch, 9);
      }
      const left = laid[0]?.x ?? 0;
      const right = (laid[laid.length - 1]?.x ?? 0) + fan.cardWidth;
      expect((left + right) / 2).toBeCloseTo(400, 6);
      expect(right - left).toBeCloseTo(fan.laid, 6);
      for (const spec of laid) {
        expect(spec.width).toBe(fan.cardWidth);
      }
    }
  });

  it('agrees with the laid width the fan reports', () => {
    const fan = fanFor(5, 200, 60, 90);
    expect(laidWidth(5, fan.cardWidth, fan.pitch)).toBeCloseTo(fan.laid, 9);
    expect(laidWidth(0, fan.cardWidth, fan.pitch)).toBe(0);
    expect(laidWidth(1, fan.cardWidth, fan.pitch)).toBe(fan.cardWidth);
  });
});

// ---------------------------------------------------------------------------
// E8: the reading the browser probe measures against
// ---------------------------------------------------------------------------

/**
 * `PlaySurface.fan()` was the one readout in the project that aliased live
 * internal state.
 *
 * Every other readout in `core/`, `storage/` and `render/` is a frozen snapshot
 * and says so; `fan()` returned the same mutable object on every call, so a
 * caller's edit was visible to the next reader for the rest of the frame. That
 * matters here rather than somewhere else because this is the surface item
 * `E8`'s evidence travels on: `main.ts` puts it straight into `LayoutProbe` as
 * the one field it does not copy, and `tests/browser/fan-floor.spec.ts` reads it
 * to check the composited pixels against.
 *
 * The record is rebuilt whole on every frame, so it is frozen at the assignment
 * rather than copied at the getter, which costs one call a frame and no copy.
 */
describe('E8: the fan reading is a snapshot, not a window onto the scene', () => {
  const surfaceWith = (hands: number): ReturnType<typeof createPlaySurface> => {
    const surface = createPlaySurface({
      canvas: createStyleFreeCanvas().canvas,
      offscreen: () => createStyleFreeCanvas().canvas,
      sizing: { width: 800, height: 450, dpr: 1 },
    });
    surface.render(
      {
        felt: 'bronze',
        limits: { minimum: 10, maximum: 100 },
        dealer: [
          { rank: 'A', suit: 'spades' },
          { rank: '10', suit: 'hearts' },
        ],
        dealerConcealed: 0,
        hands: Array.from({ length: hands }, () => ({
          cards: [
            { rank: 'K', suit: 'clubs' },
            { rank: '9', suit: 'diamonds' },
          ] as const,
          wager: 50,
          won: null,
        })),
        pendingWager: 0,
        motion: resolveMotion({ reducedMotion: true, speed: 'normal' }),
        palette: STANDARD_PALETTE,
      },
      1 / 60,
    );
    return surface;
  };

  it('freezes the reading and its regime list, so a reader cannot corrupt it', () => {
    const surface = surfaceWith(2);
    const reading = surface.fan();
    expect(Object.isFrozen(reading)).toBe(true);
    expect(Object.isFrozen(reading.regimes)).toBe(true);
    expect(reading.regimes.length).toBe(3);
    expect(reading.cardWidth).toBeGreaterThan(0);

    // Both attacks, which the freeze turns into throws under this file's strict
    // mode. Before it, the first left `-999` standing until the next frame
    // rebuilt the record.
    expect(() => {
      (reading as { cardWidth: number }).cardWidth = -999;
    }).toThrow(TypeError);
    expect(() => {
      (reading.regimes as string[]).push('CORRUPT');
    }).toThrow(TypeError);

    expect(surface.fan().cardWidth).toBe(reading.cardWidth);
    expect(surface.fan().regimes.length).toBe(3);
  });
});
