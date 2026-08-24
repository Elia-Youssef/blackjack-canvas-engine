/**
 * Automated armour under item `E6`, Major, 15 points, method D.
 *
 *   "The specified motion set is present and correct: arc travel on dealt cards,
 *    horizontal-scale hole card flip, chip slide and stack, balance count-up,
 *    win pulse. The dealer's peek is identical in motion and pacing whether or
 *    not it finds a natural: no tell, no timing difference, no animation
 *    variation."
 *
 * **This file closes nothing.** `E6` is a Demonstration item and closes at the
 * ACCEPTANCE section 4 session, on the capture `demo/motion`, which is a person
 * watching two rounds side by side. What runs here is the discipline `BJ-13`
 * set for its three D items: the behaviour, the hook the capture takes, and
 * automated armour under both, so that a regression between now and the session
 * turns something red rather than turning up in a video.
 *
 * Three things are asserted, and the no-tell clause is the one worth reading.
 *
 *   1. **The capture route works.** The demonstration hook is bundled and
 *      injected exactly as it will be used, both arms of the peek are mounted,
 *      and each round is required to reach the screens its arm implies. A hook
 *      nobody had run would be discovered at the session.
 *   2. **The peek tells nothing, measured on the wall clock.** Both arms are
 *      timed from the screen they enter on to the screen they leave on, in the
 *      browser, on the real page. `tests/unit/motion.test.ts` already pins the
 *      peek to one constant on both arms to the frame; what this adds is that
 *      the constant survives the composition root, the frame loop and a real
 *      `requestAnimationFrame`.
 *   3. **The motion set is present on a real canvas.** The play surface reports
 *      tweens in flight during the deal and during the round result, and none
 *      once a screen has settled. That is the difference between a motion layer
 *      that is wired in and one that compiles.
 *
 * The two seeds are found rather than staged: `support/peek-seeds.ts` drives the
 * real machine over the seed space and reports the first seed on each arm, so
 * both captures are rounds a player could actually be dealt, differing in one
 * card. The spec runs the same search in Node and requires the page to agree.
 */

import { expect, test, type Page } from '@playwright/test';

import { PEEK_PAUSE } from '../../src/core/table';
import { classify, peekBranches, type PeekBranch } from './support/peek-seeds';
import type { PhaseAccumulator } from './support/motion-demo';
import {
  PHASE_TIMEOUT,
  bundleSupport,
  control,
  phaseSeconds,
  phaseTimings,
  pressOn,
  watchPhases,
} from './support/game';

/**
 * How the peek is timed, and why it is not timed on the wall clock.
 *
 * **The clause is a comparison of two durations that differ by nothing, so the
 * instrument has to be finer than the difference it is looking for.** A
 * wall-clock reading of a 0.30 s window is worth about a frame at each edge, and
 * the two clocks involved can drift apart by a *proportion*: this part measured
 * two phases at once both reading five sixths of their duration under load. A
 * band wide enough to survive that is wide enough to swallow a real tell, and
 * the review proved it: a peek branched 30 percent longer on one arm passed a
 * wall-clock band of 0.7 to 1.4 and a 0.15 s arm gap without a murmur.
 *
 * So the peek is timed on **the machine's own accumulator**, sampled per frame
 * through the demonstration hook. `TableReadout.elapsed` is the float `update`
 * adds each delta to and compares against the phase's duration; it cannot drift
 * against that duration because it is the value being compared to it. The
 * machine fires the step on the first frame where the accumulator has been paid,
 * so one visit brackets the duration exactly:
 *
 *     maxElapsed  <  duration  <=  maxElapsed + one frame
 *
 * which is a bracket of about 17 ms around a 300 ms constant rather than one of
 * 200 ms. A branched peek of any size larger than a frame breaks the upper
 * bound on the arm that carries it.
 *
 * The wall clock stays, loosely, for the one thing the accumulator cannot show:
 * that the phase took real time on a real page at all rather than being counted
 * out in a tight loop.
 */
const FLOOR_RATIO = 0.5;
const CEILING_RATIO = 2;

/** How many frames of slack the accumulator bracket carries at each end. */
const FRAMES_OF_SLACK = 2;

