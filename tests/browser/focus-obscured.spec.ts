/**
 * Item `G10`, Major, 8 points, method **T**, evidence `playwright/focus-obscured`.
 *
 *   "No focused control is wholly obscured by a sticky bar, overlay or panel at
 *    any breakpoint, satisfying WCAG 2.2 SC 2.4.11 Focus Not Obscured, which is
 *    one of only two criteria 2.2 adds at AA that apply to this game."
 *
 * **The bar the criterion sets, and the stronger one this chrome meets.** SC
 * 2.4.11 at AA is *Minimum*: the focused item may be partly covered as long as
 * some part of it remains visible. The AAA form, 2.4.12, is *Enhanced*: no part
 * covered at all. This chrome meets the enhanced form everywhere, so both are
 * asserted on every stop, as two separate expectations with two separate
 * messages. That is deliberate rather than greedy: the criterion `G10` grades is
 * the first, and a later change that costs the second would otherwise be
 * invisible, where this way it names itself as "partly obscured" rather than
 * passing quietly. If a future layout genuinely needs the weaker bar somewhere,
 * one assertion moves and the reason for it gets written down here.
 *
 * **Focus is moved with real `Tab` presses.** That is not a detail: an engine
 * scrolls a focused element into view as part of sequential navigation, and
 * scrolling is the mechanism that keeps it unobscured. A spec that called
 * `focus()` in script would skip the scroll on some engines and would be
 * measuring a page no keyboard user ever sees.
 *
 * **Why the sticky bars cannot cover anything, and why that is still measured.**
 * `barsStick` in `src/ui/breakpoints.ts` answers `true` only when the top bar,
 * the controls row, the shell's own padding and the play surface's floor all fit
 * the viewport, so "sticky" implies "the page does not scroll" and a bar that
 * never leaves its own row cannot travel over a control. That is an argument,
 * and arguments are what this project measures rather than trusts: the
 * relationship is asserted directly below, and the sweeps then check the
 * rendered page anyway.
 *
 * **The negative control is a constructed obscuring bar.** Nothing in this
 * chrome covers a focused control, so a sweep that only ever passes would be
 * indistinguishable from a sweep that cannot see. A fixed element is planted
 * over the focused control and the same measurement is required to report it
 * wholly obscured.
 */

import { expect, test, type Page } from '@playwright/test';

import { SCREEN_CONTROLS, controlsInDomOrder, focusedStop, selectorFor } from './support/controls';
import {
  atShippedBetting,
  bootGame,
  control,
  openShippedPage,
  pageMetrics,
  pressOn,
  settle,
  shell,
  waitForPhase,
} from './support/game';
import { peekSeed } from './support/peek-seeds';

/** One viewport per QUALITY-BAR section 5 breakpoint. */
const VIEWPORTS = [
  { name: 'wide', width: 1280, height: 800 },
  { name: 'medium', width: 900, height: 800 },
  { name: 'compact', width: 667, height: 420 },
  { name: 'portrait', width: 375, height: 720 },
] as const;

/** How finely a focused control's box is sampled. 25 points, inset from the edge. */
const SAMPLES = 5;

/** What the measurement says about whichever control has focus. */
interface FocusVisibility {
  readonly key: string;
  /** Points inside the control's box that the control itself answers for. */
  readonly visible: number;
  /**
   * Points where something **on top of** the control answers instead.
   *
   * A point where an *ancestor* answers is not one of these, and the difference
   * is the whole reason this is a separate count. Every chip in this game is a
   * pill: its bounding box has four corners outside its painted shape, and a
   * hit test there finds the tray behind it. That is the element's own geometry
   * and not something covering it, and an ancestor is by definition behind its
   * descendant, so it cannot be obscuring one.
   */
  readonly covered: number;
  /** Points sampled inside the viewport. Zero means the control is off screen. */
  readonly inViewport: number;
  readonly total: number;
  /** What is on top at each covered point, so a failure names the culprit. */
  readonly coveredBy: readonly string[];
}

