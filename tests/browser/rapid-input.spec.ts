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
  notice,
  readout,
  session,
  settle,
  shell,
  traceMotion,
  waitForPhase,
} from './support/game';
import { pressOn } from './support/game';
import { reasonText } from '../../src/ui/text';

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

// ---------------------------------------------------------------------------
// AUDIT-2, finding Z4-01: two presses of one toggle inside one frame
// ---------------------------------------------------------------------------

/**
 * The three SPEC 14 house-rule toggles, pressed more than once inside a frame.
 *
 * **This is not item `C6` and does not claim it.** The criterion above is about
 * intents through the machine's queue, and a settings control is not an intent:
 * SPEC 14's rules are staged through `ChromeActions.setRules`, which the panel
 * calls straight. What the queue's discipline gives the controls above is that a
 * second press is judged against the screen the first one produced; these three
 * had no equivalent, and finding `Z4-01` measured the cost. Each of them sent
 * the negation of a copy of the staged record that only the panel's per-frame
 * sync refreshed, so two presses between two frames both read the same stale
 * value, both sent the same patch, and the rule ended toggled once instead of
 * back where it started. Every other control in the panel is immune because it
 * sends an absolute value rather than a negation, and the play screen's mute
 * reads the engine's live state at press time.
 *
 * So the property asserted is parity: `n` presses inside one frame leave the
 * toggle flipped `n` times. The even arm is the finding's own construction and
 * the odd arm is its control, without which a handler that ignored every press
 * after the first would pass.
 */
test.describe('AUDIT-2 Z4-01: a house-rule toggle counts every press in a frame', () => {
  const TOGGLES = ['doubleAfterSplit', 'surrender', 'evenMoney'] as const;

  async function pressedState(page: Page, key: string): Promise<string> {
    return (await page.locator(`[data-rule="${key}"]`).getAttribute('aria-pressed')) ?? '';
  }

  test('returns to its own state on two presses, and flips on three', async ({ page }) => {
    await page.goto('/');
    await expect(shell(page)).toBeVisible();
    await page.locator('[data-open-overlay="settings"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    await settle(page);

    for (const key of TOGGLES) {
      const before = await pressedState(page, key);
      expect(before, `${key} reports no state at all`).toMatch(/true|false/);

      await burst(page, `[data-rule="${key}"]`, 2);
      await settle(page);
      expect(await pressedState(page, key), `${key} lost the second press`).toBe(before);

      await burst(page, `[data-rule="${key}"]`, 3);
      await settle(page);
      expect(await pressedState(page, key), `${key} ignored a burst of three`).toBe(
        before === 'true' ? 'false' : 'true',
      );

      // Left as it was found, so the toggles are independent of each other's
      // order in the loop and the sentence under them is the session's own.
      await burst(page, `[data-rule="${key}"]`, 1);
      await settle(page);
      expect(await pressedState(page, key), `${key} did not come back`).toBe(before);
    }
  });
});

// ---------------------------------------------------------------------------
// AUDIT-2, finding J1-01: a refusal beside an acceptance
// ---------------------------------------------------------------------------

/**
 * How long the notice carried a reason, in milliseconds, and what it said.
 *
 * A `MutationObserver` rather than a poll, because the whole question is
 * whether the sentence was ever on the page at all: the defect wrote it and
 * cleared it inside one frame, so a poll could truthfully report an empty
 * element having missed the write entirely. The observer records every write
 * with its timestamp, which is the finding's own instrument.
 */
async function noticeHistory(page: Page): Promise<{ reasons: string[]; heldFor: number }> {
  return page.evaluate(() => {
    const record = (
      window as unknown as { __bjNotice?: { at: number; reason: string | null }[] }
    ).__bjNotice;
    if (record === undefined) {
      throw new Error('the notice was never watched');
    }
    const reasons = record
      .map((write) => write.reason)
      .filter((reason): reason is string => reason !== null);
    const first = record.find((write) => write.reason !== null);
    if (first === undefined) {
      return { reasons, heldFor: 0 };
    }
    const cleared = record.find((write) => write.at > first.at && write.reason === null);
    return { reasons, heldFor: (cleared?.at ?? performance.now()) - first.at };
  });
}

/** Watch the notice line from now on. */
async function watchNotice(page: Page): Promise<void> {
  await page.evaluate(() => {
    const node = document.querySelector('[data-notice="reason"]');
    if (node === null) {
      throw new Error('there is no notice on this page');
    }
    const log: { at: number; reason: string | null }[] = [];
    new MutationObserver(() => {
      log.push({ at: performance.now(), reason: node.getAttribute('data-reason') });
    }).observe(node, { childList: true, characterData: true, attributes: true, subtree: true });
    (window as unknown as { __bjNotice?: typeof log }).__bjNotice = log;
  });
}

/**
 * Watch the polite live region from now on, and read back everything it was
 * written with.
 *
 * An observer rather than a poll, and the difference decides whether this can
 * be trusted: a live region holds the LAST thing said and the queue replaces it
 * a floor later, so a poll that samples the element is racing a value that is
 * meant to be transient. It lost that race on WebKit, which is slower and had
 * moved on to the player's turn by the time the first sample landed.
 */
async function watchPolite(page: Page): Promise<void> {
  await page.evaluate(() => {
    const node = document.querySelector('[data-live="polite"]');
    if (node === null) {
      throw new Error('there is no polite region on this page');
    }
    const log: string[] = [];
    new MutationObserver(() => {
      log.push(node.textContent ?? '');
    }).observe(node, { childList: true, characterData: true, subtree: true });
    (window as unknown as { __bjPolite?: string[] }).__bjPolite = log;
  });
}

async function politeWrites(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __bjPolite?: string[] }).__bjPolite ?? [],
  );
}

