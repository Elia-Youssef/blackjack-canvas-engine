/**
 * Item `J7`, Minor, over the built `dist/`.
 *
 *   "How to Play is shown automatically on first launch, is reachable from
 *    the play screen at any time, and its dismissal persists across a reload."
 *
 * Three clauses, and the first is the one the shared entry helpers dismiss on
 * purpose: every spec context is a first launch, so this file reaches for the
 * page directly, with `page.goto` and no helper in front of it, which is the
 * only place in the suite the auto-show is still visible from.
 *
 * The dismissal is asserted twice over: once as the flag in the stored
 * document, read from inside the page, and once as behaviour, a reload that
 * does not re-show. The second is the clause's own wording and the first is
 * the mechanism underneath it, because a flag that moved without persisting
 * would pass the second on a slow write and fail it on a fast one.
 *
 * Reachability is graded on the play screen and at a second screen, because
 * "at any time" is SPEC 17's phrase and the top bar is the one row no phase
 * takes away: the same opener button, pressed at betting and at the round
 * result.
 *
 * SPEC 13's own sentence rides the same panel: "How to Play says plainly that
 * chip balances do not carry between sessions", asserted as the panel's text.
 */

import { expect, test, type Page } from '@playwright/test';

import { chip, control, settle, shell, waitForPhase } from './support/game';
import { pressOn } from './support/game';

/** The one key this game ever touches, as `document.ts` spells it. */
const STORAGE_KEY = 'js-games.blackjack';

/** The stored document's seen flag, read from inside the page. */
async function seenFlag(page: Page): Promise<boolean | null> {
  return page.evaluate((key: string) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      const envelope = parsed as { data?: { howToPlaySeen?: unknown } };
      const value = envelope.data?.howToPlaySeen;
      return typeof value === 'boolean' ? value : null;
    } catch {
      return null;
    }
  }, STORAGE_KEY);
}

/** Load the page the way a player's browser does, with nothing in front. */
async function rawLaunch(page: Page): Promise<void> {
  await page.goto('/');
  await expect(shell(page)).toBeVisible();
}

test.describe('J7: onboarding', () => {
  test('shows How to Play automatically on a first launch', async ({ page }) => {
    await rawLaunch(page);
    await settle(page);

    // The overlay is open, it is How to Play, and it arrived without being
    // asked for: no control on the page has been pressed yet.
    const host = page.locator('[data-overlay-host="true"]');
    await expect(host).toBeVisible();
    await expect(host).toHaveAttribute('data-open', 'howToPlay');
    // And nothing has seen the panel: the stored document either carries the
    // flag as false or is not there at all, because a first launch writes
    // nothing until its first save point and absence is the honest false.
    expect(await seenFlag(page), 'nothing has seen the panel yet').not.toBe(true);
  });

  test('its dismissal writes the flag and a reload does not re-show it', async ({ page }) => {
    await rawLaunch(page);
    await settle(page);
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();

    await control(page, 'close-overlay').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();
    expect(await seenFlag(page), 'the dismissal wrote the flag at once').toBe(true);

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);
    await expect(
      page.locator('[data-overlay-host="true"]'),
      'the reloaded page does not re-show it',
    ).toBeHidden();
    expect(await seenFlag(page)).toBe(true);

    // And the page behind it is the start screen, not a blank one: the
    // dismissal cost nothing but the overlay.
    await expect(shell(page)).toHaveAttribute('data-phase', 'start');
  });

  test('the panel states plainly that chip balances do not carry between sessions', async ({
    page,
  }) => {
    await rawLaunch(page);
    await settle(page);
    await expect(page.locator('[data-panel="howToPlay"]')).toContainText(
      'Chip balances do not carry between sessions',
    );
  });

  test('is reachable from the play screen at any time', async ({ page }) => {
    await rawLaunch(page);
    await settle(page);
    await control(page, 'close-overlay').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();

    // At the start screen, and then deeper in: the same opener, two screens.
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator('[data-open-overlay="howToPlay"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toHaveAttribute(
      'data-open',
      'howToPlay',
    );
    await control(page, 'close-overlay').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();

    await chip(page, 50).click();
    await control(page, 'deal').click();
    for (let step = 0; step < 300; step += 1) {
      const phase = (await shell(page).getAttribute('data-phase')) ?? '';
      if (phase === 'roundResult') {
        break;
      }
      if (phase === 'insurance') {
        await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
        await page.waitForTimeout(100);
        continue;
      }
      if (phase === 'playerTurn') {
        await pressOn(page, '[data-action="stand"]', 'playerTurn');
        await page.waitForTimeout(100);
        continue;
      }
      await page.waitForTimeout(100);
    }
    await waitForPhase(page, 'roundResult');

    await page.locator('[data-open-overlay="howToPlay"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toHaveAttribute(
      'data-open',
      'howToPlay',
    );
    // And closing it again leaves the round result where it was, which is the
    // overlays' "never blocking state" wearing SPEC 17's clothes.
    await control(page, 'close-overlay').click();
    await expect(shell(page)).toHaveAttribute('data-phase', 'roundResult');
  });
});
