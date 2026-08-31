/**
 * Item `I5`, Minor, over the built `dist/`.
 *
 *   "Reset all data is reachable from settings, requires confirmation, and
 *    clears every persisted value. Settings also states plainly that progress
 *    is stored in this browser only and can be cleared by the browser itself."
 *
 * Four clauses, and the third is read against the store itself rather than
 * against the page: `persistence.resetAll`'s documented contract is that the
 * stored key is REMOVED, so the assertion is `localStorage.getItem` answering
 * `null` after a confirmed reset, from inside the page, over the real store.
 * What the fresh page then shows is the second half of the same clause: a
 * first launch, from the 1,000 chips to the How-to-Play overlay, because the
 * seen flag was one of the cleared values.
 *
 * The cancel path is asserted as its own test, not as a step on the way to
 * the reset: a confirmation that cannot be refused is not one, and the
 * document that survives a cancelled reset is the evidence that nothing was
 * cleared early.
 *
 * The fourth clause rides the same panel: the sentence is asserted verbatim,
 * because "states plainly" is a wording clause and a paraphrase of it would
 * grade itself.
 */

import { expect, test, type Page } from '@playwright/test';

import { STORAGE_KEY } from '../../src/storage/document';

import { splitSeed } from './support/action-seeds';
import {
  bootGame,
  chip,
  control,
  numberIn,
  readoutValue,
  settle,
  shell,
  waitForPhase,
} from './support/game';
import { pressOn } from './support/game';

/** SPEC 14's own sentence, which the panel must carry word for word. */
const BROWSER_ONLY_SENTENCE =
  'Progress is stored in this browser only and can be cleared by the browser itself.';

/** The unlock mark the harness brings, so the reset has something to clear. */
const BEST_BALANCE = 10_000;

/** The wager the Gold round places, on Gold's own minimum. */
const WAGER = 100;

/** What the stored document says, read from inside the page. */
async function storedDocument(page: Page): Promise<string | null> {
  return page.evaluate((key: string) => window.localStorage.getItem(key), STORAGE_KEY);
}

/** Open Settings, the one route the item's first clause names. */
async function openSettings(page: Page): Promise<void> {
  await page.locator('[data-open-overlay="settings"]').click();
  await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
}

/** Play the seeded surrender round to its result, by state waits. */
async function surrenderRound(page: Page): Promise<void> {
  await chip(page, WAGER).click();
  await control(page, 'deal').click();
  // Every caller boots `splitSeed()`, so the round's shape is deterministic
  // and only the machine's pace varies: the drive waits on phases rather
  // than sleeping on a counter. The `BJ-20` review flagged the old
  // poll-and-sleep walker as the same unbounded wall clock the coach spec
  // timed out on under full-suite load.
  await expect(shell(page)).toHaveAttribute('data-phase', /insurance|playerTurn/, {
    timeout: 20_000,
  });
  if (((await shell(page).getAttribute('data-phase')) ?? '') === 'insurance') {
    await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
  }
  await waitForPhase(page, 'playerTurn');
  await pressOn(page, '[data-action="surrender"]', 'playerTurn');
  await waitForPhase(page, 'roundResult');
}

