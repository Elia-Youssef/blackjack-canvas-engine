/**
 * The baked-felt cache. `BJ-22`'s fix round, items `H1`, `H4` and `H7`.
 *
 * **What this file exists to pin, and the measurement behind it.** Before the
 * timed control rows were stabilised, SPEC 10's replacements made the surface
 * visit `1029x579`, `1121x631` and `407x229`: 27 backing-store changes in three
 * rounds, 21 long tasks in 20 seconds, the worst 176 ms against item `H4`'s
 * 50 ms ceiling, and app work per frame at 10.4 ms against item `H7`'s 8. The
 * shipped layout no longer visits the widest size merely because a status line
 * replaced an action row, but the cache still has to hold across three sizes:
 * viewport, size-setting and result-screen changes can all produce them.
 *
 * The cure is a cache, and a cache is only a cure while it actually hits. The
 * pin below is therefore a **count**: a full phase cycle bakes once per distinct
 * size and no more. A cache that quietly stopped matching would leave every
 * measured number exactly where the review found it and no other test in the
 * project would notice, which is why `scripts/mutation-check.mjs` carries an
 * entry that blinds the lookup and requires this file to go red.
 *
 * The three properties under it are the ones that make the count safe rather
 * than merely small: the lookup asks `needsRebake` and nothing else, so the
 * rule has one home; the cache is bounded, so it is not a leak item `H5`
 * measures for; and a spec change `needsRebake` reports still rebakes.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { resolveMotion } from '../../src/render/animate';
import {
  createPlaySurface,
  FELT_CACHE_LIMIT,
  needsRebake,
  type PlaySurface,
  type SceneState,
} from '../../src/render/scene';
import type { SurfaceCanvas } from '../../src/render/surface';
import { HIGH_CONTRAST_PALETTE, STANDARD_PALETTE } from '../../src/render/tokens';
import { createStyleFreeCanvas } from './support/recording-context';

/** The three sizes the original measured phase cycle visited, in its order. */
const BETTING = { width: 1029, height: 579, dpr: 1 };
const DEALING = { width: 1121, height: 631, dpr: 1 };
const RESULT = { width: 407, height: 229, dpr: 1 };

/**
 * The original measured cycle: betting, dealing, the player turn, the reveal,
 * the round result, and round again. It remains the cache's worst-case armour;
 * the shipped timed rows now avoid the two transient widest-size visits.
 */
const ROUND = [BETTING, DEALING, BETTING, DEALING, RESULT];

/** Enough rounds to pass the 27 changes the sample recorded. */
const ROUNDS = 6;

/** What the sample counted, so the pin below is measured rather than chosen. */
const MEASURED_CHANGES = 27;

/** A scene with nothing on it, which is all the felt cache cares about. */
function scene(overrides: Partial<SceneState> = {}): SceneState {
  return {
    felt: 'bronze',
    limits: { minimum: 10, maximum: 100 },
    dealer: [],
    dealerConcealed: 0,
    hands: [],
    pendingWager: 0,
    motion: resolveMotion({ reducedMotion: true, speed: 'normal' }),
    palette: STANDARD_PALETTE,
    ...overrides,
  };
}

interface Harness {
  readonly surface: PlaySurface;
  /** How many felts have been baked. A felt bake is the one that prints. */
  bakes(): number;
  /** Every canvas the surface asked for, felts and grain squares alike. */
  canvases(): number;
  /** How many canvases the felt layer is still holding. */
  live(): number;
  /** The canvas the layer was last told to show. */
  showing(): SurfaceCanvas | null;
}

function harness(): Harness {
  const made: ReturnType<typeof createStyleFreeCanvas>[] = [];
  const layer: SurfaceCanvas[] = [];
  let shown: SurfaceCanvas | null = null;
  const surface = createPlaySurface({
    canvas: createStyleFreeCanvas().canvas,
    offscreen: () => {
      const one = createStyleFreeCanvas();
      made.push(one);
      return one.canvas;
    },
    // The headless stand-in for the shell's felt stack. It answers the same
    // three questions `src/ui/layout.ts` answers over real elements.
    feltLayer: {
      acquire: () => {
        const one = createStyleFreeCanvas();
        made.push(one);
        layer.push(one.canvas);
        return one.canvas;
      },
      show: (canvas) => {
        shown = canvas;
      },
      release: (canvas) => {
        layer.splice(layer.indexOf(canvas), 1);
      },
    },
    sizing: BETTING,
  });
  return {
    surface,
    // SPEC 16's four printed lines are baked into the felt and into nothing
    // else, so a recording that printed is a felt and a recording that did not
    // is one of the two grain squares.
    bakes: () => made.filter((one) => one.recording.calls('fillText').length > 0).length,
    canvases: () => made.length,
    live: () => layer.length,
    showing: () => shown,
  };
}

