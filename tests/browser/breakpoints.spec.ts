/**
 * Item `F1`, Critical, 19 points, over the built `dist/`.
 *
 *   "All four breakpoints render with no clipping, no overlap and no unreachable
 *    control."
 *
 * Three clauses, at seven viewports covering all four breakpoints, in both
 * states of the narrow bar's disclosure, on three of SPEC 10's screens plus the
 * start screen and the insurance offer. None of it is a screenshot.
 *
 *   1. **No clipping.** Four forms, because content is cut off four ways. No
 *      region's content is wider than the region, with the two containers that
 *      scroll **by design**, the chip tray and the play-surface stage, named and
 *      excluded rather than quietly passing; no control's own label overflows its
 *      box; the play-surface row is never smaller than the surface's own minimum
 *      height; and **at 100 percent the stage does not scroll on either axis**,
 *      which is the direct encoding of `planSurface`'s first property and the
 *      assertion the `BJ-16` review named as the one that would have caught a
 *      canvas clipped away entirely by a row squeezed to zero.
 *   2. **No overlap.** The three regions are required to stack in DESIGN section
 *      4's order wherever the bars stick; every visible control is required to be
 *      disjoint from every other one; and no bar may cover one of SPEC 11's
 *      readouts, which is the form that still means something while a sticky bar
 *      is floating.
 *   3. **No unreachable control.** Every control SPEC 10 puts on the current
 *      screen is required to be **present**, not merely visible, because a
 *      removed control is invisible to a sweep of what is on screen: the review
 *      hid `double` at portrait and every test in this file passed. Then each of
 *      them must be clickable at its own centre, where `elementFromPoint` is the
 *      engine's own hit testing rather than arithmetic this file would have to
 *      get right. Where the page scrolls, reachability is checked **by page
 *      scrolling alone**: the helper below moves `window.scrollY` and nothing
 *      else, so a control that could only be reached inside an inner scroller
 *      with no affordance fails, which is the second defect the review measured.
 *
 * **The two layout modes, and the invariant between them.** `barsStick` answers
 * true only when the two bars and the play surface's minimum all fit the
 * viewport, so the page has two shapes and each carries a different form of the
 * clauses:
 *
 *   - **sticky**: the shell has a definite height, the rows fit inside it, and
 *     the page must not scroll in either axis. Every control is fully on screen.
 *   - **static**: the content is taller than the viewport, the bars scroll with
 *     the document and the page scrolls vertically. Every control must be
 *     reachable by scrolling the page, and the page still must not scroll
 *     sideways.
 *
 * Both are asserted as an implication of what the page reports, and the two
 * viewports the review measured its defects at, 320 x 568 and 320 x 480, are
 * additionally required to be in the static mode: sticking there is the defect.
 *
 * **Routes.** The betting and start passes are the shipped page driven through
 * its own controls with nothing injected. The player's turn, the insurance offer
 * and the round result need deals that reach them rather than settling early, so
 * those take the seeded harness route `BJ-15` landed, for the reason that file's
 * header gives.
 */

import { expect, test, type Page } from '@playwright/test';

import { MIN_SURFACE_HEIGHT, resolveBreakpoint } from '../../src/ui/breakpoints';
// The control census moved to `support/controls.ts` at `BJ-17`, unchanged: item
// `D2` grades the same list against a different question, and two copies of it
// is how one of them quietly stops being complete.
import { SCREEN_CONTROLS, selectorFor } from './support/controls';
import {
  atBetting,
  atShippedBetting,
  bootGame,
  chip,
  control,
  controlNamed,
  intersects,
  layoutReport,
  settle,
  waitForPhase,
  type Box,
  type LayoutReport,
} from './support/game';
import { peekSeed } from './support/peek-seeds';

const SEED = 53;
const WAGER = 50;

/**
 * Seven viewports, covering all four breakpoints and both layout modes.
 *
 * The three under 600 px of height at a narrow width are the band the review
 * measured its two defects in, 320 x 568 and 320 x 480 by name; 720 x 420 is the
 * same squeeze in landscape. The other four have room, so between them the file
 * asserts both modes at every breakpoint that can reach them.
 *
 * `sticky` pins the mode only where it is the same on every screen. The two
 * viewports the review named are static whatever is on screen, because the top
 * bar alone leaves no room at 320 px of width; 720 x 420 sits on the boundary and
 * moves with the screen, since the five action buttons are one row and the
 * betting bar is two, so its mode is left to the invariant rather than pinned to
 * a number that would be right for one screen and wrong for the next.
 */
