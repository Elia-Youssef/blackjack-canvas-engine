/**
 * Item `C5`, Major, over the built `dist/`.
 *
 *   "Overlays never cover a continuous readout, and opening then closing any
 *    overlay leaves game state unchanged."
 *
 * Two clauses, and each is asserted twice, once as a player would see it and
 * once against the machine.
 *
 * **"Never cover a continuous readout" is measured in rendered pixels.** Every
 * one of SPEC 11's fourteen readouts is located, required to be visible with a
 * box of its own, and required not to intersect the open overlay's box, on all
 * three engines. The check would be vacuous if the overlay had no box, so the
 * overlay is required to have one **and** to overlap the play surface: SPEC 10
 * says the play surface persists behind every overlay, so an overlay that
 * covered nothing would satisfy the letter of the clause and none of its point.
 *
 * **"Leaves game state unchanged" is asserted against the machine.** The whole
 * readout is compared, phase payload included, before the open and after the
 * close, and a control in the same file changes one thing to prove the
 * comparison can fail. The player-visible half is the fourteen readouts,
 * compared as text on the shipped page with nothing injected.
 *
 * **And the game keeps running behind an overlay.** SPEC 10 calls the overlays
 * "reachable at any time and never blocking state", so one is opened during the
 * paced deal and the round is required to reach the player's turn with it still
 * open. A chrome that paused the loop would pass every other test in this file.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

import { OVERLAY_IDS } from '../../src/ui/state';
import { READOUT_KEYS } from '../../src/ui/components/readouts';
import { readoutTexts } from './support/flow';
import {
  atBetting,
  atShippedBetting,
  boxOf,
  chip,
  control,
  intersects,
  readout,
  readoutValue,
  shell,
  waitForPhase,
} from './support/game';

/**
 * This file grades `C5` at Playwright's default 1280 x 720 viewport, which is the
 * `wide` breakpoint. That matters from `BJ-16` onward: below 768 px the narrow
 * top bar keeps three of SPEC 11's fourteen readouts and puts the other eleven
 * behind a disclosure, so the `toBeVisible` assertions below are width
 * dependent by design. `tests/browser/portrait.spec.ts` grades the narrow
 * arrangement and requires all fourteen to be reachable there.
 */
const SEED = 53;

// `Box`, `boxOf` and `intersects` come from `./support/game`, which this file
// already imports from. They were declared here as well until `AUDIT-2` finding
// `X3-06`, character for character, which made the overlap rule this file grades
// two readings of one predicate across three specs, and left the shared `Box`
// and `boxOf` with no importer at all.

function overlayHost(page: Page): Locator {
  return page.locator('[data-overlay-host="true"]');
}

/**
 * The machine's state, minus nothing.
 *
 * The full readout is compared, including the phase payload, the cards, the
 * shoe and all four wallet terms. `elapsed` and `queued` are in it too: both are
 * stable on the two untimed screens this is used from, and leaving them out
 * would be the one place a change could hide.
 */
type MachineState = Awaited<ReturnType<typeof readout>>;

test.describe('C5: an overlay never covers a continuous readout', () => {
  test('the chrome renders one element for each of SPEC 11 fourteen readouts', async ({ page }) => {
    // The count is asserted rather than inherited. Every test below iterates the
    // list the component publishes, so a readout quietly dropped from that list
    // would quietly drop out of the coverage with it. SPEC 11 names fourteen.
    expect(READOUT_KEYS).toHaveLength(14);
    expect(new Set(READOUT_KEYS).size).toBe(14);

    await atShippedBetting(page);
    for (const key of READOUT_KEYS) {
      await expect(readoutValue(page, key), `${key} is on the page once`).toHaveCount(1);
      await expect(readoutValue(page, key), `${key} shows something`).not.toBeEmpty();
    }
  });

  for (const id of OVERLAY_IDS) {
    test(`keeps all fourteen readouts clear of the ${id} overlay`, async ({ page }) => {
      // The shipped page, driven through its own controls. No harness.
      await atShippedBetting(page);
      await chip(page, 50).click();

      await page.locator(`[data-open-overlay="${id}"]`).click();
      await expect(overlayHost(page)).toBeVisible();
      await expect(overlayHost(page)).toHaveAttribute('data-open', id);

      const panel = await boxOf(overlayHost(page), `${id} overlay`);
      expect(panel.width, 'the overlay has real width').toBeGreaterThan(0);
      expect(panel.height, 'the overlay has real height').toBeGreaterThan(0);

      // The control that keeps the non-intersection honest: the overlay is a
      // real panel over the play surface, not an empty box somewhere harmless.
      const surface = await boxOf(page.locator('.bj-surface'), 'the play surface');
      expect(intersects(panel, surface), 'the overlay sits over the play surface').toBe(true);

      for (const key of READOUT_KEYS) {
        const value = readoutValue(page, key);
        await expect(value, `${key} stays visible`).toBeVisible();
        const box = await boxOf(value, `readout ${key}`);
        expect(box.width, `${key} has width`).toBeGreaterThan(0);
        expect(box.height, `${key} has height`).toBeGreaterThan(0);
        expect(intersects(panel, box), `the ${id} overlay covers the ${key} readout`).toBe(false);
      }

      // And the play surface is still there behind it, which is what SPEC 10
      // means by the readouts being genuinely continuous.
      await expect(page.locator('.bj-surface')).toHaveCount(1);
      expect(surface.width).toBeGreaterThan(0);
    });
  }
});

