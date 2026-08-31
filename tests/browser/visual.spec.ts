/**
 * Item `E8`'s nine committed baselines. `BJ-22`.
 *
 *   "Visual regression baselines match for every key state: start, betting,
 *    dealt, split, insurance offer, round result, bust out, settings, how to
 *    play."
 *
 * Nine states, nine baselines, and **two** tolerances at zero: `maxDiffPixels`
 * and `threshold`. Both, because they are different numbers and only one of
 * them was zero until `BJ-22`'s fix round. `maxDiffPixels` is how many pixels
 * may differ; `threshold` is how far one pixel may differ before it counts as
 * differing at all, and it defaults to **0.2** of the perceived colour range.
 * With the default left in place these baselines could not see the felt grain:
 * removing `drawGrain` from the bake entirely, rebuilding and re-running left
 * all nine captures passing, because the grain moves a pixel by at most two
 * units of 255 and two units is inside 0.2. So the file that exists to notice a
 * change to the picture was blind to a whole layer of it.
 *
 * Both can be zero because every input to the picture is pinned: one seed, one
 * viewport, one device pixel ratio, reduced motion on so no tween is part way
 * through, and the shipped `dist/` served by `vite preview`. A baseline with a
 * tolerance is a baseline that stops noticing the class of change it was
 * written for, and the change that motivated this file moved every card on the
 * table.
 *
 * **What this file already caught, on its first run.** The shipped page painted
 * the baked felt over the animated scene, so the play surface rendered as an
 * empty table at every state and had done since `BJ-15` split the felt onto its
 * own canvas. `src/ui/chrome.css` carries the fix and the reasoning; the point
 * for this file is that nothing else in the 1,131 browser tests this part
 * inherited could see it, because every other instrument reads the canvas
 * rather than the composite.
 *
 * **Chromium only, and per platform.** Canvas text metrics, antialiasing and
 * gradient dithering are engine and platform properties, so a baseline set per
 * engine would be three sets of pixels grading one drawing, and two of them
 * would fail for reasons that are not this project's. The criterion asks for
 * baselines that match, not for a cross-engine pixel identity that no browser
 * offers; the engines are covered on behaviour by the other 1,100 tests, and
 * `render-surface.spec.ts` measures the drawing itself on all three.
 * `playwright.config.ts` runs this file on chromium alone. Playwright names a
 * snapshot per platform, so `win32` is generated on this machine and `linux`
 * inside `mcr.microsoft.com/playwright:v1.62.1-noble`, which is the same image
 * CI runs the visual job in: the CI rendering matches by construction rather
 * than by luck.
 */

import { expect, test, type Page } from '@playwright/test';

import { BUST_OUT_WAGER, bustOutSeed } from './support/action-seeds';
import { aceUpRound, differingSplit, FLOW_WAGER } from './support/flow-seeds';
import {
  bootGame,
  control,
  pressOn,
  settle,
  shell,
  waitForPhase,
  PHASE_TIMEOUT,
} from './support/game';

/**
 * The one viewport every baseline is taken at.
 *
 * `wide`, because it is the only breakpoint at which every screen shows all of
 * itself: the readouts are one row, the disclosure is open and nothing is one
 * press behind a summary. The responsive arrangements are graded by
 * `breakpoints.spec.ts`, `portrait.spec.ts` and `small-viewport.spec.ts`, which
 * measure boxes rather than pixels and can say why a layout is wrong.
 */
const VIEWPORT = { width: 1280, height: 800 };

/**
 * The unlock mark the bust-out route needs. SPEC 6 unlocks Gold at 10,000, so
 * anything lower leaves the table locked and the route never reaches its screen.
 */
const BEST_BALANCE = 10_000;

/**
 * What every baseline is compared with.
 *
 * `animations: 'disabled'` on top of the boot flag, because the two cover
 * different halves: the flag is the game's own reduced-motion resolution, which
 * settles every canvas tween on its first frame, and the option freezes CSS
 * animations and transitions in the chrome, which the flag zeroes the duration
 * of but which a screenshot can still catch part way through on the frame they
 * start.
 */
const SHOT = { animations: 'disabled', maxDiffPixels: 0, threshold: 0 } as const;

/** Boot a game with every source of variation pinned. */
async function pinned(page: Page, seed: number, table?: 'bronze' | 'silver' | 'gold'): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await bootGame(page, {
    seed,
    alwaysReduceMotion: true,
    ...(table === undefined ? {} : { table, bestBalance: BEST_BALANCE }),
  });
}

