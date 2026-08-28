/**
 * Item `A5`, severity Major, 9 points. `BJ-21`.
 *
 *   "An unsupported browser receives a styled, accessible notice. Never a blank
 *    canvas and never an uncaught error."
 *
 * QUALITY-BAR section 2's third tier, over the built `dist/` with nothing
 * injected into the page.
 *
 * **The platform is broken before the bundle runs, and broken for real.** Each
 * test below installs an init script that takes one capability away, exactly as
 * a browser without it would present, and then loads the shipped page. Nothing
 * in `src/` knows this spec exists and no option is passed to anything: what is
 * being graded is what the entry point does on a platform it cannot use.
 *
 * **Three clauses, and the third is why the order matters.** "Never an uncaught
 * error" is not a property of the notice, it is a property of when the notice is
 * decided: a feature test that ran after the composition root had already asked
 * for a drawing context would produce a stack trace and then a panel. Every test
 * here therefore asserts three things together: the notice is up, the game did
 * not start, and neither the browser nor the error boundary reported anything.
 * The `media-query-events` case is the sharpest of the three, because a boot
 * that went ahead on that platform would throw inside `createMotionPreference`
 * and land on item `M4`'s recovery panel; asserting that panel's absence is what
 * proves the test ran first.
 *
 * **The ES2020-module tier is the fourth test.** It cannot be produced in any
 * engine Playwright drives, since all three run modules, so what is graded is
 * the mechanism: the built page carries a `nomodule` script, the file it names
 * is served, and running that file's own bytes on a page produces the same
 * notice with its own reason. That is the whole of what a browser with no module
 * support would do with it.
 */

import { expect, test, type Page } from '@playwright/test';

/** The notice, by the attribute `index.html` puts on the template's root. */
const NOTICE = '[data-notice="unsupported"]';

/** Item `M4`'s panel. Its absence is what proves the feature test ran first. */
const PANEL = '[data-recovery="panel"]';

/** Watch for anything the browser reports as uncaught, for the third clause. */
function watchForErrors(page: Page): string[] {
  const uncaught: string[] = [];
  page.on('pageerror', (error) => {
    uncaught.push(error.message);
  });
  return uncaught;
}

/** What the notice says about itself, read in one pass. */
async function noticeReport(page: Page): Promise<{
  readonly missing: string;
  readonly role: string;
  readonly focused: boolean;
  readonly name: string;
  readonly message: string;
  readonly canvases: number;
  readonly shells: number;
  readonly headings: number;
  readonly background: string;
  readonly borderWidth: number;
  readonly borderColour: string;
  readonly colour: string;
  readonly padding: number;
  readonly titleSize: number;
  readonly bodySize: number;
}> {
  return page.evaluate((selector) => {
    const node = document.querySelector(selector);
    const style = node === null ? null : getComputedStyle(node);
    const title = node?.querySelector('h1') ?? null;
    const body = node?.querySelector('p') ?? null;
    return {
      missing: node?.getAttribute('data-unsupported-missing') ?? '',
      role: node?.getAttribute('role') ?? '',
      focused: document.activeElement === node,
      name: title?.textContent?.trim() ?? '',
      message: body?.textContent?.trim() ?? '',
      canvases: document.querySelectorAll('canvas').length,
      shells: document.querySelectorAll('.bj-shell').length,
      headings: document.querySelectorAll('h1').length,
      // The criterion's first word, read off the rendered element rather than
      // off the stylesheet. `error-boundary.spec.ts` measures the recovery
      // panel the same way and for the same reason: a notice whose rules were
      // renamed, deleted or never matched still carries its text, its role and
      // its focus, so every other assertion in this file passes over an
      // unstyled paragraph on a bare page.
      background: style?.backgroundColor ?? '',
      borderWidth: Number.parseFloat(style?.borderTopWidth ?? '0'),
      borderColour: style?.borderTopColor ?? '',
      colour: style?.color ?? '',
      padding: Number.parseFloat(style?.paddingTop ?? '0'),
      titleSize: title === null ? 0 : Number.parseFloat(getComputedStyle(title).fontSize),
      bodySize: body === null ? 0 : Number.parseFloat(getComputedStyle(body).fontSize),
    };
  }, NOTICE);
}

/** Transparent, as a computed background reports it on every engine. */
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/** Load the shipped page with one capability taken away, and read the result. */
async function expectNotice(page: Page, missing: string): Promise<void> {
  const uncaught = watchForErrors(page);
  await page.goto('/');
  await expect(page.locator(NOTICE)).toBeVisible();

  const report = await noticeReport(page);
  expect(report.missing, 'the notice does not say what was missing').toBe(missing);
  expect(report.role, 'the notice is not announced').toBe('alert');
  expect(report.name, 'the notice has no heading').not.toBe('');
  expect(report.message, 'the notice says nothing').not.toBe('');
  expect(report.headings, 'the notice page has more or fewer than one h1').toBe(1);
  expect(report.focused, 'focus did not move to the notice').toBe(true);

  // **Styled**, which is the criterion's first word and was the clause with no
  // evidence until the review found it: the reviewer renamed every selector in
  // `src/ui/chrome.css` and this file stayed green, because text on a bare page
  // is still text. The panel is a box, so what is asserted is that it has one:
  // a background that is not the page's, an edge with a positive width, and a
  // heading larger than its body text. All four are read off the rendered
  // element, so a rule that stopped matching fails here.
  expect(report.background, 'the notice has no background of its own').not.toBe(TRANSPARENT);
  expect(report.borderWidth, 'the notice has no border').toBeGreaterThan(0);
  expect(report.borderColour, 'the notice border is invisible').not.toBe(TRANSPARENT);
  expect(report.padding, 'the notice text runs into its own edge').toBeGreaterThan(0);
  expect(report.colour, 'the notice text is the same colour as its background').not.toBe(
    report.background,
  );
  expect(report.titleSize, 'the notice heading is not larger than its body').toBeGreaterThan(
    report.bodySize,
  );

  // "Never a blank canvas": the game did not start, so there is no canvas and
  // no shell on the page at all, rather than an empty one behind the notice.
  expect(report.canvases, 'a canvas was built on a platform that cannot draw').toBe(0);
  expect(report.shells).toBe(0);

  // "Never an uncaught error": nothing reached the browser, and the error
  // boundary did not fire either, which is what puts the feature test first.
  await expect(page.locator(PANEL)).toHaveCount(0);
  expect(uncaught, 'the platform threw before the notice was decided').toEqual([]);
}

