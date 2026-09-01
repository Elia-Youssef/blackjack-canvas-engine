/**
 * Item `D3`, Major, 14 points, method A, evidence `report/touch-targets`.
 *
 *   "Every interactive target is at least 44 by 44 CSS pixels with at least 8
 *    pixels of clearance, at every breakpoint."
 *
 * Rendered boxes, not stylesheet intent: every number below is
 * `getBoundingClientRect` on the shipped `dist/`, at five viewports, on every
 * screen SPEC 10 defines and in all three overlays. A rule that declares
 * `min-height: 44px` on a control the layout then squeezes is exactly the defect
 * this measures, and only a rendered box can see it.
 *
 * **Clearance is the distance between two rectangles, not the gap in one axis.**
 * Two controls diagonally adjacent are 8 px apart only if the diagonal is 8 px,
 * and a measurement that took the larger of the two axis gaps would report a
 * pair 6 px apart as clear. Nested pairs are excluded: a `summary` inside its
 * `details` is one target drawn inside another, not two targets 0 px apart.
 *
 * **The control is in the fixture, never in the product.** A deliberately
 * undersized element is added to the page, measured, and removed, so the report
 * carries proof that the sampler reports a breach when there is one. Without it
 * a green run says only that the script ran.
 *
 * Writes artifacts/reports/touch-targets.md. Exits 1 on a breach.
 */

import { chromium } from '@playwright/test';

import {
  bootGame,
  findSeedReaching,
  phaseOf,
  press,
  settle,
  toBetting,
  toRoundResult,
  waitForPhase,
} from './drive.mjs';
import {
  environmentRows,
  finish,
  round2,
  startPreview,
  table,
  verdict,
} from './support.mjs';

/** QUALITY-BAR section 3's two numbers, in CSS pixels. */
const MIN_SIDE = 44;
const MIN_CLEARANCE = 8;

const PORT = 4181;

/** One viewport per breakpoint, plus the smallest this game supports. */
const VIEWPORTS = [
  ['wide', 1440, 900],
  ['medium', 900, 700],
  ['compact', 667, 375],
  ['portrait', 390, 844],
  ['smallest', 320, 420],
];

/** The unlock mark the bust-out route needs. SPEC 6 seats Gold at 10,000. */
const BEST_BALANCE = 10_000;

/** The whole 1,000 chip bankroll, as SPEC 4.12's screen is reached. */
const BUST_OUT_CHIPS = [500, 100, 100, 100, 100, 50];

/**
 * Measure every interactive target the page is currently showing.
 *
 * Runs in the page rather than over a list of locators, so the census is of
 * what is rendered and not of what a spec remembered to name. The selector is
 * every natively interactive element plus anything the chrome put in the tab
 * order: `BJ-17` converted the greyed controls to `aria-disabled`, which keeps
 * them focusable and therefore keeps them targets.
 */
