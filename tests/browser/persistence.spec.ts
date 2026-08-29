/**
 * Item `I4`, Major, over the built `dist/`.
 *
 *   "The chip balance is not persisted and a fresh launch starts at 1000,
 *    while best balance, statistics, milestones and unlocks are persisted."
 *
 * Two clauses, and the negative one is half the item. Both are graded here on
 * the one instrument that can see them: a real `page.reload()` inside one
 * browser context, so the `localStorage` the first page wrote is the one the
 * second page loads, with nothing staged and nothing injected. That is the
 * SPEC-13 trace the part plan names this file for, and it is also where the
 * reload clauses earlier parts parked on purpose close: `E9`'s Speed, `F6`'s
 * surface size and `K3`'s mute each get a change-then-reload-then-hold
 * assertion, on the shipped page, through the controls a player uses.
 *
 * The persisted-set half needs a set worth persisting, and a shipped Bronze
 * page cannot build one in one round: the unlocks key to a best balance of
 * 2,500 and 10,000, and SPEC 13 starts every launch at 1,000. The harness
 * boots the same shipped page with a wallet that already carries the
 * 10,000 mark, the round that follows is played and saved through the real
 * boundary, and the reload is still the page's own. Nothing is written to
 * storage except by the game.
 *
 * The round played everywhere below is a surrender, because it is the one
 * outcome a spec can reach deterministically: the wager is known, the return
 * is half of it, and the balance afterwards is a number this file can name
 * rather than one the dealer drew.
 */

import { expect, test, type Page } from '@playwright/test';

import { splitSeed } from './support/action-seeds';
import {
  atBetting,
  atShippedBetting,
  bootGame,
  chip,
  control,
  numberIn,
  readoutValue,
  settle,
  shell,
  waitForPhase,
} from './support/game';
import { pressOn } from './support/game';

/** The wager every Bronze round here places: legal, and half of it comes back. */
const WAGER = 50;

/**
 * The wager the Gold round places. SPEC 6's Gold minimum is 100, so a 50 wager
 * is refused below-minimum and the round never starts; 100 is on the grid and
 * inside the balance, and half of it comes back like any surrender.
 */
const GOLD_WAGER = 100;

/** What a surrendered `WAGER` costs: half of it, per SPEC 4.8. */
const SURRENDER_COST = WAGER / 2;

/**
 * How many rounds the surrender search may play before giving up.
 *
 * **The shipped page seeds from the wall clock, so the round is not chosen.**
 * A player natural settles the round before any decision is offered, and this
 * file's own second test already says so: "The shipped boot seeds from the wall
 * clock, so a natural can legitimately skip straight to the result." The first
 * test did not carry the same guard and duly failed one full-suite run in
 * `BJ-22` on WebKit, reading 1075 where it wanted 975: a natural, paid 3 to 2.
 * A natural is about one deal in twenty, so six rounds leaves a failure rate
 * near one in sixty million, and the round that is graded is still a round the
 * shipped page dealt itself.
 */
const SURRENDER_ATTEMPTS = 6;

/** The unlock mark the harness brings, which is Gold's and Silver's key. */
const BEST_BALANCE = 10_000;

/** How a poll waits between screens. */
const DRIVE_PAUSE = 100;

/**
 * The poll budget under a loaded machine. The full suite runs four workers
 * over three engines, and a 5-second default is a fourth of what a paced
 * round needs on a machine that busy; the assertion is about persistence,
 * not about the scheduler, so it gets the same budget `waitForPhase` gives.
 */
const POLL_TIMEOUT = 20_000;

/**
 * Play the round out from wherever it stands, surrendering the first hand the
 * player is offered, and stop at SPEC 10's round result.
 *
 * A poll rather than a chain of waits, because which screens the round passes
 * through is not known in advance: the peek runs against a ten-value up card,
 * and either can settle the round before the player acts. The surrender is the
 * one press this file needs to land, and `pressOn` already answers for a
 * screen that has gone.
 */
async function surrenderToResult(page: Page): Promise<void> {
  for (let step = 0; step < 400; step += 1) {
    const phase = (await shell(page).getAttribute('data-phase')) ?? '';
    if (phase === 'roundResult') {
      await waitForPhase(page, 'roundResult');
      return;
    }
    if (phase === 'insurance') {
      await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
      await page.waitForTimeout(DRIVE_PAUSE);
      continue;
    }
    if (phase === 'playerTurn') {
      await pressOn(page, '[data-action="surrender"]', 'playerTurn');
      await page.waitForTimeout(DRIVE_PAUSE);
      continue;
    }
    await page.waitForTimeout(DRIVE_PAUSE);
  }
  throw new Error('the round never reached its result');
}

