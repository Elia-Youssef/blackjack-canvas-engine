/**
 * Item `F4`, Minor, 9 points, **method D**. Armour, not closure.
 *
 *   "Safe-area insets are respected so no control sits beneath a notch or a home
 *    indicator."
 *
 * `F4` closes at the ACCEPTANCE section 4 demonstration session, by the capture
 * `demo/safe-area` on real hardware, and nothing in this file closes it. It
 * cannot: a notch is a property of a physical display, `env(safe-area-inset-*)`
 * is zero on every display without one, and no headless browser has one. A spec
 * that claimed otherwise would be claiming a device it does not have.
 *
 * What is here is the armour under the item, in the shape `BJ-13` established
 * for its own Demonstration items: **the mechanism is asserted, so that the
 * capture is the only thing left to do.** Three parts, and the third is the one
 * that would otherwise be taken on trust:
 *
 *   1. **The meta element**, on the shipped page. QUALITY-BAR section 5 says in
 *      as many words that without `viewport-fit=cover` every inset is `0px` and
 *      the rule is inert, so the document declaration is the precondition for
 *      everything else. The same section forbids `user-scalable=no` and a
 *      `maximum-scale` below 5, which are the two ways a viewport meta disables
 *      an accessibility mechanism, and both are asserted absent.
 *   2. **The insets reach the computed layout.** The four tokens resolve to
 *      lengths and the shell's padding is a `calc` over them, so an inset that
 *      the platform reports is added to the padding rather than declared and
 *      forgotten.
 *   3. **The layout responds to an inset, measured.** The four tokens are
 *      overridden from the test with a real value, which is the disclosed route
 *      a headless browser has to a notch it does not have, and then every
 *      control on the page is required to sit outside the band that inset
 *      describes. The control for that assertion is in the same test: with the
 *      insets at zero a control **is** inside the band, so the measurement is
 *      known to be able to fail.
 *
 * The override is a CSS custom property set on the root element, which is
 * exactly what `env()` feeds. It is not a second implementation of the rule: the
 * stylesheet reads `var(--bj-safe-bottom)` either way, and the only difference
 * between this test and a phone is where the value comes from.
 */

import { expect, test, type Page } from '@playwright/test';

import { atShippedBetting, layoutReport, settle } from './support/game';

/** A phone-shaped viewport, where both bars stick and a notch would be. */
const PHONE = { width: 390, height: 844 };

/** The inset the test injects. Larger than any padding the chrome carries. */
const INJECTED = 40;

/** The four properties `chrome.css` adds to the shell's padding. */
const SAFE_TOKENS = ['--bj-safe-top', '--bj-safe-right', '--bj-safe-bottom', '--bj-safe-left'];

/** Set or clear all four insets from the test, the disclosed route. */
async function injectInsets(page: Page, pixels: number | null): Promise<void> {
  await page.evaluate(
    ({ tokens, value }: { tokens: string[]; value: string | null }) => {
      for (const token of tokens) {
        if (value === null) {
          document.documentElement.style.removeProperty(token);
        } else {
          document.documentElement.style.setProperty(token, value);
        }
      }
    },
    { tokens: SAFE_TOKENS, value: pixels === null ? null : `${String(pixels)}px` },
  );
  await settle(page);
}

/** Every padding of the shell, in CSS pixels. */
async function shellPadding(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const shell = document.querySelector('.bj-shell');
    if (shell === null) {
      throw new Error('no shell on this page');
    }
    const style = getComputedStyle(shell);
    return {
      top: Number.parseFloat(style.paddingTop),
      right: Number.parseFloat(style.paddingRight),
      bottom: Number.parseFloat(style.paddingBottom),
      left: Number.parseFloat(style.paddingLeft),
    };
  });
}

test.describe('F4: the document declares the viewport the insets need', () => {
  test('carries viewport-fit=cover and disables no accessibility mechanism', async ({ page }) => {
    await atShippedBetting(page);
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content, 'the shipped page has no viewport meta').not.toBeNull();
    const declared = content ?? '';

    expect(declared, 'without viewport-fit=cover every inset is 0px').toContain(
      'viewport-fit=cover',
    );
    expect(declared).toContain('width=device-width');
    expect(declared).toContain('initial-scale=1');

    // The two prohibitions QUALITY-BAR section 5 states. Pinch zoom is an
    // accessibility mechanism and a viewport meta is the one place a page can
    // take it away by accident.
    expect(declared.replace(/\s/g, ''), 'the page disables pinch zoom').not.toContain(
      'user-scalable=no',
    );
    const maximum = /maximum-scale\s*=\s*([\d.]+)/.exec(declared);
    if (maximum?.[1] !== undefined) {
      expect(Number(maximum[1]), 'maximum-scale caps zoom below 5').toBeGreaterThanOrEqual(5);
    } else {
      expect(maximum, 'there is no maximum-scale at all, which is the intent').toBeNull();
    }
  });
});

