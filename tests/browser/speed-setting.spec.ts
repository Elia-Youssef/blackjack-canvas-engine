/**
 * Item `E9`, Minor, 5 points, over the built `dist/`.
 *
 *   "The Speed setting multiplies every pacing constant by 0.6 on Fast, applies
 *    in both motion modes, persists, and changes neither the sequence of states
 *    nor any outcome."
 *
 * Five clauses. Four are graded here and the fifth is an openly parked ruling.
 *
 *   1. **"multiplies every pacing constant by 0.6 on Fast"** is asserted twice,
 *      once exactly and once behaviourally, because neither alone is enough. The
 *      exact half reads the resolved pacing table by name and requires every
 *      entry at Fast to be its Normal entry times 0.6, with the key set compared
 *      against the module's own list so a constant cannot drop out of the sweep.
 *      The behavioural half measures a real phase on the wall clock, driven
 *      through the Settings control a player uses, because a correct table over
 *      a machine that ignored the setting would pass the exact half alone.
 *   2. **"applies in both motion modes"** is every test below running under
 *      `prefers-reduced-motion: no-preference` and again under `reduce`. The
 *      page reports which mode it resolved, so a run cannot emulate one mode and
 *      measure another.
 *   3. **"persists"** is **not graded here**. It was ruled on 2026-08-24, with
 *      the user's approval, to close at `BJ-20`'s reload specs, where SPEC 13's
 *      document is wired into `boot` and items `I4` and `I5` grade the reload
 *      flows; nothing imports `src/storage/` before that part. What `BJ-14`
 *      ships toward it is a setting whose only home is the machine, exposed in a
 *      serialisable shape on `SessionState.speed`, so the restore has one place
 *      to read and one place to write. This is the same treatment `J5`'s reload
 *      clause and `E6`'s capture take, and it is stated in the part report.
 *   4. **"changes neither the sequence of states"** is one seeded round driven at
 *      each speed with the same presses, its screen sequence compared element for
 *      element.
 *   5. **"nor any outcome"** is SPEC 10's round result payload from the same two
 *      rounds, compared whole.
 *
 * A sixth property is asserted because SPEC 14 states it and nothing else would:
 * Speed "takes effect immediately, mid-round included, because neither can
 * change an outcome". One round is dealt at Normal, switched to Fast while the
 * player is deciding, and its later phases are required to run at the new pace.
 *
 * **Routes.** The wall-clock and mid-round tests run on the shipped page with
 * nothing injected, driven through the Settings control. The exact pacing table
 * and the seeded comparison need a known deal and the machine's own snapshot, so
 * they take the harness route `BJ-15` landed and documented.
 */

import { expect, test, type Page } from '@playwright/test';

import { PACING, PACING_NAMES } from '../../src/render/animate';
import { FAST_SPEED_MULTIPLIER } from '../../src/core/table';
import type { PhaseKind } from '../../src/core/types';
import {
  atBetting,
  atShippedBetting,
  chip,
  control,
  motionProbe,
  motionTrace,
  pressOn,
  phaseSeconds,
  phaseTimings,
  readout,
  traceMotion,
  waitForPhase,
  watchPhases,
} from './support/game';

const SEED = 53;
const WAGER = 50;

/** Both arms of the media query. Clause 2 is every test running under each. */
const MODES = ['no-preference', 'reduce'] as const;
type Mode = (typeof MODES)[number];

const RESOLVED: Readonly<Record<Mode, string>> = { 'no-preference': 'full', reduce: 'reduce' };

/** SPEC 4.3 deals four cards, so `dealing` is four intervals and no more. */
const DEAL_STEPS = 4;

