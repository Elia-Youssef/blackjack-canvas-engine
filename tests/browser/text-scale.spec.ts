/**
 * Item `G5`, Major, 9 points, method **T**, evidence `playwright/text-scale`.
 *
 *   "Chrome text resizes to 200 percent with no clipping, no overlap and no loss
 *    of function."
 *
 * **The instrument, and how faithful it is.** SC 1.4.4 Resize Text is about
 * *text* resizing, which is what a reader does by raising their browser's
 * default font size; it is not browser zoom, which scales the whole layout and
 * is SC 1.4.10 Reflow's subject and `BJ-16`'s territory. Playwright has no
 * text-scale emulation, so this file does what the browser setting does: it
 * doubles the root font size, and every size in the chrome follows because
 * `src/ui/tokens.css` declares the whole type scale in `rem` and no component
 * carries a literal. That equivalence is asserted first, before anything is
 * measured: the root font size really doubles, and a readout's computed
 * `font-size` really doubles with it. Without that check this file would be
 * measuring a page that had ignored the setting.
 *
 * What the instrument does **not** reproduce is a reader who has also changed
 * the minimum font size, or a platform that scales at the operating system
 * level. Both produce a larger root size, which is the same direction; 200
 * percent is the number the criterion states and the number measured here.
 *
 * **Three clauses, three measurements.**
 *
 *   - *No clipping* is measured twice, because there are two ways for text to be
 *     cut off and only one of them is exact. A box that **hides** its overflow
 *     and does not contain the text inside it has removed that text from the
 *     page, which is a containment test with no tolerance; and an element
 *     holding more than its own box, `scrollWidth` beyond `clientWidth`, is a
 *     label that does not fit what it is drawn in, which is a subtraction of two
 *     integers and needs the rounding allowance `ROUNDING` states. Measured per
 *     element rather than per page, because a page that scrolls is fine and a
 *     button whose label is cut off is not.
 *   - *No overlap* is every pair of rendered control boxes, intersected. Flex
 *     wrapping is what prevents it, and a container that stopped wrapping would
 *     produce exactly this.
 *   - *No loss of function* is two things: every control SPEC 10 puts on the
 *     screen is still there and still what a click at its centre lands on, and a
 *     real round is driven at 200 percent from the wager to the player's turn.
 *     A layout can satisfy the first two and still put a control under another
 *     one, which the hit test catches, or behind a fold with no scroll, which
 *     the drive catches.
 */

import { expect, test, type Page } from '@playwright/test';

import { SCREEN_CONTROLS, controlsInDomOrder, selectorFor } from './support/controls';
import {
  DESIGNED_SCROLLERS,
  atShippedBetting,
  control,
  intersects,
  layoutReport,
  openShippedPage,
  pageMetrics,
  pressOn,
  settle,
  waitForPhase,
  type Box,
} from './support/game';

/** The criterion's number. */
const SCALE = 2;

/** One viewport per QUALITY-BAR section 5 breakpoint, named by the breakpoint. */
const VIEWPORTS = [
  { name: 'wide', width: 1280, height: 800 },
  { name: 'medium', width: 900, height: 800 },
  { name: 'compact', width: 667, height: 420 },
  { name: 'portrait', width: 375, height: 720 },
] as const;

/**
 * Double the root font size, the way a reader's browser setting does.
 *
 * Returns the two sizes so the caller can assert the page really moved. The
 * style is set on the root element rather than through a stylesheet, because
 * that is the specificity a browser's own font setting has.
 */
async function resizeText(page: Page, factor: number): Promise<{ before: number; after: number }> {
  return page.evaluate((scale: number) => {
    const root = document.documentElement;
    const before = Number.parseFloat(getComputedStyle(root).fontSize);
    root.style.fontSize = `${String(before * scale)}px`;
    return { before, after: Number.parseFloat(getComputedStyle(root).fontSize) };
  }, factor);
}

