/**
 * The browser gate at BJ-0, and the measured half of the evidence for item A2.
 *
 *   A2: "Ships as a static bundle requiring no server, no runtime configuration
 *        and no build-time secrets."
 *
 * A2 is an Inspection item and its final verdict is a reviewer's. What is
 * automated here is the part of that inspection a person should not be asked
 * to eyeball: whether every reference in
 * the emitted HTML is relative, whether any build-time environment variable
 * reached the bytes, and whether the running page talks to anything other than
 * the host it was served from. The reviewer reads the result rather than
 * grepping a bundle by hand.
 *
 * There is no game here to test. That is the point of the part, and every later
 * part adds its own browser coverage.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(PROJECT_ROOT, 'dist');

function emittedFiles(dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? emittedFiles(full) : [full];
  });
}

test.describe('BJ-0 scaffold', () => {
  test('serves the built bundle and runs the compiled entry module', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    // The boot marker only exists if the TypeScript entry compiled, shipped and
    // executed. Without it a bundle of nothing at all would pass this gate.
    await expect(page.locator('html')).toHaveAttribute('data-game', 'blackjack');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('requests nothing beyond the host it was served from', async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', (request) => {
      if (baseURL !== undefined && !request.url().startsWith(baseURL)) {
        foreign.push(request.url());
      }
    });

    await page.goto('/');

    // Wait on the application rather than on the network. `networkidle` is
    // Playwright's own discouraged API: it resolves after 500 ms with no
    // in-flight request, and that quiet window is measured on the page's event
    // loop. Since BJ-15 the page runs a real-time render loop, so a machine
    // running the whole three-engine matrix in parallel can defer the window
    // past the test timeout, which is a gate that fails for a reason unrelated
    // to what it grades. The chrome being on the page is the stronger wait
    // anyway: the composition root has run to completion, so every request the
    // game makes at startup has already been issued.
    await expect(page.locator('.bj-shell')).toBeVisible();

    expect(foreign).toEqual([]);
  });

  test('emits only relative references, so it runs from any directory', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined);

    expect(references.length).toBeGreaterThan(0);
    const absolute = references.filter(
      (value) => value.startsWith('/') || /^[a-z]+:/i.test(value),
    );
    expect(absolute).toEqual([]);
  });

  test('carries no build-time configuration into the emitted bytes', () => {
    const files = emittedFiles();
    expect(files.length).toBeGreaterThan(1);

    const offenders: string[] = [];
    for (const file of files) {
      if (statSync(file).size > 2_000_000) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      for (const needle of ['process.env', 'import.meta.env', 'VITE_']) {
        if (text.includes(needle)) {
          offenders.push(`${file}: ${needle}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
