/**
 * Driving the shipped page from a measurement script. `BJ-22`.
 *
 * The `report/*` scripts measure the same built `dist/` the browser gate does,
 * and two of them need states a player cannot be dropped into: item `G2` asks
 * for "every table felt", and SPEC 6 locks two of the three behind an unlock
 * mark, and item `D3` asks for "every interactive target", which includes the
 * insurance screen's two controls and the bust-out screen's three.
 *
 * So this reuses the browser gate's own answer to that problem rather than
 * inventing a second one: `tests/browser/support/game-harness.ts`, bundled at
 * run time with `write: false` and injected over a same-origin route. Nothing
 * here ships. The bundle never reaches `dist/`, the injection is a route this
 * script serves, and `npm run verify:build` fingerprints the same bytes with and
 * without any of it.
 *
 * **The route rather than an inline script, and that is the shipped policy
 * rather than a preference.** `dist/index.html` opens with `script-src 'self'`,
 * so an inline `<script>` is blocked by the page being measured. Serving the
 * bundle from the page's own origin is legal under the real directives, so
 * every measurement below is taken on a page running its real policy.
 */

import { build } from 'vite';

import { PROJECT_ROOT } from './support.mjs';

/** How long a paced phase may take before a driver gives up. SPEC 5 is seconds. */
export const PHASE_TIMEOUT = 20_000;

let harness = null;

/** The harness bundle, built once per process. */
export async function bundleHarness() {
  if (harness !== null) {
    return harness;
  }
  const result = await build({
    root: PROJECT_ROOT,
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: {
        entry: `${PROJECT_ROOT}/tests/browser/support/game-harness.ts`,
        name: 'BJSupport',
        formats: ['iife'],
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  for (const candidate of outputs) {
    for (const chunk of candidate.output ?? []) {
      if (chunk.type === 'chunk' && typeof chunk.code === 'string') {
        harness = chunk.code;
        return harness;
      }
    }
  }
  throw new Error('the harness bundled to no chunk');
}

let served = 0;

/** Serve one script from the page's own origin, which the policy allows. */
async function injectScript(page, code) {
  served += 1;
  const path = `/__bj-report-${String(served)}.js`;
  await page.route(`**${path}`, (route) => {
    void route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: code });
  });
  await page.addScriptTag({ url: path });
}

/** Three animation frames, which is two more than any single update needs. */
export async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((wake) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(wake);
          });
        });
      }),
  );
}

/** SPEC 17 shows How to Play on a first launch, and every context is one. */
async function dismissOnboarding(page) {
  await settle(page);
  const shell = await page.locator('.bj-shell').getAttribute('data-overlay');
  if (shell !== 'howToPlay') {
    return;
  }
  await page.locator('[data-control="close-overlay"]').click();
  await page.locator('[data-overlay-host="true"]').waitFor({ state: 'hidden' });
}

/**
 * Load the shipped page and boot a known game over it, from a clean document.
 *
 * **The store is cleared between boots, and that is not tidiness.** SPEC 13
 * persists the seated table and the unlock mark, and one page drives every state
 * a report measures, so a bust-out search that seats Gold leaves Gold seated for
 * the next boot and a 50 wager is then refused as below the table minimum. It
 * cost half an hour to find the first time, in a script whose readouts all
 * looked right: the refusal was the machine being correct about a table the
 * driver did not know it was at. A measurement wants each state independent of
 * the one before it, so each boot starts from the document a first launch has.
 */
export async function bootGame(page, url, options = {}) {
  await page.goto(url);
  await page.locator('.bj-shell').waitFor();
  await dismissOnboarding(page);
  await injectScript(page, await bundleHarness());
  await page.waitForFunction(() => window.__bjGame !== undefined, undefined, {
    timeout: PHASE_TIMEOUT,
  });
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.evaluate((given) => {
    window.__bjGame.boot(given);
  }, options);
  await dismissOnboarding(page);
}

/** The phase attribute the chrome publishes, right now. */
export async function phaseOf(page) {
  return (await page.locator('.bj-shell').getAttribute('data-phase')) ?? '';
}

/** Wait until SPEC 10's phase is the one named. */
export async function waitForPhase(page, kind) {
  await page
    .locator(`.bj-shell[data-phase="${kind}"]`)
    .waitFor({ timeout: PHASE_TIMEOUT });
}

/** Press one control by its `data-control`, `data-action` or `data-chip`. */
export async function press(page, selector) {
  await page.locator(selector).click();
}

/** Leave the start screen and arrive at the betting phase. */
export async function toBetting(page) {
  await waitForPhase(page, 'start');
  await press(page, '[data-control="start"]');
  await waitForPhase(page, 'betting');
}

/**
 * Play the round out by standing, and stop at its result.
 *
 * Insurance is declined rather than answered by chance, so a driver that asked
 * for a round result gets one and not an offer it did not expect.
 */
export async function toRoundResult(page) {
  for (let step = 0; step < 400; step += 1) {
    const phase = await phaseOf(page);
    if (phase === 'roundResult') {
      return true;
    }
    if (phase === 'insurance') {
      await press(page, '[data-control="decline-insurance"]');
    } else if (phase === 'playerTurn') {
      await press(page, '[data-action="stand"]');
    }
    await page.waitForTimeout(80);
  }
  return false;
}

/**
 * The first seed at or after `from` whose round reaches `phase` after the deal.
 *
 * A search in the page rather than a constant in this file, for the reason
 * `tests/browser/support/flow-seeds.ts` gives: a seed written down is a seed
 * that silently stops meaning what it meant the day the shoe's draw order
 * changes. The bound is stated so a search that finds nothing fails rather than
 * running forever.
 */
export async function findSeedReaching(page, url, phase, wager, attempts = 60, from = 1) {
  for (let seed = from; seed < from + attempts; seed += 1) {
    await bootGame(page, url, { seed, alwaysReduceMotion: true });
    await toBetting(page);
    await press(page, `[data-chip="${String(wager)}"]`);
    await press(page, '[data-control="deal"]');
    for (let step = 0; step < 60; step += 1) {
      const now = await phaseOf(page);
      if (now === phase) {
        return seed;
      }
      if (now === 'playerTurn' || now === 'roundResult' || now === 'bustOut') {
        break;
      }
      await page.waitForTimeout(60);
    }
  }
  if (attempts === 1) {
    return null;
  }
  throw new Error(`no seed within ${String(attempts)} reached the ${phase} screen`);
}