test.describe('C5: opening then closing an overlay changes nothing', () => {
  test('leaves every readout on the shipped page exactly as it was', async ({ page }) => {
    await atShippedBetting(page);
    await chip(page, 50).click();
    await expect(readoutValue(page, 'wager')).toHaveText('50');

    const before = await readoutTexts(page);
    for (const id of OVERLAY_IDS) {
      await page.locator(`[data-open-overlay="${id}"]`).click();
      await expect(overlayHost(page)).toBeVisible();
      await control(page, 'close-overlay').click();
      await expect(overlayHost(page)).toBeHidden();
    }
    expect(await readoutTexts(page)).toEqual(before);

    // The control: the comparison above can fail. One accepted chip tap is all
    // it takes, and a test that could not notice one would be asserting nothing.
    await chip(page, 10).click();
    await expect(readoutValue(page, 'wager')).toHaveText('60');
    expect(await readoutTexts(page)).not.toEqual(before);
  });

  for (const id of OVERLAY_IDS) {
    test(`leaves the machine unchanged across the ${id} overlay, at betting`, async ({ page }) => {
      await atBetting(page, { seed: SEED });
      await chip(page, 50).click();
      await expect(readoutValue(page, 'wager')).toHaveText('50');

      const before: MachineState = await readout(page);
      await page.locator(`[data-open-overlay="${id}"]`).click();
      await expect(overlayHost(page)).toBeVisible();
      expect(await readout(page)).toEqual(before);

      await control(page, 'close-overlay').click();
      await expect(overlayHost(page)).toBeHidden();
      expect(await readout(page)).toEqual(before);
    });
  }

  test('leaves the machine unchanged mid-round, during the player turn', async ({ page }) => {
    await atBetting(page, { seed: SEED });
    await chip(page, 50).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');

    const before: MachineState = await readout(page);
    expect(before.hands).toHaveLength(1);
    expect(before.wallet.committed).toBe(50);

    await page.locator('[data-open-overlay="statistics"]').click();
    await expect(overlayHost(page)).toBeVisible();
    await control(page, 'close-overlay').click();
    await expect(overlayHost(page)).toBeHidden();

    expect(await readout(page)).toEqual(before);
    await expect(shell(page)).toHaveAttribute('data-phase', 'playerTurn');
  });
});

