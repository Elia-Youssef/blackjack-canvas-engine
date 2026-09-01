/**
 * Item `F7`, Major, 10 points, over the built `dist/`.
 *
 *   "At 320 by 256 CSS pixels there is no two-dimensional scrolling and no loss
 *    of function, and both sticky bars unstick below a 400 pixel viewport height
 *    rather than consuming it."
 *
 * Two halves, and neither implies the other.
 *
 * **Half one: 320 x 256.** That is what 400 percent zoom on a 1280 x 1024
 * display produces, which is why WCAG 1.4.10 names it. "No two-dimensional
 * scrolling" is one axis, not none: the page may scroll vertically at this size
 * and must not scroll horizontally, so the horizontal reading is asserted and
 * the vertical one is asserted to be **present**, because a page that fits 256 px
 * without scrolling at all would have had to hide something. "No loss of
 * function" is a whole round played at that viewport through the page's own
 * controls, from the chip tap to the next hand.
 *
 * **Half two: the bars unstick below 400 px of height.** Asserted three ways,
 * because "unstick rather than consume" is a behaviour and not a property:
 *
 *   1. The computed `position` of both bars is `static` at 320 x 256 and
 *      `sticky` at 320 x 420, which is the same page 164 px taller. One reading
 *      without the other would pass on a chrome that had no sticky bars at all.
 *   2. Scrolled to the bottom of the document, the top bar has actually left the
 *      screen, which is what a static bar does and what a stuck one cannot.
 *   3. The play surface still has a real height at that viewport, taking DESIGN
 *      section 4's minimum rather than the share of nothing that two stuck bars
 *      would leave it.
 *
 * **Route.** The shipped page throughout, driven through its own controls, with
 * nothing injected. Every clause here is reachable on a Bronze table.
 */

import { expect, test, type Page } from '@playwright/test';

import { scrollToTop } from './support/flow';

import { STICKY_BARS_MIN_HEIGHT } from '../../src/ui/breakpoints';
import {
  atShippedBetting,
  chip,
  control,
  layoutReport,
  numberIn,
  pageMetrics,
  readoutValue,
  resizeTo,
  settle,
  waitForPhase,
} from './support/game';

/**
 * QUALITY-BAR section 5's own viewport, and a phone with room to stick.
 *
 * `ROOMY` is 390 x 844 rather than 320 x 420, and the difference is `BJ-16`'s fix
 * round. The bars now stick only where the two of them and the play surface's
 * minimum all fit, so a 320 px wide page at 420 px of height is static because
 * there is no room for the sticky layout rather than because of the threshold:
 * the top bar alone wraps to several rows at that width. The threshold itself is
 * graded where it can be isolated, in `tests/unit/layout-breakpoints.test.ts`,
 * which holds the rule to `false` one pixel below 400 and `true` at it with the
 * chrome's own heights held out of the way. What this file needs from a second
 * viewport is a page where the bars really do stick, so that "static at 256" is a
 * measurement rather than a description of every page there is.
 */
const SMALL = { width: 320, height: 256 };
const ROOMY = { width: 390, height: 844 };

const WAGER = 10;

/** Scroll the document to its bottom, as a thumb would. */
async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await settle(page);
}

test.describe('F7: 320 by 256 scrolls in one axis and keeps every function', () => {
  test('scrolls vertically, never horizontally', async ({ page }) => {
    await page.setViewportSize(SMALL);
    await atShippedBetting(page);
    await scrollToTop(page);

    const metrics = await pageMetrics(page);
    expect(metrics.innerWidth).toBe(SMALL.width);
    expect(metrics.innerHeight).toBe(SMALL.height);
    expect(metrics.scrollWidth, 'the page scrolls horizontally at 320 px').toBeLessThanOrEqual(
      metrics.clientWidth + 1,
    );
    expect(metrics.bodyScrollWidth, 'the body scrolls horizontally at 320 px').toBeLessThanOrEqual(
      metrics.clientWidth + 1,
    );
    // The other axis is present, and that is the point rather than a tolerance:
    // a chrome that fitted a bar, a play surface and nine controls into 256 px
    // with nothing to scroll to would have dropped something.
    expect(metrics.scrollHeight, 'nothing scrolls, so something was dropped').toBeGreaterThan(
      metrics.clientHeight,
    );
  });

  test('plays a whole round at 320 by 256', async ({ page }) => {
    await page.setViewportSize(SMALL);
    await atShippedBetting(page);
    await settle(page);

    // Every click below scrolls its control into view first, which is what a
    // player does with a thumb. Nothing here is reached any other way.
    await chip(page, WAGER).click();
    await expect
      .poll(async () => numberIn(readoutValue(page, 'wager')), {
        message: 'the chip tap never reached the wager readout',
      })
      .toBe(WAGER);

    await control(page, 'deal').click();
    for (let step = 0; step < 40; step += 1) {
      const phase = await page.locator('.bj-shell').getAttribute('data-phase');
      if (phase === 'roundResult') {
        break;
      }
      if (phase === 'insurance') {
        await page.locator('[data-control="decline-insurance"]').click();
      } else if (phase === 'playerTurn') {
        await page.locator('[data-action="stand"]').click();
      }
      await page.waitForTimeout(120);
    }
    await waitForPhase(page, 'roundResult');
    await expect(page.locator('[data-screen="round-result"]')).toBeVisible();
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'betting');

    // And the page still does not scroll sideways after a full round, with the
    // result screen's content having come and gone.
    const metrics = await pageMetrics(page);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  });

  test('keeps every control reachable, by scrolling in one axis', async ({ page }) => {
    await page.setViewportSize(SMALL);
    await atShippedBetting(page);
    await settle(page);

    // At this size the controls are reached by scrolling, so reachability is
    // asserted at both ends of the document rather than in one screenful: every
    // control that is on screen has to be clickable where it is drawn, and the
    // set has to be complete once both ends have been visited.
    const seen = new Set<string>();
    for (const scroll of [0, 1]) {
      if (scroll === 1) {
        await scrollToBottom(page);
      } else {
        await scrollToTop(page);
      }
      const report = await layoutReport(page);
      for (const entry of report.controls) {
        if (
          entry.box.y >= 0 &&
          entry.box.y + entry.box.height <= report.inner.height &&
          entry.box.x >= 0
        ) {
          expect(entry.hit, `${entry.key} is covered where it is drawn`).toBe('self');
          seen.add(entry.key);
        }
      }
    }
    for (const key of [
      'data-chip=10',
      'data-chip=500',
      'data-control=deal',
      'data-control=max',
      'data-open-overlay=settings',
    ]) {
      expect([...seen], `${key} was never reachable at either end of the page`).toContain(key);
    }
  });
});

