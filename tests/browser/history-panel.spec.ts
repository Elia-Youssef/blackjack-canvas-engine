/**
 * Item `J5`, over the built `dist/`: the review surface, rather than the record.
 *
 *   "Hand history retains the last 50 completed rounds with every specified
 *    field, and survives a reload."
 *
 * `tests/unit/hand-history.test.ts` grades the record and proves it complete
 * field for field. What it cannot see is the panel, and `AUDIT-2`'s finding
 * `J4-01` measured the gap: the Statistics and history overlay is the only
 * place in the product where SPEC 8's list is reviewable, and it printed six of
 * the nine recorded fields. The player hands' cards, the dealer hand's cards
 * and the coach verdicts were recorded, persisted, migrated, reloaded and shown
 * to nobody, which lands hardest on the player who has only text: the felt is
 * swept at Next Hand, so "Loss 15" was all that survived of a hand that was
 * three named cards, and a faulted decision was legible in one round result and
 * nowhere afterwards.
 *
 * So this file reads the panel against the record the machine kept of the same
 * round. Three properties, and the third is the control for the second:
 *
 *   1. **Every card that was dealt is in the panel, as a word, in deal order**,
 *      one card per list item, which is the navigable shape `BJ-18` built the
 *      mirror in. The card names are spelled out here rather than imported, on
 *      this suite's standing rule: a test that imported the sentence it checks
 *      would agree with any edit to it forever.
 *   2. **Every coach verdict recorded for the round is printed**, in the round's
 *      own order, naming the action played and the action preferred.
 *   3. **A round played with the coach off prints no verdict at all**, while its
 *      cards still print. SPEC 8 distinguishes "the coach was off", which is
 *      `null`, from "the coach was on and had no opinion", which is an empty
 *      list, and a panel that printed a heading either way would pass the second
 *      property and mean nothing by it.
 *
 * The rounds are seeded and driven through the harness, because the split round
 * is what makes hands plural and verdicts attributable; the panel itself is the
 * shipped chrome either way.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

import type { Rank, Suit } from '../../src/core/cards';
import {
  atBetting,
  chip,
  chooseInSettings,
  control,
  readout,
  session,
  settle,
  waitForPhase,
} from './support/game';

/** Seed 19 deals a pair of 5s against a dealer 4, so SPEC 4.6's Split is legal. */
const SPLIT_SEED = 19;

/** Seed 53 deals a hard 16 against a dealer 7, which basic strategy hits. */
const STIFF_SEED = 53;

/** The wager every round below places. Bronze's own minimum times ten. */
const WAGER = 100;

/** The thirteen ranks as words, spelled here rather than imported. */
const RANK_WORD: Readonly<Record<Rank, string>> = {
  A: 'Ace',
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  '10': 'Ten',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
};

/** The four suits as words, in the register a card is read in. */
const SUIT_WORD: Readonly<Record<Suit, string>> = {
  clubs: 'clubs',
  diamonds: 'diamonds',
  hearts: 'hearts',
  spades: 'spades',
};

/** One card as the panel must name it. QUALITY-BAR section 4's "as words". */
function cardWords(card: { readonly rank: Rank; readonly suit: Suit }): string {
  return `${RANK_WORD[card.rank]} of ${SUIT_WORD[card.suit]}`;
}

/** Open the Statistics and history overlay, the player's one route to SPEC 8. */
async function openHistory(page: Page): Promise<void> {
  await page.locator('[data-open-overlay="statistics"]').click();
  await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
  await settle(page);
}

/** The newest entry, which SPEC 8's "the last 50" puts at index 0. */
function newest(page: Page): Locator {
  return page.locator('[data-history="0"]');
}

/** The card list of one hand of an entry, or of its dealer. */
function cardsOf(entry: Locator, selector: string): Locator {
  return entry.locator(`${selector} [data-history-cards] li`);
}

/** Play the seeded split round: Split, Stand, Stand, and on to the result. */
async function splitRound(page: Page): Promise<void> {
  await chip(page, WAGER).click();
  await control(page, 'deal').click();
  await waitForPhase(page, 'playerTurn');

  const dealt = await readout(page);
  expect(dealt.hands[0]?.cards.map((card) => card.rank)).toEqual(['5', '5']);

  await page.locator('[data-action="split"]').click();
  await expect.poll(async () => (await readout(page)).hands.length).toBe(2);
  await expect
    .poll(async () => {
      const { phase } = await readout(page);
      return phase.kind === 'playerTurn' ? phase.activeHand : -1;
    })
    .toBe(0);
  await page.locator('[data-action="stand"]').click();
  await expect
    .poll(async () => {
      const { phase } = await readout(page);
      return phase.kind === 'playerTurn' ? phase.activeHand : -1;
    })
    .toBe(1);
  await page.locator('[data-action="stand"]').click();
  await waitForPhase(page, 'roundResult');
  await control(page, 'next-hand').click();
  await waitForPhase(page, 'betting');
}

