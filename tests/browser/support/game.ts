/**
 * Shared helpers for the three chrome specs. Support for `B15`, `C5` and `C8`.
 *
 * Every spec here drives the **built** `dist/`, served by `vite preview`, which
 * is the whole claim of item `A2`: what ships is a directory of static files.
 * Two routes into it, and each spec says which of them it is using:
 *
 *   - **the shipped page**, loaded and driven through its own controls, with
 *     nothing injected. Everything a Bronze table can reach is asserted this
 *     way, because that is the game as a player receives it.
 *   - **the shipped page with `game-harness.ts` injected**, for the clauses that
 *     need a known deal or a table SPEC 6 has not unlocked yet. The harness is
 *     bundled at test time and never ships; its own header says why it exists
 *     and what it costs.
 *
 * The harness is bundled once per worker, exactly as `render-surface.spec.ts`
 * bundles the render demo.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, type Locator, type Page } from '@playwright/test';
import { build } from 'vite';

import type { PhaseKind } from '../../../src/core/types';
import type {
  GameHarness,
  HarnessBootOptions,
  MotionSample,
  PhaseTiming,
  WalletSample,
} from './game-harness';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** How long a spec waits for a paced phase. SPEC 5's slowest round is seconds. */
export const PHASE_TIMEOUT = 20_000;

const bundled = new Map<string, Promise<string>>();

/**
 * One support module, bundled for the page and cached per worker.
 *
 * Parameterised because `BJ-14` added a second injectable module and a second
 * copy of this function would be a second place the build options could drift.
 * **Only ever inject one of them into a page.** Each bundle carries its own copy
 * of the composition root, and a copy holds its own record of the game it last
 * built, so two on one page would run two frame loops over one canvas with
 * neither able to dispose the other.
 */
export function bundleSupport(entry: string): Promise<string> {
  const held = bundled.get(entry);
  if (held !== undefined) {
    return held;
  }
  const built = buildSupport(entry);
  bundled.set(entry, built);
  return built;
}

function bundle(): Promise<string> {
  return bundleSupport('game-harness.ts');
}

async function buildSupport(entry: string): Promise<string> {
  const result: unknown = await build({
    root: PROJECT_ROOT,
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: {
        entry: join(PROJECT_ROOT, 'tests', 'browser', 'support', entry),
        name: 'BJSupport',
        formats: ['iife'],
      },
    },
  });

  const outputs = Array.isArray(result) ? result : [result];
  for (const candidate of outputs) {
    const chunks = (candidate as { output?: unknown[] }).output;
    if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        const emitted = chunk as { type?: string; code?: string };
        if (emitted.type === 'chunk' && typeof emitted.code === 'string') {
          return emitted.code;
        }
      }
    }
  }
  throw new Error(`${entry} bundled to no chunk`);
}

/** Load the shipped page and drive it as it ships. No injection at all. */
export async function openShippedPage(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.bj-shell')).toBeVisible();
}

/** Load the shipped page, then boot a game with known options over it. */
export async function bootGame(page: Page, options: HarnessBootOptions = {}): Promise<void> {
  await page.goto('/');
  await page.addScriptTag({ content: await bundle() });
  await page.waitForFunction(() => window.__bjGame !== undefined, undefined, {
    timeout: PHASE_TIMEOUT,
  });
  await page.evaluate((given: HarnessBootOptions) => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('the harness did not install');
    }
    api.boot(given);
  }, options);
}

/** The machine's snapshot. Only available on a harness-booted page. */
export async function readout(page: Page): Promise<ReturnType<GameHarness['readout']>> {
  return page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    return api.readout();
  });
}

/** What the composition root holds beside the machine. SPEC 13's set. */
export async function session(page: Page): Promise<ReturnType<GameHarness['session']>> {
  return page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    return api.session();
  });
}

/** Start the per-frame wallet sampler. See `WalletSample` in the harness. */
export async function watchWallet(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    api.watch();
  });
}