const VIEWPORTS = [
  { label: 'wide 1280x800', breakpoint: 'wide', width: 1280, height: 800, sticky: null },
  { label: 'medium 900x700', breakpoint: 'medium', width: 900, height: 700, sticky: null },
  { label: 'compact 720x600', breakpoint: 'compact', width: 720, height: 600, sticky: null },
  { label: 'compact 720x420', breakpoint: 'compact', width: 720, height: 420, sticky: null },
  { label: 'portrait 390x844', breakpoint: 'portrait', width: 390, height: 844, sticky: null },
  { label: 'portrait 320x568', breakpoint: 'portrait', width: 320, height: 568, sticky: false },
  { label: 'portrait 320x480', breakpoint: 'portrait', width: 320, height: 480, sticky: false },
] as const;

/** The containers that scroll on purpose. Everything else must not. */
const DESIGNED_SCROLLERS = new Set(['.bj-chips', '.bj-stage']);

/** WCAG 2.2 section 3's minimum target, which `--target-min` carries. */
const TARGET_MIN = 44;

function bottom(box: Box): number {
  return box.y + box.height;
}

function right(box: Box): number {
  return box.x + box.width;
}

/**
 * Whether a control can be reached **by scrolling the page and nothing else**.
 *
 * `window.scrollTo` only, never `scrollIntoView`: the latter scrolls every
 * scrollable ancestor, which would report a control buried in an inner scroller
 * as reachable. That is the exact defect the review measured, so the instrument
 * has to be unable to find it.
 */
async function reachableByPageScroll(page: Page, selector: string): Promise<string> {
  return page.evaluate((wanted: string) => {
    const node = document.querySelector(wanted);
    if (node === null) {
      return 'absent';
    }
    const first = node.getBoundingClientRect();
    const wantedY = first.y + window.scrollY + first.height / 2 - window.innerHeight / 2;
    window.scrollTo(0, Math.max(0, wantedY));
    const box = node.getBoundingClientRect();
    const centreX = box.x + box.width / 2;
    const centreY = box.y + box.height / 2;
    const inside =
      centreX >= 0 && centreY >= 0 && centreX <= window.innerWidth && centreY <= window.innerHeight;
    if (!inside) {
      return 'off-screen';
    }
    const hit = document.elementFromPoint(centreX, centreY);
    return hit !== null && node.contains(hit) ? 'self' : 'covered';
  }, selector);
}

async function scrollToTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await settle(page);
}

/** Clause 1, on the regions, on every label, and on the play-surface row. */
function assertNothingClipped(report: LayoutReport, label: string): void {
  for (const [selector, metrics] of Object.entries(report.scrollers)) {
    if (DESIGNED_SCROLLERS.has(selector)) {
      continue;
    }
    expect(metrics.scrollWidth, `${label}: ${selector} is wider than its box`).toBeLessThanOrEqual(
      metrics.clientWidth + 1,
    );
  }
  for (const entry of report.controls) {
    expect(entry.textClipped, `${label}: ${entry.key} has a clipped label`).toBe(false);
  }

  // The play-surface row is never squeezed below the surface's own minimum, so
  // `planSurface` is never handed a box it cannot fit. The review measured a row
  // of zero at 320 x 420 and a canvas clipped away whole.
  const body = report.regions.body;
  expect(body, `${label}: no play-surface row`).not.toBeNull();
  expect(body?.height ?? 0, `${label}: the play-surface row was squeezed`).toBeGreaterThanOrEqual(
    MIN_SURFACE_HEIGHT - 1,
  );

  // And the surface fits the row it is in, on both axes, at 100 percent. This is
  // `planSurface`'s first property read straight off the page: a stage that
  // scrolls at the default setting means the plan asked for more than its box.
  const stage = report.scrollers['.bj-stage'];
  expect(stage, `${label}: no stage`).toBeDefined();
  expect(report.surfaceSize, `${label}: this reading only holds at 100 percent`).toBe('100');
  expect(
    stage?.scrollWidth ?? 0,
    `${label}: the stage scrolls sideways at 100 percent`,
  ).toBeLessThanOrEqual((stage?.clientWidth ?? 0) + 1);
  expect(
    stage?.scrollHeight ?? 0,
    `${label}: the stage scrolls down at 100 percent`,
  ).toBeLessThanOrEqual((stage?.clientHeight ?? 0) + 1);
}

