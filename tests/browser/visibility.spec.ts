/**
 * Item `C7`, Major, over the built `dist/`.
 *
 *   "Hiding the tab pauses animation and preserves full game state; restoring
 *    it resumes with no card, wager or phase changed and no penalty applied."
 *
 * Three clauses, and the instrument for each is state identity rather than a
 * measured duration:
 *
 *   - **Pauses animation** is the machine's own accumulator standing still
 *     while the page is hidden for real wall-clock time longer than a whole
 *     deal step. The loop stops on the `visibilitychange` the page fires, and
 *     the proof it stopped is that `elapsed`, the float accumulator DESIGN
 *     section 3 centres everything on, is the same number after the wait as
 *     before it.
 *   - **Preserves full game state** is one deep comparison of the whole
 *     snapshot: cards, wager, balance, committed stake, shoe count, dealer
 *     cards visible and concealed, phase and its payload. Nothing may move,
 *     because nothing was asked to.
 *   - **Restoring resumes with no penalty** is the same round continuing to
 *     its result afterwards, from the exact accumulator it paused at: the
 *     resumed frame is the first frame of a fresh run, which is the loop's
 *     own clause, and the machine is never handed the hidden interval.
 *
 * The tab is hidden the only way a test can hide it on all three engines:
 * the document's own `visibilityState` is shadowed and the `visibilitychange`
 * event is dispatched for real, so the page's listener, the platform's event
 * machinery and the loop's stop are all exercised. `pagehide`, the other hook
 * QUALITY-BAR section 7 names, is driven the same way and asserted never to
 * restart: a page that left is not a page that hid.
 *
 * **Routes.** The state is the machine's, so the harness boots the page; the
 * pause and the resume are the shipped loop's own behaviour, with nothing
 * patched.
 */

import { expect, test, type Page } from '@playwright/test';

import {
  bootGame,
  chip,
  control,
  readout,
  settle,
  waitForPhase,
} from './support/game';

/** Longer than a whole deal step, so a running loop would advance through it. */
const HIDDEN_FOR_MS = 800;

/**
 * The state a hidden tab must hold exactly: everything about the round, the
 * money and the shoe, with the phase's payload in full.
 */
async function frozenState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    const snapshot = api.readout();
    return {
      phase: snapshot.phase,
      elapsed: snapshot.elapsed,
      rounds: snapshot.rounds,
      splits: snapshot.splits,
      hands: snapshot.hands,
      dealerVisible: snapshot.dealerVisible,
      dealerConcealed: snapshot.dealerConcealed,
      wallet: {
        chips: snapshot.wallet.chips,
        wager: snapshot.wallet.wager,
        committed: snapshot.wallet.committed,
        insuranceStake: snapshot.wallet.insuranceStake,
        deferredStake: snapshot.wallet.deferredStake,
        bestBalance: snapshot.wallet.bestBalance,
      },
      shoe: snapshot.shoe,
    };
  });
}

/** Hide the tab for real, returning the state as it was at the moment of hiding. */
async function hideTab(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    const snapshot = api.readout();
    const state = {
      phase: snapshot.phase,
      elapsed: snapshot.elapsed,
      rounds: snapshot.rounds,
      splits: snapshot.splits,
      hands: snapshot.hands,
      dealerVisible: snapshot.dealerVisible,
      dealerConcealed: snapshot.dealerConcealed,
      wallet: {
        chips: snapshot.wallet.chips,
        wager: snapshot.wallet.wager,
        committed: snapshot.wallet.committed,
        insuranceStake: snapshot.wallet.insuranceStake,
        deferredStake: snapshot.wallet.deferredStake,
        bestBalance: snapshot.wallet.bestBalance,
      },
      shoe: snapshot.shoe,
    };
    // The snapshot and the hide are one task, so no animation frame can run
    // between reading the state and stopping the thing that moves it.
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    return state as Record<string, unknown>;
  });
}

/** Show the tab again, the same way it was hidden. */
async function showTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    // The own property the hide defined shadows the prototype's getter, so
    // removing it restores the platform's own answer, which is the visible
    // tab the test never actually left.
    Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** Fire the pagehide the section also names, without leaving. */
async function firePageHide(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

test.describe('C7: hiding the tab', () => {
  test('pauses the deal mid-count and holds the whole state while hidden', async ({ page }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await chip(page, 50).click();
    await control(page, 'deal').click();
    // The dealing phase is the paced one, so the accumulator is mid-count and
    // a running loop would have moved it through the hidden interval.
    await waitForPhase(page, 'dealing');

    const hidden = await hideTab(page);
    const duringPhase = await readout(page);
    expect(duringPhase.phase.kind, 'the hiding caught the deal in progress').toBe('dealing');

    await page.waitForTimeout(HIDDEN_FOR_MS);
    await expect(await frozenState(page), 'nothing moved while nobody could see').toEqual(hidden);

    await showTab(page);
    // The round resumes from the accumulator it paused at and finishes: the
    // phase leaves dealing and passes through whatever screens the deal
    // opened, an unseeded round's insurance question included, and reaches the
    // result without a restart or a replay.
    for (let step = 0; step < 300; step += 1) {
      const phase = (await readout(page)).phase.kind;
      if (phase === 'roundResult') {
        break;
      }
      if (phase === 'insurance') {
        await page.locator('[data-control="decline-insurance"]').click();
        await page.waitForTimeout(100);
        continue;
      }
      if (phase === 'playerTurn') {
        await page.locator('[data-action="stand"]').click();
        await page.waitForTimeout(100);
        continue;
      }
      await page.waitForTimeout(100);
    }
    await waitForPhase(page, 'roundResult');
    const finished = await readout(page);
    expect(finished.phase.kind).toBe('roundResult');
    expect(finished.wallet.wager, 'the wager was neither doubled nor returned by the pause')
      .toBe(0);
    expect(finished.rounds, 'exactly the one round, once').toBe(1);
  });

  test('keeps the state after the pause and applies no penalty to it', async ({ page }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await settle(page);
    const before = await frozenState(page);

    await hideTab(page);
    await page.waitForTimeout(HIDDEN_FOR_MS);
    await showTab(page);
    await settle(page);

    // Back on the betting screen, with no round running: the same balance, no
    // wager invented, no phase moved. That is the "no penalty applied" clause
    // on the quietest screen, where a penalty could only have come from the
    // pause itself.
    await expect(await frozenState(page)).toEqual(before);
  });

  test('pagehide stops the loop for good, where a hidden tab resumes', async ({ page }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await chip(page, 50).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'dealing');

    await firePageHide(page);
    const left = await frozenState(page);
    await page.waitForTimeout(HIDDEN_FOR_MS);
    await expect(await frozenState(page), 'a page that left does not animate').toEqual(left);

    // And it does not come back on a visible event, because leaving is not
    // hiding: the loop that `pagehide` stopped stays stopped.
    await showTab(page);
    await page.waitForTimeout(200);
    await expect(await frozenState(page), 'the page that left stays stopped').toEqual(left);
  });
});
