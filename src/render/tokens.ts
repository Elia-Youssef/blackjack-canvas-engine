/**
 * Renderer-side token record. Item E1.
 *
 * A canvas 2D context takes a colour string, not a `var()`, so the play surface
 * cannot read `src/ui/tokens.css` the way the chrome does. This file is the same
 * tokens in the form the renderer can use, and it is the only place the play
 * surface may take a value from. No literal colour, radius, width or duration
 * belongs anywhere under `src/render/` after this part.
 *
 * **Not a second source of truth.** `tests/reference/design-contract.md` is the
 * independent source for every colour and number here.
 * `tests/unit/tokens.test.ts` parses the contract, this file and the stylesheet, and
 * fails if any two of the three disagree. Editing a hex here to make something
 * look better is a test failure, not a silent regression in G2 and E4.
 *
 * It lives under `render/` on purpose. The BJ-0 lint boundary already forbids
 * `core/` from importing anything under `render/`, so putting the palette here
 * means the rules and the simulation cannot reach a presentation value at all,
 * without needing a second rule to say so.
 */

/** A colour, as a canvas context will accept it. */
export type Hex = `#${string}`;

/**
 * The play surface palette. **This set does not flip with the theme.** SPEC 16:
 * a casino table is dark in a lit room and dark in a dark one, and a pale felt
 * would mean a second set of measured ratios earning nothing.
 *
 * Where a fill cannot clear 3:1 against what sits behind it, the boundary
 * carries the contrast and the fill carries only identity. None of the three
 * felts clears 3:1 against the dark ground alone: bronze is 1.97:1, silver
 * 1.65:1, gold 1.26:1. That is why `rail`, `cardMargin` and `chipRing` are
 * tokens in their own right and not decoration.
 */
export const SURFACE = {
  feltBronze: '#14503a',
  feltSilver: '#133f55',
  feltGold: '#4a1526',

  /** 8.02:1 on the dark ground. Load-bearing, not trim. */
  rail: '#c2a86a',
  /** 8.68:1 on bronze, the darkest of the three felts. */
  print: '#f3f7f4',

  /** 8.47 / 10.13 / 13.28:1 on bronze / silver / gold. */
  cardMargin: '#f6f3ec',
  cardFace: '#f6f3ec',
  /** 9.03:1 against its own card margin. */
  cardBack: '#7a2230',
  /** 15.71:1 on the card face. */
  rankBlack: '#1a1a1a',
  /** 6.28:1 on the card face. */
  rankRed: '#b3121b',
} as const satisfies Record<string, Hex>;

/**
 * The shape of a play-surface palette: `SURFACE`'s keys, each holding a colour.
 *
 * Mapped rather than `typeof SURFACE`, and the difference is load bearing.
 * `SURFACE` is `as const`, so its type carries the eleven hexes themselves, and
 * a second set of the same shape with different colours in it would not be
 * assignable to it: the type would say a high-contrast palette must be the
 * palette it is replacing. Widening each value to `Hex` keeps the keys, which is
 * the part a renderer depends on, and lets a real alternative exist.
 */
export type SurfaceTokens = { readonly [K in keyof typeof SURFACE]: Hex };

/**
 * The high-contrast play-surface set, or `null` while none is specified.
 *
 * **It is `null`, and that is a finding rather than a placeholder.**
 * QUALITY-BAR section 5 says "Canvas pixels are unaffected by forced colors, so
 * a high-contrast play-surface palette is selected via the media query and
 * applied to the renderer's tokens", and item `G9` grades that sentence. But
 * **SPEC 16 defines no such palette**: it carries one play-surface table, of
 * eleven tokens, each with a measured ratio, and section 16 is the source of
 * truth for every colour in this game. `tests/unit/tokens.test.ts` enforces
 * that: it reads the contract, this file and the stylesheet and fails if any
 * two disagree, which is what stops a colour from being invented, adjusted or
 * improved here.
 *
 * So the selection is built and the values are parked. `surfacePalette` below
 * selects on the flag, reports which set it selected and why, and falls back to
 * the specified set when the high-contrast one does not exist. The composition
 * root resolves the media query once per frame, calls this, and publishes the
 * answer on its accessibility probe.
 *
 * **What is deliberately not built, so the park's owner sees the whole cost.**
 * The selected record reaches the probe and stops there: nothing draws from it.
 * Every module under `render/` still imports `SURFACE` directly, so closing this
 * park is two pieces of work rather than one line. First, SPEC 16 gains a
 * forced-colors play-surface table, eleven tokens with measured ratios, which is
 * the sheet's to write and not this file's to invent. Second, the selected
 * record has to be threaded into the four modules that spend those colours:
 * `card.ts`, `chips.ts`, `felt.ts` and `surface.ts`, each of which takes the
 * palette from the import today. `BJ-18`'s report carries the park with a
 * sketched resolution and this list.
 */
