/**
 * The driving and reading helpers more than one browser spec needs.
 *
 * Each of these was copied verbatim into two or three specs. None carries a
 * criterion, an expected value or a control: they answer a screen, read a
 * readout back, or put the page where a measurement can start from, which is
 * exactly the kind of scaffolding `support/` exists for. What stayed behind in
 * the specs is anything that differs, however slightly, because a helper that
 * is nearly the same in two places is two helpers and not one.
 *
 * Deliberately **not** moved, and each for a reason worth keeping:
 *
 *   - `playRound`, in `betting.spec.ts` and `speed-setting.spec.ts`, takes an
 *     action in one and none in the other. Two functions that share a name.
 *   - `answerToResult`, in `rapid-input.spec.ts` and `round-flow.spec.ts`, reads
 *     the phase off the harness readout in one and off the shell attribute in
 *     the other, and only one of them waits at the end. The difference is the
 *     point in both.
 *   - `expectWager` in `betting.spec.ts` polls a different reader against the
 *     shared phase timeout. The two below are the pair that agreed.
 */

import { expect, type Page } from '@playwright/test';

import { READOUT_KEYS } from '../../../src/ui/components/readouts';

import { control, numberIn, readoutValue, settle } from './game';

/** How many screens one round may ask about before the drive gives up. */
const ROUND_STEPS = 60;

/** How long a press may take to be answered, in milliseconds. */
const PRESS_TIMEOUT = 2000;

/** How long to leave a timed phase alone before looking again, in ms. */
const TIMED_PHASE_WAIT = 150;

/** Answer every screen that waits for the player until the round settles. */
export async function settleRound(page: Page): Promise<void> {
  for (let attempt = 0; attempt < ROUND_STEPS; attempt += 1) {
    const phase = (await page.locator('.bj-shell').getAttribute('data-phase')) ?? '';
    if (phase === 'roundResult') {
      return;
    }
    if (phase === 'insurance') {
      await control(page, 'decline-insurance')
        .click({ timeout: PRESS_TIMEOUT })
        .catch(() => undefined);
      continue;
    }
    if (phase === 'playerTurn') {
      await page
        .locator('[data-action="stand"]')
        .click({ timeout: PRESS_TIMEOUT })
        .catch(() => undefined);
      continue;
    }
    await page.waitForTimeout(TIMED_PHASE_WAIT);
  }
  throw new Error('the seeded round never settled');
}

/** Every readout of SPEC 11, as text, whatever bar or disclosure it is on. */
export async function readoutTexts(page: Page): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const key of READOUT_KEYS) {
    values[key] = (await readoutValue(page, key).textContent()) ?? '';
  }
  return values;
}

/**
 * Put the page back at the top before a layout is measured.
 *
 * Reaching a screen means clicking a control, and Playwright scrolls a control
 * into view before clicking it: the page arrives already scrolled, and a spec
 * that measured from there would be measuring a scroll position rather than a
 * layout.
 */
export async function scrollToTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await settle(page);
}

/** The wager on SPEC 11's readout, as a number. */
export async function wagerOf(page: Page): Promise<number> {
  return numberIn(readoutValue(page, 'wager'));
}

/**
 * Wait for SPEC 11's wager readout to reach a number, and require it.
 *
 * A poll rather than a read, and the reason is DESIGN section 3: a press is
 * **queued**, drained on the next frame and rendered by the sync at the end of
 * it, so a wager read in the same round trip as the press it followed is the
 * wager from before. The poll's failure message carries what the readout
 * actually said, so a wager that never arrives is still a readable failure.
 */
export async function expectWager(page: Page, wager: number): Promise<void> {
  await expect
    .poll(async () => wagerOf(page), { message: `the wager readout reaches ${String(wager)}` })
    .toBe(wager);
}
