/**
 * Two tabs of the game on one origin, over the built `dist/`.
 *
 * SPEC 13 says "lifetime statistics accumulate" and SPEC 6 keys every table
 * unlock to the best chip balance ever reached. Both sentences are about a
 * quantity that only ever goes up, and both were violated by a second tab: the
 * document was read once per page at boot and every later write replaced the
 * whole key with whatever that page happened to hold, so a tab that had been
 * left open in the background overwrote everything the played tab had achieved
 * the moment anybody pressed a settings button in it. One press, and the mark,
 * the lifetime tallies and the hand history all went back to what they were
 * when the idle tab booted. Nothing detected it and nothing warned.
 *
 * **The property these tests exist for.** No save, from any tab, in any order,
 * may decrease the stored best balance, decrease any stored lifetime counter,
 * drop an awarded milestone, or shorten the stored history. The cure is a
 * read-merge-write on the save path plus a `storage` listener that folds the
 * same monotone fields into the live session, and both halves are graded below.
 *
 * **Two pages in ONE browser context**, which is what two tabs of one origin
 * are: `newPage()` on the running context shares the `localStorage` the other
 * page writes. Nothing is written to storage by these tests: every write below
 * is the game's own, at its own round boundary or its own settings action.
 *
 * **Where the counters stop being exact, stated rather than hidden.** The
 * merge takes the per-counter maximum, so two tabs that genuinely played
 * different rounds give a stored count that is a lower bound on the pair
 * rather than their sum: the document carries no per-round identity, and
 * adding one would be a schema change item `I1` rules out. What is asserted
 * below is the property the cure exists for, monotonicity, and the second test
 * says so at the assertion.
 */

import { expect, test, type Page } from '@playwright/test';

import { STORAGE_KEY } from '../../src/storage/document';

import {
  atBetting,
  atShippedBetting,
  bootGame,
  chip,
  chooseInSettings,
  control,
  numberIn,
  pressOn,
  readoutValue,
  session,
  settle,
  shell,
  waitForPhase,
} from './support/game';
import { FLOW_WAGER, tenUpRound } from './support/flow-seeds';

/** The unlock mark the harness brings: SPEC 6's Gold key, and above Silver's. */
const BEST_BALANCE = 10_000;

/** How long a fold across two pages may take to arrive. */
const FOLD_TIMEOUT = 10_000;

/** The persisted document, exactly as the store holds it, read from a page. */
interface StoredShape {
  readonly bestBalance: number;
  readonly statistics: { readonly lifetime: { readonly handsPlayed: number } };
  readonly history: readonly unknown[];
  readonly settings: { readonly speed: string };
}

/**
 * What the store holds, parsed out of the envelope.
 *
 * `null` when nothing is stored at all, which is a first launch and is a
 * different answer from a document with zeros in it.
 */
