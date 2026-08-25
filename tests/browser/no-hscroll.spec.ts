/**
 * Item `F2`, Major, 9 points, over the built `dist/`.
 *
 *   "No horizontal page scroll occurs at any viewport width from 320 pixels
 *    upward."
 *
 * One clause, three ways of being wrong, and a control.
 *
 * **"At any width from 320 upward"** is a sweep rather than four breakpoints.
 * The widths below include both sides of both breakpoint floors and the awkward
 * middle of each range, because the width that overflows is never the one the
 * layout was designed at: it is the one two pixels below where a row stops
 * wrapping.
 *
 * **"No horizontal page scroll"** is measured twice per width, on the document
 * element and on the body, because a page can scroll from either. The chip tray
 * and the play-surface stage scroll **inside themselves** by design, which is
 * exactly the distinction this item rests on: DESIGN section 4 gives the narrow
 * bottom bar a horizontally scrolling chip tray, and item `F6` gives the stage a
 * surface larger than its box above 100 percent. Neither is page scroll, and the
 * test that could not tell them apart would either fail the design or pass a
 * defect.
 *
 * **Three screens, not one.** The widest content in this chrome is not the
 * betting bar: it is SPEC 12's round result, which prints a card per settled
 * hand, and the Settings overlay, which prints the house rules as a sentence. A
 * sweep over the betting screen alone would miss both.
 *
 * **The instrument is proved before it is trusted.** A scan that finds nothing
 * is indistinguishable from a scan that cannot see, so one test widens the page
 * with an element of its own and requires the same reading to report the scroll
 * it just caused. That control is the reason the rest of the file means
 * anything.
 */

import { expect, test, type Page } from '@playwright/test';

import {
  DESIGNED_SCROLLERS,
  atBetting,
  atShippedBetting,
  chip,
  control,
  pageMetrics,
  resizeTo,
  settle,
  waitForPhase,
} from './support/game';

const SEED = 53;
const WAGER = 50;

/**
 * Every width the sweep visits, from the floor the criterion names upward.
 *
 * 767 and 768 are the medium floor, 1023 and 1024 the wide one, and the rest are
 * real device widths plus the gaps between them.
 */
const WIDTHS = [
  320, 344, 360, 375, 390, 412, 430, 480, 540, 600, 667, 720, 767, 768, 800, 834, 900, 1000, 1023,
  1024, 1180, 1280, 1440, 1600, 1920,
];

/**
 * Two heights per width: one above the sticky threshold and one below it.
 *
 * They are different layouts, not different sizes of one: below 400 px the bars
 * unstick and the document scrolls vertically, which is the mode where a
 * horizontal overflow is easiest to introduce and hardest to see.
 */
const HEIGHTS = [640, 320];

/**
 * Read the page's own scrolling at one viewport, and require none of it.
 *
 * Three readings, not one. The document and the body are the page. The third is
 * every chrome container that is **not** a designated scroller, because a
 * horizontal overflow inside one of those never reaches the document: the
 * container absorbs it, the page stays exactly as wide as the viewport, and the
 * defect is one level down rather than absent. The `BJ-16` ledger found that
 * hole with a mutation that stopped the control rows wrapping.
 */
