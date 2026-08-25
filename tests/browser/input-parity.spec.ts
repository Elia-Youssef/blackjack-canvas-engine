/**
 * Item `D2`, Critical, 19 points, over the built `dist/`.
 *
 *   "Every action in the game is reachable by pointer, by touch and by keyboard.
 *    No action exists on only one input method."
 *
 * Two sentences, and the second is not a restatement of the first. The
 * clause-to-assertion map:
 *
 * | Clause | Where |
 * |---|---|
 * | Every action is reachable by pointer | the `D2: by pointer` routes |
 * | Every action is reachable by touch | the `D2: by touch` routes |
 * | Every action is reachable by keyboard | the `D2: by keyboard` routes |
 * | Every control on every screen, by all three | `every control on every screen` |
 * | "Every action" is the machine's list, not this file's | `covers every intent SPEC 10 has` |
 * | No action exists on only one input method | `renders no control the platform does not activate` |
 *
 * **"Action" is taken from the machine, not from the screen.** `INTENT_KINDS` in
 * `src/core/table.ts` is SPEC 10's eighteen, and `ChromeActions` in
 * `src/ui/state.ts` is the five things a control may ask for that are not
 * intents. Every one of the twenty-three is driven below by all three methods.
 * The coverage test compares the routes' declared actions against those two
 * lists rather than against a list written here, so an intent added to the game
 * with no control on it fails this file instead of passing it silently, and each
 * route asserts at its end that it really pressed everything it declared, so a
 * declaration cannot drift from what the route does.
 *
 * **Each method presses through the platform.** `page.mouse` and
 * `page.touchscreen` drive the engine's own input pipeline, so the page receives
 * a real mouse press and a real touch with the compatibility events the browser
 * generates for each; the keyboard arm focuses and presses a real key.
 * `tests/browser/support/controls.ts` holds the one press, so no arm can quietly
 * become a dispatched event.
 *
 * **The second sentence is a claim about how the controls are built.** An action
 * can exist on one input method alone only if something binds that method's own
 * event, so the file requires every interactive element in the shipped page to
 * be an element the platform activates from all three: a `<button>` or a
 * `<summary>`, and nothing with a hand-rolled activation. The `BJ-17` ledger
 * plants both halves of the defect, a `pointerdown` binding that no keyboard can
 * reach and a `keydown` binding no touch can, and requires this file red for
 * each.
 *
 * **Routes.** The betting loop, the overlays and the settings run on the shipped
 * page with nothing injected. The four that cannot take the seeded harness
 * `BJ-15` landed: a splittable pair, SPEC 4.7's offer and SPEC 4.12's bust-out
 * are deals rather than screens, and `tests/browser/support/action-seeds.ts`
 * searches the real machine for each rather than staging a deck.
 */

import { expect, test, type Page } from '@playwright/test';

import { INTENT_KINDS } from '../../src/core/table';
import type { ChromeActions } from '../../src/ui/state';
import { BUST_OUT_WAGER, bustOutSeed, splitSeed } from './support/action-seeds';
import {
  INPUT_METHODS,
  SCREEN_CONTROLS,
  controlsInDomOrder,
  focusByTab,
  pressBy,
  selectorFor,
  type InputMethod,
} from './support/controls';
import {
  bootGame,
  control,
  numberIn,
  openShippedPage,
  readout,
  readoutValue,
  resizeTo,
  settle,
  shell,
  waitForPhase,
} from './support/game';
import { peekSeed } from './support/peek-seeds';

/**
 * Every arm of this file runs in a touch-capable context.
 *
 * One context rather than a touch-only describe, because a mouse and a keyboard
 * work in a context that also has a touchscreen and a file that switched
 * contexts between arms would be comparing two pages. Nothing in the chrome
 * selects on `pointer: coarse` or on `hover`, so the emulation changes what the
 * page can receive and nothing about what it renders.
 */
test.use({ hasTouch: true });

