/**
 * Unit armour under `BJ-16`'s layout. Items `F1` (Critical), `F3`, `F6`, `F7`.
 *
 * None of the four is closed here. They are graded in Playwright over the built
 * `dist/`, because a rendered box, a scrollbar and a hit test cannot be seen from
 * a unit test. What this file covers is the part of the part that is arithmetic
 * and needs no browser at all, and it covers it in the shape
 * `tests/unit/tokens.test.ts` established: **the numbers come from the contract
 * fixture, not from the code**, so a breakpoint that drifts off QUALITY-BAR
 * section 5 is a red suite rather than a layout somebody notices later.
 *
 * Three properties here are load bearing and would otherwise be invisible until
 * a screenshot:
 *
 * - **The four breakpoints are exhaustive and mutually exclusive**, and the
 *   1024 x 1366 tablet in its natural orientation is `wide`. QUALITY-BAR section
 *   5 records an earlier form of the table leaving that viewport matching no row.
 * - **At 100 percent the surface never asks for more than its box.** This is the
 *   arithmetic half of the defect the `BJ-14` review recorded, where a surface
 *   that outgrew its row grew the document and pushed the action buttons below
 *   the fold. The sweep below drives the boxes that defect happened in.
 * - **The size setting multiplies the scale exactly**, and the base scale does
 *   not move when the setting does, which is the property that keeps item `F6`'s
 *   "by that factor" from becoming "by roughly that factor after two frames".
 *
 * And one drift guard: `SurfaceSize` is declared in two files that may not
 * import each other before `BJ-20`, so the two declarations are compared here.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SURFACE_SIZE,
  SURFACE_SIZES,
  surfaceSizeFactor,
  type SurfaceSize,
} from '../../src/render/surface';
import {
  DEFAULT_SURFACE_SIZE as STORED_DEFAULT_SURFACE_SIZE,
  SURFACE_SIZES as STORED_SURFACE_SIZES,
} from '../../src/storage/document';
import {
  BREAKPOINT_NAMES,
  MEDIUM_MIN_WIDTH,
  MIN_SURFACE_HEIGHT,
  FALLBACK_SURFACE_WIDTH,
  NO_CHROME_HEIGHTS,
  STICKY_BARS_MIN_HEIGHT,
  SURFACE_FRAMING,
  WIDE_MIN_WIDTH,
  barsStick,
  framingFor,
  planSurface,
  resolveBreakpoint,
  sameSizing,
  type BreakpointName,
  type ChromeHeights,
} from '../../src/ui/breakpoints';
import {
  PRIMARY_READOUT_KEYS,
  READOUT_KEYS,
  SECONDARY_READOUT_KEYS,
} from '../../src/ui/components/readouts';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTRACT = readFileSync(join(PROJECT_ROOT, 'tests', 'reference', 'design-contract.md'), 'utf8');

/** The text of one numbered section of the contract. Mirrors tokens.test.ts. */
function section(heading: string): string {
  const start = CONTRACT.indexOf(`## ${heading}`);
  expect(start, `section "${heading}" not found`).toBeGreaterThan(-1);
  const after = CONTRACT.indexOf('\n## ', start + 1);
  return CONTRACT.slice(start, after === -1 ? CONTRACT.length : after);
}

const SECTION_5 = section('5. Responsive and adaptive layout');

/** `| \`name\` | 1024px |` from the threshold table. */
function thresholds(): Map<string, number> {
  const found = new Map<string, number>();
  for (const match of SECTION_5.matchAll(/\|\s*`([a-z-]+)`\s*\|\s*(\d+)px\s*\|/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      found.set(name, Number(value));
    }
  }
  return found;
}

const THRESHOLDS = thresholds();

function threshold(name: string): number {
  const value = THRESHOLDS.get(name);
  expect(value, `${name} is not in the contract's section 5`).toBeDefined();
  return value ?? 0;
}

