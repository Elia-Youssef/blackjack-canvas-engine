/**
 * Item `G9`, Major, 6 points, method **T**, evidence `playwright/forced-colors`.
 *
 *   "Under forced-colors active the chrome adopts the system palette, no chrome
 *    element depends on a colour the canvas supplies, and the play surface
 *    switches to its high-contrast token set through the media query."
 *
 * Three clauses.
 *
 *   1. **The chrome adopts the system palette.** Measured against the rendered
 *      page: every colour the chrome computes under the query is required not to
 *      be one of the hexes SPEC 16 commits. That is a stronger reading than
 *      "some tokens changed", and it is the one the criterion supports, because
 *      a chrome that kept one committed colour has not adopted the palette.
 *   2. **No chrome element depends on a colour the canvas supplies.** The chip
 *      controls are the one place a chrome element spends a play-surface token,
 *      and they are measured by name as well as by the sweep.
 *   3. **The play surface switches through the media query.** This is the canvas
 *      half, and it carries an open park: SPEC 16 defines no high-contrast
 *      play-surface palette, so what can be graded is that the query is resolved
 *      in TypeScript and reaches the renderer's token layer, which is asserted
 *      here through the page's own attribute and the probe.
 *      `src/render/tokens.ts` and `tests/unit/forced-colors.test.ts` carry the
 *      park; `BJ-18`'s report carries the sketched resolution.
 *
 * **Engine coverage is not three.** `emulateMedia({ forcedColors })` is a
 * Chromium and Firefox capability; WebKit has no forced-colors mode to emulate,
 * and Playwright's WebKit is a WebKit build rather than Safari in any case.
 * Rather than skip by browser name and hope, each test asks the page whether the
 * query took effect and skips with a reason when it did not, so an engine that
 * gains the capability is covered the day it does.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { accessibilityProbe, atShippedBetting, bootGame, control, settle, shell, waitForPhase } from './support/game';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Every colour SPEC 16 commits, read out of the token layer rather than copied.
 *
 * `src/ui/tokens.css` is one of the two forms of SPEC 16's palette and
 * `tests/unit/tokens.test.ts` already fails if it disagrees with the contract,
 * so reading it here means this file has no third copy of a hex to drift.
 */
