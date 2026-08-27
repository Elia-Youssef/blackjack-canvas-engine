/**
 * Item `J4`, Minor, over the built `dist/`.
 *
 *   "Coach modes off, hint and review each behave as specified, the coach
 *    never blocks an action, and decision accuracy is tracked for both session
 *    and lifetime."
 *
 * Four clauses, and the rounds that carry them are built to make each one
 * decidable rather than lucky:
 *
 *   - **Off records nothing**: a played round with decisions in it leaves both
 *     accuracy scopes at zero decisions, which is SPEC 7's "off by default"
 *     as a count rather than an absence of UI.
 *   - **Hint marks before the act and never blocks**: exactly one of the five
 *     action controls carries the hint, it is never the one the rules grey
 *     out (the recommendation is the first LEGAL action in its cell), and a
 *     DIFFERENT action pressed in the same breath is accepted, which is the
 *     clause the item exists for.
 *   - **Review records after the act**: the round is driven to a hand of hard
 *     17 or more and then hit once, which basic strategy never recommends, so
 *     a mismatched verdict exists to be recorded and printed; the counts are
 *     read off the session for both scopes.
 *   - **Both scopes, across a reload**: the session resets and the lifetime
 *     survives, which is SPEC 13's sentence and I4's wiring, asserted on the
 *     accuracy figures themselves.
 *
 * The mid-round switch is the project's own ruling, asserted because this spec
 * touches it: turning the coach off after a decision leaves the verdict
 * already recorded in that round's result, which is deliberate and documented
 * at the recording site in `main.ts`.
 *
 * **Routes.** The counts and the journal are the machine's and the session's,
 * so the harness boots the page; the mode control, the hint mark and the
 * result's coach line are the shipped chrome's own DOM.
 */

import { expect, test, type Page } from '@playwright/test';

import { splitSeed } from './support/action-seeds';
import { coachMismatchRound } from './support/flow-seeds';
import {
  bootGame,
  chip,
  control,
  readout,
  session,
  settle,
  shell,
  waitForPhase,
} from './support/game';
import { pressOn } from './support/game';

/** The wager every round here places. */
const WAGER = 50;

/** Open Settings, choose a coach mode, and close the panel again. */
async function chooseCoachMode(page: Page, mode: 'off' | 'hint' | 'review'): Promise<void> {
  await page.locator('[data-open-overlay="settings"]').click();
  const button = page.locator(`[data-panel="settings"] [data-coach-mode="${mode}"]`);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await control(page, 'close-overlay').click();
  await settle(page);
}

/** Deal one round, declining any offer, and stop at the turn or the result. */
async function dealOnce(page: Page): Promise<'playerTurn' | 'settled'> {
  await chip(page, WAGER).click();
  await control(page, 'deal').click();
  for (let step = 0; step < 200; step += 1) {
    const phase = (await shell(page).getAttribute('data-phase')) ?? '';
    if (phase === 'playerTurn') {
      await waitForPhase(page, 'playerTurn');
      return 'playerTurn';
    }
    if (phase === 'roundResult') {
      await waitForPhase(page, 'roundResult');
      return 'settled';
    }
    if (phase === 'insurance') {
      await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
      await page.waitForTimeout(100);
      continue;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('the round reached neither a turn nor a result');
}

/**
 * Deal until a round hands the player a decision.
 *
 * An unseeded round can settle before the player acts, on a dealer natural,
 * and a spec that needed a decision would be waiting on a screen that is gone.
 * The retry is the player's own route: Next Hand, wager, Deal.
 */
async function dealToTurn(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await dealOnce(page)) === 'playerTurn') {
      return;
    }
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'betting');
  }
  throw new Error('no round inside the attempts reached the player turn');
}