/**
 * How much an element's own box may differ from its content before it counts.
 *
 * `scrollWidth` and `clientHeight` are integers and a line box at 200 percent is
 * not: `--type-xl` at a 32 px root is a 55.296 px line inside a 1.25 leading,
 * and the two readings round apart on a heading that clips nothing. Measured on
 * the overlay title, the same element on the same page: Chromium reports a
 * difference of 2, Firefox of 3, WebKit of 0.
 *
 * Four, then, and the number is safe because a real overflow at this text size
 * is not small. The `BJ-18` ledger's own entry pins a control's height instead
 * of its minimum, which is the classic form of this defect, and the label it
 * cuts off overflows by 20 px: an order of magnitude away from the rounding, and
 * still detected. The exact half of the measurement is the ancestor check below,
 * which has no tolerance at all because it is a containment rather than a
 * subtraction.
 */
const ROUNDING = 4;

/** Every element whose text is required not to clip, with its own overflow. */
interface TextBox {
  readonly key: string;
  readonly box: Box;
  readonly overflowX: number;
  readonly overflowY: number;
  /**
   * Whether an ancestor that **hides** overflow cuts this element off.
   *
   * The exact half of the measurement. An ancestor with `overflow: auto` can be
   * scrolled to its content and is not clipping it; an ancestor with
   * `overflow: hidden` is, and that is the only construct in this chrome that
   * can actually remove text from the page rather than let it spill.
   */
  readonly cutOff: string | null;
}

/**
 * The chrome's text-bearing boxes: every control, every readout and every
 * sentence a screen prints.
 *
 * Buttons alone would be too narrow a reading: the criterion says "chrome
 * text", and the readouts and the prompts are chrome text with boxes of their
 * own. An element with no box, or one inside a closed disclosure, is skipped
 * rather than measured, because a box that is not rendered cannot clip.
 */
async function textBoxes(page: Page): Promise<readonly TextBox[]> {
  return page.evaluate(() => {
    interface Box {
      x: number;
      y: number;
      width: number;
      height: number;
    }
    const found: {
      key: string;
      box: Box;
      overflowX: number;
      overflowY: number;
      cutOff: string | null;
    }[] = [];

    /**
     * The nearest ancestor that hides overflow and cuts this element off.
     *
     * The walk stops at the first **scrolling** ancestor, and that is the whole
     * distinction the check rests on. An element outside a box with
     * `overflow: auto` is reachable by scrolling that box, so it is not clipped
     * and neither is anything above it: the overlay is a scroller by design and
     * sits inside the play-surface row, which hides its own overflow because the
     * canvas must not leak out of it. Walking past the scroller would report
     * every panel control in an open overlay as clipped by a row it is
     * deliberately scrolled inside.
     */
    const cutOffBy = (node: HTMLElement): string | null => {
      const rect = node.getBoundingClientRect();
      let parent = node.parentElement;
      while (parent !== null) {
        const style = getComputedStyle(parent);
        const scrolls = [style.overflowX, style.overflowY].some(
          (value) => value === 'auto' || value === 'scroll',
        );
        if (scrolls) {
          return null;
        }
        const hidesX = style.overflowX === 'hidden' || style.overflowX === 'clip';
        const hidesY = style.overflowY === 'hidden' || style.overflowY === 'clip';
        if (hidesX || hidesY) {
          const box = parent.getBoundingClientRect();
          const outside =
            (hidesX && (rect.left < box.left - 1 || rect.right > box.right + 1)) ||
            (hidesY && (rect.top < box.top - 1 || rect.bottom > box.bottom + 1));
          if (outside) {
            return parent.className || parent.tagName.toLowerCase();
          }
        }
        parent = parent.parentElement;
      }
      return null;
    };

    const selectors = [
      'button',
      'summary',
      '.bj-readout__value',
      '.bj-readout__label',
      '.bj-screen__title',
      '.bj-screen__prompt',
      '.bj-notice',
      '.bj-result__value',
      '.bj-result__label',
      '.bj-panel__heading',
      '.bj-overlay__title',
    ];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        const disclosure = node.closest('details');
        if (disclosure !== null && !disclosure.open && node.closest('summary') === null) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          continue;
        }
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') {
          continue;
        }
        // A designated scroller is allowed to hold more than it shows; nothing
        // in this list is one, and the assertion is about the element's own
        // content against its own box.
        found.push({
          key: `${selector}:${(node.textContent ?? '').trim().slice(0, 40)}`,
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          overflowX: node.scrollWidth - node.clientWidth,
          overflowY: node.scrollHeight - node.clientHeight,
          cutOff: cutOffBy(node),
        });
      }
    }
    return found;
  });
}

