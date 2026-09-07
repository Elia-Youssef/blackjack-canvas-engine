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
 *
 * **`AUDIT-2` re-pointed the horizontal half of it.** Findings `Z3-01`,
 * `J5-01`, `J1-06` and `J5-02` measured cards drawn off both edges of the canvas
 * on the shipped phone page, from one split, while this file was green: the
 * union bounding box of the card pixels was asserted to be no wider than the
 * canvas, which is the **clipping bound** rather than a detector of it, since a
 * canvas cannot report pixels it does not hold. What replaces it is a
 * re-derivation of where the scene put each band, required to be inside the
 * canvas AND to agree with the composite, plus three arms for the criterion's
 * fourth regime: a four-hand split at the round result, the same split at the
 * smallest viewport this game supports, where the picture outgrows the stage and
 * the stage really is panned to it, and the round result on the shipped page
 * with nothing injected and no seed.
 */

import { expect, test, type Page } from '@playwright/test';

import { cardHeight } from '../../src/render/card';
import {
  CARD_WIDTH_FLOOR,
  FAN_PITCH_FLOOR,
  SCENE_GEOMETRY,
  fanCardWidth,
  fanFor,
  handCentre,
  naturalCardWidth,
  type FanBand,
} from '../../src/render/scene';
import { SURFACE } from '../../src/render/tokens';
import { SURFACE_FRAMING } from '../../src/ui/breakpoints';