/** Everything the sampler has recorded, oldest first. */
export async function walletSamples(page: Page): Promise<readonly WalletSample[]> {
  return page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    return api.samples();
  });
}

/** The shell, which carries the current phase for CSS and for a wait. */
export function shell(page: Page): Locator {
  return page.locator('.bj-shell');
}

/** Wait until SPEC 10's phase is the one named. */
export async function waitForPhase(page: Page, kind: PhaseKind): Promise<void> {
  await expect(shell(page)).toHaveAttribute('data-phase', kind, { timeout: PHASE_TIMEOUT });
}

/** How long one press waits before re-reading the screen, and how often. */
const PRESS_TIMEOUT = 2000;
const PRESS_RETRY = 120;
const PRESS_ATTEMPTS = 8;

/**
 * Press a control, but only while the screen it belongs to is still showing.
 *
 * **A press is queued and drained on the next frame, so the screen a poll saw is
 * not always the screen the click lands on.** DESIGN section 3 applies at most
 * one accepted intent per frame, and the chrome hides a screen the moment its
 * phase ends, so a control read as present can be gone a frame later. Playwright
 * then waits for an element that will never be visible again, which is a
 * thirty-second hang rather than a failure with a reason.
 *
 * So the press is bounded and re-checks: if the screen has gone it reports that
 * it did not press, and the caller polls on. It never swallows the failure, and
 * a control that stays present and stays unclickable still raises the browser's
 * own error rather than a message invented here.
 *
 * Returns whether the control was actually pressed.
 */
export async function pressOn(page: Page, selector: string, phase: PhaseKind): Promise<boolean> {
  let failure: unknown = null;
  for (let attempt = 0; attempt < PRESS_ATTEMPTS; attempt += 1) {
    if ((await shell(page).getAttribute('data-phase')) !== phase) {
      return false;
    }
    try {
      await page.locator(selector).click({ timeout: PRESS_TIMEOUT });
      return true;
    } catch (error) {
      failure = error;
      await page.waitForTimeout(PRESS_RETRY);
    }
  }
  throw failure instanceof Error
    ? failure
    : new Error(`${selector} stayed unpressable on the ${phase} screen`);
}

/** One readout of SPEC 11, by its key. */
export function readoutValue(page: Page, key: string): Locator {
  return page.locator(`[data-readout="${key}"] .bj-readout__value`);
}

/**
 * A number as the page rendered it, read back as a number.
 *
 * QUALITY-BAR section 11 warns that several locales group with U+202F rather
 * than a plain space, so a spec comparing raw strings would be asserting the
 * grouping rather than the value. The locale is pinned in `playwright.config.ts`
 * as that section asks, and this strips whatever the formatter produced anyway.
 */
export function numberFrom(text: string | null): number {
  // U+2212 MINUS SIGN, written as an escape because this repository is ASCII
  // only: several locales sign a negative number with it rather than a hyphen.
  const digits = (text ?? '').replace(/\u2212/g, '-').replace(/[^\d.-]/g, '');
  const value = Number(digits);
  if (!Number.isFinite(value)) {
    throw new Error(`no number in ${JSON.stringify(text)}`);
  }
  return value;
}

/** The number a locator renders. */
export async function numberIn(locator: Locator): Promise<number> {
  return numberFrom(await locator.textContent());
}

/** One chip control of SPEC 4.11's four. */
export function chip(page: Page, denomination: 10 | 50 | 100 | 500): Locator {
  return page.locator(`[data-chip="${String(denomination)}"]`);
}

/** One named control, by the `data-control` it carries. */
export function control(page: Page, name: string): Locator {
  return page.locator(`[data-control="${name}"]`);
}

/** The refusal notice. Empty until something is refused. */
export function notice(page: Page): Locator {
  return page.locator('[data-notice="reason"]');
}

