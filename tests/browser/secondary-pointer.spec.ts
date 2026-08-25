/**
 * Item `D5`, Minor, 9 points, over the built `dist/`.
 *
 *   "Any secondary pointer binding duplicates a control that already exists in
 *    the interface, and contextmenu is suppressed only where such a binding is
 *    present."
 *
 * **This game has no secondary pointer binding, so both clauses are satisfied by
 * an absence, and an absence is exactly the kind of claim a spec can pass
 * without checking.** So the file asserts the absence in both directions:
 *
 * | Clause | Where |
 * |---|---|
 * | No secondary binding exists | `changes nothing anywhere on the page` |
 * | ... including the middle button | `ignores the middle button too` |
 * | `contextmenu` is not suppressed | `leaves the context menu to the browser` |
 * | ... on the play surface either | the canvas target in both tests above |
 * | The check can fail | the `D5` entry in `scripts/mutation-check.mjs` |
 *
 * The first clause is conditional, and a conditional with a false antecedent is
 * true for free. What makes it evidence rather than a formality is that the
 * antecedent is **proved** false rather than assumed: a real secondary press on
 * every kind of target leaves the machine's whole readout identical, so there is
 * no binding for the clause to be about. `tests/unit/input-surface.test.ts`
 * scans the source for the other half, that nothing reads `event.button` and
 * nothing listens for `contextmenu` or `auxclick`.
 *
 * The second clause is where the vacuity would hide. A suppression planted
 * anywhere in the source has to turn this file red, and the ledger entry does
 * exactly that: it adds one `preventDefault` on `contextmenu` and requires the
 * spec to catch it. Without that entry, "we suppress it nowhere" would be a
 * sentence no test could disagree with.
 */

import { expect, test, type Page } from '@playwright/test';

import { splitSeed } from './support/action-seeds';
import { bootGame, control, readout, settle, shell, waitForPhase } from './support/game';

/** What the page recorded about the events a secondary press produced. */
interface PressLog {
  readonly contextmenu: readonly boolean[];
  readonly auxclick: readonly boolean[];
  readonly clicks: number;
}

/**
 * Watch what a secondary press does, from inside the page.
 *
 * The listeners are added at the document, in the bubble phase, so they see what
 * the page did with the event before it got there: `defaultPrevented` is `true`
 * only if something in the chrome called `preventDefault`, which is the
 * suppression the criterion is about. `clicks` counts primary activations, so a
 * right press that somehow produced one would show up as well.
 */
async function watchPresses(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log = { contextmenu: [] as boolean[], auxclick: [] as boolean[], clicks: 0 };
    document.addEventListener('contextmenu', (event) => {
      log.contextmenu.push(event.defaultPrevented);
    });
    document.addEventListener('auxclick', (event) => {
      log.auxclick.push(event.defaultPrevented);
    });
    document.addEventListener('click', () => {
      log.clicks += 1;
    });
    window.__bjPresses = log;
  });
}

async function pressLog(page: Page): Promise<PressLog> {
  return page.evaluate(
    () => window.__bjPresses ?? { contextmenu: [], auxclick: [], clicks: 0 },
  );
}

/** Press one target with a non-primary button, at its own centre. */
async function pressWith(page: Page, selector: string, button: 'right' | 'middle'): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} has a rendered box`).not.toBeNull();
  if (box === null) {
    throw new Error(`${selector} has no box`);
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button });
  await settle(page);
}

/**
 * The four kinds of target a secondary press can land on.
 *
 * The play surface is in the list because the criterion's sibling `D6` is about
 * the play surface specifically and because a canvas is where a game usually
 * grows its right-click menu. The shell itself stands for the page background.
 */
const TARGETS = ['.bj-shell', '.bj-surface', '[data-chip="50"]', '[data-control="deal"]'];

/** Reach the betting screen with a known deal, so the readout can be compared. */
async function atBetting(page: Page): Promise<void> {
  await bootGame(page, { seed: splitSeed() });
  await waitForPhase(page, 'start');
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
  await settle(page);
}

test.describe('D5: the secondary button is bound to nothing', () => {
  test('changes nothing anywhere on the page', async ({ page }) => {
    await atBetting(page);

    // A wager on the board, so "unchanged" is a state with something in it: a
    // comparison of two empty wallets would agree whatever a press did. The
    // watcher goes on afterwards, because this press is a primary one and the
    // count below is of activations the **secondary** presses produced.
    await page.locator('[data-chip="50"]').click();
    await expect(page.locator('[data-readout="wager"] .bj-readout__value')).toHaveText('50');
    await watchPresses(page);
    const before = await readout(page);

    for (const target of TARGETS) {
      await pressWith(page, target, 'right');
    }

    expect(await readout(page), 'a right press moved the machine').toEqual(before);
    await expect(shell(page)).toHaveAttribute('data-phase', 'betting');
    expect((await pressLog(page)).clicks, 'a right press produced an activation').toBe(0);
  });

  test('ignores the middle button too', async ({ page }) => {
    // The other non-primary button. QUALITY-BAR section 3 says "secondary
    // pointer buttons", plural, and a middle-click binding would be the same
    // defect wearing a different number.
    await atBetting(page);
    await watchPresses(page);
    const before = await readout(page);

    for (const target of TARGETS) {
      await pressWith(page, target, 'middle');
    }

    expect(await readout(page), 'a middle press moved the machine').toEqual(before);
    const log = await pressLog(page);
    expect(log.clicks, 'a middle press produced an activation').toBe(0);
    for (const prevented of log.auxclick) {
      expect(prevented, 'the middle button was suppressed by the page').toBe(false);
    }
  });
});

test.describe('D5: contextmenu is suppressed nowhere', () => {
  test('leaves the context menu to the browser, on every kind of target', async ({ page }) => {
    await atBetting(page);
    await watchPresses(page);

    for (const target of TARGETS) {
      await pressWith(page, target, 'right');
    }

    const log = await pressLog(page);
    // The event has to have happened, or "nothing suppressed it" is a sentence
    // about an empty list.
    expect(log.contextmenu.length, 'no context menu event was produced at all').toBe(
      TARGETS.length,
    );
    for (const [index, prevented] of log.contextmenu.entries()) {
      expect(prevented, `the page suppressed the context menu on ${TARGETS[index] ?? ''}`).toBe(
        false,
      );
    }
  });

  test('does not suppress it on a screen with an open overlay either', async ({ page }) => {
    // The one part of the chrome that is drawn over everything else, and the
    // place a "custom menu" would most plausibly be added later.
    await atBetting(page);
    await page.locator('[data-open-overlay="settings"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    await watchPresses(page);

    await pressWith(page, '[data-overlay-host="true"]', 'right');
    const log = await pressLog(page);
    expect(log.contextmenu.length, 'no context menu event was produced').toBe(1);
    expect(log.contextmenu[0], 'the overlay suppressed the context menu').toBe(false);
  });
});

declare global {
  interface Window {
    /** Installed by this spec only. Nothing in the product writes it. */
    __bjPresses?: { contextmenu: boolean[]; auxclick: boolean[]; clicks: number };
  }
}
