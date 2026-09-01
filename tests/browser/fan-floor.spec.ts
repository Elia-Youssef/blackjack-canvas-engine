/**
 * The card-legibility fan floor, measured on the shipped page. Item `E8`'s
 * appended clause, built at `BJ-22`.
 *
 *   "At every breakpoint, no card renders narrower than 60 CSS px and no fan
 *    pitch narrower than the corner-index column of the card beneath it; under
 *    pressure the fan compresses to its pitch floor before any card shrinks,
 *    cards then shrink to the width floor, and past both floors the hand band
 *    overflows into the pannable stage rather than breaking either."
 *
 * `tests/unit/fan-floor.test.ts` sweeps the arithmetic, every band width against
 * every card count. What is here is the half a unit test cannot reach: the
 * **composited** page at real viewports.
 *
 * **The measurement is a screenshot and not `getImageData`, and that distinction
 * is the whole reason this file exists in the form it does.** `BJ-22`'s first
 * capture found that the shipped page painted the baked felt over the animated
 * scene: `position: absolute` on the felt put it after every in-flow sibling in
 * paint order, so every card, chip and win pulse went into a canvas nobody could
 * see. The canvas itself read back 15,912 opaque pixels the whole time, so a
 * spec that asked the canvas what it drew would have agreed the cards were
 * there. Only the composite disagrees, so the composite is what this measures.
 */

import { expect, test, type Page } from '@playwright/test';

import { cardHeight } from '../../src/render/card';
import {
  CARD_WIDTH_FLOOR,
  FAN_PITCH_FLOOR,
  SCENE_GEOMETRY,
} from '../../src/render/scene';
import { SURFACE } from '../../src/render/tokens';

import { differingSplit, FLOW_WAGER } from './support/flow-seeds';
import {
  bootGame,
  control,
  motionProbe,
  PHASE_TIMEOUT,
  resizeTo,
  settle,
  surfaceMetrics,
  layoutProbe,
  waitForPhase,
} from './support/game';
import { decodePng } from './support/png';

/**
 * One viewport per breakpoint, plus the smallest this game supports.
 *
 * The middle of each range rather than its edge, on `no-hscroll.spec.ts`'s
 * reasoning: the width that breaks is never the one the boundary is written on.
 * The last two are the ones the floor exists for. Before this part they drew
 * cards 15.7 and 11.2 CSS pixels wide.
 */
const VIEWPORTS: readonly (readonly [string, number, number])[] = [
  ['wide', 1440, 900],
  ['medium', 900, 700],
  ['compact', 667, 375],
  ['portrait', 390, 844],
  ['smallest', 320, 420],
];

/** The card margin and face, which SPEC 16 gives the same hex, as a pixel. */
const CARD_RGB = [
  Number.parseInt(SURFACE.cardMargin.slice(1, 3), 16),
  Number.parseInt(SURFACE.cardMargin.slice(3, 5), 16),
  Number.parseInt(SURFACE.cardMargin.slice(5, 7), 16),
] as const;

/** How far a measured card edge may sit from where the scene put it, in CSS px. */
const EDGE_TOLERANCE = 4;