/**
 * The smallest tell the measurement is required to be able to see, as a fraction
 * of the peek pause, and the reason a visit can be rejected before it is
 * believed.
 *
 * **The discriminating assertion is the strict upper bound**, `maxElapsed <
 * PEEK_PAUSE`: the machine cannot pass a duration without firing the step, so an
 * arm paced longer than the peek is caught by however much it was lengthened,
 * less one frame. That is the whole derivation. A peek lengthened by a factor
 * `f` is caught when `f * PEEK_PAUSE - maxStep >= PEEK_PAUSE`, which is
 * `maxStep <= (f - 1) * PEEK_PAUSE`, so requiring a step inside a quarter of the
 * pause is requiring the ability to see a tell of a quarter. The review's tell
 * was thirty percent, and this sees it with margin.
 *
 * The bar has to be a quality gate rather than a constant because the frame rate
 * is not ours. Measured on this machine under three engines at once, WebKit
 * gives the peek four or five frames with a step of 63 to 69 ms, comfortably
 * inside the bar, and occasionally two frames with a step of 188 ms, which is
 * not. A visit that coarse can hide a tell of sixty percent, so it is not
 * asserted on; the arm is simply dealt again.
 *
 * The retry is on the **quality of the measurement** and never on its result: a
 * qualifying visit is accepted whatever it says, and an arm that never yields
 * one fails loudly, with every attempt's numbers in the message, rather than
 * being reported on quietly.
 */
const SMALLEST_TELL = 0.25;

/** How many times an arm is dealt before a starved page is called a failure. */
const MEASURE_ATTEMPTS = 6;

/** Load the shipped page and inject the demonstration hook, alone. */
async function openDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.addScriptTag({ content: await bundleSupport('motion-demo.ts') });
  await page.waitForFunction(() => window.__bjMotionDemo !== undefined, undefined, {
    timeout: PHASE_TIMEOUT,
  });
}

/** Mount one arm of the peek and report the seed the page used. */
async function mountPeek(page: Page, branch: PeekBranch): Promise<number> {
  return page.evaluate((arm: PeekBranch) => {
    const demo = window.__bjMotionDemo;
    if (demo === undefined) {
      throw new Error('the demonstration hook did not install');
    }
    return demo.mountPeek(arm).seed;
  }, branch);
}

/** Begin sampling the machine's phase and accumulator, once per frame. */
async function watchAccumulator(page: Page): Promise<void> {
  await page.evaluate(() => {
    const demo = window.__bjMotionDemo;
    if (demo === undefined) {
      throw new Error('the demonstration hook did not install');
    }
    demo.watchAccumulator();
  });
}

/** Stop the sampler and fold what it saw into one entry per phase visit. */
async function stopAccumulator(page: Page): Promise<readonly PhaseAccumulator[]> {
  return page.evaluate(() => {
    const demo = window.__bjMotionDemo;
    if (demo === undefined) {
      throw new Error('the demonstration hook did not install');
    }
    demo.stopAccumulator();
    return demo.accumulators();
  });
}

/** How many tweens the play surface had in flight on its last frame. */
async function tweens(page: Page): Promise<number> {
  return page.evaluate(() => {
    const demo = window.__bjMotionDemo;
    if (demo === undefined) {
      throw new Error('the demonstration hook did not install');
    }
    return demo.probe().tweensInFlight;
  });
}

const shell = (page: Page) => page.locator('.bj-shell');

