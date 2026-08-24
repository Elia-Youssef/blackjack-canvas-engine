/**
 * Item `E7`, Critical, 17 points, over the built `dist/`.
 *
 *   "prefers-reduced-motion removes every animation entirely, including panel
 *    and overlay transitions, while leaving the sequence of states and the
 *    outcome identical. Presentation pacing may differ."
 *
 * Five clauses, and each one has an assertion of its own below. The mapping is
 * written out because the `BJ-15` review found both of its gating gaps as
 * criterion clauses with no assertion anywhere.
 *
 *   1. **"prefers-reduced-motion"** is the media query, emulated per page with
 *      `page.emulateMedia`, never a setting and never an injected flag. Every
 *      test here runs the same body in both modes, and the page is required to
 *      report which mode it resolved, so a test cannot pass by emulating one
 *      thing and measuring another.
 *   2. **"removes every animation entirely"** is asserted on both halves of the
 *      presentation. The canvas half is the play surface's own count of tweens
 *      in flight, sampled on **every frame** of a real round: zero on every one
 *      of them under the flag, and positive on some of them without it, which is
 *      the control that keeps the first half from being vacuous. The DOM half is
 *      SPEC 5's balance count-up: under the flag the rendered readout equals the
 *      machine's balance on every frame, and without it there is a frame where
 *      they differ.
 *   3. **"including panel and overlay transitions"** is the computed
 *      `animation-duration` and `transition-duration` of the overlay, the open
 *      panel and a button, read off the shipped stylesheet in both modes:
 *      exactly zero under the flag, and positive without it.
 *   4. **"leaving the sequence of states identical"** is the phase sequence of
 *      one seeded round, driven with the same presses in both modes and compared
 *      element for element.
 *   5. **"and the outcome identical"** is SPEC 10's round result payload from
 *      the same two rounds, compared whole: every hand's wager, credit, outcome
 *      and deciding rung, the insurance result and the closing balance.
 *
 * The last sentence, "presentation pacing may differ", is a permission rather
 * than an obligation, and this build does not take it: the pacing is
 * `core/table.ts`'s and the flag never reaches it. That is asserted here as the
 * two rounds reaching the same states, and in `tests/unit/motion.test.ts` as the
 * absence of any spelling of the flag anywhere under `src/core/`.
 *
 * **Routes.** Clause 3 runs on the shipped page with nothing injected, because a
 * computed style is a property of `dist/`. Clauses 2, 4 and 5 need a known deal
 * and a per-frame instrument, so they take the harness route `BJ-15` landed and
 * documented. Both are stated per test.
 */

import { expect, test, type Page } from '@playwright/test';

import {
  atBetting,
  atShippedBetting,
  chip,
  control,
  motionTrace,
  numberFrom,
  readout,
  traceMotion,
  waitForPhase,
} from './support/game';

/** One seeded round is enough: it deals, reveals, settles and pays. */
const SEED = 53;
const WAGER = 50;

/** Both arms of the media query, as Playwright names them. */
const MODES = ['no-preference', 'reduce'] as const;
type Mode = (typeof MODES)[number];

/** The mode the page is expected to resolve, as the chrome reports it. */
const RESOLVED: Readonly<Record<Mode, string>> = {
  'no-preference': 'full',
  reduce: 'reduce',
};

/**
 * The durations a stylesheet reports for one element, in seconds.
 *
 * Both properties, because the chrome uses both: the overlay and the panels are
 * keyframe animations and the buttons are transitions, and a criterion that
 * says "every animation" is not satisfied by removing one kind.
 */
async function durationsOf(page: Page, selector: string): Promise<number[]> {
  return page.evaluate((css: string) => {
    const node = document.querySelector(css);
    if (node === null) {
      throw new Error(`no element matches ${css}`);
    }
    const style = getComputedStyle(node);
    const parse = (value: string): number[] =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => (part.endsWith('ms') ? Number.parseFloat(part) / 1000 : Number.parseFloat(part)));
    return [...parse(style.animationDuration), ...parse(style.transitionDuration)];
  }, selector);
}

/** Play the seeded round out, sampling every frame of it. */
async function tracedRound(page: Page, mode: Mode): Promise<ReturnType<typeof motionTrace>> {
  await page.emulateMedia({ reducedMotion: mode });
  await atBetting(page, { seed: SEED });
  await traceMotion(page);
  await chip(page, WAGER).click();
  await control(page, 'deal').click();
  await waitForPhase(page, 'playerTurn');
  await page.locator('[data-action="stand"]').click();
  await waitForPhase(page, 'roundResult');
  // The count-up and the win pulse both run inside the round result, so the
  // sampler is given frames there before it is stopped. Without this the DOM
  // half of clause 2 would sample only the frames before the balance moved.
  await page.waitForTimeout(1200);
  return motionTrace(page);
}

