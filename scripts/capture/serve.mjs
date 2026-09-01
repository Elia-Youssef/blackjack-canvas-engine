/**
 * The demonstration session's server. `BJ-23`.
 *
 * `BlackJack/ACCEPTANCE.md` section 4 is ten scripted captures, and four of
 * them need a round the shipped page cannot be asked for: item `E3` wants a
 * hand carrying an Ace, a face card and a number card of each suit, `E5` wants
 * the felt printed at all three tables when SPEC 6 has only unlocked one, `E6`
 * wants both branches of the dealer's peek, and `G4` wants an insurance
 * decision, a splittable pair, a round result and a bust-out inside one
 * unaided screen-reader session. The suite reaches those the same way every
 * browser spec does, by bundling a support module at test time and injecting
 * it into the served page. A person at a capture session cannot run a
 * Playwright spec, and on a phone they cannot open a console either.
 *
 * So this script serves the built `dist/` exactly as `vite preview` does, and
 * adds four paths beside it that exist only while it is running:
 *
 *   /                        the shipped page, untouched. Every walkthrough
 *                            capture uses this and nothing else.
 *   /__capture.html?...      the same page with one support bundle and one
 *                            boot script appended, for the seeded captures.
 *   /__capture-harness.js    `tests/browser/support/game-harness.ts`, bundled.
 *   /__capture-demo.js       `tests/browser/support/render-demo.ts`, bundled.
 *   /__capture-boot.js       reads the query string and calls one of them.
 *
 * **Nothing here reaches what ships, and the proof is the fingerprint.**
 * `dist/` is written by `vite build` from `index.html`'s module graph; this
 * file is in none of it, writes nothing into it, and is never imported by
 * `src/`. `npm run verify:build` reports the same fingerprint with this script
 * present as without it, which is the same evidence `render-demo.ts` and
 * `game-harness.ts` have carried since `BJ-13` and `BJ-15`.
 *
 * **The two routes are not interchangeable and a capture must say which it
 * used.** `/` is the product. `/__capture.html` is the product plus a test
 * harness, and a capture filed from it is evidence about the game's behaviour
 * on a known deal, never evidence about what a player downloads. Items `A3a`,
 * `A4`, `D6` and `F4` are walkthroughs and take `/`; the seeded captures take
 * the capture page and say so on the sheet.
 *
 * **The bind is `127.0.0.1` and stays there.** `vite.config.ts` pins it and
 * says why. An Android emulator reaches the host's loopback at `10.0.2.2`, so
 * the AVD captures need no wider bind: measured on 2026-08-31, the preview
 * answers a request carrying `Host: 10.0.2.2:4173` with the real page and the
 * real assets, so no host allow-list entry is needed either.
 *
 * Usage, from `BlackJack/BlackJack`:
 *
 *   npm run build
 *   npm run capture:serve
 *
 * It prints every route with a worked example. Stop it with Ctrl+C, and check
 * nothing is left listening on the port before the next capture.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, preview } from 'vite';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(PROJECT_ROOT, 'dist');
const SUPPORT = join(PROJECT_ROOT, 'tests', 'browser', 'support');

/** The paths this server adds. Named once so the page and the router agree. */
export const ROUTES = {
  page: '/__capture.html',
  harness: '/__capture-harness.js',
  demo: '/__capture-demo.js',
  boot: '/__capture-boot.js',
};

/**
 * The boot script, served as a file rather than written inline.
 *
 * The shipped page carries `script-src 'self'`, so an inline script would be
 * blocked by the policy the capture is supposed to be showing. This is the
 * same reason `tests/browser/support/game.ts` serves its injections through a
 * route, and nothing here asks for the policy to be widened.
 *
 * It is ES5 in style for the same reason `vite.config.ts`'s `nomodule` script
 * is: it is served to whatever browser the session is being captured on, and a
 * capture that failed on a syntax error would look like a defect in the game.
 */