/**
 * How a wall-clock reading of a paced phase is judged, and why it is a ratio.
 *
 * **The absolute reading is noisy and the ratio between two of them is not.**
 * DESIGN section 3 drains the intents and then calls `update(dt)`, so the frame
 * that enters a phase feeds its own delta into the new phase's accumulator while
 * the attribute this measurement watches is written at the end of that frame:
 * the observed window is the real duration plus or minus about a frame at each
 * edge, and on a machine running three engines at once a frame is not 16 ms.
 * That overhead is roughly the same for both readings, so it cancels in their
 * ratio and does not cancel in either bound.
 *
 * So each test below measures **the same phase twice**, once at each Speed, in
 * the same browser under the same load, and holds their ratio to a band around
 * SPEC 5's 0.6. A machine that ignored the setting reads 1.0, which is far
 * outside the band; the band's width is what an added tenth of a second on both
 * readings does to the quotient, which is to raise it, never to lower it.
 *
 * `FLOOR_RATIO` is the one absolute bound that survives, and it is a proportion
 * for the same reason: under load a browser delivers animation frames in bursts
 * whose timestamps run ahead of the wall clock, so the accumulator is paid
 * faster than this observer's clock records and a phase can read as little as
 * five sixths of its duration. A reading below seven tenths of it means the
 * pacing is not being counted at all, which is a different defect.
 */
const RATIO_LOW = 0.4;
const RATIO_HIGH = 0.8;
const FLOOR_RATIO = 0.7;

/** Open Settings, choose a speed, and close it again. The player's route. */
async function chooseSpeed(page: Page, speed: 'normal' | 'fast'): Promise<void> {
  await page.locator('[data-open-overlay="settings"]').click();
  await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
  const button = page.locator(`[data-speed="${speed}"]`);
  await expect(button).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await control(page, 'close-overlay').click();
  await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();
  // The shell reports what the frame resolved, which is a different attribute
  // from the control's own, so this is the round trip and not the click again.
  await expect(page.locator('.bj-shell')).toHaveAttribute('data-motion-speed', speed);
}

/** How long a drive loop will poll a paced round before failing loudly. */
const DRIVE_STEPS = 200;
const DRIVE_PAUSE = 100;

/**
 * Answer every screen that waits for the player until the round reaches
 * `target`, and report the screen it stopped on.
 *
 * A poll rather than a chain of waits, and that is not laziness. The shipped
 * page deals an unseeded round, so which screens it passes through is not known
 * in advance: SPEC 4.4's offer appears only against an Ace, the peek runs
 * against an Ace or a ten, and either can settle the round before the player
 * acts at all. A chain of waits has to guess the sequence, and a wait written
 * for one sequence sits on a screen the round never left.
 */
async function driveTo(page: Page, target: PhaseKind): Promise<PhaseKind> {
  const shell = page.locator('.bj-shell');
  for (let step = 0; step < DRIVE_STEPS; step += 1) {
    const phase = (await shell.getAttribute('data-phase')) ?? '';
    if (phase === target) {
      return target;
    }
    if (phase === 'roundResult') {
      // The round settled before reaching the target. The caller decides what
      // that means; it is a legal round either way.
      return 'roundResult';
    }
    if (phase === 'insurance') {
      // `pressOn` presses only while the screen is still up and reports back if
      // it has gone, which is what keeps this poll from clicking a control the
      // round has already left behind. Its own header has the reasoning.
      await pressOn(page, '[data-control="decline-insurance"]', 'insurance');
      await page.waitForTimeout(DRIVE_PAUSE);
      continue;
    }
    if (phase === 'playerTurn') {
      await pressOn(page, '[data-action="stand"]', 'playerTurn');
      await page.waitForTimeout(DRIVE_PAUSE);
      continue;
    }
    await page.waitForTimeout(DRIVE_PAUSE);
  }
  throw new Error(`the round did not reach ${target}`);
}

/** Bet and deal, then stand out the round and stop at the round result. */
async function playRound(page: Page): Promise<void> {
  await chip(page, WAGER).click();
  await control(page, 'deal').click();
  await driveTo(page, 'roundResult');
  await waitForPhase(page, 'roundResult');
}

