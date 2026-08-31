/**
 * Item `C4`, Major, over the built `dist/`.
 *
 *   "Busting out offers a lower table or a free reset, and a reset restores
 *    1000 while preserving best balance, lifetime statistics, milestones and
 *    table unlocks. The start screen offers a table choice in which exactly
 *    the unlocked, affordable tables are enterable, and moving between them
 *    takes effect. Change Table on the betting screen returns to that choice
 *    only while no wager is placed, with the balance intact."
 *
 * Four clauses, run over one real played-down bankroll. The bust-out is not a
 * boot option and cannot be staged: SPEC 4.12 fires it on a balance below the
 * table minimum, so the round that reaches it is a Gold round wagered at 950
 * of a 1,000 chip bankroll and lost, on the seed `bustOutSeed()` finds, with
 * the unlock mark the harness brings so Gold is seated at all. What is left
 * after it, 50 chips, is above both lower tables' minimums, which is what
 * makes the screen offer the drop as well as the reset.
 *
 * The chooser's "exactly the unlocked, affordable" is graded in both
 * directions on one journey: at 50 chips Silver is affordable and Gold is
 * not, though the mark unlocks both, so the same start screen carries one
 * enterable table the mark paid for and one it did not, plus the free Bronze.
 *
 * Change Table is SPEC 10's own edge: legal only with no wager placed, and a
 * pending wager "blocks it with a reason and is never silently cleared", which
 * is the notice the refusal surfaces, asserted as the machine's answer rather
 * than a grey-out the criterion does not ask for.
 */

import { expect, test, type Page } from '@playwright/test';

import { BUST_OUT_WAGER, bustOutSeed } from './support/action-seeds';
import {
  bootGame,
  chip,
  control,
  numberIn,
  readoutValue,
  session,
  settle,
  shell,
  waitForPhase,
} from './support/game';
import { pressOn } from './support/game';

/** The unlock mark the harness brings, which is what seats Gold at all. */
const BEST_BALANCE = 10_000;

/** Build the 950 wager `BUST_OUT_WAGER` names, out of the chip tray. */
async function wagerEverything(page: Page): Promise<void> {
  for (const denomination of [500, 100, 100, 100, 100, 50] as const) {
    await chip(page, denomination).click();
  }
  await expect
    .poll(async () => numberIn(readoutValue(page, 'wager')), { timeout: 20_000 })
    .toBe(BUST_OUT_WAGER);
}

