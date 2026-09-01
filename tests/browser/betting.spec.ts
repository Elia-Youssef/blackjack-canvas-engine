/**
 * Item `B15`, Critical, over the built `dist/`.
 *
 *   "A chip tap that would carry the wager above min(table maximum, balance) is
 *    rejected with a reason and changes nothing; it is never silently clamped,
 *    and a chip whose denomination alone exceeds the ceiling renders disabled.
 *    Only Max and Repeat compute a value and both compute a legal multiple of
 *    10. Deal is blocked below the table minimum rather than raised to it.
 *    chips + committed + insuranceStake - deferredStake is conserved except by
 *    a settled outcome."
 *
 * Five clauses. The first two are asserted on the **shipped page as it ships**,
 * with nothing injected, because a Bronze table with 1,000 chips reaches them
 * through its own controls. The rest need a table SPEC 6 has not unlocked on a
 * fresh launch, or a known deal, and use the test-time harness whose own header
 * explains what it costs.
 *
 * **"Rejected, never clamped" needs a wager that is not already at the ceiling,
 * or the two are indistinguishable.** At Bronze the ceiling is 100; a tap
 * refused at a wager of 100 leaves 100, and a tap clamped at a wager of 100 also
 * leaves 100, so that case proves nothing. The test below builds 60 and taps a
 * 50: a refusal leaves 60 and a clamp would show 100.
 *
 * **The ceiling is `min(tableMax, balance)` and both halves are driven.** At
 * Bronze with 1,000 chips the table maximum binds and the 500 chip is disabled;
 * at Gold with 1,000 chips the balance binds and all four are enabled; and after
 * two seeded rounds at Silver the balance has fallen to 475, where the balance
 * binds the other way and the 500 chip is disabled again.
 */

import { expect, test, type Page } from '@playwright/test';

import { WAGER_GRID, tableLimits, wagerCeiling } from '../../src/core/wallet';
import {
  PHASE_TIMEOUT,
  atBetting,
  atShippedBetting,
  chip,
  conserved,
  control,
  notice,
  numberIn,
  readout,
  readoutValue,
  shell,
  sumOf,
  waitForPhase,
  walletSamples,
  watchWallet,
} from './support/game';

/** The seed every seeded round below is driven on. */
const SEED = 53;
/** Seed 4 deals a dealer Ace at Bronze, so SPEC 4.7's offer is made. */
const INSURED_SEED = 4;

/** The wager as SPEC 11's readout renders it. */
async function wager(page: Page): Promise<number> {
  return numberIn(readoutValue(page, 'wager'));
}

/** The balance as SPEC 11's readout renders it. */
async function balance(page: Page): Promise<number> {
  return numberIn(readoutValue(page, 'chips'));
}

/**
 * Wait for a readout to reach a value, then assert it.
 *
 * A press is queued and drained on the next frame, which DESIGN section 3 makes
 * deliberate: at most one accepted intent per frame, with the rest of the queue
 * discarded if the phase moved. So a read taken in the same tick as the click is
 * a read of the frame before it. Polling is the honest wait; it is not a
 * loosened assertion, because the value asserted is exact.
 */
async function expectWager(page: Page, value: number): Promise<void> {
  await expect.poll(async () => wager(page), { timeout: PHASE_TIMEOUT }).toBe(value);
}

async function expectBalance(page: Page, value: number): Promise<void> {
  await expect.poll(async () => balance(page), { timeout: PHASE_TIMEOUT }).toBe(value);
}

/** Play one seeded round out with a single action, and return to betting. */
async function playRound(page: Page, action: 'stand' | 'surrender'): Promise<void> {
  await control(page, 'deal').click();
  await waitForPhase(page, 'playerTurn');
  await page.locator(`[data-action="${action}"]`).click();
  await waitForPhase(page, 'roundResult');
  await control(page, 'next-hand').click();
  await waitForPhase(page, 'betting');
}

