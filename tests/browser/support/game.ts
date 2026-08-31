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

/** How many scripts this worker has served, so each gets a URL of its own. */
let served = 0;

/**
 * Add one test-time script to the page, through a route rather than inline.
 *
 * **This exists because the shipped page carries a Content Security Policy.**
 * `BJ-21`, item `L2`: `dist/index.html` opens with
 * `script-src 'self'`, so a script element whose body is inline text is blocked
 * by the page the gate is supposed to be grading. `page.addScriptTag({ content
 * })` builds exactly that element, which is why every call site now comes
 * through here.
 *
 * The route serves the same bundle from a same-origin URL, which the policy
 * allows, so the injection is legal under the shipped directives rather than
 * being excused from them: **nothing in this suite runs with `bypassCSP`**, and
 * every one of the browser gate's specs therefore exercises the real policy.
 * Widening `script-src` to admit the harness would have been the other way to
 * make these calls work, and it would have shipped a weaker policy to players
 * so that a test could keep its convenience.
 *
 * The URL is unique per injection so that a page which injects twice, as the
 * axe scan over a harness-booted game does, gets each script it asked for.
 */
export async function injectScript(page: Page, code: string): Promise<void> {
  served += 1;
  const path = `/__bj-support-${String(served)}.js`;
  await page.route(`**${path}`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: code,
    });
  });
  await page.addScriptTag({ url: path });
}

/**
 * Add one test-time stylesheet to the page, through a route rather than inline.
 *
 * `injectScript`'s twin, and it exists for the same reason: the shipped page's
 * policy carries `style-src 'self'`, so a `<style>` element whose body is
 * inline text is blocked. The rule this serves is a real stylesheet from the
 * page's own origin, which the policy allows.
 *
 * The one caller is `text-scale.spec.ts`'s negative control, which pins a
 * readout's font size in `px` so that item `G5`'s assertion can be shown to
 * notice a chrome that ignored the root size. It was the spec that found this:
 * under the policy its `<style>` never applied, the control stopped failing,
 * and a test whose whole job is to fail passed.
 */
export async function injectStyle(page: Page, css: string): Promise<void> {
  served += 1;
  const path = `/__bj-support-${String(served)}.css`;
  await page.route(`**${path}`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      body: css,
    });
  });
  await page.addStyleTag({ url: path });
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

/**
 * Dismiss the onboarding overlay a first launch opens. `BJ-20`, item `J7`.
 *
 * SPEC 17 shows How to Play automatically on a first launch, and every test
 * context is a first launch, so the page these helpers hand the specs would
 * otherwise carry an open dialog over the play surface for the whole of every
 * spec. What the existing suites grade is the screens underneath it, so the
 * shared entries close it the way a player does, through its own Close button,
 * and `onboarding.spec.ts` is where the overlay itself is the subject: the
 * auto-show is asserted there against a raw `page.goto`, with no helper in
 * front of it.
 *
 * The dismissal is guarded rather than unconditional because a context that
 * has seen the game before, a reload inside one test, boots with no overlay.
 */
async function dismissOnboarding(page: Page): Promise<boolean> {
  await settle(page);
  if ((await shell(page).getAttribute('data-overlay')) !== 'howToPlay') {
    return false;
  }
  await control(page, 'close-overlay').click();
  await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();
  return true;
}

/** Load the shipped page and drive it as it ships. No injection at all. */
export async function openShippedPage(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.bj-shell')).toBeVisible();
  if (await dismissOnboarding(page)) {
    // The dismissal is itself a press, and one spec's premise is "a page
    // nobody has pressed yet", which reads focus exactly as loaded. The seen
    // flag the dismissal wrote is in the context now, so a reload boots the
    // same page with no overlay and nothing pressed on it: the state every
    // existing shipped-page spec was written against, reached honestly.
    await page.reload();
    await expect(page.locator('.bj-shell')).toBeVisible();
    await settle(page);
  }
}

/** Load the shipped page, then boot a game with known options over it. */
export async function bootGame(page: Page, options: HarnessBootOptions = {}): Promise<void> {
  await page.goto('/');
  await dismissOnboarding(page);
  await injectScript(page, await bundle());
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
  // The harness's own boot is a first launch of its own on a clean context, so
  // the same dismissal the shipped entry applies applies to the game it built.
  await dismissOnboarding(page);
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

// ---------------------------------------------------------------------------
// BJ-16: the layout probe, and the boxes the responsive specs measure
// ---------------------------------------------------------------------------

/** What the last frame resolved for the layout. Only on a harness-booted page. */
export async function layoutProbe(page: Page): Promise<ReturnType<GameHarness['layout']>> {
  return page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    return api.layout();
  });
}

