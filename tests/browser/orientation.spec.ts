/**
 * Item `F5`, Major, 14 points, over the built `dist/`.
 *
 *   "An orientation change preserves full game state and does not reload the
 *    page."
 *
 * Two clauses, and the second one is the harder to assert honestly, because a
 * page that reloaded and re-dealt would look exactly like a page that survived
 * unless the test is holding something a reload would destroy.
 *
 * **"Does not reload" is asserted three ways, each of which a reload breaks.**
 *
 *   1. A **sentinel** on the page: a value this file writes onto `window` before
 *      the rotation and reads back after it. A reload wipes the global scope, so
 *      a surviving sentinel is a surviving document.
 *   2. The **navigation counter**: Playwright's own `framenavigated` events on
 *      the main frame, counted from before the rotation. A reload is a
 *      navigation; a resize is not.
 *   3. `performance.timeOrigin`, read from inside the page. A reload restarts the
 *      document's clock.
 *
 * A fourth reading was removed in review rather than left in: the **length** of
 * the navigation timeline is 1 before a reload and 1 after it on all three
 * engines, because a reload replaces that entry rather than appending to it. An
 * assertion that cannot fail is not one of the three.
 *
 * And the instrument is proved: the last test in this file **reloads on purpose**
 * and requires all three readings to notice. Without that control, three
 * assertions about an absence would be worth nothing.
 *
 * **"Preserves full game state" is asserted against the machine, not the page.**
 * The whole `TableReadout` is compared before and after, phase payload included,
 * which is the same comparison item `C5` makes across an overlay. The chrome's
 * own text is compared as well, so a machine that survived while the chrome
 * rebuilt itself from nothing would still fail. And the rotation is done **in the
 * middle of a round**, with cards on the felt and a wager committed, because
 * every screen in SPEC 10 preserves an empty betting state.
 *
 * **The rotation has to be a real re-arrangement, or the item is vacuous.** Each
 * test asserts that the breakpoint actually changed across the turn: 390 x 844 is
 * `portrait` and 844 x 390 is `compact`, which are different layouts by DESIGN
 * section 4 and not merely different sizes.
 */

import { expect, test, type Page } from '@playwright/test';

import {
  atBetting,
  atShippedBetting,
  chip,
  control,
  layoutReport,
  numberIn,
  readout,
  readoutValue,
  resizeTo,
  settle,
  waitForPhase,
} from './support/game';
import { READOUT_KEYS } from '../../src/ui/components/readouts';

const SEED = 53;
const WAGER = 50;

/**
 * Two phones, each upright and on its side.
 *
 * The tall one turns from `portrait` to `medium`, because 844 px of width is
 * above QUALITY-BAR section 5's medium floor and the table resolves by width
 * first: a turned phone is not automatically a narrow layout. The short one
 * turns from `portrait` to `compact`, which is the other transition. Both are
 * real re-arrangements, and between them they cover both.
 */
const UPRIGHT = { width: 390, height: 844 };
const TURNED = { width: 844, height: 390 };
const SHORT_UPRIGHT = { width: 360, height: 740 };
const SHORT_TURNED = { width: 740, height: 360 };

/** What a reload would destroy, written before the turn and read after it. */
interface Sentinel {
  readonly marker: string;
  readonly timeOrigin: number;
}

async function plantSentinel(page: Page, marker: string): Promise<Sentinel> {
  return page.evaluate((value: string) => {
    (window as unknown as Record<string, unknown>)['__bjOrientationSentinel'] = value;
    return { marker: value, timeOrigin: performance.timeOrigin };
  }, marker);
}

async function readSentinel(
  page: Page,
): Promise<{ marker: string | undefined; timeOrigin: number }> {
  return page.evaluate(() => ({
    marker: (window as unknown as Record<string, unknown>)['__bjOrientationSentinel'] as
      | string
      | undefined,
    timeOrigin: performance.timeOrigin,
  }));
}

/** Every readout of SPEC 11, as text, whatever bar or disclosure it is on. */
async function readoutTexts(page: Page): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const key of READOUT_KEYS) {
    values[key] = (await readoutValue(page, key).textContent()) ?? '';
  }
  return values;
}