/** One readout of SPEC 11, as a number. */
async function readoutNumber(page: Page, key: string): Promise<number> {
  return numberIn(readoutValue(page, key));
}

/** Open the Statistics and history overlay, the player's route to the set. */
async function openStatistics(page: Page): Promise<void> {
  await page.locator('[data-open-overlay="statistics"]').click();
  await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
}

test.describe('I4: the chip balance is not persisted', () => {
  test('a fresh launch starts at 1000 with no wager and no hands, after a played round', async ({
    page,
  }) => {
    // The search below plays whole rounds on the shipped page, and a paced round
    // is seconds: six of them do not fit the default budget, and the budget is
    // what would fail rather than the assertion.
    test.slow();
    await atShippedBetting(page);

    // Play until one round is actually surrendered. A natural pays and ends the
    // round with no decision offered, which is the deal's business and not this
    // test's; every attempt is a real round on the shipped page.
    let surrendered = false;
    let before = 0;
    let after = 0;
    for (let attempt = 0; attempt < SURRENDER_ATTEMPTS && !surrendered; attempt += 1) {
      before = await readoutNumber(page, 'chips');
      await chip(page, WAGER).click();
      await control(page, 'deal').click();
      await surrenderToResult(page);
      // **The balance readout counts up, so it has to be read still.** A single
      // read at the round result catches the number part way there: instrumented
      // over six rounds it returned 969, 973, 948, 900, 869 and 845 for
      // balances that settle on multiples of five, and each neighbouring pair
      // differs by three or four, which is a tween being sampled rather than a
      // balance. The original form of this test polled for one exact number,
      // which waited the tween out; this waits for the number to stop moving,
      // because which number it stops on is what the loop is deciding.
      after = before;
      let stable = 0;
      for (let tick = 0; tick < 40 && stable < 3; tick += 1) {
        await settle(page);
        const now = await readoutNumber(page, 'chips');
        stable = now === after ? stable + 1 : 0;
        after = now;
        if (stable < 3) {
          await page.waitForTimeout(DRIVE_PAUSE);
        }
      }
      surrendered = after === before - SURRENDER_COST;
      if (!surrendered) {
        await control(page, 'next-hand').click();
        await waitForPhase(page, 'betting');
      }
    }

    // The balance moved: the round really was played and really did cost half
    // a wager, which is what makes the number after the reload an assertion
    // about persistence rather than about a page that never changed.
    expect(surrendered, 'no round in six was offered a surrender').toBe(true);
    expect(after, 'the surrendered round did not cost half a wager').toBe(before - SURRENDER_COST);

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);

    await expect
      .poll(async () => readoutNumber(page, 'chips'), {
        message: 'the balance is back at the launch figure',
        timeout: POLL_TIMEOUT,
      })
      .toBe(1000);
    await expect(shell(page)).toHaveAttribute('data-phase', 'start');
    await expect.poll(async () => readoutNumber(page, 'wager')).toBe(0);
    // The mirror's sentence for an empty table, which is the whole hand state
    // a fresh launch has: nothing about the round in progress came with it.
    await expect(page.locator('[data-mirror="no-hands"]')).toBeVisible();
  });

  test('a round in progress is not persisted either', async ({ page }) => {
    // This round must expose a player decision. The shipped boot seeds from the
    // wall clock, so a natural can legitimately skip straight to the result;
    // use the real harness boot with the existing known split seed instead.
    await atBetting(page, { seed: splitSeed() });
    await chip(page, WAGER).click();
    await control(page, 'deal').click();
    // Mid-deal is the strongest reading: the round exists, cards are on the
    // felt, and the boundary that would save anything has not been reached.
    await waitForPhase(page, 'playerTurn');

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);

    await expect(shell(page)).toHaveAttribute('data-phase', 'start');
    await expect.poll(async () => readoutNumber(page, 'chips')).toBe(1000);
    await expect.poll(async () => readoutNumber(page, 'wager')).toBe(0);
  });
});

