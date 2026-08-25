/**
 * Armour under item `D6`, Major, 8 points, method **D**.
 *
 *   "No control or gesture on the play surface collides with a browser system
 *    gesture: no pull-to-refresh, no pinch-zoom capture, no edge-swipe conflict."
 *
 * **This file does not close `D6`, and cannot.** The item is a Demonstration:
 * pull-to-refresh, pinch zoom and the back-navigation edge swipe are gestures of
 * a real mobile browser on real hardware, and the capture at the ACCEPTANCE
 * section 4 session is what closes it. `E3`, `E4`, `E5`, `E6` and `F4` all carry
 * the same treatment and say so in their own headers.
 *
 * What this file grades is the **mechanism** underneath, which is a policy of
 * absence and is therefore exactly the kind of claim that passes without being
 * checked:
 *
 * | Mechanism | Where |
 * |---|---|
 * | Nothing removes a gesture from the browser | `computes touch-action auto everywhere` |
 * | Zoom is not capped or disabled | `leaves pinch zoom uncapped in the viewport meta` |
 * | A scroll inside the game cannot chain out to a system gesture | `contains its own overscroll` |
 * | The play surface answers no gesture at all | `takes no gesture on the play surface` |
 * | Nothing suppresses a touch or a wheel | `never prevents a touch or a wheel` |
 *
 * **The resting `touch-action` is `auto`, and that is a decision rather than an
 * oversight.** QUALITY-BAR section 3 says "`touch-action` is `pinch-zoom`, not
 * `none`", and the sentence after it scopes the rule: "`none` is applied only for
 * the duration of an active pointer capture and removed on `pointerup` /
 * `pointercancel`". The whole rule is about what a **captured drag** may take
 * away from the browser, and this game captures nothing: DESIGN section 6 says
 * the coordinate transform "is only needed for hit testing on the play surface,
 * which Blackjack barely does", and there is no drag in the product to attach a
 * capture to. On a container that scrolls, and both of this page's do,
 * `pinch-zoom` would deny one-finger panning: at 200 percent the play surface is
 * deliberately larger than its box and a finger is how a low-vision player
 * reaches the rest of it, which is item `F6`'s whole point. `auto` is strictly
 * more permissive than `pinch-zoom`, so it satisfies "no pinch-zoom capture" a
 * fortiori, and the day a drag exists the test below is where the decision gets
 * made again rather than inherited.
 */

import { expect, test, type Page } from '@playwright/test';

import { splitSeed } from './support/action-seeds';
import {
  DESIGNED_SCROLLERS,
  bootGame,
  control,
  openShippedPage,
  readout,
  settle,
  shell,
  waitForPhase,
} from './support/game';

/**
 * The values of `touch-action` that take a gesture away from the browser.
 *
 * Everything except `auto` and `manipulation` removes at least one: `none`
 * removes them all, `pinch-zoom` removes panning, and the `pan-*` family removes
 * one axis of it. `manipulation` only drops the double-tap zoom delay, which is
 * not one of the three the criterion names, and is listed as permitted so that a
 * later part can take it deliberately without editing this comment.
 */
const PERMITTED_TOUCH_ACTION = new Set(['auto', 'manipulation']);

/** Every element the shipped page renders inside the shell, with its policy. */
async function gesturePolicy(
  page: Page,
): Promise<readonly { readonly key: string; readonly touchAction: string }[]> {
  return page.evaluate(() => {
    const found: { key: string; touchAction: string }[] = [];
    const nodes = [document.documentElement, document.body, ...document.querySelectorAll('.bj-shell, .bj-shell *')];
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const key =
        node.className === '' || typeof node.className !== 'string'
          ? node.tagName.toLowerCase()
          : `${node.tagName.toLowerCase()}.${node.className.split(' ')[0] ?? ''}`;
      found.push({ key, touchAction: getComputedStyle(node).touchAction });
    }
    return found;
  });
}

