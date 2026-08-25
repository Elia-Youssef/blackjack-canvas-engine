/**
 * Item `G1`, Critical, 8 points, method **T**, evidence `playwright/axe`.
 *
 *   "An automated accessibility scan with all WCAG 2.2 A and AA rules enabled
 *    reports no violations on every screen and overlay, excluding the
 *    colour-contrast, lang, landmark and heading rules graded by G2 and G6.
 *    Passing is a precondition for the manual items, never a substitute."
 *
 * **The last sentence is the most important one in this file and it is repeated
 * here so nobody has to look it up.** An automated scan detects roughly a third
 * of WCAG failures and none of the mirror-adequacy criteria: a page consisting
 * of one unlabelled canvas passes it cleanly, and so would a page whose mirror
 * was empty, whose live regions never spoke and whose hand names were nonsense.
 * `G4` is a Demonstration item for that reason and closes at a screen reader
 * session, not here. Nothing in this file is evidence for `G4`, and a green run
 * here means only that the page has no defect of the kind a scanner can see.
 *
 * **The exclusion list is fixed and asserted.** The criterion names four
 * families, and a fifth exclusion added later would quietly narrow a Critical
 * gate: so the list below is written out, every id in it is required to be a
 * real axe rule, and every id is required to belong to one of the four families
 * by name. A typo would otherwise disable nothing and read as an exclusion, and
 * a widened list would disable something nobody agreed to.
 *
 * **The scan is required not to be vacuous.** A tag that selects no rules, an
 * axe that failed to inject, or a context that resolved to nothing all produce
 * an empty violation list, which is the same answer a clean page gives. So every
 * run asserts that rules were selected, that they were applied to this page, and
 * that at least one of them passed; and one test plants a defect the scan is
 * required to find, which is the control that makes the rest of the file
 * evidence rather than decoration.
 *
 * **Routes.** The start screen, the betting screen and the three overlays run on
 * the **shipped page** with nothing injected, because a player reaches every one
 * of them on a launch they can actually make. SPEC 4.7's offer, the player's
 * turn, SPEC 12's result and SPEC 4.12's bust-out are deals rather than screens,
 * so they take the seeded harness, exactly as `input-parity.spec.ts` does and for
 * the same reason.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import type { PhaseKind } from '../../src/core/types';
import { BUST_OUT_WAGER, bustOutSeed } from './support/action-seeds';
import {
  atShippedBetting,
  bootGame,
  chooseInSettings,
  control,
  openShippedPage,
  pressOn,
  settle,
  waitForPhase,
} from './support/game';
import { peekSeed } from './support/peek-seeds';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * axe-core's own bundle, injected into the served page at test time.
 *
 * A dev dependency and a test-time injection, never a shipped import: nothing
 * under `src/` names it, and `npm run verify:build` fingerprints the same bytes
 * with and without it installed. It is the same treatment
 * `tests/browser/support/game-harness.ts` and `render-demo.ts` already have.
 */