test.describe('E6 armour: the demonstration hook deals both arms of the peek', () => {
  test('finds two seeds that really differ in what the peek finds', async () => {
    // In Node, against the same machine the page runs. The arms have to differ,
    // or the capture would be one round photographed twice.
    const branches = peekBranches();
    expect(branches).toHaveLength(2);
    const arms = branches.map((entry) => entry.branch).sort();
    expect(arms).toEqual(['natural', 'none']);
    for (const { branch, seed } of branches) {
      expect(classify(seed), `seed ${String(seed)}`).toBe(branch);
      expect(seed).toBeGreaterThan(0);
    }
  });

  test('mounts each arm on the shipped page and reaches the screens it implies', async ({
    page,
  }) => {
    await openDemo(page);
    for (const { branch, seed } of peekBranches()) {
      const used = await mountPeek(page, branch);
      expect(used, `the page used the ${branch} seed`).toBe(seed);

      await expect(shell(page)).toHaveAttribute('data-phase', 'start', { timeout: PHASE_TIMEOUT });
      await control(page, 'start').click();
      await expect(shell(page)).toHaveAttribute('data-phase', 'betting');
      await page.locator('[data-chip="10"]').click();
      await control(page, 'deal').click();

      // SPEC 4.4's offer is the screen both arms share, and it is a screen with
      // no timer, so it is answered rather than waited out.
      await expect(shell(page)).toHaveAttribute('data-phase', 'insurance', {
        timeout: PHASE_TIMEOUT,
      });
      await pressOn(page, '[data-control="decline-insurance"]', 'insurance');

      // The arms part here, and only here: a found natural settles the round
      // without a player turn, and the other arm hands play to the player.
      const wanted = branch === 'natural' ? 'settling' : 'playerTurn';
      await expect(shell(page)).toHaveAttribute('data-phase', wanted, { timeout: PHASE_TIMEOUT });
    }
  });
});

test.describe('E6 armour: the peek is one duration on both arms, in a real browser', () => {
  test('times both arms to the same constant', async ({ page }) => {
    await openDemo(page);
    const onWallClock = new Map<PeekBranch, number>();
    const onAccumulator = new Map<PeekBranch, PhaseAccumulator>();

    /** Deal one arm once, and report the peek as both clocks saw it. */
    const dealArm = async (
      branch: PeekBranch,
    ): Promise<{ peek: PhaseAccumulator; seconds: number }> => {
      await mountPeek(page, branch);
      await expect(shell(page)).toHaveAttribute('data-phase', 'start', { timeout: PHASE_TIMEOUT });
      // Both installed after the mount, because booting replaces the shell.
      await watchPhases(page);
      await watchAccumulator(page);
      await control(page, 'start').click();
      await page.locator('[data-chip="10"]').click();
      await control(page, 'deal').click();
      // SPEC 4.4 closes the offer **before** the peek, so the peek is the
      // screen after this press and not before it. Both arms pass through it,
      // which is the whole of the clause: the player is looking at the same
      // screen for the same time whatever the dealer is holding.
      await expect(shell(page)).toHaveAttribute('data-phase', 'insurance', {
        timeout: PHASE_TIMEOUT,
      });
      await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
      const after = branch === 'natural' ? 'settling' : 'playerTurn';
      await expect(shell(page)).toHaveAttribute('data-phase', after, { timeout: PHASE_TIMEOUT });

      const visits = await stopAccumulator(page);
      const peek = visits.find((visit) => visit.phase === 'peek');
      expect(peek, `the ${branch} arm ran a peek`).toBeDefined();
      if (peek === undefined) {
        throw new Error('unreachable');
      }
      const seconds = phaseSeconds(await phaseTimings(page), 'peek');
      expect(seconds, `the ${branch} arm was timed`).not.toBeNull();
      return { peek, seconds: seconds ?? 0 };
    };

    /** Whether a visit was sampled finely enough to be worth asserting on. */
    const fineEnough = (peek: PhaseAccumulator): boolean =>
      peek.maxStep > 0 && peek.maxStep <= PEEK_PAUSE * SMALLEST_TELL;

    for (const { branch } of peekBranches()) {
      let measured: { peek: PhaseAccumulator; seconds: number } | null = null;
      const tried: string[] = [];
      for (let attempt = 0; attempt < MEASURE_ATTEMPTS && measured === null; attempt += 1) {
        const dealt = await dealArm(branch);
        tried.push(`${dealt.peek.samples} samples, step ${dealt.peek.maxStep.toFixed(4)}`);
        if (fineEnough(dealt.peek)) {
          measured = dealt;
        }
      }
      expect(
        measured,
        `the ${branch} arm was never sampled finely enough to time the peek: ${tried.join('; ')}`,
      ).not.toBeNull();
      if (measured === null) {
        throw new Error('unreachable');
      }
      onAccumulator.set(branch, measured.peek);
      onWallClock.set(branch, measured.seconds);
    }

    // Each arm against the one constant, on the machine's own clock. The upper
    // bound is strict, because the machine cannot pass a duration without firing
    // the step, so an arm paced by anything longer than the peek breaks it by
    // whatever it was lengthened by. The lower bound carries two frames, for the
    // frame the sampler may not have been scheduled on.
    for (const [branch, peek] of onAccumulator) {
      expect(peek.maxStep, `the ${branch} arm advanced`).toBeGreaterThan(0);
      expect(peek.maxElapsed, `the ${branch} arm ran past the peek pause`).toBeLessThan(PEEK_PAUSE);
      expect(
        peek.maxElapsed + FRAMES_OF_SLACK * peek.maxStep,
        `the ${branch} arm fired before the peek pause was paid`,
      ).toBeGreaterThanOrEqual(PEEK_PAUSE);
      // And the frame that produced those readings is short enough that the
      // upper bound above could have seen a tell of a quarter of the pause,
      // which is what the retry is for. Stated as an assertion so a measurement
      // that quietly lost its discrimination is a failure rather than a pass.
      expect(
        peek.maxStep,
        `the ${branch} arm was measured finely enough to discriminate`,
      ).toBeLessThanOrEqual(PEEK_PAUSE * SMALLEST_TELL);
    }

    // And against each other, to the frame. This is corroboration rather than
    // the discriminator: at the frame rate a loaded page gives, two arms one
    // frame apart are indistinguishable here, and it is the per-arm bound above
    // that catches a tell. It is still worth asserting, because two arms wrong
    // by the same amount would agree with each other and break SPEC 4.4 anyway,
    // and because it is the shape of the clause.
    const natural = onAccumulator.get('natural');
    const none = onAccumulator.get('none');
    expect(natural).toBeDefined();
    expect(none).toBeDefined();
    const frame = Math.max(natural?.maxStep ?? 0, none?.maxStep ?? 0);
    expect(
      Math.abs((natural?.maxElapsed ?? 0) - (none?.maxElapsed ?? 0)),
      'no timing difference between the arms',
    ).toBeLessThanOrEqual(FRAMES_OF_SLACK * frame);

    // The wall clock, loosely, for the one thing the accumulator cannot show:
    // that the screen was really on a page for real time, rather than counted
    // out in a loop. The band is wide on purpose and carries no discrimination.
    for (const [branch, seconds] of onWallClock) {
      expect(seconds, `the ${branch} arm took real time`).toBeGreaterThan(PEEK_PAUSE * FLOOR_RATIO);
      expect(seconds, `the ${branch} arm took real time`).toBeLessThan(PEEK_PAUSE * CEILING_RATIO);
    }
  });
});