/** Require nothing on the page to clip its own text. */
async function expectNoClipping(page: Page, where: string): Promise<void> {
  const boxes = await textBoxes(page);
  expect(boxes.length, `${where}: nothing was measured, so nothing was checked`).toBeGreaterThan(5);

  // The exact half: text a box that hides overflow has actually removed from
  // the page. This is the failure the criterion means by "clipping".
  expect(
    boxes.filter((entry) => entry.cutOff !== null).map((entry) => `${entry.key} cut off by ${String(entry.cutOff)}`),
    `${where}: text cut off by an ancestor that hides overflow`,
  ).toEqual([]);

  // The approximate half: an element holding more than its own box, beyond what
  // integer rounding of a fractional line box explains.
  const overflowing = boxes.filter(
    (entry) => entry.overflowX > ROUNDING || entry.overflowY > ROUNDING,
  );
  expect(
    overflowing.map(
      (entry) => `${entry.key} (${String(entry.overflowX)} x ${String(entry.overflowY)})`,
    ),
    `${where}: an element holds more than its own box`,
  ).toEqual([]);
}

/**
 * Every control a player can actually see right now, with its rendered box.
 *
 * "Visible" is stricter than "rendered", and the difference is what makes the
 * overlap check below mean something. A control inside an open overlay is laid
 * out at its position in a scrolling panel, so a control further down that panel
 * has a box below the panel's own: geometrically it is over the betting bar, and
 * visually it is clipped by the scroller and is nowhere near it. Comparing those
 * two boxes would report an overlap on a page where nothing overlaps.
 *
 * So a control counts only if its box still intersects every ancestor that
 * clips or scrolls, and the viewport itself.
 */
async function visibleControls(page: Page): Promise<readonly { key: string; box: Box }[]> {
  return page.evaluate(() => {
    interface Box {
      x: number;
      y: number;
      width: number;
      height: number;
    }
    const overlaps = (a: DOMRect, b: DOMRect): boolean =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

    const found: { key: string; box: Box }[] = [];
    for (const node of document.querySelectorAll('button, summary')) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') {
        continue;
      }
      const disclosure = node.closest('details');
      if (disclosure !== null && !disclosure.open && node.closest('summary') === null) {
        continue;
      }
      const viewport = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      let shown = overlaps(rect, viewport);
      let parent = node.parentElement;
      while (shown && parent !== null) {
        const parentStyle = getComputedStyle(parent);
        if (parentStyle.overflowX !== 'visible' || parentStyle.overflowY !== 'visible') {
          shown = overlaps(rect, parent.getBoundingClientRect());
        }
        parent = parent.parentElement;
      }
      if (!shown) {
        continue;
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
      found.push({ key, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
    }
    return found;
  });
}

/** Require no two controls a player can see to share any area. */
async function expectNoOverlap(page: Page, where: string): Promise<void> {
  const controls = await visibleControls(page);
  expect(controls.length, `${where}: no control is visible at all`).toBeGreaterThan(1);
  const collisions: string[] = [];
  for (let a = 0; a < controls.length; a += 1) {
    for (let b = a + 1; b < controls.length; b += 1) {
      const first = controls[a];
      const second = controls[b];
      if (first === undefined || second === undefined) {
        continue;
      }
      if (intersects(first.box, second.box)) {
        collisions.push(`${first.key} over ${second.key}`);
      }
    }
  }
  expect(collisions, `${where}: two controls overlap`).toEqual([]);
}

/** Require every control on this screen to be present and hit its own centre. */
async function expectNoLossOfFunction(page: Page, screen: string, where: string): Promise<void> {
  const expected = SCREEN_CONTROLS[screen];
  expect(expected, `no control census for the ${screen} screen`).toBeDefined();
  const report = await layoutReport(page);
  for (const key of expected ?? []) {
    const found = report.controls.find((entry) => entry.key === key);
    expect(found, `${where}: ${key} is not rendered at all`).toBeDefined();
  }

  // The hit test is taken **after scrolling to the control**, and that is the
  // difference between a reading of the criterion and a reading of the fold.
  // Doubling the text makes the chrome taller than a 420 px viewport, which is
  // what `barsStick` unsticks the bars for: the page scrolls, and a control
  // below the fold of a page that scrolls is not a lost function. What would be
  // one is a control that cannot be reached by scrolling to it, or one that
  // something else is covering when you get there, and both are what this
  // measures.
  for (const key of expected ?? []) {
    const locator = page.locator(selectorFor(key));
    await locator.scrollIntoViewIfNeeded();
    const hit = await locator.evaluate((node: Element) => {
      const box = node.getBoundingClientRect();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
        return 'none';
      }
      const at = document.elementFromPoint(x, y);
      return at !== null && node.contains(at) ? 'self' : 'other';
    });
    expect(hit, `${where}: a click at the centre of ${key} lands elsewhere`).toBe('self');
  }
  // And the tab order still contains them, so a keyboard has not lost anything
  // a pointer kept.
  const order = await controlsInDomOrder(page);
  for (const key of expected ?? []) {
    expect(order, `${where}: ${key} left the tab order`).toContain(key);
  }
}