import { differingSplit, fourWaySplit, FLOW_WAGER } from './support/flow-seeds';
import {
  atShippedBetting,
  bootGame,
  chip,
  control,
  expectedSurfaceBox,
  layoutReport,
  motionProbe,
  PHASE_TIMEOUT,
  pressOn,
  readout,
  resizeTo,
  settle,
  shell,
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
async function cardBox(page: Page, selector = '.bj-surface-stack'): Promise<CardBox> {
  const stack = page.locator(selector);
  const bounds = await stack.boundingBox();
  expect(bounds, `${selector} has no box`).not.toBeNull();
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

/**
 * Where the scene puts each band of a frame, re-derived from the surface.
 *
 * **The re-derivation is the instrument, and it is a second implementation on
 * purpose.** `AUDIT-2`'s findings `Z3-01`, `J5-01` and `J1-06` all turned on
 * the same blind spot: the union bounding box of the card pixels can only ever
 * report what is **on** the bitmap, so a band drawn off both edges reports a box
 * exactly as wide as the canvas and every assertion about that box passes. What
 * says whether a card was lost is the pair (where the scene put the band, and
 * what reached the pixels), and the first half of that pair has to be computed
 * from something other than the picture.
 *
 * So this walks the same three exported functions the renderer walks, from the
 * measured CSS width of the canvas and the machine's own hand shapes, and the
 * assertions below require both halves: every band inside `[0, cssWidth]`, and
 * the composite's own box agreeing with the derived extremes. A scene that drew
 * somewhere else fails the second; a scene that drew off the canvas fails the
 * first.
 */
interface DerivedBand {
  readonly label: string;
  readonly left: number;
  readonly right: number;
  readonly overflow: number;
}

function derivedBands(
  cssWidth: number,
  handCounts: readonly number[],
  dealerCount: number,
): DerivedBand[] {
  const natural = naturalCardWidth(cssWidth);
  const share = cssWidth / Math.max(1, handCounts.length);
  const bands: FanBand[] = [
    { count: dealerCount, room: cssWidth },
    ...handCounts.map((count) => ({ count, room: share })),
  ];
  const cardWidth = fanCardWidth(bands, natural);
  return bands.map((band, index) => {
    const fan = fanFor(band.count, band.room, cardWidth, natural);
    const centre =
      index === 0 ? cssWidth / 2 : handCentre(index - 1, handCounts.length, cssWidth);
    // The same clamp the layout applies: a band that fits is centred on its
    // share and then held inside the canvas it is drawn on.
    const left = Math.min(Math.max(centre - fan.laid / 2, 0), Math.max(0, cssWidth - fan.laid));
    return {
      label: index === 0 ? 'dealer' : `hand ${String(index - 1)}`,
      left,
      right: left + fan.laid,
      overflow: fan.overflow,
    };
  });
}

/** The machine's own shape of the round, for the derivation above. */
async function handShapes(page: Page): Promise<{
  readonly handCounts: number[];
  readonly dealerCount: number;
}> {
  const snapshot = await readout(page);
  return {
    handCounts: snapshot.hands.map((hand) => hand.cards.length),
    dealerCount: snapshot.dealerVisible.length + snapshot.dealerConcealed,
  };
}

/**
 * The whole of the fourth regime, at one viewport, on one composited page.
 *
 * Every card the scene laid out is on the bitmap, the composite agrees with
 * where the scene said the cards are, and no hand paints over the next one.
 */
async function assertBandsOnTheBitmap(page: Page, label: string): Promise<void> {
  const metrics = await surfaceMetrics(page);
  const { handCounts, dealerCount } = await handShapes(page);
  const bands = derivedBands(metrics.cssWidth, handCounts, dealerCount).filter(
    (band) => band.right > band.left,
  );
  expect(bands.length, `${label}: no band to measure`).toBeGreaterThan(0);

  // No tolerance on these three: they are arithmetic over the measured canvas
  // rather than a reading of antialiased pixels, and a band a fraction of a
  // pixel outside the bitmap is a band the scene was willing to put there.
  // `EDGE_TOLERANCE` belongs to the composite comparison below, where a card's
  // rounded corner means an exact-colour match starts a pixel or two inside.
  for (const band of bands) {
    expect(band.left, `${label}: ${band.label} starts off the canvas`).toBeGreaterThanOrEqual(-1e-6);
    expect(band.right, `${label}: ${band.label} ends off the canvas`).toBeLessThanOrEqual(
      metrics.cssWidth + 1e-6,
    );
    expect(band.overflow, `${label}: ${band.label} overflows its room`).toBe(0);
  }

  // Hands are drawn in index order, so a band that reaches into its
  // neighbour's is a hand painted over by the one on its right.
  const hands = bands.slice(1);
  for (let index = 1; index < hands.length; index += 1) {
    expect(
      hands[index]?.left ?? 0,
      `${label}: hand ${String(index)} paints over the hand before it`,
    ).toBeGreaterThanOrEqual((hands[index - 1]?.right ?? 0) - 1e-6);
  }

  // And the pixels are where the derivation says they are. This is the half
  // that makes the derivation an instrument rather than an assertion about
  // itself: a clipped band reports a composite that stops at the canvas edge
  // while the derivation says it started before it.
  const leftmost = Math.min(...bands.map((band) => band.left));
  const rightmost = Math.max(...bands.map((band) => band.right));
  const stage = await page.locator('.bj-stage').boundingBox();
  const panning = metrics.cssWidth > (stage?.width ?? 0) + 1;

  if (!panning) {
    const box = await cardBox(page);
    expect(box.found, `${label}: no card is composited at all`).toBeGreaterThan(100);
    expect(
      Math.abs(box.left - leftmost),
      `${label}: the leftmost card is not where the scene put it`,
    ).toBeLessThanOrEqual(EDGE_TOLERANCE);
    expect(
      Math.abs(box.right - rightmost),
      `${label}: the rightmost card is not where the scene put it`,
    ).toBeLessThanOrEqual(EDGE_TOLERANCE);
    return;
  }

  // **A surface wider than its stage cannot be photographed in one frame**, and
  // that is the state item `E8`'s fourth clause is about rather than a limit of
  // this instrument: the stage shows a window onto the canvas, and an element
  // screenshot of a box the browser is clipping reports the window, not the
  // element. So the composite is measured twice, through the window, at each end
  // of the pan, and each end is compared with the derivation in the canvas's own
  // coordinates. That the far end is only reachable after the pan is the
  // criterion's own escape hatch, demonstrated rather than assumed.
  for (const side of ['near', 'far'] as const) {
    // Where the canvas sits inside the window after the pan, so a pixel found
    // at `x` in the window is at `x - offset` on the canvas.
    //
    // The far end is asked for as `scrollWidth` rather than as some very large
    // number, which is not a style choice: WebKit left `scrollLeft` at 0 when it
    // was assigned `Number.MAX_SAFE_INTEGER`, so the pan never happened and the
    // measurement below came back short by exactly the pan range. The scroll is
    // therefore read back and required to have moved.
    const panned = await page.evaluate((far: boolean) => {
      const stageNode = document.querySelector('.bj-stage');
      const canvas = document.querySelector('canvas.bj-surface');
      if (stageNode === null || canvas === null) {
        throw new Error('no stage on this page');
      }
      stageNode.scrollLeft = far ? stageNode.scrollWidth : 0;
      return {
        offset: canvas.getBoundingClientRect().x - stageNode.getBoundingClientRect().x,
        scrollLeft: stageNode.scrollLeft,
      };
    }, side === 'far');
    const offset = panned.offset;
    if (side === 'far') {
      expect(panned.scrollLeft, `${label}: the stage would not pan`).toBeGreaterThan(0);
    }
    const window_ = await cardBox(page, '.bj-stage');
    expect(window_.found, `${label}: no card in the ${side} half of the pan`).toBeGreaterThan(100);
    if (side === 'near') {
      expect(
        Math.abs(window_.left - offset - leftmost),
        `${label}: the leftmost card is not where the scene put it`,
      ).toBeLessThanOrEqual(EDGE_TOLERANCE);
    } else {
      expect(
        Math.abs(window_.right - offset - rightmost),
        `${label}: the rightmost card is not reachable by panning to it`,
      ).toBeLessThanOrEqual(EDGE_TOLERANCE);
    }
  }
  await page.evaluate(() => {
    const stageNode = document.querySelector('.bj-stage');
    if (stageNode !== null) {
      stageNode.scrollLeft = 0;
    }
  });
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

      // The measured band is never narrower than one floored card, which is the
      // criterion read straight off the composite.
      expect(box.right - box.left).toBeGreaterThanOrEqual(CARD_WIDTH_FLOOR - 2);
      // **What used to be here was the clipping bound rather than a detector of
      // it.** `box.right - box.left <= cssWidth + 2` is true of every clipped
      // picture ever drawn, because a canvas cannot report pixels it does not
      // hold: `AUDIT-2`'s `Z3-01` measured a card composited 24.8 percent below
      // the floor with this assertion green. The replacement measures where the
      // scene put each band and requires the bitmap to hold all of it.
      await assertBandsOnTheBitmap(page, label);
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

// ---------------------------------------------------------------------------
// AUDIT-2: the fourth regime, measured where the findings measured it
// ---------------------------------------------------------------------------

/** The phone `J5-01` and `J5-02` drove, and the smallest viewport supported. */
const PHONE = { width: 390, height: 844 };
const SMALLEST = { width: 320, height: 420 };

/** Split while the machine keeps offering it. SPEC 4.6 stops at four hands. */
async function splitAllTheWay(page: Page): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await pressOn(page, '[data-action="split"]', 'playerTurn'))) {
      break;
    }
    await waitForPhase(page, 'playerTurn');
    await settle(page);
  }
  return (await readout(page)).hands.length;
}