test.describe('E6 armour: the motion set is wired into the real page', () => {
  test('has tweens in flight while dealing and none once a screen has settled', async ({
    page,
  }) => {
    await openDemo(page);
    await mountPeek(page, 'none');
    await expect(shell(page)).toHaveAttribute('data-phase', 'start', { timeout: PHASE_TIMEOUT });
    await control(page, 'start').click();
    await page.locator('[data-chip="10"]').click();

    // The chip slide: a stack that has just been built is still arriving.
    await expect.poll(async () => tweens(page), { timeout: PHASE_TIMEOUT }).toBeGreaterThan(0);

    await control(page, 'deal').click();
    // The arc travel: four cards cross the felt over SPEC 5's deal interval.
    await expect.poll(async () => tweens(page), { timeout: PHASE_TIMEOUT }).toBeGreaterThan(0);

    await expect(shell(page)).toHaveAttribute('data-phase', 'insurance', {
      timeout: PHASE_TIMEOUT,
    });
    await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
    await expect(shell(page)).toHaveAttribute('data-phase', 'playerTurn', {
      timeout: PHASE_TIMEOUT,
    });

    // And a settled screen is still. The player's turn has no timer, so nothing
    // on the felt is moving once its cards have landed: a play surface that
    // reported motion here would be animating something nobody asked it to.
    await expect.poll(async () => tweens(page), { timeout: PHASE_TIMEOUT }).toBe(0);
  });
});