export const HIGH_CONTRAST_SURFACE: SurfaceTokens | null = null;

/** Which set was selected, and why. */
export type PaletteName = 'standard' | 'high-contrast' | 'standard-fallback';

/** The answer `surfacePalette` gives, for the frame that asked. */
export interface SelectedPalette {
  readonly name: PaletteName;
  /**
   * Why that set. `preference` is the flag being honoured either way;
   * `unspecified-high-contrast-set` is the park above, reported rather than
   * hidden, so a probe reading this can tell a working fallback from a
   * forced-colors flag that never arrived.
   */
  readonly reason: 'preference' | 'unspecified-high-contrast-set';
  readonly surface: SurfaceTokens;
}

/**
 * Which play-surface set a frame should draw from, given the platform's flag.
 *
 * The high-contrast set is a parameter with a default rather than a closed-over
 * constant, so that the selection can be exercised in both directions by a unit
 * test that supplies a stand-in set: the logic that will run the day SPEC 16
 * defines the palette is the logic under test today, rather than a branch
 * nothing has ever taken.
 */
export function surfacePalette(
  forcedColors: boolean,
  highContrast: SurfaceTokens | null = HIGH_CONTRAST_SURFACE,
): SelectedPalette {
  if (!forcedColors) {
    return { name: 'standard', reason: 'preference', surface: SURFACE };
  }
  if (highContrast === null) {
    return { name: 'standard-fallback', reason: 'unspecified-high-contrast-set', surface: SURFACE };
  }
  return { name: 'high-contrast', reason: 'preference', surface: highContrast };
}

/** The felt colour of each table. SPEC 16: each table has its own. */
export const FELT = {
  bronze: SURFACE.feltBronze,
  silver: SURFACE.feltSilver,
  gold: SURFACE.feltGold,
} as const satisfies Record<string, Hex>;

export type FeltName = keyof typeof FELT;

/**
 * Chip denominations. 10 / 50 / 100 / 500, and no others: every wager in the
 * game is a multiple of 10, which is what makes the 3:2 natural, the insurance
 * stake, the 2:1 payout and the surrender return exact integers.
 *
 * The ring clears 4.56:1 at worst against its own fill and 8.01:1 at worst
 * against a felt, so the chip is separable from the table and from the next
 * chip. The glyph is white on every fill, 5.33:1 at worst.
 */
export const CHIP_RING: Hex = '#f0ede4';
export const CHIP_GLYPH: Hex = '#ffffff';

export const CHIP_FILL = {
  10: '#2e6da4',
  50: '#1f7a49',
  100: '#23272b',
  500: '#6b4fa8',
} as const satisfies Record<number, Hex>;

export type ChipDenomination = keyof typeof CHIP_FILL;

/** The denominations in ascending order, for anything that lays out a rack. */
export const CHIP_DENOMINATIONS = [10, 50, 100, 500] as const;

/**
 * The numeric scales from QUALITY-BAR section 15, in the units a canvas works
 * in: logical CSS pixels and milliseconds. Device pixel ratio is not applied
 * here and is not applied anywhere except the backing store.
 */
export const SPACE = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const satisfies Record<number, number>;

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 14,
  pill: 999,
} as const satisfies Record<string, number>;

export const BORDER = {
  hair: 1,
  thin: 2,
  thick: 3,
} as const satisfies Record<string, number>;

/**
 * Chrome durations, in milliseconds. Under reduced motion every one of these
 * resolves to `d0`, exactly as the stylesheet does it, and the caller reads the
 * flag: this record does not query the platform, because nothing under
 * `render/` should be deciding policy.
 *
 * Gameplay pacing constants are simulation timing rather than presentation.
 * They live in SPEC.md, they are not tokens, and reduced motion does not zero
 * them, because removing them would change the sequence of states.
 */
export const DURATION = {
  d0: 0,
  d1: 80,
  d2: 140,
  d3: 220,
  d4: 320,
} as const satisfies Record<string, number>;

export type DurationName = keyof typeof DURATION;

/**
 * The two easings, as their cubic-bezier control points. The renderer needs a
 * function and CSS needs a curve; committing the control points rather than a
 * hand-rolled approximation is what keeps a canvas tween and a CSS transition
 * on the same curve.
 */
export const EASE = {
  out: [0.2, 0, 0, 1],
  inOut: [0.4, 0, 0.2, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type EaseName = keyof typeof EASE;

/**
 * The duration a caller should use, given the reduced-motion flag.
 *
 * The one behaviour in this file, and it is the token lookup itself rather than
 * a policy: QUALITY-BAR section 15 defines `--dur-0` as "the reduced-motion
 * value of every token below", so resolving a duration means knowing the flag.
 * The flag is read outside `core/` and passed in; nothing here queries it.
 */
export function duration(name: DurationName, reducedMotion: boolean): number {
  return reducedMotion ? DURATION.d0 : DURATION[name];
}
