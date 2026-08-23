import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${String(PORT)}`;
const isCI = process.env['CI'] !== undefined;

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
  workers: isCI ? 1 : '50%',
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
