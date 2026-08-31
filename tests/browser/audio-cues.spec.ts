/**
 * Item `K5`, Minor, 4 points, over the built `dist/`, harness route.
 *
 *   "Every cue named in the audio section is emitted on its stated trigger
 *    exactly once, and on no other trigger."
 *
 * The exactly-once journal needs the emission record, and emission is not
 * observable from the DOM: a cue that was muted or found no context changed
 * nothing on the page. So this spec takes the `game-harness.ts` route on the
 * same terms `BJ-15` documented: the harness is bundled at test time with
 * `write: false`, injected over the served `dist/`, and never ships, and the
 * composition root's `audio()` probe publishes the engine's offer counts per
 * cue and per cue-and-phase as plain numbers. The structural clauses of `K2`
 * stay on the shipped page in `audio-start.spec.ts`; nothing here needs
 * anything the shipped page cannot do except a number the shipped bundle has
 * no reason to export.
 *
 * **Both halves of the criterion are asserted.** The exactly-once half is the
 * whole tally after a seeded round, matched against the tally the same seed
 * produces under the unit driver in `tests/unit/cues.test.ts`. The
 * no-other-trigger half is the negative controls: totals that must stay at
 * zero after the events that would fire them if a mapping were wider than its
 * trigger, and phase keys that must not exist, which is the same claim about
 * where a cue fired.
 *
 * **Seeds, and why.** An unseeded round cannot be asserted against, because
 * which cues fire is a property of the cards. Each scenario below names a seed
 * and the drive it takes, and the drive is the same one the unit driver takes,
 * so the browser and the unit suite are two witnesses over one derivation:
 *
 *   - seed 30: a player natural, which stacks the blackjack cue, the
 *     milestone cue and no win, on the one boundary they share.
 *   - seed 50: a push, through an insurance offer the drive declines, which
 *     is also the peek's negative control.
 *   - seed 6: a player bust on a Hit, followed by the loss at settlement.
 *   - seed 5: a dealer bust, which is the win cue and a bust cue in the
 *     dealer's own phase.
 *   - seed 3: a loss by the dealer standing, no bust anywhere.
 *   - seed 1: a surrender, which is the loss cue's second arm.
 *   - the bust-out seed from `action-seeds.ts`: the session's own end.
 *
 * The shuffle is asserted at unit level only, on purpose: reaching the cut
 * card takes most of a shoe and dozens of paced rounds, which is minutes of
 * wall clock per engine for a mapping the headless driver covers exactly. The
 * part report says so. Reduced motion and Speed are swept here because the
 * part brief requires the cue sequence identical under both arms of each, and
 * no wall-clock assertion is made anywhere in this file.
 */

import { expect, test, type Page } from '@playwright/test';

import { settleRound } from './support/flow';
import { BUST_OUT_WAGER, bustOutSeed } from './support/action-seeds';
import { audioProbe, bootGame, chip, control, waitForPhase } from './support/game';

/** The whole tally, as one comparable object with the zeros filled in. */
async function tally(page: Page): Promise<Record<string, number>> {
  const probe = await audioProbe(page);
  return { ...probe.cues };
}

/** Every phase-keyed count, for the where-half of the criterion. */
async function phaseTally(page: Page): Promise<Record<string, number>> {
  const probe = await audioProbe(page);
  return { ...probe.cuePhases };
}

/** The drive the unit driver takes: bet 50, deal, answer, stand, stop at the result. */
async function playSeededRound(
  page: Page,
  seed: number,
  first: 'stand' | 'hit' | 'surrender' = 'stand',
): Promise<void> {
  let action = first;
  await bootGame(page, { seed });
  await waitForPhase(page, 'start');
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
  await chip(page, 50).click();
  await control(page, 'deal').click();
  if (action === 'stand') {
    await settleRound(page);
    await waitForPhase(page, 'roundResult');
    return;
  }
  // One Hit, or one Surrender, then answer the rest like the stand drive.
  await expect(page.locator('.bj-shell')).toHaveAttribute('data-phase', /playerTurn|roundResult/, {
    timeout: 20_000,
  });
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
      const selector =
        action === 'surrender' ? '[data-action="surrender"]' : '[data-action="hit"]';
      const pressed = await page
        .locator(selector)
        .click({ timeout: 2000 })
        .then(
          () => true,
          () => false,
        );
      if (!pressed && action === 'surrender') {
        await page.locator('[data-action="stand"]').click({ timeout: 2000 }).catch(() => undefined);
      }
      if (action === 'hit') {
        action = 'stand';
      }
      continue;
    }
    await page.waitForTimeout(150);
  }
  throw new Error('the seeded round never settled');
}