/**
 * SPEC 4.11's reason, when the press that earned it shared a frame with one
 * the machine accepted. `AUDIT-2`, finding `J1-01`.
 *
 * The criterion is `B15`'s and the mechanism is `C6`'s, which is why the arms
 * live here: they are two presses inside one tick, and what they grade is that
 * the second one does not decide whether the first is ever explained. The
 * finding measured the window at exactly one animation frame, so the reason
 * reached no surface at all: not the notice line, not the polite region, which
 * reads the same field, and not the mirror, which lists greyed controls rather
 * than refused ones.
 *
 * The route is the shipped page's own controls. Bronze's maximum is 100, so a
 * wager built to exactly 100 leaves the 10 chip **enabled**, its denomination
 * being legal, while the machine refuses the tap as over the ceiling. Deal is
 * accepted on the same frame and changes the phase, which is what used to
 * erase the reason before anything rendered.
 */
test.describe('B15: a refusal that shares a frame with an accepted intent', () => {
  test('still reaches the notice line and the polite region', async ({ page }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await control(page, 'max').click();
    await expect.poll(async () => (await readout(page)).wallet.wager).toBe(100);
    await expect(chip(page, 10), 'the chip is enabled; the tap is what is refused').toBeEnabled();

    await watchNotice(page);
    await watchPolite(page);
    // Both presses inside one `evaluate`, so they reach one drain: the chip tap
    // is refused and Deal is accepted, in that order.
    await page.evaluate(() => {
      const chipControl = document.querySelector('[data-chip="10"]');
      const deal = document.querySelector('[data-control="deal"]');
      if (!(chipControl instanceof HTMLElement) || !(deal instanceof HTMLElement)) {
        throw new Error('the betting screen is not the one this test expects');
      }
      chipControl.click();
      deal.click();
    });
    await expect(shell(page), 'the accepted Deal moved the phase').not.toHaveAttribute(
      'data-phase',
      'betting',
    );

    await page.waitForTimeout(400);
    const history = await noticeHistory(page);
    expect(history.reasons, 'the reason never reached the notice line').toContain('above-ceiling');
    // Long enough to be read, which is what the display window is for: the
    // defect held it for one frame, and the floor is 500 ms.
    expect(history.heldFor, 'the reason was on the page for one frame').toBeGreaterThan(100);
    // And the other surface the same field feeds. QUALITY-BAR section 4's queue
    // may take a floor to reach it, and it may have been replaced again by the
    // time this reads, so what is asserted is every write the region took.
    await expect
      .poll(async () => (await politeWrites(page)).join(' / '), { timeout: 5_000 })
      .toContain(reasonText('above-ceiling'));
  });

  test('still reaches them when the accepted press lands one frame later', async ({ page }) => {
    // The other side of the same window. Here the refusal has a frame of its
    // own, so it is rendered, and it is the **acceptance** that used to wipe it
    // on the next frame: the reason was on the page for the 16 ms between them.
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await control(page, 'max').click();
    await expect.poll(async () => (await readout(page)).wallet.wager).toBe(100);

    await watchNotice(page);
    await watchPolite(page);
    await chip(page, 10).click();
    await expect(notice(page)).toHaveAttribute('data-reason', 'above-ceiling');
    await control(page, 'deal').click();
    await expect(shell(page)).not.toHaveAttribute('data-phase', 'betting');

    await page.waitForTimeout(400);
    const history = await noticeHistory(page);
    expect(history.reasons).toContain('above-ceiling');
    expect(history.heldFor, 'the accepted press wiped the reason it followed').toBeGreaterThan(100);
    await expect
      .poll(async () => (await politeWrites(page)).join(' / '), { timeout: 5_000 })
      .toContain(reasonText('above-ceiling'));
  });
});
