/**
 * BJ-22, items H4 and H7: timed screens must not resize the play surface merely
 * because their control row contains a status line instead of actions.
 *
 * The performance instrument located its only repeated long task at the first
 * betting-to-dealing transition. The 76 px betting row collapsed to 24 px,
 * growing the canvas from 1029 x 579 to 1121 x 631 and reallocating both backing
 * stores under a 4x CPU throttle. This assertion pins the rendered cause rather
 * than a timing number: timing varies by host, while an equal backing-store size
 * is the property that makes the expensive compositor commit unnecessary.
 */

import { expect, test } from '@playwright/test';

import { bootGame, chip, control, settle, waitForPhase } from './support/game';

test.use({ viewport: { width: 1280, height: 800 } });

interface SurfaceSize {
  readonly width: number;
  readonly height: number;
}

async function surfaceSize(page: Parameters<typeof bootGame>[0]): Promise<SurfaceSize> {
  return page.locator('.bj-surface').evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));
}

test('H4 and H7: the first timed phase keeps the action-phase backing store', async ({ page }) => {
  await bootGame(page, { seed: 1, alwaysReduceMotion: true });
  await control(page, 'start').click();
  await waitForPhase(page, 'betting');
  await settle(page);
  const betting = await surfaceSize(page);

  await chip(page, 50).click();
  await control(page, 'deal').click();
  await waitForPhase(page, 'dealing');
  await settle(page);

  expect(await surfaceSize(page)).toEqual(betting);
});
