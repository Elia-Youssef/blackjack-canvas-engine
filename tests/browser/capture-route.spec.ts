/**
 * The demonstration capture route, graded on the page. `BJ-23`.
 *
 * `scripts/capture/serve.mjs` serves the shipped `dist/` plus a capture page
 * that appends one support bundle and one boot script, so that five of
 * `BlackJack/ACCEPTANCE.md` section 4's sheets can record a known deal. Four
 * items depend on it: `E3`'s hunted hand, `E4`'s Gold table, `E5`'s three
 * felts, `E6`'s two peek arms and `G4`'s three-round session.
 *
 * **This spec exists because the first version of that route was wrong in a way
 * only the page could see.** The two appended tags were classic scripts with no
 * `defer`, so they ran before the shipped page's deferred module script: the
 * boot script booted the harness's composition root first, the shipped chunk
 * booted a second one over the same mount point, and the game an operator would
 * record was an unseeded default. `window.__bjGame` answered correctly for the
 * orphan the whole time, which is exactly why the hand-back's by-hand check
 * passed. The lesson is one assertion: **ask the page, not the API.**
 *
 * So every test below reads the DOM the operator would be recording, and the
 * second test is a live negative control that serves the same page with the
 * `defer` attributes stripped and requires the first test's assertion to fail
 * on it. Without that control the assertion could go quietly vacuous the day
 * something else changed the boot order.
 *
 * **No second server is started.** The page bytes, the boot script and the
 * route names are imported from `serve.mjs` itself and fulfilled on the
 * preview origin the whole suite already runs against, so what is graded is
 * the script's own output under the shipped Content Security Policy, at the
 * same origin, in a real browser. What that leaves ungraded is the connect
 * middleware's routing table, which is three string comparisons and is read
 * back here from the same constant the server routes on.
 */

import { expect, test, type Page } from '@playwright/test';

import { BOOT_SOURCE, capturePage, ROUTES } from '../../scripts/capture/serve.mjs';
import { cardSpreadRound, SPREAD_WAGER } from './support/capture-seeds';
import {
  bundleSupport,
  control,
  PHASE_TIMEOUT,
  pressOn,
  readout,
  readoutValue,
  settle,
  shell,
  waitForPhase,
} from './support/game';

/** The mark the Gold sheets bring, and the table they name. */
const MARK = 10_000;

/**
 * Serve the capture page and its two scripts on the preview origin.
 *
 * `strip` is the negative control's hook: with it, the served page is the
 * defect the review found rather than the cure, and the assertions below have
 * to notice. Everything else is byte-for-byte what `serve.mjs` emits.
 */
async function serveCaptureRoute(page: Page, strip: boolean): Promise<void> {
  const shipped = await page.request.get('/index.html');
  const body = await shipped.text();
  const html = capturePage(body, false) as string;
  const served = strip ? html.replace(/<script defer /g, '<script ') : html;

  await page.route(`**${ROUTES.page}*`, (route) => {
    void route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: served });
  });
  await page.route(`**${ROUTES.harness}`, async (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: await bundleSupport('game-harness.ts'),
    });
  });
  await page.route(`**${ROUTES.boot}`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: BOOT_SOURCE as string,
    });
  });
}

/** Close the onboarding overlay the way a player does, if it is open. */
async function dismiss(page: Page): Promise<void> {
  await settle(page);
  if ((await shell(page).getAttribute('data-overlay')) === 'howToPlay') {
    await control(page, 'close-overlay').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();
  }
}

/** What the page itself says it is seated at, in the readout a viewer reads. */
async function tableOnPage(page: Page): Promise<string> {
  return (await readoutValue(page, 'table').textContent()) ?? '';
}

