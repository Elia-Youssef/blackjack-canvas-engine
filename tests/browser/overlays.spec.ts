/**
 * Item `C5`, Major, over the built `dist/`.
 *
 *   "Overlays never cover a continuous readout, and opening then closing any
 *    overlay leaves game state unchanged."
 *
 * Two clauses, and each is asserted twice, once as a player would see it and
 * once against the machine.
 *
 * **"Never cover a continuous readout" is measured in rendered pixels.** Every
 * one of SPEC 11's fourteen readouts is located, required to be visible with a
 * box of its own, and required not to intersect the open overlay's box, on all
 * three engines. The check would be vacuous if the overlay had no box, so the
 * overlay is required to have one **and** to overlap the play surface: SPEC 10
 * says the play surface persists behind every overlay, so an overlay that
 * covered nothing would satisfy the letter of the clause and none of its point.
 *
 * **"Leaves game state unchanged" is asserted against the machine.** The whole
 * readout is compared, phase payload included, before the open and after the
 * close, and a control in the same file changes one thing to prove the
 * comparison can fail. The player-visible half is the fourteen readouts,
 * compared as text on the shipped page with nothing injected.
 *
 * **And the game keeps running behind an overlay.** SPEC 10 calls the overlays
 * "reachable at any time and never blocking state", so one is opened during the
 * paced deal and the round is required to reach the player's turn with it still
 * open. A chrome that paused the loop would pass every other test in this file.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

import { OVERLAY_IDS } from '../../src/ui/state';
import { READOUT_KEYS } from '../../src/ui/components/readouts';
import {
  atBetting,
  atShippedBetting,
  chip,
  control,
  readout,
  readoutValue,
  shell,
  waitForPhase,
} from './support/game';

/**
 * This file grades `C5` at Playwright's default 1280 x 720 viewport, which is the
 * `wide` breakpoint. That matters from `BJ-16` onward: below 768 px the narrow
 * top bar keeps three of SPEC 11's fourteen readouts and puts the other eleven
 * behind a disclosure, so the `toBeVisible` assertions below are width
 * dependent by design. `tests/browser/portrait.spec.ts` grades the narrow
 * arrangement and requires all fourteen to be reachable there.
 */
const SEED = 53;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, `${label} has a rendered box`).not.toBeNull();
  if (box === null) {
    throw new Error(`${label} has no box`);
  }
  return box;
}

/** True when two rendered boxes share any area at all. */
function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

function overlayHost(page: Page): Locator {
  return page.locator('[data-overlay-host="true"]');
}

/** Every readout of SPEC 11, as the page renders it right now. */
async function readoutTexts(page: Page): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const key of READOUT_KEYS) {
    values[key] = (await readoutValue(page, key).textContent()) ?? '';
  }
  return values;
}

/**
 * The machine's state, minus nothing.
 *
 * The full readout is compared, including the phase payload, the cards, the
 * shoe and all four wallet terms. `elapsed` and `queued` are in it too: both are
 * stable on the two untimed screens this is used from, and leaving them out
 * would be the one place a change could hide.
 */
type MachineState = Awaited<ReturnType<typeof readout>>;

test.describe('C5: an overlay never covers a continuous readout', () => {
  test('the chrome renders one element for each of SPEC 11 fourteen readouts', async ({ page }) => {
    // The count is asserted rather than inherited. Every test below iterates the
    // list the component publishes, so a readout quietly dropped from that list
    // would quietly drop out of the coverage with it. SPEC 11 names fourteen.
    expect(READOUT_KEYS).toHaveLength(14);
    expect(new Set(READOUT_KEYS).size).toBe(14);

    await atShippedBetting(page);
    for (const key of READOUT_KEYS) {
      await expect(readoutValue(page, key), `${key} is on the page once`).toHaveCount(1);
      await expect(readoutValue(page, key), `${key} shows something`).not.toBeEmpty();
    }
  });

  for (const id of OVERLAY_IDS) {
    test(`keeps all fourteen readouts clear of the ${id} overlay`, async ({ page }) => {
      // The shipped page, driven through its own controls. No harness.
      await atShippedBetting(page);
      await chip(page, 50).click();

      await page.locator(`[data-open-overlay="${id}"]`).click();
      await expect(overlayHost(page)).toBeVisible();
      await expect(overlayHost(page)).toHaveAttribute('data-open', id);

      const panel = await boxOf(overlayHost(page), `${id} overlay`);
      expect(panel.width, 'the overlay has real width').toBeGreaterThan(0);
      expect(panel.height, 'the overlay has real height').toBeGreaterThan(0);

      // The control that keeps the non-intersection honest: the overlay is a
      // real panel over the play surface, not an empty box somewhere harmless.
      const surface = await boxOf(page.locator('.bj-surface'), 'the play surface');
      expect(intersects(panel, surface), 'the overlay sits over the play surface').toBe(true);

      for (const key of READOUT_KEYS) {
        const value = readoutValue(page, key);
        await expect(value, `${key} stays visible`).toBeVisible();
        const box = await boxOf(value, `readout ${key}`);
        expect(box.width, `${key} has width`).toBeGreaterThan(0);
        expect(box.height, `${key} has height`).toBeGreaterThan(0);
        expect(intersects(panel, box), `the ${id} overlay covers the ${key} readout`).toBe(false);
      }

      // And the play surface is still there behind it, which is what SPEC 10
      // means by the readouts being genuinely continuous.
      await expect(page.locator('.bj-surface')).toHaveCount(1);
      expect(surface.width).toBeGreaterThan(0);
    });
  }
});