test.describe('K5: the thirteen cues on their stated triggers', () => {
  test('a natural stacks the blackjack cue and the milestone, and not the win', async ({ page }) => {
    await playSeededRound(page, 30);
    expect(await tally(page)).toEqual({
      cardDeal: 4,
      cardFlip: 1,
      chipPlace: 1,
      chipClear: 0,
      buttonPress: 4,
      win: 0,
      blackjack: 1,
      loss: 0,
      push: 0,
      bust: 0,
      shuffle: 0,
      milestone: 1,
      bustOut: 0,
    });
    // The where-half: the blackjack and the milestone are the round
    // boundary's, and the flip is the reveal's.
    const phases = await phaseTally(page);
    expect(phases['blackjack@roundResult']).toBe(1);
    expect(phases['milestone@roundResult']).toBe(1);
    expect(phases['cardFlip@reveal']).toBe(1);
  });

  test('a push is its own cue, through an insurance offer the drive declines', async ({ page }) => {
    await playSeededRound(page, 50);
    expect(await tally(page)).toEqual({
      cardDeal: 4,
      cardFlip: 1,
      chipPlace: 1,
      chipClear: 0,
      buttonPress: 5,
      win: 0,
      blackjack: 0,
      loss: 0,
      push: 1,
      bust: 0,
      shuffle: 0,
      milestone: 0,
      bustOut: 0,
    });
    // The where-half: the declined offer is a press, and the phase it lands
    // in is the one the frame ended at, the peek the offer handed to; and
    // the peek is not the flip, which is the reveal's.
    const phases = await phaseTally(page);
    expect(phases['buttonPress@peek']).toBe(1);
    expect(phases['cardFlip@peek']).toBeUndefined();
  });

  test('a player bust is the hit frame event, and the settlement is the loss', async ({ page }) => {
    await playSeededRound(page, 6, 'hit');
    expect(await tally(page)).toEqual({
      cardDeal: 5,
      cardFlip: 1,
      chipPlace: 1,
      chipClear: 0,
      buttonPress: 4,
      win: 0,
      blackjack: 0,
      loss: 1,
      push: 0,
      bust: 1,
      shuffle: 0,
      milestone: 0,
      bustOut: 0,
    });
    const phases = await phaseTally(page);
    // The frame the hand went over ends at the reveal, which is where SPEC 10
    // sends a table with no live hand; the loss is the boundary's.
    expect(phases['bust@reveal']).toBe(1);
    expect(phases['loss@roundResult']).toBe(1);
  });

  test('a dealer bust carries the win and a bust in the dealer own phase', async ({ page }) => {
    await playSeededRound(page, 5);
    expect(await tally(page)).toEqual({
      cardDeal: 5,
      cardFlip: 1,
      chipPlace: 1,
      chipClear: 0,
      buttonPress: 4,
      win: 1,
      blackjack: 0,
      loss: 0,
      push: 0,
      bust: 1,
      shuffle: 0,
      milestone: 0,
      bustOut: 0,
    });
    const phases = await phaseTally(page);
    expect(phases['bust@dealerTurn']).toBe(1);
    expect(phases['win@roundResult']).toBe(1);
  });

  test('a loss by the dealer standing fires no bust anywhere', async ({ page }) => {
    await playSeededRound(page, 3);
    const counted = await tally(page);
    expect(counted['loss'] ?? 0).toBe(1);
    expect(counted['bust'] ?? 0).toBe(0);
    expect((counted['win'] ?? 0) + (counted['push'] ?? 0) + (counted['blackjack'] ?? 0)).toBe(0);
  });

  test('a surrender is the loss cue second arm', async ({ page }) => {
    await playSeededRound(page, 1, 'surrender');
    const counted = await tally(page);
    expect(counted['loss'] ?? 0).toBe(1);
    expect(counted['win'] ?? 0).toBe(0);
    expect(counted['push'] ?? 0).toBe(0);
    expect(counted['blackjack'] ?? 0).toBe(0);
  });
});