/**
 * The four terms of SPEC 4.11's identity, and the sum the wallet publishes.
 *
 * Both, not one: `conserved` is the wallet's own arithmetic and the four terms
 * are what it is arithmetic over, so a spec that read only the sum would pass
 * while the sum lied.
 */
export interface Conserved {
  readonly chips: number;
  readonly committed: number;
  readonly insuranceStake: number;
  readonly deferredStake: number;
  readonly conserved: number;
}

export async function conserved(page: Page): Promise<Conserved> {
  const snapshot = await readout(page);
  const { chips, committed, insuranceStake, deferredStake, conserved: published } = snapshot.wallet;
  return { chips, committed, insuranceStake, deferredStake, conserved: published };
}

/** `chips + committed + insuranceStake - deferredStake`, computed here. */
export function sumOf(terms: Conserved): number {
  return terms.chips + terms.committed + terms.insuranceStake - terms.deferredStake;
}

// ---------------------------------------------------------------------------
// BJ-14: the motion trace, and the shipped page's own phase timings
// ---------------------------------------------------------------------------

/** What the last frame resolved for motion. Items `E7` and `E9`. */
export async function motionProbe(page: Page): Promise<ReturnType<GameHarness['motion']>> {
  return page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    return api.motion();
  });
}

/** Start the per-frame motion sampler. See `MotionSample` in the harness. */
export async function traceMotion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    api.trace();
  });
}

/** Stop the sampler and take everything it recorded, oldest first. */
export async function motionTrace(page: Page): Promise<readonly MotionSample[]> {
  return page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    api.stopTrace();
    return api.motionTrace();
  });
}

/**
 * Watch the **shipped** page's phase attribute and record when each screen
 * arrived. Nothing is injected and nothing is booted from source.
 *
 * This is the route item `E9`'s behavioural clause takes: the Speed setting has
 * to reach the machine inside `dist/`, driven through the Settings control a
 * player uses, and a wall clock is the only instrument that can see that from
 * outside the bundle. The exact "every pacing constant times 0.6" clause takes
 * the harness route instead, and the spec says which is which.
 */
export async function watchPhases(page: Page): Promise<void> {
  await page.evaluate(() => {
    const shell = document.querySelector('.bj-shell');
    if (shell === null) {
      throw new Error('no shell on this page');
    }
    const log: PhaseTiming[] = [];
    const record = (): void => {
      const phase = shell.getAttribute('data-phase') ?? '';
      if (log[log.length - 1]?.phase !== phase) {
        log.push({ phase, at: performance.now() });
      }
    };
    record();
    new MutationObserver(record).observe(shell, {
      attributes: true,
      attributeFilter: ['data-phase'],
    });
    window.__bjPhaseLog = log;
  });
}

/** Everything `watchPhases` has recorded, oldest first. */
export async function phaseTimings(page: Page): Promise<readonly PhaseTiming[]> {
  return page.evaluate(() => window.__bjPhaseLog ?? []);
}

/**
 * How long one screen lasted, in seconds, from a recorded log.
 *
 * The last entry has no successor and therefore no duration, which is what
 * `null` means. A phase entered twice reports its first visit; every use below
 * is inside one round, where each timed phase is entered once.
 */
export function phaseSeconds(log: readonly PhaseTiming[], phase: PhaseKind): number | null {
  const index = log.findIndex((entry) => entry.phase === phase);
  const next = index < 0 ? undefined : log[index + 1];
  const here = index < 0 ? undefined : log[index];
  if (here === undefined || next === undefined) {
    return null;
  }
  return (next.at - here.at) / 1000;
}

/** Boot, leave SPEC 10's start screen, and arrive at the betting phase. */
export async function atBetting(page: Page, options: HarnessBootOptions = {}): Promise<void> {
  await bootGame(page, options);
  await waitForPhase(page, 'start');
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
}

/** The same, on the shipped page with nothing injected. Bronze, 1,000 chips. */
export async function atShippedBetting(page: Page): Promise<void> {
  await openShippedPage(page);
  await waitForPhase(page, 'start');
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
}