test.describe('BJ-23: the capture route boots the page a capture would record', () => {
  test('a seeded load seats the page at the table the query names', async ({ page }) => {
    await serveCaptureRoute(page, false);
    await page.goto(`${ROUTES.page}?table=gold&bestBalance=${String(MARK)}`);
    await expect(page.locator('.bj-shell')).toBeVisible();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-capture-route') !== null,
      undefined,
      { timeout: PHASE_TIMEOUT },
    );
    await dismiss(page);
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');

    // The assertion whose absence let the defect through: the DOM, not the API.
    await expect
      .poll(async () => tableOnPage(page), { timeout: PHASE_TIMEOUT })
      .toContain('Gold');
    // And the two together, because the defect was precisely that they
    // disagreed: the machine the API answers for must be the machine the page
    // is showing.
    expect((await readout(page)).table, 'the API and the page are one game').toBe('gold');
    expect(await page.getAttribute('html', 'data-capture-route')).toBe('game-harness');
  });

  test('the same page without defer shows a different table from the one it booted', async ({
    page,
  }) => {
    // The live negative control. Strip the one attribute the cure added and the
    // page reverts to the reviewed defect: the shipped chunk boots last and
    // wins the DOM, so the page is an unseeded Bronze game while the API still
    // answers Gold for the orphan. If this test ever passes cleanly, the test
    // above has stopped being able to fail and has to be re-derived.
    await serveCaptureRoute(page, true);
    await page.goto(`${ROUTES.page}?table=gold&bestBalance=${String(MARK)}`);
    await expect(page.locator('.bj-shell')).toBeVisible();
    await dismiss(page);
    await settle(page);

    expect((await readout(page)).table, 'the orphaned machine still says Gold').toBe('gold');
    expect(await tableOnPage(page), 'the page shows the unseeded game').not.toContain('Gold');
  });

  test('the seeded load deals run sheet 4 leg A on the felt', async ({ page }) => {
    // The sheet's own claim, walked end to end on the page: item `E3`'s hunted
    // round, whose hand carries an Ace, a face card and a number card in every
    // suit. The cards are read off the machine the page is showing, and the
    // hand value is read off the DOM beside them.
    const spread = cardSpreadRound();
    await serveCaptureRoute(page, false);
    await page.goto(`${ROUTES.page}?seed=${String(spread.seed)}`);
    await expect(page.locator('.bj-shell')).toBeVisible();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-capture-route') !== null,
      undefined,
      { timeout: PHASE_TIMEOUT },
    );
    await dismiss(page);
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');

    await page.locator(`[data-chip="${String(SPREAD_WAGER)}"]`).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    for (let attempt = 0; attempt < spread.hits; attempt += 1) {
      if ((await shell(page).getAttribute('data-phase')) !== 'playerTurn') {
        break;
      }
      await pressOn(page, '[data-action="hit"]', 'playerTurn');
      await settle(page);
    }

    const cards = (await readout(page)).hands[0]?.cards ?? [];
    expect(cards.map((card) => `${card.rank}-${card.suit}`)).toEqual(spread.cards);
    // The hand is on the felt of the page being recorded, and the mirror is
    // the DOM's own reading of it. Both, because a machine that agreed with
    // itself was the whole of the defect.
    await expect(page.locator('[data-mirror="hands"]')).toContainText(/Ace/i);
  });

  test('the shipped route stays the product', async ({ page }) => {
    // `/` must carry nothing of the capture route: no injected tag, no harness,
    // no marker attribute. The server only ever appends to a copy.
    await page.goto('/');
    await expect(page.locator('.bj-shell')).toBeVisible();
    const state = await page.evaluate(() => ({
      route: document.documentElement.getAttribute('data-capture-route'),
      harness: typeof window.__bjGame,
      demo: typeof window.__bjRenderDemo,
      scripts: [...document.querySelectorAll('script')].map((node) => node.getAttribute('src')),
    }));
    expect(state.route).toBeNull();
    expect(state.harness).toBe('undefined');
    expect(state.demo).toBe('undefined');
    expect(state.scripts.some((src) => (src ?? '').includes('__capture'))).toBe(false);
  });
});