test.describe('F4: the insets reach the layout, and the layout moves', () => {
  test('resolves all four tokens into the shell padding', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await atShippedBetting(page);
    await settle(page);

    const resolved = await page.evaluate((tokens: string[]) => {
      const style = getComputedStyle(document.documentElement);
      return tokens.map((token) => style.getPropertyValue(token).trim());
    }, SAFE_TOKENS);
    for (const value of resolved) {
      // On a display with no notch every one of them is zero, which is the
      // whole reason they can be added unconditionally. What matters here is
      // that they exist and resolve rather than what they resolve to.
      expect(value, 'a safe-area token is not declared').not.toBe('');
    }

    const padding = await shellPadding(page);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(padding[side], `the shell has no ${side} padding`).toBeGreaterThan(0);
    }
  });

  test('moves every control out of an injected inset, and would not without it', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await atShippedBetting(page);
    await settle(page);

    const before = await shellPadding(page);
    const zeroed = await layoutReport(page);

    // The control, first: with no inset, something really is inside the band a
    // home indicator would occupy. Without this the assertion below could pass
    // on a page whose controls were nowhere near the edges.
    const lowest = Math.max(
      ...zeroed.controls.map((entry) => entry.box.y + entry.box.height),
    );
    expect(
      lowest,
      'nothing is near the bottom edge, so the inset assertion would be vacuous',
    ).toBeGreaterThan(zeroed.inner.height - INJECTED);

    await injectInsets(page, INJECTED);

    // The padding moved by exactly the inset on all four sides: a `calc` over
    // the token, not a rule that happens to be larger.
    const after = await shellPadding(page);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(after[side], `the ${side} inset did not reach the padding`).toBeCloseTo(
        (before[side] ?? 0) + INJECTED,
        1,
      );
    }

    // And the sticky offsets moved with it: a bar that stuck to `0` would sit
    // under the indicator on the one device where the inset is not zero.
    const offsets = await page.evaluate(() => {
      const top = document.querySelector('.bj-top');
      const controls = document.querySelector('.bj-controls');
      return {
        top: top === null ? '' : getComputedStyle(top).top,
        bottom: controls === null ? '' : getComputedStyle(controls).bottom,
      };
    });
    expect(Number.parseFloat(offsets.top), 'the top bar sticks to the notch').toBeCloseTo(
      INJECTED,
      1,
    );
    expect(Number.parseFloat(offsets.bottom), 'the bottom bar sticks to the indicator').toBeCloseTo(
      INJECTED,
      1,
    );

    // The clause itself: no control inside any of the four bands.
    const report = await layoutReport(page);
    expect(report.controls.length, 'there were no controls to check').toBeGreaterThan(4);
    for (const entry of report.controls) {
      expect(entry.box.y, `${entry.key} sits under the notch`).toBeGreaterThanOrEqual(INJECTED - 1);
      expect(
        entry.box.y + entry.box.height,
        `${entry.key} sits under the home indicator`,
      ).toBeLessThanOrEqual(report.inner.height - INJECTED + 1);
      expect(entry.box.x, `${entry.key} sits in the left inset`).toBeGreaterThanOrEqual(
        INJECTED - 1,
      );
      expect(
        entry.box.x + entry.box.width,
        `${entry.key} sits in the right inset`,
      ).toBeLessThanOrEqual(report.inner.width - INJECTED + 1);
    }

    // And the page is still the page: the insets took space from the layout
    // without breaking the two clauses `F1` and `F2` own.
    expect(report.doc.scrollWidth).toBeLessThanOrEqual(report.doc.clientWidth + 1);
    for (const entry of report.controls) {
      expect(entry.hit, `${entry.key} became unreachable inside the insets`).toBe('self');
    }

    await injectInsets(page, null);
    const restored = await shellPadding(page);
    expect(restored, 'the override did not come back out').toEqual(before);
  });
});