test.describe('I4: the persisted set survives a real reload', () => {
  test('carries best balance, statistics, milestones, unlocks and the table', async ({ page }) => {
    // The harness route, for the one thing a shipped Bronze page cannot reach:
    // a wallet already carrying Gold's unlock mark. The round and the save are
    // still the real ones, and the reload below is the shipped page's own.
    await bootGame(page, { seed: splitSeed(), bestBalance: BEST_BALANCE, table: 'gold' });
    await waitForPhase(page, 'start');
    // SPEC 6 seats the boot at the unlocked Gold table; the start screen
    // carries the pressed state, which is what the reload has to bring back.
    await expect(page.locator('[data-table="gold"]')).toHaveAttribute('aria-pressed', 'true');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await chip(page, GOLD_WAGER).click();
    await control(page, 'deal').click();
    await surrenderToResult(page);
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'betting');

    // Session scope counted the round, on the page that played it.
    await expect.poll(async () => readoutNumber(page, 'hands-played')).toBe(1);

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);

    // The session scope reset, which is SPEC 13's other sentence: "Session
    // statistics reset on launch; lifetime statistics accumulate."
    await expect.poll(async () => readoutNumber(page, 'hands-played')).toBe(0);
    // The high-water mark, which SPEC 6 keys every unlock to.
    await expect.poll(async () => readoutNumber(page, 'best-balance')).toBe(BEST_BALANCE);

    // The table, pressed and enterable: persisted, and affordable at 1,000.
    // Enterable is the ABSENCE of the grey-out, which is how an available
    // control is spelled: `setDisabled` takes the attribute off rather than
    // writing 'false', so a locked table is the one that carries it.
    await expect(page.locator('[data-table="gold"]')).toHaveAttribute('aria-pressed', 'true');
    for (const id of ['bronze', 'silver', 'gold']) {
      await expect(page.locator(`[data-table="${id}"]`)).not.toHaveAttribute(
        'aria-disabled',
        /.*/,
      );
    }

    await openStatistics(page);
    await expect(page.locator('[data-stat="lifetime-hands"]')).toHaveText('1');
    // The milestones the mark awarded: doubling the bankroll is the mark at
    // 10,000 crossing 2,000, and Silver and Gold are the two table rows.
    for (const id of ['doubledBankroll', 'reachedSilver', 'reachedGold']) {
      await expect(page.locator(`[data-milestone="${id}"]`)).toHaveAttribute('data-awarded', 'true');
    }
    // And the one this round cannot have awarded: no natural happened, so the
    // first-natural row is still unawarded, which is the persistence of the
    // list's zeros as well as its ones.
    await expect(page.locator('[data-milestone="firstNatural"]')).toHaveAttribute(
      'data-awarded',
      'false',
    );
  });
});

test.describe('I4: the reload clauses earlier parts parked here', () => {
  test('Speed holds across a reload, set through the Settings control', async ({ page }) => {
    await atShippedBetting(page);
    await page.locator('[data-open-overlay="settings"]').click();
    await page.locator('[data-speed="fast"]').click();
    await expect(page.locator('[data-speed="fast"]')).toHaveAttribute('aria-pressed', 'true');
    await control(page, 'close-overlay').click();
    await expect(shell(page)).toHaveAttribute('data-motion-speed', 'fast');

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);
    await expect(shell(page), 'the reloaded page is still at Fast').toHaveAttribute(
      'data-motion-speed',
      'fast',
    );
    // The panel's pressed state is written when it is open, so the reload is
    // answered through the control a player reads: open Settings and find the
    // Fast button still pressed, which is the persisted choice made visible.
    await page.locator('[data-open-overlay="settings"]').click();
    await expect(page.locator('[data-speed="fast"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the play-surface size holds across a reload', async ({ page }) => {
    await atShippedBetting(page);
    await page.locator('[data-open-overlay="settings"]').click();
    await page.locator('[data-surface-size="125"]').click();
    await expect(page.locator('[data-surface-size="125"]')).toHaveAttribute('aria-pressed', 'true');
    await control(page, 'close-overlay').click();
    await expect(shell(page)).toHaveAttribute('data-layout-size', '125');

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);
    await expect(shell(page), 'the reloaded page is still at 125 percent').toHaveAttribute(
      'data-layout-size',
      '125',
    );
  });

  test('the mute holds across a reload, with its label', async ({ page }) => {
    await atShippedBetting(page);
    await control(page, 'mute').click();
    await expect(control(page, 'mute')).toHaveAttribute('aria-pressed', 'true');
    await expect(control(page, 'mute')).toHaveText('Unmute');

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);
    await expect(control(page, 'mute'), 'the reloaded page boots muted').toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(control(page, 'mute')).toHaveText('Unmute');
  });

  test('the theme holds across a reload, in both directions', async ({ page }) => {
    await atShippedBetting(page);
    await page.locator('[data-open-overlay="settings"]').click();
    await page.locator('[data-theme="dark"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await control(page, 'close-overlay').click();

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);
    await expect(page.locator('html'), 'an explicit dark choice survived').toHaveAttribute(
      'data-theme',
      'dark',
    );

    // And the other direction, because an override that only holds one way
    // would be a setting that cannot be taken back.
    await page.locator('[data-open-overlay="settings"]').click();
    await page.locator('[data-theme="light"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await control(page, 'close-overlay').click();
    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);
    await expect(page.locator('html'), 'an explicit light choice survived').toHaveAttribute(
      'data-theme',
      'light',
    );
  });

  test('the volume holds across a reload', async ({ page }) => {
    await atShippedBetting(page);
    await page.locator('[data-open-overlay="settings"]').click();
    const slider = page.locator('[data-control="volume"]');
    await slider.scrollIntoViewIfNeeded();
    await slider.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-panel="settings"]')).toContainText('99% of full.');
    await control(page, 'close-overlay').click();

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);
    await page.locator('[data-open-overlay="settings"]').click();
    const restored = page.locator('[data-control="volume"]');
    await expect(restored).toHaveValue('0.99');
    await expect(page.locator('[data-panel="settings"]')).toContainText('99% of full.');
  });

  test('the reduced-motion setting holds across a reload', async ({ page }) => {
    await atShippedBetting(page);
    await page.locator('[data-open-overlay="settings"]').click();
    await page.locator('[data-motion-setting="always"]').click();
    await expect(shell(page)).toHaveAttribute('data-motion', 'reduce');
    await control(page, 'close-overlay').click();

    await page.reload();
    await expect(shell(page)).toBeVisible();
    await settle(page);
    await expect(shell(page), 'the reloaded page is still reducing').toHaveAttribute(
      'data-motion',
      'reduce',
    );
  });
});