test.describe('B15: a chip whose denomination alone exceeds the ceiling', () => {
  test('renders disabled on the shipped page, where the table maximum binds', async ({ page }) => {
    // The game exactly as it ships: no harness, no options, Bronze, 1,000 chips.
    await atShippedBetting(page);

    const limits = tableLimits('bronze');
    expect(await balance(page)).toBe(1000);
    expect(wagerCeiling(limits, 1000)).toBe(limits.maximum);

    await expect(chip(page, 500)).toBeDisabled();
    await expect(chip(page, 100)).toBeEnabled();
    await expect(chip(page, 50)).toBeEnabled();
    await expect(chip(page, 10)).toBeEnabled();

    // And it says why, in the sentence for the state it is actually in. SPEC
    // 4.11 gives the ceiling two player meanings, a denomination this table
    // has no use for and a tap that would carry the wager past the ceiling,
    // and the greyed chip is the first. `src/ui/dom.ts` requires the control,
    // the mirror and the announcement to speak one sentence, so the accessible
    // name below and the mirror's own greyed list read the same words.
    await expect(chip(page, 500)).toHaveAttribute(
      'aria-label',
      '500. This chip is more than the table maximum or your balance allows.',
    );
    await expect(chip(page, 100)).not.toHaveAttribute('aria-label', /.*/);
  });

  test('renders enabled at Gold, where the balance is the lower half', async ({ page }) => {
    // The control for the test above: the disabled state is computed from the
    // ceiling rather than pinned to the 500 chip. Gold takes 2,000, the balance
    // is 1,000, so every denomination fits and none is disabled.
    await atBetting(page, { table: 'gold', bestBalance: 10_000 });

    expect(wagerCeiling(tableLimits('gold'), 1000)).toBe(1000);
    for (const denomination of [10, 50, 100, 500] as const) {
      await expect(chip(page, denomination)).toBeEnabled();
    }
  });
});

test.describe('B15: a tap over the ceiling', () => {
  test('is rejected with a reason on the shipped page, and never clamped', async ({ page }) => {
    await atShippedBetting(page);

    // Build 60, one accepted tap at a time. Each adds exactly its own
    // denomination: no control but Max and Repeat computes a value.
    await chip(page, 50).click();
    await expect(readoutValue(page, 'wager')).toHaveText('50');
    await chip(page, 10).click();
    await expect(readoutValue(page, 'wager')).toHaveText('60');

    const balanceBefore = await balance(page);

    // 60 + 50 is 110, over Bronze's ceiling of 100. The chip is enabled, because
    // 50 on its own fits; the tap is what is refused.
    await expect(chip(page, 50)).toBeEnabled();
    await chip(page, 50).click();

    await expect(notice(page)).toHaveAttribute('data-reason', 'above-ceiling');
    await expect(notice(page)).toHaveAttribute('data-layer', 'wallet');
    await expect(notice(page)).not.toBeEmpty();

    // The discriminator: a clamp would read 100 here. A refusal reads 60.
    expect(await wager(page)).toBe(60);
    expect(await balance(page)).toBe(balanceBefore);
    await expect(shell(page)).toHaveAttribute('data-phase', 'betting');
  });

  test('changes none of the four identity terms', async ({ page }) => {
    // The same refusal, with the machine readable, so "changes nothing" is the
    // whole wallet rather than the two numbers the readouts show.
    await atBetting(page, { seed: SEED });
    await chip(page, 50).click();
    await chip(page, 10).click();
    await expect(readoutValue(page, 'wager')).toHaveText('60');

    const before = await conserved(page);
    await chip(page, 50).click();
    await expect(notice(page)).toHaveAttribute('data-reason', 'above-ceiling');

    const after = await conserved(page);
    expect(after).toEqual(before);
    expect(after.conserved).toBe(sumOf(after));
    expect(await wager(page)).toBe(60);
  });
});

