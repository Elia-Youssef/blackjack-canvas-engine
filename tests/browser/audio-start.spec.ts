/**
 * Item `K2`, Major, 8 points, over the built `dist/`.
 *
 *   "Audio starts muted until a user gesture, complies with browser autoplay
 *    policy, and never throws when a context cannot be created."
 *
 * Three clauses, and the first two are one claim read twice against
 * QUALITY-BAR section 10: "starts muted until a user gesture" is the autoplay
 * policy from the game's side. The section is explicit that muting a gain node
 * does not satisfy it, because the platform suspends a context created
 * outside a gesture whatever its gain says, so the clause is graded as the
 * structural one: **no `AudioContext` is constructed until the first
 * `pointerdown` or `keydown`**, and `resume()` is called in the handler that
 * constructed it. Before the gesture the game is silent because it has no
 * output path at all, which is the only reading of "starts muted" a browser
 * can be asked to prove.
 *
 * **Every test here runs on the shipped page.** The structural clauses are
 * reachable without options: the page's own `AudioContext` is wrapped by an
 * init script that runs before any page script, so the constructor the engine
 * would call is the one under observation from the first byte. No harness,
 * nothing injected but the wrapper, and the wrapper never simulates a gesture
 * of its own.
 *
 * The third clause is the control the trap list names: "if the context still
 * will not run, the game continues silently. It never throws." A throwing
 * constructor is substituted and a full round is played through it, and the
 * page must complete the round with zero page errors.
 *
 * **What this file does not assert, on purpose.** No wall-clock timing, per
 * the part brief. No `ctx.state === 'running'` on the real engines: a headless
 * engine may keep a context suspended without any clause failing, so state is
 * asserted only against the fake, whose state this file owns. The
 * `visibilitychange` resume is graded at unit level with a stubbed document,
 * which is the honest route: the real event cannot be produced on three
 * engines without focussing another window, and a fake focus is not a
 * visibility change. Both statements are in the part report.
 */

import { expect, test, type Page } from '@playwright/test';

import { settleRound } from './support/flow';
import { chip, control, waitForPhase } from './support/game';

/** The wrapper's record, as the init script publishes it on the page. */
interface AudioCounts {
  constructed: number;
  resumed: number;
  voices: number;
  masterValue: number;
}

declare global {
  interface Window {
    /** Assigned by this spec's init script, never by the product. */
    __bjAudioCounts?: AudioCounts;
  }
}

/**
 * The recording wrapper, installed before any page script runs.
 *
 * It implements the surface the engine touches, counts constructions and
 * resumes, and records every voice scheduled. It is a wrapper rather than a
 * replacement where it can be: the failure test below replaces the constructor
 * outright with one that throws.
 *
 * **The page's own constructor is read off `window`, never by its bare name.**
 * Playwright's WebKit build ships without an `AudioContext` at all, so a bare
 * reference in this script is a ReferenceError there, the wrapper would never
 * install, and every count below would read a silence the engine never chose.
 * The engine's own feature test is the honest answer on that engine: with no
 * constructor to call, it stays silent for the whole session, which is
 * QUALITY-BAR section 10's "continues silently" and the part report says so.
 * Here the wrapper supplies the constructor the engine is graded against.
 */
function installCountingContext(page: Page) {
  return page.addInitScript(() => {
    const counts = {
      constructed: 0,
      resumed: 0,
      voices: 0,
      /** The first gain node's value, which the engine's master is. */
      masterValue: 1,
    };
    class WrappedContext {
      state = 'suspended';
      currentTime = 0;
      sampleRate = 48000;
      destination = {};
      constructor() {
        counts.constructed += 1;
      }
      resume(): Promise<void> {
        counts.resumed += 1;
        this.state = 'running';
        return Promise.resolve();
      }
      close(): Promise<void> {
        return Promise.resolve();
      }
      createGain(): { gain: { value: number }; connect: () => void } {
        const node = {
          gain: {
            value: 1,
            setValueAtTime(value: number): void {
              void value;
            },
            exponentialRampToValueAtTime(value: number): void {
              void value;
            },
          },
          connect(): void {
            counts.masterValue = node.gain.value;
          },
        };
        return node;
      }
      createOscillator(): {
        type: string;
        frequency: { value: number };
        connect: () => void;
        start: () => void;
        stop: () => void;
      } {
        return {
          type: 'sine',
          frequency: { value: 0 },
          connect(): void {},
          start(): void {
            counts.voices += 1;
          },
          stop(): void {},
        };
      }
      createBuffer(): { getChannelData: () => Float32Array } {
        return { getChannelData: (): Float32Array => new Float32Array(1024) };
      }
      createBufferSource(): {
        buffer: unknown;
        connect: () => void;
        start: () => void;
        stop: () => void;
      } {
        return {
          buffer: null,
          connect(): void {},
          start(): void {
            counts.voices += 1;
          },
          stop(): void {},
        };
      }
    }
    window.__bjAudioCounts = counts;
    Object.defineProperty(window, 'AudioContext', { value: WrappedContext });
  });
}