/** Stand every hand until the round reaches SPEC 12's result. */
async function standToResult(page: Page): Promise<void> {
  for (let step = 0; step < 60; step += 1) {
    const phase = await shell(page).getAttribute('data-phase');
    if (phase === 'roundResult') {
      break;
    }
    if (phase === 'insurance') {
      await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
    } else if (phase === 'playerTurn') {
      await pressOn(page, '[data-action="stand"]', 'playerTurn');
    } else {
      await page.waitForTimeout(80);
    }
  }
  await waitForPhase(page, 'roundResult');
}

/** What the stage can reach, and where the canvas sits inside it. */
async function stageReach(page: Page): Promise<{
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly atStartLeft: number;
  readonly atEndRight: number;
  readonly stageLeft: number;
  readonly stageRight: number;
  readonly scrolledTo: number;
}> {
  return page.evaluate(() => {
    const stage = document.querySelector('.bj-stage');
    const canvas = document.querySelector('canvas.bj-surface');
    if (stage === null || canvas === null) {
      throw new Error('no stage on this page');
    }
    const stageBox = stage.getBoundingClientRect();
    stage.scrollLeft = 0;
    const atStart = canvas.getBoundingClientRect();
    stage.scrollLeft = stage.scrollWidth;
    const atEnd = canvas.getBoundingClientRect();
    const scrolledTo = stage.scrollLeft;
    stage.scrollLeft = 0;
    return {
      scrollWidth: stage.scrollWidth,
      clientWidth: stage.clientWidth,
      atStartLeft: atStart.x,
      atEndRight: atEnd.x + atEnd.width,
      stageLeft: stageBox.x,
      stageRight: stageBox.x + stageBox.width,
      scrolledTo,
    };
  });
}