/** Stand every hand the round still asks about, to the result. */
async function standToResult(page: Page): Promise<void> {
  for (let step = 0; step < 300; step += 1) {
    const phase = (await shell(page).getAttribute('data-phase')) ?? '';
    if (phase === 'roundResult') {
      await waitForPhase(page, 'roundResult');
      return;
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

test.describe('J4: the strategy coach', () => {
  test('records nothing while off, in either scope', async ({ page }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    // Off is the default, which is half of what the clause asserts; the other
    // half is that a round with decisions in it leaves the counts at zero.
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await dealToTurn(page);
    await pressOn(page, '[data-action="hit"]', 'playerTurn');
    await standToResult(page);

    const counted = await session(page);
    expect(counted.coach.session.decisions, 'no session decisions were counted').toBe(0);
    expect(counted.coach.lifetime.decisions, 'no lifetime decisions were counted').toBe(0);

    await page.locator('[data-open-overlay="statistics"]').click();
    await expect(page.locator('[data-stat="session-accuracy"]')).toHaveText('-');
    await expect(page.locator('[data-stat="lifetime-accuracy"]')).toHaveText('-');
  });

  test('hints the recommendation before the act, and blocks nothing', async ({ page }) => {
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await chooseCoachMode(page, 'hint');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await dealToTurn(page);

    // Exactly one action carries the mark, and it is not one the rules grey
    // out: the recommendation walks its cell down to the first legal action,
    // so a hint on a refused control would be two readings disagreeing.
    const hinted = page.locator('.bj-actions button[data-hint="true"]');
    await expect
      .poll(async () => (await hinted.count()), { timeout: 20_000 })
      .toBe(1);
    await expect(hinted).not.toHaveAttribute('aria-disabled', /.*/);
    await expect(hinted).toHaveAttribute('aria-label', /Recommended by the coach/);

    // And a different action is free to happen: the coach never blocks. The
    // press lands on whatever the hint did not name, provided the rules allow
    // it, and the machine accepts it.
    const hintedKind = await hinted.getAttribute('data-action');
    const snapshot = await readout(page);
    const hand = snapshot.hands[0];
    const cardsBefore = hand?.cards.length ?? 0;
    const alternative = hintedKind === 'hit' ? 'stand' : 'hit';
    await pressOn(page, `[data-action="${alternative}"]`, 'playerTurn');
    await expect
      .poll(async () => (await readout(page)).hands[0]?.cards.length, { timeout: 20_000 })
      .not.toBe(cardsBefore);

    // The hint follows the hand it is advising: after the press the mark is on
    // the next decision or gone with the hand, and never multiplies.
    const marked = await hinted.count();
    expect(marked).toBeLessThanOrEqual(1);
  });

  test('hinting costs a greyed control its refusal reason', async ({ page }) => {
    // The review's finding: the hint's aria-label write removed the reason
    // `setDisabled` composes for every greyed action, so a disabled Double
    // read as plain "Double" the moment the coach was in hint mode. The two
    // must coexist, and the case is built where they genuinely meet: hint mode
    // on, and a hand whose three cards refuse the two-card actions.
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await chooseCoachMode(page, 'hint');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await dealToTurn(page);

    await pressOn(page, '[data-action="hit"]', 'playerTurn');
    await expect
      .poll(async () => (await readout(page)).hands[0]?.cards.length, { timeout: 20_000 })
      .toBeGreaterThan(2);

    // The greyed control keeps its reason, with the hint marking elsewhere.
    const doubled = page.locator('[data-action="double"]');
    await expect(doubled).toHaveAttribute('aria-disabled', 'true');
    await expect(doubled, 'the refusal reason survived the hint mode').toHaveAttribute(
      'aria-label',
      /Double\.\s/,
    );
    await expect(page.locator('.bj-actions button[data-hint="true"]')).toHaveCount(1);
  });

  test('review records the verdicts after the act, in both scopes, across a reload', async ({
    page,
  }) => {
    // The round is hunted headlessly, never retried live: `coachMismatchRound`
    // finds the seed whose first round climbs to a hard 17-to-20 and then hits
    // once more, the hit no chart in SPEC 7's matrix recommends, so the
    // mismatch is a property of the seed rather than a hope of the drive. The
    // `BJ-20` review timed the live-retry shape out under full-suite load on
    // the slowest engine (up to eight rounds against one 30 second budget);
    // this drive is one seeded round, and the shape assertions below still
    // hold the hunt honest the day a rules change stales the seed.
    const { seed, climbs } = coachMismatchRound();
    await bootGame(page, { seed });
    await waitForPhase(page, 'start');
    await chooseCoachMode(page, 'review');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');

    await dealToTurn(page);
    // The climb plus the mismatching hit, counted onto the felt one card at a
    // time so no press can race the frame that applies its predecessor.
    let cards = (await readout(page)).hands[0]?.cards.length ?? 0;
    expect(cards, 'the hunted round opens on its two dealt cards').toBe(2);
    for (let hit = 0; hit < climbs + 1; hit += 1) {
      await pressOn(page, '[data-action="hit"]', 'playerTurn');
      cards += 1;
      await expect
        .poll(async () => (await readout(page)).hands[0]?.cards.length ?? 0, { timeout: 20_000 })
        .toBe(cards);
    }
    await standToResult(page);

    const counted = await session(page);
    expect(counted.coach.session.decisions, 'the session counted the decisions').toBeGreaterThan(
      1,
    );
    expect(
      counted.coach.session.matched,
      'and the 17-plus hit was recorded as a mismatch',
    ).toBeLessThan(counted.coach.session.decisions);

    // SPEC 12's coach line, on the round result a player reads.
    await expect(page.locator('[data-screen="round-result"]')).toContainText(/basic strategy/);

    // The lifetime scope is the same counts plus everything before, and it is
    // the one a reload keeps: SPEC 13's two sentences as two figures.
    expect(counted.coach.lifetime.decisions).toBe(counted.coach.session.decisions);
    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);
    if ((await shell(page).getAttribute('data-overlay')) === 'howToPlay') {
      await control(page, 'close-overlay').click();
    }
    await page.locator('[data-open-overlay="statistics"]').click();
    await expect
      .poll(async () => page.locator('[data-stat="lifetime-accuracy"]').textContent(), {
        timeout: 20_000,
      })
      .toMatch(/%/);
    await expect(page.locator('[data-stat="session-accuracy"]')).toHaveText('-');
  });

  test('turning the coach off mid-round leaves the verdicts that round already recorded', async ({
    page,
  }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    await chooseCoachMode(page, 'review');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await dealToTurn(page);

    // One decision under review, then the switch off, then the round ends.
    await pressOn(page, '[data-action="hit"]', 'playerTurn');
    await chooseCoachMode(page, 'off');
    await standToResult(page);

    // The result still prints the verdict: it is a record of a comparison that
    // really happened, which is the documented reading at the recording site.
    await expect(page.locator('[data-screen="round-result"]')).toContainText(/basic strategy/);
    const counted = await session(page);
    expect(
      counted.coach.session.decisions,
      'the decisions before the switch stayed counted',
    ).toBeGreaterThan(0);
  });
});