test.describe('I5: the volume slider writes once per gesture', () => {
  test('a drag moves the gain uncommitted and the document exactly once, at the end', async ({
    page,
  }) => {
    // The `BJ-20` review measured the one-event shape at forty synchronous
    // localStorage writes for one drag of the track, each serialising the
    // whole document on the main thread. The cure splits the slider's two
    // events: `input` moves the engine's gain live and uncommitted, and
    // `change`, the gesture's end, commits the one write. The instrument is
    // the review's own: the storage prototype counts its callers on the
    // shipped page, installed after boot so the load's own reads are not in
    // the tally.
    await page.goto('/');
    await waitForPhase(page, 'start');
    await page.locator('[data-open-overlay="settings"]').click();
    const slider = page.locator('[data-control="volume"]');
    await expect(slider).toBeVisible();

    await page.evaluate(() => {
      const counted = { writes: 0 };
      (window as unknown as { __bjWrites: { writes: number } }).__bjWrites = counted;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function counting(key: string, value: string): void {
        counted.writes += 1;
        original.call(this, key, value);
      };
    });
    const writes = (): Promise<number> =>
      page.evaluate(
        () => (window as unknown as { __bjWrites: { writes: number } }).__bjWrites.writes,
      );

    // The panel is taller than the viewport, so the slider is scrolled to
    // before the box is read: coordinates taken from a scrolled-out control
    // land the drag on whatever sits over it instead.
    await slider.scrollIntoViewIfNeeded();
    const box = await slider.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) {
      return;
    }
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.9, y);
    await page.mouse.down();
    for (const stop of [0.75, 0.6, 0.45, 0.3]) {
      await page.mouse.move(box.x + box.width * stop, y, { steps: 4 });
    }
    expect(await writes(), 'the drag itself wrote nothing').toBe(0);
    // And the gain is already moving while the finger is down: the panel's
    // note is synced from the engine's own volume every frame, so a note off
    // "100%" mid-drag is the input arm working live and uncommitted. This is
    // the assertion that isolates the input arm: every discrete press fires
    // both events, and only a held drag has fired one.
    await expect(page.locator('[data-panel="settings"]')).not.toContainText(
      'Volume 100% of full.',
    );

    await page.mouse.up();
    await expect.poll(writes, { timeout: 5_000 }).toBe(1);
    // And the drag was real: the slider left full volume, so the uncommitted
    // arm genuinely moved the value the commit then wrote.
    const value = Number.parseFloat(await slider.inputValue());
    expect(value).toBeLessThan(1);
  });
});