async function storedDocument(page: Page): Promise<StoredShape | null> {
  const raw = await page.evaluate((key: string) => window.localStorage.getItem(key), STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  const envelope = JSON.parse(raw) as { data: StoredShape };
  return envelope.data;
}

/** The same, failing loudly rather than returning `null`, where a document is due. */
async function requireStored(page: Page, why: string): Promise<StoredShape> {
  const stored = await storedDocument(page);
  expect(stored, why).not.toBeNull();
  if (stored === null) {
    throw new Error(why);
  }
  return stored;
}

/**
 * Play one round on a harness-booted page and come back to the betting screen.
 *
 * `tenUpRound()` is the banked seed whose up card is a ten-value one, so the
 * peek runs with no insurance offer to answer and the round reaches the player
 * with one decision to make. Standing settles it, which counts one hand into
 * SPEC 11's lifetime scope and writes the document at SPEC 13's round boundary.
 */
async function playOneRound(page: Page): Promise<void> {
  await chip(page, FLOW_WAGER).click();
  await control(page, 'deal').click();
  await waitForPhase(page, 'playerTurn');
  await pressOn(page, '[data-action="stand"]', 'playerTurn');
  await waitForPhase(page, 'roundResult');
  await control(page, 'next-hand').click();
  await waitForPhase(page, 'betting');
}

test.describe('J3-01: a second tab cannot roll back what the first tab earned', () => {
  test('one settings press in an idle tab leaves the mark, the tallies and the history', async ({
    page,
  }) => {
    test.slow();
    // The idle tab boots FIRST and is then left alone, which is the whole
    // shape: what it holds in memory is the document as it stood before the
    // other tab played, and under the defect that is what its next write sent.
    // It is the shipped page with nothing injected, because the press that
    // destroyed the document is a press a player makes.
    const idle = await page.context().newPage();
    await atShippedBetting(idle);
    const before = await requireStored(idle, 'the idle tab wrote a document at its own boot');
    expect(before.bestBalance, 'the idle tab booted on the starting mark').toBe(1000);

    // The played tab. The harness brings Gold's unlock mark, which a shipped
    // page cannot reach in one round; the round, the counters and the save are
    // the real ones. The seat stays the table SPEC 6 never locks, so the round
    // below places the same Bronze-legal wager every other test here does and
    // the mark is the only thing the harness had to bring.
    await atBetting(page, { seed: tenUpRound().seed, bestBalance: BEST_BALANCE });
    await playOneRound(page);

    const played = await requireStored(page, 'the round boundary wrote the document');
    expect(played.bestBalance).toBe(BEST_BALANCE);
    expect(played.statistics.lifetime.handsPlayed).toBe(1);
    expect(played.history).toHaveLength(1);

    // One press, in the tab that played nothing. Under the defect this is the
    // write that destroyed everything above.
    await chooseInSettings(idle, '[data-speed="fast"]');

    const after = await requireStored(idle, 'the settings press wrote the document');
    expect(after.bestBalance, 'the high-water mark was rolled back').toBe(BEST_BALANCE);
    expect(after.statistics.lifetime.handsPlayed, 'a lifetime tally was rolled back').toBe(1);
    expect(after.history, 'the hand history was truncated').toHaveLength(1);
    // And the press itself landed: a merge that simply kept the stored document
    // would satisfy every line above while throwing the player's setting away.
    // Settings are last-writer-wins on purpose, and this is that half.
    expect(after.settings.speed, 'the settings press was discarded').toBe('fast');

    // The player-visible end of the same claim, on the idle tab's own reload:
    // SPEC 6 keys the unlocks to the mark, so a rolled-back mark re-locks a
    // table that was earned.
    await idle.reload();
    await expect(shell(idle)).toBeVisible();
    await settle(idle);
    await expect
      .poll(async () => numberIn(readoutValue(idle, 'best-balance')), { timeout: FOLD_TIMEOUT })
      .toBe(BEST_BALANCE);
    for (const id of ['bronze', 'silver', 'gold']) {
      await expect(
        idle.locator(`[data-table="${id}"]`),
        `${id} was re-locked by the other tab's write`,
      ).not.toHaveAttribute('aria-disabled', /.*/);
    }
    await idle.close();
  });

  test('the stored lifetime count never decreases while both tabs play', async ({ page }) => {
    test.slow();
    // The both-tabs-playing shape. Under the defect the stored count went
    // 2 -> 1 -> 3 as the two tabs took turns overwriting each other; what is
    // required here is only that it never goes down, because the merge takes
    // the per-counter maximum and cannot reconstruct a union the document
    // carries no identity for.
    const second = await page.context().newPage();
    await atBetting(page, { seed: tenUpRound().seed });
    await atBetting(second, { seed: tenUpRound().seed });

    const counts: number[] = [];
    const record = async (from: Page, why: string): Promise<void> => {
      counts.push((await requireStored(from, why)).statistics.lifetime.handsPlayed);
    };

    await playOneRound(page);
    await record(page, 'the first tab wrote its round');
    await playOneRound(page);
    await record(page, 'the first tab wrote its second round');
    await playOneRound(second);
    await record(second, 'the second tab wrote its round');
    await playOneRound(page);
    await record(page, 'the first tab wrote its third round');

    for (let index = 1; index < counts.length; index += 1) {
      expect(
        counts[index] ?? -1,
        `the stored lifetime count fell at step ${String(index)}: ${counts.join(' -> ')}`,
      ).toBeGreaterThanOrEqual(counts[index - 1] ?? -1);
    }
    // Non-vacuity: the counters really did move, or a store nobody wrote would
    // satisfy a monotonicity check with four zeros.
    expect(counts.at(-1) ?? 0, 'nothing was counted at all').toBeGreaterThan(1);
    await second.close();
  });
});

test.describe('J3-01: the idle tab stops understating what it holds', () => {
  test('folds the other tab\'s lifetime progress into its own session', async ({ page }) => {
    test.slow();
    // The second half of the cure. A tab that never re-read the key kept
    // showing the counters it booted with, so the player watched two tabs
    // disagree and the stale one carried its own answer into every later save.
    // The `storage` event fires in every tab but the writer, and this is what
    // the listener does with it.
    const idle = await page.context().newPage();
    await bootGame(idle, { seed: tenUpRound().seed });
    await waitForPhase(idle, 'start');
    expect((await session(idle)).statistics.lifetime.handsPlayed).toBe(0);

    await atBetting(page, { seed: tenUpRound().seed });
    await playOneRound(page);

    await expect
      .poll(async () => (await session(idle)).statistics.lifetime.handsPlayed, {
        message: 'the idle tab never learned what the other tab wrote',
        timeout: FOLD_TIMEOUT,
      })
      .toBe(1);
    // The history came with it, which is the field a stale tab would otherwise
    // shorten on its next write.
    expect((await session(idle)).history).toHaveLength(1);
    // And the fold left the idle tab's own settings alone: adopting another
    // tab's presentation choices mid-round would take controls out of a
    // player's hands, which is worse than the staleness it would cure.
    expect((await session(idle)).speed).toBe('normal');
    await idle.close();
  });
});
