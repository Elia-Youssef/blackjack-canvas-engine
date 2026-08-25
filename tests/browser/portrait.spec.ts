/**
 * Item `F3`, Major, 14 points, over the built `dist/`.
 *
 *   "Portrait is a genuine re-arrangement of the chrome and is fully functional,
 *    not a scaled-down landscape layout."
 *
 * Two clauses, and the first one is a comparison rather than a description: the
 * word "genuine" only means anything against the thing it is being distinguished
 * from. So every assertion below is written as a **discriminator**, a structural
 * fact that a scaled-down landscape would fail, measured at portrait and again at
 * `wide` in the same session on the same page:
 *
 *   1. **The type does not shrink.** A scaled layout is the same layout at a
 *      smaller size, so its text is smaller. The computed font size of a readout
 *      and of a button, and the button's minimum target, are required to be
 *      **identical** at both, to the pixel. This is the discriminator a
 *      screenshot comparison would most easily miss and a person would most
 *      easily notice.
 *   2. **The chrome regroups.** DESIGN section 4 gives the narrow top bar
 *      "chips, wager and hand value" and puts everything else behind a
 *      disclosure. At portrait exactly three of SPEC 11's fourteen readouts are
 *      on the bar and a disclosure control exists; at `wide` all fourteen are on
 *      the bar and the disclosure control is not rendered. A scaled landscape
 *      shows the same fourteen at both.
 *   3. **The play surface is re-framed, not squashed.** DESIGN section 4: "the
 *      play surface renders a portrait framing of the same logical space rather
 *      than a squashed landscape one". The canvas is taller than it is wide at
 *      portrait and wider than it is tall at `wide`, and its portrait aspect is
 *      the framing's own. A scaled landscape reports the same aspect twice.
 *   4. **The bars stick and the regions stack.** Top bar, then surface, then
 *      controls, in DESIGN section 4's own order, each spanning the width, with
 *      both bars `position: sticky` as that section's diagram labels them.
 *
 * "Fully functional" is the second clause and is asserted as function rather than
 * as presence: the eleven readouts behind the disclosure are opened and compared
 * value for value against what `wide` showed for the same game, and a whole round
 * is played at 390 x 844 through the page's own controls, from the chip tap to
 * the next hand.
 *
 * **Route.** The shipped page, driven through its own controls, with nothing
 * injected. Everything this item claims is reachable on a Bronze table.
 */

import { expect, test, type Page } from '@playwright/test';

import { SURFACE_FRAMING } from '../../src/ui/breakpoints';
import { READOUT_KEYS, PRIMARY_READOUT_KEYS } from '../../src/ui/components/readouts';
import {
  atShippedBetting,
  chip,
  control,
  layoutReport,
  numberIn,
  readoutValue,
  resizeTo,
  settle,
  surfaceMetrics,
  waitForPhase,
  type LayoutReport,
} from './support/game';

/** One phone in its natural orientation, and one desktop. */
const PORTRAIT = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 800 };

const WAGER = 50;

/** Every readout the page is showing right now, by key. */
function visibleReadouts(report: LayoutReport): string[] {
  return report.readouts.filter((entry) => entry.visible).map((entry) => entry.key);
}

/** Read all fourteen readouts as text, whatever bar or panel they are on. */
async function readoutTexts(page: Page): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const key of READOUT_KEYS) {
    values[key] = (await readoutValue(page, key).textContent()) ?? '';
  }
  return values;
}