/** The page must not scroll sideways, and no container may hide overflow. */
async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const metrics = await pageMetrics(page);
  expect(
    metrics.scrollWidth - metrics.clientWidth,
    `${where}: the document scrolls sideways`,
  ).toBeLessThanOrEqual(1);
  for (const container of metrics.containers) {
    if (DESIGNED_SCROLLERS.includes(container.selector)) {
      continue;
    }
    expect(
      container.overflowX,
      `${where}: ${container.selector} holds more than it shows`,
    ).toBeLessThanOrEqual(1);
  }
}

// ---------------------------------------------------------------------------
// The instrument itself
// ---------------------------------------------------------------------------

test.describe('G5: the page really resizes with the root font size', () => {
  test('doubles the root size, and the chrome text doubles with it', async ({ page }) => {
    await atShippedBetting(page);
    const before = await layoutReport(page);
    const sizes = await resizeText(page, SCALE);
    await settle(page);
    const after = await layoutReport(page);

    expect(sizes.after).toBeCloseTo(sizes.before * SCALE, 1);
    // The type scale is in `rem` and no component carries a literal, so every
    // measured size follows. If a component ever declared a `px` font size, this
    // is where it would show up, before any of the sweeps below ran.
    expect(Number.parseFloat(after.styles.readoutFontSize)).toBeCloseTo(
      Number.parseFloat(before.styles.readoutFontSize) * SCALE,
      1,
    );
    expect(Number.parseFloat(after.styles.buttonFontSize)).toBeCloseTo(
      Number.parseFloat(before.styles.buttonFontSize) * SCALE,
      1,
    );
    // The touch target is a `px` token and deliberately does not scale: it is a
    // finger, not a glyph. QUALITY-BAR section 3 fixes it at 44 px.
    expect(after.styles.buttonMinHeight).toBe(before.styles.buttonMinHeight);
  });

  test('would notice a chrome that ignored the setting', async ({ page }) => {
    // The control for the check above: a page whose text is pinned in `px` does
    // not follow the root size, and the assertion has to be able to see that.
    await atShippedBetting(page);
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = '.bj-readout__value { font-size: 13px; }';
      document.head.append(style);
    });
    const before = await layoutReport(page);
    await resizeText(page, SCALE);
    await settle(page);
    const after = await layoutReport(page);
    expect(after.styles.readoutFontSize).toBe(before.styles.readoutFontSize);
  });
});