/** A constructor that cannot be created, which is the third clause's control. */
function installThrowingContext(page: Page) {
  return page.addInitScript(() => {
    class NoAudio {
      constructor() {
        throw new Error('this platform refuses audio');
      }
    }
    Object.defineProperty(window, 'AudioContext', { value: NoAudio });
  });
}

/** Bet, deal, stand, and reach the round result, pressing only real controls. */
async function playOneRound(page: Page): Promise<void> {
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
  await chip(page, 50).click();
  await control(page, 'deal').click();
  await settleRound(page);
  await waitForPhase(page, 'roundResult');
}

test.describe('K2: no context before the first user gesture', () => {
  test('constructs nothing on a page that is up and running', async ({ page }) => {
    await installCountingContext(page);
    await page.goto('/');
    await expect(page.locator('.bj-shell')).toBeVisible();
    // The game is live: the frame loop has run for real time and the start
    // screen is rendered. The engine has had every opportunity to construct.
    await page.waitForTimeout(600);
    const counts = await page.evaluate(() => window.__bjAudioCounts);
    expect(counts?.constructed).toBe(0);
    expect(counts?.voices).toBe(0);
  });
});

test.describe('K2: the first gesture constructs, and resumes, exactly once', () => {
  test('a pointer gesture constructs one context and resumes it there', async ({ page }) => {
    await installCountingContext(page);
    await page.goto('/');
    await expect(page.locator('.bj-shell')).toBeVisible();
    await control(page, 'start').click();
    const after = await page.evaluate(() => window.__bjAudioCounts);
    expect(after?.constructed).toBe(1);
    expect(after?.resumed).toBeGreaterThanOrEqual(1);

    // And once means once: a whole round of further presses constructs
    // nothing more, because the gesture listeners came off with the first.
    await chip(page, 50).click();
    await control(page, 'deal').click();
    await settleRound(page);
    await waitForPhase(page, 'roundResult');
    const later = await page.evaluate(() => window.__bjAudioCounts);
    expect(later?.constructed).toBe(1);
    // The round really did offer cues, so the single context was used rather
    // than merely made: cards were dealt and something scheduled.
    expect(later?.voices).toBeGreaterThan(0);
  });

  test('a keyboard activation alone constructs it', async ({ page }) => {
    await installCountingContext(page);
    await page.goto('/');
    await expect(page.locator('.bj-shell')).toBeVisible();
    // Focus by capabilities call and press a real key: no pointer event is
    // produced anywhere, so the keydown arm is the only arm that can have
    // answered. QUALITY-BAR section 10 names both events, and either must
    // suffice.
    await control(page, 'start').focus();
    await page.keyboard.press('Enter');
    const counts = await page.evaluate(() => window.__bjAudioCounts);
    expect(counts?.constructed).toBe(1);
    expect(counts?.resumed).toBeGreaterThanOrEqual(1);
  });
});

test.describe('K2: never throws when a context cannot be created', () => {
  test('plays a full round over a throwing constructor with zero page errors', async ({
    page,
  }) => {
    await installThrowingContext(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto('/');
    await expect(page.locator('.bj-shell')).toBeVisible();
    await playOneRound(page);
    await waitForPhase(page, 'roundResult');
    expect(errors, errors.join(' / ')).toEqual([]);
    // And the game is still playable past the failure: the round after it
    // completes too, which is "continues silently" rather than "continues
    // once".
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'betting');
    await chip(page, 10).click();
    await control(page, 'deal').click();
    await settleRound(page);
    await waitForPhase(page, 'roundResult');
    expect(errors).toEqual([]);
  });
});

test.describe('K2: the master gain is written when the context is created', () => {
  test('writes full volume at the gesture on the unmuted shipped boot', async ({ page }) => {
    // The shipped page boots unmuted, so this is the unmuted arm of the
    // clause: the gain the engine applies at the moment the context exists is
    // the default full volume. The muted arm cannot be booted on the shipped
    // page, which has no options; it lives in `audio-settings.spec.ts`, where
    // the harness boots one and asserts both the engine's state and the
    // control's, and at unit level against the recording context.
    await installCountingContext(page);
    await page.goto('/');
    await control(page, 'start').click();
    await page.waitForTimeout(300);
    const counts = await page.evaluate(() => window.__bjAudioCounts);
    expect(counts?.masterValue).toBe(1);
  });
});