test.describe('E7: the page resolves the mode the query emulates', () => {
  for (const mode of MODES) {
    test(`reports ${mode} on the shipped page`, async ({ page }) => {
      // Nothing below means anything if the emulation did not reach the page.
      // The chrome writes the boolean it handed the play surface, so this is the
      // resolved answer and not a second reading of the query.
      await page.emulateMedia({ reducedMotion: mode });
      await atShippedBetting(page);
      await expect(page.locator('.bj-shell')).toHaveAttribute('data-motion', RESOLVED[mode]);
    });
  }
});

test.describe('E7: panel and overlay transitions are removed entirely', () => {
  for (const mode of MODES) {
    test(`resolves every chrome duration correctly under ${mode}`, async ({ page }) => {
      // The shipped page, driven through its own controls. No harness: a
      // computed style is a property of the stylesheet `dist/` shipped.
      await page.emulateMedia({ reducedMotion: mode });
      await atShippedBetting(page);
      await page.locator('[data-open-overlay="settings"]').click();
      await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();

      const overlay = await durationsOf(page, '[data-overlay-host="true"]');
      const panel = await durationsOf(page, '[data-panel="settings"]');
      const button = await durationsOf(page, '[data-open-overlay="settings"]');

      // A computed duration always resolves to something, even '0s', so the
      // length of these lists cannot discriminate and is not asserted. The
      // control that "removed" is a statement about an animation somebody wrote
      // is the no-preference arm below, which requires each of the three to be
      // positive there.
      const every = [...overlay, ...panel, ...button];
      if (mode === 'reduce') {
        for (const seconds of every) {
          expect(seconds, 'reduced motion removes it entirely').toBe(0);
        }
      } else {
        // At least one real animation on each, or the mode above proves nothing.
        expect(Math.max(...overlay), 'the overlay animates').toBeGreaterThan(0);
        expect(Math.max(...panel), 'the panel animates').toBeGreaterThan(0);
        expect(Math.max(...button), 'the button transitions').toBeGreaterThan(0);
      }
    });
  }
});

test.describe('E7: every animation is removed, on every frame of a real round', () => {
  test('runs the play surface with nothing in flight under reduce', async ({ page }) => {
    const trace = await tracedRound(page, 'reduce');
    expect(trace.length, 'the sampler saw the round').toBeGreaterThan(30);

    for (const sample of trace) {
      expect(sample.reducedMotion, 'the page resolved the flag').toBe(true);
      expect(sample.tweens, `a tween was in flight during ${sample.phase}`).toBe(0);
      // SPEC 5's count-up, removed: the readout is the machine's number on
      // every frame, never a number on the way to it.
      expect(numberFrom(sample.balance), `the balance lagged during ${sample.phase}`).toBe(
        sample.chips,
      );
    }
  });

  test('runs the same round with animation under no-preference', async ({ page }) => {
    // The control for the test above, and it is not optional: a play surface
    // that animated nothing at all, or a readout that never counted, would
    // satisfy "removed entirely" and none of its point.
    const trace = await tracedRound(page, 'no-preference');
    expect(trace.length, 'the sampler saw the round').toBeGreaterThan(30);
    for (const sample of trace) {
      expect(sample.reducedMotion).toBe(false);
    }

    const animated = trace.filter((sample) => sample.tweens > 0);
    expect(animated.length, 'the play surface animates without the flag').toBeGreaterThan(0);

    const counting = trace.filter((sample) => numberFrom(sample.balance) !== sample.chips);
    expect(counting.length, 'the balance counts up without the flag').toBeGreaterThan(0);

    // And the count really ends on the machine's number rather than near it.
    const last = trace[trace.length - 1];
    expect(last).toBeDefined();
    expect(numberFrom(last?.balance ?? '')).toBe(last?.chips);
  });
});

test.describe('E7: the sequence of states and the outcome are identical', () => {
  test('drives one seeded round in both modes and compares them whole', async ({ browser }) => {
    const play = async (mode: Mode): Promise<{ states: string[]; result: unknown }> => {
      const context = await browser.newContext({ reducedMotion: mode });
      const page = await context.newPage();
      const trace = await tracedRound(page, mode);
      const snapshot = await readout(page);
      await context.close();

      // The sequence, as the page passed through it: consecutive duplicates
      // collapsed, so what is compared is the order of screens and not how many
      // frames each one happened to take. Pacing may differ; the sequence may
      // not.
      const states: string[] = [];
      for (const sample of trace) {
        if (states[states.length - 1] !== sample.phase) {
          states.push(sample.phase);
        }
      }
      return {
        states,
        result: snapshot.phase.kind === 'roundResult' ? snapshot.phase.result : null,
      };
    };

    const full = await play('no-preference');
    const reduced = await play('reduce');

    expect(reduced.states, 'the same screens, in the same order').toEqual(full.states);
    expect(reduced.states.length, 'the round really moved through screens').toBeGreaterThan(3);
    expect(full.result, 'the round settled').not.toBeNull();
    // Every hand's wager, credit, outcome and deciding rung, the insurance
    // result and the closing balance, compared as one value.
    expect(reduced.result, 'the same outcome').toEqual(full.result);
  });
});