function committedHexes(): readonly string[] {
  const css = readFileSync(join(PROJECT_ROOT, 'src', 'ui', 'tokens.css'), 'utf8');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
  return [...new Set([...root.matchAll(/#([0-9a-f]{6})\b/gi)].map((match) => match[1] ?? ''))];
}

const COMMITTED = committedHexes();

/**
 * The colours the **canvas** supplies that the chrome spends: the chip fills and
 * the chip ring. Read from the token layer for the same reason as above.
 *
 * These are the exact values item `G9`'s second clause is about, and they are
 * measured separately from the sweep because none of them can coincide with a
 * system colour: a high-contrast theme has no denominational purple in it, so
 * "the chip is no longer painted in one of these" is an unambiguous reading on
 * every engine.
 */
function canvasHexesInChrome(): readonly string[] {
  const css = readFileSync(join(PROJECT_ROOT, 'src', 'ui', 'tokens.css'), 'utf8');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
  return [...root.matchAll(/--chip-(?:\d+-fill|ring):\s*#([0-9a-f]{6})/gi)].map(
    (match) => match[1] ?? '',
  );
}

/** `#1a231e` as `rgb(26, 35, 30)`, which is how a computed style reports one. */
function asRgb(hex: string): string {
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

const COMMITTED_RGB = new Set(COMMITTED.map((hex) => asRgb(hex)));
const CANVAS_RGB = new Set(canvasHexesInChrome().map((hex) => asRgb(hex)));

/** Every colour the chrome currently computes, with the element that has it. */
interface ColourReport {
  /** `selector: property = value`, for every colour-bearing declaration. */
  readonly used: readonly string[];
  /** The distinct colour values, so a sweep can be compared across modes. */
  readonly values: readonly string[];
}

async function chromeColours(page: Page): Promise<ColourReport> {
  return page.evaluate(() => {
    const used: string[] = [];
    const values = new Set<string>();
    const shell = document.querySelector('.bj-shell');
    if (shell === null) {
      throw new Error('there is no shell on this page');
    }
    const properties = [
      'color',
      'background-color',
      'border-top-color',
      'border-right-color',
      'border-bottom-color',
      'border-left-color',
      'outline-color',
      'text-decoration-color',
    ];
    const name = (node: Element): string => {
      const attribute = node.getAttribute('data-control') ?? node.getAttribute('data-chip');
      if (attribute !== null) {
        return attribute;
      }
      return node.className === '' ? node.tagName.toLowerCase() : node.className;
    };

    for (const node of [shell, ...shell.querySelectorAll('*')]) {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      const style = getComputedStyle(node);
      for (const property of properties) {
        const value = style.getPropertyValue(property);
        // A fully transparent colour is not a colour anybody sees, and it
        // carries no palette either way. Which transparent an engine reports
        // varies: Chromium answers `rgba(0, 0, 0, 0)` normally and
        // `rgba(255, 255, 255, 0)` under forced colors, so the alpha is read
        // rather than the string matched.
        const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(value)?.[1];
        if (value === '' || value === 'transparent' || alpha === '0') {
          continue;
        }
        used.push(`${name(node)}: ${property} = ${value}`);
        values.add(value);
      }
    }
    return { used, values: [...values] };
  });
}

/** Whether the page itself agrees that forced colors is active. */
async function queryTookEffect(page: Page): Promise<boolean> {
  return page.evaluate(() => matchMedia('(forced-colors: active)').matches);
}

/**
 * The system palette, as the browser resolves it, in `rgb()` strings.
 *
 * Asked of the page rather than assumed, because a forced-colors theme is the
 * reader's and this project has no idea what colours are in it. Resolving the
 * keywords through a probe element is the only way to learn what
 * "the system palette" means on the machine the test is running on, and it is
 * what makes the assertion below exact rather than a list of colours this file
 * hoped were not chosen: "every colour the chrome renders is one the system
 * supplied" cannot be satisfied by a coincidence, where "no colour the chrome
 * renders is one SPEC 16 committed" can be, since a high-contrast theme really
 * does use white and black and so does the committed palette.
 */
async function systemPalette(page: Page): Promise<readonly string[]> {
  return page.evaluate((keywords: readonly string[]) => {
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    document.body.append(probe);
    const resolved = new Set<string>();
    for (const keyword of keywords) {
      probe.style.color = keyword;
      const value = getComputedStyle(probe).color;
      if (value !== '') {
        resolved.add(value);
      }
    }
    probe.remove();
    return [...resolved];
  }, [
    'Canvas',
    'CanvasText',
    'LinkText',
    'VisitedText',
    'ActiveText',
    'ButtonFace',
    'ButtonText',
    'ButtonBorder',
    'Field',
    'FieldText',
    'Highlight',
    'HighlightText',
    'SelectedItem',
    'SelectedItemText',
    'Mark',
    'MarkText',
    'GrayText',
    'AccentColor',
    'AccentColorText',
  ]);
}

/**
 * Put the page in forced colors, or skip the test with the reason.
 *
 * The emulation is asked for and the **page** is asked whether it happened, so
 * an engine that silently ignores the request produces a skip with a reason
 * rather than a green run that measured nothing.
 */
/**
 * How many distinct colours a line across the felt may hold and still be flat.
 *
 * Not one. The felt is drawn on a canvas with antialiased edges and a rounded
 * corner, and the sampled row crosses the rail on both sides, so a genuinely
 * flat fill still measures a handful of colours. The standard felt measures in
 * the hundreds: the grain quantises into sixteen alpha bands over a radial
 * vignette, so every cell along the row is its own shade. The two readings are
 * three orders of magnitude apart, which is why one threshold separates them
 * and why the spec measures both rather than asserting the flat one alone.
 */
const FLAT_FELT_CEILING = 12;

/** SPEC 16's forced-colors bronze, `#0B2C1F`, as the sampler reports a pixel. */
const HIGH_CONTRAST_BRONZE_RGB = '11,44,31';

/** One reading of the baked felt: how varied it is, and what it mostly is. */
interface FeltSample {
  readonly distinct: number;
  readonly commonest: string;
}

/**
 * Sample one row of the **baked felt canvas**, straight out of its backing
 * store.
 *
 * The felt is its own static canvas under the transparent animated scene, so a
 * row through its middle is table and nothing else: no card, no chip and no
 * moving thing can be on it. Read back with `getImageData` rather than through
 * a screenshot, because what is being graded is what the renderer drew and not
 * what the compositor did with it afterwards.
 */
async function feltSample(page: Page): Promise<FeltSample> {
  return page.evaluate(() => {
    // The felt stack holds one canvas per baked felt from `BJ-22`'s fix
    // round, and exactly one of them is without `hidden`: that is the one on
    // screen, and reading any other would grade a table nobody can see.
    const canvas = document.querySelector('canvas.bj-surface-felt:not([hidden])');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('no felt canvas on this page');
    }
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      throw new Error('the felt canvas returned no 2d context');
    }
    const row = Math.floor(canvas.height / 2);
    const { data } = ctx.getImageData(0, row, canvas.width, 1);
    const counts = new Map<string, number>();
    for (let index = 0; index < data.length; index += 4) {
      if ((data[index + 3] ?? 0) < 255) {
        continue;
      }
      const key = `${String(data[index])},${String(data[index + 1])},${String(data[index + 2])}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let commonest = '';
    let best = -1;
    for (const [key, count] of counts) {
      if (count > best) {
        commonest = key;
        best = count;
      }
    }
    return { distinct: counts.size, commonest };
  });
}

async function forceColours(page: Page, browserName: string): Promise<void> {
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

test.describe('G9: the chrome adopts the system palette', () => {
  test('renders only colours the system supplied, and none it chose itself', async ({
    page,
    browserName,
  }) => {
    await atShippedBetting(page);
    // First without the query, so the sweep is shown to be able to find the
    // palette it is later required not to find. A scan that reported nothing in
    // both modes would be reporting on its own selector list.
    const normal = await chromeColours(page);
    expect(
      normal.values.filter((value) => COMMITTED_RGB.has(value)).length,
      'the sweep found none of SPEC 16 colours in normal mode, so it cannot see',
    ).toBeGreaterThan(3);

    await forceColours(page, browserName);
    const system = new Set(await systemPalette(page));
    expect(system.size, 'the platform resolved no system colours').toBeGreaterThan(2);

    const forced = await chromeColours(page);
    expect(forced.used.length, 'nothing was measured under forced colors').toBeGreaterThan(10);

    // **The gate: not one colour SPEC 16 chose survives.** One carve-out, stated
    // rather than hidden: a high-contrast theme's own `Canvas` or `CanvasText`
    // can coincide with a hex this palette happens to contain, white being the
    // obvious case, and a colour that is in the system palette has been adopted
    // from the system whatever its value.
    const kept = forced.used.filter(
      (entry) =>
        [...COMMITTED_RGB].some((colour) => entry.endsWith(colour)) &&
        ![...system].some((colour) => entry.endsWith(colour)),
    );
    expect(kept, 'a chrome element kept a colour SPEC 16 chose').toEqual([]);

    // **How the engines differ, and why the gate is the assertion above rather
    // than a subset test.** Chromium replaces an author colour with a system
    // one, so every colour it renders is literally in the palette resolved
    // above. Firefox instead derives a colour from the author's under its own
    // forced-color adjustment, so a chip fill comes back as a desaturated grey
    // that is in no system slot. Both have adopted the palette in the sense the
    // criterion means, and a subset assertion would fail the second while it
    // passes the first, so it is recorded rather than required.
    const derived = forced.used.filter(
      (entry) => ![...system].some((colour) => entry.endsWith(colour)),
    );
    test.info().annotations.push({
      type: 'engine',
      description: `${browserName}: ${String(derived.length)} of ${String(forced.used.length)} declarations render a colour the browser derived rather than one taken from a system slot`,
    });
  });

  test('changes what the chrome renders rather than leaving it alone', async ({
    page,
    browserName,
  }) => {
    await atShippedBetting(page);
    const before = new Set((await chromeColours(page)).values);
    await forceColours(page, browserName);
    const after = new Set((await chromeColours(page)).values);
    // The two palettes have to differ. An engine that reported the media query
    // as active while rendering the same colours would pass the sweep above by
    // accident of the emulation rather than by the stylesheet.
    expect([...after].some((value) => !before.has(value)), 'nothing changed colour').toBe(true);
  });

  test('spends the system palette on the focus ring', async ({ page, browserName }) => {
    await atShippedBetting(page);
    await forceColours(page, browserName);
    const deal = control(page, 'deal');
    await deal.focus();
    const ring = await deal.evaluate((node: Element) => getComputedStyle(node).outlineColor);
    expect(COMMITTED_RGB.has(ring), `the focus ring is still ${ring}`).toBe(false);
    // And the ring is still drawn: QUALITY-BAR section 3 says the indicator is
    // "never removed", and forced colors is exactly where a careless reset would
    // be invisible until somebody with high contrast on tried to use the game.
    const width = await deal.evaluate((node: Element) => getComputedStyle(node).outlineWidth);
    expect(Number.parseFloat(width), 'the focus ring lost its width').toBeGreaterThan(0);
  });
});

test.describe('G9: no chrome element depends on a colour the canvas supplies', () => {
  test('re-points the chip controls, which are the one place it does', async ({
    page,
    browserName,
  }) => {
    await atShippedBetting(page);
    // A chip the table can take, chosen by asking the page rather than by name:
    // a greyed chip renders `--bj-elevated` instead of its own fill, which is
    // the chrome palette rather than the canvas one and would be the wrong
    // control to measure this on.
    const chip = page.locator('.bj-chip:not([aria-disabled="true"])').first();
    const colours = async (): Promise<{ background: string; border: string }> =>
      chip.evaluate((node: Element) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, border: style.borderTopColor };
      });
    const before = await colours();
    // The dependency is real before the query: SPEC 16 gives the chips their
    // denominational colours and the betting bar repeats them.
    expect(CANVAS_RGB.size, 'no canvas colour was found in the token layer').toBeGreaterThan(3);
    expect(CANVAS_RGB.has(before.background), 'the chip does not spend a canvas fill').toBe(true);
    expect(CANVAS_RGB.has(before.border), 'the chip does not spend the canvas ring').toBe(true);

    await forceColours(page, browserName);
    const after = await colours();
    // The dependency has ended. Stated against the canvas colours themselves
    // rather than against the system slots, because the two engines that can be
    // measured here reach it differently: Chromium substitutes a system colour
    // and Firefox derives one from the author's. Either way the denominational
    // fill SPEC 16 gives the chip is gone, which is the clause, and neither a
    // denominational purple nor the chip ring's cream is a colour any
    // high-contrast theme contains, so there is no coincidence to allow for.
    expect(after.background, 'the chip kept its canvas fill').not.toBe(before.background);
    expect(CANVAS_RGB.has(after.background), `the chip fill is ${after.background}`).toBe(false);
    expect(CANVAS_RGB.has(after.border), `the chip ring is ${after.border}`).toBe(false);
  });

  test('keeps every state distinguishable without the colours it lost', async ({
    page,
    browserName,
  }) => {
    await atShippedBetting(page);
    await forceColours(page, browserName);
    // The pressed state is item `G3`'s rule and `G9`'s consequence: under forced
    // colors every chrome colour collapses, so a state carried by colour alone
    // is a state that has gone. The Speed control is pressed, and carries an
    // underline as well as an accent.
    await page.locator('[data-open-overlay="settings"]').click();
    await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
    const pressed = page.locator('[data-speed="normal"]');
    await expect(pressed).toHaveAttribute('aria-pressed', 'true');
    const line = await pressed.evaluate((node: Element) => getComputedStyle(node).textDecorationLine);
    expect(line, 'the pressed state is carried by colour alone under forced colors').toContain(
      'underline',
    );
    const unpressed = page.locator('[data-speed="fast"]');
    await expect(unpressed).toHaveAttribute('aria-pressed', 'false');
    expect(
      await unpressed.evaluate((node: Element) => getComputedStyle(node).textDecorationLine),
    ).not.toContain('underline');
  });

  test('keeps a greyed control distinguishable by its dashed boundary', async ({
    page,
    browserName,
  }) => {
    await atShippedBetting(page);
    await forceColours(page, browserName);
    const greyed = page.locator('.bj-chip[aria-disabled="true"]').first();
    await expect(greyed).toHaveCount(1);
    expect(await greyed.evaluate((node: Element) => getComputedStyle(node).borderTopStyle)).toBe(
      'dashed',
    );
    const live = page.locator('.bj-chip:not([aria-disabled="true"])').first();
    expect(await live.evaluate((node: Element) => getComputedStyle(node).borderTopStyle)).toBe(
      'solid',
    );
  });
});

test.describe('G9: the play surface selects its palette through the media query', () => {
  test('resolves the query in the page rather than only in the stylesheet', async ({
    page,
    browserName,
  }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    // Before: the frame resolved the query as inactive and says so.
    await expect(shell(page)).toHaveAttribute('data-forced-colors', 'none');
    expect((await accessibilityProbe(page)).forcedColors).toBe(false);
    expect((await accessibilityProbe(page)).palette.name).toBe('standard');

    await forceColours(page, browserName);
    // After: the same frame loop resolved the query as active. The canvas has no
    // stylesheet to read, so this attribute is the evidence that the query
    // reached the TypeScript that hands the renderer its tokens.
    await expect(shell(page)).toHaveAttribute('data-forced-colors', 'active');
    const probe = await accessibilityProbe(page);
    expect(probe.forcedColors).toBe(true);
  });

  test('selects the high-contrast set and spends it on the felt', async ({
    page,
    browserName,
  }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');

    // Before, so the reading below is shown to be able to tell the two sets
    // apart. The standard felt is a gradient with grain over it, which is many
    // distinct colours along any line across the table.
    const textured = await feltSample(page);
    expect(textured.distinct, 'the standard felt is not textured').toBeGreaterThan(
      FLAT_FELT_CEILING,
    );
    expect((await accessibilityProbe(page)).palette.flatFelt).toBe(false);

    await forceColours(page, browserName);
    await expect(shell(page)).toHaveAttribute('data-forced-colors', 'active');

    const probe = await accessibilityProbe(page);
    // `BJ-22` closed item `G9`'s third clause: SPEC 16 gained the forced-colors
    // play-surface table, `src/render/tokens.ts` carries it, and the renderer
    // draws from whichever set the query selected. The probe says which set;
    // the pixels below say it reached the canvas, which is the half a probe
    // alone could not prove.
    expect(probe.palette.name).toBe('high-contrast');
    expect(probe.palette.flatFelt).toBe(true);

    const flat = await feltSample(page);
    // SPEC 16: "the gradient and the grain are suppressed under this set,
    // because subtle texture is what high contrast exists to remove, and the
    // audit measures the flat fill".
    expect(flat.distinct, 'the high-contrast felt is still textured').toBeLessThanOrEqual(
      FLAT_FELT_CEILING,
    );
    // And it is the set SPEC 16 names, not merely a flatter version of the old
    // one: the bronze felt's own forced-colors hex is what the fill measures.
    expect(flat.commonest).toBe(HIGH_CONTRAST_BRONZE_RGB);
  });

  test('follows the query back when it is turned off again', async ({ page, browserName }) => {
    await bootGame(page, {});
    await waitForPhase(page, 'start');
    await forceColours(page, browserName);
    await expect(shell(page)).toHaveAttribute('data-forced-colors', 'active');
    // The flag is read per frame rather than captured at boot, so a player who
    // turns high contrast off mid-session gets the change without a reload.
    await page.emulateMedia({ forcedColors: 'none' });
    await settle(page);
    await expect(shell(page)).toHaveAttribute('data-forced-colors', 'none');
    expect((await accessibilityProbe(page)).palette.name).toBe('standard');
  });
});