test.describe('K5: negative controls, on the shipped flows', () => {
  test('a refused press offers nothing', async ({ page }) => {
    await bootGame(page, { seed: 50 });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    // Deal with no wager: refused by the wallet, and a refusal is not an
    // event the cue list names. Both halves of the record must hold still,
    // the totals and the phase keys alike.
    const before = await tally(page);
    const phasesBefore = await phaseTally(page);
    await control(page, 'deal').click();
    await page.waitForTimeout(300);
    expect(await tally(page)).toEqual(before);
    expect(await phaseTally(page)).toEqual(phasesBefore);
  });

  test('emission does not depend on audibility: a muted boot counts the same', async ({ page }) => {
    await bootGame(page, { seed: 5, muted: true });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await chip(page, 50).click();
    await control(page, 'deal').click();
    await settleRound(page);
    await waitForPhase(page, 'roundResult');
    const probe = await audioProbe(page);
    expect(probe.muted).toBe(true);
    expect(probe.cues['win']).toBe(1);
    expect(probe.cues['bust']).toBe(1);
    expect(probe.cues['cardDeal']).toBe(5);
  });
});

test.describe('K5: the same cues under reduced motion and under Fast', () => {
  test('plays the identical tally under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await playSeededRound(page, 5);
    await expect(page.locator('.bj-shell')).toHaveAttribute('data-motion', 'reduce');
    expect(await tally(page)).toEqual({
      cardDeal: 5,
      cardFlip: 1,
      chipPlace: 1,
      chipClear: 0,
      buttonPress: 4,
      win: 1,
      blackjack: 0,
      loss: 0,
      push: 0,
      bust: 1,
      shuffle: 0,
      milestone: 0,
      bustOut: 0,
    });
  });

  test('plays the identical tally at Fast speed', async ({ page }) => {
    // Fast is chosen from Settings before the round starts, on the control a
    // player uses. The seed-5 deal is then the same deal the Normal arm
    // above played, and Speed changes only how long the windows last.
    await bootGame(page, { seed: 5 });
    await waitForPhase(page, 'start');
    await page.locator('[data-open-overlay="settings"]').click();
    await page.locator('[data-speed="fast"]').click();
    await control(page, 'close-overlay').click();
    await expect(page.locator('.bj-shell')).toHaveAttribute('data-motion-speed', 'fast');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await chip(page, 50).click();
    await control(page, 'deal').click();
    await settleRound(page);
    await waitForPhase(page, 'roundResult');
    expect(await tally(page)).toEqual({
      cardDeal: 5,
      cardFlip: 1,
      chipPlace: 1,
      chipClear: 0,
      buttonPress: 4,
      win: 1,
      blackjack: 0,
      loss: 0,
      push: 0,
      bust: 1,
      shuffle: 0,
      milestone: 0,
      bustOut: 0,
    });
  });
});

test.describe('K5: the session own end', () => {
  test('the bust-out fires once, at the frame the session runs out', async ({ page }) => {
    // The drive `tests/browser/input-parity.spec.ts` uses to reach SPEC
    // 4.12's screen: a Gold table, a high-water unlock, and the known seed
    // that plays a bankroll down past the minimum in one round.
    const seed = bustOutSeed();
    await bootGame(page, { seed, bestBalance: 10_000 });
    await waitForPhase(page, 'start');
    await page.locator('[data-table="gold"]').click();
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    for (const denomination of [500, 100, 100, 100, 100, 50]) {
      await chip(page, denomination as 10 | 50 | 100 | 500).click();
    }
    await expect(page.locator('[data-readout="wager"] .bj-readout__value')).toHaveText(
      String(BUST_OUT_WAGER),
      { timeout: 5_000 },
    );
    await control(page, 'deal').click();
    await settleRound(page);
    await waitForPhase(page, 'roundResult');
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'bustOut');
    const probe = await audioProbe(page);
    expect(probe.cues['bustOut']).toBe(1);
    expect((await phaseTally(page))['bustOut@bustOut']).toBe(1);
  });
});
