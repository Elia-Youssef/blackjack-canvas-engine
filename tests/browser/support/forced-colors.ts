/**
 * Forced-colors emulation, and whether the engine took it.
 *
 * Both halves used to live in `tests/browser/forced-colors.spec.ts` with a
 * verbatim copy in `tests/browser/error-boundary.spec.ts`, whose own header
 * said so: the copy was made deliberately, "for the reason the caller gives:
 * two engines emulate this and naming one of them skipped the other". That
 * reason is a reason to have one implementation, not two, and this is where it
 * lives now.
 *
 * The skip is a measurement rather than a browser name, which is the part worth
 * keeping: an engine is asked to emulate, and then the **page** is asked whether
 * the query took, so an engine that quietly ignores the request is handled the
 * same way as one that refuses it out loud. `no-skips-reporter.ts` is the other
 * half of that arrangement: the suite runs 0 skipped today, and a skip taken
 * here now fails the run rather than passing quietly.
 */

import { test, type Page } from '@playwright/test';

import { settle } from './game';

/** Whether the page itself agrees that forced colors is active. */
export async function queryTookEffect(page: Page): Promise<boolean> {
  return page.evaluate(() => matchMedia('(forced-colors: active)').matches);
}

/** Turn forced colors on, or skip the caller where the engine cannot. */
export async function forceColours(page: Page, browserName: string): Promise<void> {
  await page.emulateMedia({ forcedColors: 'active' }).catch(() => {
    // The engine has no forced-colors emulation at all. The check below turns
    // that into a skip; swallowing it here would be a bare catch, so the reason
    // is recorded rather than dropped.
    test.info().annotations.push({
      type: 'engine',
      description: `${browserName} rejected the forced-colors emulation`,
    });
  });
  await settle(page);
  test.skip(
    !(await queryTookEffect(page)),
    `${browserName} does not emulate forced-colors, so this criterion is unmeasurable here`,
  );
}