describe('F1: the breakpoint table is the contract fixture, not this code', () => {
  it('finds every threshold section 5 states', () => {
    expect([...THRESHOLDS.keys()].sort()).toEqual([
      'medium-min-width',
      'small-viewport-height',
      'small-viewport-width',
      'sticky-bars-min-height',
      'surface-min-height',
      'wide-min-width',
    ]);
  });

  it('declares the play surfaces minimum height exactly as the contract does', () => {
    // The one number that lives in two forms: a CSS length in `tokens.css` and
    // this integer, because the sticky decision is arithmetic over it. The
    // browser gate asserts the token resolves to the same number.
    expect(MIN_SURFACE_HEIGHT).toBe(threshold('surface-min-height'));
  });

  it('declares the two width floors exactly as the contract does', () => {
    expect(WIDE_MIN_WIDTH).toBe(threshold('wide-min-width'));
    expect(MEDIUM_MIN_WIDTH).toBe(threshold('medium-min-width'));
    expect(WIDE_MIN_WIDTH).toBeGreaterThan(MEDIUM_MIN_WIDTH);
  });

  it('declares the sticky-bar height threshold exactly as the contract does', () => {
    expect(STICKY_BARS_MIN_HEIGHT).toBe(threshold('sticky-bars-min-height'));
  });

  it('names the four breakpoints, in section 5s order, with no fifth', () => {
    expect([...BREAKPOINT_NAMES]).toEqual(['wide', 'medium', 'compact', 'portrait']);
    for (const name of BREAKPOINT_NAMES) {
      expect(SECTION_5, `${name} is not named in the contract`).toContain(`\`${name}\``);
    }
  });

  it('offers exactly the four play-surface sizes the contract lists', () => {
    const row = /\|\s*`play-surface-size`\s*\|\s*([\d\s/]+)\s*\|/.exec(SECTION_5);
    expect(row?.[1], 'no play-surface-size row').toBeDefined();
    const listed = (row?.[1] ?? '').split('/').map((part) => Number(part.trim()));
    expect([...SURFACE_SIZES]).toEqual(listed);
    expect(DEFAULT_SURFACE_SIZE).toBe(listed[0]);
  });
});

describe('F1: resolution is by width first, and the four cover everything', () => {
  /** Every interesting viewport, including both sides of both floors. */
  const WIDTHS = [
    0, 1, 240, 319, 320, 321, 375, 480, 600, 700, 767, 768, 769, 900, 1023, 1024, 1025, 1280, 1440,
    1920, 3840,
  ];
  const HEIGHTS = [0, 1, 200, 256, 399, 400, 401, 640, 720, 812, 1024, 1366, 2160];

  it('answers exactly one of the four for every viewport in the sweep', () => {
    let seen = 0;
    for (const width of WIDTHS) {
      for (const height of HEIGHTS) {
        const name = resolveBreakpoint({ width, height });
        expect(BREAKPOINT_NAMES, `${String(width)}x${String(height)}`).toContain(name);
        seen += 1;
      }
    }
    // The sweep is the claim, so its size is asserted rather than assumed.
    expect(seen).toBe(WIDTHS.length * HEIGHTS.length);
  });

  it('reaches all four names inside the sweep', () => {
    const found = new Set<BreakpointName>();
    for (const width of WIDTHS) {
      for (const height of HEIGHTS) {
        found.add(resolveBreakpoint({ width, height }));
      }
    }
    expect([...found].sort()).toEqual(['compact', 'medium', 'portrait', 'wide']);
  });

  it('resolves the 1024 by 1366 tablet in portrait to wide, not to portrait', () => {
    // The trap QUALITY-BAR section 5 states in as many words: an earlier form of
    // the table qualified `wide` as landscape and left this viewport matching no
    // row at all.
    expect(resolveBreakpoint({ width: 1024, height: 1366 })).toBe('wide');
    expect(resolveBreakpoint({ width: 1366, height: 1024 })).toBe('wide');
    // And every width at or above the floor, in either orientation.
    for (const height of [600, 1024, 1366, 2160]) {
      expect(resolveBreakpoint({ width: WIDE_MIN_WIDTH, height })).toBe('wide');
    }
  });

  it('puts each floor on the row above it', () => {
    expect(resolveBreakpoint({ width: WIDE_MIN_WIDTH, height: 600 })).toBe('wide');
    expect(resolveBreakpoint({ width: WIDE_MIN_WIDTH - 1, height: 600 })).toBe('medium');
    expect(resolveBreakpoint({ width: MEDIUM_MIN_WIDTH, height: 1000 })).toBe('medium');
    expect(resolveBreakpoint({ width: MEDIUM_MIN_WIDTH, height: 400 })).toBe('medium');
    expect(resolveBreakpoint({ width: MEDIUM_MIN_WIDTH - 1, height: 1000 })).toBe('portrait');
    expect(resolveBreakpoint({ width: MEDIUM_MIN_WIDTH - 1, height: 400 })).toBe('compact');
  });

  it('lets orientation decide below the medium floor, and nowhere else', () => {
    for (const width of [320, 480, 600, 767]) {
      expect(resolveBreakpoint({ width, height: width - 1 })).toBe('compact');
      expect(resolveBreakpoint({ width, height: width + 1 })).toBe('portrait');
      // A square viewport is portrait, which is the CSS `orientation: portrait`
      // media feature's own rule rather than a preference of this file's.
      expect(resolveBreakpoint({ width, height: width })).toBe('portrait');
    }
    for (const width of [768, 1024, 1920]) {
      const landscape = resolveBreakpoint({ width, height: 300 });
      const portrait = resolveBreakpoint({ width, height: 3000 });
      expect(portrait, 'orientation must not decide above the medium floor').toBe(landscape);
    }
  });

  it('resolves the 320 by 256 viewport section 5 fixes to compact', () => {
    const width = threshold('small-viewport-width');
    const height = threshold('small-viewport-height');
    expect(resolveBreakpoint({ width, height })).toBe('compact');
    expect(barsStick({ width, height }, NO_CHROME_HEIGHTS)).toBe(false);
  });
});