test.describe('C5: opening then closing an overlay changes nothing', () => {
  test('leaves every readout on the shipped page exactly as it was', async ({ page }) => {
    await atShippedBetting(page);
    await chip(page, 50).click();
    await expect(readoutValue(page, 'wager')).toHaveText('50');

    const before = await readoutTexts(page);
    for (const id of OVERLAY_IDS) {
      await page.locator(`[data-open-overlay="${id}"]`).click();
      await expect(overlayHost(page)).toBeVisible();
      await control(page, 'close-overlay').click();
      await expect(overlayHost(page)).toBeHidden();
    }
    expect(await readoutTexts(page)).toEqual(before);

    // The control: the comparison above can fail. One accepted chip tap is all
    // it takes, and a test that could not notice one would be asserting nothing.
    await chip(page, 10).click();
    await expect(readoutValue(page, 'wager')).toHaveText('60');
    expect(await readoutTexts(page)).not.toEqual(before);
  });

  for (const id of OVERLAY_IDS) {
    test(`leaves the machine unchanged across the ${id} overlay, at betting`, async ({ page }) => {
      await atBetting(page, { seed: SEED });
      await chip(page, 50).click();
      await expect(readoutValue(page, 'wager')).toHaveText('50');

      const before: MachineState = await readout(page);
      await page.locator(`[data-open-overlay="${id}"]`).click();
      await expect(overlayHost(page)).toBeVisible();
      expect(await readout(page)).toEqual(before);

      await control(page, 'close-overlay').click();
      await expect(overlayHost(page)).toBeHidden();
      expect(await readout(page)).toEqual(before);
    });
  }

  test('leaves the machine unchanged mid-round, during the player turn', async ({ page }) => {
    await atBetting(page, { seed: SEED });
    await chip(page, 50).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');

    const before: MachineState = await readout(page);
    expect(before.hands).toHaveLength(1);
    expect(before.wallet.committed).toBe(50);

    await page.locator('[data-open-overlay="statistics"]').click();
    await expect(overlayHost(page)).toBeVisible();
    await control(page, 'close-overlay').click();
    await expect(overlayHost(page)).toBeHidden();

    expect(await readout(page)).toEqual(before);
    await expect(shell(page)).toHaveAttribute('data-phase', 'playerTurn');
  });
});

test.describe('C5: an overlay never blocks state', () => {
  test('the paced deal runs to the player turn with an overlay open', async ({ page }) => {
    await atBetting(page, { seed: SEED });
    await chip(page, 50).click();
    await control(page, 'deal').click();

    // Opened while SPEC 10's `dealing` is still counting its queue down. SPEC 10
    // calls the overlays "reachable at any time and never blocking state", so
    // the round has to arrive at the player's turn regardless.
    await page.locator('[data-open-overlay="howToPlay"]').click();
    await expect(overlayHost(page)).toBeVisible();

    await waitForPhase(page, 'playerTurn');
    await expect(overlayHost(page)).toBeVisible();

    const snapshot = await readout(page);
    expect(snapshot.hands[0]?.cards).toHaveLength(2);
    expect(snapshot.dealerConcealed).toBe(1);
  });
});
