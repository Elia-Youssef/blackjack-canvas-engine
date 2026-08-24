/**
 * Item `C8`, Major, over the built `dist/`.
 *
 *   "The round result shows, per hand: the outcome and its reason, both hand
 *    values, the chip delta on that hand, the insurance result where one exists,
 *    the coach verdict when the coach is on, and the resulting balance."
 *
 * Seven things, asserted against the round that actually happened. The truth
 * comes from the machine's own snapshot, read through the test-time harness, and
 * the numbers are recomputed here rather than taken from the panel: the player's
 * hand value is `handValue(readout.hands[i].cards)`, the dealer's is
 * `handValue(readout.dealerVisible)`, and the chip delta is `credit - wager`,
 * which is SPEC 4.10's "net on the hand's wager".
 *
 * **The outcome and the reason are checked against tables written here**, from
 * SPEC 4.10, rather than against the chrome's own strings. A test that imported
 * the sentence it is checking would agree with any edit to it forever. The
 * markers are proved to discriminate in a test of their own, against the nine
 * sentences the chrome can produce, so a panel that printed the wrong rung's
 * reason cannot pass.
 *
 * **Three rounds, all seeded.** One plain round with the coach on, one with an
 * insurance stake taken, and one with the coach off, which is the control for
 * the coach clause: a panel that always printed a verdict would pass the first
 * test and fail the third.
 */

import { expect, test, type Page } from '@playwright/test';

import { handValue } from '../../src/core/hand';
import type { Outcome, Rung } from '../../src/core/settlement';
import { rungText } from '../../src/ui/text';
import {
  atBetting,
  chip,
  control,
  numberFrom,
  readout,
  session,
  waitForPhase,
} from './support/game';

/** Seed 53 deals a hard 16 against a dealer 7, which basic strategy hits. */
const STIFF_SEED = 53;
/** Seed 4 deals a dealer Ace, so SPEC 4.7's offer is made. */
const INSURANCE_SEED = 4;
/** Seed 19 deals a pair of 5s against a dealer 4, so SPEC 4.6's Split is legal. */
const SPLIT_SEED = 19;

/** SPEC 4.10's five outcomes, spelled here rather than imported. */
const OUTCOME_TEXT: Readonly<Record<Outcome, string>> = {
  BLACKJACK: 'Blackjack',
  PLAYER_WIN: 'Win',
  DEALER_WIN: 'Loss',
  PUSH: 'Push',
  SURRENDER: 'Surrendered',
};

/**
 * A discriminating phrase per rung of SPEC 4.10's ladder, written from that
 * table. Looser than the sentence, so a rewording is not a failure, and still
 * exact enough that no rung's marker matches another rung's sentence, which the
 * first test below proves rather than assumes.
 */
const RUNG_MARKER: Readonly<Record<Rung, RegExp>> = {
  1: /surrender/i,
  2: /both hands were naturals/i,
  3: /paid three to two/i,
  4: /dealer held a natural/i,
  5: /^the hand went over/i,
  6: /^the dealer went over/i,
  7: /hand beat the dealer/i,
  8: /dealer beat the hand/i,
  9: /equal values/i,
};

/** SPEC 4.5's actions as the coach names them, spelled here. */
const ACTION_TEXT = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double Down',
  split: 'Split',
  surrender: 'Surrender',
} as const;