// ---------------------------------------------------------------------------
// BJ-18: the accessibility probe
// ---------------------------------------------------------------------------

/**
 * What the last frame resolved for accessibility. Only on a harness page.
 *
 * The probe is the second witness in every spec that reads it, never the only
 * one: the mirror, the two regions, the shell's `data-forced-colors` and the
 * computed colours are all readable from the page itself, and the specs read
 * those first. What the probe adds is the palette selection, which is a decision
 * the renderer makes and the page has no other way to publish.
 */
export async function accessibilityProbe(
  page: Page,
): Promise<ReturnType<GameHarness['accessibility']>> {
  return page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    return api.accessibility();
  });
}

// ---------------------------------------------------------------------------
// BJ-19: the audio probe
// ---------------------------------------------------------------------------

/**
 * What the audio layer holds, and every cue it has been offered. Harness only.
 *
 * The cue counts cross the boundary as plain numbers, and the mute and the
 * volume are the engine's own reading rather than a copy the page renders,
 * which is what item `K3`'s pass-through and item `K5`'s exactly-once are
 * asserted against.
 */
export async function audioProbe(page: Page): Promise<ReturnType<GameHarness['audio']>> {
  return page.evaluate(() => {
    const api = window.__bjGame;
    if (api === undefined) {
      throw new Error('no harness on this page');
    }
    return api.audio();
  });
}

/** A rendered box, in CSS pixels, as `boundingBox` reports one. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box a locator renders, failing loudly when it has none. */
export async function boxOf(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, `${label} has a rendered box`).not.toBeNull();
  if (box === null) {
    throw new Error(`${label} has no box`);
  }
  return box;
}

/** True when two rendered boxes share any area at all. */
export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * What the page can say about its own scrolling and its own viewport.
 *
 * One evaluate rather than several, so every number in it describes the same
 * layout: a spec that read the scroll width and the viewport width in two round
 * trips could straddle a resize and compare two different pages.
 */
export interface PageMetrics {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly bodyScrollWidth: number;
  /**
   * How far each chrome container overflows its own box, horizontally.
   *
   * The page is not the only place a horizontal overflow can hide. A container
   * whose computed `overflow-x` is a scrolling value absorbs its own overflow
   * and the document never widens, which is correct for the two containers that
   * are designated scrollers and is a defect one level down for every other one.
   * The `BJ-16` ledger measured exactly that: a row that stopped wrapping went
   * undetected against a reading of the document alone.
   */
  readonly containers: readonly { readonly selector: string; readonly overflowX: number }[];
  readonly breakpoint: string;
  readonly stickyBars: string;
  readonly surfaceSize: string;
}

/** The containers that may scroll horizontally by design. DESIGN section 4. */
export const DESIGNED_SCROLLERS = ['.bj-chips', '.bj-stage'];

export async function pageMetrics(page: Page): Promise<PageMetrics> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector('.bj-shell');
    // Every match, not the first: `.bj-screen` matches five screens of which
    // four are hidden at any moment, and `.bj-actions` is hidden at the betting
    // phase, so a first-match reading measured a display:none box every run and
    // said nothing. The widest overflow among the boxes that are actually
    // rendered is the reading that means something.
    const containers: { selector: string; overflowX: number }[] = [];
    for (const selector of [
      '.bj-shell',
      '.bj-top',
      '.bj-readouts',
      '.bj-controls',
      '.bj-betting',
      '.bj-actions',
      '.bj-screen',
      '.bj-overlay',
    ]) {
      let widest: number | null = null;
      for (const node of document.querySelectorAll(selector)) {
        const box = node.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) {
          continue;
        }
        const overflow = node.scrollWidth - node.clientWidth;
        widest = widest === null ? overflow : Math.max(widest, overflow);
      }
      if (widest !== null) {
        containers.push({ selector, overflowX: widest });
      }
    }
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      clientWidth: root.clientWidth,
      clientHeight: root.clientHeight,
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      bodyScrollWidth: document.body.scrollWidth,
      containers,
      breakpoint: shell?.getAttribute('data-breakpoint') ?? '',
      stickyBars: shell?.getAttribute('data-sticky-bars') ?? '',
      surfaceSize: shell?.getAttribute('data-layout-size') ?? '',
    };
  });
}

/**
 * Resize the viewport and wait until the page has settled on the new shape.
 *
 * Two frames, not one, and the reason is in `main.ts`: the breakpoint attribute
 * is written in the chrome sync at the end of a frame and the surface is planned
 * from the box at the top of the next one, so the canvas reaches its new size
 * one frame after the attribute does. Waiting on the attribute alone would read
 * the previous frame's canvas.
 */