/** Wait until the picture cannot still be moving, then take it. */
async function stable(page: Page): Promise<void> {
  await settle(page);
  // The motion probe is the game's own answer to "is anything mid-tween", and
  // under the reduced-motion flag it is zero from the first frame. Waiting on it
  // rather than on a timeout is what makes this deterministic rather than
  // usually deterministic.
  await page.waitForFunction(
    () => (window.__bjGame?.motion().tweensInFlight ?? 1) === 0,
    undefined,
    { timeout: PHASE_TIMEOUT },
  );
  await settle(page);
}

/** Drive a round to its result by standing on everything. */
async function toResult(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const phase = await shell(page).getAttribute('data-phase');
    if (phase === 'roundResult') {
      return;
    }
    if (phase === 'insurance') {
      await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
    } else if (phase === 'playerTurn') {
      await pressOn(page, '[data-action="stand"]', 'playerTurn');
    }
    await page.waitForTimeout(100);
  }
  throw new Error('the round never reached its result');
}

test.describe('E8: a committed baseline for every key state', () => {
  test('start', async ({ page }) => {
    await pinned(page, differingSplit().seed);
    await waitForPhase(page, 'start');
    await stable(page);
    await expect(shell(page)).toHaveScreenshot('start.png', SHOT);
  });

  test('betting', async ({ page }) => {
    await pinned(page, differingSplit().seed);
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    // A wager on the felt, so the state under test is SPEC 4.11's betting screen
    // doing its job rather than an empty table with different buttons.
    await page.locator(`[data-chip="${String(FLOW_WAGER)}"]`).click();
    await stable(page);
    await expect(shell(page)).toHaveScreenshot('betting.png', SHOT);
  });

  test('dealt', async ({ page }) => {
    await pinned(page, differingSplit().seed);
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator(`[data-chip="${String(FLOW_WAGER)}"]`).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await stable(page);
    await expect(shell(page)).toHaveScreenshot('dealt.png', SHOT);
  });

  test('split', async ({ page }) => {
    await pinned(page, differingSplit().seed);
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator(`[data-chip="${String(FLOW_WAGER)}"]`).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await page.locator('[data-action="split"]').click();
    await waitForPhase(page, 'playerTurn');
    await stable(page);
    await expect(shell(page)).toHaveScreenshot('split.png', SHOT);
  });

  test('insurance offer', async ({ page }) => {
    await pinned(page, aceUpRound().seed);
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator(`[data-chip="${String(FLOW_WAGER)}"]`).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'insurance');
    await stable(page);
    await expect(shell(page)).toHaveScreenshot('insurance.png', SHOT);
  });

  test('round result', async ({ page }) => {
    await pinned(page, differingSplit().seed);
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator(`[data-chip="${String(FLOW_WAGER)}"]`).click();
    await control(page, 'deal').click();
    await toResult(page);
    await stable(page);
    await expect(shell(page)).toHaveScreenshot('round-result.png', SHOT);
  });

  test('bust out', async ({ page }) => {
    await pinned(page, bustOutSeed(), 'gold');
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    // The whole bankroll, as `bust-out.spec.ts` wagers it: SPEC 4.12's screen
    // is only reachable from a balance below the table minimum.
    for (const denomination of [500, 100, 100, 100, 100, 50] as const) {
      await page.locator(`[data-chip="${String(denomination)}"]`).click();
    }
    await expect(page.locator('[data-readout="wager"] .bj-readout__value')).toHaveText(
      String(BUST_OUT_WAGER),
    );
    await control(page, 'deal').click();
    await toResult(page);
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'bustOut');
    await stable(page);
    await expect(shell(page)).toHaveScreenshot('bust-out.png', SHOT);
  });

  test('settings', async ({ page }) => {
    await pinned(page, differingSplit().seed);
    await waitForPhase(page, 'start');
    await page.locator('[data-open-overlay="settings"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    await stable(page);
    await expect(shell(page)).toHaveScreenshot('settings.png', SHOT);
  });

  test('how to play', async ({ page }) => {
    await pinned(page, differingSplit().seed);
    await waitForPhase(page, 'start');
    await page.locator('[data-open-overlay="howToPlay"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    await stable(page);
    await expect(shell(page)).toHaveScreenshot('how-to-play.png', SHOT);
  });
});