test.describe('A5: a browser without what the game needs', () => {
  test('gets the notice when there is no 2D drawing context', async ({ page }) => {
    await page.addInitScript(() => {
      // The shape a platform that refuses the context presents: the element
      // exists and answers with nothing. `src/render/surface.ts` would throw on
      // the next line if the boot reached it.
      HTMLCanvasElement.prototype.getContext = (): null => null;
    });
    await expectNotice(page, 'canvas-2d');
  });

  test('gets the notice when getContext throws instead of answering', async ({ page }) => {
    await page.addInitScript(() => {
      // The other shape, which some privacy configurations present: the call
      // raises rather than returning null. Both are one answer to the probe.
      HTMLCanvasElement.prototype.getContext = (): null => {
        throw new Error('this platform does not allow canvas');
      };
    });
    await expectNotice(page, 'canvas-2d');
  });

  test('gets the notice when a media query cannot be listened to', async ({ page }) => {
    await page.addInitScript(() => {
      // QUALITY-BAR section 2's own third gate, in the shape a browser that has
      // `matchMedia` and only the legacy listener interface presents. A boot on
      // this platform reaches `query.addEventListener` inside
      // `createMotionPreference` and throws, so the recovery panel this test
      // requires to be absent is what would be on screen instead.
      window.matchMedia = (query: string): MediaQueryList =>
        ({ matches: false, media: query }) as MediaQueryList;
    });
    await expectNotice(page, 'media-query-events');
  });

  test('gets the notice when there is no frame clock', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>)['requestAnimationFrame'];
    });
    await expectNotice(page, 'animation-frames');
  });

  test('reports every missing capability, not the first one', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = (): null => null;
      delete (window as unknown as Record<string, unknown>)['requestAnimationFrame'];
    });
    await expectNotice(page, 'canvas-2d animation-frames');
  });
});

test.describe('A5: a browser that has everything', () => {
  test('starts the game and never shows the notice', async ({ page }) => {
    // The control. Without it, every assertion above is satisfied by a page
    // that shows the notice unconditionally.
    const uncaught = watchForErrors(page);
    await page.goto('/');
    await expect(page.locator('.bj-shell')).toBeVisible();
    await expect(page.locator(NOTICE)).toHaveCount(0);
    await expect(page.locator(PANEL)).toHaveCount(0);
    expect(await page.locator('canvas').count()).toBeGreaterThan(0);
    expect(uncaught).toEqual([]);

    // And the notice is present as an inert template rather than as a hidden
    // element, which is what keeps item `G6`'s single `h1` single while the
    // game is running.
    const template = await page.evaluate(() => {
      const node = document.querySelector('template[data-unsupported]');
      return {
        found: node instanceof HTMLTemplateElement,
        headings: document.querySelectorAll('h1').length,
        insideTemplate:
          node instanceof HTMLTemplateElement
            ? node.content.querySelectorAll('h1').length
            : 0,
      };
    });
    expect(template.found, 'the page carries no notice template').toBe(true);
    expect(template.headings, 'the running game has more or fewer than one h1').toBe(1);
    expect(template.insideTemplate, 'the template carries no heading of its own').toBe(1);
  });
});

test.describe('A5: the browser that cannot run a module at all', () => {
  test('carries a nomodule script, and that script shows the notice', async ({ page }) => {
    await page.goto('/');
    const tag = await page.evaluate(() => {
      const node = document.querySelector('script[nomodule]');
      return node === null ? null : node.getAttribute('src');
    });
    expect(tag, 'the built page carries no nomodule fallback').toBe('./unsupported.js');

    // The file is served, and it is the file the tag names. Running its own
    // bytes is the whole of what a browser with no module support does with it:
    // such a browser never runs the bundle, so the game is not disturbed here
    // either, and the notice arrives beside a game that is already running.
    const response = await page.request.get('./unsupported.js');
    expect(response.status()).toBe(200);
    await expect(page.locator(NOTICE)).toHaveCount(0);

    // Injected by URL rather than as inline text, because the shipped page's
    // Content Security Policy allows a same-origin script and no inline one.
    await page.addScriptTag({ url: './unsupported.js' });
    await expect(page.locator(NOTICE)).toBeVisible();
    const report = await noticeReport(page);
    expect(report.missing).toBe('es-modules');
    expect(report.role).toBe('alert');
    expect(report.name).not.toBe('');
  });
});