/**
 * Clause 2, on the three regions: they stack in DESIGN section 4's order.
 *
 * Only where the bars stick, which is now also the only place the page does not
 * scroll: a sticky bottom bar floats over the row above it the moment the page
 * is taller than the viewport, and that is what sticky is for.
 */
function assertRegionsStack(report: LayoutReport, label: string): void {
  const top = report.regions.top;
  const body = report.regions.body;
  const controls = report.regions.controls;
  expect(top, `${label}: no top bar`).not.toBeNull();
  expect(body, `${label}: no play-surface row`).not.toBeNull();
  expect(controls, `${label}: no controls row`).not.toBeNull();
  if (top === null || body === null || controls === null) {
    return;
  }
  expect(bottom(top), `${label}: the top bar overlaps the play surface`).toBeLessThanOrEqual(
    body.y + 1,
  );
  expect(bottom(body), `${label}: the play surface overlaps the controls`).toBeLessThanOrEqual(
    controls.y + 1,
  );
}

/** Clause 2, on every pair of controls, and on the readouts a bar could cover. */
function assertNoOverlap(report: LayoutReport, label: string): void {
  const controls = report.regions.controls;
  for (const readout of report.readouts) {
    if (!readout.visible || controls === null) {
      continue;
    }
    expect(
      intersects(readout.box, controls),
      `${label}: the controls row covers the ${readout.key} readout`,
    ).toBe(false);
  }

  for (let i = 0; i < report.controls.length; i += 1) {
    for (let j = i + 1; j < report.controls.length; j += 1) {
      const a = report.controls[i];
      const b = report.controls[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      expect(intersects(a.box, b.box), `${label}: ${a.key} overlaps ${b.key}`).toBe(false);
    }
  }
}

/** Clause 3, on every control that is on screen right now. */
function assertVisibleControlsUsable(report: LayoutReport, label: string): void {
  for (const entry of report.controls) {
    if (entry.box.y < 0 || bottom(entry.box) > report.inner.height) {
      // Below or above the fold on a scrolling page. The required-control sweep
      // reaches those by scrolling the page; what is on screen must work.
      continue;
    }
    expect(entry.hit, `${label}: ${entry.key} is not clickable at its own centre`).toBe('self');
    expect(entry.box.x, `${label}: ${entry.key} starts left of the viewport`).toBeGreaterThanOrEqual(
      -1,
    );
    expect(right(entry.box), `${label}: ${entry.key} runs past the right edge`).toBeLessThanOrEqual(
      report.inner.width + 1,
    );
    if (entry.tag === 'button') {
      expect(
        entry.box.height,
        `${label}: ${entry.key} is below the touch target`,
      ).toBeGreaterThanOrEqual(TARGET_MIN - 1);
      expect(
        entry.box.width,
        `${label}: ${entry.key} is below the touch target`,
      ).toBeGreaterThanOrEqual(TARGET_MIN - 1);
    }
  }
}

/** Clause 3, on every control SPEC 10 puts on this screen. Presence first. */
async function assertScreenControlsReachable(
  page: Page,
  report: LayoutReport,
  label: string,
): Promise<void> {
  const required = SCREEN_CONTROLS[report.phase];
  expect(required, `${label}: no control list for the ${report.phase} screen`).toBeDefined();
  for (const key of required ?? []) {
    const selector = selectorFor(key);
    const present = await page.locator(selector).count();
    expect(present, `${label}: ${key} is not in the page at all`).toBeGreaterThan(0);
    if (report.stickyBars === 'on') {
      // The page does not scroll here, so the control has to be on screen.
      const found = controlNamed(report, key);
      expect(found, `${label}: ${key} is not rendered`).toBeDefined();
      expect(found?.hit, `${label}: ${key} is unreachable`).toBe('self');
    } else {
      expect(await reachableByPageScroll(page, selector), `${label}: ${key}`).toBe('self');
    }
  }
  await scrollToTop(page);
}

/**
 * The whole of item `F1` at one viewport, in whichever mode the page resolved.
 *
 * The mode is read rather than assumed, and the implication is asserted both
 * ways: sticky means the page does not scroll at all, static means it scrolls
 * vertically and never sideways.
 */
async function assertLayout(
  page: Page,
  label: string,
  breakpoint: string,
  expectSticky: boolean | null,
): Promise<LayoutReport> {
  await scrollToTop(page);
  const report = await layoutReport(page);

  expect(report.breakpoint, `${label}: the page resolved the wrong breakpoint`).toBe(breakpoint);
  expect(resolveBreakpoint(report.inner), `${label}: the rule disagrees with the page`).toBe(
    breakpoint,
  );
  if (expectSticky !== null) {
    expect(report.stickyBars, `${label}: the wrong layout mode`).toBe(expectSticky ? 'on' : 'off');
  }

  expect(
    report.doc.scrollWidth,
    `${label}: the page scrolls horizontally`,
  ).toBeLessThanOrEqual(report.doc.clientWidth + 1);

  if (report.stickyBars === 'on') {
    expect(
      report.doc.scrollHeight,
      `${label}: the bars stick on a page that scrolls`,
    ).toBeLessThanOrEqual(report.doc.clientHeight + 1);
    assertRegionsStack(report, label);
  }

  assertNothingClipped(report, label);
  assertNoOverlap(report, label);
  assertVisibleControlsUsable(report, label);
  await assertScreenControlsReachable(page, report, label);
  return report;
}

/** Open or close the narrow bar's disclosure, where it has one. */
async function setDisclosure(page: Page, open: boolean): Promise<boolean> {
  const summary = page.locator('[data-control="more-readouts"]');
  if (!(await summary.isVisible())) {
    return false;
  }
  const state = await page.evaluate(
    () => document.querySelector('.bj-readouts__more')?.hasAttribute('open') ?? false,
  );
  if (state !== open) {
    await summary.click();
    await settle(page);
  }
  return true;
}

/** Run the whole assertion set in both disclosure states, where there are two. */
async function assertBothDisclosureStates(
  page: Page,
  label: string,
  breakpoint: string,
  expectSticky: boolean | null,
): Promise<void> {
  await assertLayout(page, `${label} disclosure closed`, breakpoint, expectSticky);
  if (await setDisclosure(page, true)) {
    // The open state is the one the review found the squeeze in: eleven more
    // readouts on a 320 px bar is the tallest the top row ever gets.
    await assertLayout(page, `${label} disclosure open`, breakpoint, expectSticky);
    await setDisclosure(page, false);
  }
}

async function dealToPlayerTurn(page: Page): Promise<void> {
  await chip(page, WAGER).click();
  await control(page, 'deal').click();
  await waitForPhase(page, 'playerTurn');
  await settle(page);
}

for (const viewport of VIEWPORTS) {
  test.describe(`F1: ${viewport.label}`, () => {
    test('lays the betting screen out, in both disclosure states', async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await atShippedBetting(page);
      await settle(page);
      await assertBothDisclosureStates(page, 'betting', viewport.breakpoint, viewport.sticky);
    });

    test("lays the player's turn out, with all five actions present", async ({ page }) => {
      // The phase the `BJ-14` review measured its defect in, and the screen the
      // `BJ-16` review proved the control list was blind on.
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await atBetting(page, { seed: SEED });
      await dealToPlayerTurn(page);
      await assertBothDisclosureStates(page, 'playerTurn', viewport.breakpoint, viewport.sticky);
    });

    test('lays SPEC 12s round result out, the tallest screen the chrome has', async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await atBetting(page, { seed: SEED });
      await dealToPlayerTurn(page);
      await page.locator('[data-action="stand"]').click();
      await waitForPhase(page, 'roundResult');
      await settle(page);
      // The mode is not pinned here: the result screen is taller than the
      // betting one, so a viewport with room for one can be short of room for
      // the other. What is asserted is the implication, at whichever it lands on.
      await assertBothDisclosureStates(page, 'roundResult', viewport.breakpoint, null);
      await control(page, 'next-hand').click();
      await waitForPhase(page, 'betting');
    });
  });
}

