/**
 * Item `K3`, Minor, 7 points, over the built `dist/`.
 *
 *   "Master mute and volume persist and mute is reachable in a single action
 *    from the play screen."
 *
 * Three clauses, one of them parked by the project owner's ruling and two of
 * them closed here:
 *
 *   1. **"persist"** is parked to `BJ-20` on the `E9`/Speed precedent, with
 *      the user's approval: nothing imports `src/storage/` until that part
 *      wires the reload flows, so reload persistence cannot be evidenced here.
 *      What this part ships toward it is the whole of the serialization-ready
 *      seam, and this spec asserts it: `boot` takes `muted` and `volume`
 *      pass-throughs the way it took `speed` and `alwaysReduceMotion`, the
 *      engine applies them at creation, `session()` carries them back out in
 *      the shape `BJ-20` will write, and `src/storage/document.ts` already
 *      holds `settings.muted` and `settings.volume` with sanitisers. The
 *      reload evidence is `BJ-20`'s reload specs, on exactly the terms
 *      `E9`'s was.
 *   2. **"mute is reachable in a single action from the play screen"** is
 *      closed here, unscoped by breakpoint because the clause names none: one
 *      press, in no overlay, behind no disclosure, at wide, medium and
 *      compact, and on more than one of SPEC 10's screens.
 *   3. **"master mute and volume"** names two settings; the volume slider is
 *      item `I5` at `BJ-20` and the programmatic volume path is what ships
 *      now, asserted through the harness below.
 *
 * The accessibility sweep is `BJ-18`'s, applied to the new control on arrival
 * rather than retrofitted: an accessible name, a state for assistive
 * technology, a signal that is not colour, the focus ring, no greying, and a
 * change announced through the one queue. The axe scan and the three-input
 * sweep already cover the control structurally, because it is registered in
 * `SCREEN_CONTROLS` under every phase.
 */

import { expect, test } from '@playwright/test';

import type { BreakpointName } from '../../src/ui/breakpoints';
import {
  atShippedBetting,
  audioProbe,
  bootGame,
  chip,
  control,
  session,
  settle,
  waitForPhase,
} from './support/game';

/** The mute control, by the attribute every census names it with. */
const MUTE = '[data-control="mute"]';

/** Answer every screen that waits for the player until the round settles. */
async function settleRound(page: import('@playwright/test').Page): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const phase = (await page.locator('.bj-shell').getAttribute('data-phase')) ?? '';
    if (phase === 'roundResult') {
      return;
    }
    if (phase === 'insurance') {
      await control(page, 'decline-insurance').click({ timeout: 2000 }).catch(() => undefined);
      continue;
    }
    if (phase === 'playerTurn') {
      await page.locator('[data-action="stand"]').click({ timeout: 2000 }).catch(() => undefined);
      continue;
    }
    await page.waitForTimeout(150);
  }
  throw new Error('the round never settled');
}

/**
 * One viewport per breakpoint the clause is unscoped by.
 *
 * `compact` rather than `portrait` for the narrow arm, in landscape, because
 * the two are the same top bar under different orientations and the clause
 * grades the width: `portrait` is the same reading twice.
 */
/** One viewport per breakpoint the clause is unscoped by, keyed by name. */
type WideOrMediumOrCompact = Exclude<BreakpointName, 'portrait'>;
type Size = { readonly width: number; readonly height: number };

const VIEWPORTS: Readonly<Record<WideOrMediumOrCompact, Size>> = Object.freeze({
  wide: { width: 1280, height: 720 },
  medium: { width: 900, height: 720 },
  compact: { width: 667, height: 375 },
});