test.describe('F7: both bars unstick below a 400 px viewport height', () => {
  test('is static at 256 px of height and sticky on a page with room', async ({ page }) => {
    await page.setViewportSize(ROOMY);
    await atShippedBetting(page);
    await settle(page);

    const roomy = await layoutReport(page);
    expect(roomy.stickyBars, 'the bars stick nowhere, so the reading below is empty').toBe('on');
    expect(roomy.styles.topPosition, 'the top bar is not sticky where it fits').toBe('sticky');
    expect(roomy.styles.controlsPosition, 'the bottom bar is not sticky where it fits').toBe(
      'sticky',
    );
    expect(ROOMY.height).toBeGreaterThanOrEqual(STICKY_BARS_MIN_HEIGHT);

    await resizeTo(page, SMALL.width, SMALL.height);
    const small = await layoutReport(page);
    expect(small.stickyBars, 'the bars still stick below the threshold').toBe('off');
    expect(small.styles.topPosition, 'the top bar still sticks').toBe('static');
    expect(small.styles.controlsPosition, 'the bottom bar still sticks').toBe('static');
    expect(SMALL.height).toBeLessThan(STICKY_BARS_MIN_HEIGHT);
  });

  test('lets the top bar scroll off the screen instead of consuming it', async ({ page }) => {
    // The behavioural half. A bar that is `static` in the stylesheet but pinned
    // some other way would pass the reading above and fail here.
    await page.setViewportSize(SMALL);
    await atShippedBetting(page);
    await settle(page);

    await scrollToTop(page);
    const before = await layoutReport(page);
    const topBefore = before.regions.top;
    expect(topBefore).not.toBeNull();
    expect(topBefore?.y ?? -1, 'the top bar does not start at the top').toBeGreaterThanOrEqual(0);

    await scrollToBottom(page);
    const after = await layoutReport(page);
    const topAfter = after.regions.top;
    expect(topAfter).not.toBeNull();
    expect(
      (topAfter?.y ?? 0) + (topAfter?.height ?? 0),
      'the top bar is still consuming the viewport at the bottom of the page',
    ).toBeLessThanOrEqual(0);

    // And the bottom bar is on screen there, which is where a player scrolls to
    // reach it.
    const controls = after.regions.controls;
    expect(controls).not.toBeNull();
    expect(controls?.y ?? 0).toBeLessThan(after.inner.height);
  });

  test('leaves the play surface a real height rather than a share of nothing', async ({ page }) => {
    await page.setViewportSize(SMALL);
    await atShippedBetting(page);
    await scrollToTop(page);

    const report = await layoutReport(page);
    const surface = report.regions.surface;
    const body = report.regions.body;
    expect(surface).not.toBeNull();
    expect(body).not.toBeNull();
    // DESIGN section 4: "the play surface takes a minimum height rather than a
    // share". The exact number is a token; what is asserted here is that it is
    // a real height and that the surface fills the row it was given.
    expect(surface?.height ?? 0, 'the play surface collapsed').toBeGreaterThan(100);
    expect(surface?.width ?? 0, 'the play surface collapsed').toBeGreaterThan(100);
    expect(body?.height ?? 0).toBeGreaterThanOrEqual(surface?.height ?? 0);
    expect(surface?.width ?? 0, 'the surface is wider than the viewport').toBeLessThanOrEqual(
      report.inner.width,
    );
  });
});