export async function resizeTo(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await settle(page);
}

/** Wait for three animation frames, which is two more than any single update. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
      }),
  );
}

/** The play surface, as an element. Its CSS box is what item `F6` measures. */
export function surface(page: Page): Locator {
  return page.locator('.bj-surface');
}

/**
 * The surface's CSS box and its backing store, read off the element itself.
 *
 * The shipped page's own witness for item `F6`: the CSS box is the logical-to
 * -CSS scale times the framing, and the backing store is that times the device
 * pixel ratio, so the pair is enough to tell a magnified surface from a zoomed
 * one with nothing injected into the page.
 */
export interface SurfaceMetrics {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly storeWidth: number;
  readonly storeHeight: number;
  readonly dpr: number;
}

export async function surfaceMetrics(page: Page): Promise<SurfaceMetrics> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.bj-surface');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('no play surface on this page');
    }
    const box = canvas.getBoundingClientRect();
    return {
      cssWidth: box.width,
      cssHeight: box.height,
      storeWidth: canvas.width,
      storeHeight: canvas.height,
      dpr: window.devicePixelRatio,
    };
  });
}

/** One control, as the page renders it right now. `BJ-16`, item `F1`. */
export interface ControlReport {
  /** Whatever names the control: its data attribute, or its text. */
  readonly key: string;
  readonly tag: string;
  readonly box: Box;
  /**
   * What a click at the control's centre would land on.
   *
   * `self` is the control or something inside it, `other` is a different
   * element covering it, and `none` is a centre outside the viewport. The last
   * two are both item `F1`'s "unreachable control", and they are different
   * defects: one is a stacking mistake and the other is an overflow.
   */
  readonly hit: 'self' | 'other' | 'none';
  /** Whether the control's own text overflows the box it is drawn in. */
  readonly textClipped: boolean;
}

/** Everything one viewport can say about its own layout. */
export interface LayoutReport {
  readonly breakpoint: string;
  readonly stickyBars: string;
  readonly surfaceSize: string;
  readonly phase: string;
  readonly inner: { readonly width: number; readonly height: number };
  readonly doc: {
    readonly scrollWidth: number;
    readonly clientWidth: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
  };
  readonly regions: LayoutRegions;
  readonly controls: readonly ControlReport[];
  readonly scrollers: Record<
    string,
    {
      readonly scrollWidth: number;
      readonly clientWidth: number;
      readonly scrollHeight: number;
      readonly clientHeight: number;
    }
  >;
  readonly styles: LayoutStyles;
  readonly readouts: readonly {
    readonly key: string;
    readonly visible: boolean;
    readonly box: Box;
  }[];
}

/**
 * The rendered box of each region of the shell, or `null` where there is none.
 *
 * Named fields rather than an index signature, so a spec that asks for a region
 * this helper does not measure is a type error rather than an `undefined` two
 * assertions later.
 */
export interface LayoutRegions {
  readonly shell: Box | null;
  readonly top: Box | null;
  readonly body: Box | null;
  readonly stage: Box | null;
  readonly surface: Box | null;
  readonly controls: Box | null;
}

/** The computed values the responsive specs compare across breakpoints. */
export interface LayoutStyles {
  readonly topPosition: string;
  readonly controlsPosition: string;
  readonly readoutFontSize: string;
  readonly buttonFontSize: string;
  readonly buttonMinHeight: string;
  readonly summaryDisplay: string;
  readonly shellPaddingBottom: string;
  readonly shellPaddingTop: string;
  readonly shellPaddingLeft: string;
  readonly shellPaddingRight: string;
}

/**
 * Measure the whole layout in one round trip.
 *
 * One evaluate rather than one per assertion, and that is not an optimisation:
 * the page is running a frame loop, so two round trips can straddle a frame and
 * a spec would then be comparing boxes from two different layouts. Everything
 * below is read from one synchronous pass over one rendered page.
 *
 * The three specs that share it, `breakpoints`, `portrait` and `small-viewport`,
 * each assert a different subset; nothing here decides anything.
 */