const RUNGS: readonly Rung[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** One field of one hand of the round result. */
function field(page: Page, hand: number, name: string) {
  return page.locator(`.bj-result__hand[data-hand="${String(hand)}"] [data-field="${name}"]`);
}

/** Put SPEC 7's coach into review mode through the Settings overlay. */
async function turnCoachOn(page: Page): Promise<void> {
  await page.locator('[data-open-overlay="settings"]').click();
  await page.locator('[data-coach-mode="review"]').click();
  await expect(page.locator('[data-coach-mode="review"]')).toHaveAttribute('aria-pressed', 'true');
  await control(page, 'close-overlay').click();
}

test.describe('C8: the reason markers discriminate', () => {
  test('each of the nine matches its own rung and no other', () => {
    for (const rung of RUNGS) {
      const marker = RUNG_MARKER[rung];
      expect(marker.test(rungText(rung)), `rung ${String(rung)} matches its own sentence`).toBe(true);
      for (const other of RUNGS) {
        if (other !== rung) {
          expect(
            marker.test(rungText(other)),
            `rung ${String(rung)}'s marker also matches rung ${String(other)}`,
          ).toBe(false);
        }
      }
    }
  });
});

test.describe('C8: the round result', () => {
  test('shows the outcome, its reason, both values, the delta and the balance', async ({ page }) => {
    await atBetting(page, { seed: STIFF_SEED });
    await turnCoachOn(page);

    await chip(page, 50).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await page.locator('[data-action="stand"]').click();
    await waitForPhase(page, 'roundResult');

    const snapshot = await readout(page);
    const phase = snapshot.phase;
    expect(phase.kind).toBe('roundResult');
    if (phase.kind !== 'roundResult') {
      return;
    }
    const settled = phase.result.hands;
    expect(settled.length).toBeGreaterThan(0);

    // One panel entry per settled hand, in SPEC 4.6's play order.
    await expect(page.locator('.bj-result__hand')).toHaveCount(settled.length);

    // The cards are still on the felt at SPEC 10's round result, so both values
    // are computed from them rather than read off the settlement record.
    const dealerValue = handValue(snapshot.dealerVisible).total;

    for (const [index, hand] of settled.entries()) {
      const inPlay = snapshot.hands[index];
      expect(inPlay, `hand ${String(index)} is on the felt`).toBeDefined();
      if (inPlay === undefined) {
        return;
      }

      await expect(field(page, index, 'outcome')).toHaveText(OUTCOME_TEXT[hand.outcome]);
      await expect(field(page, index, 'reason')).toHaveText(RUNG_MARKER[hand.rung]);
      expect(numberFrom(await field(page, index, 'player-value').textContent())).toBe(
        handValue(inPlay.cards).total,
      );
      expect(numberFrom(await field(page, index, 'dealer-value').textContent())).toBe(dealerValue);
      expect(numberFrom(await field(page, index, 'delta').textContent())).toBe(
        hand.credit - hand.wager,
      );
      expect(numberFrom(await field(page, index, 'wager').textContent())).toBe(hand.wager);
    }

    // SPEC 12's "resulting balance", read after every hand has settled.
    expect(numberFrom(await page.locator('[data-field="balance"]').textContent())).toBe(
      phase.result.chips,
    );

    // No side wager was taken, so SPEC 12's "if any" prints nothing at all.
    expect(phase.result.insurance).toBeNull();
    await expect(page.locator('[data-field="insurance"]')).toBeHidden();
  });

  test('names the correct action when the coach is on and the play differed', async ({ page }) => {
    await atBetting(page, { seed: STIFF_SEED });
    await turnCoachOn(page);

    await chip(page, 50).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');

    // The seeded hand is a hard 16 against a dealer 7, which basic strategy
    // hits. Standing on it is the differing play SPEC 7's review mode reports.
    const before = await readout(page);
    expect(handValue(before.hands[0]?.cards ?? []).total).toBe(16);
    expect(before.dealerVisible[0]?.rank).toBe('7');

    await page.locator('[data-action="stand"]').click();
    await waitForPhase(page, 'roundResult');

    const state = await session(page);
    expect(state.coachMode).toBe('review');
    expect(state.coach.session.decisions).toBe(1);
    expect(state.coach.session.matched).toBe(0);

    expect(state.history).toHaveLength(1);
    // SPEC 8: `null` is the coach having been off, and a list is the coach
    // having been on. One decision was made, so the list has one verdict.
    expect(state.history[0]?.coach).toHaveLength(1);

    const lines = page.locator('.bj-result__hand[data-hand="0"] [data-field="coach"] li');
    await expect(lines).toHaveCount(1);
    const text = (await lines.first().textContent()) ?? '';
    expect(text).toContain(ACTION_TEXT.stand);
    expect(text).toContain(ACTION_TEXT.hit);
  });

  test('files each verdict under the hand the decision was made on', async ({ page }) => {
    // SPEC 12 prints the round result **per hand**, and a `CoachVerdict` carries
    // no hand index of its own: the composition root attaches one at the moment
    // the machine accepts a decision, from the pre-drain `phase.activeHand`. A
    // single-hand round cannot tell a correct attribution from a constant one,
    // so this round splits and makes three decisions across two hands.
    await atBetting(page, { seed: SPLIT_SEED });
    await turnCoachOn(page);

    await chip(page, 50).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');

    const dealt = await readout(page);
    expect(dealt.hands).toHaveLength(1);
    expect(dealt.hands[0]?.cards.map((card) => card.rank)).toEqual(['5', '5']);

    // Decision one, on hand 0: Split. Basic strategy never splits a pair of 5s.
    await page.locator('[data-action="split"]').click();
    await expect.poll(async () => (await readout(page)).hands.length).toBe(2);
    await expect
      .poll(async () => {
        const phase = (await readout(page)).phase;
        return phase.kind === 'playerTurn' ? phase.activeHand : -1;
      })
      .toBe(0);

    // Decision two, still on hand 0: Stand.
    await page.locator('[data-action="stand"]').click();
    await expect
      .poll(async () => {
        const phase = (await readout(page)).phase;
        return phase.kind === 'playerTurn' ? phase.activeHand : -1;
      })
      .toBe(1);

    // Decision three, on hand 1: Stand.
    await page.locator('[data-action="stand"]').click();
    await waitForPhase(page, 'roundResult');

    const state = await session(page);
    expect(state.history).toHaveLength(1);
    // Three decisions were made and three verdicts were recorded for the round.
    expect(state.history[0]?.coach).toHaveLength(3);
    expect(state.coach.session.decisions).toBe(3);

    await expect(page.locator('.bj-result__hand')).toHaveCount(2);

    const first = page.locator('.bj-result__hand[data-hand="0"] [data-field="coach"] li');
    const second = page.locator('.bj-result__hand[data-hand="1"] [data-field="coach"] li');
    await expect(first).toHaveCount(2);
    await expect(second).toHaveCount(1);

    const firstLines = await first.allTextContents();
    const secondLines = await second.allTextContents();

    // Every recorded verdict is printed exactly once, under one hand.
    expect(firstLines.length + secondLines.length).toBe(3);
    // And they are the decisions that were actually made there: the Split was
    // played on hand 0 and on no other, so a filter that ignored the index would
    // put it under both, and a constant index would empty one list entirely.
    expect(firstLines.filter((line) => line.includes(ACTION_TEXT.split))).toHaveLength(1);
    expect(secondLines.filter((line) => line.includes(ACTION_TEXT.split))).toHaveLength(0);
    expect(firstLines).not.toEqual(secondLines);
    for (const line of [...firstLines, ...secondLines]) {
      expect(line.length).toBeGreaterThan(0);
    }
  });

  test('shows no coach verdict at all when the coach is off', async ({ page }) => {
    // The control for the clause above. The coach is off by default (SPEC 7),
    // so nothing is compared, nothing is counted and nothing is printed.
    await atBetting(page, { seed: STIFF_SEED });

    await chip(page, 50).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await page.locator('[data-action="stand"]').click();
    await waitForPhase(page, 'roundResult');

    await expect(page.locator('.bj-result__hand')).toHaveCount(1);
    await expect(page.locator('[data-field="coach"]')).toHaveCount(0);

    const state = await session(page);
    expect(state.coachMode).toBe('off');
    expect(state.coach.session.decisions).toBe(0);
    // SPEC 8 distinguishes "the coach was off", which is `null`, from "the coach
    // was on and had no opinion", which is an empty list. This round is the
    // former, and the panel prints nothing either way.
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.coach).toBeNull();
  });

  test('shows the insurance result where one exists', async ({ page }) => {
    await atBetting(page, { seed: INSURANCE_SEED });

    await chip(page, 50).click();
    await control(page, 'deal').click();

    // SPEC 4.7: the dealer shows an Ace, so the offer is made before the peek.
    await waitForPhase(page, 'insurance');
    await control(page, 'take-insurance').click();
    await waitForPhase(page, 'playerTurn');
    await page.locator('[data-action="stand"]').click();
    await waitForPhase(page, 'roundResult');

    const snapshot = await readout(page);
    const phase = snapshot.phase;
    expect(phase.kind).toBe('roundResult');
    if (phase.kind !== 'roundResult') {
      return;
    }
    const side = phase.result.insurance;
    expect(side, 'a side wager was taken').not.toBeNull();
    if (side === null) {
      return;
    }

    // SPEC 4.7's stake is half the initial wager, and it is shown with what it
    // returned and what it netted.
    expect(side.stake).toBe(25);
    const line = page.locator('[data-field="insurance"]');
    await expect(line).toBeVisible();
    const text = (await line.textContent()) ?? '';
    expect(text).toContain(String(side.stake));
    expect(text).toMatch(/insurance/i);
    expect(text).toContain(String(side.net));

    // And the resulting balance still accounts for both halves of the round.
    expect(numberFrom(await page.locator('[data-field="balance"]').textContent())).toBe(
      phase.result.chips,
    );
  });
});