describe('F7 and F1: the bars stick at the threshold, and only where they fit', () => {
  /** A chrome that costs nothing, so the threshold is the only condition left. */
  const WEIGHTLESS = NO_CHROME_HEIGHTS;

  /** Two bars and the shell's padding, at about what 320 px of width costs. */
  const NARROW: ChromeHeights = { top: 250, controls: 200, overhead: 40 };

  it('sticks at the threshold and unsticks one pixel below it', () => {
    expect(barsStick({ width: 800, height: STICKY_BARS_MIN_HEIGHT }, WEIGHTLESS)).toBe(true);
    expect(barsStick({ width: 800, height: STICKY_BARS_MIN_HEIGHT - 1 }, WEIGHTLESS)).toBe(false);
    expect(barsStick({ width: 800, height: STICKY_BARS_MIN_HEIGHT + 1 }, WEIGHTLESS)).toBe(true);
  });

  it('applies the threshold at every width', () => {
    for (const width of [320, 500, 768, 1024, 1920]) {
      expect(barsStick({ width, height: 256 }, WEIGHTLESS)).toBe(false);
      expect(barsStick({ width, height: 900 }, WEIGHTLESS)).toBe(true);
    }
  });

  it('refuses to stick where the two bars and the play surface do not fit', () => {
    // The `BJ-16` review's defect, as arithmetic: a 320 px wide top bar wraps to
    // several rows, and a viewport well above the threshold then has no room for
    // the sticky layout. Sticking there squeezed the play-surface row to nothing
    // and put controls below a fold the page could not scroll past.
    const needed = NARROW.top + NARROW.controls + NARROW.overhead + MIN_SURFACE_HEIGHT;
    expect(barsStick({ width: 320, height: needed - 1 }, NARROW)).toBe(false);
    expect(barsStick({ width: 320, height: needed }, NARROW)).toBe(true);
    expect(barsStick({ width: 320, height: needed + 1 }, NARROW)).toBe(true);
    // And the two viewports the review measured on the shipped page.
    expect(barsStick({ width: 320, height: 420 }, NARROW)).toBe(false);
    expect(barsStick({ width: 320, height: 568 }, NARROW)).toBe(false);
  });

  it('keeps the play surfaces minimum inside the sum, or the row can still vanish', () => {
    // The clause that makes the rule about the play surface rather than about
    // the two bars: a viewport with exactly enough room for the bars and nothing
    // else must not stick, because the row between them would be zero.
    const exact = NARROW.top + NARROW.controls + NARROW.overhead;
    expect(barsStick({ width: 320, height: exact }, NARROW)).toBe(false);
    expect(barsStick({ width: 320, height: exact + MIN_SURFACE_HEIGHT }, NARROW)).toBe(true);
  });

  it('cannot oscillate, because nothing it measures moves when it answers', () => {
    // The property the rule rests on, stated as a test: the decision is a pure
    // function of three content heights and a viewport, so feeding the same
    // measurement back produces the same answer. A layout that changed those
    // heights when the bars unstuck would flip between two states for ever.
    for (const height of [300, 400, 480, 568, 700, 900]) {
      const first = barsStick({ width: 320, height }, NARROW);
      const second = barsStick({ width: 320, height }, NARROW);
      expect(second).toBe(first);
    }
  });
});

