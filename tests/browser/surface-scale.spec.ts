/**
 * Item `F6`, Major, 10 points, over the built `dist/`.
 *
 *   "The play-surface size setting offers 100, 125, 150 and 200 percent, raises
 *    the logical-to-CSS scale by that factor, persists, and clips nothing at any
 *    breakpoint. Browser zoom alone does not magnify canvas content, so this is
 *    the only magnification path the play surface has."
 *
 * Five clauses. Four are graded here and the fifth is an openly parked ruling.
 *
 *   1. **"offers 100, 125, 150 and 200 percent"** is the Settings panel: four
 *      controls, the four values `SURFACE_SIZES` lists, exactly one pressed, and
 *      each of the four reaching the page when it is pressed.
 *   2. **"raises the logical-to-CSS scale by that factor"** is measured on the
 *      canvas itself, on the shipped page, with nothing injected: the CSS box is
 *      the scale times DESIGN section 4's framing, so the ratio of two CSS boxes
 *      at the same viewport is the ratio of two scales. Each of the four is
 *      required to be its own factor away from 100 percent, not merely larger.
 *      The exact reading is cross-checked once against the page's own layout
 *      probe, so the DOM measurement and the arithmetic have to agree.
 *   3. **"persists"** is **not graded here**, and that is a ruling rather than a
 *      gap. It was ruled on 2026-08-24, with the user's approval, that this
 *      clause closes at `BJ-20`'s reload specs, on exactly the terms item `E9`'s
 *      identical clause was ruled at `BJ-14`: SPEC 13's document is wired into
 *      `boot` there, `I4` and `I5` grade the reload flows there, and nothing
 *      imports `src/storage/` before that part. What `BJ-16` ships toward it is a
 *      setting in a serialisable shape whose only home is `SessionState`, which
 *      the last test in this file asserts: the value a player chose is on the
 *      session record the restore will write.
 *   4. **"clips nothing at any breakpoint"** is all four breakpoints times all
 *      four sizes. Clipping is asserted three ways at each: the canvas is drawn
 *      at exactly the size the scale asks for rather than clamped back into its
 *      row, every part of it can be reached in the container that holds it, and
 *      the page still has no horizontal scroll and no unreachable control.
 *   5. **"browser zoom alone does not magnify canvas content"** is its own test,
 *      and it is measured in **device pixels**, which is the only unit in which
 *      "the same physical size" means anything. Two contexts model one screen at
 *      two zoom levels: 1600 x 1000 at a device scale factor of 1, and 1280 x 800
 *      at 1.25, which is the same panel at 125 percent zoom. The backing store is
 *      required not to grow, and then the size setting is applied in the zoomed
 *      context and required to grow it, which is the "only magnification path"
 *      half of the sentence.
 *
 * **Why the zoom reading is an inequality and not an equality.** Chrome text
 * keeps its CSS size under zoom, so the bars around the play surface do not
 * shrink with the viewport and the row left for the surface is not a scaled copy
 * of the unzoomed one. The claim the criterion makes is that zoom does not
 * **magnify**, and that is exactly what is asserted: not one device pixel more.
 */

import { expect, test, type Page } from '@playwright/test';

import { SURFACE_SIZES } from '../../src/render/surface';
import { SURFACE_FRAMING, resolveBreakpoint } from '../../src/ui/breakpoints';
import {
  atBetting,
  atShippedBetting,
  chooseInSettings,
  controlNamed,
  layoutProbe,
  layoutReport,
  pageMetrics,
  session,
  settle,
  surfaceMetrics,
} from './support/game';

/** One viewport per breakpoint, with room for a surface to grow into. */
const VIEWPORTS = [
  { breakpoint: 'wide', width: 1280, height: 800 },
  { breakpoint: 'medium', width: 900, height: 700 },
  { breakpoint: 'compact', width: 720, height: 420 },
  { breakpoint: 'portrait', width: 390, height: 844 },
] as const;

/** How far a measured ratio may sit from the factor, in CSS pixels of width. */
const PIXEL_TOLERANCE = 2;

/** Choose one of the four sizes through the Settings panel, as a player does. */
async function chooseSize(page: Page, size: number): Promise<void> {
  await chooseInSettings(page, `button[data-surface-size="${String(size)}"]`);
  await expect(page.locator('.bj-shell')).toHaveAttribute('data-layout-size', String(size));
}

