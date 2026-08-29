/**
 * Item `G2`, Critical, 14 points, method A, evidence `report/contrast`.
 *
 *   "Measured contrast meets 4.5:1 for body text and 3:1 for large text,
 *    interactive component boundaries and every graphical object required to
 *    understand the play surface, in both themes and on every table felt. The
 *    enumerated graphics list is committed alongside the audit script and
 *    includes the card margin, the chip edge ring, the felt rail and the hand
 *    value pill, each measured against rendered pixels rather than against its
 *    token."
 *
 * **Rendered pixels, and the felt is why the clause says so.** The play surface
 * paints its felt as a radial vignette with a deterministic grain quantised into
 * sixteen alpha bands over it, so the token `--felt-bronze` is a colour that
 * appears on the table nowhere at all. Every play-surface row below finds its ink
 * by exact match, because an ink is a flat fill and does render exactly, and then
 * takes its ground from the **worst** pixel adjacent to that ink in the
 * composited image. Worst rather than average: a contrast requirement is about
 * the hardest place on the boundary, and the grain is what makes some places
 * harder than others.
 *
 * The list is `scripts/report/graphics.mjs`, committed beside this file as the
 * criterion asks, and an entry that produces no sample fails rather than being
 * skipped: an audit that measured nothing would otherwise pass.
 *
 * **The can-see control is in the fixture and never in the product.** Two
 * deliberately close colours are put on the page, measured by the same sampler
 * every chrome row uses, and required to come back under threshold.
 *
 * Writes artifacts/reports/contrast.md. Exits 1 on any row below its threshold.
 */

import { chromium } from '@playwright/test';

import {
  CANVAS_GRAPHICS,
  CHROME_GRAPHICS,
  TEXT_RATIO,
} from './graphics.mjs';
import { bootGame, findSeedReaching, press, settle, toBetting, waitForPhase } from './drive.mjs';
import { REGION_PROBE, SURFACE_PROBE } from './pixels.mjs';
import {
  contrastOf,
  environmentRows,
  finish,
  round2,
  startPreview,
  table,
} from './support.mjs';

const PORT = 4182;

/** SPEC 6's three tables, and SPEC 16's three felts. */
const TABLES = ['bronze', 'silver', 'gold'];

/** SPEC 14's two themes. The chrome flips; the play surface deliberately does not. */
const THEMES = ['dark', 'light'];

/** The unlock mark that seats every table, so all three felts can be measured. */
const BEST_BALANCE = 10_000;

/**
 * The can-see control's planted pair, and the ratio between them.
 *
 * **Named here because the control has to be checked against the pair it
 * planted, and not merely against the threshold.** The review found the first
 * form of this control reporting 3.59:1, which is not the planted pair at all:
 * it is `#808080` against the page ground `#f2f5f1`, which bled into the
 * element screenshot at its edge, and `textPair` takes the **maximum** contrast
 * it can find. That reading is under 4.5:1 as well, so the control passed while
 * measuring the wrong two colours: a sampler that had gone blind to the planted
 * ink would still have found the page ground and still reported a breach.
 *
 * So the assertion below is identity, all three of it: the ink it found is the
 * ink that was planted, the background is the background that was planted, and
 * the ratio is theirs. 1.13 is the WCAG ratio of these two greys, computed and
 * then confirmed by the sampler; a control whose number nobody can re-derive is
 * a control nobody can check.
 */
const PLANTED_INK = '#777777';
const PLANTED_BACKGROUND = '#808080';
const PLANTED_RATIO = 1.13;

/**
 * How far inside the planted element the census is taken, in CSS pixels.
 *
 * The element's own screenshot carries a device pixel of whatever is behind it
 * along its edge, which is exactly what the review caught. Two pixels in is
 * inside the element's 8 px padding and past that rim, so every pixel the
 * census sees is one of the two planted colours or an antialiased step between
 * them.
 */
