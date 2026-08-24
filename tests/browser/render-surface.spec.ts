/**
 * Items E3, E4 and E5 on a real canvas. Armour, not closure: all three are
 * Demonstration items whose captures happen at the ACCEPTANCE section 4
 * session; this suite is the automated half that a rasteriser is required
 * for, run on Chromium, Firefox and WebKit.
 *
 * The unit armour asserts the instructions the renderer issues; this file
 * asserts what those instructions become as pixels: the felt is the felt
 * token, the rail and the print ink actually land, the card margin clears the
 * 3:1 boundary contrast against every felt *in rendered pixels*, every
 * denomination of the 680 demonstration wager is visible in the stack, the
 * backing store follows integer and fractional device pixel ratios, and the
 * bake is deterministic to the byte on each engine.
 *
 * The scenes come from `tests/browser/support/render-demo.ts`, bundled here
 * at test time with Vite's library build and injected into the served page.
 * The shipped bundle does not change: the page under test is the same built
 * `dist/` every other browser test uses, and the harness rides in over it.
 * Samples are taken at region centres with per-channel tolerances, so an
 * engine's antialiasing cannot decide a verdict; presence counts carry an
 * absence control beside them where a zero could be vacuous.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';

import { CARD_GEOMETRY, cardHeight } from '../../src/render/card';
import { CHIP_FILL, CHIP_RING, FELT, SURFACE, type FeltName } from '../../src/render/tokens';
import { FELT_GEOMETRY } from '../../src/render/felt';
import type { RenderDemoApi } from './support/render-demo';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let bundled: Promise<string> | undefined;

/** Bundle the harness once per worker; every test injects the same bytes. */
function bundle(): Promise<string> {
  bundled ??= buildHarness();
  return bundled;
}

async function buildHarness(): Promise<string> {
  const result: unknown = await build({
    root: PROJECT_ROOT,
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: {
        entry: join(PROJECT_ROOT, 'tests', 'browser', 'support', 'render-demo.ts'),
        name: 'BJRenderDemo',
        formats: ['iife'],
      },
    },
  });

  const outputs = Array.isArray(result) ? result : [result];
  for (const candidate of outputs) {
    const chunks = (candidate as { output?: unknown[] }).output;
    if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        const emitted = chunk as { type?: string; code?: string };
        if (emitted.type === 'chunk' && typeof emitted.code === 'string') {
          return emitted.code;
        }
      }
    }
  }
  throw new Error('the render demo harness bundled to no chunk');
}

async function inject(page: Page): Promise<void> {
  await page.goto('/');
  await page.addScriptTag({ content: await bundle() });
  await page.waitForFunction(() => window.__bjRenderDemo !== undefined);
}