test.describe('F6: the setting offers the four sizes and applies them', () => {
  test('shows exactly the four, with one pressed, and reaches the page with each', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await atShippedBetting(page);
    await page.locator('[data-open-overlay="settings"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();

    // Scoped to the buttons: the shell carries the resolved size under its own
    // name, and a selector that resolved to both would be counting the page.
    const controls = page.locator('button[data-surface-size]');
    await expect(controls).toHaveCount(SURFACE_SIZES.length);
    const offered = await controls.evaluateAll((nodes) =>
      nodes.map((node) => Number(node.getAttribute('data-surface-size'))),
    );
    expect(offered, 'the panel offers a different set from the module').toEqual([...SURFACE_SIZES]);
    expect(offered).toEqual([100, 125, 150, 200]);

    // Exactly one is pressed at a time, and it is the one the shell reports.
    for (const size of SURFACE_SIZES) {
      const pressed = await page
        .locator('button[data-surface-size][aria-pressed="true"]')
        .getAttribute('data-surface-size');
      expect(pressed, 'more or fewer than one size is pressed').not.toBeNull();
      await page.locator(`button[data-surface-size="${String(size)}"]`).click();
      await expect(page.locator(`button[data-surface-size="${String(size)}"]`)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.locator('button[data-surface-size][aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator('.bj-shell')).toHaveAttribute(
        'data-layout-size',
        String(size),
      );
    }
  });

  test('takes effect immediately, mid-round included, as SPEC 14 requires', async ({ page }) => {
    // SPEC 14 groups Speed and play-surface size as the two settings that "take
    // effect immediately, mid-round included, because neither can change an
    // outcome". So the change is made **during** a round and the canvas is
    // required to have grown before the round ends, with the hand untouched.
    await page.setViewportSize({ width: 1280, height: 800 });
    await atBetting(page, { seed: 53 });
    await page.locator('[data-chip="50"]').click();
    await page.locator('[data-control="deal"]').click();
    await expect(page.locator('.bj-shell')).toHaveAttribute('data-phase', 'playerTurn');
    await settle(page);

    const before = await surfaceMetrics(page);
    const hand = (await page.locator('[data-readout="hand-value"] .bj-readout__value').textContent()) ?? '';

    await chooseSize(page, 150);
    const after = await surfaceMetrics(page);
    expect(after.cssWidth, 'the canvas did not grow mid-round').toBeGreaterThan(before.cssWidth);
    await expect(page.locator('.bj-shell')).toHaveAttribute('data-phase', 'playerTurn');
    expect(
      await page.locator('[data-readout="hand-value"] .bj-readout__value').textContent(),
      'the hand changed when the setting did',
    ).toBe(hand);
  });
});

for (const viewport of VIEWPORTS) {
  test.describe(`F6: the scale at the ${viewport.breakpoint} breakpoint`, () => {
    test('rises by exactly the factor and clips nothing', async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await atShippedBetting(page);
      await settle(page);
      expect((await layoutReport(page)).breakpoint).toBe(viewport.breakpoint);

      const framing =
        viewport.breakpoint === 'portrait' ? SURFACE_FRAMING.portrait : SURFACE_FRAMING.landscape;
      const base = await surfaceMetrics(page);

      for (const size of SURFACE_SIZES) {
        await chooseSize(page, size);
        const metrics = await surfaceMetrics(page);
        const label = `${viewport.breakpoint} at ${String(size)} percent`;

        // Clause 2: the ratio of two CSS boxes at one viewport is the ratio of
        // two scales, because the framing is the same number in both.
        const factor = size / 100;
        expect(metrics.cssWidth, label).toBeCloseTo(base.cssWidth * factor, -0.5);
        expect(
          Math.abs(metrics.cssWidth - base.cssWidth * factor),
          `${label}: the width is not the factor away from 100 percent`,
        ).toBeLessThanOrEqual(PIXEL_TOLERANCE);
        // The framing is held while it grows: a magnification that changed the
        // aspect would be a crop rather than a scale.
        expect(metrics.cssWidth / metrics.cssHeight, `${label}: the framing moved`).toBeCloseTo(
          framing.width / framing.height,
          1,
        );

        // Clause 4, first form: the canvas is drawn at the size the scale asks
        // for. A clamp back into the row would read as a smaller box here, and
        // would be exactly the silent refusal of a magnification the criterion
        // forbids.
        if (size > 100) {
          expect(metrics.cssWidth, `${label}: the surface did not grow at all`).toBeGreaterThan(
            base.cssWidth,
          );
        }

        // Clause 4, second form: every part of the surface can be **reached** in
        // the container that holds it.
        //
        // `scrollWidth` alone does not say that, and the ledger proved it: a
        // stage switched to `overflow: hidden` reports the same content extent
        // and scrolls to none of it, so the mutation that clipped a magnified
        // surface went undetected against a reading of the extent. Three
        // readings together do say it: the extent covers the canvas, the
        // container is a scroller in the engine's own computed style, and a
        // scroll to the far corner really puts the canvas's far edge inside the
        // visible box.
        const reach = await page.evaluate(() => {
          const stage = document.querySelector('.bj-stage');
          const canvas = document.querySelector('canvas.bj-surface');
          if (stage === null || canvas === null) {
            throw new Error('no stage on this page');
          }
          const style = getComputedStyle(stage);
          const before = stage.getBoundingClientRect();
          stage.scrollLeft = stage.scrollWidth;
          stage.scrollTop = stage.scrollHeight;
          const box = canvas.getBoundingClientRect();
          const scrolled = {
            left: stage.scrollLeft,
            top: stage.scrollTop,
            farX: box.x + box.width,
            farY: box.y + box.height,
          };
          stage.scrollLeft = 0;
          stage.scrollTop = 0;
          return {
            scrollWidth: stage.scrollWidth,
            scrollHeight: stage.scrollHeight,
            clientWidth: stage.clientWidth,
            clientHeight: stage.clientHeight,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            stageRight: before.x + before.width,
            stageBottom: before.y + before.height,
            canvasWidth: box.width,
            canvasHeight: box.height,
            scrolled,
          };
        });
        expect(reach.scrollWidth + 1, `${label}: the stage cannot reach the whole surface`).
          toBeGreaterThanOrEqual(reach.canvasWidth);
        expect(reach.scrollHeight + 1, `${label}: the stage cannot reach the whole surface`).
          toBeGreaterThanOrEqual(reach.canvasHeight);
        // `auto` or `scroll`, and deliberately not `visible`: the row above the
        // stage clips, so a stage that merely let its surface spill would be
        // clipping one element further out.
        for (const axis of [reach.overflowX, reach.overflowY]) {
          expect(
            ['auto', 'scroll'].includes(axis),
            `${label}: the stage is not a scroller, so its overflow is lost (${axis})`,
          ).toBe(true);
        }
        if (reach.scrollWidth > reach.clientWidth + 1) {
          expect(reach.scrolled.left, `${label}: the stage will not scroll sideways`).
            toBeGreaterThan(0);
          expect(reach.scrolled.farX, `${label}: the surface's right edge is unreachable`).
            toBeLessThanOrEqual(reach.stageRight + 1);
        }
        if (reach.scrollHeight > reach.clientHeight + 1) {
          expect(reach.scrolled.top, `${label}: the stage will not scroll down`).toBeGreaterThan(0);
          expect(reach.scrolled.farY, `${label}: the surface's bottom edge is unreachable`).
            toBeLessThanOrEqual(reach.stageBottom + 1);
        }

        // Clause 4, third form: the chrome around it is intact. No horizontal
        // page scroll, and every control still reachable at its own centre.
        const metricsNow = await pageMetrics(page);
        expect(
          metricsNow.scrollWidth,
          `${label}: a magnified surface became page scroll`,
        ).toBeLessThanOrEqual(metricsNow.clientWidth + 1);
        const report = await layoutReport(page);
        expect(report.breakpoint, `${label}: the breakpoint moved with the setting`).toBe(
          viewport.breakpoint,
        );
        // Every control that is on screen is still clickable where it is drawn.
        // Controls above or below the fold are skipped rather than failed: at a
        // viewport with no room for the sticky layout the page scrolls, and
        // `breakpoints.spec.ts` is where reachability by page scrolling is
        // graded. What this file is measuring is whether a magnified surface
        // broke the chrome around it.
        for (const entry of report.controls) {
          if (entry.box.y < 0 || entry.box.y + entry.box.height > report.inner.height) {
            continue;
          }
          expect(entry.hit, `${label}: ${entry.key} is unreachable`).toBe('self');
        }
        expect(controlNamed(report, 'data-control=deal'), `${label}: Deal is gone`).toBeDefined();
      }
    });
  });
}