/** SPEC 6 unlocks Silver at 2,500 and Gold at 10,000. */
const UNLOCKED = 10_000;

/** SPEC 13's starting bankroll, which the free reset restores. */
const STARTING_CHIPS = 1000;

/** QUALITY-BAR section 3's minimum target. Item `D3` measures it at `BJ-22`. */
const TARGET_MIN = 44;

/**
 * One route's record of what it actually pressed.
 *
 * Per test rather than per file, because `playwright.config.ts` runs fully
 * parallel: two routes can be in two workers, and a module-level tally would be
 * a different tally in each of them. What crosses tests is the **declaration**
 * below, which is static, and each route requires its own presses to equal it.
 */
function route(page: Page, method: InputMethod) {
  const seen = new Set<string>();
  return {
    /** Press the control, and record the action it performs. */
    async press(action: string, key: string): Promise<void> {
      await pressBy(page, method, selectorFor(key));
      seen.add(action);
    },
    /** Press without recording, where the action is already covered. */
    async again(key: string): Promise<void> {
      await pressBy(page, method, selectorFor(key));
    },
    /** Require the route to have pressed exactly what it declared. */
    declared(actions: readonly string[]): void {
      expect([...seen].sort(), `${method}: the route drove what it declares`).toEqual(
        [...actions].sort(),
      );
    },
  };
}

/**
 * What each route declares it drives, and together the whole action list.
 *
 * Named per route rather than pooled, so the coverage test can say which route
 * is meant to carry an action nobody drove.
 */
const ROUTE_ACTIONS = Object.freeze({
  bettingControls: ['start', 'tapChip', 'max', 'clear', 'changeTable'],
  round: ['start', 'tapChip', 'deal', 'stand', 'nextHand', 'repeat'],
  playerActions: ['start', 'tapChip', 'deal', 'split', 'double', 'hit', 'stand'],
  surrender: ['start', 'tapChip', 'deal', 'surrender'],
  insuranceTaken: ['start', 'tapChip', 'deal', 'takeInsurance'],
  insuranceDeclined: ['start', 'tapChip', 'deal', 'declineInsurance'],
  dropTable: ['chooseTable', 'start', 'tapChip', 'deal', 'stand', 'nextHand', 'dropTable'],
  resetBankroll: ['chooseTable', 'start', 'tapChip', 'deal', 'stand', 'nextHand', 'resetBankroll'],
  overlays: ['openOverlay', 'closeOverlay'],
  settings: ['openOverlay', 'setCoachMode', 'setSpeed', 'setSurfaceSize'],
  disclosure: ['moreReadouts'],
});

/** The wager on SPEC 11's readout, as a number. */
async function wagerOf(page: Page): Promise<number> {
  return numberIn(readoutValue(page, 'wager'));
}

/**
 * Wait for SPEC 11's wager readout to reach a number, and require it.
 *
 * A poll rather than a read, and the reason is DESIGN section 3: a press is
 * **queued**, drained on the next frame and rendered by the sync at the end of
 * it, so a wager read in the same round trip as the press it followed is the
 * wager from before. The poll's failure message carries what the readout
 * actually said, so a wager that never arrives is still a readable failure.
 */
async function expectWager(page: Page, wager: number): Promise<void> {
  await expect
    .poll(async () => wagerOf(page), { message: `the wager readout reaches ${String(wager)}` })
    .toBe(wager);
}

/**
 * Wait until the player's turn is on the exact hand named, with the cards named.
 *
 * The finer form of `waitForPhase`, and the split route needs it twice: a split
 * and a double both leave `playerTurn` for a paced deal and come back to it, so
 * an assertion that the phase **is** `playerTurn` is satisfied by the frame
 * before the press has been drained at all. Every part of the reading moves
 * across that window, the number of hands, which one is active and how many
 * cards it holds, so all three are in the signature: waiting on "hand 0 with two
 * cards" alone would be satisfied by the hand that has not been split yet.
 */