const PLANTED_INSET = 2;

/** The wager the audit bets: legal at all three tables, and one chip. */
const WAGER = 100;

/**
 * The two play-surface sets, by the names the palette selection reports.
 *
 * The high-contrast set is measured under forced-colors emulation, which
 * chromium is the engine that offers. Its felt is a flat fill, which is SPEC
 * 16's own statement about that set, so the worst adjacent pixel of every row
 * there is one colour rather than a distribution.
 */
const PALETTES = [
  { name: 'standard', forcedColors: 'none' },
  { name: 'high-contrast', forcedColors: 'active' },
];

/** How far from an ink pixel a ground is sampled, in device pixels. */
const ADJACENT = 3;

/** How many pixels a colour needs before it is graded rather than an edge blend. */
const MIN_SAMPLES = 20;

/** `#rrggbb` to `[r, g, b]`. */
function rgbOf(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Every colour this game paints as a flat fill, read off the running page.
 *
 * Asked of the page rather than restated here, so a token that moves moves the
 * audit with it and SPEC 16 has no second copy in this file. The set is also
 * what makes a pixel "felt": anything that is not one of these.
 */
async function paletteOf(page) {
  return page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const read = (name) => styles.getPropertyValue(name).trim().toLowerCase();
    const rgbToHex = (value) => {
      const parts = /rgba?\(([^)]+)\)/.exec(value);
      if (parts?.[1] === undefined) {
        return value.trim().toLowerCase();
      }
      const channels = parts[1].split(/[\s,/]+/).filter((part) => part !== '').slice(0, 3);
      return `#${channels
        .map((part) => Math.round(Number(part)).toString(16).padStart(2, '0'))
        .join('')}`;
    };
    return {
      cardMargin: read('--card-margin'),
      cardFace: read('--card-face'),
      cardBack: read('--card-back'),
      rankBlack: read('--rank-black'),
      rankRed: read('--rank-red'),
      rail: read('--felt-rail'),
      print: read('--felt-print'),
      chipRing: read('--chip-ring'),
      chipGlyph: read('--chip-glyph'),
      // **The used colour, not the token.** Under forced colors the chrome's
      // custom properties are re-pointed at system colours, so `--bj-ground`
      // answers `Canvas` rather than a hex and every comparison against it is a
      // comparison against `NaN`. What is painted is what the criterion means.
      ground: rgbToHex(getComputedStyle(document.body).backgroundColor),
      felts: ['--felt-bronze', '--felt-silver', '--felt-gold'].map(read),
      chipFills: ['--chip-10-fill', '--chip-50-fill', '--chip-100-fill', '--chip-500-fill'].map(read),
    };
  });
}

/**
 * The high-contrast set the renderer actually draws with, which the stylesheet
 * cannot be asked for.
 *
 * Under forced colors the chrome's custom properties are re-pointed at system
 * colours, so `getComputedStyle` answers `Canvas` and `ButtonText` rather than a
 * hex: the tokens above are the base set even while the canvas is drawing the
 * other one. The renderer's own record is the only honest source, and the
 * harness already publishes it.
 */
async function rendererPalette(page) {
  return page.evaluate(() => window.__bjGame?.surfaceTokens() ?? null);
}

/** The census of one screenshotted region, decoded by the page's own engine. */
async function regionCensus(page, buffer) {
  return page.evaluate(REGION_PROBE, { base64: buffer.toString('base64') });
}

/** The commonest colour in a census. */
function commonest(counts) {
  let best = '';
  let most = -1;
  for (const entry of counts) {
    if (entry.count > most) {
      most = entry.count;
      best = entry.key;
    }
  }
  return best;
}

/**
 * The foreground and background of a rendered box of text.
 *
 * The commonest colour is the background and the colour furthest from it is the
 * ink, which is how an automated checker reads a rendered image. A colour has to
 * cover a few pixels to count, so the antialiased rim of a glyph, which is by
 * construction between the two, cannot be mistaken for either.
 */