describe('F3: portrait is framed as portrait, not as a squashed landscape', () => {
  it('turns the logical space upright, and only at portrait', () => {
    expect(framingFor('portrait')).toEqual(SURFACE_FRAMING.portrait);
    for (const name of ['wide', 'medium', 'compact'] as const) {
      expect(framingFor(name)).toEqual(SURFACE_FRAMING.landscape);
    }
  });

  it('gives the two framings genuinely different aspects', () => {
    const landscape = SURFACE_FRAMING.landscape.width / SURFACE_FRAMING.landscape.height;
    const portrait = SURFACE_FRAMING.portrait.width / SURFACE_FRAMING.portrait.height;
    // DESIGN section 4's 1280 x 720, and a portrait framing that is actually
    // taller than it is wide. A scaled-down landscape would report the same
    // number twice, which is the discriminator `portrait.spec.ts` measures on
    // the page.
    expect(landscape).toBeCloseTo(1280 / 720, 10);
    expect(landscape).toBeGreaterThan(1);
    expect(portrait).toBeLessThan(1);
    expect(SURFACE_FRAMING.portrait.height).toBeGreaterThan(SURFACE_FRAMING.portrait.width);
  });

  it('keeps the same short edge in both framings', () => {
    // "A portrait framing of the same logical space": the 720 short edge is the
    // one a hand's cards are laid against as a fraction, so it is the one that
    // does not move.
    expect(SURFACE_FRAMING.portrait.width).toBe(SURFACE_FRAMING.landscape.height);
  });
});