test.describe('E9: Fast multiplies every pacing constant by 0.6', () => {
  for (const mode of MODES) {
    test(`resolves the whole pacing table times 0.6 under ${mode}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: mode });
      await atBetting(page, { seed: SEED });
      await expect(page.locator('.bj-shell')).toHaveAttribute('data-motion', RESOLVED[mode]);

      const normal = await motionProbe(page);
      expect(normal.speed).toBe('normal');
      expect(normal.reducedMotion).toBe(mode === 'reduce');

      await chooseSpeed(page, 'fast');
      const fast = await motionProbe(page);
      expect(fast.speed).toBe('fast');
      // The mode did not move when the speed did. Clause 2 is that the
      // multiplier applies in the mode the page is actually in.
      expect(fast.reducedMotion).toBe(normal.reducedMotion);

      // Every constant, by the module's own list, so one cannot fall out of the
      // sweep by being forgotten here.
      const names = [...PACING_NAMES].sort();
      expect(Object.keys(normal.pacing).sort()).toEqual(names);
      expect(Object.keys(fast.pacing).sort()).toEqual(names);
      expect(names.length).toBeGreaterThanOrEqual(11);

      for (const name of names) {
        const base = normal.pacing[name];
        const scaled = fast.pacing[name];
        expect(base, name).toBe(PACING[name]);
        expect(scaled, name).toBeCloseTo((base ?? 0) * FAST_SPEED_MULTIPLIER, 12);
        // And Fast is genuinely shorter, not merely a different number.
        expect(scaled ?? 0, name).toBeLessThan(base ?? 0);
      }
    });
  }
});

test.describe('E9: the setting reaches the machine, measured on the wall clock', () => {
  for (const mode of MODES) {
    test(`shortens a real phase by the multiplier under ${mode}`, async ({ page }) => {
      // The shipped page, driven through its own controls. No harness at all:
      // this is the clause that a correct table over an indifferent machine
      // would otherwise pass.
      await page.emulateMedia({ reducedMotion: mode });
      await atShippedBetting(page);
      await expect(page.locator('.bj-shell')).toHaveAttribute('data-motion', RESOLVED[mode]);

      await watchPhases(page);
      await playRound(page);
      const atNormal = phaseSeconds(await phaseTimings(page), 'dealing');
      expect(atNormal, 'the deal was timed').not.toBeNull();

      await control(page, 'next-hand').click();
      await waitForPhase(page, 'betting');
      await chooseSpeed(page, 'fast');
      await watchPhases(page);
      await playRound(page);
      const atFast = phaseSeconds(await phaseTimings(page), 'dealing');
      expect(atFast, 'the second deal was timed').not.toBeNull();

      const wantNormal = PACING.dealInterval * DEAL_STEPS;
      const wantFast = wantNormal * FAST_SPEED_MULTIPLIER;
      // Neither reading may be shorter than the accumulator it is counting.
      expect(atNormal ?? 0, 'the deal at Normal').toBeGreaterThan(wantNormal * FLOOR_RATIO);
      expect(atFast ?? 0, 'the deal at Fast').toBeGreaterThan(wantFast * FLOOR_RATIO);
      // And the measurement itself: the same four-card deal, timed twice in one
      // browser, one Speed apart. A machine that ignored the setting reads 1.
      const ratio = (atFast ?? 0) / (atNormal ?? 1);
      expect(ratio, 'the Fast deal against the Normal one').toBeGreaterThan(RATIO_LOW);
      expect(ratio, 'the Fast deal against the Normal one').toBeLessThan(RATIO_HIGH);
      expect(FAST_SPEED_MULTIPLIER).toBeGreaterThan(RATIO_LOW);
      expect(FAST_SPEED_MULTIPLIER).toBeLessThan(RATIO_HIGH);
    });
  }
});

test.describe('E9: Speed changes neither the sequence of states nor any outcome', () => {
  for (const mode of MODES) {
    test(`plays one seeded round identically at both speeds under ${mode}`, async ({ browser }) => {
      const play = async (speed: 'normal' | 'fast'): Promise<{
        states: string[];
        result: unknown;
        seconds: number;
      }> => {
        const context = await browser.newContext({ reducedMotion: mode });
        const page = await context.newPage();
        await page.emulateMedia({ reducedMotion: mode });
        await atBetting(page, { seed: SEED });
        if (speed === 'fast') {
          await chooseSpeed(page, 'fast');
        }
        await traceMotion(page);
        await chip(page, WAGER).click();
        await control(page, 'deal').click();
        await waitForPhase(page, 'playerTurn');
        await page.locator('[data-action="stand"]').click();
        await waitForPhase(page, 'roundResult');
        const trace = await motionTrace(page);
        const snapshot = await readout(page);
        await context.close();

        const states: string[] = [];
        for (const sample of trace) {
          expect(sample.speed).toBe(speed);
          if (states[states.length - 1] !== sample.phase) {
            states.push(sample.phase);
          }
        }
        const first = trace[0];
        const last = trace[trace.length - 1];
        return {
          states,
          result: snapshot.phase.kind === 'roundResult' ? snapshot.phase.result : null,
          seconds: ((last?.at ?? 0) - (first?.at ?? 0)) / 1000,
        };
      };

      const normal = await play('normal');
      const fast = await play('fast');

      expect(fast.states, 'the same screens, in the same order').toEqual(normal.states);
      expect(normal.states.length, 'the round really moved through screens').toBeGreaterThan(3);
      expect(normal.result, 'the round settled').not.toBeNull();
      expect(fast.result, 'the same outcome').toEqual(normal.result);
      // The control: the two runs did differ, in the one thing Speed is allowed
      // to change. Without it the comparison above would hold over a setting
      // that did nothing at all.
      expect(fast.seconds, 'Fast really was faster').toBeLessThan(normal.seconds);
    });
  }
});

test.describe('E9 and SPEC 14: Speed takes effect immediately, mid-round included', () => {
  test('switches during the player turn and paces the rest of the round at Fast', async ({
    page,
  }) => {
    // The shipped page, driven through its own controls. Two rounds, and the
    // switch happens **inside** the second one, while the player is deciding:
    // SPEC 14 says Speed "takes effect immediately, mid-round included, because
    // neither can change an outcome", and a setting that waited for the round
    // boundary would reveal at the same pace as the round before it.
    //
    // The reveal is the phase timed, because it is the first paced screen after
    // the player acts, and it is timed twice so the comparison is a ratio in one
    // browser under one load rather than two absolute readings.
    await atShippedBetting(page);

    /**
     * Deal until a round reaches the player's turn, then stand and report how
     * long the reveal took.
     *
     * An unseeded round can settle before the player acts at all, on a dealer
     * natural or a player one, and there is nothing to switch mid-round in a
     * round with no middle. The phase log is restarted per attempt, so the
     * reveal that is timed belongs to the round that was actually played.
     */
    const revealSeconds = async (switchMidRound: boolean): Promise<number> => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await watchPhases(page);
        await chip(page, WAGER).click();
        await control(page, 'deal').click();
        if ((await driveTo(page, 'playerTurn')) === 'playerTurn') {
          if (switchMidRound) {
            await chooseSpeed(page, 'fast');
          }
          await pressOn(page, '[data-action="stand"]', 'playerTurn');
          await waitForPhase(page, 'roundResult');
          const seconds = phaseSeconds(await phaseTimings(page), 'reveal');
          await control(page, 'next-hand').click();
          await waitForPhase(page, 'betting');
          if (seconds !== null) {
            return seconds;
          }
          continue;
        }
        await control(page, 'next-hand').click();
        await waitForPhase(page, 'betting');
      }
      throw new Error('no round reached the player turn with a reveal to time');
    };

    const atNormal = await revealSeconds(false);
    const atFast = await revealSeconds(true);

    // Neither reading may be shorter than the accumulator it is counting.
    expect(atNormal, 'the reveal at Normal').toBeGreaterThan(PACING.revealPause * FLOOR_RATIO);
    expect(atFast, 'the reveal after the mid-round switch').toBeGreaterThan(
      PACING.revealPause * FAST_SPEED_MULTIPLIER * FLOOR_RATIO,
    );

    // And the measurement: the same reveal, timed twice, with the only
    // difference a control pressed while the second round was already running.
    const ratio = atFast / atNormal;
    expect(ratio, 'the reveal after the switch against the reveal before it').toBeGreaterThan(
      RATIO_LOW,
    );
    expect(ratio, 'the reveal after the switch against the reveal before it').toBeLessThan(
      RATIO_HIGH,
    );
    // The discriminator, stated: a setting deferred to the round boundary would
    // have revealed at the unscaled pause and read a ratio of one.
    expect(RATIO_HIGH).toBeLessThan(1);
  });
});
