/**
 * Item `C4`, Major, over the built `dist/`. The **second** bust-out. `BJ-23`.
 *
 *   "Busting out offers a lower table or a free reset ... The start screen
 *    offers a table choice in which exactly the unlocked, affordable tables
 *    are enterable, and moving between them takes effect."
 *
 * `bust-out.spec.ts` grades that criterion's four clauses on one bust-out.
 * This spec exists for the half of "exactly the unlocked, affordable tables"
 * that one bust-out structurally cannot reach.
 *
 * **The gap, as `BJ-20`'s sweep recorded it.** The screen's lower-table list
 * is cached behind a rebuild key: `src/ui/components/screens.ts` joins the
 * offer's table ids and rebuilds the buttons only when that string changes.
 * The cache starts empty, so the **first** offer is built whatever the key
 * says, and a session that reaches the screen once never asks the cache a
 * second question. `BJ-20`'s `C4` ledger entry originally mutated the key and
 * the sweep reported it undetected; the entry was re-pointed at the build
 * loop, which one bust-out does grade, and the coupling was written down as an
 * open gap with this part named as its home.
 *
 * **What this spec drives.** One session, two bust-outs, and two offers that
 * are not the same list. The route to the first is a **doubled hand that
 * busts**: `flow-seeds.ts`'s `JOURNEY_WAGER` carries the arithmetic and says
 * plainly that an undoubled loss can reach the same band, so the double is a
 * choice rather than a necessity. What it buys is a second property in the
 * same session, asserted below off the machine: SPEC 4.5 records a doubled
 * hand that busts as `bust` and not as `doubled`, and no plain loss reaches
 * that. 80 chips are left, which both lower tables can be entered on, so the
 * first screen offers two drops. The journey takes the Silver one, loses the
 * next round, and comes back to the screen holding 30, which only Bronze can
 * be entered on. A cache that never rebuilt would leave a **Drop to Silver**
 * button in front of a player who is sitting at Silver, which is the exact
 * defect the key exists to prevent, and the assertion below is the count of
 * drop controls plus which table each one names.
 *
 * The seed is hunted rather than staged, on the whole support directory's
 * precedent: `boot` takes a seed and never a scripted deck. The hunt replays
 * this exact route and states the property it needs, so a retune of SPEC 6's
 * tables fails in the search with a reason rather than quietly handing back a
 * journey whose two screens look alike.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

import { STARTING_CHIPS, tableLimits, type TableId } from '../../src/core/wallet';
import {
  doubleBustJourney,
  JOURNEY_CHIPS,
  JOURNEY_DROP,
  JOURNEY_MARK,
  JOURNEY_SECOND_WAGER,
  JOURNEY_TABLE,
  JOURNEY_WAGER,
} from './support/flow-seeds';
import {
  bootGame,
  chip,
  control,
  numberIn,
  PHASE_TIMEOUT,
  pressOn,
  readout,
  readoutValue,
  settle,
  shell,
  waitForPhase,
} from './support/game';

/**
 * The two balances the journey lands on, computed rather than transcribed.
 *
 * SPEC 4.11's arithmetic and nothing else: a doubled hand that busts loses
 * twice its wager, and a busted hand credits back nothing. Writing 80 and 30
 * here instead would put the same figures in two files, and a table retune
 * that moved them would fail this spec on a number rather than the search on
 * its band. Both are under a thousand, so no locale groups them and the
 * sentence assertions below can name them directly.
 */
const AFTER_FIRST = STARTING_CHIPS - JOURNEY_WAGER * 2;
const AFTER_SECOND = AFTER_FIRST - JOURNEY_SECOND_WAGER;

/** The sentence each bust-out screen leads with, as its own table states it. */
function promptFor(table: TableId, held: number): RegExp {
  return new RegExp(
    `minimum here is ${String(tableLimits(table).minimum)} and you hold ${String(held)}`,
    'i',
  );
}

/** Every drop control the bust-out screen is offering right now. */
function drops(page: Page): Locator {
  return page.locator('[data-drop-table]');
}

/** The sentence the bust-out screen leads with, which names both figures. */
function prompt(page: Page): Locator {
  return page.locator('[data-screen="bust-out"] .bj-screen__prompt');
}