test.describe('E8: past both floors the band overflows into the pannable stage', () => {
  test('keeps a four-hand split on the bitmap at the round result', async ({ page }) => {
    // `J1-06`: "at a 390 x 844 portrait viewport, on the round result of a round
    // split to four hands, the surface canvas is 144 x 192 CSS px while the
    // scene's own published numbers say the four hands need 302 CSS px of band".
    const { seed, cards } = fourWaySplit();
    await page.setViewportSize(PHONE);
    await atPlayerTurn(page, seed);
    expect(await splitAllTheWay(page), 'the seed no longer splits four ways').toBe(4);
    await standToResult(page);
    await stillScene(page);

    const shapes = await handShapes(page);
    expect(shapes.handCounts, 'the round result is not the shape the hunt found').toEqual([
      ...cards,
    ]);
    await assertBandsOnTheBitmap(page, 'phone round result, four hands');
  });

  test('gives the band somewhere to pan to when it outgrows the stage', async ({ page }) => {
    // The criterion's own escape hatch, exercised: at the smallest viewport this
    // game supports, four hands need more room than the stage can show, so the
    // surface is wider than its stage and **the stage scrolls to the rest of
    // it**. `J5-01` route C measured the opposite before this cure: `scrollWidth
    // === clientWidth` at every viewport, every gesture moving it zero pixels,
    // "there is no overflow to pan to because the canvas is narrower than the
    // stage while the band is wider than the canvas".
    const { seed } = fourWaySplit();
    await page.setViewportSize(SMALLEST);
    await atPlayerTurn(page, seed);
    expect(await splitAllTheWay(page)).toBe(4);
    await standToResult(page);
    await stillScene(page);

    await assertBandsOnTheBitmap(page, 'smallest round result, four hands');

    const metrics = await surfaceMetrics(page);
    const reach = await stageReach(page);
    // The picture really is wider than the box it is shown in, or this test is
    // grading a fit rather than the overflow it exists for.
    expect(
      metrics.cssWidth,
      'the four hands fitted the stage, so nothing overflowed',
    ).toBeGreaterThan(reach.clientWidth);
    expect(reach.scrollWidth, 'the stage has no pan range').toBeGreaterThan(reach.clientWidth + 1);
    expect(reach.scrolledTo, 'the stage will not scroll sideways').toBeGreaterThan(0);
    // Both ends are reachable: the left edge of the surface at rest, the right
    // edge after the pan. That pair is what "reachable" means for a picture
    // wider than its window.
    expect(reach.atStartLeft, 'the surface starts left of the stage').toBeGreaterThanOrEqual(
      reach.stageLeft - 1,
    );
    expect(reach.atEndRight, "the surface's right edge cannot be reached").toBeLessThanOrEqual(
      reach.stageRight + 1,
    );
  });

  test('draws the round result on the surface the stage can hold', async ({ page }) => {
    // **The shipped page, driven through its own controls, with nothing
    // injected and no seed.** `J5-02` measured this screen at 366 x 192 of
    // stage drawing a 144 x 192 surface, "a 78 percent loss of area, in a stage
    // that is still 366 CSS px wide", and the page already scrolls at this
    // phase so the height it gives up buys nothing back.
    await page.setViewportSize(PHONE);
    await atShippedBetting(page);
    await chip(page, FLOW_WAGER).click();
    await control(page, 'deal').click();
    await standToResult(page);
    // The shipped bundle exports nothing, so `tweensInFlight` cannot be asked
    // here the way the seeded arms ask it. What this arm measures is the size
    // the layout planned, which is not a tween: two settles apart it is the
    // same number or the page is still changing shape.
    await settle(page);
    const first = await surfaceMetrics(page);
    await settle(page);
    expect(await surfaceMetrics(page), 'the surface is still being re-planned').toEqual(first);

    const report = await layoutReport(page);
    const body = report.regions.body;
    expect(body, 'no play-surface row').not.toBeNull();
    const wanted = expectedSurfaceBox(
      { width: body?.width ?? 0, height: body?.height ?? 0 },
      report.breakpoint,
      SURFACE_FRAMING,
    );
    const metrics = await surfaceMetrics(page);
    expect(metrics.cssWidth, 'the round result draws a postage stamp').toBeGreaterThanOrEqual(
      wanted.width - 1,
    );
    expect(metrics.cssHeight, 'the round result gave up its height').toBeGreaterThanOrEqual(
      wanted.height - 1,
    );
    // And the cards of the round the player is being told about are on it.
    const box = await cardBox(page);
    expect(box.found, 'no card on the round result screen').toBeGreaterThan(100);
    expect(box.left, 'a card starts off the canvas').toBeGreaterThanOrEqual(-EDGE_TOLERANCE);
    expect(box.right, 'a card ends off the canvas').toBeLessThanOrEqual(
      metrics.cssWidth + EDGE_TOLERANCE,
    );
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