test.describe('F1: the screens the betting loop does not pass through', () => {
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[6]] as const) {
    test(`lays SPEC 10s start screen out at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await waitForPhase(page, 'start');
      await settle(page);
      await assertBothDisclosureStates(page, 'start', viewport.breakpoint, viewport.sticky);
      // And the screen still does what it is for.
      await control(page, 'start').click();
      await waitForPhase(page, 'betting');
    });

    test(`lays SPEC 4.4s insurance offer out at ${viewport.label}`, async ({ page }) => {
      // A seed the search in `peek-seeds.ts` found for exactly this: a dealer
      // Ace showing, so the offer is made, and no natural behind it, so the
      // round does not settle before the screen is measured.
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await bootGame(page, { seed: peekSeed('none') });
      await waitForPhase(page, 'start');
      await control(page, 'start').click();
      await waitForPhase(page, 'betting');
      await chip(page, 10).click();
      await control(page, 'deal').click();
      await waitForPhase(page, 'insurance');
      await settle(page);
      await assertBothDisclosureStates(page, 'insurance', viewport.breakpoint, viewport.sticky);
    });
  }
});

test.describe('F1: the play surface keeps its minimum height where the shell has none', () => {
  test('gives the row the token length, and the plan a box it can fit', async ({ page }) => {
    // The used value of `--surface-min-height`, measured rather than parsed: the
    // token is declared as three of the largest spacing step and the sticky
    // decision is arithmetic over the same number in `breakpoints.ts`, so this
    // is where the two are pinned to each other.
    await page.setViewportSize({ width: 320, height: 480 });
    await atShippedBetting(page);
    await settle(page);
    const report = await layoutReport(page);
    expect(report.stickyBars, 'this viewport should not be sticky').toBe('off');
    expect(report.regions.body?.height ?? 0, 'the row is not the token length').toBeCloseTo(
      MIN_SURFACE_HEIGHT,
      0,
    );

    // And the surface really was planned from that box rather than from the
    // fallback: it fits inside the row on both axes.
    const surface = report.regions.surface;
    const body = report.regions.body;
    expect(surface).not.toBeNull();
    expect(surface?.width ?? 0, 'the surface is wider than its row').toBeLessThanOrEqual(
      (body?.width ?? 0) + 1,
    );
    expect(surface?.height ?? 0, 'the surface is taller than its row').toBeLessThanOrEqual(
      (body?.height ?? 0) + 1,
    );
    expect(surface?.width ?? 0, 'the surface collapsed').toBeGreaterThan(0);
  });
});

test.describe('F1: the layout mode is stable, not a flip-flop', () => {
  test('resolves the same mode on twenty consecutive frames at each viewport', async ({ page }) => {
    // The property `barsStick` rests on: it is a pure function of content
    // heights that do not move when it answers, so the page cannot oscillate
    // between the two layouts. Measured on the page rather than argued, because
    // a layout that fed its own decision would flip here and nowhere else.
    await page.setViewportSize({ width: 1280, height: 800 });
    await atShippedBetting(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await settle(page);
      const seen = await page.evaluate(
        async () =>
          new Promise<string[]>((resolve) => {
            const shell = document.querySelector('.bj-shell');
            const states: string[] = [];
            const step = (): void => {
              states.push(shell?.getAttribute('data-sticky-bars') ?? '');
              if (states.length < 20) {
                requestAnimationFrame(step);
              } else {
                resolve(states);
              }
            };
            requestAnimationFrame(step);
          }),
      );
      expect(new Set(seen).size, `${viewport.label} flipped between layouts`).toBe(1);
    }
  });
});

test.describe('F1: the four are one page, not four pages', () => {
  test('carries the same game and the same chrome through all seven', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await atShippedBetting(page);

    const seen: string[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await settle(page);
      const report = await assertLayout(page, `${viewport.label} walk`, viewport.breakpoint, viewport.sticky);
      seen.push(`${report.breakpoint}/${report.stickyBars}`);
    }
    expect(seen.length).toBe(VIEWPORTS.length);
    // Both modes were really exercised by the walk, or the implication above is
    // only ever checked on one side of itself.
    expect(seen.some((entry) => entry.endsWith('/on')), 'no viewport stuck').toBe(true);
    expect(seen.some((entry) => entry.endsWith('/off')), 'no viewport scrolled').toBe(true);

    // And the game is still playable at the end of the walk, at the last
    // viewport, through the controls that were measured.
    await chip(page, WAGER).click();
    await control(page, 'deal').click();
    await expect(page.locator('.bj-shell')).not.toHaveAttribute('data-phase', 'betting');
  });
});