async function waitForHands(
  page: Page,
  hands: number,
  active: number,
  cards: number,
): Promise<void> {
  const wanted = `${String(hands)} hands, hand ${String(active)} with ${String(cards)} cards`;
  await expect
    .poll(
      async () => {
        const snapshot = await readout(page);
        const { phase } = snapshot;
        if (phase.kind !== 'playerTurn') {
          return `phase ${phase.kind}`;
        }
        const held = snapshot.hands[phase.activeHand]?.cards.length ?? 0;
        return (
          `${String(snapshot.hands.length)} hands, ` +
          `hand ${String(phase.activeHand)} with ${String(held)} cards`
        );
      },
      { message: `the machine reaches ${wanted}` },
    )
    .toBe(wanted);
}

/** Boot the harness and leave the start screen, pressing Start by the method. */
async function enterBetting(
  page: Page,
  driver: ReturnType<typeof route>,
  options: { readonly seed?: number; readonly table?: 'bronze' | 'silver' | 'gold' } = {},
): Promise<void> {
  await bootGame(page, { bestBalance: UNLOCKED, ...options });
  await waitForPhase(page, 'start');
  await driver.press('start', 'data-control=start');
  await waitForPhase(page, 'betting');
}

/**
 * Play a Gold bankroll down to SPEC 4.12's bust-out, by the method under test.
 *
 * Every press on the way is a real one by that method: the route is the only
 * evidence for the two intents on the screen it ends at, and a setup that
 * clicked its way there would leave those two proven by a route nobody drove.
 * The table is reached through `chooseTable` rather than through a boot option,
 * so the one intent SPEC 10 puts on the start screen beside Start is driven here
 * with the machine as its witness.
 */
async function toBustOut(page: Page, driver: ReturnType<typeof route>): Promise<void> {
  await bootGame(page, { seed: bustOutSeed(), bestBalance: UNLOCKED });
  await waitForPhase(page, 'start');

  await driver.press('chooseTable', 'data-table=gold');
  await expect(page.locator('[data-table="gold"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-table="bronze"]')).toHaveAttribute('aria-pressed', 'false');
  expect((await readout(page)).table, 'the table choice reached the machine').toBe('gold');

  await driver.press('start', 'data-control=start');
  await waitForPhase(page, 'betting');

  for (const chip of [500, 100, 100, 100, 100, 50]) {
    await driver.press('tapChip', `data-chip=${String(chip)}`);
  }
  await expectWager(page, BUST_OUT_WAGER);

  await driver.press('deal', 'data-control=deal');
  await waitForPhase(page, 'playerTurn');
  await driver.press('stand', 'data-action=stand');
  await waitForPhase(page, 'roundResult');
  await driver.press('nextHand', 'data-control=next-hand');
  await waitForPhase(page, 'bustOut');
}

// ---------------------------------------------------------------------------
// The routes. One set per input method, and every one presses a real control.
// ---------------------------------------------------------------------------