function textPair(census) {
  const background = commonest(census.counts);
  let ink = '';
  let best = -1;
  for (const entry of census.counts) {
    if (entry.count < 4 || entry.key === background) {
      continue;
    }
    const ratio = contrastOf(rgbOf(background), rgbOf(entry.key));
    if (ratio > best) {
      best = ratio;
      ink = entry.key;
    }
  }
  return ink === '' ? null : { ink, background, ratio: best };
}

/**
 * A control's boundary against the page beside it.
 *
 * **A narrow column crossing the control's top edge, and the label is why.** The
 * first form of this sampler took a row through the control's vertical centre,
 * which crosses its text: the colour furthest from the page along that row was
 * the label, so the row reported the button's text contrast under the heading
 * "control boundary". A column that starts above the control and stops just
 * inside it crosses the page, the border and the face, and nothing else.
 *
 * The reading is the most distinguishable colour in that crossing, which is what
 * WCAG 1.4.11 asks of a component: the visual information needed to identify it
 * has to reach 3:1, not every pixel of it. Reading the border off the computed
 * style would measure the stylesheet, which is what the criterion excludes.
 */
function boundaryPair(census) {
  const outside = new Map();
  const margin = Math.max(2, Math.floor(census.column.length * 0.2));
  for (let y = 0; y < margin; y += 1) {
    const key = census.column[y] ?? '';
    outside.set(key, (outside.get(key) ?? 0) + 1);
  }
  const page = commonest([...outside.entries()].map(([key, count]) => ({ key, count })));
  let edge = '';
  let best = -1;
  for (const key of census.column) {
    const ratio = contrastOf(rgbOf(page), rgbOf(key));
    if (ratio > best) {
      best = ratio;
      edge = key;
    }
  }
  return edge === '' ? null : { ink: edge, background: page, ratio: best };
}

/** The pixels focusing changed, against the pixels it did not. */
function ringPair(before, after) {
  const changed = new Map();
  const kept = new Map();
  const total = Math.min(before.line.length, after.line.length);
  // The two censuses cover the same clip, so a colour that gained pixels is ring
  // and a colour that held them is ground. Counting the difference per colour is
  // what makes this independent of where the ring is drawn.
  for (const entry of after.counts) {
    const was = before.counts.find((other) => other.key === entry.key)?.count ?? 0;
    if (entry.count > was) {
      changed.set(entry.key, entry.count - was);
    } else {
      kept.set(entry.key, entry.count);
    }
  }
  const ring = commonest([...changed.entries()].map(([key, count]) => ({ key, count })));
  const ground = commonest([...kept.entries()].map(([key, count]) => ({ key, count })));
  if (ring === '' || ground === '' || total === 0) {
    return null;
  }
  return {
    ink: ring,
    background: ground,
    ratio: contrastOf(rgbOf(ring), rgbOf(ground)),
  };
}

/**
 * A seed whose dealt hand shows both rank inks.
 *
 * Two of the ten play-surface rows are a rank index, and a round dealt entirely
 * in hearts and diamonds paints no black index at all: the audit's first run
 * reported `rank-black-on-face` unmeasured on every felt, which is a property of
 * the deal and not of the palette. The search asks the machine what it dealt
 * rather than looking at pixels, and an entry with no sample still fails, so a
 * search that stopped finding one would be a failure rather than a silence.
 */
async function findInkySeed(page, url) {
  for (let seed = 1; seed <= 60; seed += 1) {
    const reached = await findSeedReaching(page, url, 'playerTurn', WAGER, 1, seed);
    if (reached === null) {
      continue;
    }
    const suits = await page.evaluate(() => {
      const snapshot = window.__bjGame?.readout();
      const cards = [
        ...(snapshot?.dealerVisible ?? []),
        ...(snapshot?.hands ?? []).flatMap((hand) => hand.cards),
      ];
      return cards.map((card) => card.suit);
    });
    const red = suits.some((suit) => suit === 'hearts' || suit === 'diamonds');
    const black = suits.some((suit) => suit === 'clubs' || suit === 'spades');
    if (red && black) {
      return seed;
    }
  }
  throw new Error('no seed within 60 dealt both a red and a black card');
}