export const BOOT_SOURCE = `(function () {
  var params = new URLSearchParams(window.location.search);
  var report = function (what) {
    document.documentElement.setAttribute('data-capture-route', what);
  };

  if (params.get('demo') === 'render') {
    if (!window.__bjRenderDemo) {
      throw new Error('the render demo did not install');
    }
    window.__bjRenderDemo.mountAll();
    report('render-demo');
    return;
  }

  if (!window.__bjGame) {
    throw new Error('the game harness did not install');
  }

  var options = {};
  var numbers = ['seed', 'bestBalance', 'volume'];
  var strings = ['table', 'coachMode', 'speed', 'surfaceSize', 'theme'];
  var flags = ['muted', 'alwaysReduceMotion'];
  var index;
  for (index = 0; index < numbers.length; index += 1) {
    if (params.get(numbers[index]) !== null) {
      options[numbers[index]] = Number(params.get(numbers[index]));
    }
  }
  for (index = 0; index < strings.length; index += 1) {
    if (params.get(strings[index]) !== null) {
      options[strings[index]] = params.get(strings[index]);
    }
  }
  for (index = 0; index < flags.length; index += 1) {
    if (params.get(flags[index]) !== null) {
      options[flags[index]] = params.get(flags[index]) === 'true';
    }
  }
  window.__bjGame.boot(options);
  report('game-harness');
})();
`;

/**
 * One support module, bundled the way the browser suite bundles it.
 *
 * The same library build `tests/browser/support/game.ts` and
 * `tests/browser/render-surface.spec.ts` use, down to `write: false`: the
 * bundle exists in memory and is handed to the browser over a route, so no
 * file is written anywhere near `dist/`.
 */
export async function bundleSupport(entry, name) {
  const result = await build({
    root: PROJECT_ROOT,
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: { entry: join(SUPPORT, entry), name, formats: ['iife'] },
    },
  });

  const outputs = Array.isArray(result) ? result : [result];
  for (const candidate of outputs) {
    const chunks = candidate.output;
    if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        if (chunk.type === 'chunk' && typeof chunk.code === 'string') {
          return chunk.code;
        }
      }
    }
  }
  throw new Error(`${entry} bundled to no chunk`);
}

/**
 * The capture page: the shipped page plus exactly two script tags.
 *
 * Built per request because which support bundle to load is the query's
 * answer. **The two support bundles are never both on one page**, and that is
 * what is honoured by construction here rather than by care: each carries its
 * own copy of what it imports, and `game.ts`'s header says why two of them over
 * one canvas is a hazard.
 *
 * What that does **not** claim, because it would be false: the harness route
 * puts the harness's composition root on a page the shipped chunk has already
 * booted one on. `bootSession` in `src/main.ts` calls
 * `root.replaceChildren(...)`, so the page a viewer sees is unambiguously the
 * booted one, while the shipped chunk's game keeps a frame loop over a detached
 * tree. That is the arrangement `bootGame` in `tests/browser/support/game.ts`
 * has used since `BJ-15` and every browser spec is graded under; the shipped
 * chunk exports nothing, by design, so there is no handle to dispose it with
 * from outside. It is stated rather than hidden, and it is one more reason a
 * walkthrough capture takes `/` and not this page.
 *
 * Served at the root of the same directory as `index.html`, so the relative
 * asset URLs `base: './'` emits resolve to the same files the shipped page
 * loads. A copy under a sub-path would 404 on every asset.
 *
 * **`defer` on both tags, and it is the difference between a seeded page and an
 * unseeded one.** The shipped page loads the application as
 * `<script type="module">`, which the specification defers: it runs after the
 * document is parsed. A classic `<script src>` does not, so without `defer`
 * these two execute the moment the parser reaches them, **before** the shipped
 * chunk. The boot script then boots the harness's own copy of the composition
 * root, the shipped chunk boots a second one over the same mount point a moment
 * later, and the game an operator records is the second one: default table, no
 * seed, while `window.__bjGame` answers for the orphaned first. That is the
 * defect the `BJ-23` review measured, and it made every seeded sheet serve an
 * ordinary game.
 *
 * `defer` puts both tags in the document's own deferred queue, which runs in
 * document order, so the shipped chunk boots first and the boot script re-boots
 * that same page with the query's options. It is the order
 * `tests/browser/support/game.ts` has always used (`goto`, wait for load, then
 * inject), which is why the browser suite never saw this and the capture route
 * did. `tests/browser/capture-route.spec.ts` asserts the page rather than the
 * API, which is the assertion whose absence let it through.
 */
