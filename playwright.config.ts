import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/**
 * The one address the gate speaks, on both sides of the wire.
 *
 * **`127.0.0.1` rather than `localhost`, deliberately.** `localhost` is a name
 * with two answers, `::1` and `127.0.0.1`, and which one a client picks is the
 * client's business: a server that binds one stack and a browser that dials the
 * other do not meet, and worse, a foreign server on the stack ours left free
 * answers in its place. Both happened here on 2026-08-31, in the same run: the
 * preview bound `[::1]:4173` while another project's server held
 * `127.0.0.1:4173`, and a full firefox run came back with page snapshots of
 * somebody else's product. `vite.config.ts` pins the bind to the same address
 * with `strictPort`, so a collision is now a refusal at startup rather than two
 * servers sharing a name.
 *
 * This value is read twice, by `use.baseURL` and by `webServer.url`, so the
 * side that serves and the side that dials cannot come apart. CI is unaffected
 * in semantics: the runners resolve `127.0.0.1` to the same loopback they
 * always used, and the workers, the reuse rule and the timeouts are untouched.
 */
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const isCI = process.env['CI'] !== undefined;

/**
 * Whether an already-running preview server may be reused. `BJ-14`.
 *
 * **Reuse is off by default, and the default is the safe one.** The hazard is
 * specific: the server serves `dist/`, and `dist/` is only rebuilt by the
 * `webServer` command this config starts. A run that reuses a server somebody
 * else started therefore grades **whatever was built last**, which is silently
 * wrong rather than red. It bit this project at `BJ-14`:
 * `scripts/mutation-check.mjs` runs one browser spec per mutation, back to back,
 * and a `vite preview` process that outlived the run which spawned it, as
 * happens when the process tree is torn down on Windows, left four mutations
 * reported UNDETECTED that a fresh server catches at once. Two of the four were
 * `BJ-15`'s own entries, so the hole had been open for a part.
 *
 * The polarity follows from what each mistake costs. A forgotten variable under
 * the old default cost **validity**: a green run over a stale bundle. Under this
 * one it costs a rebuild. So reuse became the explicit opt-in
 * `BJ_REUSE_SERVER`, for the case it was always for, iterating on one spec
 * against `npm run preview` in another terminal, where the person setting the
 * variable is the person who knows what is built.
 *
 * CI is unchanged: it never reused, and the flag cannot turn reuse on there.
 */
const reuseServer = !isCI && process.env['BJ_REUSE_SERVER'] !== undefined;

/**
 * The one spec whose assertion is about a real frame interval. `BJ-18`.
 *
 * Named once and read twice, by the timing projects that run it and by the main
 * projects that ignore it, so the two cannot come apart. The projects list below
 * carries the whole reasoning.
 */
const TIMING_SPEC = /motion-demo\.spec\.ts/;

/**
 * The one spec whose assertion is a bitmap. `BJ-22`, item `E8`.
 *
 * **Chromium only, and the reason is in the pixels rather than in the budget.**
 * Canvas text metrics, antialiasing and gradient dithering are engine and
 * platform properties: three engines would mean three baseline sets grading one
 * drawing, two of which would fail for reasons that belong to the browser. The
 * criterion asks for baselines that match, not for a cross-engine pixel
 * identity no browser offers, and the drawing itself is measured on all three
 * engines by `render-surface.spec.ts` and `fan-floor.spec.ts`.
 *
 * Named once and read three times, exactly as `TIMING_SPEC` is, so the file
 * cannot be running in a project that has no baselines for it.
 */
const VISUAL_SPEC = /visual\.spec\.ts/;

/**
 * The desktop framing, taken from the descriptor without its identity. `BJ-23`.
 *
 * **A device descriptor's `userAgent` is true of the engine Playwright bundles
 * and false of an installed one.** `devices['Desktop Chrome']` carries the UA
 * string of the Chromium build shipped with the pinned Playwright, which is
 * what the `chromium` project actually runs, so spreading it there states a
 * fact. Spreading it on a stable channel states the opposite: at the pinned
 * version the descriptor says Chrome 151 while the installed channels on this
 * machine are 152, so the page would be told it is a browser it is not.
 * QUALITY-BAR section 2 names a descriptor's identity a spoof and refuses it
 * as evidence, and item `A3` is about the browser a player has.
 * `devices['Desktop Edge']` is that same stale string with `Edg/` appended and
 * is deliberately unused for the same reason.
 *
 * What is kept is everything else the descriptor carries, because the five
 * projects have to be measuring one layout: the responsive sweep, the
 * touch-target report and the hit-testing specs all read boxes. Subtracted
 * rather than re-listed, so a Playwright release that adds a framing field
 * reaches the channels the same day it reaches the three mains.
 *
 * Both halves are exported because `tests/unit/browser-matrix.test.ts` asserts
 * the subtraction from the other side: that what was taken out is exactly the
 * identity and that what is left is exactly the rest of the descriptor.
 * Playwright reads the default export below and ignores these two.
 */