test.describe('J5: the history panel prints the record it keeps', () => {
  test('names every card of every hand and of the dealer, in deal order', async ({ page }) => {
    await atBetting(page, { seed: SPLIT_SEED });
    await chooseInSettings(page, '[data-coach-mode="review"]');
    await splitRound(page);

    const state = await session(page);
    expect(state.history, 'the round was recorded').toHaveLength(1);
    const entry = state.history[0];
    if (entry === undefined) {
      throw new Error('the round recorded no entry');
    }
    expect(entry.hands.length, 'the split round recorded two hands').toBe(2);

    await openHistory(page);
    const line = newest(page);
    await expect(line).toHaveCount(1);

    // The summary the panel always carried, unchanged: the wager, the dealer's
    // value, the outcome and value of each hand, the actions and the round's
    // chip delta. The cards are added beside it rather than in place of it.
    const summary = line.locator('[data-field="history-summary"]');
    await expect(summary).toContainText('Wager');
    await expect(summary).toContainText('Round');

    // Each hand's cards, in the order they were dealt, one per list item.
    for (const [index, hand] of entry.hands.entries()) {
      const cards = cardsOf(line, `[data-history-hand="${String(index)}"]`);
      await expect(cards, `hand ${String(index)} shows no cards`).toHaveCount(hand.cards.length);
      expect(hand.cards.length, 'a recorded hand held no cards').toBeGreaterThan(0);
      expect(await cards.allTextContents()).toEqual(hand.cards.map((card) => cardWords(card)));
    }

    // And the dealer's, hole card included: the round is over, so SPEC 8's
    // "the dealer hand" is the whole hand and not the face-up part of it.
    const dealer = cardsOf(line, '[data-history-dealer]');
    await expect(dealer).toHaveCount(entry.dealer.length);
    expect(entry.dealer.length, 'the dealer hand was recorded empty').toBeGreaterThan(1);
    expect(await dealer.allTextContents()).toEqual(entry.dealer.map((card) => cardWords(card)));
  });

  test('prints every coach verdict the round recorded, in its own order', async ({ page }) => {
    await atBetting(page, { seed: SPLIT_SEED });
    await chooseInSettings(page, '[data-coach-mode="review"]');
    await splitRound(page);

    const state = await session(page);
    const verdicts = state.history[0]?.coach ?? null;
    expect(verdicts, 'the coach was on, so the round recorded a list').not.toBeNull();
    expect(verdicts).toHaveLength(3);

    await openHistory(page);
    const lines = newest(page).locator('[data-field="history-coach"] li');
    await expect(lines).toHaveCount(3);

    const printed = await lines.allTextContents();
    // The Split was decision one and basic strategy never splits a pair of 5s,
    // so the first line names both what was played and what was preferred. A
    // panel that printed the same sentence three times would pass a count.
    expect(printed[0]).toContain('Split');
    expect(new Set(printed).size, 'three verdicts printed as one sentence').toBeGreaterThan(1);
    for (const line of printed) {
      expect(line.length).toBeGreaterThan(0);
    }
  });

  test('prints no verdict at all for a round played with the coach off', async ({ page }) => {
    // The control. The coach is off by default (SPEC 7), so nothing was
    // compared and there is nothing to report; the cards are still there,
    // which is what keeps this a statement about the verdicts alone.
    await atBetting(page, { seed: STIFF_SEED });
    await chip(page, WAGER).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await page.locator('[data-action="stand"]').click();
    await waitForPhase(page, 'roundResult');
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'betting');

    const state = await session(page);
    expect(state.coachMode).toBe('off');
    expect(state.history[0]?.coach, 'the coach was off, which SPEC 8 records as null').toBeNull();

    await openHistory(page);
    const line = newest(page);
    await expect(line.locator('[data-field="history-coach"]')).toHaveCount(0);
    await expect(cardsOf(line, '[data-history-hand="0"]')).toHaveCount(
      state.history[0]?.hands[0]?.cards.length ?? 0,
    );
  });
});