// ---------------------------------------------------------------------------
// Contrast over sampled pixels, the same WCAG arithmetic the token suite uses,
// applied to what the rasteriser actually produced.
// ---------------------------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminanceOf(rgb: readonly number[]): number {
  return 0.2126 * channel(rgb[0] ?? 0) + 0.7152 * channel(rgb[1] ?? 0) + 0.0722 * channel(rgb[2] ?? 0);
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const la = luminanceOf(a);
  const lb = luminanceOf(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hexToRgb(hex: string): number[] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function expectNear(sample: readonly number[], hex: string, tolerance: number, label: string): void {
  const wanted = hexToRgb(hex);
  for (const index of [0, 1, 2]) {
    expect
      .soft(Math.abs((sample[index] ?? 0) - (wanted[index] ?? 0)), `${label} channel ${String(index)}`)
      .toBeLessThanOrEqual(tolerance);
  }
}

test.describe('E5: the felt on a real canvas', () => {
  test('grounds, rails and prints the bronze table', async ({ page }) => {
    await inject(page);
    const scene = await page.evaluate(() => {
      const api = window.__bjRenderDemo;
      if (api === undefined) {
        throw new Error('harness missing');
      }
      return api.mountFeltPrint('bronze');
    });

    const centre = await page.evaluate(
      ({ canvasId, width, height }) => {
        const api = window.__bjRenderDemo as RenderDemoApi;
        return api.samplePixel(canvasId, width / 2, height / 2);
      },
      scene,
    );
    expectNear(centre, FELT.bronze, 16, 'felt centre');

    // The rail's centreline at mid height. The rail is drawn after the
    // vignette, so its token lands unmodulated.
    const railWidth = Math.max(FELT_GEOMETRY.railMinimum, FELT_GEOMETRY.rail * scene.height);
    const rail = await page.evaluate(
      ({ canvasId, x, y }) => {
        const api = window.__bjRenderDemo as RenderDemoApi;
        return api.samplePixel(canvasId, x, y);
      },
      { canvasId: scene.canvasId, x: railWidth / 2, y: scene.height / 2 },
    );
    expectNear(rail, SURFACE.rail, 24, 'rail');

    // Print ink present where the natural line prints, absent in the clear
    // dealer zone above the band: the absence strip is the control that keeps
    // the presence count from being satisfied by anything light.
    const counts = await page.evaluate(
      ({ canvasId, width, height, ink, bandY }) => {
        const api = window.__bjRenderDemo as RenderDemoApi;
        return {
          print: api.countNear(
            canvasId,
            { x: width * 0.1, y: bandY - 20, width: width * 0.8, height: 40 },
            ink,
            40,
          ),
          clear: api.countNear(
            canvasId,
            { x: width * 0.2, y: height * 0.16, width: width * 0.6, height: height * 0.14 },
            ink,
            40,
          ),
        };
      },
      {
        canvasId: scene.canvasId,
        width: scene.width,
        height: scene.height,
        ink: SURFACE.print,
        bandY: FELT_GEOMETRY.naturalY * scene.height,
      },
    );
    expect(counts.print).toBeGreaterThan(40);
    expect(counts.clear).toBe(0);
  });

  test('bakes identical pixels twice, and different tables differently', async ({ page }) => {
    await inject(page);
    const verdict = await page.evaluate(() => {
      const api = window.__bjRenderDemo;
      if (api === undefined) {
        throw new Error('harness missing');
      }
      return api.bakeDeterminism();
    });
    expect(verdict.same).toBe(true);
    expect(verdict.otherFeltIdentical).toBe(false);
  });
});

test.describe('the backing store follows the device pixel ratio', () => {
  for (const dpr of [2, 2.6273]) {
    test(`sizes the store and keeps the drawing crisp at dpr ${String(dpr)}`, async ({ page }) => {
      await inject(page);
      const scene = await page.evaluate(
        (ratio) => {
          const api = window.__bjRenderDemo;
          if (api === undefined) {
            throw new Error('harness missing');
          }
          return api.mountFeltPrint('silver', ratio);
        },
        dpr,
      );

      const store = await page.evaluate(
        (canvasId) => {
          const api = window.__bjRenderDemo as RenderDemoApi;
          return api.storeSize(canvasId);
        },
        scene.canvasId,
      );
      expect(store.width).toBe(Math.round(scene.width * dpr));
      expect(store.height).toBe(Math.round(scene.height * dpr));

      // The same logical centre still reads the felt token: the scale is in
      // the store, not in the drawing.
      const centre = await page.evaluate(
        ({ canvasId, x, y, ratio }) => {
          const api = window.__bjRenderDemo as RenderDemoApi;
          return api.samplePixel(canvasId, x, y, ratio);
        },
        { canvasId: scene.canvasId, x: scene.width / 2, y: scene.height / 2, ratio: dpr },
      );
      expectNear(centre, FELT.silver, 16, `felt centre at dpr ${String(dpr)}`);
    });
  }
});

test.describe('E3: the dealt hand on a real canvas', () => {
  for (const felt of ['bronze', 'silver', 'gold'] as const satisfies readonly FeltName[]) {
    test(`keeps the card margin readable against the ${felt} felt`, async ({ page }) => {
      await inject(page);
      const scene = await page.evaluate(
        (name) => {
          const api = window.__bjRenderDemo;
          if (api === undefined) {
            throw new Error('harness missing');
          }
          return api.mountCards(name);
        },
        felt,
      );

      const first = scene.cards[0];
      expect(first).toBeDefined();
      if (first === undefined) {
        return;
      }
      const midY = first.y + cardHeight(first.width) / 2;

      const [margin, feltBeside] = await page.evaluate(
        ({ canvasId, points }) => {
          const api = window.__bjRenderDemo as RenderDemoApi;
          return points.map(([x, y]) => api.samplePixel(canvasId, x ?? 0, y ?? 0));
        },
        {
          canvasId: scene.canvasId,
          points: [
            [first.x + 3, midY],
            [first.x - 8, midY],
          ],
        },
      );

      // SPEC 16's structural rule, measured on rendered pixels: the felt
      // cannot carry the card's boundary, the light margin does, and it must
      // clear 3:1 against what the rasteriser actually painted around it.
      expectNear(margin ?? [], SURFACE.cardMargin, 16, `margin on ${felt}`);
      expect(contrast(margin ?? [], feltBeside ?? [])).toBeGreaterThanOrEqual(3);
    });
  }

  test('shows the face, the red ink and the concealed back', async ({ page }) => {
    await inject(page);
    const scene = await page.evaluate(() => {
      const api = window.__bjRenderDemo;
      if (api === undefined) {
        throw new Error('harness missing');
      }
      return api.mountCards('bronze');
    });

    const king = scene.cards[1];
    const holeCard = scene.cards[4];
    expect(king?.rank).toBe('K');
    expect(holeCard?.faceUp).toBe(false);
    if (king === undefined || holeCard === undefined) {
      return;
    }

    // The king of hearts prints its corner index in the red ink.
    const cornerInk = await page.evaluate(
      ({ canvasId, region, ink }) => {
        const api = window.__bjRenderDemo as RenderDemoApi;
        return api.countNear(canvasId, region, ink, 80);
      },
      {
        canvasId: scene.canvasId,
        region: {
          x: king.x,
          y: king.y,
          width: CARD_GEOMETRY.indexX * king.width * 2,
          height: CARD_GEOMETRY.indexPipDrop * king.width * 1.6,
        },
        ink: SURFACE.rankRed,
      },
    );
    expect(cornerInk).toBeGreaterThan(0);

    // The face-down card shows the back token at its centre and no ink
    // anywhere: the face-up king beside it is the control for the counter.
    const centreOfBack = await page.evaluate(
      ({ canvasId, x, y }) => {
        const api = window.__bjRenderDemo as RenderDemoApi;
        return api.samplePixel(canvasId, x, y);
      },
      {
        canvasId: scene.canvasId,
        x: holeCard.x + holeCard.width / 2,
        y: holeCard.y + cardHeight(holeCard.width) / 2,
      },
    );
    expectNear(centreOfBack, SURFACE.cardBack, 16, 'card back');

    const backInk = await page.evaluate(
      ({ canvasId, region, inks }) => {
        const api = window.__bjRenderDemo as RenderDemoApi;
        return inks.map((ink) =>
          api.countNear(canvasId, region, ink, 30),
        );
      },
      {
        canvasId: scene.canvasId,
        region: {
          x: holeCard.x,
          y: holeCard.y,
          width: holeCard.width,
          height: cardHeight(holeCard.width),
        },
        inks: [SURFACE.rankRed, SURFACE.rankBlack],
      },
    );
    expect(backInk).toEqual([0, 0]);
  });
});

test.describe('E4: the 680 wager on a real canvas', () => {
  test('shows every denominational colour and the edge ring in one stack', async ({ page }) => {
    await inject(page);
    const scene = await page.evaluate(() => {
      const api = window.__bjRenderDemo;
      if (api === undefined) {
        throw new Error('harness missing');
      }
      return api.mountChips(680);
    });

    expect(scene.placements.map((placement) => placement.denomination)).toEqual([
      500, 100, 50, 10, 10, 10,
    ]);

    const top = scene.placements[scene.placements.length - 1];
    const bottom = scene.placements[0];
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    if (top === undefined || bottom === undefined) {
      return;
    }

    const region = {
      x: bottom.x - scene.radius,
      y: top.y - scene.radius,
      width: scene.radius * 2,
      height: bottom.y - top.y + scene.radius * 2,
    };
    const counts = await page.evaluate(
      ({ canvasId, where, inks }) => {
        const api = window.__bjRenderDemo as RenderDemoApi;
        return inks.map((ink) => api.countNear(canvasId, where, ink, 12));
      },
      {
        canvasId: scene.canvasId,
        where: region,
        inks: [CHIP_FILL[500], CHIP_FILL[100], CHIP_FILL[50], CHIP_FILL[10], CHIP_RING],
      },
    );

    // Every buried chip still shows its own fill through the stack offset,
    // which is the criterion's "reads as chips rather than only as a number".
    for (const [index, count] of counts.entries()) {
      expect(count, `ink ${String(index)} visible in the stack`).toBeGreaterThan(0);
    }

    // And the top chip reads as its own fill, unmistakably the 10. Sampled
    // straight below the centre: clear of the value glyph above, and at half
    // a radius it sits well inside the dash band's inner edge.
    const topCentre = await page.evaluate(
      ({ canvasId, x, y }) => {
        const api = window.__bjRenderDemo as RenderDemoApi;
        return api.samplePixel(canvasId, x, y);
      },
      {
        canvasId: scene.canvasId,
        x: top.x,
        y: top.y + scene.radius * 0.5,
      },
    );
    expectNear(topCentre, CHIP_FILL[10], 16, 'top chip fill');
  });
});
