/**
 * Item `C1`, Critical, over the built `dist/`.
 *
 *   "A complete round runs end to end through every phase in order: betting,
 *    dealing, insurance where the up card is an Ace, peek, player actions,
 *    reveal, dealer play, settlement, round result, next hand."
 *
 * The criterion is the ORDER, not the destinations. A spec that waited for
 * each phase in turn would pass over a round that visited them out of order or
 * twice, so the assertion here is a log of every phase the shell carried
 * through one round, compared element for element with SPEC 10's own
 * sequence. The log is the shipped page's own phase observer
 * (`watchPhases`), a `MutationObserver` on the one attribute the chrome sync
 * writes per frame, so nothing is injected and nothing is asked of the game
 * that the page does not already publish.
 *
 * Two rounds carry the two readings of the diagram's middle:
 *
 *   - an **Ace-up** round, where the insurance question is asked and only
 *     then the peek runs, which is SPEC 4.4's "the offer always closes before
 *     any peek result is applied" as an order of screens;
 *   - a **ten-value-up** round, where the peek runs with no offer to make,
 *     which is SPEC 10's "that branch goes straight to PEEK".
 *
 * Both continue through the player's action, the reveal, the dealer's paced
 * draws, the settlement and the result, and the second half of the criterion,
 * "next hand", returns the page to the betting screen and starts a second
 * round, so the cycle and not just the arc is what is graded.
 *
 * **Routes.** The two seeded rounds take the harness, because a known up card
 * is not reachable on the shipped page's clock-driven seed. The "next hand"
 * cycle runs on the shipped page with nothing injected: any round closes it.
 */

import { expect, test, type Page } from '@playwright/test';

import { aceUpRound, tenUpRound, FLOW_WAGER } from './support/flow-seeds';
import {
  bootGame,
  chip,
  control,
  phaseTimings,
  settle,
  shell,
  waitForPhase,
  watchPhases,
} from './support/game';
import { pressOn } from './support/game';

/** SPEC 10's order for an Ace-up round, from the betting screen to the result. */
const ACE_UP_ORDER: readonly string[] = Object.freeze([
  'betting',
  'dealing',
  'insurance',
  'peek',
  'playerTurn',
  'reveal',
  'dealerTurn',
  'settling',
  'roundResult',
]);

/** The same order with the offer absent, which is the ten-value up card's arm. */
const TEN_UP_ORDER: readonly string[] = Object.freeze([
  'betting',
  'dealing',
  'peek',
  'playerTurn',
  'reveal',
  'dealerTurn',
  'settling',
  'roundResult',
]);

/**
 * The phase names one round passed through, from a recorded log.
 *
 * The log starts while the page is on `betting` and stops at `roundResult`,
 * and `start` is excluded by where the recording begins rather than by
 * filtering it out, so a round that somehow went BACK to the start screen is
 * a failure with the evidence in the list, not a silently trimmed one.
 */
function phasesOf(log: readonly { phase: string }[]): readonly string[] {
  const names: string[] = [];
  for (const entry of log) {
    if (names[names.length - 1] !== entry.phase) {
      names.push(entry.phase);
    }
  }
  return names;
}

/** Answer whatever the round asks, standing every hand, to its result. */
async function answerToResult(page: Page): Promise<void> {
  for (let step = 0; step < 300; step += 1) {
    const phase = (await shell(page).getAttribute('data-phase')) ?? '';
    if (phase === 'roundResult') {
      await waitForPhase(page, 'roundResult');
      return;
    }
    if (phase === 'insurance') {
      // The offer closes before any peek result is applied, and the decline is
      // the arm that leaves the round's outcome alone.
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
  throw new Error('the round never reached its result');
}

/** Wager, deal, and answer the round to its result. */
async function playOut(page: Page): Promise<void> {
  await chip(page, FLOW_WAGER).click();
  await control(page, 'deal').click();
  await answerToResult(page);
}

test.describe('C1: a complete round through every phase in order', () => {
  test('walks the Ace-up order, insurance before peek, to the result', async ({ page }) => {
    const { seed } = aceUpRound();
    await bootGame(page, { seed });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');

    // The log starts on the betting screen, before the deal, so the whole of
    // the criterion's order is in what it records.
    await watchPhases(page);
    await chip(page, FLOW_WAGER).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'insurance');
    // The insurance screen is a screen: its two controls are present while the
    // question is the phase, which is the criterion's "insurance where the up
    // card is an Ace" as something the player can act on rather than a label.
    await expect(control(page, 'take-insurance')).toBeVisible();
    await expect(control(page, 'decline-insurance')).toBeVisible();

    await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
    // The stand waits for its screen, because the peek sits between the two
    // and a press aimed through it is exactly the queued-click trap DESIGN
    // section 3 exists to stop.
    await waitForPhase(page, 'playerTurn');
    await pressOn(page, '[data-action="stand"]', 'playerTurn');
    await waitForPhase(page, 'roundResult');

    expect(phasesOf(await phaseTimings(page))).toEqual(ACE_UP_ORDER);
    // The result screen is a screen too: SPEC 12's Next Hand is what leaves it.
    await expect(control(page, 'next-hand')).toBeVisible();
  });

  test('walks the ten-up order, a peek with no offer, to the result', async ({ page }) => {
    const { seed } = tenUpRound();
    await bootGame(page, { seed });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');

    await watchPhases(page);
    await playOut(page);
    expect(phasesOf(await phaseTimings(page))).toEqual(TEN_UP_ORDER);
    // And the arm never offered: no insurance screen existed to answer, which
    // the order above already states and the controls confirm in the negative.
    await expect(control(page, 'take-insurance')).toBeHidden();
  });

  test('closes the cycle: next hand returns to betting and a second round runs', async ({
    page,
  }) => {
    // The shipped page, nothing injected: the cycle is the part of the
    // criterion any round closes, and the second round proves the machine came
    // back to a state that can deal again rather than to a dead end.
    await page.goto('/');
    await expect(shell(page)).toBeVisible();
    await settle(page);
    if ((await shell(page).getAttribute('data-overlay')) === 'howToPlay') {
      await control(page, 'close-overlay').click();
    }
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');

    await watchPhases(page);
    await playOut(page);
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'betting');

    const roundOne = phasesOf(await phaseTimings(page));
    expect(roundOne[0], 'the recorded round began at the betting screen').toBe('betting');
    expect(roundOne[roundOne.length - 1], 'the cycle returned to the betting screen').toBe(
      'betting',
    );
    expect(roundOne, 'the round ran end to end between them').toContain('roundResult');

    // The felt was swept and the wager starts from nothing, which is the
    // machine's own answer that this is a fresh round.
    await expect
      .poll(async () => numberOrNull(page, 'wager'), { timeout: 20_000 })
      .toBe(0);
    await chip(page, FLOW_WAGER).click();
    await control(page, 'deal').click();
    await answerToResult(page);
    // The shipped page publishes its count as SPEC 11's session readout, which
    // is two hands played once the second round has settled, and a count
    // nothing could have reached without the cycle really turning.
    await expect
      .poll(async () => numberOrNull(page, 'hands-played'), { timeout: 20_000 })
      .toBe(2);
  });
});

/** One readout as a number, or null when it has not rendered yet. */
async function numberOrNull(page: Page, key: string): Promise<number | null> {
  const text = await page.locator(`[data-readout="${key}"] .bj-readout__value`).textContent();
  if (text === null || text.trim() === '-' || text.trim() === '') {
    return null;
  }
  const digits = text.replace(/\u2212/g, '-').replace(/[^\d.-]/g, '');
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}
