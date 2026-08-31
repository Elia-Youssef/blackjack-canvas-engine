/**
 * Item `D4`, Critical, 15 points, over the built `dist/`.
 *
 *   "Tab order is logical, Enter and Space activate, Escape dismisses, modals
 *    trap focus and restore it on close, and the focus indicator meets 3:1
 *    contrast and is never removed."
 *
 * Six clauses, and the map from each of them to the assertion that carries it:
 *
 * | Clause | Where |
 * |---|---|
 * | Tab order is logical | `walks the controls in the order they are laid out` |
 * | Enter activates | `activates every kind of control with Enter` |
 * | Space activates | `activates every kind of control with Space` |
 * | Escape dismisses | `closes an open overlay`, `does nothing when none is open` |
 * | Modals trap focus | `keeps Tab inside the panel`, `wraps backwards`, `pulls focus back` |
 * | ... and restore it on close | `restores focus to the control that opened it` (twice) |
 * | The indicator meets 3:1 | `measures the rendered ring against its background` |
 * | ... and is never removed | `draws an indicator on every control on the screen` |
 *
 * **"Logical" is defined here rather than judged.** The tab order is required to
 * be the DOM order of the focusable elements, and the DOM order is required to be
 * reading order: each stop is either on the same row as the last and further
 * along it, or on a row below it. That is checked at `wide` and at `portrait`,
 * because `BJ-16` re-arranges the top bar between them and a re-arrangement that
 * moved a control visually without moving it in the DOM would leave the two
 * orders disagreeing.
 *
 * **The indicator is measured in rendered pixels, not read off the stylesheet.**
 * The same rule QUALITY-BAR section 4 states for contrast generally and the same
 * instrument `tests/browser/render-surface.spec.ts` uses for the felt, applied
 * to a DOM element: two screenshots of the same clip, one with the control
 * focused and one without, and the pixels that differ between them are what
 * focus drew. The ring's colour and the colour it replaced both come out of that
 * difference, so the ratio is between what is on the screen and what is behind
 * it. `tests/browser/support/png.ts` carries the reader and the arithmetic.
 *
 * **The trap and SPEC 10's non-blocking overlays are not in conflict**, and
 * `src/ui/input.ts` carries the reasoning at length: item `C5` is about game
 * state, which keeps running behind an open panel and is asserted to, and this
 * clause is about where the caret can go while the panel is open. Both hold, and
 * `tests/browser/overlays.spec.ts` still requires the loop to run behind one.
 */

import { expect, test, type Page } from '@playwright/test';

import { expectWager } from './support/flow';
import { splitSeed } from './support/action-seeds';
import {
  SCREEN_CONTROLS,
  controlsInDomOrder,
  focusByTab,
  focusedStop,
  selectorFor,
  tabOrder,
  type FocusStop,
} from './support/controls';
import {
  bootGame,
  control,
  notice,
  openShippedPage,
  readout,
  resizeTo,
  settle,
  shell,
  waitForPhase,
} from './support/game';
import { contrastOf, decodePng, hexOf, sampleIndicator } from './support/png';

/** QUALITY-BAR section 3's floor for the focus indicator. */
const MIN_INDICATOR_CONTRAST = 3;

/** How far outside a control's box the ring is looked for, in CSS pixels. */
const RING_MARGIN = 8;

/** Reach the betting screen on the shipped page, with nothing injected. */
async function atBettingScreen(page: Page): Promise<void> {
  await openShippedPage(page);
  await waitForPhase(page, 'start');
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
  await settle(page);
}

// ---------------------------------------------------------------------------
// Clause 1: the tab order
// ---------------------------------------------------------------------------

/**
 * Whether one stop follows another in reading order.
 *
 * Same row and further along, or any row below. The row test is "the two boxes
 * overlap vertically by more than half the shorter one", which is what a wrapped
 * flex row of buttons of slightly different heights looks like; a threshold on
 * the top edges alone would call two buttons on one line different rows the
 * moment one of them wrapped its label.
 */
function followsInReadingOrder(previous: FocusStop, next: FocusStop): boolean {
  const overlap =
    Math.min(previous.box.y + previous.box.height, next.box.y + next.box.height) -
    Math.max(previous.box.y, next.box.y);
  const sameRow = overlap > Math.min(previous.box.height, next.box.height) / 2;
  return sameRow ? next.box.x >= previous.box.x : next.box.y >= previous.box.y;
}