for (const method of INPUT_METHODS) {
  test.describe(`D2: by ${method}`, () => {
    test('drives SPEC 4.11s betting controls on the shipped page', async ({ page }) => {
      // The game exactly as it ships: no harness, no options, Bronze, 1,000
      // chips. Every control on this screen is reachable on a launch a player
      // can actually make, so this route injects nothing.
      const driver = route(page, method);
      await openShippedPage(page);
      await waitForPhase(page, 'start');

      await driver.press('start', 'data-control=start');
      await waitForPhase(page, 'betting');

      await driver.press('tapChip', 'data-chip=50');
      await expectWager(page, 50);

      await driver.press('max', 'data-control=max');
      await expectWager(page, 100);

      await driver.press('clear', 'data-control=clear');
      await expectWager(page, 0);

      // SPEC 10's Change Table edge: at betting, with no wager placed, back to
      // the start screen with the balance intact.
      await driver.press('changeTable', 'data-control=change-table');
      await waitForPhase(page, 'start');
      await driver.again('data-control=start');
      await waitForPhase(page, 'betting');

      driver.declared(ROUTE_ACTIONS.bettingControls);
    });

    test('plays a round through and repeats the wager', async ({ page }) => {
      // The seeded harness rather than the shipped page, and for one reason: an
      // unseeded launch deals whatever the clock deals, and a dealer Ace puts
      // SPEC 4.7's offer between the deal and the player's turn. The offer has
      // two routes of its own below; what this one needs is a round that goes
      // straight through, which is what the searched seed guarantees.
      const driver = route(page, method);
      await enterBetting(page, driver, { seed: splitSeed() });

      await driver.press('tapChip', 'data-chip=50');
      await driver.press('deal', 'data-control=deal');
      await waitForPhase(page, 'playerTurn');

      await driver.press('stand', 'data-action=stand');
      await waitForPhase(page, 'roundResult');

      await driver.press('nextHand', 'data-control=next-hand');
      await waitForPhase(page, 'betting');

      // Repeat last, because it is the one control whose answer depends on a
      // round having happened: SPEC 4.11 repeats the previous round's wager.
      await driver.press('repeat', 'data-control=repeat');
      await expectWager(page, 50);

      driver.declared(ROUTE_ACTIONS.round);
    });

    test('plays split, double, hit and stand on one seeded pair', async ({ page }) => {
      // One round carries four of SPEC 4.5's five: the pair is split, the first
      // of the two hands is doubled, and the second is hit and stood. Surrender
      // cannot join them, because SPEC 4.8 refuses a hand that came from a
      // split, and it has a round of its own below.
      const driver = route(page, method);
      await enterBetting(page, driver, { seed: splitSeed() });
      await driver.press('tapChip', 'data-chip=50');
      await driver.press('deal', 'data-control=deal');
      await waitForPhase(page, 'playerTurn');

      expect((await readout(page)).hands, 'the seeded deal is one hand').toHaveLength(1);
      const wager = (await readout(page)).hands[0]?.wager ?? 0;

      await driver.press('split', 'data-action=split');
      // Two hands, the first of them dealt its second card and asking for a
      // decision. The seed is searched for exactly this: a first hand that
      // reached 21 on that card would have stood itself, and the Double below
      // would land on the second hand without the route noticing.
      await waitForHands(page, 2, 0, 2);

      await driver.press('double', 'data-action=double');
      // The double takes exactly one card and ends the hand, so the witness is
      // the wager on the hand it was pressed on, and the turn moving on.
      await waitForHands(page, 2, 1, 2);
      expect((await readout(page)).hands[0]?.wager, 'the double matched the wager').toBe(wager * 2);

      await driver.press('hit', 'data-action=hit');
      await waitForHands(page, 2, 1, 3);

      await driver.press('stand', 'data-action=stand');
      await waitForPhase(page, 'roundResult');

      driver.declared(ROUTE_ACTIONS.playerActions);
    });

    test('surrenders the first two cards for half the wager', async ({ page }) => {
      const driver = route(page, method);
      await enterBetting(page, driver, { seed: splitSeed() });
      await driver.press('tapChip', 'data-chip=100');
      await driver.press('deal', 'data-control=deal');
      await waitForPhase(page, 'playerTurn');

      const before = (await readout(page)).wallet.chips;
      await driver.press('surrender', 'data-action=surrender');
      await waitForPhase(page, 'roundResult');
      // SPEC 4.8 returns half the wager, which is the whole witness: a surrender
      // that did nothing would leave the balance where the deal left it.
      expect((await readout(page)).wallet.chips, 'half the wager came back').toBe(before + 50);

      driver.declared(ROUTE_ACTIONS.surrender);
    });

    test('takes SPEC 4.7s insurance offer', async ({ page }) => {
      const driver = route(page, method);
      await enterBetting(page, driver, { seed: peekSeed('none') });
      await driver.press('tapChip', 'data-chip=100');
      await driver.press('deal', 'data-control=deal');
      await waitForPhase(page, 'insurance');

      // The stake the offer names, and the balance before it is taken.
      //
      // **The balance is the witness, not `insuranceStake`.** SPEC 4.7 moves the
      // stake out of the balance when the offer is accepted and settles it at
      // the peek, and `PEEK_PAUSE` is `TIMINGS.holeCardFlip`, which is 0.3 s: a
      // poll on the middle term would be racing that window on every run, and
      // would pass or fail on how loaded the machine was. The balance moves once
      // and stays moved, because this seed's peek finds no natural and the stake
      // is lost, so the reading is the same whenever it is taken.
      const before = await readout(page);
      const stake = before.phase.kind === 'insurance' ? before.phase.offer.stake : 0;
      expect(stake, 'SPEC 4.7s offer names a stake').toBeGreaterThan(0);

      await driver.press('takeInsurance', 'data-control=take-insurance');
      await waitForPhase(page, 'playerTurn');
      expect(
        (await readout(page)).wallet.chips,
        'the insurance stake never left the balance',
      ).toBe(before.wallet.chips - stake);

      driver.declared(ROUTE_ACTIONS.insuranceTaken);
    });

    test('declines SPEC 4.7s insurance offer', async ({ page }) => {
      const driver = route(page, method);
      await enterBetting(page, driver, { seed: peekSeed('none') });
      await driver.press('tapChip', 'data-chip=100');
      await driver.press('deal', 'data-control=deal');
      await waitForPhase(page, 'insurance');

      // The control for the route above, and the same two readings: declining
      // has to leave the balance where the deal left it, and take no stake.
      const before = await readout(page);
      await driver.press('declineInsurance', 'data-control=decline-insurance');
      await waitForPhase(page, 'playerTurn');
      const after = await readout(page);
      expect(after.wallet.insuranceStake, 'a stake was taken anyway').toBe(0);
      expect(after.wallet.chips, 'the balance moved without a stake').toBe(before.wallet.chips);

      driver.declared(ROUTE_ACTIONS.insuranceDeclined);
    });

    test('drops to a lower table from SPEC 4.12s bust-out', async ({ page }) => {
      const driver = route(page, method);
      await toBustOut(page, driver);

      await driver.press('dropTable', 'data-drop-table=silver');
      await waitForPhase(page, 'betting');
      expect((await readout(page)).table, 'the drop moved the table').toBe('silver');

      driver.declared(ROUTE_ACTIONS.dropTable);
    });

    test('takes the free reset from SPEC 4.12s bust-out', async ({ page }) => {
      const driver = route(page, method);
      await toBustOut(page, driver);

      await driver.press('resetBankroll', 'data-control=reset-bankroll');
      await expect
        .poll(async () => (await readout(page)).wallet.chips, {
          message: 'the free reset restored the bankroll',
        })
        .toBe(STARTING_CHIPS);

      driver.declared(ROUTE_ACTIONS.resetBankroll);
    });

    test('opens and closes all three of SPEC 10s overlays', async ({ page }) => {
      const driver = route(page, method);
      await openShippedPage(page);
      await waitForPhase(page, 'start');
      const host = page.locator('[data-overlay-host="true"]');
      for (const id of ['settings', 'howToPlay', 'statistics']) {
        await driver.press('openOverlay', `data-open-overlay=${id}`);
        await expect(host).toBeVisible();
        await expect(host).toHaveAttribute('data-open', id);
        await driver.press('closeOverlay', 'data-control=close-overlay');
        await expect(host).toBeHidden();
      }

      driver.declared(ROUTE_ACTIONS.overlays);
    });

    test('sets the coach mode, the Speed and the play-surface size', async ({ page }) => {
      const driver = route(page, method);
      await openShippedPage(page);
      await waitForPhase(page, 'start');
      await driver.press('openOverlay', 'data-open-overlay=settings');
      await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();

      await driver.press('setCoachMode', 'data-coach-mode=review');
      await expect(page.locator('[data-coach-mode="review"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await driver.press('setSpeed', 'data-speed=fast');
      await expect(page.locator('[data-speed="fast"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(shell(page)).toHaveAttribute('data-motion-speed', 'fast');

      await driver.press('setSurfaceSize', 'data-surface-size=125');
      await expect(page.locator('[data-surface-size="125"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(shell(page)).toHaveAttribute('data-layout-size', '125');

      driver.declared(ROUTE_ACTIONS.settings);
    });

    test('opens the narrow bars readout disclosure', async ({ page }) => {
      // The one control in the chrome that is not a `<button>`. A `<summary>` is
      // operable by pointer, by touch and by a key on every engine, which is why
      // `BJ-16` used the element rather than building a toggle, and this is
      // where that inheritance is checked rather than assumed.
      const driver = route(page, method);
      await openShippedPage(page);
      await waitForPhase(page, 'start');
      await resizeTo(page, 390, 844);
      const disclosure = page.locator('.bj-readouts__more');
      await expect(page.locator('[data-control="more-readouts"]')).toBeVisible();
      const open = await disclosure.evaluate((node) => node.hasAttribute('open'));

      await driver.press('moreReadouts', 'data-control=more-readouts');
      await settle(page);
      expect(
        await disclosure.evaluate((node) => node.hasAttribute('open')),
        'the disclosure toggled',
      ).toBe(!open);

      driver.declared(ROUTE_ACTIONS.disclosure);
    });
  });
}

// ---------------------------------------------------------------------------
// The census: every control on every screen, reachable by all three
// ---------------------------------------------------------------------------

/**
 * What a screen has to be able to say about one of its controls.
 *
 * Three readings, one per input method, and each is what that method needs in
 * order to reach the control at all:
 *
 *   - **keyboard**: the control is in the tab order **and** one real `Tab` from
 *     the control before it lands on it. Taking focus is not the reading: a
 *     `tabindex="-1"` control takes focus from a script and is absent from the
 *     tab order, so a `focus()` and an `activeElement` comparison say yes to a
 *     control no keyboard can reach. The `BJ-17` review proved that by hand,
 *     putting `tabindex="-1"` on Double and watching the whole suite stay green.
 *     Reachability by keyboard is the reading that was false for a greyed
 *     control before this part as well: the native `disabled` property took
 *     Silver and Gold out of the tab order entirely, so a player on a keyboard
 *     could not reach either to find out why.
 *   - **pointer**: a press at the control's own centre lands on the control,
 *     which is `elementFromPoint` answering rather than arithmetic here.
 *   - **touch**: the same, plus a target a finger can hit. QUALITY-BAR section 3
 *     fixes 44 by 44 CSS pixels and item `D3` measures it at every breakpoint at
 *     `BJ-22`; what this asserts is the reachability half of it.
 */
interface Reachability {
  readonly key: string;
  readonly focusable: boolean;
  readonly hit: boolean;
  readonly width: number;
  readonly height: number;
  /** Whether the control is in the page's tab order at all. */
  readonly inTabOrder: boolean;
  /** Whether one real `Tab` from the control before it lands on this one. */
  readonly reachedByTab: boolean;
}

async function reachability(page: Page, keys: readonly string[]): Promise<readonly Reachability[]> {
  // One snapshot of the tab order for the whole screen, so every control below
  // is measured against the same page rather than against one re-read per
  // control, and so the `Tab` step and the membership test cannot disagree
  // because the page moved between them.
  const order = await controlsInDomOrder(page);
  const found: Reachability[] = [];
  for (const key of keys) {
    const locator = page.locator(selectorFor(key));
    await expect(locator, `${key} is on the page exactly once`).toHaveCount(1);
    await locator.scrollIntoViewIfNeeded();
    // The keyboard reading, in two forms. `focus()` alone is not one of them:
    // it succeeds on `tabindex="-1"`, which is focusable by script and absent
    // from the tab order, so a control taken out of the order that way passed
    // the whole of this census before the `BJ-17` review constructed it.
    const inTabOrder = order.includes(key);
    const reachedByTab = inTabOrder ? await focusByTab(page, key, order) : false;
    await locator.focus();
    found.push({
      ...(await locator.evaluate((node: HTMLElement, name: string) => {
        const box = node.getBoundingClientRect();
        const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          key: name,
          focusable: document.activeElement === node,
          hit: at !== null && node.contains(at),
          width: box.width,
          height: box.height,
        };
      }, key)),
      inTabOrder,
      reachedByTab,
    });
  }
  return found;
}

function assertReachable(found: readonly Reachability[], screen: string): void {
  expect(found.length, `${screen}: the census is not empty`).toBeGreaterThan(0);
  for (const entry of found) {
    expect(entry.focusable, `${screen}: ${entry.key} cannot take focus at all`).toBe(true);
    expect(entry.inTabOrder, `${screen}: ${entry.key} is not in the tab order`).toBe(true);
    expect(entry.reachedByTab, `${screen}: ${entry.key} is not reached by a real Tab`).toBe(true);
    expect(entry.hit, `${screen}: ${entry.key} is not pressable at its own centre`).toBe(true);
    // The target is exactly QUALITY-BAR section 3's, with no tolerance: the two
    // dimensions come from `min-width` and `min-height` in `chrome.css`, both
    // spent from `--target-min`, and a used value is the declared one unless
    // something scales it, which nothing here does. `tests/browser/breakpoints
    // .spec.ts` allows a pixel because it measures the same controls under
    // seven viewports; this census measures them at one, so it does not need to.
    expect(entry.width, `${screen}: ${entry.key} is too narrow to tap`).toBeGreaterThanOrEqual(
      TARGET_MIN,
    );
    expect(entry.height, `${screen}: ${entry.key} is too short to tap`).toBeGreaterThanOrEqual(
      TARGET_MIN,
    );
  }
}

test.describe('D2: every control on every screen, by all three methods', () => {
  test('start', async ({ page }) => {
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    assertReachable(await reachability(page, SCREEN_CONTROLS['start'] ?? []), 'start');
  });

  test('betting', async ({ page }) => {
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    assertReachable(await reachability(page, SCREEN_CONTROLS['betting'] ?? []), 'betting');
  });

  test('playerTurn, with all five actions live or greyed', async ({ page }) => {
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator('[data-chip="50"]').click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    // The screen the criterion's trap is about: `actions.ts` renders all five on
    // every hand and greys the ones the rules refuse, and a greyed control has
    // to stay reachable so a player can find out why.
    assertReachable(await reachability(page, SCREEN_CONTROLS['playerTurn'] ?? []), 'playerTurn');
  });

  test('insurance', async ({ page }) => {
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator('[data-chip="10"]').click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'insurance');
    assertReachable(await reachability(page, SCREEN_CONTROLS['insurance'] ?? []), 'insurance');
  });

  test('roundResult', async ({ page }) => {
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator('[data-chip="50"]').click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await page.locator('[data-action="stand"]').click();
    await waitForPhase(page, 'roundResult');
    assertReachable(await reachability(page, SCREEN_CONTROLS['roundResult'] ?? []), 'roundResult');
  });

  test('bustOut', async ({ page }) => {
    await toBustOut(page, route(page, 'pointer'));
    const keys = [...(SCREEN_CONTROLS['bustOut'] ?? []), 'data-drop-table=silver'];
    assertReachable(await reachability(page, keys), 'bustOut');
  });
});

// ---------------------------------------------------------------------------
// The two sentences, checked as sentences
// ---------------------------------------------------------------------------

/**
 * Every member of `ChromeActions`, and the action name it is driven under.
 *
 * A `Record` keyed on `keyof ChromeActions` rather than a list, so a sixth
 * member added to that interface is a **compile** error in this file: "every
 * action" cannot be checked against a list that has quietly stopped being the
 * whole list. `queue` is the one that is not an action of its own, because it
 * carries all eighteen intents, and it says so.
 */
const CHROME_ACTIONS: Readonly<Record<keyof ChromeActions, string>> = Object.freeze({
  queue: 'every intent',
  openOverlay: 'openOverlay',
  closeOverlay: 'closeOverlay',
  setCoachMode: 'setCoachMode',
  setSpeed: 'setSpeed',
  setSurfaceSize: 'setSurfaceSize',
});

test.describe('D2: the action list is the machines, not this files', () => {
  test('covers every intent SPEC 10 has and every action the chrome offers', () => {
    expect(INTENT_KINDS, 'SPEC 10 has eighteen intents').toHaveLength(18);

    const declared = new Set(Object.values(ROUTE_ACTIONS).flat());
    const wanted = new Set<string>([
      ...INTENT_KINDS,
      ...Object.values(CHROME_ACTIONS).filter((name) => name !== 'every intent'),
      // Not an action of the game: the one control that is not a button, and the
      // reason the file drives a `<summary>` at all.
      'moreReadouts',
    ]);

    const missing = [...wanted].filter((action) => !declared.has(action));
    expect(missing, 'no route drives these actions').toEqual([]);
    const stray = [...declared].filter((action) => !wanted.has(action));
    expect(stray, 'a route declares something that is not an action').toEqual([]);
  });

  test('renders no control the platform does not activate from all three', async ({ page }) => {
    // The criterion's second sentence as a property of the page, in both
    // directions. Every interactive element is a `<button>` or a `<summary>`,
    // which a mouse press, a touch tap and `Enter` or `Space` all activate, so
    // anything with a hand-rolled activation, a `role="button"` on a div or a
    // `tabindex="0"` on something the platform does not activate, is one place an
    // action reachable by a single method comes from. The other place is the
    // reverse shape, a real control the platform activates and the tab order
    // cannot reach, which is a `<button>` or a `<summary>` with a negative
    // `tabIndex`. The `BJ-17` review constructed exactly that, so the tag is no
    // longer a reason to stop reading.
    //
    // It sweeps every element in the shell rather than the current screen's, so
    // the five action controls are audited here as well: they are built once and
    // hidden outside the player's turn, and `tabIndex` does not depend on which
    // screen is showing.
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    const audit = await page.evaluate(() => {
      const strays: string[] = [];
      let buttons = 0;
      let summaries = 0;
      let submitters = 0;
      for (const node of document.querySelectorAll('.bj-shell *')) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        const tag = node.tagName.toLowerCase();
        const named =
          node.getAttribute('data-action') ??
          node.getAttribute('data-control') ??
          node.getAttribute('data-chip') ??
          tag;
        if (tag === 'button' || tag === 'summary') {
          if (tag === 'button') {
            buttons += 1;
            if ((node as HTMLButtonElement).type !== 'button') {
              submitters += 1;
            }
          } else {
            summaries += 1;
          }
          if (node.tabIndex < 0) {
            strays.push(`${tag}(${named}) is out of the tab order`);
          }
          continue;
        }
        // `tabindex="-1"` on something that is not a control is the focus anchor
        // and the dialog: focusable on purpose, in the tab order of neither, and
        // activated by nothing.
        if (node.getAttribute('role') === 'button' || node.tabIndex >= 0) {
          strays.push(`${tag}(${named}) has a hand-rolled activation`);
        }
      }
      return { strays, buttons, summaries, submitters };
    });

    expect(audit.strays, 'a control no keyboard or no pointer can reach').toEqual([]);
    expect(audit.buttons, 'the scan found the buttons').toBeGreaterThan(5);
    expect(audit.summaries, 'the scan found the disclosure').toBe(1);
    expect(audit.submitters, 'a button that would submit rather than press').toBe(0);
  });
});