test.describe('C5: an overlay never blocks state', () => {
  test('the paced deal runs to the player turn with an overlay open', async ({ page }) => {
    await atBetting(page, { seed: SEED });
    await chip(page, 50).click();
    await control(page, 'deal').click();

    // Opened while SPEC 10's `dealing` is still counting its queue down. SPEC 10
    // calls the overlays "reachable at any time and never blocking state", so
    // the round has to arrive at the player's turn regardless.
    await page.locator('[data-open-overlay="howToPlay"]').click();
    await expect(overlayHost(page)).toBeVisible();

    await waitForPhase(page, 'playerTurn');
    await expect(overlayHost(page)).toBeVisible();

    const snapshot = await readout(page);
    expect(snapshot.hands[0]?.cards).toHaveLength(2);
    expect(snapshot.dealerConcealed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AUDIT-2, findings J2-02 and Z2-01: the Settings panel says what it shows
// ---------------------------------------------------------------------------

/**
 * Assert a house-rule control's pressed state.
 *
 * A retrying locator assertion rather than one `evaluate` over all five,
 * because the chrome syncs on the animation frame after the press: a snapshot
 * taken in the same tick as the click reads the frame before it and would fail
 * for a reason that has nothing to do with what is being graded.
 */
async function expectPressed(page: Page, selector: string, pressed: boolean): Promise<void> {
  await expect(page.locator(selector)).toHaveAttribute('aria-pressed', String(pressed));
}

/** The panel's own statement of the house rules. */
function houseRulesLine(page: Page): Locator {
  return page.locator('[data-field="house-rules"]');
}

/**
 * SPEC 14's house-rule boundary, as the Settings panel states it. `AUDIT-2`.
 *
 * The panel renders two things about one subject: five toggles and a sentence.
 * They were two reads of two different records on the same frame, the toggles
 * off the staged rules and the sentence off the rules in force, so between
 * staging a change and the next deal the panel showed a control pressed **off**
 * beside a sentence saying that rule was **on**, about the very round the
 * player was one press away from dealing (finding `J2-02`, reproduced three
 * times in both directions). The sentence's own comment called it "the honest
 * answer to 'has my change landed yet'", and at the only moment that question
 * is asked it gave the opposite of the truth. Nothing asserted it:
 * `[data-field="house-rules"]` appeared in no test.
 *
 * The seam built for this shipped uncalled (finding `Z2-01`): the machine
 * publishes `stagedRules()` "so a settings panel reads this to show what it
 * changed", and the composition root kept a parallel copy instead.
 */
test.describe('C5: the Settings panel and its own sentence agree about the house rules', () => {
  test('states the staged rules, and says they are the next deal', async ({ page }) => {
    await atBetting(page, { seed: SEED });
    await page.locator('[data-open-overlay="settings"]').click();
    await expect(overlayHost(page)).toBeVisible();

    // Nothing staged: the sentence is about the round, and it agrees with the
    // toggles, which is the state this panel is in for most of a session.
    await expect(houseRulesLine(page)).toContainText('This round runs');
    await expect(houseRulesLine(page)).toContainText('Surrender on');
    await expectPressed(page, '[data-rule="surrender"]', true);
    await expectPressed(page, '[data-decks="6"]', true);

    // Two changes, one boolean and one choice, which is the construction the
    // finding used.
    await page.locator('[data-rule="surrender"]').click();
    await page.locator('[data-decks="8"]').click();

    await expectPressed(page, '[data-rule="surrender"]', false);
    await expectPressed(page, '[data-decks="8"]', true);
    // The sentence moved with them, and it names the boundary rather than
    // describing a round that is not the one these rules will be played under.
    await expect(houseRulesLine(page)).toContainText('From your next deal:');
    await expect(houseRulesLine(page)).toContainText('Surrender off');
    await expect(houseRulesLine(page)).toContainText('8 decks');
    // The machine holds the stage rather than the chrome: SPEC 14's change is
    // off the felt until the deal, so the round in play still says 6.
    expect((await readout(page)).rules.decks).toBe(6);

    // Pressing the toggle back is a stage identical to the rules in force,
    // which is no stage at all: the panel goes back to describing the round.
    // This is `Z2-01`'s `null` contract, seen from the surface that reads it.
    await page.locator('[data-rule="surrender"]').click();
    await page.locator('[data-decks="6"]').click();
    await expect(houseRulesLine(page)).toContainText('This round runs');
    await expect(houseRulesLine(page)).toContainText('Surrender on');
    await expectPressed(page, '[data-rule="surrender"]', true);
  });

  test('applies what it stated, on the next deal', async ({ page }) => {
    // The other half of the sentence's promise, driven: what the panel said the
    // next deal would run under is what the next deal runs under. Without this
    // the arm above would grade a wording rather than a claim.
    await atBetting(page, { seed: SEED });
    await page.locator('[data-open-overlay="settings"]').click();
    await page.locator('[data-rule="surrender"]').click();
    await expect(houseRulesLine(page)).toContainText('From your next deal:');
    await control(page, 'close-overlay').click();

    await chip(page, 50).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    expect((await readout(page)).rules.surrender).toBe(false);

    // And now that it is in force, the panel is back to describing the round.
    await page.locator('[data-open-overlay="settings"]').click();
    await expect(houseRulesLine(page)).toContainText('This round runs');
    await expect(houseRulesLine(page)).toContainText('Surrender off');
    await expectPressed(page, '[data-rule="surrender"]', false);
  });
});