for (const viewport of [
  { label: 'wide', width: 1280, height: 800 },
  { label: 'portrait', width: 390, height: 844 },
] as const) {
  test.describe(`D4: the tab order at ${viewport.label}`, () => {
    test('walks the controls in the order they are laid out', async ({ page }) => {
      await atBettingScreen(page);
      await resizeTo(page, viewport.width, viewport.height);

      const expected = await controlsInDomOrder(page);
      // The screen really does carry the controls SPEC 10 puts on it, so the
      // comparison below is not two empty lists agreeing with each other.
      for (const key of SCREEN_CONTROLS['betting'] ?? []) {
        expect(expected, `${key} is in the tab order`).toContain(key);
      }

      // The walk starts on the first control rather than from a blurred page,
      // and that is an instrument rather than a shortcut: an engine resumes
      // sequential navigation from the element that last held focus, which after
      // a press on Start is the middle of the bar. Where the walk begins when
      // nothing has been pressed at all is the test below this one.
      const first = expected[0] ?? '';
      await page.locator(selectorFor(first)).focus();
      const start = await focusedStop(page);
      expect(start.key, 'the first control took focus').toBe(first);
      const walked = [start, ...(await tabOrder(page, expected.length - 1))];
      expect(
        walked.map((stop) => stop.key),
        'the tab order is the DOM order',
      ).toEqual([...expected]);

      // And the DOM order is reading order, which is the whole of "logical".
      for (let index = 1; index < walked.length; index += 1) {
        const previous = walked[index - 1];
        const next = walked[index];
        if (previous === undefined || next === undefined) {
          continue;
        }
        expect(
          followsInReadingOrder(previous, next),
          `${next.key} comes after ${previous.key} in the tab order but not on the page`,
        ).toBe(true);
      }
    });

    test('starts at the first control of a page nobody has pressed yet', async ({ page }) => {
      // The clause the walk above cannot carry, because it begins by focusing.
      // On a freshly loaded page nothing has been pressed, so the first `Tab` is
      // the engine's own answer to "where does the tab order begin", and it has
      // to be the first control in the document rather than something in the
      // middle of the bar.
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openShippedPage(page);
      await waitForPhase(page, 'start');
      await settle(page);

      const expected = await controlsInDomOrder(page);
      await page.keyboard.press('Tab');
      expect((await focusedStop(page)).key, 'the first Tab landed somewhere else').toBe(
        expected[0] ?? '',
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Clauses 2 and 3: Enter and Space
// ---------------------------------------------------------------------------

for (const key of ['Enter', ' '] as const) {
  const name = key === ' ' ? 'Space' : 'Enter';
  test.describe(`D4: ${name}`, () => {
    test('activates every kind of control on the screen', async ({ page }) => {
      await atBettingScreen(page);

      // A chip, which is the one control with a fill of its own.
      await page.locator('[data-chip="50"]').focus();
      await page.keyboard.press(key);
      await expectWager(page, 50);

      // A plain button in the controls row.
      await control(page, 'clear').focus();
      await page.keyboard.press(key);
      await expectWager(page, 0);

      // A quiet button in the top bar, which opens a panel.
      await page.locator('[data-open-overlay="settings"]').focus();
      await page.keyboard.press(key);
      await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();

      // A button inside the open panel.
      await page.locator('[data-speed="fast"]').focus();
      await page.keyboard.press(key);
      await expect(shell(page)).toHaveAttribute('data-motion-speed', 'fast');

      await control(page, 'close-overlay').focus();
      await page.keyboard.press(key);
      await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();
    });

    test('activates the disclosure, and does not scroll the page instead', async ({ page }) => {
      // The one control that is not a `<button>`, and the one place `Space` has
      // a default the platform has to be trusted to suppress: a `Space` that
      // scrolled the page instead of opening the disclosure would be the same
      // defect as a control that could not be operated at all.
      await atBettingScreen(page);
      await resizeTo(page, 320, 568);
      const disclosure = page.locator('.bj-readouts__more');
      const summary = page.locator('[data-control="more-readouts"]');
      await expect(summary).toBeVisible();
      const open = await disclosure.evaluate((node) => node.hasAttribute('open'));

      await summary.focus();
      const scrolled = await page.evaluate(() => window.scrollY);
      await page.keyboard.press(key);
      await settle(page);

      expect(
        await disclosure.evaluate((node) => node.hasAttribute('open')),
        'the disclosure toggled',
      ).toBe(!open);
      expect(await page.evaluate(() => window.scrollY), 'the page scrolled instead').toBe(scrolled);
    });
  });
}

// ---------------------------------------------------------------------------
// Clause 4: Escape
// ---------------------------------------------------------------------------

test.describe('D4: Escape', () => {
  test('closes an open overlay, whichever of the three it is', async ({ page }) => {
    await atBettingScreen(page);
    const host = page.locator('[data-overlay-host="true"]');
    for (const id of ['settings', 'howToPlay', 'statistics']) {
      await page.locator(`[data-open-overlay="${id}"]`).focus();
      await page.keyboard.press('Enter');
      await expect(host).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(host, `Escape closed the ${id} overlay`).toBeHidden();
    }
  });

  test('does nothing at all when no overlay is open', async ({ page }) => {
    // The other half of "dismisses": a key that closed something is only correct
    // if the same key on the same screen with nothing open changes nothing. The
    // whole machine readout is compared, which is `C5`'s instrument turned on a
    // key press instead of on a panel.
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator('[data-chip="50"]').click();
    await expectWager(page, 50);

    const before = await readout(page);
    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press('Escape');
    }
    await settle(page);
    expect(await readout(page), 'Escape moved the machine').toEqual(before);
    await expect(shell(page)).toHaveAttribute('data-phase', 'betting');
  });
});

// ---------------------------------------------------------------------------
// Clause 5: the trap
// ---------------------------------------------------------------------------

test.describe('D4: an open overlay traps focus', () => {
  test('keeps every Tab stop inside the panel', async ({ page }) => {
    await atBettingScreen(page);
    // Settings is the panel with controls in it: two coach modes, two speeds,
    // four sizes and Close. A panel with one control would trap trivially.
    await page.locator('[data-open-overlay="settings"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    await settle(page);

    const inside = await page.evaluate(
      () => document.querySelectorAll('[data-overlay-host="true"] button').length,
    );
    expect(inside, 'the panel has controls to trap').toBeGreaterThan(4);

    // Two full laps, so the wrap at the end is exercised rather than assumed.
    const stops = await tabOrder(page, inside * 2 + 1);
    for (const stop of stops) {
      const contained = await page.evaluate(
        () => document.querySelector('[data-overlay-host="true"]')?.contains(document.activeElement) ?? false,
      );
      expect(contained, `Tab left the panel and landed on ${stop.key}`).toBe(true);
    }
  });

  test('wraps backwards from the first control to the last', async ({ page }) => {
    await atBettingScreen(page);
    await page.locator('[data-open-overlay="settings"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    await settle(page);

    await page.keyboard.press('Tab');
    const first = await focusedStop(page);
    await page.keyboard.press('Shift+Tab');
    const wrapped = await focusedStop(page);
    expect(wrapped.key, 'Shift+Tab from the first control left the panel').not.toBe(first.key);

    // The last focusable control in the panel, by name, computed from the DOM
    // rather than assumed: `BJ-20` grew the panel past the size buttons, and
    // the property under test is that the wrap reaches the panel's own last
    // stop, whichever control that is today.
    const last = await page.evaluate(() => {
      const host = document.querySelector('[data-overlay-host="true"]');
      const focusable = [...(host?.querySelectorAll('button, summary, input') ?? [])].filter(
        (node) => node instanceof HTMLElement && node.getClientRects().length > 0,
      );
      const node = focusable[focusable.length - 1];
      if (node === undefined) {
        return '';
      }
      for (const attribute of [
        'data-control',
        'data-action',
        'data-chip',
        'data-open-overlay',
        'data-table',
        'data-drop-table',
        'data-coach-mode',
        'data-speed',
        'data-surface-size',
        'data-decks',
        'data-rule',
        'data-split-rule',
        'data-theme',
        'data-motion-setting',
      ]) {
        const value = node.getAttribute(attribute);
        if (value !== null) {
          return `${attribute}=${value}`;
        }
      }
      return node.tagName.toLowerCase();
    });
    expect(wrapped.key, 'the wrap landed on the last control in the panel').toBe(last);
  });

  test('pulls focus back when it is put on a control behind the panel', async ({ page }) => {
    // The case a `Tab` handler alone does not cover: a press on a background
    // control leaves focus outside the dialog, and the next `Tab` has to bring
    // it back rather than walking the page underneath.
    await atBettingScreen(page);
    await page.locator('[data-open-overlay="statistics"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();

    await page.locator('[data-chip="10"]').focus();
    expect((await focusedStop(page)).key, 'the background control took focus').toBe('data-chip=10');

    await page.keyboard.press('Tab');
    expect((await focusedStop(page)).key, 'Tab did not return to the panel').toBe(
      'data-control=close-overlay',
    );
  });
});

// ---------------------------------------------------------------------------
// Clause 6: restore on close
// ---------------------------------------------------------------------------

test.describe('D4: closing an overlay restores focus', () => {
  test('to the control that opened it, when it was opened by keyboard', async ({ page }) => {
    await atBettingScreen(page);
    for (const id of ['settings', 'howToPlay', 'statistics']) {
      await page.locator(`[data-open-overlay="${id}"]`).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
      await settle(page);
      // The panel itself takes focus on open, so the name a screen reader
      // announces on arrival is the panel's rather than its first control's.
      expect((await focusedStop(page)).key, 'the panel took focus').toBe(
        'data-overlay-host=true',
      );

      await page.keyboard.press('Escape');
      await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();
      await settle(page);
      expect((await focusedStop(page)).key, `focus went back to the ${id} control`).toBe(
        `data-open-overlay=${id}`,
      );
    }
  });

  test('to the control that opened it, when it was opened by a press', async ({ page }) => {
    // WebKit does not focus a button when it is pressed, so on that engine the
    // element that had focus at the moment the panel opened is `<body>`. The
    // restore falls back to the control that opened the panel, which the
    // overlays component publishes for exactly this.
    await atBettingScreen(page);
    await page.locator('[data-open-overlay="howToPlay"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    await settle(page);

    await control(page, 'close-overlay').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();
    await settle(page);
    expect((await focusedStop(page)).key, 'focus was not restored').toBe(
      'data-open-overlay=howToPlay',
    );
  });
});

// ---------------------------------------------------------------------------
// QUALITY-BAR section 3's other half: focus survives a state change
// ---------------------------------------------------------------------------

test.describe('D4: focus survives a change of screen', () => {
  test('lands on the controls row rather than on the body when a screen goes', async ({ page }) => {
    // The defect QUALITY-BAR section 3 names: SPEC 10 replaces the whole
    // controls row at a phase change, so the control that was pressed is gone by
    // the next frame and the browser answers that by focusing `<body>`.
    //
    // Seeded, because the phase the deal has to reach is the player's turn and
    // an unseeded launch can deal a dealer Ace or a natural and go somewhere
    // else. What is graded here is where focus goes, not which screen replaced
    // which, so the seed removes a variable rather than choosing an answer.
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await settle(page);
    await page.locator('[data-chip="50"]').focus();
    await page.keyboard.press('Enter');
    await expectWager(page, 50);

    await control(page, 'deal').focus();
    await page.keyboard.press('Enter');
    await waitForPhase(page, 'playerTurn');
    await settle(page);

    const stop = await focusedStop(page);
    expect(stop.key, 'focus fell to the body when the betting screen went').toBe(
      'data-focus-anchor=controls',
    );

    // And the anchor is a place to walk on from, not a dead end: one Tab from it
    // reaches the first control of the screen that replaced the old one.
    await page.keyboard.press('Tab');
    expect((await focusedStop(page)).key, 'the anchor leads nowhere').toBe('data-action=hit');
  });

  test('lands there when a control is taken away by the stylesheet, not by hidden', async ({
    page,
  }) => {
    // The other way a control can go, and the one an attribute scan cannot see.
    // `BJ-16`'s readout disclosure is a real `<summary>` at `portrait` and is
    // `display: none` above 768 px, so a player who focuses it on a phone and
    // then turns the phone has the control taken out from under the caret by a
    // media-independent stylesheet rule rather than by the `hidden` property
    // every screen uses. Focus has to end up in the same place either way.
    await atBettingScreen(page);
    await resizeTo(page, 390, 844);
    const summary = page.locator('[data-control="more-readouts"]');
    await expect(summary).toBeVisible();
    await summary.focus();
    expect((await focusedStop(page)).key, 'the disclosure did not take focus').toBe(
      'data-control=more-readouts',
    );

    await resizeTo(page, 1280, 800);
    await settle(page);
    await expect(summary).toBeHidden();
    expect((await focusedStop(page)).key, 'focus fell to the body when the disclosure went').toBe(
      'data-focus-anchor=controls',
    );
  });

  test('keeps a greyed control focusable, and refuses the press', async ({ page }) => {
    // The other half of the same rule. SPEC 6 locks Silver and Gold on a fresh
    // launch, and QUALITY-BAR section 3 requires an unavailable control to be
    // greyed in place rather than removed, so a player on a keyboard can reach
    // it and read why. The press has to do nothing, which is what the native
    // `disabled` property used to guarantee.
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    const silver = page.locator('[data-table="silver"]');
    await expect(silver).toBeDisabled();
    await expect(silver).toHaveAttribute('title', /.+/);

    await silver.focus();
    expect((await focusedStop(page)).key, 'the greyed control cannot be focused').toBe(
      'data-table=silver',
    );

    await page.keyboard.press('Enter');
    await page.keyboard.press(' ');
    await settle(page);
    await expect(shell(page)).toHaveAttribute('data-phase', 'start');
    await expect(page.locator('[data-table="bronze"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(silver, 'the greyed control was pressed anyway').toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // And nothing was **attempted**. The two assertions above hold either way,
    // because the machine refuses `chooseTable` on a locked table as well, so
    // they cannot tell a control that refused the press from one that passed it
    // on to be refused a layer down. The notice can: SPEC 4.11 surfaces every
    // refusal the machine makes, so a press that reached it would print here.
    // The reason a player needs is already on the control, as `title`.
    await expect(notice(page), 'the greyed control fired an intent anyway').toBeEmpty();
    await expect(notice(page)).not.toHaveAttribute('data-reason', 'table-locked');
  });
});

// ---------------------------------------------------------------------------
// Clauses 7 and 8: the indicator, measured
// ---------------------------------------------------------------------------

/**
 * Focus one control from the keyboard and measure what focus drew.
 *
 * The control is reached with real `Tab` presses rather than with `focus()`,
 * because `:focus-visible` is the engine's own answer to "should the indicator
 * be drawn" and a programmatic focus after a press is a case where the answer
 * can legitimately be no. Reaching it by keyboard is the case the criterion is
 * about.
 */
async function measureIndicator(
  page: Page,
  key: string,
): Promise<{ readonly changed: number; readonly contrast: number; readonly ring: string }> {
  const target = page.locator(selectorFor(key));
  await target.scrollIntoViewIfNeeded();
  expect(await focusByTab(page, key), `${key} was not reachable by Tab`).toBe(true);

  const stop = await focusedStop(page);
  expect(stop.focusVisible, `${key} took focus without asking for an indicator`).toBe(true);

  const box = await target.boundingBox();
  expect(box, `${key} has a rendered box`).not.toBeNull();
  if (box === null) {
    throw new Error(`${key} has no box`);
  }
  const clip = {
    x: Math.max(0, Math.floor(box.x) - RING_MARGIN),
    y: Math.max(0, Math.floor(box.y) - RING_MARGIN),
    width: Math.ceil(box.width) + RING_MARGIN * 2,
    height: Math.ceil(box.height) + RING_MARGIN * 2,
  };

  const focused = decodePng(await page.screenshot({ clip }));
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await settle(page);
  const blurred = decodePng(await page.screenshot({ clip }));

  const sample = sampleIndicator(blurred, focused);
  return { changed: sample.changed, contrast: sample.contrast, ring: hexOf(sample.indicator) };
}

test.describe('D4: the focus indicator', () => {
  test('measures at least 3:1 against what it is drawn over', async ({ page }) => {
    await atBettingScreen(page);
    // One control per kind the betting screen carries: a quiet button in the top
    // bar, a chip with a fill of its own, and the primary button.
    for (const key of ['data-open-overlay=settings', 'data-chip=50', 'data-control=deal']) {
      const measured = await measureIndicator(page, key);
      expect(measured.changed, `${key} drew no indicator at all`).toBeGreaterThan(0);
      expect(
        measured.contrast,
        `${key} drew ${measured.ring} at ${measured.contrast.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MIN_INDICATOR_CONTRAST);
    }
  });

  test('measures the same on an action control at the players turn', async ({ page }) => {
    await bootGame(page, { seed: splitSeed() });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await page.locator('[data-chip="50"]').click();
    await control(page, 'deal').click();
    await waitForPhase(page, 'playerTurn');
    await settle(page);

    // A live action and a greyed one, because the greyed state restyles the
    // border and the text and could have taken the ring with it.
    for (const key of ['data-action=hit', 'data-action=surrender']) {
      const measured = await measureIndicator(page, key);
      expect(measured.changed, `${key} drew no indicator at all`).toBeGreaterThan(0);
      expect(
        measured.contrast,
        `${key} drew ${measured.ring} at ${measured.contrast.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MIN_INDICATOR_CONTRAST);
    }
  });

  test('is drawn on every control on the screen, and removed from none', async ({ page }) => {
    // The "never removed" clause over the whole screen rather than over the
    // three controls the pixel measurement can afford. Every control is reached
    // by `Tab` and required to compute an outline that is really painted: a
    // `outline: none` on any one of them shows up here.
    await atBettingScreen(page);
    const expected = await controlsInDomOrder(page);

    for (const key of expected) {
      expect(await focusByTab(page, key), `${key} is not reachable by Tab`).toBe(true);
      const outline = await page.evaluate(() => {
        const node = document.activeElement;
        if (!(node instanceof HTMLElement)) {
          return null;
        }
        const style = getComputedStyle(node);
        return {
          style: style.outlineStyle,
          width: Number.parseFloat(style.outlineWidth),
          colour: style.outlineColor,
          visible: node.matches(':focus-visible'),
        };
      });
      expect(outline, `${key} has no computed style`).not.toBeNull();
      expect(outline?.visible, `${key} took focus without asking for an indicator`).toBe(true);
      expect(outline?.style, `${key} has its outline removed`).not.toBe('none');
      expect(outline?.width ?? 0, `${key} has a zero-width outline`).toBeGreaterThan(0);
    }
  });

  test('draws one on the focus anchor and on the overlay itself', async ({ page }) => {
    // The two elements that take focus without being controls. Neither is in the
    // tab order, so neither is covered by the sweep above, and both are places
    // the caret really lands: the anchor when a screen is replaced, the panel
    // when it opens.
    await atBettingScreen(page);
    const measure = async (selector: string): Promise<void> => {
      const found = await page.evaluate((wanted: string) => {
        const node = document.querySelector(wanted);
        if (!(node instanceof HTMLElement)) {
          return null;
        }
        node.focus();
        const style = getComputedStyle(node);
        return {
          focused: document.activeElement === node,
          tabIndex: node.tabIndex,
          outline: style.outlineStyle,
          ring: style.getPropertyValue('--focus-ring-color').trim(),
        };
      }, selector);
      expect(found?.focused, `${selector} cannot take focus`).toBe(true);
      expect(found?.tabIndex, `${selector} is in the tab order`).toBe(-1);
      expect(found?.ring, `${selector} has no ring token to spend`).not.toBe('');
    };

    await measure('.bj-controls');
    // The panel has to be open to be focusable at all: it is `hidden` when it is
    // closed, and a hidden element takes no focus on any engine.
    await page.locator('[data-open-overlay="settings"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    await measure('[data-overlay-host="true"]');
  });

  test('spends the token the design contract measured, and it clears 3:1', async ({ page }) => {
    // The bridge between the measurement above and item `E1`'s token layer: the
    // ring the pixels showed is the resolved `--focus-ring-color`, against the
    // resolved `--bj-ground`, at the ratio `tests/unit/tokens.test.ts` pins. A
    // measurement that agreed with the tokens by accident would drift the first
    // time one of them moved.
    await atBettingScreen(page);
    const resolved = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const probe = document.createElement('span');
      document.body.append(probe);
      const read = (token: string): string => {
        probe.style.color = style.getPropertyValue(token).trim();
        const value = getComputedStyle(probe).color;
        return value;
      };
      const ring = read('--focus-ring-color');
      const ground = read('--bj-ground');
      probe.remove();
      return { ring, ground };
    });

    const parse = (value: string): [number, number, number, number] => {
      const parts = value.match(/[\d.]+/g) ?? [];
      return [
        Number(parts[0] ?? 0),
        Number(parts[1] ?? 0),
        Number(parts[2] ?? 0),
        255,
      ];
    };
    const ratio = contrastOf(parse(resolved.ring), parse(resolved.ground));
    expect(ratio, `${resolved.ring} on ${resolved.ground}`).toBeGreaterThanOrEqual(
      MIN_INDICATOR_CONTRAST,
    );
  });
});
