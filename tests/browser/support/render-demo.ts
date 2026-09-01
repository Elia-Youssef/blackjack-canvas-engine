/**
 * The in-page harness behind `tests/browser/render-surface.spec.ts`, and the
 * demonstration hook for items E3, E4 and E5 until the composition root at
 * BJ-15 wires the renderer into the game.
 *
 * The browser spec bundles this file with Vite's library build at test time
 * and injects it into the served page, where it mounts the three scenes the
 * ACCEPTANCE section 4 script names on a real canvas: the dealt hand for
 * `demo/cards`, the 680 wager for `demo/chips`, the printed felt per table
 * for `demo/felt-print`. Nothing here ships: the emitted bundle never
 * imports this file, `npm run verify:build` fingerprints the same bytes with
 * and without it, and the demonstration session captures the real game once
 * it is composed.
 *
 * A reviewer can also drive the scenes by hand, without Playwright, from the
 * dev server console:
 *
 *   npm run dev
 *   const demo = await import('/tests/browser/support/render-demo.ts');
 *   demo.mountAll();
 *
 * Layout numbers in this file are scene staging, test support rather than
 * component code; every colour still resolves through the token record, and
 * the E1 scan covers `src/` where the components live.
 */

import { TABLES, tableLimits, type TableId } from '../../../src/core/wallet';
import type { Rank, Suit } from '../../../src/core/cards';
import { drawCardShapes, drawCardText, cardHeight, type CardSpec } from '../../../src/render/card';
import {
  chipStackLayout,
  drawChipStackShapes,
  drawChipStackText,
  wagerToChips,
  type ChipPlacement,
  type ChipStackSpec,
} from '../../../src/render/chips';
import {
  bakeFelt,
  bakeGrainTiles,
  type FeltSpec,
  type GrainTiles,
} from '../../../src/render/felt';
import { createSurface, renderFrame, type ScenePasses } from '../../../src/render/surface';
import {
  feltColour,
  STANDARD_PALETTE,
  type FeltName,
  type SelectedPalette,
} from '../../../src/render/tokens';

const SCENE_WIDTH = 640;
const SCENE_HEIGHT = 400;

export interface MountedScene {
  readonly canvasId: string;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export interface CardsScene extends MountedScene {
  readonly cards: readonly CardSpec[];
}

export interface ChipsScene extends MountedScene {
  readonly radius: number;
  readonly placements: readonly ChipPlacement[];
}

function mountCanvas(id: string): HTMLCanvasElement {
  document.getElementById(id)?.remove();
  const canvas = document.createElement('canvas');
  canvas.id = id;
  document.body.append(canvas);
  return canvas;
}

function feltLayerFor(
  felt: FeltName,
  table: TableId,
  dpr: number,
  palette: SelectedPalette,
): ScenePasses {
  const spec: FeltSpec = {
    felt,
    limits: tableLimits(table),
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    dpr,
    palette,
  };
  return bakeFelt(document.createElement('canvas'), spec, () => demoGrain(felt, dpr, palette));
}

/** The grain pair a demo bake needs, made the way the composition root does. */
function demoGrain(felt: FeltName, dpr: number, palette: SelectedPalette): GrainTiles {
  return bakeGrainTiles(() => document.createElement('canvas'), {
    felt: feltColour(palette.surface, felt),
    dpr,
  });
}

function mountScene(
  id: string,
  layers: readonly ScenePasses[],
  dpr: number,
  palette: SelectedPalette,
): MountedScene {
  const canvas = mountCanvas(id);
  const surface = createSurface(canvas, { width: SCENE_WIDTH, height: SCENE_HEIGHT, dpr });
  renderFrame(surface, layers, palette.surface);
  return { canvasId: id, width: SCENE_WIDTH, height: SCENE_HEIGHT, dpr };
}

/**
 * `demo/felt-print`: the whole felt for one table, its own colour, its own
 * limits. The session captures one per table.
 */
export function mountFeltPrint(
  table: TableId,
  dpr = 1,
  palette: SelectedPalette = STANDARD_PALETTE,
): MountedScene {
  return mountScene(
    `demo-felt-${table}`,
    [feltLayerFor(table, table, dpr, palette)],
    dpr,
    palette,
  );
}

/**
 * `demo/cards`: the hand the section 4 script deals, one card per suit with
 * an Ace, a court card and both pip densities, plus the face-down hole card,
 * so one capture shows the corners, the layouts, the back and the margin.
 */
export function mountCards(
  felt: FeltName,
  dpr = 1,
  palette: SelectedPalette = STANDARD_PALETTE,
): CardsScene {
  const width = 96;
  const gap = 24;
  const y = (SCENE_HEIGHT - cardHeight(width)) / 2;
  const hand: readonly (readonly [Rank, Suit, boolean])[] = [
    ['A', 'spades', true],
    ['K', 'hearts', true],
    ['7', 'clubs', true],
    ['10', 'diamonds', true],
    ['9', 'hearts', false],
  ];
  const cards: CardSpec[] = hand.map(([rank, suit, faceUp], index) => ({
    rank,
    suit,
    faceUp,
    x: gap + index * (width + gap),
    y,
    width,
  }));

  const cardsLayer: ScenePasses = {
    drawShapes(ctx): void {
      for (const card of cards) {
        drawCardShapes(ctx, card, palette.surface);
      }
    },
    drawText(ctx): void {
      for (const card of cards) {
        drawCardText(ctx, card, palette.surface);
      }
    },
  };

  const scene = mountScene(
    `demo-cards-${felt}`,
    [feltLayerFor(felt, felt, dpr, palette), cardsLayer],
    dpr,
    palette,
  );
  return { ...scene, cards };
}

/**
 * `demo/chips`: the section 4 wager, 680 by default, as one stack. 680 is the
 * smallest kind of stack that shows all four denominational colours at once.
 */
export function mountChips(
  wager = 680,
  dpr = 1,
  palette: SelectedPalette = STANDARD_PALETTE,
): ChipsScene {
  const radius = 36;
  const stack: ChipStackSpec = {
    x: SCENE_WIDTH / 2,
    y: SCENE_HEIGHT * 0.62,
    radius,
    chips: wagerToChips(wager),
  };
  const chipsLayer: ScenePasses = {
    drawShapes(ctx): void {
      drawChipStackShapes(ctx, stack, palette.chipRing);
    },
    drawText(ctx): void {
      drawChipStackText(ctx, stack);
    },
  };

  const scene = mountScene(
    'demo-chips',
    [feltLayerFor('bronze', 'bronze', dpr, palette), chipsLayer],
    dpr,
    palette,
  );
  return { ...scene, radius, placements: chipStackLayout(stack) };
}

/** Every scene at once: the by-hand entry for a reviewer at the dev server. */
export function mountAll(): void {
  for (const table of TABLES) {
    mountFeltPrint(table.id);
  }
  mountCards('bronze');
  mountChips();
}

/**
 * Bake the same felt twice off-screen and a different one beside them, and
 * compare pixels. The contrasting pair is the control that keeps the equal
 * pair honest: a comparison that cannot differ proves nothing.
 */
export function bakeDeterminism(dpr = 1): { same: boolean; otherFeltIdentical: boolean } {
  const encode = (felt: FeltName): string => {
    const canvas = document.createElement('canvas');
    bakeFelt(
      canvas,
      {
        felt,
        limits: tableLimits('bronze'),
        width: SCENE_WIDTH,
        height: SCENE_HEIGHT,
        dpr,
        palette: STANDARD_PALETTE,
      },
      () => demoGrain(felt, dpr, STANDARD_PALETTE),
    );
    return canvas.toDataURL();
  };
  const first = encode('bronze');
  const second = encode('bronze');
  const other = encode('gold');
  return { same: first === second, otherFeltIdentical: other === first };
}

/** The store's device-pixel size, for the DPR assertions. */
export function storeSize(canvasId: string): { width: number; height: number } {
  const canvas = document.getElementById(canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`no canvas mounted as ${canvasId}`);
  }
  return { width: canvas.width, height: canvas.height };
}