/** Drive one full round of the measured cycle. */
function playRound(surface: PlaySurface, state: SceneState = scene()): void {
  for (const sizing of ROUND) {
    surface.resize(sizing);
    surface.render(state, 1 / 60);
  }
}

describe('BJ-22: the felt bakes once per distinct size, not once per screen', () => {
  it('bakes three times across a phase cycle that changes size 30 times', () => {
    const { surface, bakes } = harness();
    const changes = ROUNDS * ROUND.length;

    for (let round = 0; round < ROUNDS; round += 1) {
      playRound(surface);
    }

    expect(changes).toBeGreaterThanOrEqual(MEASURED_CHANGES);
    expect(new Set(ROUND).size, 'the cycle stopped visiting three sizes').toBe(3);
    // The count the review asked for. Before the cache it was one per change.
    expect(bakes()).toBe(3);
  });

  it('bakes one grain pair for the whole cycle, not one per felt bake', () => {
    // The squares are keyed on the felt colour and the backing-store scale,
    // neither of which the phase cycle moves, so three felts share one pair:
    // two grain canvases and three felt canvases, five in all.
    const { surface, bakes, canvases } = harness();

    for (let round = 0; round < ROUNDS; round += 1) {
      playRound(surface);
    }

    expect(bakes()).toBe(3);
    expect(canvases()).toBe(3 + 2);
  });

  it('bakes no grain at all for a flat felt, which cannot draw one', () => {
    // SPEC 16's forced-colors subsection suppresses the gradient and the grain
    // under the high-contrast set, so `bakeFelt` skips the whole grain path and
    // issues zero `drawImage` calls. A pair baked anyway is 4,096 cells of work
    // no frame can read, and it lands in a `GRAIN_CACHE_LIMIT` of four beside
    // the pairs the standard set is still using: three tables under forced
    // colors fill it, and the live pair is evicted by pairs that exist only
    // because the call site asked for one before the bake could refuse it.
    const flat = harness();
    flat.surface.render(scene({ palette: HIGH_CONTRAST_PALETTE }), 0);
    expect(flat.bakes(), 'the felt did not bake').toBe(1);
    expect(flat.canvases(), 'a flat felt paid for grain squares').toBe(1);

    // The control: the same frame on the standard set does bake the pair, so
    // the count above is the flat path answering and not the instrument
    // failing to see a grain square at all.
    const textured = harness();
    textured.surface.render(scene(), 0);
    expect(textured.bakes()).toBe(1);
    expect(textured.canvases()).toBe(1 + 2);
  });

  it('still rebakes for every spec change `needsRebake` reports', () => {
    // The cache is not a licence to serve a stale table. Each of these is a
    // field `needsRebake` compares, and each has to cost a bake.
    const { surface, bakes } = harness();
    surface.render(scene(), 0);
    expect(bakes()).toBe(1);

    let expected = 1;
    for (const changed of [
      scene({ felt: 'silver' }),
      scene({ limits: { minimum: 50, maximum: 500 } }),
      scene({ palette: HIGH_CONTRAST_PALETTE }),
    ]) {
      expected += 1;
      surface.render(changed, 0);
      expect(bakes(), JSON.stringify({ felt: changed.felt, limits: changed.limits })).toBe(expected);
    }

    // And a resize, which `needsRebake` sees as a size change.
    surface.resize(DEALING);
    surface.render(scene({ palette: HIGH_CONTRAST_PALETTE }), 0);
    expect(bakes()).toBe(expected + 1);
  });

  it('holds the cache to its stated bound and evicts the least recent', () => {
    // A cache of backing stores is a leak unless it is bounded, and item `H5`
    // measures for exactly that. The bound is four; a fifth distinct size
    // therefore costs the oldest one its entry, and returning to it rebakes.
    const { surface, bakes } = harness();
    const sizes = [
      { width: 400, height: 300, dpr: 1 },
      { width: 500, height: 300, dpr: 1 },
      { width: 600, height: 300, dpr: 1 },
      { width: 700, height: 300, dpr: 1 },
      { width: 800, height: 300, dpr: 1 },
    ];
    expect(sizes).toHaveLength(FELT_CACHE_LIMIT + 1);

    for (const sizing of sizes) {
      surface.resize(sizing);
      surface.render(scene(), 0);
    }
    expect(bakes()).toBe(5);

    // The last four are still held, so revisiting them is free.
    for (const sizing of sizes.slice(1)) {
      surface.resize(sizing);
      surface.render(scene(), 0);
    }
    expect(bakes()).toBe(5);

    // The first was evicted, so it costs a bake again.
    surface.resize(sizes[0] ?? BETTING);
    surface.render(scene(), 0);
    expect(bakes()).toBe(6);
  });

  it('hands the layer one canvas per held bake and takes back the evicted one', () => {
    // The bound is a memory bound, so it has to reach the layer: an evicted
    // entry that stayed in the shell would be a canvas nothing draws and
    // nothing releases, which is the leak the bound exists to prevent.
    const { surface, live, showing } = harness();
    for (let width = 400; width <= 800; width += 100) {
      surface.resize({ width, height: 300, dpr: 1 });
      surface.render(scene(), 0);
    }
    expect(live()).toBe(FELT_CACHE_LIMIT);
    // And the layer is showing the bake this frame chose, not a held one.
    expect(showing()).not.toBeNull();
    expect(surface.feltSpec().width).toBe(800);
  });

  /**
   * The spec handed out by `feltSpec()` is the cache's own key.
   *
   * `needsRebake(entry.spec, wanted)` decides whether the next frame pays for a
   * bake, and `feltSpec()` returns that very object, so before it was frozen a
   * four-byte edit from outside made the cache miss on every subsequent frame
   * and pay a bake the `BJ-22` measurement put at 176 ms, against item `H4`'s
   * 50 ms ceiling. Nothing in the shipped page calls `feltSpec()` at all, which
   * is why this was armour rather than a live defect; the interface invites the
   * call, so the armour is the pin.
   */
  it('hands out a frozen spec, so nothing outside can poison the cache with it', () => {
    const { surface, bakes } = harness();
    surface.render(scene(), 1 / 60);
    expect(bakes()).toBe(1);

    const spec = surface.feltSpec();
    expect(Object.isFrozen(spec)).toBe(true);
    // The attack, which the freeze turns into a no-op in loose mode and a throw
    // in the strict mode this file runs under. Either way the width is intact.
    expect(() => {
      (spec as { width: number }).width = 12_345;
    }).toThrow(TypeError);
    expect(surface.feltSpec().width).toBe(BETTING.width);

    // The regression itself: an identical second frame still hits the cache.
    surface.render(scene(), 1 / 60);
    surface.render(scene(), 1 / 60);
    expect(bakes(), 'an identical frame paid for a bake').toBe(1);
  });

  it('reads the cache through `needsRebake` and not a second copy of the rule', () => {
    // `needsRebake` is documented as "the whole of the caching rule". A cache
    // keyed on a string would be a second encoding of it, free to drift out
    // from under the mutation entry that breaks the first. This asserts the
    // agreement in the direction that matters: every field the predicate
    // compares costs a bake above, and a field it does not compare costs none.
    const { surface, bakes } = harness();
    surface.render(scene(), 0);
    expect(bakes()).toBe(1);

    // `pendingWager` is not a felt field, so the predicate ignores it and so
    // must the cache.
    surface.render(scene({ pendingWager: 50 }), 0);
    expect(bakes()).toBe(1);

    const base = {
      felt: 'bronze',
      limits: { minimum: 10, maximum: 100 },
      width: 1029,
      height: 579,
      dpr: 1,
      palette: STANDARD_PALETTE,
    } as const;
    expect(needsRebake(base, { ...base })).toBe(false);
    expect(needsRebake(base, { ...base, palette: HIGH_CONTRAST_PALETTE })).toBe(true);
  });
});
