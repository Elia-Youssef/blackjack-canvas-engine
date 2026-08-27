/**
 * Item `E2`, Major, over the built `dist/`.
 *
 *   "Light and dark themes both render correctly, follow prefers-color-scheme
 *    by default, and the settings override wins in both directions."
 *
 * Three clauses over one mechanism: the chrome's palette is four `--bj-*`
 * custom properties the stylesheet re-points, `prefers-color-scheme: light`
 * is guarded so an explicit dark choice is not undone by a light system, and
 * the two attribute selectors win over the query in both directions. The
 * tests drive the real query with `emulateMedia`, read the chrome's ground as
 * a computed colour, and read the play surface as the bytes it actually drew.
 *
 * **The ground is the tell, and it is read as the page renders it.** SPEC 16
 * commits the two grounds to measured contrast ratios against their own text,
 * so the chrome's answer to "which theme is this" is a colour, and the two
 * possible answers are two specific colours. They are compared as members of
 * that pair rather than as strings the stylesheet happened to spell, and the
 * mapping is asserted: dark arms resolve the dark ground and light arms the
 * light one.
 *
 * **The play surface does not flip, and that is read off the canvas.** SPEC 16
 * fixes the felt's palette across both themes, so the strongest reading of
 * "renders correctly" for the surface is byte identity: the same page, at the
 * same point in the same round, draws the same canvas under all four
 * combinations of query and override. A theme that reached the felt would
 * change the bytes; a flake in the draw would change them too, and the same
 * canvas is compared twice per arm so neither can pass quietly.
 *
 * **Route.** The shipped page, nothing injected: the theme control is the
 * Settings panel's, the query is the platform's own emulation, and every
 * reading is computed style or canvas bytes.
 */

import { expect, test, type Page } from '@playwright/test';

import { control, openShippedPage, settle, waitForPhase } from './support/game';

/** The dark ground SPEC 16 commits, as `rgb()` spells it. */
const DARK_GROUND = 'rgb(14, 21, 18)';

/** The light ground SPEC 16 commits, as `rgb()` spells it. */
const LIGHT_GROUND = 'rgb(242, 245, 241)';

/** The chrome's ground, as the page renders it right now. */
async function groundOf(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

/** The play surface's bytes, as the page drew them right now. */
async function surfaceBytes(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.bj-surface');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('no play surface on this page');
    }
    return canvas.toDataURL();
  });
}

/** Assert the ground is one of SPEC 16's two, and which one it is. */
async function expectGround(page: Page, wanted: 'dark' | 'light'): Promise<void> {
  const ground = await groundOf(page);
  const pair = [DARK_GROUND, LIGHT_GROUND];
  expect(pair, 'the ground is one of the two the spec commits').toContain(ground);
  expect(ground, `the chrome is rendering the ${wanted} theme`).toBe(
    wanted === 'dark' ? DARK_GROUND : LIGHT_GROUND,
  );
}

/** Open Settings and choose a theme, closing the panel again. */
async function chooseTheme(page: Page, theme: 'system' | 'light' | 'dark'): Promise<void> {
  await page.locator('[data-open-overlay="settings"]').click();
  // Scoped to the panel, because the root carries `data-theme` too once a
  // choice is made, and the button and the attribute are two elements.
  const button = page.locator(`[data-panel="settings"] [data-theme="${theme}"]`);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await control(page, 'close-overlay').click();
  await settle(page);
}

test.describe('E2: light and dark themes', () => {
  for (const scheme of ['dark', 'light'] as const) {
    test(`follows prefers-color-scheme ${scheme} when the setting is system`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openShippedPage(page);
      await waitForPhase(page, 'start');

      // "System" is the absence of the attribute: the query is the only thing
      // answering, which is what the default clause says.
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
      await expectGround(page, scheme);
    });
  }

  test('the override wins in both directions against the query', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openShippedPage(page);
    await waitForPhase(page, 'start');

    await chooseTheme(page, 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectGround(page, 'light');

    // And back the other way, on the same page, without a reload: the
    // attribute selector has to beat the query in both directions, and a
    // control that only worked once would leave the attribute stuck.
    await chooseTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectGround(page, 'dark');

    // System again, which must put the query back in charge: the attribute
    // comes off rather than turning into a third value of itself.
    await chooseTheme(page, 'system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
    await expectGround(page, 'dark');

    // The same two directions under the opposite query, because under a dark
    // query the dark-override arm cannot fail: the ground it asserts is the
    // default already. Under a light query the dark override is held by TWO
    // declarations at once, the light media block's :not([data-theme='dark'])
    // guard and the standalone dark attribute block, so this arm grades the
    // behaviour while no single-line stylesheet mutation can redden it; the
    // `BJ-20` review measured exactly that redundancy, and this sentence is
    // the honest record of it rather than a ledger entry pretending otherwise.
    await page.emulateMedia({ colorScheme: 'light' });
    await settle(page);
    await expectGround(page, 'light');

    await chooseTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectGround(page, 'dark');

    await chooseTheme(page, 'system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
    await expectGround(page, 'light');
  });

  test('the play surface holds constant across all four combinations', async ({ page }) => {
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    await settle(page);

    const readings: string[] = [];
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await settle(page);
      readings.push(await surfaceBytes(page));
      for (const theme of ['dark', 'light'] as const) {
        await chooseTheme(page, theme);
        readings.push(await surfaceBytes(page));
      }
    }
    await chooseTheme(page, 'system');

    // The felt drew the same bytes eight times: two queries, the two overrides
    // on each, and a reading beside each change. The canvas is the theme's
    // whole surface, so this is the "does not flip" clause as identity.
    for (const reading of readings) {
      expect(reading, 'the play surface is the same in every combination').toBe(readings[0]);
    }
    expect(readings[0]?.length ?? 0, 'the surface actually drew something').toBeGreaterThan(1000);
  });
});