test.describe('F3: portrait is a re-arrangement, not a scale', () => {
  test('keeps the chrome at its own size while regrouping it', async ({ page }) => {
    await page.setViewportSize(WIDE);
    await atShippedBetting(page);
    await settle(page);
    const wide = await layoutReport(page);

    await resizeTo(page, PORTRAIT.width, PORTRAIT.height);
    const portrait = await layoutReport(page);

    expect(wide.breakpoint).toBe('wide');
    expect(portrait.breakpoint).toBe('portrait');

    // Discriminator 1. A scaled-down landscape is smaller type; this is the same
    // type in a different arrangement.
    expect(portrait.styles.readoutFontSize, 'a readout shrank').toBe(
      wide.styles.readoutFontSize,
    );
    expect(portrait.styles.buttonFontSize, 'a button label shrank').toBe(
      wide.styles.buttonFontSize,
    );
    expect(portrait.styles.buttonMinHeight, 'the touch target shrank').toBe(
      wide.styles.buttonMinHeight,
    );

    // Discriminator 2. The bar carries three of fourteen, and the eleven have a
    // control that reaches them.
    expect(visibleReadouts(wide).length, 'wide shows all fourteen').toBe(READOUT_KEYS.length);
    expect(visibleReadouts(portrait).sort(), 'portrait shows DESIGN section 4s three').toEqual(
      [...PRIMARY_READOUT_KEYS].sort(),
    );
    expect(wide.styles.summaryDisplay, 'wide needs no disclosure control').toBe('none');
    expect(portrait.styles.summaryDisplay, 'portrait has no disclosure control').not.toBe('none');

    // Discriminator 4. The three regions stack in DESIGN section 4's order and
    // each spans the width it was given.
    const top = portrait.regions.top;
    const body = portrait.regions.body;
    const controls = portrait.regions.controls;
    expect(top).not.toBeNull();
    expect(body).not.toBeNull();
    expect(controls).not.toBeNull();
    if (top !== null && body !== null && controls !== null) {
      expect(top.y + top.height).toBeLessThanOrEqual(body.y + 1);
      expect(body.y + body.height).toBeLessThanOrEqual(controls.y + 1);
      for (const region of [top, body, controls]) {
        expect(region.width, 'a region does not span the viewport').toBeGreaterThan(
          PORTRAIT.width * 0.8,
        );
      }
    }
    expect(portrait.styles.topPosition, 'the top bar is not sticky').toBe('sticky');
    expect(portrait.styles.controlsPosition, 'the bottom bar is not sticky').toBe('sticky');
    expect(portrait.stickyBars).toBe('on');
  });

  test('re-frames the play surface instead of squashing the landscape one', async ({ page }) => {
    await page.setViewportSize(WIDE);
    await atShippedBetting(page);
    await settle(page);
    const wide = await surfaceMetrics(page);

    await resizeTo(page, PORTRAIT.width, PORTRAIT.height);
    const portrait = await surfaceMetrics(page);

    const wideAspect = wide.cssWidth / wide.cssHeight;
    const portraitAspect = portrait.cssWidth / portrait.cssHeight;

    // Discriminator 3, in both directions. A scaled landscape reports the same
    // aspect at both viewports; these two are on opposite sides of 1.
    expect(wideAspect, 'the landscape framing is not landscape').toBeGreaterThan(1);
    expect(portraitAspect, 'the portrait framing is not portrait').toBeLessThan(1);
    expect(portraitAspect).toBeCloseTo(
      SURFACE_FRAMING.portrait.width / SURFACE_FRAMING.portrait.height,
      1,
    );
    expect(wideAspect).toBeCloseTo(
      SURFACE_FRAMING.landscape.width / SURFACE_FRAMING.landscape.height,
      1,
    );

    // And the surface really uses the height the portrait framing exists to
    // claim: a 16:9 surface at 390 px wide would be about 206 px tall, and the
    // row it sits in is several times that.
    const body = (await layoutReport(page)).regions.body;
    expect(body).not.toBeNull();
    expect(portrait.cssHeight, 'the portrait surface is a letterbox band').toBeGreaterThan(
      (portrait.cssWidth * SURFACE_FRAMING.landscape.height) / SURFACE_FRAMING.landscape.width + 1,
    );
    if (body !== null) {
      expect(portrait.cssHeight, 'the surface leaves the row mostly empty').toBeGreaterThan(
        body.height * 0.6,
      );
    }
  });
});

test.describe('F3: portrait is fully functional', () => {
  test('reaches all fourteen readouts, with the same values wide showed', async ({ page }) => {
    await page.setViewportSize(WIDE);
    await atShippedBetting(page);
    await settle(page);
    const atWide = await readoutTexts(page);

    await resizeTo(page, PORTRAIT.width, PORTRAIT.height);
    // The eleven are in the page the whole time; the disclosure is what makes
    // them visible. Opening it is the player's own route, one control, and after
    // it every one of the fourteen has a rendered box again.
    await page.locator('[data-control="more-readouts"]').click();
    await settle(page);

    const opened = await layoutReport(page);
    expect(visibleReadouts(opened).sort(), 'the disclosure did not reveal all fourteen').toEqual(
      [...READOUT_KEYS].sort(),
    );
    const atPortrait = await readoutTexts(page);
    expect(atPortrait, 'a readout says something different at portrait').toEqual(atWide);
  });

  test('plays a whole round at 390 by 844 through its own controls', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await atShippedBetting(page);
    await settle(page);

    // The wager readout is one of the three the narrow bar keeps, so the chip
    // tap is visible in the chrome without opening anything.
    await chip(page, WAGER).click();
    // Polled, because the tap is queued and drained on the next frame: the
    // readout is the machine's answer, not the button's.
    await expect
      .poll(async () => numberIn(readoutValue(page, 'wager')), {
        message: 'the chip tap never reached the wager readout',
      })
      .toBe(WAGER);

    await control(page, 'deal').click();
    // The round can settle on a natural before the player acts, which is a legal
    // round; either way it reaches a screen with a control on it.
    await expect(page.locator('.bj-shell')).not.toHaveAttribute('data-phase', 'betting');

    for (let step = 0; step < 40; step += 1) {
      const phase = await page.locator('.bj-shell').getAttribute('data-phase');
      if (phase === 'roundResult') {
        break;
      }
      if (phase === 'insurance') {
        await page.locator('[data-control="decline-insurance"]').click();
      } else if (phase === 'playerTurn') {
        await page.locator('[data-action="stand"]').click();
      }
      await page.waitForTimeout(120);
    }
    await waitForPhase(page, 'roundResult');

    // SPEC 12's result is on the screen at 390 px wide, and the round closes
    // back to the betting screen, which is the whole loop a player repeats.
    await expect(page.locator('[data-screen="round-result"]')).toBeVisible();
    await control(page, 'next-hand').click();
    await waitForPhase(page, 'betting');

    const report = await layoutReport(page);
    expect(report.breakpoint).toBe('portrait');
    for (const entry of report.controls) {
      expect(entry.hit, `${entry.key} became unreachable during the round`).toBe('self');
    }
  });
});