/** The bounding box of every card pixel in a composited surface, in CSS px. */
interface CardBox {
  readonly found: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Screenshot the surface stack and find every pixel of the card margin in it.
 *
 * Exact equality on the three channels, which is what makes this a card and not
 * a chip: the chip ring is `#F0EDE4` and the felt print `#F3F7F4`, both within a
 * few units of the margin's `#F6F3EC` and neither equal to it. The interior of a
 * flat fill is exact; only the antialiased outline is not, which is why the
 * tolerances below are a pixel or two and not a fraction.
 */
async function cardBox(page: Page): Promise<CardBox> {
  const stack = page.locator('.bj-surface-stack');
  const bounds = await stack.boundingBox();
  expect(bounds, 'the surface stack has no box').not.toBeNull();
  const bitmap = decodePng(await stack.screenshot());
  const scale = bitmap.width / (bounds?.width ?? 1);

  let found = 0;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const at = (y * bitmap.width + x) * 4;
      if (
        bitmap.data[at] === CARD_RGB[0] &&
        bitmap.data[at + 1] === CARD_RGB[1] &&
        bitmap.data[at + 2] === CARD_RGB[2]
      ) {
        found += 1;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return {
    found,
    left: left / scale,
    right: (right + 1) / scale,
    top: top / scale,
    bottom: (bottom + 1) / scale,
  };
}

/**
 * Wait until the play surface has finished moving, then let a frame draw.
 *
 * **A phase is not a picture, and this file measures pictures.** SPEC 10's
 * `playerTurn` arrives when the machine hands the decision over; the cards it
 * dealt are still travelling, because `BJ-14`'s tweens live on the render side
 * and are driven by the frame loop rather than by the phase. `settle`'s three
 * frames are about 50 ms and a deal's arc is hundreds, so on a loaded machine
 * the screenshot below can catch the dealer's hole card mid-arc, entering from
 * the top edge of the surface. Its margin is the same `#F6F3EC` the scan
 * matches, so the measured band starts at y = 0 instead of at the dealer's row
 * and the assertion fails by exactly the distance the row sits from the top:
 * 53.32 at wide, 34.48 at medium, 31.88 at portrait. Deterministic magnitudes,
 * intermittently reached, which is the signature of a race rather than of
 * noise.
 *
 * That was found at `BJ-23` by saving the failing screenshot: the picture shows
 * a face-down card half off the top edge while the player's row is already in
 * place. The cure is to ask the renderer rather than to wait longer.
 * `tweensInFlight` is `BJ-14`'s own probe, the same number
 * `reduced-motion.spec.ts` reads, and it is zero exactly when nothing is
 * moving. Nothing about the product changed: the fan floor was never violated
 * in any of these runs, and `src/` is untouched.
 *
 * No ledger entry, deliberately: an entry earns its place where a gate could be
 * removed with nothing failing, and removing this wait reddens this spec rather
 * than silencing it, so the entry would guard a door that already has an alarm.
 */
async function stillScene(page: Page): Promise<void> {
  await expect
    .poll(async () => (await motionProbe(page)).tweensInFlight, { timeout: PHASE_TIMEOUT })
    .toBe(0);
  await settle(page);
}

/** Boot a seeded round and stop at the player's decision, with the scene still. */
async function atPlayerTurn(page: Page, seed: number): Promise<void> {
  await bootGame(page, { seed });
  await waitForPhase(page, 'start');
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
  await page.locator(`[data-chip="${String(FLOW_WAGER)}"]`).click();
  await control(page, 'deal').click();
  await waitForPhase(page, 'playerTurn');
  await stillScene(page);
}

test.describe('E8: the fan floor holds at every breakpoint', () => {
  for (const [label, width, height] of VIEWPORTS) {
    test(`keeps a card legible at ${label} (${String(width)} x ${String(height)})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await atPlayerTurn(page, differingSplit().seed);
      await resizeTo(page, width, height);
      // Again after the resize, because a re-plan re-places every card and the
      // three assertions below read the probe, the canvas box and the composite
      // as one state.
      await stillScene(page);

      const probe = await layoutProbe(page);
      const metrics = await surfaceMetrics(page);
      const { fan } = probe;

      // The criterion, on the shipped page, at this breakpoint.
      expect(fan.cardWidth, `${label}: a card is narrower than the floor`).toBeGreaterThanOrEqual(
        CARD_WIDTH_FLOOR,
      );
      expect(fan.pitchRatio, `${label}: the fan is tighter than the index column`).
        toBeGreaterThanOrEqual(FAN_PITCH_FLOOR - 1e-9);
      expect(fan.pitch).toBeCloseTo(fan.cardWidth * fan.pitchRatio, 6);

      // And the pixels agree, which is the second witness. The union of the
      // dealer's row and the player's row runs from the dealer's top edge to
      // whichever comes first, the bottom of the player's row or the bottom of
      // the surface: past that the band overflows, which is the criterion's own
      // resolution rather than a defect.
      const box = await cardBox(page);
      expect(box.found, `${label}: no card is composited onto the page at all`).toBeGreaterThan(100);

      const cardH = cardHeight(fan.cardWidth);
      const dealerTop = metrics.cssHeight * SCENE_GEOMETRY.dealerY;
      const handTop = Math.max(metrics.cssHeight * SCENE_GEOMETRY.handY, dealerTop + cardH);

      // **The vertical half of the floor, as a property rather than a formula.**
      // A floored card is 1.4 times 60 px tall whatever the surface is, so on a
      // short one the dealer's row grows down into the player's: measured at a
      // 341 x 192 surface, the two rows overlapped by 3 px before the clamp
      // landed. The clamp is what pushes the player's row clear, and the band
      // then runs off the bottom instead, which is the criterion's own
      // resolution. Asserted twice: the rule recomputed here against the one the
      // scene resolved, and the property that rule exists for.
      expect(fan.dealerTop).toBeCloseTo(dealerTop, 6);
      expect(fan.handTop, `${label}: the player's row is not where the rule puts it`)
        .toBeCloseTo(handTop, 6);
      expect(
        fan.handTop,
        `${label}: the player's row starts before the dealer's row ends`,
      ).toBeGreaterThanOrEqual(fan.dealerTop + cardHeight(fan.cardWidth) - 1e-9);
      // A few pixels of tolerance, and the reason is the card's own corner
      // radius: the topmost and bottommost scanlines of a rounded rectangle are
      // a handful of antialiased pixels, and an exact-colour match starts a row
      // or two inside them. Four pixels at each end still pins a 94 px card
      // apart from a 60 px one by a factor of ten.
      expect(
        Math.abs(box.top - dealerTop),
        `${label}: the dealer's row is not where the scene put it`,
      ).toBeLessThanOrEqual(EDGE_TOLERANCE);
      expect(
        Math.abs(box.bottom - Math.min(metrics.cssHeight, handTop + cardH)),
        `${label}: the player's row is not where the scene put it`,
      ).toBeLessThanOrEqual(EDGE_TOLERANCE);

      // The measured band is never wider than the surface and never narrower
      // than one floored card: the first is the clipping bound and the second is
      // the criterion read straight off the composite.
      expect(box.right - box.left).toBeGreaterThanOrEqual(CARD_WIDTH_FLOOR - 2);
      expect(box.right - box.left).toBeLessThanOrEqual(metrics.cssWidth + 2);
    });
  }

  test('measures a card and not a chip, a rule line or the felt', async ({ page }) => {
    // The control the sweep above needs: the scan is shown to find nothing on a
    // table with no cards on it. A matcher that answered on the felt, the printed
    // rules or a chip would report a box at every breakpoint and prove nothing.
    await page.setViewportSize({ width: 1440, height: 900 });
    await bootGame(page, { seed: differingSplit().seed });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator(`[data-chip="${String(FLOW_WAGER)}"]`).click();
    await settle(page);

    // Betting: a felt, its four printed lines and a chip stack, and no card.
    const empty = await cardBox(page);
    expect(empty.found, 'the scan sees a card where there is none').toBe(0);

    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await settle(page);
    const dealt = await cardBox(page);
    expect(dealt.found, 'the scan sees no card where there are four').toBeGreaterThan(100);
  });
});

test.describe('E8: pressure moves the fan in the order the criterion states', () => {
  test('splits the felt between two hands and keeps both floors', async ({ page }) => {
    // A split halves every hand's room, which is the pressure a real round can
    // actually produce. The floors are asserted at the widest and the narrowest
    // viewport, so the same round is measured with and without the width floor
    // engaged: at 1440 the natural card is 94 px and nothing is floored, at 320
    // the natural card would be 11 px and the floor is the only thing holding it.
    for (const [label, width, height] of [
      ['wide', 1440, 900],
      ['smallest', 320, 420],
    ] as const) {
      await page.setViewportSize({ width, height });
      await atPlayerTurn(page, differingSplit().seed);
      await page.locator('[data-action="split"]').click();
      await waitForPhase(page, 'playerTurn');
      await settle(page);
      await resizeTo(page, width, height);

      const { fan } = await layoutProbe(page);
      expect(fan.regimes.length, `${label}: the dealer's band and both hands`).toBe(3);
      expect(fan.cardWidth, `${label}: split cards below the floor`).toBeGreaterThanOrEqual(
        CARD_WIDTH_FLOOR,
      );
      expect(fan.pitchRatio, `${label}: split fan tighter than the index column`).
        toBeGreaterThanOrEqual(FAN_PITCH_FLOOR - 1e-9);
      // Every regime is one of the four, and a floored frame never claims to be
      // unpressured: at the smallest viewport the width floor is doing the work.
      for (const regime of fan.regimes) {
        expect(['natural', 'pitch-compressed', 'width-shrunk', 'overflow']).toContain(regime);
      }
      if (width === 320) {
        expect(fan.naturalCardWidth).toBe(CARD_WIDTH_FLOOR);
        expect(fan.cardWidth).toBe(CARD_WIDTH_FLOOR);
      } else {
        expect(fan.naturalCardWidth).toBeGreaterThan(CARD_WIDTH_FLOOR);
      }

      const box = await cardBox(page);
      expect(box.found, `${label}: a split hand composited nothing`).toBeGreaterThan(100);
    }
  });
});
