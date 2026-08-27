/**
 * Item `C3`, Critical, over the built `dist/`.
 *
 *   "Split hands are played left to right, the active hand is visually
 *    indicated and announced by index, and each settles independently against
 *    the single dealer hand."
 *
 * Three clauses, each asserted on a round that really split:
 *
 *   - **Left to right** is the machine's own `activeHand` read through the
 *     harness, 0 and then 1 and never 1 before 0, with the felt's hand count
 *     at two the whole time.
 *   - **Indicated and announced by index** is three surfaces carrying the same
 *     index. The sighted one is the hand readout's label in the top bar, which
 *     reads `Hand 1 of 2` and then `Hand 2 of 2` as the turn moves: the `BJ-20`
 *     review measured the shipped page and found the mirror and the region are
 *     both visually hidden while the felt gives every hand an equal band, so
 *     without the label the clause had no sighted answer at all. The other two
 *     are the mirror's group name (`Hand 1 of 2, active, ...`) and the polite
 *     region speaking the same sentence on the move. The canvas itself marking
 *     the active hand stays a standing park for the play-surface parts, now
 *     with its premise stated straight: the felt carries no marking and no
 *     differential layout, and the chrome is where the sighted indication
 *     lives.
 *   - **Each settles independently** is asserted on a round whose two hands
 *     settled differently, which `differingSplit()` finds: one hand paid its
 *     win while the other lost its wager against the same dealer cards, and
 *     the two nets are read off SPEC 12's per-hand result rather than inferred
 *     from the balance.
 *
 * **Routes.** The split needs a dealt pair and a funded balance, which the
 * seed supplies; the per-hand amounts need the machine's result payload; the
 * mirror and the region are the shipped page's own DOM. All three live on the
 * harness-booted shipped page, whose stylesheet, markup and chunk are
 * `dist/`'s.
 */

import { expect, test } from '@playwright/test';

import { differingSplit, FLOW_WAGER } from './support/flow-seeds';
import { bootGame, chip, control, readout, shell, waitForPhase } from './support/game';
import { pressOn } from './support/game';

test.describe('C3: the split flow', () => {
  test('plays the hands left to right, indicating and announcing each by index', async ({
    page,
  }) => {
    const { seed } = differingSplit();
    await bootGame(page, { seed });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await chip(page, FLOW_WAGER).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');

    // Two hands now, and the machine is asking about the leftmost one.
    await pressOn(page, '[data-action="split"]', 'playerTurn');
    await expect
      .poll(async () => (await readout(page)).hands.length, { timeout: 20_000 })
      .toBe(2);

    await expect
      .poll(async () => {
        const snapshot = await readout(page);
        return snapshot.phase.kind === 'playerTurn' ? snapshot.phase.activeHand : -1;
      }, { timeout: 20_000 })
      .toBe(0);

    // The sighted half of "visually indicated": the hand readout's label in
    // the top bar names the active hand by index, in rendered text a player
    // can see at every width, in the mirror's own words.
    const handLabel = page.locator('[data-readout="hand-value"] .bj-readout__label');
    await expect(handLabel).toHaveText('Hand 1 of 2');

    // The mirror names the active hand by its index, which is the announced
    // half of the clause: the left hand's group says "Hand 1 of 2, active"
    // while the machine is asking about it, and the right hand's does not.
    const left = page.locator('[data-mirror-hand="0"]');
    const right = page.locator('[data-mirror-hand="1"]');
    await expect
      .poll(async () => left.getAttribute('aria-label'), { timeout: 20_000 })
      .toMatch(/^Hand 1 of 2, active, /);
    await expect
      .poll(async () => right.getAttribute('aria-label'), { timeout: 20_000 })
      .toMatch(/^Hand 2 of 2, (waiting|standing), /);

    // The polite region speaks the move to the second hand, by index, in the
    // mirror's own words. The announcement is asserted on the region's text,
    // which is the shipped page's one live region, not on the probe.
    await pressOn(page, '[data-action="stand"]', 'playerTurn');
    await expect
      .poll(async () => {
        const snapshot = await readout(page);
        return snapshot.phase.kind === 'playerTurn' ? snapshot.phase.activeHand : -1;
      }, { timeout: 20_000 })
      .toBe(1);
    await expect(handLabel, 'the visible label moved with the turn').toHaveText('Hand 2 of 2');
    await expect
      .poll(
        async () => page.locator('[data-live="polite"]').textContent(),
        { timeout: 20_000 },
      )
      .toMatch(/^Hand 2 of 2, active, /);
    await expect
      .poll(async () => left.getAttribute('aria-label'), { timeout: 20_000 })
      .toMatch(/^Hand 1 of 2, standing, /);
    await expect
      .poll(async () => right.getAttribute('aria-label'), { timeout: 20_000 })
      .toMatch(/^Hand 2 of 2, active, /);

    // The right hand takes its one hit and the round ends: the route the seed
    // was found for is stand, hit, and whatever standing is left.
    await pressOn(page, '[data-action="hit"]', 'playerTurn');
    const snapshot = await readout(page);
    if (snapshot.phase.kind === 'playerTurn') {
      await pressOn(page, '[data-action="stand"]', 'playerTurn');
    }
    await waitForPhase(page, 'roundResult');
    await expect(shell(page)).toHaveAttribute('data-phase', 'roundResult');
  });

  test('settles each hand independently against the single dealer hand', async ({ page }) => {
    const { seed, leftWins } = differingSplit();
    await bootGame(page, { seed });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await chip(page, FLOW_WAGER).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await pressOn(page, '[data-action="split"]', 'playerTurn');
    await pressOn(page, '[data-action="stand"]', 'playerTurn');
    await pressOn(page, '[data-action="hit"]', 'playerTurn');
    const mid = await readout(page);
    if (mid.phase.kind === 'playerTurn') {
      await pressOn(page, '[data-action="stand"]', 'playerTurn');
    }
    await waitForPhase(page, 'roundResult');

    const finished = await readout(page);
    expect(finished.phase.kind, 'the round settled').toBe('roundResult');
    if (finished.phase.kind !== 'roundResult') {
      return;
    }
    const hands = finished.phase.result.hands;
    expect(hands.length, 'two hands settled').toBe(2);
    const left = hands[0];
    const right = hands[1];
    expect(left && right, 'both hands are in the result').toBeDefined();
    if (left === undefined || right === undefined) {
      return;
    }

    // One hand won and the other lost, against the one dealer hand, which is
    // the independence as a fact about this round rather than an inference.
    const won = (outcome: string): boolean => outcome === 'PLAYER_WIN' || outcome === 'BLACKJACK';
    const lost = (outcome: string): boolean => outcome === 'DEALER_WIN';
    const winner = leftWins ? left : right;
    const loser = leftWins ? right : left;
    expect(won(winner.outcome), 'one hand won').toBe(true);
    expect(lost(loser.outcome), 'the other lost').toBe(true);

    // And the money followed the outcomes separately: the winner was credited
    // its wager plus its win, the loser its wager minus itself, on the same
    // dealer cards. Read as per-hand nets, which is what SPEC 12 prints.
    expect(winner.credit - winner.wager).toBe(FLOW_WAGER);
    expect(loser.credit - loser.wager).toBe(-FLOW_WAGER);

    // The single dealer hand settled both: one dealer hand, two results.
    expect(finished.dealerVisible.length, 'one dealer hand played out').toBeGreaterThanOrEqual(2);
    expect(finished.dealerConcealed, 'and its hole card is face up at the result').toBe(0);
  });
});
