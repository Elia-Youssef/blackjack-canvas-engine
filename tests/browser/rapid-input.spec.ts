/**
 * Item `C6`, Critical, over the built `dist/`.
 *
 *   "Rapid or duplicated input applies at most one accepted action per frame,
 *    and a double activation of a single-use control acts once."
 *
 * Two clauses, and the first is about FRAMES, so the assertions read the
 * machine once per animation frame through the harness's own sampler: five
 * chip presses delivered inside one tick are five queued intents, and the
 * drain accepts one of them per frame, so the balance can only ever step by
 * one chip between two consecutive samples. A machine that applied the queue
 * in a single drain would step by five, and the sampler is on the same frame
 * the drain is, so it cannot miss the step.
 *
 * The second clause is about SINGLE-USABLE controls: Deal, Take insurance and
 * Next Hand each act once however many times they are pressed inside one
 * tick, because the first acceptance changes the phase under the rest and the
 * drain discards rather than re-judges them, which is DESIGN section 3's
 * queued-click trap and the machine's own `drain` discipline. The presses are
 * delivered as real `click()`s on the real controls, back to back, inside one
 * `evaluate`, so they arrive as one burst the way a double-tap or a jittery
 * double-click does.
 *
 * **Routes.** The per-frame sampler and the accepted counts are the machine's
 * own readings, so the harness boots the page; the presses are the shipped
 * controls'. The insurance arm needs the Ace-up seed, which `flow-seeds`
 * found; the rest run on any deal.
 */

import { expect, test, type Page } from '@playwright/test';

import { aceUpRound, FLOW_WAGER } from './support/flow-seeds';
import {
  bootGame,
  chip,
  control,
  motionTrace,
  readout,
  session,
  settle,
  traceMotion,
  waitForPhase,
} from './support/game';
import { pressOn } from './support/game';

/**
 * Fire a control's click handler `times` over, inside one tick.
 *
 * Synchronous, not awaited per press: the whole burst lands in the queue
 * before the next frame drains any of it, which is the "rapid" the criterion
 * is about. The platform's own double activation is two of these.
 */
async function burst(page: Page, selector: string, times: number): Promise<void> {
  await page.evaluate(
    ([target, count]) => {
      const node = document.querySelector(String(target));
      if (!(node instanceof HTMLElement)) {
        throw new Error(`no ${String(target)} on this page`);
      }
      for (let press = 0; press < Number(count); press += 1) {
        node.click();
      }
    },
    [selector, times] as const,
  );
}

/** Step the machine's round to its result, standing whatever is asked. */
async function answerToResult(page: Page): Promise<void> {
  for (let step = 0; step < 300; step += 1) {
    const phase = (await readout(page)).phase.kind;
    if (phase === 'roundResult') {
      return;
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
  throw new Error('the round never reached its result');
}

test.describe('C6: rapid and duplicated input', () => {
  test('applies at most one accepted chip per frame, however many queue at once', async ({
    page,
  }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await settle(page);

    // The baseline is read in the same task as the burst, because the
    // sampler's first sample lands on the frame the burst drains: a baseline
    // taken any earlier would let a single-frame jump hide between it and the
    // first sample, which is exactly the defect this test exists to catch.
    await traceMotion(page);
    const baseline = (await readout(page)).wallet.wager;
    await burst(page, '[data-chip="10"]', 5);
    // Enough frames for the queue to drain at one per frame, and no more than
    // the wager the five chips built.
    await page.waitForTimeout(600);
    const trace = await motionTrace(page);

    // The wager is the per-frame observable a burst of chip presses moves:
    // SPEC 4.11 keeps the pending wager out of the balance until the deal, so
    // the balance would sit still and prove nothing about frames. The first
    // frame's reading is the step from the synchronous baseline, which is the
    // one frame the whole queue could have been applied in.
    const first = trace[0];
    const steps: number[] = first === undefined ? [] : [first.wager - baseline];
    for (let index = 1; index < trace.length; index += 1) {
      const before = trace[index - 1];
      const now = trace[index];
      if (before === undefined || now === undefined) {
        continue;
      }
      if (now.phase === 'betting' && before.phase === 'betting') {
        steps.push(now.wager - before.wager);
      }
    }
    // The sampler saw frames, and every one of them moved the wager by at
    // most one chip. A drain that applied the whole queue would step by 50 in
    // one frame and fail the second assertion, and a page that dropped the
    // queue would never reach 50 overall and fail the third.
    expect(steps.length, 'the sampler saw the burst').toBeGreaterThan(2);
    for (const step of steps) {
      expect(step, 'no frame accepted more than one chip').toBeLessThanOrEqual(10);
    }
    expect(trace[trace.length - 1]?.wager ?? 0, 'and every press was accepted in the end')
      .toBe(50);
  });

  test('deals one round from a double activation of Deal', async ({ page }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await chip(page, FLOW_WAGER).click();
    await expect
      .poll(async () => (await readout(page)).wallet.wager, { timeout: 20_000 })
      .toBe(FLOW_WAGER);

    await burst(page, '[data-control="deal"]', 2);

    // One round started: one hand, one committed wager, and the dealing phase
    // rather than a second refusal or a second hand.
    await expect
      .poll(async () => (await readout(page)).phase.kind, { timeout: 20_000 })
      .toBe('dealing');
    const during = await readout(page);
    expect(during.hands.length, 'one hand is in play').toBe(1);
    expect(during.wallet.committed, 'one wager is committed').toBe(FLOW_WAGER);

    await answerToResult(page);
    const finished = await readout(page);
    expect(finished.rounds, 'exactly one round was counted').toBe(1);
    expect(finished.phase.kind).toBe('roundResult');
  });

  test('takes insurance once from a double activation of Take', async ({ page }) => {
    const { seed } = aceUpRound();
    await bootGame(page, { seed });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await chip(page, FLOW_WAGER).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'insurance');

    await burst(page, '[data-control="take-insurance"]', 2);
    await answerToResult(page);

    // The result carries the one stake: SPEC 12's insurance field is the
    // settled side wager, and a double activation would have doubled the
    // stake or refused the second against a gone screen. This seed's dealer
    // has no natural, so the single stake settled at its own loss.
    const finished = await readout(page);
    expect(finished.phase.kind).toBe('roundResult');
    if (finished.phase.kind !== 'roundResult') {
      return;
    }
    expect(finished.phase.result.insurance, 'the stake was taken exactly once').toEqual(
      expect.objectContaining({ stake: FLOW_WAGER / 2, net: -FLOW_WAGER / 2 }),
    );
  });

  test('moves on once from a double activation of Next Hand', async ({ page }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await chip(page, FLOW_WAGER).click();
    await control(page, 'deal').click();
    await answerToResult(page);
    await expect
      .poll(async () => (await readout(page)).rounds, { timeout: 20_000 })
      .toBe(1);

    await burst(page, '[data-control="next-hand"]', 2);
    await waitForPhase(page, 'betting');

    // One round behind us, one clean betting screen ahead: the second Next
    // Hand was discarded against the screen that replaced the first, and the
    // history and the wager both say the page moved exactly one round on.
    const after = await readout(page);
    expect(after.rounds, 'still exactly one round counted').toBe(1);
    expect(after.wallet.wager, 'the new round starts from no wager').toBe(0);
    expect((await session(page)).history.length, 'one entry in the history').toBe(1);
  });
});