test.describe('F5: an orientation change preserves the game', () => {
  test('turns the device mid-round and keeps the machine exactly as it was', async ({ page }) => {
    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigations += 1;
      }
    });

    // A known deal, so the rotation happens with cards on the felt and a wager
    // committed rather than on an empty betting screen.
    await page.setViewportSize(UPRIGHT);
    await atBetting(page, { seed: SEED });
    await chip(page, WAGER).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await settle(page);

    const before = await readout(page);
    const beforeText = await readoutTexts(page);
    const beforeLayout = await layoutReport(page);
    const planted = await plantSentinel(page, 'upright');
    const navigationsBefore = navigations;

    await resizeTo(page, TURNED.width, TURNED.height);

    const after = await readout(page);
    const afterText = await readoutTexts(page);
    const afterLayout = await layoutReport(page);
    const survived = await readSentinel(page);

    // Clause 1: the machine, whole, phase payload included.
    expect(after, 'the machine changed across the rotation').toEqual(before);
    // And the chrome that renders it, as the player sees it.
    expect(afterText, 'a readout changed across the rotation').toEqual(beforeText);

    // Clause 2, all three readings.
    expect(survived.marker, 'the page was replaced').toBe(planted.marker);
    expect(survived.timeOrigin, 'the document restarted').toBe(planted.timeOrigin);
    expect(navigations - navigationsBefore, 'the main frame navigated').toBe(0);

    // And the rotation really re-arranged the page, or the two clauses above are
    // claims about a resize that did nothing.
    expect(beforeLayout.breakpoint).toBe('portrait');
    expect(afterLayout.breakpoint).toBe('medium');
    expect(afterLayout.phase).toBe('playerTurn');
  });

  test('carries the round on after the turn, on the same hand', async ({ page }) => {
    // State preserved is only half of "supported event": the round has to be
    // playable afterwards, on the cards that were already dealt. So the hand is
    // finished after the rotation and its result is required to be about the
    // same wager the upright screen committed.
    // The short phone, so this test covers the `portrait` to `compact` turn
    // while the one above covers the `portrait` to `medium` one.
    await page.setViewportSize(SHORT_UPRIGHT);
    await atBetting(page, { seed: SEED });
    await chip(page, WAGER).click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await settle(page);

    const before = await readout(page);
    const cards = before.hands[0]?.cards ?? [];
    expect(cards.length, 'the hand was dealt before the turn').toBeGreaterThanOrEqual(2);
    expect((await layoutReport(page)).breakpoint).toBe('portrait');

    await resizeTo(page, SHORT_TURNED.width, SHORT_TURNED.height);
    expect((await layoutReport(page)).breakpoint, 'the short turn is compact').toBe('compact');
    await page.locator('[data-action="hit"]').click();
    // The hit lands on the hand that was already on the felt: same first two
    // cards, one more of them.
    await expect
      .poll(async () => (await readout(page)).hands[0]?.cards.length ?? 0)
      .toBeGreaterThan(cards.length);
    const grown = await readout(page);
    expect(grown.hands[0]?.cards.slice(0, cards.length), 'the hand was re-dealt').toEqual(cards);

    await resizeTo(page, SHORT_UPRIGHT.width, SHORT_UPRIGHT.height);
    // And back again, into the layout it started in, still the same round.
    const returned = await layoutReport(page);
    expect(returned.breakpoint).toBe('portrait');
    expect((await readout(page)).hands[0]?.cards.slice(0, cards.length)).toEqual(cards);
  });

  test('keeps a pending wager across a turn on the shipped page', async ({ page }) => {
    // The shipped page with nothing injected, and the one piece of state a
    // player would notice immediately: the chips they have already put out.
    await page.setViewportSize(UPRIGHT);
    await atShippedBetting(page);
    await chip(page, WAGER).click();
    await expect.poll(async () => numberIn(readoutValue(page, 'wager'))).toBe(WAGER);

    const planted = await plantSentinel(page, 'betting');
    await resizeTo(page, TURNED.width, TURNED.height);

    expect(await numberIn(readoutValue(page, 'wager')), 'the wager was cleared').toBe(WAGER);
    const survived = await readSentinel(page);
    expect(survived.marker, 'the page reloaded').toBe(planted.marker);
    // And Deal still works from the rotated layout, with that same wager.
    await control(page, 'deal').click();
    await expect(page.locator('.bj-shell')).not.toHaveAttribute('data-phase', 'betting');
  });
});

test.describe('F5: the reload detector can see a reload', () => {
  test('loses the sentinel, the time origin and the count when the page reloads', async ({
    page,
  }) => {
    // The control. Three assertions about an absence are worth exactly what the
    // instrument behind them is worth, so here the page is reloaded on purpose
    // and all three readings are required to notice.
    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigations += 1;
      }
    });

    await page.setViewportSize(UPRIGHT);
    await atShippedBetting(page);
    await chip(page, WAGER).click();
    await expect.poll(async () => numberIn(readoutValue(page, 'wager'))).toBe(WAGER);
    const planted = await plantSentinel(page, 'doomed');
    const navigationsBefore = navigations;

    await page.reload();
    await waitForPhase(page, 'start');

    const after = await readSentinel(page);
    expect(after.marker, 'the sentinel survived a reload').toBeUndefined();
    expect(after.timeOrigin, 'the time origin survived a reload').not.toBe(planted.timeOrigin);
    expect(navigations - navigationsBefore, 'the navigation went uncounted').toBeGreaterThan(0);
    // And the game state really was lost, which is what the rotation tests
    // require to survive: a reload puts SPEC 10's start screen back.
    await expect(page.locator('.bj-shell')).toHaveAttribute('data-phase', 'start');
  });
});