/** Play the round out, standing the first hand the player is offered. */
async function loseTheRound(page: Page): Promise<void> {
  await control(page, 'deal').click();
  for (let step = 0; step < 300; step += 1) {
    const phase = (await shell(page).getAttribute('data-phase')) ?? '';
    if (phase === 'roundResult') {
      await waitForPhase(page, 'roundResult');
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

/** Drive a fresh harness game to the bust-out screen and stop there. */
async function atBustOut(page: Page): Promise<void> {
  await bootGame(page, { seed: bustOutSeed(), table: 'gold', bestBalance: BEST_BALANCE });
  await waitForPhase(page, 'start');
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
  await wagerEverything(page);
  await loseTheRound(page);
  await control(page, 'next-hand').click();
  await waitForPhase(page, 'bustOut');
}

test.describe('C4: busting out', () => {
  test('offers the lower tables and the free reset, with the balance said out loud', async ({
    page,
  }) => {
    await atBustOut(page);

    await expect(page.locator('[data-screen="bust-out"]')).toBeVisible();
    // Both routes on one screen, which is SPEC 4.12's sentence as controls.
    await expect(page.locator('[data-drop-table="bronze"]')).toBeVisible();
    await expect(page.locator('[data-drop-table="silver"]')).toBeVisible();
    await expect(control(page, 'reset-bankroll')).toBeVisible();
    // Gold is neither offered as a drop nor present as one: a drop goes down.
    await expect(page.locator('[data-drop-table="gold"]')).toHaveCount(0);
  });

  test('the free reset restores 1,000 and preserves the mark, the statistics and the unlocks', async ({
    page,
  }) => {
    await atBustOut(page);

    // What the round left: one lifetime hand, the mark, and the milestones the
    // mark awarded, all read before the reset so the after is a comparison
    // rather than a hope.
    const before = await session(page);
    expect(before.statistics.lifetime.handsPlayed).toBe(1);
    expect(before.statistics.milestones).toContain('reachedGold');

    await control(page, 'reset-bankroll').click();
    await waitForPhase(page, 'betting');

    await expect
      .poll(async () => numberIn(readoutValue(page, 'chips')), { timeout: 20_000 })
      .toBe(1000);
    // SPEC 4.12 seats the reset at the lowest table, and the limits readout
    // says whose minimums now govern.
    await expect
      .poll(async () => readoutValue(page, 'table').textContent(), { timeout: 20_000 })
      .toContain('Bronze');
    await expect
      .poll(async () => numberIn(readoutValue(page, 'best-balance')), { timeout: 20_000 })
      .toBe(BEST_BALANCE);

    const after = await session(page);
    expect(after.statistics.lifetime.handsPlayed, 'lifetime statistics survived').toBe(1);
    expect(after.statistics.milestones, 'milestones survived').toContain('reachedGold');
    expect(after.history.length, 'history survived').toBe(1);
  });

  test('dropping to a lower table takes effect, and the chooser is exact at 50 chips', async ({
    page,
  }) => {
    await atBustOut(page);

    await page.locator('[data-drop-table="silver"]').click();
    await waitForPhase(page, 'betting');
    await expect
      .poll(async () => readoutValue(page, 'table').textContent(), { timeout: 20_000 })
      .toContain('Silver');
    await expect
      .poll(async () => numberIn(readoutValue(page, 'chips')), { timeout: 20_000 })
      .toBe(50);

    // Change Table with no wager placed returns to the choice, balance intact.
    await control(page, 'change-table').click();
    await waitForPhase(page, 'start');

    // The chooser at 50 chips: the mark unlocks Silver and Gold both, but only
    // Silver's minimum is affordable, so exactly Bronze and Silver are
    // enterable and Gold carries SPEC 6's reason. "Exactly" is the criterion's
    // word, so the disabled direction is asserted, not implied.
    for (const id of ['bronze', 'silver']) {
      await expect(page.locator(`[data-table="${id}"]`)).not.toHaveAttribute(
        'aria-disabled',
        /.*/,
      );
    }
    const gold = page.locator('[data-table="gold"]');
    await expect(gold).toHaveAttribute('aria-disabled', 'true');
    await expect(gold).toContainText('Gold');
    // The grey-out carries a reason on its accessible name, which is where
    // `BJ-18` put every refusal a control can carry. `BJ-20` found the
    // sentence naming the lock rather than the balance and reported it to the
    // owner rather than pinning it, because blessing that wording on the
    // affordability case would have graded a sentence that is not quite the
    // fact. `BJ-21`'s approved rider split it by cause, so the fact can be
    // pinned now: this player's mark has unlocked Gold and it is today's
    // balance that stops them, and the name says so rather than telling them
    // to go and win a threshold they passed two rounds ago.
    await expect(gold).toHaveAttribute('aria-label', /below that table minimum/i);
    await expect(gold).not.toHaveAttribute('aria-label', /unlocks at a higher/i);

    // And the chrome's own press refusal holds: the platform still delivers
    // a press to an `aria-disabled` control, by design, and the one activation
    // site in `dom.ts` refuses it. The click is dispatched rather than driven,
    // because a driver's own actionability check would refuse it first and
    // prove nothing about the page.
    await gold.evaluate((node) => {
      if (node instanceof HTMLElement) {
        node.click();
      }
    });
    await settle(page);
    await expect(shell(page)).toHaveAttribute('data-phase', 'start');
    await expect(gold).toHaveAttribute('aria-pressed', 'false');
  });

  test('Change Table with a wager pending is refused with a reason and clears nothing', async ({
    page,
  }) => {
    await atBustOut(page);
    await page.locator('[data-drop-table="bronze"]').click();
    await waitForPhase(page, 'betting');

    await chip(page, 10).click();
    await expect
      .poll(async () => numberIn(readoutValue(page, 'wager')), { timeout: 20_000 })
      .toBe(10);

    await control(page, 'change-table').click();
    // Still betting, wager intact, and the refusal said why: SPEC 10's "never
    // silently cleared" is the wager surviving the attempt to leave.
    await expect(shell(page)).toHaveAttribute('data-phase', 'betting');
    await expect
      .poll(async () => numberIn(readoutValue(page, 'wager')), { timeout: 20_000 })
      .toBe(10);
    await expect(page.locator('[data-notice="reason"]')).toContainText(/wager/i);

    // Cleared, the same control leaves: the round trip with the balance intact.
    await control(page, 'clear').click();
    await expect
      .poll(async () => numberIn(readoutValue(page, 'wager')), { timeout: 20_000 })
      .toBe(0);
    await control(page, 'change-table').click();
    await waitForPhase(page, 'start');
    await expect
      .poll(async () => numberIn(readoutValue(page, 'chips')), { timeout: 20_000 })
      .toBe(50);
  });
});