/**
 * Sample the focused control's box and report how much of it is really visible.
 *
 * `elementFromPoint` is the only reading that answers the question the criterion
 * asks: it returns what a click at that point would hit, so a point that answers
 * something else is a point where the control is covered. Sampling a grid rather
 * than the centre is what makes "wholly" measurable: a control covered except
 * for one corner passes SC 2.4.11 and fails 2.4.12, and a single-point reading
 * cannot tell those apart from either direction.
 */
async function focusVisibility(page: Page): Promise<FocusVisibility> {
  return page.evaluate((samples: number) => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || node === document.body) {
      return { key: 'BODY', visible: 0, covered: 0, inViewport: 0, total: 0, coveredBy: [] };
    }
    const box = node.getBoundingClientRect();
    const coveredBy: string[] = [];
    let visible = 0;
    let covered = 0;
    let inViewport = 0;
    let total = 0;
    for (let row = 0; row < samples; row += 1) {
      for (let column = 0; column < samples; column += 1) {
        total += 1;
        // Inset from the edges: a point exactly on a boundary belongs to
        // whichever box the engine rounds it into, which is not a reading of
        // anything.
        const x = box.left + (box.width * (column + 0.5)) / samples;
        const y = box.top + (box.height * (row + 0.5)) / samples;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
          continue;
        }
        inViewport += 1;
        const at = document.elementFromPoint(x, y);
        if (at !== null && (node === at || node.contains(at))) {
          visible += 1;
          continue;
        }
        if (at !== null && at.contains(node)) {
          // An ancestor answered: this point is outside the control's painted
          // shape rather than under anything. Neither visible nor covered.
          continue;
        }
        covered += 1;
        const name =
          at === null
            ? 'nothing'
            : `${at.tagName.toLowerCase()}.${typeof at.className === 'string' ? at.className : ''}`;
        if (!coveredBy.includes(name)) {
          coveredBy.push(name);
        }
      }
    }
    let key = node.tagName.toLowerCase();
    for (const attribute of [
      'data-control',
      'data-action',
      'data-chip',
      'data-open-overlay',
      'data-table',
      'data-coach-mode',
      'data-speed',
      'data-surface-size',
    ]) {
      const value = node.getAttribute(attribute);
      if (value !== null) {
        key = `${attribute}=${value}`;
        break;
      }
    }
    return { key, visible, covered, inViewport, total, coveredBy };
  }, SAMPLES);
}

/** Require the focused control to satisfy SC 2.4.11, and record 2.4.12. */
function expectNotObscured(report: FocusVisibility, where: string): void {
  // SC 2.4.11 Focus Not Obscured (Minimum), AA. Some part of the focused item
  // is visible. Zero sampled points inside the viewport is the same failure by
  // a different route: a control scrolled out of sight is not visible either.
  expect(
    report.inViewport,
    `${where}: ${report.key} has no part of it inside the viewport after focusing`,
  ).toBeGreaterThan(0);
  expect(
    report.visible,
    `${where}: ${report.key} is wholly obscured by ${report.coveredBy.join(', ')}`,
  ).toBeGreaterThan(0);

  // SC 2.4.12 Focus Not Obscured (Enhanced), AAA. Held everywhere in this
  // chrome, and asserted so that losing it is a failure rather than a silence.
  expect(
    report.covered,
    `${where}: ${report.key} is partly obscured by ${report.coveredBy.join(', ')}`,
  ).toBe(0);
}

/**
 * Walk the tab order with real key presses, measuring every stop.
 *
 * The walk starts from the first control, focused directly, and every stop after
 * it is reached with `Tab`. Firefox does not come back into the page once `Tab`
 * has left it, which is why `support/controls.ts` steps one place rather than
 * walking from the top; here the walk is bounded by the order's own length, so
 * it stops before leaving.
 */