test.describe('F6: the page and the arithmetic agree about the scale', () => {
  test('reports a scale that is the base times the factor, and a box that matches it', async ({
    page,
  }) => {
    // The one cross-check between the DOM measurement every test above uses and
    // the page's own reading of what it planned. They are independent: one is a
    // rendered box, the other is the number `planSurface` returned.
    await page.setViewportSize({ width: 1280, height: 800 });
    await atBetting(page, { seed: 53 });
    await settle(page);

    const base = await layoutProbe(page);
    expect(base.surfaceSize).toBe(100);
    expect(base.scale).toBeCloseTo(base.baseScale, 10);
    expect(base.framing).toEqual({
      width: SURFACE_FRAMING.landscape.width,
      height: SURFACE_FRAMING.landscape.height,
    });
    expect(resolveBreakpoint({ width: 1280, height: 800 })).toBe(base.breakpoint);

    for (const size of SURFACE_SIZES) {
      await chooseSize(page, size);
      const probe = await layoutProbe(page);
      const dom = await surfaceMetrics(page);
      expect(probe.surfaceSize, `${String(size)} percent`).toBe(size);
      expect(probe.scale, `${String(size)} percent`).toBeCloseTo(base.baseScale * (size / 100), 10);
      expect(probe.baseScale, 'the base scale moved with the setting').toBeCloseTo(
        base.baseScale,
        10,
      );
      // The scale, the framing and the rendered box are one statement. The box
      // is the floor of the product, because a plan that rounded up could ask
      // for one pixel more than its row at 100 percent.
      expect(dom.cssWidth, 'the rendered box is not the planned one').toBeCloseTo(
        probe.cssWidth,
        0,
      );
      const wanted = probe.framing.width * probe.scale;
      expect(wanted - dom.cssWidth, 'the box is not the floor of framing times scale')
        .toBeGreaterThanOrEqual(0);
      expect(wanted - dom.cssWidth).toBeLessThan(1);
      expect(dom.storeWidth).toBe(Math.round(probe.cssWidth * probe.dpr));
    }
  });

  test('carries the chosen size on the session record BJ-20 will persist', async ({ page }) => {
    // Clause 3's parked half, in the shape the ruling asks for. The setting is
    // on `SessionState`, serialisable and singular, so the restore at `BJ-20`
    // has one place to read and one place to write. Nothing here reloads
    // anything: that is the part where the clause closes.
    await page.setViewportSize({ width: 1280, height: 800 });
    await atBetting(page, { seed: 53 });
    expect((await session(page)).surfaceSize, 'the default is not 100 percent').toBe(100);
    await chooseSize(page, 200);
    expect((await session(page)).surfaceSize, 'the choice never reached the session').toBe(200);
    // And a boot told the setting starts there, which is the route a restore
    // takes: the same option `BJ-20` will fill from SPEC 13's document.
    await atBetting(page, { seed: 53, surfaceSize: 150 });
    expect((await session(page)).surfaceSize).toBe(150);
    await expect(page.locator('.bj-shell')).toHaveAttribute('data-layout-size', '150');
  });
});