const AXE = readFileSync(join(PROJECT_ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

/**
 * "All WCAG 2.2 A and AA rules", as axe tags them.
 *
 * axe carries one tag per WCAG level per version, and a rule introduced by a
 * later version is tagged only by that version, so all of them are needed to
 * mean "2.2 A and AA". `SELECTED_FLOOR` below is what stops a mistyped tag from
 * quietly selecting nothing.
 */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * The four families the criterion excludes, by rule id.
 *
 * Grouped by family so that the assertion below can require each id to belong
 * to the family it is filed under. `G2` grades contrast against rendered pixels
 * at `BJ-22`, which is a stronger measurement than this rule performs; `G6`
 * grades `lang`, the landmarks and the single `h1` by checklist, because "a
 * meaningful landmark" is a judgement a scanner cannot make.
 */
const EXCLUDED = Object.freeze({
  contrast: ['color-contrast', 'color-contrast-enhanced'],
  lang: ['html-has-lang', 'html-lang-valid', 'html-xml-lang-mismatch', 'valid-lang'],
  landmark: [
    'landmark-one-main',
    'landmark-no-duplicate-banner',
    'landmark-no-duplicate-contentinfo',
    'landmark-no-duplicate-main',
    'landmark-unique',
    'landmark-complementary-is-top-level',
    'landmark-banner-is-top-level',
    'landmark-contentinfo-is-top-level',
    'landmark-main-is-top-level',
    'region',
  ],
  heading: ['heading-order', 'empty-heading', 'page-has-heading-one', 'p-as-heading'],
});

const EXCLUDED_IDS: readonly string[] = Object.freeze(Object.values(EXCLUDED).flat());

/**
 * The fewest rules a WCAG A and AA selection may contain before this file
 * assumes the tag list is wrong rather than the page clean.
 *
 * Deliberately far below what axe actually selects, so an axe upgrade that
 * retires a rule does not turn this into a maintenance chore, and far above
 * zero, which is the number a mistyped tag produces.
 */
const SELECTED_FLOOR = 30;

/** One violation, flattened to what a failure message needs. */
interface Violation {
  readonly id: string;
  readonly impact: string | null;
  readonly targets: readonly string[];
}

/** One scan's answer. */
interface ScanResult {
  readonly violations: readonly Violation[];
  readonly selected: number;
  readonly applied: number;
  readonly passes: number;
  readonly excludedFound: readonly string[];
}

/** Inject axe once per page. Idempotent, because several scans share a page. */
async function injectAxe(page: Page): Promise<void> {
  const present = await page.evaluate(() => 'axe' in window);
  if (!present) {
    await page.addScriptTag({ content: AXE });
  }
}

/**
 * Run the scan over the whole document, with the criterion's configuration.
 *
 * Everything the assertions need comes back from one call, because a second
 * `axe.run` would be a second scan of a page that is running a frame loop.
 */
async function scan(page: Page): Promise<ScanResult> {
  await injectAxe(page);
  return page.evaluate(
    async ([tags, excluded]: [readonly string[], readonly string[]]) => {
      interface AxeRule {
        ruleId: string;
        tags: string[];
      }
      interface AxeCheckResult {
        id: string;
        impact: string | null;
        nodes: { target: unknown[] }[];
      }
      interface AxeRunResult {
        violations: AxeCheckResult[];
        passes: AxeCheckResult[];
        incomplete: AxeCheckResult[];
        inapplicable: AxeCheckResult[];
      }
      const axe = (
        window as unknown as {
          axe: {
            getRules(tags?: readonly string[]): AxeRule[];
            run(context: unknown, options: unknown): Promise<AxeRunResult>;
          };
        }
      ).axe;

      const selected = axe.getRules(tags).map((rule) => rule.ruleId);
      const disabled: Record<string, { enabled: boolean }> = {};
      for (const id of excluded) {
        disabled[id] = { enabled: false };
      }

      const result = await axe.run(document, {
        runOnly: { type: 'tag', values: tags },
        rules: disabled,
      });

      const flatten = (entries: AxeCheckResult[]): { id: string; impact: string | null; targets: string[] }[] =>
        entries.map((entry) => ({
          id: entry.id,
          impact: entry.impact,
          targets: entry.nodes.map((node) => node.target.map((part) => String(part)).join(' ')),
        }));

      const applied =
        result.violations.length +
        result.passes.length +
        result.incomplete.length +
        result.inapplicable.length;

      return {
        violations: flatten(result.violations),
        selected: selected.length,
        applied,
        passes: result.passes.length,
        // Which of the excluded ids the tag selection would have run. Reported
        // so the exclusion can be shown to be doing something rather than
        // naming rules that were never in scope.
        excludedFound: selected.filter((id) => excluded.includes(id)),
      };
    },
    [WCAG_AA_TAGS, EXCLUDED_IDS] as [readonly string[], readonly string[]],
  );
}

/** Require a clean scan, and require the scan to have been a real one. */
async function expectClean(page: Page, screen: string): Promise<ScanResult> {
  const result = await scan(page);
  expect(result.selected, `${screen}: the tag list selected no rules`).toBeGreaterThan(
    SELECTED_FLOOR,
  );
  expect(result.applied, `${screen}: no rule was applied to the page`).toBeGreaterThan(
    SELECTED_FLOOR,
  );
  expect(result.passes, `${screen}: nothing on the page passed a rule`).toBeGreaterThan(0);
  expect(
    result.violations.map((violation) => `${violation.id} at ${violation.targets.join(', ')}`),
    `${screen}: WCAG 2.2 A and AA violations`,
  ).toEqual([]);
  return result;
}

// ---------------------------------------------------------------------------
// The configuration itself, before any page is scanned
// ---------------------------------------------------------------------------

test.describe('G1: the exclusion list is exactly the four families the criterion names', () => {
  test('names four families and nothing else', async ({ page }) => {
    // Written as an assertion rather than as a comment, so a fifth family
    // cannot be added to a Critical gate without a test changing beside it.
    expect(Object.keys(EXCLUDED).sort()).toEqual(['contrast', 'heading', 'landmark', 'lang']);

    // Every id belongs to the family it is filed under, by name. A contrast
    // rule filed under `lang` would be an exclusion nobody could find.
    for (const id of EXCLUDED.contrast) {
      expect(id, 'a contrast exclusion that does not name contrast').toContain('contrast');
    }
    for (const id of EXCLUDED.lang) {
      expect(id, 'a lang exclusion that does not name lang').toContain('lang');
    }
    for (const id of EXCLUDED.landmark) {
      expect(
        id === 'region' || id.startsWith('landmark-'),
        `${id} is filed as a landmark rule and is not one`,
      ).toBe(true);
    }
    for (const id of EXCLUDED.heading) {
      expect(
        id.includes('heading') || id === 'p-as-heading',
        `${id} is filed as a heading rule and is not one`,
      ).toBe(true);
    }

    // And no id is excluded twice, which would hide a miscount.
    expect(new Set(EXCLUDED_IDS).size).toBe(EXCLUDED_IDS.length);
    await page.goto('/');
  });

  test('excludes only rules that exist in the scanner being run', async ({ page }) => {
    await openShippedPage(page);
    await injectAxe(page);
    const known = await page.evaluate(() => {
      const axe = (window as unknown as { axe: { getRules(): { ruleId: string }[] } }).axe;
      return axe.getRules().map((rule) => rule.ruleId);
    });
    expect(known.length, 'axe reported no rules at all').toBeGreaterThan(SELECTED_FLOOR);
    for (const id of EXCLUDED_IDS) {
      expect(known, `${id} is not a rule this scanner has`).toContain(id);
    }
  });

  test('scans with WCAG 2.2 A and AA selected, and the excluded ones really were in scope', async ({
    page,
  }) => {
    await atShippedBetting(page);
    const result = await expectClean(page, 'betting');
    // The exclusion is only meaningful for rules the tag selection would have
    // run. At least the contrast and lang families are in scope at AA, so an
    // empty intersection here would mean the tags are wrong rather than the
    // exclusions unnecessary.
    expect(result.excludedFound, 'no excluded rule was in scope, so the tags are wrong').toContain(
      'color-contrast',
    );
    expect(result.excludedFound).toContain('html-has-lang');
  });
});

// ---------------------------------------------------------------------------
// The control: the scan can fail
// ---------------------------------------------------------------------------

test.describe('G1: the scan can see a defect', () => {
  test('reports a violation for a control planted with no accessible name', async ({ page }) => {
    await atShippedBetting(page);
    await expectClean(page, 'betting before the plant');

    // A button with no text, no label and no title: `button-name` is a WCAG
    // 4.1.2 rule at Level A, it is not on the exclusion list, and the page has
    // no such control until this line. If the scan cannot see this, every clean
    // run in this file means nothing.
    await page.evaluate(() => {
      const planted = document.createElement('button');
      planted.type = 'button';
      planted.setAttribute('data-planted', 'true');
      document.querySelector('.bj-controls')?.append(planted);
    });

    const dirty = await scan(page);
    expect(dirty.violations.map((violation) => violation.id)).toContain('button-name');

    // And the page is clean again once the plant is removed, so the failure is
    // the plant rather than something this spec did on the way in.
    await page.evaluate(() => {
      document.querySelector('[data-planted="true"]')?.remove();
    });
    await expectClean(page, 'betting after the plant is removed');
  });
});

// ---------------------------------------------------------------------------
// Every screen, and every overlay
// ---------------------------------------------------------------------------

test.describe('G1: no violations on any screen', () => {
  test('scans SPEC 10 start screen on the shipped page', async ({ page }) => {
    await openShippedPage(page);
    await waitForPhase(page, 'start');
    await expectClean(page, 'start');
  });

  test('scans SPEC 4.11 betting screen on the shipped page, with a wager built', async ({ page }) => {
    await atShippedBetting(page);
    await expectClean(page, 'betting, no wager');
    // With a wager on the board, which is when the chips that cannot be played
    // are greyed and carry their reason.
    await control(page, 'max').click();
    await settle(page);
    await expectClean(page, 'betting, wager at maximum');
  });

  test('scans SPEC 4.7 offer, the player turn and SPEC 12 result', async ({ page }) => {
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await control(page, 'max').click();
    await pressOn(page, '[data-control="deal"]', 'betting');

    await waitForPhase(page, 'insurance');
    await expectClean(page, 'insurance');

    await control(page, 'decline-insurance').click();
    await waitForPhase(page, 'playerTurn');
    await expectClean(page, 'playerTurn');

    await pressOn(page, '[data-action="stand"]', 'playerTurn');
    await waitForPhase(page, 'roundResult');
    await expectClean(page, 'roundResult');
  });

  test('scans SPEC 4.12 bust-out screen', async ({ page }) => {
    await bootGame(page, { seed: bustOutSeed(), bestBalance: 10_000, table: 'gold' });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    for (const chip of [500, 100, 100, 100, 100, 50]) {
      await page.locator(`[data-chip="${String(chip)}"]`).click();
    }
    await expect
      .poll(async () => (await page.locator('[data-readout="wager"] .bj-readout__value').textContent()) ?? '')
      .toContain(String(BUST_OUT_WAGER));
    await pressOn(page, '[data-control="deal"]', 'betting');
    await waitForPhase(page, 'playerTurn');
    await pressOn(page, '[data-action="stand"]', 'playerTurn');
    await waitForPhase(page, 'roundResult');
    await pressOn(page, '[data-control="next-hand"]', 'roundResult');
    await waitForPhase(page, 'bustOut');
    await expectClean(page, 'bustOut');
  });
});

test.describe('G1: the five timed phases, which have no screen of their own', () => {
  test('renders nothing at a timed phase that is not scanned on a screen that has one', async ({
    page,
  }) => {
    // The completeness argument, and it is structural rather than timed. SPEC
    // 10's five timed phases accept no intent, so the chrome hides every screen
    // during them: what is on the page is the top bar, the canvas, the mirror
    // and the two live regions, and every one of those is scanned above on a
    // screen that does have controls. This asserts that there is nothing else,
    // so "every screen" is covered without racing a 0.22 s window.
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await control(page, 'max').click();
    await pressOn(page, '[data-control="deal"]', 'betting');

    const dealing = await page.evaluate(() => {
      const shell = document.querySelector('.bj-shell');
      const phase = shell?.getAttribute('data-phase') ?? '';
      const shown = [...document.querySelectorAll('[data-screen]')]
        .filter((node) => !(node as HTMLElement).hidden)
        .map((node) => node.getAttribute('data-screen') ?? '');
      return { phase, shown };
    });
    // The read may land after the deal has finished, which is why the phase is
    // reported rather than assumed; either way a screen that is showing during
    // one of the five would be a control on a screen that accepts none.
    if (['dealing', 'peek', 'reveal', 'dealerTurn', 'settling'].includes(dealing.phase)) {
      expect(dealing.shown, `a screen is showing at the ${dealing.phase} phase`).toEqual([]);
    }
  });

  test('scans the three timed phases whose window a whole scan fits inside', async ({ page }) => {
    // **Three of the five, and the choice is measured rather than convenient.** A
    // scan of this page takes about 90 ms and Playwright's own attribute poll is
    // granular to about 100 ms, so a phase has to last well past 200 ms for a
    // scan to be provably inside it. SPEC 5's timed phases are 0.88 s of dealing
    // for four cards, 0.30 s of peek, 0.45 s of reveal, 0.65 s per dealer draw
    // and 0.55 s of settling. Dealing, reveal and settling clear it with room;
    // the peek does not, and a dealer who stands on the first two cards makes
    // `dealerTurn` shorter still. Racing either one in a merge gate would buy a
    // flake rather than a check, and the structural test above is what covers
    // them: none of the five renders a screen, so all five put the same elements
    // on the page and the three scanned here are the same page as the other two.
    await bootGame(page, { seed: peekSeed('none') });
    await waitForPhase(page, 'start');
    await control(page, 'start').click();
    await waitForPhase(page, 'betting');
    await control(page, 'max').click();
    await injectAxe(page);

    /** Wait for a phase, scan inside it, and require it to have held. */
    const scanDuring = async (phase: PhaseKind): Promise<void> => {
      await waitForPhase(page, phase);
      const result = await scan(page);
      expect(
        (await page.locator('.bj-shell').getAttribute('data-phase')) ?? '',
        `the ${phase} phase ended while it was being scanned`,
      ).toBe(phase);
      expect(
        result.violations.map((violation) => `${violation.id} at ${violation.targets.join(', ')}`),
        `${phase}: WCAG 2.2 A and AA violations`,
      ).toEqual([]);
      expect(result.passes, `${phase}: nothing on the page passed a rule`).toBeGreaterThan(0);
    };

    await pressOn(page, '[data-control="deal"]', 'betting');
    await scanDuring('dealing');

    await waitForPhase(page, 'insurance');
    await control(page, 'decline-insurance').click();
    await waitForPhase(page, 'playerTurn');
    await pressOn(page, '[data-action="stand"]', 'playerTurn');

    await scanDuring('reveal');
    await scanDuring('settling');
    await waitForPhase(page, 'roundResult');
  });
});

test.describe('G1: no violations on any overlay', () => {
  for (const overlay of ['settings', 'howToPlay', 'statistics'] as const) {
    test(`scans the ${overlay} overlay open, on the shipped page`, async ({ page }) => {
      await atShippedBetting(page);
      await page.locator(`[data-open-overlay="${overlay}"]`).click();
      await expect(page.locator('[data-overlay-host="true"]')).toBeVisible();
      await expect(page.locator('.bj-shell')).toHaveAttribute('data-overlay', overlay);
      await expectClean(page, `${overlay} overlay`);
    });
  }
});

test.describe('G1: the one region of the page that scrolls', () => {
  test('keeps the magnified play surface reachable by keyboard', async ({ page }) => {
    // Item `F6` draws a surface larger than its box above 100 percent and lets
    // the stage scroll to it, which makes the stage a scroll container, and a
    // scroll container a keyboard cannot reach is a WCAG 2.1.1 failure. The scan
    // reported it as `scrollable-region-focusable` when `BJ-18` first ran it, so
    // this is the scan of the state that produced it rather than a scan of the
    // default page, which no longer scrolls there at all.
    await atShippedBetting(page);
    await chooseInSettings(page, '[data-surface-size="200"]');
    await expect(page.locator('.bj-shell')).toHaveAttribute('data-layout-size', '200');

    const scrolls = await page
      .locator('.bj-stage')
      .evaluate((node: Element) => ({
        overflowX: getComputedStyle(node).overflowX,
        room: node.scrollWidth - node.clientWidth + (node.scrollHeight - node.clientHeight),
        tabindex: node.getAttribute('tabindex'),
      }));
    // The premise, asserted: this really is a scroll container with something to
    // scroll to. A scan of a stage that fitted its box would find nothing and
    // prove nothing.
    expect(scrolls.overflowX, 'the stage is not a scroller at 200 percent').toBe('auto');
    expect(scrolls.room, 'the stage has nothing to scroll to').toBeGreaterThan(0);
    expect(scrolls.tabindex, 'the scrolling stage is not in the tab order').toBe('0');

    await expectClean(page, 'betting at 200 percent surface size');

    // And the stop is there at the default size too, which is deliberate: the
    // stage scrolls for a single frame at 100 percent whenever a phase change
    // moves the controls row's height, and `src/ui/layout.ts` records why the
    // attribute is unconditional rather than tied to the setting.
    await chooseInSettings(page, '[data-surface-size="100"]');
    await expect(page.locator('.bj-shell')).toHaveAttribute('data-layout-size', '100');
    expect(await page.locator('.bj-stage').getAttribute('tabindex')).toBe('0');
    await expectClean(page, 'betting back at 100 percent');
  });
});

test.describe('G1: no violations at the narrow breakpoints', () => {
  test('scans portrait with the readout disclosure closed and open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await atShippedBetting(page);
    await expect(page.locator('.bj-shell')).toHaveAttribute('data-breakpoint', 'portrait');
    await expectClean(page, 'portrait, disclosure closed');

    await page.locator('[data-control="more-readouts"]').click();
    await settle(page);
    await expectClean(page, 'portrait, disclosure open');
  });

  test('scans compact', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await atShippedBetting(page);
    await expect(page.locator('.bj-shell')).toHaveAttribute('data-breakpoint', 'compact');
    await expectClean(page, 'compact');
  });
});