async function walkTabOrder(page: Page, where: string): Promise<number> {
  const order = await controlsInDomOrder(page);
  expect(order.length, `${where}: nothing is in the tab order`).toBeGreaterThan(1);

  const first = order[0];
  expect(first).toBeDefined();
  await page.locator(selectorFor(first ?? '')).focus();
  await settle(page);

  let checked = 0;
  for (let index = 0; index < order.length; index += 1) {
    const stop = await focusedStop(page);
    if (stop.key === 'BODY') {
      break;
    }
    expectNotObscured(await focusVisibility(page), where);
    checked += 1;
    if (index < order.length - 1) {
      await page.keyboard.press('Tab');
      // **Measured after the page has answered, not on the frame focus moved.**
      // The engines do not agree about when a focused element is scrolled into
      // view: Chromium does it as part of moving focus, and WebKit was measured
      // here leaving a control entirely outside the viewport for at least a
      // frame afterwards, both on the page's own scroll and inside a scrolling
      // panel. The focus policy in `src/ui/input.ts` scrolls it on the next
      // sync either way, so what SC 2.4.11 is about is the state a player is
      // left in, which is this one. Without the wait this spec would be
      // measuring which engine scrolls synchronously.
      await settle(page);
    }
  }
  expect(checked, `${where}: no control was measured`).toBeGreaterThan(1);
  return checked;
}

// ---------------------------------------------------------------------------
// The control: the measurement can report an obscured control
// ---------------------------------------------------------------------------