export const { userAgent: BUNDLED_IDENTITY, ...DESKTOP_FRAMING } = devices['Desktop Chrome'];

/**
 * Browser gate.
 *
 * The server here is `vite preview` over the built `dist/`, never the dev
 * server. The whole claim of item A2 is that what ships is a directory of
 * static files, so the browser gate has to exercise that directory and not a
 * transform pipeline that will not exist in production.
 *
 * Chromium, Firefox and WebKit per STACK section 6, plus the Chrome and Edge
 * stable channels at `BJ-23`, which is item `A3`'s five. Playwright's `webkit`
 * is a WebKit build and not Safari, and it cannot drive iOS. Real Safari, iOS
 * and Android are a release-gate demonstration on physical devices and are
 * never a merge gate; the demonstration script in `BlackJack/ACCEPTANCE.md`
 * section 4 owns those, and nothing in this file may be read as covering them.
 */
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // CI runs one worker; local runs four. See `TIMING_SPEC` below for why four is
  // affordable again: the one measurement that cannot share a machine no longer
  // shares one, so the rest of the suite is free to use the machine it is on.
  workers: isCI ? 1 : 4,
  // `no-skips-reporter.ts` carries the reasoning: the suite runs 0 skipped, and
  // that had been a number read off a report rather than one anything enforced.
  // It is registered in both shapes, because a skip is no more acceptable
  // locally than in CI. A `--reporter=` on the command line replaces this list,
  // which is why the mutation harness's per-entry runs are unaffected.
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }], ['./tests/browser/support/no-skips-reporter.ts']]
    : [['list'], ['./tests/browser/support/no-skips-reporter.ts']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // QUALITY-BAR section 11: "Acceptance tests pin the locale." Number
    // grouping differs between locales, several of them with U+202F rather than
    // a plain space, so a suite that left the locale to the machine would be
    // asserting the runner's host settings. The specs still read numbers back as
    // numbers rather than comparing formatted strings; items `L1` to `L5` at
    // `BJ-21` are where the other locales are swept deliberately.
    locale: 'en-US',
  },

  projects: [
    // ------------------------------------------------------------------
    // The timing chain. One spec, three engines, one worker each, in series.
    // ------------------------------------------------------------------
    //
    // **Why this exists.** `motion-demo.spec.ts` measures item `E6`'s clause
    // that the dealer's peek takes the same time on both of its arms, and it
    // measures it by sampling the game's own animation frames. Its quality bar
    // is a real frame interval no coarser than 0.075 s, a quarter of SPEC 5's
    // 0.30 s peek pause, because two arms half a peek apart cannot be told from
    // each other with samples wider than that. A frame interval is not a
    // property of this project's code: it is what the machine hands the engine
    // while every other browser on it is also asking. Under three-engine
    // co-tenancy WebKit delivers 0.081 to 0.091 s and the spec goes red; alone
    // it delivers well inside the bar and the whole file passes in 7.5 s.
    //
    // **Two things were tried first and both were wrong.** Widening the spec's
    // tolerance to whatever interval it observed would delete the very
    // discrimination `E6` is graded on. Cutting the global worker count taxes
    // every one of the 789 other tests to protect twelve: `BJ-16` cut it to four
    // for this reason, `BJ-18` cut it to three and then two, and at three the
    // spec still failed at 0.077 to 0.091 s. Paying for isolation globally does
    // not even buy isolation.
    //
    // **So the spec is isolated instead of the suite being slowed.** The three
    // projects below run it one engine at a time, one worker each, chained by
    // `dependencies` so that no two of them and nothing else is running while
    // one of them measures. The three main projects ignore the spec and depend
    // on the last link, so they start only once the timing chain is done and
    // then use the whole machine at four workers. Measured on a normally loaded
    // machine: 9.2 minutes for the full 801, three consecutive runs green, and
    // the timing chain itself is about 45 s of that.
    //
    // **The accepted cost, stated rather than discovered.** A dependency that
    // fails skips its dependents, so a red timing spec leaves 789 tests unrun
    // rather than reporting them. That is deliberate and it is cheap: the
    // failure surfaces in about 45 s instead of at the end of a nine-minute run,
    // and the remainder is one command away with
    // `npx playwright test --project=chromium --no-deps`. The alternative,
    // letting the mains run anyway, would mean waiting nine minutes to be told
    // something that was known in the first minute.
    {
      name: 'timing-chromium',
      testMatch: TIMING_SPEC,
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'timing-firefox',
      testMatch: TIMING_SPEC,
      workers: 1,
      dependencies: ['timing-chromium'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'timing-webkit',
      testMatch: TIMING_SPEC,
      workers: 1,
      dependencies: ['timing-firefox'],
      // Cross-engine timing is compared at one CSS-to-device-pixel ratio. The
      // explicit surface tests retain DPR 2 and 2.6273 coverage.
      use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 },
    },

    // ------------------------------------------------------------------
    // The suite. Everything else, on all three engines, at the global workers.
    // ------------------------------------------------------------------
    //
    // `testIgnore` and the timing projects' `testMatch` are the same pattern
    // read in the two directions, so the spec runs in exactly one place and
    // adding a second timing-sensitive file means adding it to one constant.
    {
      name: 'chromium',
      testIgnore: TIMING_SPEC,
      dependencies: ['timing-webkit'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: [TIMING_SPEC, VISUAL_SPEC],
      dependencies: ['timing-webkit'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: [TIMING_SPEC, VISUAL_SPEC],
      dependencies: ['timing-webkit'],
      // Keep unrelated WebKit assertions out of Retina backing-store throughput
      // while the dedicated surface cases exercise high density explicitly.
      use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 },
    },

    // ------------------------------------------------------------------
    // The two stable channels. Item `A3` at `BJ-23`, Critical.
    // ------------------------------------------------------------------
    //
    // **What a channel is, and why it is not a fourth engine.** These two
    // projects drive the browsers the machine has installed, Google Chrome
    // stable and Microsoft Edge stable, rather than the Chromium build
    // Playwright ships. QUALITY-BAR section 2 puts both in Tier 1 and item
    // `A3` names them, and the reason is that a shipping browser is not its
    // upstream engine: the release channel carries origin trials, enterprise
    // policy, an installed font stack, a different media pipeline and, on
    // Edge, a second vendor's patches. A green `chromium` project says the
    // engine works; it does not say the browser a player has does.
    //
    // **Their composition is the `firefox` and `webkit` composition, and that
    // is a decision rather than a copy.** Item `A3` asks for "the full
    // automated suite" on five projects, and the suite has been a composed
    // thing since `BJ-18`: two files run in exactly one place each, for
    // reasons that are about the instrument rather than about coverage, and
    // both of those places were fixed before this part existed. Adding the
    // channels under the same rule is the honest reading; giving them
    // exceptions of their own would not be.
    //
    //   - `motion-demo.spec.ts` is excluded, as it is from all three mains.
    //     It measures a real frame interval and cannot share a machine, which
    //     is the whole of the timing chain above. Two more single-worker links
    //     would lengthen the one serial section every other test waits behind
    //     and would add two more chances for a loaded machine to redden it,
    //     and they would be measuring the machine rather than the product: the
    //     assertion is that the game's two peek arms take the same time, the
    //     frame delivery it is measured through is a property of the engine on
    //     this machine, and `timing-chromium` already measures that engine.
    //     What the channels do run is every behavioural motion assertion, in
    //     `reduced-motion.spec.ts`, `speed-setting.spec.ts` and
    //     `visibility.spec.ts`, so the Speed multiplier, the reduced-motion
    //     switch and the frame loop are all exercised on both of them.
    //   - `visual.spec.ts` is excluded, as it is from `firefox` and `webkit`.
    //     Its assertion is a bitmap compared against a committed baseline, and
    //     baselines are per project and per platform. A channel with no
    //     baseline set would fail on a missing file rather than on a drawing,
    //     and minting two more sets would grade two more font stacks against
    //     one drawing. The drawing itself is measured on every project by
    //     `render-surface.spec.ts` and `fan-floor.spec.ts`.
    //
    // Everything else runs, on both, including the axe scan, the whole round
    // flow, persistence, the responsive sweep and the CSP demonstration.
    // `tests/unit/browser-matrix.test.ts` holds that sentence to its word: it
    // reads this file, resolves what each project would run against the specs
    // on disk, and fails if a channel ever runs a different set from the
    // `chromium` main beyond the one baseline file. Without it, deleting a
    // project here would make the suite smaller and still green.
    //
    // `dependencies` is the mains' own, for the mains' own reason: nothing may
    // run while the timing chain measures. In a job that runs the channels
    // alone, `--no-deps` skips the chain, which is what the CI patch does.
    {
      name: 'chrome',
      testIgnore: [TIMING_SPEC, VISUAL_SPEC],
      dependencies: ['timing-webkit'],
      use: { ...DESKTOP_FRAMING, channel: 'chrome' },
    },
    {
      name: 'msedge',
      testIgnore: [TIMING_SPEC, VISUAL_SPEC],
      dependencies: ['timing-webkit'],
      use: { ...DESKTOP_FRAMING, channel: 'msedge' },
    },
  ],

  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    reuseExistingServer: reuseServer,
    timeout: 120_000,
  },
});