describe('F1 and F6: the surface plan', () => {
  const DPR = 2;

  /** The boxes a shell hands the middle row at the four breakpoints. */
  const BOXES = [
    { width: 1256, height: 560, breakpoint: 'wide' as const },
    { width: 1256, height: 320, breakpoint: 'wide' as const },
    { width: 876, height: 470, breakpoint: 'medium' as const },
    { width: 696, height: 200, breakpoint: 'compact' as const },
    { width: 366, height: 560, breakpoint: 'portrait' as const },
    { width: 366, height: 192, breakpoint: 'portrait' as const },
    // The shape the BJ-14 review measured: a row that had room to grow.
    { width: 980, height: 551, breakpoint: 'wide' as const },
  ];

  it('never asks for more than its box at 100 percent', () => {
    for (const box of BOXES) {
      const plan = planSurface(box, box.breakpoint, 100, DPR);
      expect(plan.sizing.width, `${String(box.width)}x${String(box.height)} width`).toBeLessThanOrEqual(
        box.width,
      );
      expect(
        plan.sizing.height,
        `${String(box.width)}x${String(box.height)} height`,
      ).toBeLessThanOrEqual(box.height);
      // And it fills one of the two axes, or the fit is not a fit.
      const spare = Math.min(box.width - plan.sizing.width, box.height - plan.sizing.height);
      expect(spare, 'the surface fills the axis it is bound by').toBeLessThan(2);
    }
  });

  it('holds the framing aspect at every size and every box', () => {
    for (const box of BOXES) {
      const framing = framingFor(box.breakpoint);
      for (const size of SURFACE_SIZES) {
        const plan = planSurface(box, box.breakpoint, size, DPR);
        const wanted = (plan.sizing.width * framing.height) / framing.width;
        expect(Math.abs(plan.sizing.height - wanted)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('raises the logical-to-CSS scale by exactly the setting', () => {
    for (const box of BOXES) {
      const base = planSurface(box, box.breakpoint, 100, DPR);
      for (const size of SURFACE_SIZES) {
        const plan = planSurface(box, box.breakpoint, size, DPR);
        expect(plan.scale, `${String(size)} percent`).toBeCloseTo(
          base.scale * surfaceSizeFactor(size),
          10,
        );
        // The base scale is the same number at every setting: it is read off the
        // box, which no canvas is inside. A plan that measured the scrolling
        // stage would shrink by a scrollbar the moment the setting was raised.
        expect(plan.baseScale, `${String(size)} percent base`).toBe(base.baseScale);
        // And the CSS box follows the scale rather than being clamped back into
        // the row, which is what would clip a magnified surface.
        const ratio = plan.sizing.width / base.sizing.width;
        expect(Math.abs(ratio - surfaceSizeFactor(size))).toBeLessThan(0.01);
      }
    }
  });

  it('is larger than its box above 100 percent, deliberately', () => {
    const box = { width: 1256, height: 560 };
    const magnified = planSurface(box, 'wide', 200, DPR);
    const base = planSurface(box, 'wide', 100, DPR);
    expect(magnified.sizing.width).toBeGreaterThan(base.sizing.width);
    expect(
      magnified.sizing.width > box.width || magnified.sizing.height > box.height,
      'a doubled surface has to leave the box, or nothing was magnified',
    ).toBe(true);
  });

  it('floors the scale rather than the store when the box is not laid out yet', () => {
    for (const breakpoint of BREAKPOINT_NAMES) {
      const plan = planSurface({ width: 0, height: 0 }, breakpoint, 100, DPR);
      expect(plan.sizing.width, breakpoint).toBe(FALLBACK_SURFACE_WIDTH);
      expect(plan.sizing.height, breakpoint).toBeGreaterThan(0);
      expect(Number.isFinite(plan.scale)).toBe(true);
    }
  });

  it('passes the device pixel ratio through and refuses a useless one', () => {
    const box = { width: 800, height: 450 };
    expect(planSurface(box, 'wide', 100, 2.6273).sizing.dpr).toBe(2.6273);
    expect(planSurface(box, 'wide', 100, 0).sizing.dpr).toBe(1);
    expect(planSurface(box, 'wide', 100, -1).sizing.dpr).toBe(1);
  });

  it('compares two sizings on all three fields', () => {
    const a = { width: 100, height: 50, dpr: 1 };
    expect(sameSizing(a, { ...a })).toBe(true);
    expect(sameSizing(a, { ...a, width: 101 })).toBe(false);
    expect(sameSizing(a, { ...a, height: 51 })).toBe(false);
    expect(sameSizing(a, { ...a, dpr: 2 })).toBe(false);
  });
});

describe('F3: the narrow top bar keeps three readouts and discloses the rest', () => {
  it('splits SPEC 11s fourteen into DESIGN section 4s three and the rest', () => {
    expect([...PRIMARY_READOUT_KEYS]).toEqual(['chips', 'wager', 'hand-value']);
    expect(SECONDARY_READOUT_KEYS.length).toBe(READOUT_KEYS.length - PRIMARY_READOUT_KEYS.length);
    expect(READOUT_KEYS.length).toBe(14);
  });

  it('loses none of the fourteen and duplicates none of them', () => {
    const together = [...PRIMARY_READOUT_KEYS, ...SECONDARY_READOUT_KEYS].sort();
    expect(together).toEqual([...READOUT_KEYS].sort());
    expect(new Set(together).size).toBe(READOUT_KEYS.length);
  });
});

describe('F6: the two declarations of SurfaceSize agree', () => {
  it('lists the same four values in the same order', () => {
    // `src/render/surface.ts` owns the type for the presentation layer and
    // `src/storage/document.ts` owns it for SPEC 13's document. Neither may
    // import the other before `BJ-20` wires the reload flows, so the guarantee
    // that they say the same thing is this test and nothing else.
    expect([...STORED_SURFACE_SIZES]).toEqual([...SURFACE_SIZES]);
    expect(STORED_DEFAULT_SURFACE_SIZE).toBe(DEFAULT_SURFACE_SIZE);
  });

  it('accepts each stored value as a presentation value', () => {
    for (const size of STORED_SURFACE_SIZES) {
      const asPresentation: SurfaceSize = size;
      expect(surfaceSizeFactor(asPresentation)).toBeCloseTo(size / 100, 10);
    }
  });
});
