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
import type { GameHarness, HarnessBootOptions, WalletSample } from './game-harness';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** How long a spec waits for a paced phase. SPEC 5's slowest round is seconds. */
export const PHASE_TIMEOUT = 20_000;

let bundled: Promise<string> | undefined;

function bundle(): Promise<string> {
  bundled ??= buildHarness();
  return bundled;
}

async function buildHarness(): Promise<string> {
  const result: unknown = await build({
    root: PROJECT_ROOT,
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: {
        entry: join(PROJECT_ROOT, 'tests', 'browser', 'support', 'game-harness.ts'),
        name: 'BJGameHarness',
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
  throw new Error('the game harness bundled to no chunk');
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