/** Wait until SPEC 11's chip readout says what the machine should be holding. */
async function holds(page: Page, chips: number): Promise<void> {
  await expect
    .poll(async () => numberIn(readoutValue(page, 'chips')), { timeout: PHASE_TIMEOUT })
    .toBe(chips);
}

test.describe('C4: the second bust-out offers what the second balance can afford', () => {
  test('a doubled hand busts the bankroll out, and the offer is rebuilt on the way back', async ({
    page,
  }) => {
    const journey = doubleBustJourney();

    await bootGame(page, {
      seed: journey.seed,
      table: JOURNEY_TABLE,
      bestBalance: JOURNEY_MARK,
    });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');

    // ----- the first round: 460 doubled to 920, and a hand that busts -----
    for (const denomination of JOURNEY_CHIPS) {
      await chip(page, denomination).click();
    }
    await expect
      .poll(async () => numberIn(readoutValue(page, 'wager')), { timeout: PHASE_TIMEOUT })
      .toBe(JOURNEY_WAGER);

    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    expect(await pressOn(page, '[data-action="double"]', 'playerTurn')).toBe(true);
    await waitForPhase(page, 'roundResult');

    // The premise, read off the machine rather than assumed: the hand carried
    // twice the wager and it is the cards that ended it. A doubled hand that
    // busts is recorded `bust` rather than `doubled`, and the felt is not
    // swept until Next Hand, so both are still readable here.
    const settled = await readout(page);
    expect(settled.hands[0]?.wager, 'the double doubled the wager').toBe(JOURNEY_WAGER * 2);
    expect(settled.hands[0]?.state, 'the doubled hand busted').toBe('bust');
    await holds(page, AFTER_FIRST);

    // ----- the first offer: two tables, because 80 chips can enter both -----
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'bustOut');
    await expect(drops(page)).toHaveCount(journey.firstOffer.length);
    for (const id of journey.firstOffer) {
      await expect(page.locator(`[data-drop-table="${id}"]`)).toBeVisible();
    }
    await expect(prompt(page)).toContainText(promptFor(JOURNEY_TABLE, AFTER_FIRST));

    // ----- the drop, and a second round lost by hitting past 21 -----
    await page.locator(`[data-drop-table="${JOURNEY_DROP}"]`).click();
    await waitForPhase(page, 'betting');
    await expect
      .poll(async () => readoutValue(page, 'table').textContent(), { timeout: PHASE_TIMEOUT })
      .toContain('Silver');
    await holds(page, AFTER_FIRST);

    await chip(page, JOURNEY_SECOND_WAGER).click();
    await expect
      .poll(async () => numberIn(readoutValue(page, 'wager')), { timeout: PHASE_TIMEOUT })
      .toBe(JOURNEY_SECOND_WAGER);
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');

    // The hit count is the search's own answer, asserted rather than absorbed:
    // the machine is seeded and the intents are the ones the search applied, so
    // a different count means the round is not the round that was hunted.
    let hits = 0;
    for (let attempt = 0; attempt <= journey.hits; attempt += 1) {
      if ((await shell(page).getAttribute('data-phase')) !== 'playerTurn') {
        break;
      }
      if (await pressOn(page, '[data-action="hit"]', 'playerTurn')) {
        hits += 1;
      }
      await settle(page);
    }
    expect(hits, 'the second round busted on the hunted number of hits').toBe(journey.hits);
    await waitForPhase(page, 'roundResult');
    await holds(page, AFTER_SECOND);

    // ----- the second offer: one table, and not the one being sat at -----
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'bustOut');
    await expect(drops(page)).toHaveCount(journey.secondOffer.length);
    for (const id of journey.secondOffer) {
      await expect(page.locator(`[data-drop-table="${id}"]`)).toBeVisible();
    }
    // The stale-cache defect, named in both directions. A screen that kept the
    // first offer would still carry the seat the player is already in, and it
    // would carry one more control than the balance can pay for.
    await expect(page.locator(`[data-drop-table="${JOURNEY_DROP}"]`)).toHaveCount(0);
    await expect(page.locator('[data-drop-table="gold"]')).toHaveCount(0);
    await expect(prompt(page)).toContainText(promptFor(JOURNEY_DROP, AFTER_SECOND));
    // SPEC 4.12 offers both routes on every answer, and item `L4` makes the
    // reset free and always available, so the second screen carries it too.
    await expect(control(page, 'reset-bankroll')).toBeVisible();
  });
});