async function census(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll(
      'button, summary, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
    )];

    /**
     * The part of a target that is on screen right now.
     *
     * The element's rectangle intersected with every clipping ancestor's box.
     * `getBoundingClientRect` reports a control scrolled out of the settings
     * panel at its full size and full position, and that position overlaps the
     * controls row below the panel: measuring clearance from it reported two
     * targets 0 px apart that a player can never touch at the same moment.
     */
    const visibleRect = (node) => {
      const box = node.getBoundingClientRect();
      let rect = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const clips = [style.overflowX, style.overflowY].some(
          (value) => value === 'auto' || value === 'scroll' || value === 'hidden',
        );
        if (!clips) {
          continue;
        }
        const clip = parent.getBoundingClientRect();
        rect = {
          left: Math.max(rect.left, clip.left),
          right: Math.min(rect.right, clip.right),
          top: Math.max(rect.top, clip.top),
          bottom: Math.min(rect.bottom, clip.bottom),
        };
      }
      return rect;
    };

    const named = (node) => {
      for (const attribute of [
        'data-control', 'data-action', 'data-chip', 'data-open-overlay', 'data-table',
        'data-coach-mode', 'data-speed', 'data-surface-size', 'data-decks', 'data-rule',
        'data-split-rule', 'data-theme', 'data-motion-setting', 'data-readout',
      ]) {
        const value = node.getAttribute(attribute);
        if (value !== null) {
          return attribute + '=' + value;
        }
      }
      const text = (node.textContent ?? '').trim().slice(0, 24);
      return text === '' ? node.tagName.toLowerCase() : node.tagName.toLowerCase() + ':' + text;
    };

    /**
     * Whether the element is rendered at all.
     *
     * `checkVisibility` rather than a computed `display`, because the computed
     * display of a child of a `display: none` parent is its own specified value
     * and not `none`: the five action buttons are rendered on one screen and are
     * children of a hidden row on the other eight, and a check that read their
     * own `display` counted them everywhere.
     */
    const rendered = (node) =>
      node.checkVisibility === undefined
        ? node.getClientRects().length > 0
        : node.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });

    const kept = [];
    const excluded = [];
    for (const node of nodes) {
      const disclosure = node.closest('details');
      if (disclosure !== null && !disclosure.open && node.closest('summary') === null) {
        excluded.push([named(node), 'inside a closed disclosure']);
        continue;
      }
      if (!rendered(node)) {
        excluded.push([named(node), 'not rendered on this screen']);
        continue;
      }
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) {
        excluded.push([named(node), 'has no box']);
        continue;
      }
      const rect = visibleRect(node);
      const onScreenWidth = rect.right - rect.left;
      const onScreenHeight = rect.bottom - rect.top;
      // **Off screen is not absent, it is unclear.** A control scrolled out of
      // the settings panel is still a 44 px target: the player scrolls to it and
      // touches it. So its size is measured either way, and only its clearance,
      // which is a question about what two fingers could hit at one moment, is
      // left out while it is not showing.
      let showing = onScreenWidth > 0 && onScreenHeight > 0;
      if (showing) {
        const hit = document.elementFromPoint(
          (rect.left + rect.right) / 2,
          (rect.top + rect.bottom) / 2,
        );
        if (hit === null || !(node === hit || node.contains(hit))) {
          // An overlay is opaque and covers the play surface behind it, so the
          // stage under an open panel is not something a finger can land on and
          // its zero clearance to the panel's Close button is not a hazard.
          // Reachability is item `F1`'s question and is gated separately.
          showing = false;
          excluded.push([named(node), 'covered, so it takes no part in clearance']);
        }
      } else {
        excluded.push([named(node), 'scrolled out of view, so it takes no part in clearance']);
      }
      kept.push({
        node,
        key: named(node),
        width: box.width,
        height: box.height,
        showing,
        rect,
      });
    }

    const entries = kept.map((entry, index) => ({
      index,
      key: entry.key,
      width: entry.width,
      height: entry.height,
      showing: entry.showing,
      left: entry.rect.left,
      right: entry.rect.right,
      top: entry.rect.top,
      bottom: entry.rect.bottom,
      clearance: Number.POSITIVE_INFINITY,
      neighbour: '',
    }));

    // Clearance: the true distance between two rectangles, and zero when they
    // overlap. Nested pairs are skipped, because one drawn inside the other is
    // one target and not two.
    for (const entry of entries) {
      if (!entry.showing) {
        continue;
      }
      for (const other of entries) {
        if (other.index === entry.index || !other.showing) {
          continue;
        }
        const a = kept[entry.index]?.node;
        const b = kept[other.index]?.node;
        if (a === undefined || b === undefined || a.contains(b) || b.contains(a)) {
          continue;
        }
        const dx = Math.max(0, entry.left - other.right, other.left - entry.right);
        const dy = Math.max(0, entry.top - other.bottom, other.top - entry.bottom);
        const gap = Math.sqrt(dx * dx + dy * dy);
        if (gap < entry.clearance) {
          entry.clearance = gap;
          entry.neighbour = other.key;
        }
      }
    }

    return { entries, excluded };
  });
}

/** Every screen and overlay the census is taken on, in the order it visits them. */
async function statesFor(page, url, seeds) {
  return [
    ['start', async () => {
      await bootGame(page, url, { seed: seeds.plain, alwaysReduceMotion: true });
      await waitForPhase(page, 'start');
    }],
    ['settings overlay', async () => {
      await press(page, '[data-open-overlay="settings"]');
      await page.locator('[data-overlay-host="true"]').waitFor();
    }],
    ['statistics overlay', async () => {
      await press(page, '[data-control="close-overlay"]');
      await press(page, '[data-open-overlay="statistics"]');
      await page.locator('[data-overlay-host="true"]').waitFor();
    }],
    ['how to play overlay', async () => {
      await press(page, '[data-control="close-overlay"]');
      await press(page, '[data-open-overlay="howToPlay"]');
      await page.locator('[data-overlay-host="true"]').waitFor();
    }],
    ['betting', async () => {
      await press(page, '[data-control="close-overlay"]');
      await toBetting(page);
    }],
    ['player turn', async () => {
      await press(page, '[data-chip="50"]');
      await press(page, '[data-control="deal"]');
      await waitForPhase(page, 'playerTurn');
    }],
    ['round result', async () => {
      if (!(await toRoundResult(page))) {
        throw new Error('the round never reached its result');
      }
    }],
    ['insurance', async () => {
      await bootGame(page, url, { seed: seeds.insurance, alwaysReduceMotion: true });
      await toBetting(page);
      await press(page, '[data-chip="50"]');
      await press(page, '[data-control="deal"]');
      await waitForPhase(page, 'insurance');
    }],
    ['bust out', async () => {
      await bootGame(page, url, {
        seed: seeds.bustOut,
        table: 'gold',
        bestBalance: BEST_BALANCE,
        alwaysReduceMotion: true,
      });
      await toBetting(page);
      for (const denomination of BUST_OUT_CHIPS) {
        await press(page, `[data-chip="${String(denomination)}"]`);
      }
      await press(page, '[data-control="deal"]');
      if (!(await toRoundResult(page))) {
        throw new Error('the bust-out round never reached its result');
      }
      await press(page, '[data-control="next-hand"]');
      await waitForPhase(page, 'bustOut');
    }],
  ];
}