test.describe('F6: browser zoom does not magnify canvas content', () => {
  test('keeps the backing store from growing under zoom, while the setting grows it', async ({
    browser,
  }) => {
    // One physical screen, 1600 by 1000 device pixels, at two zoom levels. At
    // 100 percent the viewport is 1600 CSS px at a ratio of 1; at 125 percent it
    // is 1280 CSS px at a ratio of 1.25. The backing store is in device pixels,
    // so it is the same unit at both, and it is what decides how large a card is
    // on the glass.
    const measure = async (
      viewport: { width: number; height: number },
      deviceScaleFactor: number,
      size: number | null,
    ): Promise<{ store: number; css: number }> => {
      const context = await browser.newContext({ viewport, deviceScaleFactor });
      const page = await context.newPage();
      await atShippedBetting(page);
      await settle(page);
      if (size !== null) {
        await chooseSize(page, size);
      }
      const metrics = await surfaceMetrics(page);
      await context.close();
      return { store: metrics.storeWidth, css: metrics.cssWidth };
    };

    const unzoomed = await measure({ width: 1600, height: 1000 }, 1, null);
    const zoomed = await measure({ width: 1280, height: 800 }, 1.25, null);

    // The CSS box shrank with the viewport, which is QUALITY-BAR section 4's own
    // sentence about what zoom does to a canvas.
    expect(zoomed.css, 'the canvas box did not shrink with the viewport').toBeLessThan(unzoomed.css);
    // And not one device pixel more of surface came out of it.
    expect(zoomed.store, 'browser zoom magnified the play surface').toBeLessThanOrEqual(
      unzoomed.store + 1,
    );

    // The other half of the sentence: the setting is the path that does magnify,
    // in the same zoomed context where zoom did not.
    const magnified = await measure({ width: 1280, height: 800 }, 1.25, 200);
    expect(
      magnified.store,
      'the size setting did not magnify what zoom refused to',
    ).toBeGreaterThan(zoomed.store * 1.5);
  });
});