async function requireNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const metrics = await pageMetrics(page);
  expect(
    metrics.scrollWidth,
    `${label}: the document scrolls horizontally at ${String(metrics.innerWidth)} px`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(
    metrics.bodyScrollWidth,
    `${label}: the body scrolls horizontally at ${String(metrics.innerWidth)} px`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
  for (const container of metrics.containers) {
    if (DESIGNED_SCROLLERS.includes(container.selector)) {
      continue;
    }
    expect(
      container.overflowX,
      `${label}: ${container.selector} hides a horizontal overflow at ${String(metrics.innerWidth)} px`,
    ).toBeLessThanOrEqual(1);
  }
}

async function sweep(page: Page, label: string): Promise<number> {
  let measured = 0;
  for (const width of WIDTHS) {
    for (const height of HEIGHTS) {
      await resizeTo(page, width, height);
      await requireNoHorizontalScroll(page, `${label} ${String(width)}x${String(height)}`);
      measured += 1;
    }
  }
  return measured;
}

test.describe('F2: no horizontal page scroll from 320 px upward', () => {
  test('holds across the whole width sweep on the betting screen', async ({ page }) => {
    // The shipped page, driven through its own controls, with nothing injected.
    await page.setViewportSize({ width: 1280, height: 800 });
    await atShippedBetting(page);
    const measured = await sweep(page, 'betting');
    expect(measured, 'the sweep really ran').toBe(WIDTHS.length * HEIGHTS.length);
    expect(WIDTHS[0], 'the sweep starts at the width the criterion names').toBe(320);
  });

  test('holds with the Settings overlay open, which carries the longest text', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await atShippedBetting(page);
    await page.locator('[data-open-overlay="settings"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    await sweep(page, 'settings overlay');
    // The overlay is still open at the end, so the sweep measured it throughout
    // rather than closing it at the first resize.
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
  });

  test('holds at the player turn and at SPEC 12s round result', async ({ page }) => {
    // A known deal, because the round result is the widest screen in the chrome
    // and an unseeded round can settle before it prints anything interesting.
    await page.setViewportSize({ width: 1280, height: 800 });
    await atBetting(page, { seed: SEED });
    await chip(page, WAGER).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await settle(page);
    await sweep(page, 'playerTurn');

    await resizeTo(page, 1280, 800);
    await page.locator('[data-action="stand"]').click();
    await waitForPhase(page, 'roundResult');
    await settle(page);
    await sweep(page, 'roundResult');
    await expect(
      page.locator('[data-screen="round-result"]'),
      'the result screen was up throughout',
    ).toBeVisible();
  });
});

test.describe('F2: the measurement can see a horizontal scroll', () => {
  test('reports an overflow the test itself creates, and stops when it is gone', async ({
    page,
  }) => {
    // The control. Every assertion above is an absence, and an absence measured
    // by an instrument that cannot see is not evidence of anything. This widens
    // the page by an element of its own, requires the same two readings to
    // report it, and then removes it and requires them to go quiet again.
    await page.setViewportSize({ width: 400, height: 640 });
    await atShippedBetting(page);
    await requireNoHorizontalScroll(page, 'before the control');

    await page.evaluate(() => {
      const wide = document.createElement('div');
      wide.id = 'bj-overflow-control';
      wide.style.width = '3000px';
      wide.style.height = '1px';
      document.body.append(wide);
    });
    await settle(page);
    const overflowing = await pageMetrics(page);
    expect(
      overflowing.scrollWidth,
      'the document reading is blind to a real overflow',
    ).toBeGreaterThan(overflowing.clientWidth + 1);
    expect(
      overflowing.bodyScrollWidth,
      'the body reading is blind to a real overflow',
    ).toBeGreaterThan(overflowing.clientWidth + 1);

    await page.evaluate(() => {
      document.getElementById('bj-overflow-control')?.remove();
    });
    await settle(page);
    await requireNoHorizontalScroll(page, 'after the control');
  });

  test('does not mistake the chip tray for the page', async ({ page }) => {
    // DESIGN section 4's narrow bottom bar scrolls its chip tray horizontally.
    // The distinction the criterion rests on: the tray may scroll, the page may
    // not. Asserted rather than assumed, because a rule that stopped the tray
    // from scrolling would make this file pass by removing the design.
    await page.setViewportSize({ width: 320, height: 640 });
    await atShippedBetting(page);
    await settle(page);
    const overflowX = await page.evaluate(() => {
      const tray = document.querySelector('.bj-chips');
      return tray === null ? '' : getComputedStyle(tray).overflowX;
    });
    expect(overflowX, 'the chip tray is the designated scroller at this width').toBe('auto');
    await requireNoHorizontalScroll(page, 'chip tray at 320');
  });
});