/**
 * SPEC 14's theme, set through the control a player uses.
 *
 * The play surface does not flip with the theme, which SPEC 16 states, but the
 * page behind it does, and the table's outer boundary is a boundary against that
 * page. So the surface rows are measured in both themes as well.
 */
async function setTheme(page, theme) {
  await press(page, '[data-open-overlay="settings"]');
  await page.locator('[data-overlay-host="true"]').waitFor();
  await press(page, `[data-theme="${theme}"]`);
  await press(page, '[data-control="close-overlay"]');
  await page.locator('[data-overlay-host="true"]').waitFor({ state: 'hidden' });
  await settle(page);
}

/** Reach a dealt hand at one table, so cards, chips and the felt are all drawn. */
async function atPlayerTurn(page, url, seed, seat) {
  await bootGame(page, url, {
    seed,
    table: seat,
    bestBalance: BEST_BALANCE,
    alwaysReduceMotion: true,
  });
  await toBetting(page);
  await press(page, `[data-chip="${String(WAGER)}"]`);
  await press(page, '[data-control="deal"]');
  await waitForPhase(page, 'playerTurn');
  await settle(page);
}

/** The ink a graphic is drawn in, and the ground it is measured against. */
function pairFor(entry, tokens) {
  const ink = tokens[entry.ink];
  let only = null;
  if (entry.ground === 'page') {
    only = tokens.ground;
  } else if (entry.ground === 'cardMargin' || entry.ground === 'cardFace') {
    only = tokens.cardMargin;
  } else if (entry.ground === 'chipFill') {
    only = tokens.chipFills[2] ?? tokens.chipFills[0];
  }
  return { id: entry.id, ink, only };
}

