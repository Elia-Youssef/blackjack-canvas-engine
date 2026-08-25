import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${String(PORT)}`;
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
 * Browser gate.
 *
 * The server here is `vite preview` over the built `dist/`, never the dev
 * server. The whole claim of item A2 is that what ships is a directory of
 * static files, so the browser gate has to exercise that directory and not a
 * transform pipeline that will not exist in production.
 *
 * Chromium, Firefox and WebKit per STACK section 6. Playwright's `webkit` is a
 * WebKit build and not Safari, and it cannot drive iOS. Real Safari, iOS and
 * Android are a release-gate demonstration on physical devices and are never a
 * merge gate; part BJ-23 owns that matrix.
 */
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // CI runs one worker; local runs four. `BJ-16`.
  //
  // **Four is measured, not chosen.** The default was half the cores, which on a
  // 32-thread machine is sixteen browsers at once, and `BJ-16` grew the suite to
  // a hundred tests per engine. At that load the frame interval inside a WebKit
  // worker stretched to 0.117 to 0.158 s, and `motion-demo.spec.ts`'s peek timing
  // needs samples finer than a quarter of the peek pause to tell the two arms
  // apart: every one of its six attempts came back too coarse and the gate went
  // red twice in a row while passing in isolation. That is a measurement whose
  // answer depends on how many other browsers are running, which is not a gate.
  //
  // The alternative was to widen that spec's tolerance to whatever interval it
  // observed, which would have removed the discrimination item `E6` is graded on.
  // Fewer workers costs wall clock and removes nothing: the whole suite runs
  // green here in under four minutes with no flags.
  workers: isCI ? 1 : 4,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],

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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    reuseExistingServer: reuseServer,
    timeout: 120_000,
  },
});
