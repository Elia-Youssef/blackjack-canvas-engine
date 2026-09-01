/**
 * BJ-22, items H4 and H7: timed screens must not resize the play surface merely
 * because their control row contains a status line instead of actions.
 *
 * The performance instrument located its only repeated long task at the first
 * betting-to-dealing transition. The 76 px betting row collapsed to 24 px,
 * growing the canvas from 1029 x 579 to 1121 x 631 and reallocating both backing
 * stores under a 4x CPU throttle. This assertion pins the rendered cause rather
 * than a timing number: timing varies by host, while an equal backing-store size
 * is the property that makes the expensive compositor commit unnecessary.
 *
 * **The scope, stated rather than left to the reader.** `src/ui/chrome.css` pins
 * `.bj-controls` for SPEC 10's five timed screens at the height of the action
 * rows beside them: the notice's own `--space-5`, the row's `--space-2` gap and
 * a button's `--target-min`, which is 76 px. That equality holds where the
 * action rows are **one** row of buttons, which is `wide`. At `compact` and
 * `portrait` the chip tray is its own full-width row and five action buttons do
 * not fit 320 px, so the betting and player-turn rows wrap to two or three and
 * stay well above 76 px; the transition this file is about therefore still
 * resizes the surface there. That is `F1`/`F7` layout work and it is not taken
 * here: what this spec asserts is the wide case, for all five timed phases, and
 * this paragraph is the record that the narrow case is known and open. The felt
 * cache is what keeps the narrow resize cheap in the meantime
 * (`src/render/scene.ts`, `FELT_CACHE_LIMIT`).
 *
 * **The can-see control.** `surfaceSize` reads `canvas.width` and
 * `canvas.height`, and an `HTMLCanvasElement` that was never sized reports
 * 300 x 150 in both phases, so the equality alone is satisfied by a page that
 * never laid a surface out at all. The betting read is therefore asserted to be
 * a surface a player would see before it is used as the expected value, and a
 * second read of the same phase is taken to show the instrument is stable
 * rather than constant.
 */

import { expect, test, type Page } from '@playwright/test';

import { bootGame, chip, control, pressOn, settle, waitForPhase } from './support/game';

test.use({ viewport: { width: 1280, height: 800 } });

/**
 * The five screens `src/ui/chrome.css` pins, in the order one insured round
 * passes through them. SPEC 10's timed phases: none of them offers a control.
 */
const TIMED_PHASES = ['dealing', 'peek', 'insurance', 'reveal', 'dealerTurn', 'settling'] as const;

/**
 * The narrowest a laid-out surface is at this viewport, well above the
 * 300 x 150 an unsized canvas reports and well below the 1280 it cannot exceed.
 */
const LAID_OUT_MIN_WIDTH = 600;

interface SurfaceSize {
  readonly width: number;
  readonly height: number;
}

async function surfaceSize(page: Page): Promise<SurfaceSize> {
  return page.locator('.bj-surface').evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));
}

/** The phase the shell is on, read off the attribute the chrome writes. */
async function phaseOf(page: Page): Promise<string> {
  return (await page.locator('.bj-shell').getAttribute('data-phase')) ?? '';
}

test('H4 and H7: the first timed phase keeps the action-phase backing store', async ({ page }) => {
  await bootGame(page, { seed: 1, alwaysReduceMotion: true });
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
  await settle(page);
  const betting = await surfaceSize(page);

  // The control: a real surface was measured, not an unsized canvas agreeing
  // with itself. `error-boundary.spec.ts` carries the same line for the same
  // reason: "without it, the property is satisfied by an instrument that never
  // saw a frame at all".
  expect(betting.width, 'the surface was never laid out').toBeGreaterThan(LAID_OUT_MIN_WIDTH);
  expect(betting.height, 'the surface was never laid out').toBeGreaterThan(0);
  expect(betting.width).toBeLessThanOrEqual(1280);

  // And the instrument is stable rather than constant: a second read of the
  // same phase answers the same, so the equality below is about the transition.
  await settle(page);
  expect(await surfaceSize(page), 'the surface moves without a phase change').toEqual(betting);

  await chip(page, 50).click();
  await control(page, 'deal').click();
  await waitForPhase(page, 'dealing');
  await settle(page);

  expect(await surfaceSize(page)).toEqual(betting);
});

test('H4 and H7: every timed screen of a round keeps it, not only the first', async ({ page }) => {
  // The pin covers five phases and the assertion above drives one of them. This
  // walks a whole round and measures the surface on every timed screen it
  // passes through, so a rule that lost four of its five selectors is caught by
  // the property rather than by reading the stylesheet.
  //
  // **Sampled inside the page, once per frame.** A test that polled the phase
  // over the wire would race the machine: SPEC 5's shortest timed phase is
  // 0.22 s and a round-trip read plus a click can miss a whole screen, which
  // the first form of this test did, catching one phase of five. The recorder
  // below runs on the page's own animation frames, so it sees every phase the
  // round enters and records the backing store as it was during it.
  await bootGame(page, { seed: 1, alwaysReduceMotion: true });
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
  await settle(page);
  const betting = await surfaceSize(page);
  expect(betting.width, 'the surface was never laid out').toBeGreaterThan(LAID_OUT_MIN_WIDTH);

  await page.evaluate(() => {
    const seen = new Map<string, { width: number; height: number }>();
    const win = window as unknown as { __bjSizes?: Record<string, unknown> };
    const sample = (): void => {
      const shell = document.querySelector('.bj-shell');
      const canvas = document.querySelector('.bj-surface');
      const phase = shell?.getAttribute('data-phase') ?? '';
      if (phase !== '' && canvas instanceof HTMLCanvasElement && !seen.has(phase)) {
        seen.set(phase, { width: canvas.width, height: canvas.height });
      }
      win.__bjSizes = Object.fromEntries(seen);
      window.requestAnimationFrame(sample);
    };
    window.requestAnimationFrame(sample);
  });

  await chip(page, 50).click();
  await control(page, 'deal').click();

  // Drive the round to its result, answering whatever screens the deal opened.
  for (let step = 0; step < 400; step += 1) {
    const phase = await phaseOf(page);
    if (phase === 'roundResult') {
      break;
    }
    if (phase === 'insurance') {
      // `pressOn` re-reads the phase and gives up quietly when the screen went
      // away under the press, which is the whole hazard of driving a machine
      // that advances on its own clock.
      await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
      continue;
    }
    if (phase === 'playerTurn') {
      await pressOn(page, '[data-action="stand"]', 'playerTurn');
      continue;
    }
    await page.waitForTimeout(20);
  }
  await waitForPhase(page, 'roundResult');

  const sampled = await page.evaluate(
    () => (window as unknown as { __bjSizes?: Record<string, SurfaceSize> }).__bjSizes ?? {},
  );
  const timed = Object.entries(sampled).filter(([phase]) =>
    (TIMED_PHASES as readonly string[]).includes(phase),
  );

  // Non-vacuity: the round really passed through timed screens, and the
  // recorder really recorded them. `dealing`, `reveal`, `dealerTurn` and
  // `settling` are on the path of any stood round; `peek` and `insurance`
  // depend on the dealer's up card, so the floor is four rather than six.
  expect(Object.keys(sampled), 'the recorder saw no screen at all').toContain('betting');
  expect(timed.length, 'the round passed through too few timed screens').toBeGreaterThanOrEqual(4);
  expect(timed.map(([phase]) => phase)).toContain('dealing');
  for (const [phase, size] of timed) {
    expect(size, `${phase} resized the play surface`).toEqual(betting);
  }
});