function contextOf(canvasId: string): { ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement } {
  const canvas = document.getElementById(canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`no canvas mounted as ${canvasId}`);
  }
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error(`no 2d context on ${canvasId}`);
  }
  return { ctx, canvas };
}

/**
 * One pixel, sampled at logical coordinates. The harness is a measuring
 * instrument reading the backing store, so this is the one test-side place
 * that maps logical to device coordinates; `src/render/` still never does.
 */
export function samplePixel(canvasId: string, x: number, y: number, dpr = 1): number[] {
  const { ctx, canvas } = contextOf(canvasId);
  const deviceX = Math.min(canvas.width - 1, Math.round(x * dpr));
  const deviceY = Math.min(canvas.height - 1, Math.round(y * dpr));
  return Array.from(ctx.getImageData(deviceX, deviceY, 1, 1).data);
}

/**
 * How many pixels of a logical region land within `tolerance` of a hex, per
 * channel. Presence and absence of an ink, robust to antialiasing.
 */
export function countNear(
  canvasId: string,
  region: { x: number; y: number; width: number; height: number },
  hex: string,
  tolerance: number,
  dpr = 1,
): number {
  const { ctx, canvas } = contextOf(canvasId);
  const x = Math.max(0, Math.round(region.x * dpr));
  const y = Math.max(0, Math.round(region.y * dpr));
  const width = Math.min(canvas.width - x, Math.round(region.width * dpr));
  const height = Math.min(canvas.height - y, Math.round(region.height * dpr));
  const wanted = [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
  const data = ctx.getImageData(x, y, width, height).data;
  let count = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    if (
      Math.abs(red - (wanted[0] ?? 0)) <= tolerance &&
      Math.abs(green - (wanted[1] ?? 0)) <= tolerance &&
      Math.abs(blue - (wanted[2] ?? 0)) <= tolerance
    ) {
      count += 1;
    }
  }
  return count;
}

export interface RenderDemoApi {
  mountFeltPrint: typeof mountFeltPrint;
  mountCards: typeof mountCards;
  mountChips: typeof mountChips;
  mountAll: typeof mountAll;
  bakeDeterminism: typeof bakeDeterminism;
  storeSize: typeof storeSize;
  samplePixel: typeof samplePixel;
  countNear: typeof countNear;
}

declare global {
  interface Window {
    __bjRenderDemo?: RenderDemoApi;
  }
}

window.__bjRenderDemo = {
  mountFeltPrint,
  mountCards,
  mountChips,
  mountAll,
  bakeDeterminism,
  storeSize,
  samplePixel,
  countNear,
};