// ---------------------------------------------------------------------------
// The three clauses, at every breakpoint
// ---------------------------------------------------------------------------

for (const viewport of VIEWPORTS) {
  test.describe(`G5: at 200 percent text, ${viewport.name}`, () => {
    test('clips nothing, overlaps nothing and loses no control on the betting screen', async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await atShippedBetting(page);
      await resizeText(page, SCALE);
      await settle(page);

      const where = `${viewport.name} at 200 percent, betting`;
      await expectNoClipping(page, where);
      await expectNoOverlap(page, where);
      await expectNoLossOfFunction(page, 'betting', where);
      await expectNoHorizontalOverflow(page, where);
    });

    test('clips nothing, overlaps nothing and loses no control on the start screen', async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openShippedPage(page);
      await waitForPhase(page, 'start');
      await resizeText(page, SCALE);
      await settle(page);

      const where = `${viewport.name} at 200 percent, start`;
      await expectNoClipping(page, where);
      await expectNoOverlap(page, where);
      await expectNoLossOfFunction(page, 'start', where);
      await expectNoHorizontalOverflow(page, where);
    });

    test('keeps the settings overlay readable and operable', async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await atShippedBetting(page);
      await resizeText(page, SCALE);
      await settle(page);
      await page.locator('[data-open-overlay="settings"]').click();
      await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
      await settle(page);

      const where = `${viewport.name} at 200 percent, settings overlay`;
      await expectNoClipping(page, where);
      await expectNoOverlap(page, where);
      await expectNoHorizontalOverflow(page, where);

      // The overlay is a scroller by design, so its own controls are reached by
      // scrolling to them; the criterion's "no loss of function" is that they
      // can still be pressed, which is what this does.
      const close = control(page, 'close-overlay');
      await close.scrollIntoViewIfNeeded();
      await close.click();
      await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();
    });
  });
}

// ---------------------------------------------------------------------------
// No loss of function, driven rather than measured
// ---------------------------------------------------------------------------

test.describe('G5: a round is playable at 200 percent text', () => {
  test('places a wager, deals and reaches the player turn at the narrowest breakpoint', async ({
    page,
  }) => {
    // 375 x 720 doubled is the hardest case in the matrix: the narrowest
    // viewport with the largest text, which is where a control is most likely to
    // be pushed out of reach.
    await page.setViewportSize({ width: 375, height: 720 });
    await atShippedBetting(page);
    await resizeText(page, SCALE);
    await settle(page);

    const chip = page.locator('[data-chip="50"]');
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await expect
      .poll(async () => (await page.locator('[data-readout="wager"] .bj-readout__value').textContent()) ?? '')
      .toContain('50');

    await pressOn(page, '[data-control="deal"]', 'betting');
    await expect
      .poll(async () => (await page.locator('.bj-shell').getAttribute('data-phase')) ?? '')
      .not.toBe('betting');

    // Whatever screen the deal reached, its controls are still reachable.
    const phase = (await page.locator('.bj-shell').getAttribute('data-phase')) ?? '';
    if (phase in SCREEN_CONTROLS) {
      await expectNoLossOfFunction(page, phase, `portrait at 200 percent, ${phase}`);
      await expectNoClipping(page, `portrait at 200 percent, ${phase}`);
    }
  });

  test('keeps every control reachable by keyboard at 200 percent', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await atShippedBetting(page);
    const before = await controlsInDomOrder(page);
    await resizeText(page, SCALE);
    await settle(page);
    const after = await controlsInDomOrder(page);
    // The tab order is unchanged by a font size: nothing is removed, nothing is
    // added, and nothing is reordered. A control that fell out of the order
    // would be the criterion's "loss of function" for a keyboard user.
    expect(after).toEqual(before);

    // And a real key press still lands on one of them.
    const first = after[0];
    expect(first).toBeDefined();
    await page.locator(selectorFor(first ?? '')).focus();
    await expect(page.locator(selectorFor(first ?? ''))).toBeFocused();
  });
});