test.describe('D6: the page takes no gesture away from the browser', () => {
  test('computes touch-action auto everywhere in the shipped page', async ({ page }) => {
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    const policy = await gesturePolicy(page);
    expect(policy.length, 'the scan found nothing to check').toBeGreaterThan(10);
    for (const entry of policy) {
      expect(
        PERMITTED_TOUCH_ACTION.has(entry.touchAction),
        `${entry.key} computes touch-action ${entry.touchAction}, which removes a gesture`,
      ).toBe(true);
    }
  });

  test('leaves pinch zoom uncapped in the viewport meta', async ({ page }) => {
    // The other half of "no pinch-zoom capture", and the one that would deny
    // magnification across the whole page rather than over one element.
    // `index.html` also carries `viewport-fit=cover`, which item `F4` owns and
    // `tests/browser/safe-area.spec.ts` grades; what is checked here is that
    // nothing in it caps the scale.
    await openShippedPage(page);
    const content = await page.evaluate(
      () => document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
    );
    expect(content, 'the page has no viewport meta at all').not.toBe('');
    expect(content, 'the viewport meta disables user scaling').not.toMatch(/user-scalable\s*=\s*no/);
    expect(content, 'the viewport meta caps the scale').not.toMatch(/maximum-scale/);
    expect(content, 'the viewport meta caps the scale').not.toMatch(/minimum-scale/);
  });

  test('contains its own overscroll, so a pan cannot chain into a system gesture', async ({
    page,
  }) => {
    // The two containers DESIGN section 4 designates as scrollers. A pan that
    // ran past the end of either would chain to the document by default, and at
    // the top of a document that is pull-to-refresh, at the side of one it is the
    // back-navigation edge swipe.
    //
    // Measured at the betting screen at `portrait`, because that is where both
    // of them are scrollers at once: the chip tray only stops wrapping and
    // starts scrolling below 768 px, which is also the only width where a
    // horizontal pan on it is what a player would do.
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    const supported = await page.evaluate(() => CSS.supports('overscroll-behavior', 'contain'));
    const measured = await page.evaluate((selectors: readonly string[]) => {
      const found: Record<string, string> = {};
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node !== null) {
          const style = getComputedStyle(node);
          found[selector] =
            `${style.getPropertyValue('overscroll-behavior-x')}/${style.getPropertyValue('overscroll-behavior-y')}`;
        }
      }
      return found;
    }, DESIGNED_SCROLLERS);

    expect(Object.keys(measured), 'the designated scrollers are on the page').toEqual([
      ...DESIGNED_SCROLLERS,
    ]);

    // What shipped, read out of the built stylesheet rather than out of the
    // engine. This is the assertion that still means something on an engine that
    // does not implement the property: the declaration is in `dist/`, so a
    // browser that can honour it will, and an edit that removed it fails here on
    // all three engines rather than on two of them.
    const stylesheet = await page.evaluate(async () => {
      const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map(
        (node) => (node as HTMLLinkElement).href,
      );
      const texts = await Promise.all(
        hrefs.map(async (href) => {
          const response = await fetch(href);
          return response.text();
        }),
      );
      return texts.join('\n');
    });
    expect(stylesheet, 'the play-surface stage does not contain its overscroll').toMatch(
      /overscroll-behavior:\s*contain/,
    );
    expect(stylesheet, 'the chip tray does not contain its overscroll').toMatch(
      /overscroll-behavior-x:\s*contain/,
    );

    if (!supported) {
      // An engine without the property cannot chain differently on request, and
      // the declaration is still in the shipped stylesheet for the ones that
      // can. Playwright's WebKit build is the case this arm exists for.
      test.info().annotations.push({
        type: 'note',
        description: 'this engine does not implement overscroll-behavior',
      });
      return;
    }
    expect(measured['.bj-stage'], 'the play-surface stage chains its overscroll out').toContain(
      'contain',
    );
    expect(measured['.bj-chips'], 'the chip tray chains its overscroll out').toContain('contain');
  });
});

test.describe('D6: the play surface answers no gesture', () => {
  test.use({ hasTouch: true });

  test('takes no gesture on the play surface, so none can compete with the browser', async ({
    page,
  }) => {
    // The criterion is about the play surface by name. A tap on it is the
    // simplest gesture there is, and the machine has to be untouched by it: a
    // canvas that answered a tap would be a control the browser does not know
    // about, and a swipe on it would then be a gesture competing with a system
    // one.
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await settle(page);

    const before = await readout(page);
    const box = await page.locator('.bj-surface').boundingBox();
    expect(box, 'the play surface has a rendered box').not.toBeNull();
    if (box === null) {
      return;
    }
    for (const point of [0.25, 0.5, 0.75]) {
      await page.touchscreen.tap(box.x + box.width * point, box.y + box.height * point);
    }
    await settle(page);
    expect(await readout(page), 'a tap on the play surface moved the machine').toEqual(before);
    await expect(shell(page)).toHaveAttribute('data-phase', 'betting');
  });

  test('never prevents a touch or a wheel', async ({ page }) => {
    // `preventDefault` on a touch or a wheel is the other way a page takes a
    // gesture: the value stays `auto` and the event is swallowed instead. Both
    // are watched at the document, in the bubble phase, so what is read is what
    // the chrome did to the event before it arrived.
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    await page.evaluate(() => {
      const log: string[] = [];
      for (const type of ['touchstart', 'touchend', 'wheel'] as const) {
        document.addEventListener(type, (event) => {
          log.push(`${type}:${String(event.defaultPrevented)}`);
        });
      }
      window.__bjGestures = log;
    });

    const box = await page.locator('.bj-surface').boundingBox();
    if (box === null) {
      throw new Error('no play surface');
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 120);
    await settle(page);

    const log = await page.evaluate(() => window.__bjGestures ?? []);
    expect(log.length, 'no touch or wheel event reached the document at all').toBeGreaterThan(0);
    for (const entry of log) {
      expect(entry, 'the page suppressed a browser gesture').toMatch(/:false$/);
    }
  });
});

declare global {
  interface Window {
    /** Installed by this spec only. Nothing in the product writes it. */
    __bjGestures?: string[];
  }
}