async function main() {
  const preview = await startPreview(PORT);
  const browser = await chromium.launch();
  const breaches = [];
  const canvasRows = [];
  const chromeRows = [];
  let controlSaw;
  let controlRatio;
  let controlInk;
  let controlBackground;
  let seed;

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    seed = await findInkySeed(page, preview.url);

    // ------------------------------------------------------------------
    // The play surface: two sets, three felts, ten graphics each.
    // ------------------------------------------------------------------
    for (const palette of PALETTES) {
      await page.emulateMedia({ forcedColors: palette.forcedColors });
      for (const theme of THEMES) {
        for (const seat of TABLES) {
        await atPlayerTurn(page, preview.url, seed, seat);
        await setTheme(page, theme);
        const stylesheet = await paletteOf(page);
        const drawn = await rendererPalette(page);
        const tokens = drawn === null ? stylesheet : { ...stylesheet, ...drawn };
        const pairs = [
          ...CANVAS_GRAPHICS.map((entry) => pairFor(entry, tokens)),
          // The other side of the table edge: the page's own flat colour and the
          // worst felt pixel beside it. The felt cannot be an ink, because it is
          // the one thing on the surface that renders as a distribution rather
          // than a fill, so it is measured from the page inwards instead.
          { id: 'table-on-page', ink: tokens.ground, only: null, mode: 'anywhere' },
        ];
        const found = await page.evaluate(SURFACE_PROBE, {
          pairs,
          felts: [tokens.felts[TABLES.indexOf(seat)]],
          adjacent: ADJACENT,
          minSamples: MIN_SAMPLES,
          ground: tokens.ground,
        });

        for (const entry of CANVAS_GRAPHICS) {
          const pair = pairFor(entry, tokens);
          const measured = found[entry.id];
          if (entry.carriers !== undefined) {
            // The table against the page, by whichever side carries it. SPEC 16
            // states the split: the rail carries the dark ground and the felts
            // carry the light one, where they clear 3:1 unaided and the rail is
            // decorative. Both numbers are reported and the verdict is the
            // carrier's, because the requirement is that the table is separable
            // from the page and not that one particular token does it.
            const railGrounds = measured?.grounds ?? [];
            const feltGrounds = found['table-on-page']?.grounds ?? [];
            const worstOf = (ink, grounds) =>
              grounds.length === 0
                ? null
                : grounds.reduce(
                    (worst, candidate) =>
                      Math.min(worst, contrastOf(rgbOf(ink), rgbOf(candidate.key))),
                    Number.POSITIVE_INFINITY,
                  );
            const railRatio = worstOf(pair.ink, railGrounds);
            const feltRatio = worstOf(tokens.ground, feltGrounds);
            const best = Math.max(railRatio ?? 0, feltRatio ?? 0);
            const ok = best >= entry.ratio;
            if (railRatio === null && feltRatio === null) {
              breaches.push(
                `${palette.name} / ${theme} / ${seat} / ${entry.id}: no sample, so the boundary was not measured`,
              );
            } else if (!ok) {
              breaches.push(
                `${palette.name} / ${theme} / ${seat} / ${entry.id}: ${String(round2(best))}:1 against ${String(entry.ratio)}:1`,
              );
            }
            canvasRows.push([
              `${palette.name} / ${theme}`,
              seat,
              `\`${entry.id}\``,
              `rail \`${pair.ink}\``,
              `page \`${tokens.ground}\``,
              `rail ${railRatio === null ? '-' : String(round2(railRatio))}:1, felt ${feltRatio === null ? '-' : String(round2(feltRatio))}:1`,
              `>= ${String(entry.ratio)}:1`,
              ok ? 'PASS' : '**FAIL**',
            ]);
            continue;
          }
          const grounds = measured?.grounds ?? [];
          if (grounds.length === 0) {
            breaches.push(
              `${palette.name} / ${theme} / ${seat} / ${entry.id}: no sample, so the graphic was not measured`,
            );
            canvasRows.push([
              `${palette.name} / ${theme}`, seat, `\`${entry.id}\``, `\`${pair.ink}\``, '-', '-',
              `>= ${String(entry.ratio)}:1`, '**FAIL**',
            ]);
            continue;
          }
          let worst = grounds[0].key;
          let worstRatio = Number.POSITIVE_INFINITY;
          for (const candidate of grounds) {
            const ratio = contrastOf(rgbOf(pair.ink), rgbOf(candidate.key));
            if (ratio < worstRatio) {
              worstRatio = ratio;
              worst = candidate.key;
            }
          }
          const ok = worstRatio >= entry.ratio;
          if (!ok) {
            breaches.push(
              `${palette.name} / ${theme} / ${seat} / ${entry.id}: ${String(round2(worstRatio))}:1 against ${String(entry.ratio)}:1`,
            );
          }
          canvasRows.push([
            `${palette.name} / ${theme}`,
            seat,
            `\`${entry.id}\``,
            `\`${pair.ink}\``,
            `\`${worst}\``,
            `${String(round2(worstRatio))}:1`,
            `>= ${String(entry.ratio)}:1`,
            ok ? 'PASS' : '**FAIL**',
          ]);
        }
        }
      }
    }
    await page.emulateMedia({ forcedColors: 'none' });

    // ------------------------------------------------------------------
    // The chrome: both themes, six graphics.
    // ------------------------------------------------------------------
    for (const theme of THEMES) {
      await atPlayerTurn(page, preview.url, seed, 'bronze');
      await press(page, '[data-open-overlay="settings"]');
      await page.locator('[data-overlay-host="true"]').waitFor();
      await press(page, `[data-theme="${theme}"]`);
      await settle(page);
      let panelOpen = true;

      for (const entry of CHROME_GRAPHICS) {
        // The panel is opened and closed around the rows that need it. `BJ-17`
        // traps `Tab` inside an open overlay, so the focus ring on a top-bar
        // control is unreachable while the panel is up, and the panel's own
        // heading and slider do not exist while it is down.
        const wantsOverlay = entry.overlay === true;
        if (wantsOverlay !== panelOpen) {
          await press(page, wantsOverlay ? '[data-open-overlay="settings"]' : '[data-control="close-overlay"]');
          await settle(page);
          panelOpen = wantsOverlay;
        }
        const locator = page.locator(entry.where).first();
        if (!(await locator.isVisible())) {
          breaches.push(`${theme} / ${entry.id}: the graphic was not on the page to measure`);
          chromeRows.push([theme, `\`${entry.id}\``, '-', '-', '-', `>= ${String(entry.ratio)}:1`, '**FAIL**']);
          continue;
        }
        await locator.scrollIntoViewIfNeeded();
        const box = await locator.boundingBox();
        let pair = null;
        if (entry.kind === 'text') {
          pair = textPair(await regionCensus(page, await locator.screenshot()));
        } else if (entry.kind === 'boundary') {
          // A column down the control's horizontal centre. `edge` stops before
          // the label, which is what a button's boundary is; `body` crosses the
          // whole control, which is what a slider needs, because its track is a
          // thin bar through the middle of a box whose top edge is empty.
          const pad = 8;
          const height = entry.crossing === 'body'
            ? (box?.height ?? 0) + pad * 2
            : pad + Math.min(pad, (box?.height ?? 0) / 2);
          const clip = {
            x: Math.max(0, (box?.x ?? 0) + (box?.width ?? 0) / 2 - 3),
            y: Math.max(0, (box?.y ?? 0) - pad),
            width: 6,
            height,
          };
          pair = boundaryPair(await regionCensus(page, await page.screenshot({ clip })));
        } else {
          const pad = 10;
          const clip = {
            x: Math.max(0, (box?.x ?? 0) - pad),
            y: Math.max(0, (box?.y ?? 0) - pad),
            width: (box?.width ?? 0) + pad * 2,
            height: (box?.height ?? 0) + pad * 2,
          };
          const before = await regionCensus(page, await page.screenshot({ clip }));
          // **Tab, not `focus()`, and `:focus-visible` is why.** Chromium shows
          // the indicator for a keyboard focus and withholds it for a
          // programmatic one, so a ring measured through `focus()` is a ring
          // that was never painted: the audit's first run reported no sample at
          // all and would have reported the same for a page with no indicator.
          await page.evaluate(({ where }) => {
            const target = document.querySelector(where);
            const previous = target?.previousElementSibling;
            if (previous instanceof HTMLElement) {
              previous.focus();
            } else if (target instanceof HTMLElement) {
              target.focus();
              target.blur();
            }
          }, { where: entry.where });
          for (let step = 0; step < 40; step += 1) {
            await page.keyboard.press('Tab');
            const focused = await locator.evaluate((node) => node === document.activeElement);
            if (focused) {
              break;
            }
          }
          await settle(page);
          const after = await regionCensus(page, await page.screenshot({ clip }));
          pair = ringPair(before, after);
          await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          });
        }

        if (pair === null) {
          breaches.push(`${theme} / ${entry.id}: no sample, so the graphic was not measured`);
          chromeRows.push([theme, `\`${entry.id}\``, '-', '-', '-', `>= ${String(entry.ratio)}:1`, '**FAIL**']);
          continue;
        }
        const ok = pair.ratio >= entry.ratio;
        if (!ok) {
          breaches.push(
            `${theme} / ${entry.id}: ${String(round2(pair.ratio))}:1 against ${String(entry.ratio)}:1`,
          );
        }
        chromeRows.push([
          theme,
          `\`${entry.id}\``,
          `\`${pair.ink}\``,
          `\`${pair.background}\``,
          `${String(round2(pair.ratio))}:1`,
          `>= ${String(entry.ratio)}:1`,
          ok ? 'PASS' : '**FAIL**',
        ]);
      }
    }

    // ------------------------------------------------------------------
    // The control: a pair that must fail, read by the same sampler.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
      const planted = document.createElement('p');
      planted.id = 'bj-contrast-control';
      planted.textContent = 'control';
      planted.style.position = 'fixed';
      planted.style.left = '0';
      planted.style.top = '0';
      planted.style.margin = '0';
      planted.style.padding = '8px';
      planted.style.font = 'bold 24px sans-serif';
      planted.style.background = 'rgb(128, 128, 128)';
      planted.style.color = 'rgb(119, 119, 119)';
      document.body.append(planted);
    });
    await settle(page);
    const plantedBox = await page.locator('#bj-contrast-control').boundingBox();
    if (plantedBox === null) {
      throw new Error('the planted control has no box, so it was never rendered');
    }
    const control = textPair(
      await regionCensus(
        page,
        await page.screenshot({
          clip: {
            x: plantedBox.x + PLANTED_INSET,
            y: plantedBox.y + PLANTED_INSET,
            width: plantedBox.width - PLANTED_INSET * 2,
            height: plantedBox.height - PLANTED_INSET * 2,
          },
        }),
      ),
    );
    controlSaw = control !== null && control.ratio < TEXT_RATIO;
    controlRatio = control === null ? 0 : round2(control.ratio);
    controlInk = control === null ? 'none' : control.ink;
    controlBackground = control === null ? 'none' : control.background;
    await page.evaluate(() => {
      document.getElementById('bj-contrast-control')?.remove();
    });
    if (!controlSaw) {
      breaches.push('the can-see control was not reported below threshold, so the sampler is blind');
    }
    // The identity half. Without it the control passes on any pair under
    // threshold, including one the fixture never planted.
    if (controlInk !== PLANTED_INK || controlBackground !== PLANTED_BACKGROUND) {
      breaches.push(
        `the can-see control read ${controlInk} on ${controlBackground}, not the planted `
        + `${PLANTED_INK} on ${PLANTED_BACKGROUND}, so the sampler found some other pair`,
      );
    }
    if (controlRatio !== PLANTED_RATIO) {
      breaches.push(
        `the can-see control measured ${String(controlRatio)}:1 between the planted pair, `
        + `not the ${String(PLANTED_RATIO)}:1 those two colours are apart`,
      );
    }
  } finally {
    await browser.close();
    preview.stop();
  }

  const belowThreshold = breaches.filter((line) => line.includes(':1 against')).length;
  const lines = [
    '# Contrast report',
    '',
    `**${breaches.length === 0 ? 'PASS' : 'FAIL'}.** Item \`G2\`, Critical, 14 points, method A.`,
    'Generated by `BlackJack/BlackJack/scripts/report/contrast.mjs`. Do not edit by hand.',
    '',
    '> "Measured contrast meets 4.5:1 for body text and 3:1 for large text, interactive',
    '> component boundaries and every graphical object required to understand the play',
    '> surface, in both themes and on every table felt. The enumerated graphics list is',
    '> committed alongside the audit script and includes the card margin, the chip edge ring,',
    '> the felt rail and the hand value pill, each measured against rendered pixels rather',
    '> than against its token."',
    '',
    '## Result',
    '',
    ...table(
      ['Measure', 'Value', 'Threshold', 'Verdict'],
      [
        ['Play-surface rows measured', String(canvasRows.length), '-', '-'],
        ['Chrome rows measured', String(chromeRows.length), '-', '-'],
        ['Rows below threshold', String(belowThreshold), '0', belowThreshold === 0 ? 'PASS' : '**FAIL**'],
        ['Can-see control reported', `${String(controlRatio)}:1`, `< ${String(TEXT_RATIO)}:1`,
          controlSaw ? 'PASS' : '**FAIL**'],
        ['Can-see control pair', `\`${controlInk}\` on \`${controlBackground}\``,
          `\`${PLANTED_INK}\` on \`${PLANTED_BACKGROUND}\``,
          controlInk === PLANTED_INK && controlBackground === PLANTED_BACKGROUND ? 'PASS' : '**FAIL**'],
        ['Can-see control ratio', `${String(controlRatio)}:1`, `${String(PLANTED_RATIO)}:1 exactly`,
          controlRatio === PLANTED_RATIO ? 'PASS' : '**FAIL**'],
      ],
    ),
    '',
    '## The play surface, per set and per felt',
    '',
    'Every ink is found by exact match, because a flat fill renders exactly. Every ground is',
    `the **worst** pixel adjacent to that ink in the composited image, ${String(ADJACENT)} device`,
    'pixels out, which is past the antialiased edge and inside the grain.',
    '',
    ...table(
      ['Set', 'Felt', 'Graphic', 'Ink', 'Worst ground', 'Measured', 'Threshold', 'Verdict'],
      canvasRows,
    ),
    '',
    '## The chrome, in both themes',
    '',
    ...table(
      ['Theme', 'Graphic', 'Ink', 'Ground', 'Measured', 'Threshold', 'Verdict'],
      chromeRows,
    ),
    '',
    '## The enumerated list',
    '',
    '`scripts/report/graphics.mjs`, committed beside this script as the criterion requires.',
    'It carries what each graphic is, what it is measured against, its threshold and why it',
    'has that threshold.',
    '',
    ...table(
      ['Graphic', 'What', 'Threshold'],
      [...CANVAS_GRAPHICS, ...CHROME_GRAPHICS].map((entry) => [
        `\`${entry.id}\``,
        entry.what,
        `${String(entry.ratio)}:1`,
      ]),
    ),
    '',
    '## The control',
    '',
    'A paragraph in `rgb(119, 119, 119)` on `rgb(128, 128, 128)` is added to the page, read by',
    `the same sampler every text row uses, and removed. It measured **${String(controlRatio)}:1**`,
    `between \`${controlInk}\` and \`${controlBackground}\`, below the ${String(TEXT_RATIO)}:1 a text row`,
    'needs, so the sampler reports a real failure as a failure. Nothing under `src/` is touched',
    'by it.',
    '',
    '**The pair is asserted, not just the number.** The first form of this control screenshotted',
    'the element and reported 3.59:1, which is neither planted colour against the other: it is',
    `the planted background against the page ground behind it, caught along the element's edge,`,
    'because the sampler takes the colour **furthest** from the commonest one. That reading was',
    'under threshold too, so the control passed while measuring the wrong pair, and would have',
    'gone on passing if the sampler had lost the planted ink entirely. The census is now taken',
    `${String(PLANTED_INSET)} px inside the element, past that rim, and the ink, the background and the ratio are`,
    'each required to be the planted one.',
    '',
    '## Environment',
    '',
    ...table(['Condition', 'Value'], environmentRows([
      ['Engine', 'headless chromium, Playwright'],
      ['Served', `vite preview over dist/ on port ${String(PORT)}`],
      ['Seed', String(seed)],
      ['Tables', TABLES.join(', ')],
      ['Sets', PALETTES.map((entry) => entry.name).join(', ')],
      ['Themes', THEMES.join(', ')],
      ['Adjacency', `${String(ADJACENT)} device pixels, minimum ${String(MIN_SAMPLES)} samples`],
    ])),
    '',
    '## Reproduce',
    '',
    '```bash',
    'npm ci && npm run build && npm run report:contrast',
    '```',
  ];

  finish('contrast.md', lines, breaches);
}

await main();