test.describe('G10: the measurement can see a control being covered', () => {
  test('reports wholly obscured for a focused control under a planted fixed bar', async ({
    page,
  }) => {
    await atShippedBetting(page);
    const deal = control(page, 'deal');
    await deal.focus();
    const clean = await focusVisibility(page);
    expect(clean.visible, 'Deal is not visible before anything is planted').toBeGreaterThan(0);
    expectNotObscured(clean, 'betting, before the plant');

    // A bar exactly over the focused control, positioned from its own box, which
    // is what a badly built sticky footer would do to it.
    await page.evaluate(() => {
      const target = document.querySelector('[data-control="deal"]');
      if (target === null) {
        throw new Error('there is no Deal control on this page');
      }
      const box = target.getBoundingClientRect();
      const bar = document.createElement('div');
      bar.setAttribute('data-planted', 'true');
      bar.style.position = 'fixed';
      bar.style.left = `${String(box.left - 4)}px`;
      bar.style.top = `${String(box.top - 4)}px`;
      bar.style.width = `${String(box.width + 8)}px`;
      bar.style.height = `${String(box.height + 8)}px`;
      bar.style.background = 'black';
      bar.style.zIndex = '9999';
      document.body.append(bar);
    });

    const covered = await focusVisibility(page);
    expect(covered.key).toBe('data-control=deal');
    expect(covered.visible, 'the planted bar was not detected at all').toBe(0);
    expect(covered.coveredBy.join(' ')).toContain('div');

    // And the same measurement passes again once the plant is gone, so the
    // failure was the plant rather than something this spec did on the way in.
    await page.evaluate(() => {
      document.querySelector('[data-planted="true"]')?.remove();
    });
    expectNotObscured(await focusVisibility(page), 'betting, after the plant is removed');
  });

  test('reports a partial cover as partial, not as clear', async ({ page }) => {
    // The distinction between SC 2.4.11 and 2.4.12, constructed: a bar over half
    // the control passes the AA bar and fails the AAA one, and the measurement
    // has to be able to tell them apart or the pair of assertions above is one
    // assertion written twice.
    await atShippedBetting(page);
    await control(page, 'deal').focus();
    await page.evaluate(() => {
      const target = document.querySelector('[data-control="deal"]');
      if (target === null) {
        throw new Error('there is no Deal control on this page');
      }
      const box = target.getBoundingClientRect();
      const bar = document.createElement('div');
      bar.setAttribute('data-planted', 'true');
      bar.style.position = 'fixed';
      bar.style.left = `${String(box.left)}px`;
      bar.style.top = `${String(box.top)}px`;
      bar.style.width = `${String(box.width / 2)}px`;
      bar.style.height = `${String(box.height)}px`;
      bar.style.background = 'black';
      bar.style.zIndex = '9999';
      document.body.append(bar);
    });

    const partial = await focusVisibility(page);
    expect(partial.visible, 'a half-covered control reports nothing visible').toBeGreaterThan(0);
    expect(partial.covered, 'a half-covered control reports nothing covering it').toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The structural argument, asserted
// ---------------------------------------------------------------------------

test.describe('G10: a sticky bar can only stick where nothing scrolls under it', () => {
  for (const viewport of VIEWPORTS) {
    test(`holds the relationship at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await atShippedBetting(page);
      const metrics = await pageMetrics(page);
      const sticky = metrics.stickyBars === 'on';
      const scrolls = metrics.scrollHeight > metrics.clientHeight + 1;
      // `barsStick` sticks the bars only when the whole shell fits, so a page
      // with sticky bars does not scroll and a scrolling page has static bars.
      // Either way there is no state in which a bar travels over a control.
      expect(
        sticky && scrolls,
        `${viewport.name}: the bars stick on a page that scrolls, so one can cover a control`,
      ).toBe(false);

      const positions = await page.evaluate(() => ({
        top: getComputedStyle(document.querySelector('.bj-top') as Element).position,
        controls: getComputedStyle(document.querySelector('.bj-controls') as Element).position,
      }));
      expect(positions.top === 'sticky', `${viewport.name}: the top bar`).toBe(sticky);
      expect(positions.controls === 'sticky', `${viewport.name}: the controls row`).toBe(sticky);
    });
  }
});

// ---------------------------------------------------------------------------
// Every control, at every breakpoint
// ---------------------------------------------------------------------------

for (const viewport of VIEWPORTS) {
  test.describe(`G10: at ${viewport.name}`, () => {
    test('keeps every control on the start screen visible when focused', async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openShippedPage(page);
      await waitForPhase(page, 'start');
      await settle(page);
      const checked = await walkTabOrder(page, `${viewport.name}, start`);
      // The census is the floor: every control SPEC 10 puts on this screen is
      // in the order, so a walk that stopped early is a walk that missed one.
      expect(checked).toBeGreaterThanOrEqual(SCREEN_CONTROLS['start']?.length ?? 0);
    });

    test('keeps every control on the betting screen visible when focused', async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await atShippedBetting(page);
      await settle(page);
      const checked = await walkTabOrder(page, `${viewport.name}, betting`);
      // At the two narrow breakpoints the readout disclosure is a control too,
      // so the count is at least the screen census and can exceed it.
      expect(checked).toBeGreaterThanOrEqual(SCREEN_CONTROLS['betting']?.length ?? 0);
    });

    test('keeps every control in an open overlay visible when focused', async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await atShippedBetting(page);
      await page.locator('[data-open-overlay="settings"]').click();
      await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
      await settle(page);

      // Focus is contained inside the panel by `src/ui/input.ts`, so a walk here
      // cycles within it. The overlay is the one panel in this chrome that can
      // cover anything, and what it covers is the play surface, deliberately.
      const stops = new Set<string>();
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('Tab');
        await settle(page);
        const stop = await focusedStop(page);
        if (stop.key === 'BODY') {
          break;
        }
        stops.add(stop.key);
        expectNotObscured(await focusVisibility(page), `${viewport.name}, settings overlay`);
      }
      expect(stops.size, `${viewport.name}: the overlay walk reached nothing`).toBeGreaterThan(2);
    });
  });
}

// ---------------------------------------------------------------------------
// The one scroller with controls in it
// ---------------------------------------------------------------------------

test.describe('G10: the chip tray scrolls to a focused chip rather than clipping it', () => {
  test('keeps the last chip visible when it is tabbed to in a tray that scrolls', async ({
    page,
  }) => {
    // DESIGN section 4 gives the narrow breakpoints a horizontally scrolling
    // chip tray, which is the only scroller in this page with focusable content.
    // Tabbing to a chip past its right edge has to bring the chip into the
    // scrollport, and no engine does that by itself for a horizontal scroller.
    // 320 CSS pixels is QUALITY-BAR section 5's floor, and the text is doubled
    // because that is the case where the tray really scrolls: four chips at the
    // default size fit even the narrowest viewport, so a test that measured only
    // that would be asserting the padding on a scroller with nothing to scroll.
    // The instrument is `text-scale.spec.ts`'s, and item `G5` grades it.
    await page.setViewportSize({ width: 320, height: 568 });
    await atShippedBetting(page);
    await page.evaluate(() => {
      const root = document.documentElement;
      root.style.fontSize = `${String(Number.parseFloat(getComputedStyle(root).fontSize) * 2)}px`;
    });
    await settle(page);

    const tray = page.locator('.bj-chips');
    const scrolls = await tray.evaluate((node: Element) => node.scrollWidth > node.clientWidth + 1);
    expect(scrolls, 'the chip tray does not scroll even at 320 px with doubled text').toBe(true);

    /** How far the focused chip sits inside the tray's scrollport, per edge. */
    const insetOf = async (chip: string): Promise<{ left: number; right: number }> =>
      page.evaluate((key: string) => {
        const node = document.querySelector(`[data-chip="${key}"]`);
        const scroller = document.querySelector('.bj-chips');
        if (node === null || scroller === null) {
          throw new Error('the chip tray is not on this page');
        }
        const inner = node.getBoundingClientRect();
        const outer = scroller.getBoundingClientRect();
        return { left: inner.left - outer.left, right: outer.right - inner.right };
      }, chip);

    // The tray starts at its left edge, so the last chip is outside the
    // scrollport before anything focuses it. That is the state the criterion is
    // about, and it is asserted rather than assumed: a tray that already showed
    // every chip would make the arrival below prove nothing.
    expect((await insetOf('500')).right, 'the last chip is already inside the tray').toBeLessThan(0);

    // Reach the last chip by `Tab` from the one before it, which is a real
    // keyboard arrival.
    await page.locator('[data-chip="100"]').focus();
    await page.keyboard.press('Tab');
    const stop = await focusedStop(page);
    expect(stop.key).toBe('data-chip=500');
    await settle(page);
    expectNotObscured(await focusVisibility(page), '320 at 200 percent, chip tray');

    // And it is fully inside the scrollport. The engines do not scroll a
    // horizontal tray on a focus move by themselves, which `BJ-18` measured on
    // all three: the chip stayed exactly where it was, half outside the tray, on
    // a real `Tab` and on a scripted `focus()` alike. The focus policy in
    // `src/ui/input.ts` is what scrolls it, and this is the measurement of that.
    const arrived = await insetOf('500');
    expect(arrived.right, 'the focused chip is still outside the tray').toBeGreaterThanOrEqual(0);

    // Backwards as well: the tray is now scrolled to its end, so the first chip
    // is outside it, and Shift+Tab has to bring that one back.
    await page.locator('[data-chip="50"]').focus();
    await settle(page);
    await page.keyboard.press('Shift+Tab');
    expect((await focusedStop(page)).key).toBe('data-chip=10');
    await settle(page);
    expectNotObscured(await focusVisibility(page), '320 at 200 percent, chip tray, backwards');
    expect((await insetOf('10')).left, 'the first chip is still outside the tray').toBeGreaterThanOrEqual(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// The screens a deal reaches
// ---------------------------------------------------------------------------

test.describe('G10: the screens behind a deal', () => {
  test('keeps every action control visible when focused at the narrowest viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await control(page, 'max').click();
    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'insurance');
    await settle(page);
    await walkTabOrder(page, 'portrait, insurance');

    await control(page, 'decline-insurance').click();
    await waitForPhase(page, 'playerTurn');
    await settle(page);
    await walkTabOrder(page, 'portrait, playerTurn');

    await pressOn(page, '[data-action="stand"]', 'playerTurn');
    await waitForPhase(page, 'roundResult');
    await settle(page);
    await walkTabOrder(page, 'portrait, roundResult');
  });

  test('keeps the focus anchor visible when a phase change moves focus to it', async ({ page }) => {
    // QUALITY-BAR section 3's anchor: focus lands on the controls row when the
    // control it was on is taken away. SC 2.4.11 applies to that landing too,
    // and the row is the one focusable element in this page that is not a
    // control, so it is checked by name rather than by the walk.
    await page.setViewportSize({ width: 667, height: 420 });
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await control(page, 'max').click();
    await control(page, 'deal').focus();
    await pressOn(page, '[data-control="deal"]', 'betting');
    await expect(shell(page)).not.toHaveAttribute('data-phase', 'betting');
    await settle(page);

    const stop = await focusedStop(page);
    expect(stop.key, 'focus did not land on the anchor or a control').not.toBe('BODY');
    expectNotObscured(await focusVisibility(page), 'compact, after a phase change');
  });
});