/** A seed whose whole bankroll loses at Gold, so SPEC 4.12's screen is reached. */
async function findBustOutSeed(page, url) {
  for (let seed = 1; seed <= 40; seed += 1) {
    await bootGame(page, url, {
      seed,
      table: 'gold',
      bestBalance: BEST_BALANCE,
      alwaysReduceMotion: true,
    });
    await toBetting(page);
    for (const denomination of BUST_OUT_CHIPS) {
      await press(page, `[data-chip="${String(denomination)}"]`);
    }
    await press(page, '[data-control="deal"]');
    if (!(await toRoundResult(page))) {
      continue;
    }
    await press(page, '[data-control="next-hand"]');
    await page.waitForTimeout(200);
    if ((await phaseOf(page)) === 'bustOut') {
      return seed;
    }
  }
  throw new Error('no seed within 40 lost the whole bankroll at Gold');
}

async function main() {
  const preview = await startPreview(PORT);
  const browser = await chromium.launch();
  const breaches = [];
  const rows = [];
  const failures = [];
  let controlSaw;
  let measured = 0;
  const excluded = new Map();

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    // Searched rather than written down: a seed constant is a seed that stops
    // meaning what it meant the day the shoe's draw order changes.
    const seeds = {
      plain: await findSeedReaching(page, preview.url, 'playerTurn', 50),
      insurance: await findSeedReaching(page, preview.url, 'insurance', 50),
      bustOut: await findBustOutSeed(page, preview.url),
    };

    // The control, once, on a page that is otherwise passing: an element two
    // pixels short on one side and four from its neighbour. It is added to the
    // page, measured and removed, and the report carries the reading.
    await bootGame(page, preview.url, { seed: seeds.plain, alwaysReduceMotion: true });
    await waitForPhase(page, 'start');
    await page.evaluate(({ side }) => {
      const near = document.querySelector('[data-control="start"]');
      const box = near?.getBoundingClientRect() ?? { left: 0, bottom: 0 };
      const planted = document.createElement('button');
      planted.id = 'bj-touch-control';
      planted.setAttribute('data-control', 'planted-control');
      planted.textContent = 'x';
      planted.style.position = 'fixed';
      planted.style.width = `${String(side - 2)}px`;
      planted.style.height = `${String(side - 2)}px`;
      planted.style.left = `${String(box.left)}px`;
      planted.style.top = `${String(box.bottom + 4)}px`;
      document.body.append(planted);
    }, { side: MIN_SIDE });
    await settle(page);
    const controlCensus = await census(page);
    const planted = controlCensus.entries.find((entry) => entry.key === 'data-control=planted-control');
    controlSaw =
      planted !== undefined &&
      planted.showing &&
      (planted.width < MIN_SIDE || planted.height < MIN_SIDE) &&
      planted.clearance < MIN_CLEARANCE;
    await page.evaluate(() => {
      document.getElementById('bj-touch-control')?.remove();
    });

    for (const [label, width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      for (const [state, arrive] of await statesFor(page, preview.url, seeds)) {
        await arrive();
        await settle(page);
        const { entries, excluded: skipped } = await census(page);
        for (const [key, why] of skipped) {
          const line = `${key} (${why})`;
          excluded.set(line, (excluded.get(line) ?? 0) + 1);
        }
        let worstSide = Number.POSITIVE_INFINITY;
        let worstClearance = Number.POSITIVE_INFINITY;
        let worstKey = '';
        let clearanceKey = '';
        for (const entry of entries) {
          measured += 1;
          const side = Math.min(entry.width, entry.height);
          if (side < worstSide) {
            worstSide = side;
            worstKey = entry.key;
          }
          if (entry.showing && entry.clearance < worstClearance) {
            worstClearance = entry.clearance;
            clearanceKey = `${entry.key} to ${entry.neighbour}`;
          }
          if (side < MIN_SIDE - 0.5) {
            failures.push([
              `${label} / ${state}`,
              entry.key,
              `${round2(entry.width)} x ${round2(entry.height)}`,
              'size',
            ]);
          }
          if (entry.showing && entry.clearance < MIN_CLEARANCE - 0.5) {
            failures.push([
              `${label} / ${state}`,
              `${entry.key} to ${entry.neighbour}`,
              `${round2(entry.clearance)} px`,
              'clearance',
            ]);
          }
        }
        rows.push([
          label,
          state,
          String(entries.length),
          `${round2(worstSide)} (${worstKey})`,
          Number.isFinite(worstClearance) ? `${round2(worstClearance)} (${clearanceKey})` : 'only target',
          verdict(worstSide >= MIN_SIDE - 0.5 && worstClearance >= MIN_CLEARANCE - 0.5),
        ]);
      }
    }
  } finally {
    await browser.close();
    preview.stop();
  }

  for (const [where, what, value, kind] of failures) {
    breaches.push(`${where}: ${what} fails the ${kind} threshold at ${value}`);
  }
  if (!controlSaw) {
    breaches.push('the can-see control was not reported as a breach, so the sampler is blind');
  }
  if (measured < 100) {
    breaches.push(`only ${String(measured)} targets were measured, so the census found almost nothing`);
  }

  const lines = [
    '# Touch target report',
    '',
    `**${breaches.length === 0 ? 'PASS' : 'FAIL'}.** Item \`D3\`, Major, 14 points, method A.`,
    'Generated by `BlackJack/BlackJack/scripts/report/touch-targets.mjs`. Do not edit by hand.',
    '',
    '> "Every interactive target is at least 44 by 44 CSS pixels with at least 8 pixels of',
    '> clearance, at every breakpoint."',
    '',
    '## Result',
    '',
    ...table(
      ['Measure', 'Value', 'Threshold', 'Verdict'],
      [
        ['Targets measured', String(measured), '-', '-'],
        ['Size breaches', String(failures.filter((row) => row[3] === 'size').length), '0',
          verdict(!failures.some((row) => row[3] === 'size'))],
        ['Clearance breaches', String(failures.filter((row) => row[3] === 'clearance').length), '0',
          verdict(!failures.some((row) => row[3] === 'clearance'))],
        ['Can-see control reported', controlSaw ? 'yes' : 'no', 'yes', verdict(controlSaw)],
      ],
    ),
    '',
    '## Every viewport, every screen',
    '',
    ...table(
      ['Breakpoint', 'Screen', 'Targets', 'Smallest side (px)', 'Least clearance (px)', 'Verdict'],
      rows,
    ),
    '',
    '## Left out, and of what',
    '',
    '**Two different things are counted here and they are not both exclusions from the',
    'census.** A control that is not rendered on this screen, is inside a closed disclosure or',
    'has no box is out of the census altogether: there is nothing to measure. A control that is',
    'scrolled out of view or covered by a panel **is** measured for size, and is left out of the',
    'clearance arithmetic only, because clearance is about two things a finger could confuse and',
    'a control nobody can touch right now is not one of them. Each line below says which.',
    '',
    'Every line is a rendered fact about the page, counted across every viewport and screen, and',
    'item `F1` is what gates whether a control that should be reachable is.',
    '',
    ...table(
      ['Target and reason', 'Times'],
      [...excluded.entries()].sort().map(([key, count]) => [key, String(count)]),
    ),
    '',
    ...(failures.length === 0
      ? ['No target is under 44 CSS pixels on either side, and no two targets are closer',
        'than 8 CSS pixels, at any of the five viewports on any of the nine screens.']
      : ['## Breaches', '',
        ...table(['Where', 'What', 'Measured', 'Threshold'], failures)]),
    '',
    '## The control',
    '',
    `A button ${String(MIN_SIDE - 2)} px square is added to the start screen 4 px below the Start`,
    'control, measured, and removed. The sampler reported it as both a size breach and a',
    `clearance breach: **${controlSaw ? 'yes' : 'no'}**. Nothing in \`src/\` is touched by it.`,
    '',
    '## Environment',
    '',
    ...table(['Condition', 'Value'], environmentRows([
      ['Engine', 'headless chromium, Playwright'],
      ['Served', `vite preview over dist/ on port ${String(PORT)}`],
      ['Viewports', VIEWPORTS.map(([label, w, h]) => `${label} ${String(w)}x${String(h)}`).join(', ')],
    ])),
    '',
    '## Reproduce',
    '',
    '```bash',
    'npm ci && npm run build && npm run report:touch-targets',
    '```',
  ];

  finish('touch-targets.md', lines, breaches);
}

await main();