test.describe('B15: only Max and Repeat compute a value', () => {
  test('and both compute a legal multiple of 10, at the ceiling and below it', async ({ page }) => {
    await atBetting(page, { seed: SEED, table: 'silver', bestBalance: 10_000 });
    const limits = tableLimits('silver');

    // Max on a full balance: the table maximum binds, and 500 is on the grid.
    await control(page, 'max').click();
    await expectWager(page, wagerCeiling(limits, 1000));
    expect((await wager(page)) % WAGER_GRID).toBe(0);

    // One seeded round, lost, leaves 500 chips.
    await playRound(page, 'stand');
    await expectBalance(page, 500);

    // Repeat at exactly the ceiling: 500 against min(500, 500). SPEC 4.11 reads
    // "affordable" as the whole ceiling, not the balance alone.
    await control(page, 'repeat').click();
    await expectWager(page, 500);
    expect((await wager(page)) % WAGER_GRID).toBe(0);

    // A second seeded round, surrendered, leaves an off-grid balance of 475.
    await control(page, 'clear').click();
    await expectWager(page, 0);
    await chip(page, 50).click();
    await expectWager(page, 50);
    await playRound(page, 'surrender');
    await expectBalance(page, 475);
    const chips = await balance(page);
    expect(chips % WAGER_GRID).not.toBe(0);

    // Max floors an off-grid ceiling onto the grid. This is the clause the
    // criterion names and the one a ceiling that happened to be a multiple of 10
    // could never exercise: 475 becomes 470, not 475.
    await control(page, 'max').click();
    await expectWager(page, 470);
    const maxed = await wager(page);
    expect(maxed % WAGER_GRID).toBe(0);
    expect(maxed).toBeLessThanOrEqual(wagerCeiling(limits, chips));

    // And the balance is now the lower half of the ceiling, so the 500 chip is
    // disabled by the balance rather than by the table.
    expect(wagerCeiling(limits, chips)).toBe(chips);
    await expect(chip(page, 500)).toBeDisabled();
    await expect(chip(page, 100)).toBeEnabled();
  });
});

test.describe('B15: Deal below the table minimum', () => {
  test('is blocked with a reason rather than raised to the minimum', async ({ page }) => {
    await atBetting(page, { seed: SEED, table: 'silver', bestBalance: 10_000 });
    const limits = tableLimits('silver');

    await chip(page, 10).click();
    await expectWager(page, 10);
    expect(await wager(page)).toBeLessThan(limits.minimum);

    const before = await conserved(page);
    await control(page, 'deal').click();

    await expect(notice(page)).toHaveAttribute('data-reason', 'below-minimum');
    await expect(notice(page)).not.toBeEmpty();

    // Blocked, not raised: the wager the player built is still on the board and
    // the machine is still on the betting screen.
    expect(await wager(page)).toBe(10);
    await expect(shell(page)).toHaveAttribute('data-phase', 'betting');
    expect(await conserved(page)).toEqual(before);
  });
});