export async function layoutReport(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector('.bj-shell');
    const rect = (selector: string): Box | null => {
      const node = document.querySelector(selector);
      if (node === null) {
        return null;
      }
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };

    /**
     * Whether an element is actually being rendered.
     *
     * The closed-disclosure arm is not belt and braces. A closed `<details>`
     * skips its contents through `content-visibility`, and a skipped subtree
     * keeps the geometry it had when it was last laid out: Chromium answers
     * `getBoundingClientRect` with the stale box, `display` with `flex` and
     * `visibility` with `visible` for a readout nobody can see. Asking the
     * disclosure instead is the one reading that is true on every engine.
     */
    const visible = (node: Element): boolean => {
      const disclosure = node.closest('details');
      if (disclosure !== null && !disclosure.open && node.closest('summary') === null) {
        return false;
      }
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) {
        return false;
      }
      const style = getComputedStyle(node);
      return style.visibility !== 'hidden' && style.display !== 'none';
    };

    const nameOf = (node: Element): string => {
      for (const attribute of [
        'data-control',
        'data-action',
        'data-chip',
        'data-open-overlay',
        'data-table',
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
      return (node.textContent ?? '').trim();
    };

    const controls: ControlReport[] = [];
    for (const node of document.querySelectorAll('button, summary')) {
      if (!visible(node)) {
        continue;
      }
      const box = node.getBoundingClientRect();
      const centreX = box.x + box.width / 2;
      const centreY = box.y + box.height / 2;
      const inside =
        centreX >= 0 && centreY >= 0 && centreX <= window.innerWidth && centreY <= window.innerHeight;
      const hitNode = inside ? document.elementFromPoint(centreX, centreY) : null;
      controls.push({
        key: nameOf(node),
        tag: node.tagName.toLowerCase(),
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        hit: !inside ? 'none' : hitNode !== null && node.contains(hitNode) ? 'self' : 'other',
        // A control whose label does not fit the box it is drawn in. `scrollWidth`
        // is the content's width and `clientWidth` the box's, so a difference of
        // more than a rounding pixel is a clipped label.
        textClipped: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
      });
    }

    const scrollers: Record<
      string,
      { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }
    > = {};
    for (const selector of ['.bj-top', '.bj-controls', '.bj-chips', '.bj-stage', '.bj-readouts']) {
      const node = document.querySelector(selector);
      if (node !== null) {
        scrollers[selector] = {
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        };
      }
    }

    const styleOf = (selector: string, property: string): string => {
      const node = document.querySelector(selector);
      return node === null ? '' : getComputedStyle(node).getPropertyValue(property);
    };

    const readouts: { key: string; visible: boolean; box: Box }[] = [];
    for (const node of document.querySelectorAll('[data-readout]')) {
      const box = node.getBoundingClientRect();
      readouts.push({
        key: node.getAttribute('data-readout') ?? '',
        visible: visible(node),
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
      });
    }

    return {
      breakpoint: shell?.getAttribute('data-breakpoint') ?? '',
      stickyBars: shell?.getAttribute('data-sticky-bars') ?? '',
      surfaceSize: shell?.getAttribute('data-layout-size') ?? '',
      phase: shell?.getAttribute('data-phase') ?? '',
      inner: { width: window.innerWidth, height: window.innerHeight },
      doc: {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      },
      regions: {
        shell: rect('.bj-shell'),
        top: rect('.bj-top'),
        body: rect('.bj-body'),
        stage: rect('.bj-stage'),
        surface: rect('.bj-surface'),
        controls: rect('.bj-controls'),
      },
      controls,
      scrollers,
      styles: {
        topPosition: styleOf('.bj-top', 'position'),
        controlsPosition: styleOf('.bj-controls', 'position'),
        readoutFontSize: styleOf('.bj-readout__value', 'font-size'),
        buttonFontSize: styleOf('.bj-button', 'font-size'),
        buttonMinHeight: styleOf('.bj-button', 'min-height'),
        summaryDisplay: styleOf('.bj-readouts__summary', 'display'),
        shellPaddingBottom: styleOf('.bj-shell', 'padding-bottom'),
        shellPaddingTop: styleOf('.bj-shell', 'padding-top'),
        shellPaddingLeft: styleOf('.bj-shell', 'padding-left'),
        shellPaddingRight: styleOf('.bj-shell', 'padding-right'),
      },
      readouts,
    };
  });
}

/** Every control the report found, by the key `layoutReport` names it with. */
export function controlNamed(report: LayoutReport, key: string): ControlReport | undefined {
  return report.controls.find((entry) => entry.key === key);
}

/** Open Settings, press one control by its data attribute, and close again. */
export async function chooseInSettings(page: Page, selector: string): Promise<void> {
  await page.locator('[data-open-overlay="settings"]').click();
  await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
  const button = page.locator(selector);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await control(page, 'close-overlay').click();
  await expect(page.locator('[data-overlay-host="true"]')).toBeHidden();
  await settle(page);
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