export function capturePage(shipped, wantsRenderDemo) {
  const support = wantsRenderDemo ? ROUTES.demo : ROUTES.harness;
  const tags =
    `    <script defer src=".${support}"></script>\n` +
    `    <script defer src=".${ROUTES.boot}"></script>\n`;
  if (!shipped.includes('</body>')) {
    throw new Error('dist/index.html has no body to append to');
  }
  return shipped.replace('</body>', `${tags}  </body>`);
}

function send(response, type, body) {
  response.setHeader('Content-Type', type);
  // The capture page is generated per request and must never be reused across
  // one: a stale copy would serve the harness to a walkthrough capture.
  response.setHeader('Cache-Control', 'no-store');
  response.end(body);
}

function captureRoutes(shipped, harness, demo) {
  return {
    name: 'bj-capture-routes',
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const [path, query = ''] = (request.url ?? '').split('?');
        if (path === ROUTES.page) {
          const wantsRenderDemo = new URLSearchParams(query).get('demo') === 'render';
          send(response, 'text/html; charset=utf-8', capturePage(shipped, wantsRenderDemo));
          return;
        }
        if (path === ROUTES.harness) {
          send(response, 'text/javascript; charset=utf-8', harness);
          return;
        }
        if (path === ROUTES.demo) {
          send(response, 'text/javascript; charset=utf-8', demo);
          return;
        }
        if (path === ROUTES.boot) {
          send(response, 'text/javascript; charset=utf-8', BOOT_SOURCE);
          return;
        }
        next();
      });
    },
  };
}

async function main() {
  const index = join(DIST, 'index.html');
  if (!existsSync(index)) {
    console.error('dist/index.html is missing. Run `npm run build` first.');
    process.exitCode = 1;
    return;
  }
  const shipped = readFileSync(index, 'utf8');

  console.log('Bundling the two support modules (nothing is written to disk).');
  const harness = await bundleSupport('game-harness.ts', 'BJGameHarness');
  const demo = await bundleSupport('render-demo.ts', 'BJRenderDemo');

  const server = await preview({
    root: PROJECT_ROOT,
    configFile: join(PROJECT_ROOT, 'vite.config.ts'),
    plugins: [captureRoutes(shipped, harness, demo)],
  });

  const base = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? '';
  console.log('');
  console.log('Demonstration capture server. Ctrl+C to stop.');
  console.log('');
  console.log(`  the shipped page          ${base}/`);
  console.log(`  a seeded game             ${base}${ROUTES.page}?seed=6&table=gold&bestBalance=10000`);
  console.log(`  the render demo scenes    ${base}${ROUTES.page}?demo=render`);
  console.log('');
  console.log('  From an Android emulator, replace 127.0.0.1 with 10.0.2.2.');
  console.log('  A walkthrough capture uses the shipped page and nothing else.');
  console.log('  The capture page sets data-capture-route on <html>, so a screenshot');
  console.log('  of the inspector shows which route produced it.');
}

/**
 * Run only when this file is the program, never on import.
 *
 * `scripts/mutation-check.mjs` carries the same guard for the same shape of
 * reason: a module that started a server as a side effect of being read would
 * bind a port behind any tool that only wanted one of its exports.
 * `tests/browser/capture-route.spec.ts` imports `capturePage` and
 * `BOOT_SOURCE` from here so that what it grades is the page this script
 * serves rather than a second copy of it, and that import must be free.
 *
 * Node's standard entry-point comparison, on the resolved path so the
 * argument's spelling does not decide it.
 */
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  await main();
}