test.describe('B15: the four-term identity', () => {
  test('is conserved across every betting control', async ({ page }) => {
    await atBetting(page, { seed: SEED, table: 'silver', bestBalance: 10_000 });
    const opening = await conserved(page);

    // Every control on the betting screen, including one that is refused. None
    // of them may move the identity: the wager has not left the balance yet.
    await chip(page, 100).click();
    await chip(page, 500).click();
    await control(page, 'max').click();
    await control(page, 'clear').click();
    await chip(page, 50).click();
    await control(page, 'repeat').click();
    await expect(notice(page)).toHaveAttribute('data-reason', 'nothing-to-repeat');

    const after = await conserved(page);
    expect(after.conserved).toBe(opening.conserved);
    expect(after.conserved).toBe(sumOf(after));
    expect(after.committed).toBe(0);
    expect(after.insuranceStake).toBe(0);
    expect(after.deferredStake).toBe(0);
  });

  test('moves across a round by exactly the settled outcome', async ({ page }) => {
    await atBetting(page, { seed: SEED, table: 'silver', bestBalance: 10_000 });

    await control(page, 'max').click();
    const before = await conserved(page);

    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');

    // Mid-round the identity has not moved: the wager left `chips` and arrived
    // in `committed`, which is the whole point of the four-term form.
    const midRound = await conserved(page);
    expect(midRound.committed).toBe(500);
    expect(midRound.chips).toBe(before.chips - 500);
    expect(midRound.conserved).toBe(before.conserved);
    expect(midRound.conserved).toBe(sumOf(midRound));

    await page.locator('[data-action="stand"]').click();
    await waitForPhase(page, 'roundResult');

    const snapshot = await readout(page);
    const phase = snapshot.phase;
    expect(phase.kind).toBe('roundResult');
    if (phase.kind !== 'roundResult') {
      return;
    }

    // The settled outcome, computed from the machine's own result record rather
    // than from the difference this assertion is checking.
    const handNet = phase.result.hands.reduce((total, hand) => total + (hand.credit - hand.wager), 0);
    const insuranceNet = phase.result.insurance === null ? 0 : phase.result.insurance.net;

    const after = await conserved(page);
    expect(after.conserved).toBe(before.conserved + handNet + insuranceNet);
    expect(after.conserved).toBe(sumOf(after));
    expect(after.committed).toBe(0);
  });

  test('holds through an insured round, with the third term actually non-zero', async ({ page }) => {
    // The round above is a two-term round: SPEC 4.7's stake and its unfunded
    // remainder are identically zero throughout it, so the four-term form and
    // the two-term one agree on every frame and the clause is vacuous. This is
    // the round that separates them. Seed 4 deals a dealer Ace at Bronze, so the
    // offer is made and a stake of half the initial wager is taken.
    await atBetting(page, { seed: INSURED_SEED });

    await chip(page, 50).click();
    await expectWager(page, 50);
    await control(page, 'deal').click();
    await waitForPhase(page, 'insurance');

    const before = await conserved(page);
    expect(before.insuranceStake).toBe(0);
    expect(before.committed).toBe(50);

    // Sample every frame from here. SPEC 5 gives the peek 0.3 s, which is the
    // whole window in which the stake is outstanding, so a poll from outside the
    // page could step over it on a loaded machine and report a green vacuum.
    await watchWallet(page);
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
    expect(side, 'the round carried a side wager').not.toBeNull();
    if (side === null) {
      return;
    }
    expect(side.stake).toBe(25);
    expect(side.deferred).toBe(0);

    const samples = await walletSamples(page);
    expect(samples.length, 'the sampler ran').toBeGreaterThan(3);

    // Observation one: the third term is genuinely non-zero for part of the
    // round, so the assertions below are about the four-term form and not about
    // an arithmetic identity between three zeroes.
    const staked = samples.filter((sample) => sample.insuranceStake !== 0);
    expect(staked.length, 'the stake is outstanding for at least one frame').toBeGreaterThan(0);
    for (const sample of staked) {
      expect(sample.insuranceStake).toBe(25);
    }

    // Observation two: on every frame, the sum the wallet publishes is the sum
    // of the four terms it publishes beside it. A published total that dropped
    // one of them would disagree here on exactly the insured frames.
    for (const sample of samples) {
      expect(
        sample.conserved,
        `the published identity at ${sample.phase} is its own four terms`,
      ).toBe(sample.chips + sample.committed + sample.insuranceStake - sample.deferredStake);
      expect(sample.deferredStake).toBe(0);
    }

    // Observation three: across the round the identity moves exactly twice, by
    // the side wager at the peek and by the hand at the settlement, and by
    // nothing else. SPEC 4.10 settles insurance before the ladder, so the order
    // of the two steps is the spec's rather than this test's.
    const handNet = phase.result.hands.reduce((total, hand) => total + (hand.credit - hand.wager), 0);
    const seen: number[] = [];
    for (const sample of samples) {
      if (seen.at(-1) !== sample.conserved) {
        seen.push(sample.conserved);
      }
    }
    expect(seen).toEqual([
      before.conserved,
      before.conserved + side.net,
      before.conserved + side.net + handNet,
    ]);

    const after = await conserved(page);
    expect(after.conserved).toBe(before.conserved + handNet + side.net);
    expect(after.conserved).toBe(sumOf(after));
    expect(after.insuranceStake).toBe(0);
    expect(after.committed).toBe(0);
  });
});