test.describe('K3: mute is one action from the play screen', () => {
  for (const [name, size] of Object.entries(VIEWPORTS) as [WideOrMediumOrCompact, Size][]) {
    test(`mutes in one press at ${name}, behind no disclosure and in no overlay`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await expect(page.locator('.bj-shell')).toBeVisible();
      await expect(page.locator('.bj-shell')).toHaveAttribute('data-breakpoint', name);

      const mute = page.locator(MUTE);
      await expect(mute).toBeVisible();
      // Not inside the readouts disclosure at any width: the disclosure at
      // compact holds eleven readouts and must hold nothing a player needs in
      // a hurry, and a `closest('details')` is the structural reading.
      expect(await mute.evaluate((node) => node.closest('details'))).toBeNull();
      // In no overlay: the control is on the play screen, not in a dialog.
      expect(await mute.evaluate((node) => node.closest('[role="dialog"]'))).toBeNull();
      // The hit test at the centre: one action means the click lands on it.
      const hit = await mute.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const landed = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return landed !== null && node.contains(landed);
      });
      expect(hit, 'the mute control is what a click on it lands on').toBe(true);

      await mute.click();
      await expect(mute).toHaveAttribute('aria-pressed', 'true');
      await expect(mute).toHaveText('Unmute');
      await mute.click();
      await expect(mute).toHaveAttribute('aria-pressed', 'false');
      await expect(mute).toHaveText('Mute');
    });
  }

  test('is present and one press away on more than the betting screen', async ({ page }) => {
    // The start screen, the betting screen, and the round result: the top bar
    // outlives every phase, and the clause says "the play screen" without
    // naming a phase. Presence is what `SCREEN_CONTROLS` asserts everywhere;
    // this is the same reading from the page itself.
    await page.goto('/');
    await expect(page.locator(MUTE)).toBeVisible();
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await expect(page.locator(MUTE)).toBeVisible();
    await page.locator(MUTE).click();
    await expect(page.locator(MUTE)).toHaveAttribute('aria-pressed', 'true');

    // Through a round, held: the mute survives the phase changes, which is
    // what a control in the top bar means and what a per-screen control
    // could not do.
    await chip(page, 50).click();
    await control(page, 'deal').click();
    await settleRound(page);
    await waitForPhase(page, 'roundResult');
    await expect(page.locator(MUTE)).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('K3: the control carries its state in more than colour', () => {
  test('has a name, a pressed state, an underline, and is never greyed', async ({ page }) => {
    await page.goto('/');
    const mute = page.locator(MUTE);
    await expect(mute).toBeVisible();

    // A name that is the visible label, and a state for assistive technology.
    expect(((await mute.textContent()) ?? '').trim().length).toBeGreaterThan(0);
    await expect(mute).toHaveAttribute('aria-pressed', 'false');

    // The non-colour signal: the same underline every pressed control in the
    // chrome carries, which survives forced colors and colour-vision
    // deficiencies alike. Asserted as a computed style on both arms.
    const decoration = async (): Promise<string> =>
      mute.evaluate((node) => getComputedStyle(node).textDecorationLine);
    expect(await decoration()).not.toContain('underline');
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    expect(await decoration()).toContain('underline');

    // Never greyed: no phase refuses a mute, and the availability layer never
    // hears of it. Read on the screens a round passes through.
    expect(await mute.getAttribute('aria-disabled')).toBeNull();
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    expect(await mute.getAttribute('aria-disabled')).toBeNull();
    await chip(page, 50).click();
    await control(page, 'deal').click();
    await settleRound(page);
    await waitForPhase(page, 'roundResult');
    expect(await mute.getAttribute('aria-disabled')).toBeNull();
  });

  test('announces the change through the one queue, in words', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(MUTE)).toBeVisible();
    // The regions exist from the moment the chrome does; `toHaveText` waits
    // for the write rather than for a visibility the clipped box never has.
    const polite = page.locator('[data-live="polite"]');
    await expect(polite).toHaveText('', { timeout: 5_000 });

    await page.locator(MUTE).click();
    // The queue's floor is half a second between polite writes, so the wait
    // is longer than the interval rather than a race against it.
    await expect(polite).toHaveText('Sound muted.', { timeout: 5_000 });
    await page.locator(MUTE).click();
    await expect(polite).toHaveText('Sound on.', { timeout: 5_000 });
  });
});

test.describe('K3: the serialization-ready seam, asserted now and closed at BJ-20', () => {
  test('applies a restored mute and volume at creation, and reads them back', async ({ page }) => {
    await bootGame(page, { muted: true, volume: 0.4 });
    await waitForPhase(page, 'start');

    const probe = await audioProbe(page);
    expect(probe.muted).toBe(true);
    expect(probe.volume).toBeCloseTo(0.4, 12);
    // The control agrees with the engine on the first frame it renders.
    await expect(page.locator(MUTE)).toHaveAttribute('aria-pressed', 'true');

    const saved = await session(page);
    expect(saved.muted).toBe(true);
    expect(saved.volume).toBeCloseTo(0.4, 12);

    // And the unmuted arm, on a second boot over the same page: the
    // pass-through is a value rather than a latch.
    await bootGame(page, { muted: false, volume: 1 });
    const fresh = await audioProbe(page);
    expect(fresh.muted).toBe(false);
    expect(fresh.volume).toBe(1);
    await expect(page.locator(MUTE)).toHaveAttribute('aria-pressed', 'false');
  });

  test('clamps a volume the document could not have sanitised', async ({ page }) => {
    await bootGame(page, { volume: 4 });
    const probe = await audioProbe(page);
    expect(probe.volume).toBe(1);
    await bootGame(page, { volume: -1 });
    expect((await audioProbe(page)).volume).toBe(0);
  });

  test('toggles the pressed state on the shipped page, which is the engine reading', async ({ page }) => {
    await atShippedBetting(page);
    // The shipped page, driven by its own control: the only route a player
    // has, and the one the clause is written over. `aria-pressed` is rendered
    // from `audio.muted()` through `ChromeState.muted` every frame, so the
    // attribute IS an engine reading; the harness probe belongs to the seam
    // spec above, and this test deliberately reads only what ships.
    const before = page.locator(MUTE);
    await before.click();
    await expect(before).toHaveAttribute('aria-pressed', 'true');
    await settle(page);
  });
});