test.describe('I5: Reset all data', () => {
  test('is reachable from settings, with the browser-only sentence stated plainly', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(shell(page)).toBeVisible();
    await openSettings(page);

    const reset = control(page, 'reset-data');
    await expect(reset).toBeVisible();
    await expect(reset).toHaveText('Reset all data');
    await expect(page.locator('[data-panel="settings"]')).toContainText(BROWSER_ONLY_SENTENCE);
    // Nothing is armed on arrival: the confirmation is something the reset
    // asks for, not a state the panel boots in.
    await expect(control(page, 'confirm-reset')).toBeHidden();
  });

  test('requires confirmation, and cancelling clears nothing', async ({ page }) => {
    // A persisted state worth keeping: the harness brings Gold's unlock mark,
    // the round saves it at the real boundary, and the document is in the
    // store before anything is reset.
    await bootGame(page, { seed: splitSeed(), bestBalance: BEST_BALANCE, table: 'gold' });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await surrenderRound(page);
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'betting');
    expect(await storedDocument(page), 'the round boundary wrote the document').not.toBeNull();

    await openSettings(page);
    await control(page, 'reset-data').click();
    await expect(control(page, 'confirm-reset')).toBeVisible();

    await control(page, 'cancel-reset').click();
    await expect(control(page, 'confirm-reset')).toBeHidden();
    // The refusal is real: the document is still there, and still carries the
    // mark and the seat the round saved.
    expect(await storedDocument(page), 'a cancelled reset cleared nothing').not.toBeNull();
    const document = await storedDocument(page);
    expect(document, 'the kept document still names the unlock mark').toContain('10000');
  });

  test('clears every persisted value, and the page is a first launch again', async ({ page }) => {
    await bootGame(page, { seed: splitSeed(), bestBalance: BEST_BALANCE, table: 'gold' });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await surrenderRound(page);
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'betting');
    expect(await storedDocument(page)).not.toBeNull();

    await openSettings(page);
    await control(page, 'reset-data').click();
    await control(page, 'confirm-reset').click();

    // The store first: `resetAll`'s contract is that the key is gone, which is
    // the strictest reading of "clears every persisted value" and the one a
    // re-boot cannot fake, because a fresh document written after the reset
    // would put the key back and this reads before anything else can.
    await expect
      .poll(async () => storedDocument(page), { message: 'the stored key is removed' })
      .toBeNull();

    // And the page is the first launch: How to Play is showing, because the
    // seen flag was cleared with everything else.
    const host = page.locator('[data-overlay-host="true"]');
    await expect(host).toBeVisible();
    await expect(host).toHaveAttribute('data-open', 'howToPlay');
    await control(page, 'close-overlay').click();
    await expect(host).toBeHidden();
    await settle(page);

    await expect(shell(page)).toHaveAttribute('data-phase', 'start');
    await expect
      .poll(async () => numberIn(readoutValue(page, 'chips')), { message: 'the balance restarted' })
      .toBe(1000);
    await expect
      .poll(async () => numberIn(readoutValue(page, 'best-balance')), { message: 'the mark is gone' })
      .toBe(1000);
    // The unlock went with the mark: Gold is greyed again, with SPEC 6's
    // reason on it, exactly as a first launch shows it.
    await expect(page.locator('[data-table="gold"]')).toHaveAttribute('aria-disabled', 'true');
  });

  test('keeps the cleared session when removing browser storage is refused', async ({ page }) => {
    await bootGame(page, { seed: splitSeed(), bestBalance: BEST_BALANCE, table: 'gold' });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await surrenderRound(page);
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'betting');
    expect(await storedDocument(page)).not.toBeNull();

    await page.evaluate(() => {
      Storage.prototype.removeItem = (): never => {
        throw new DOMException('storage removal refused', 'SecurityError');
      };
    });

    await openSettings(page);
    await control(page, 'reset-data').click();
    await control(page, 'confirm-reset').click();

    // The platform kept the old bytes, but the persistence contract still
    // makes its cleared in-memory document authoritative for this session.
    expect(await storedDocument(page), 'the hostile store retained its old document').not.toBeNull();
    const host = page.locator('[data-overlay-host="true"]');
    await expect(host).toBeVisible();
    await expect(host).toHaveAttribute('data-open', 'howToPlay');
    await control(page, 'close-overlay').click();
    await expect(host).toBeHidden();
    await settle(page);

    await expect(shell(page)).toHaveAttribute('data-phase', 'start');
    await expect
      .poll(async () => numberIn(readoutValue(page, 'chips')), {
        message: 'the in-memory balance restarted',
      })
      .toBe(1000);
    await expect(page.locator('[data-table="gold"]')).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('I5 armour: the reduced-motion seam, through a real reload', () => {
  test("SPEC 14's always arm reaches the stylesheet, not only the frame", async ({ page }) => {
    // The boot pass-through the seam lacked: the setting is restored from the
    // document, resolved by the frame, written on the root, and answered by
    // the `:root[data-motion='reduce']` block, whose four declarations are
    // the media query's own. Reading the computed token after a reload is the
    // whole chain in one assertion, and the shell's attribute beside it is
    // the frame's own answer to the same question.
    await page.goto('/');
    await expect(shell(page)).toBeVisible();
    await openSettings(page);
    await page.locator('[data-motion-setting="always"]').click();
    await expect(page.locator('[data-motion-setting="always"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await control(page, 'close-overlay').click();
    await expect(shell(page)).toHaveAttribute('data-motion', 'reduce');

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);

    await expect(shell(page), 'the setting survived the reload').toHaveAttribute(
      'data-motion',
      'reduce',
    );
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        dur1: style.getPropertyValue('--dur-1').trim(),
        dur0: style.getPropertyValue('--dur-0').trim(),
      };
    });
    expect(tokens.dur1, 'the reduce block answered, with the query silent').toBe(tokens.dur0);
  });
});
