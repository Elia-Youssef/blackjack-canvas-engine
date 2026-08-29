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
 * `SURFACE` is `as const`, so its type carries the ten hexes themselves, and
 * a second set of the same shape with different colours in it would not be
 * assignable to it: the type would say a high-contrast palette must be the
 * palette it is replacing. Widening each value to `Hex` keeps the keys, which is
 * the part a renderer depends on, and lets a real alternative exist.
 */
export type SurfaceTokens = { readonly [K in keyof typeof SURFACE]: Hex };

/**
 * The high-contrast play-surface set. SPEC 16, "High-contrast play surface
 * (forced colors)". Item `G9`'s third clause, closed at `BJ-22`.
 *
 * **This was `null` from `BJ-18` until `BJ-22`, and the park is now spent.**
 * QUALITY-BAR section 5 says "Canvas pixels are unaffected by forced colors, so
 * a high-contrast play-surface palette is selected via the media query and
 * applied to the renderer's tokens". `BJ-18` built the selection and left the
 * values `null`, because SPEC 16 defined no such set and section 16 is the
 * source of truth for every colour in this game: inventing one here would have
 * been a colour nobody measured. SPEC 16 gained the table at `BJ-22` under the
 * user's pre-approved carve-out, and these ten hexes are that table, transcribed
 * and nothing more. `tests/unit/tokens.test.ts` reads the contract and this file
 * and fails if the two disagree, and re-derives every ratio the table quotes
 * from the hexes themselves.
 *
 * The eleventh token of the table is `--chip-ring`, which lives beside the base
 * `CHIP_RING` below for the reason that one does: a ring is not a surface.
 */
export const HIGH_CONTRAST_SURFACE = {
  feltBronze: '#0b2c1f',
  feltSilver: '#0b2434',
  feltGold: '#2a0c16',

  /** 12.93:1 on the dark ground, 10.53:1 on the darkest felt. */
  rail: '#ffd34d',
  /** 15.06:1 on bronze, the darkest of the three felts. */
  print: '#ffffff',

  /** 15.06 / 15.96 / 18.06:1 on bronze / silver / gold. */
  cardMargin: '#ffffff',
  cardFace: '#ffffff',
  /** 15.63:1 against its own card margin. */
  cardBack: '#4a0a12',
  /** 21.00:1 on the card face. */
  rankBlack: '#000000',
  /** 9.67:1 on the card face. */
  rankRed: '#8f0009',
} as const satisfies SurfaceTokens;

/** Which set was selected. The platform's flag is the only input. */
export type PaletteName = 'standard' | 'high-contrast';

/**
 * One complete play-surface set: the ten surface tokens, the chip ring that
 * belongs with them, and how the felt is painted under them.
 *
 * `flatFelt` is a property of the **set**, not a second setting. SPEC 16's
 * forced-colors subsection states it in as many words: the gradient and the
 * grain are suppressed under that set, "because subtle texture is what high
 * contrast exists to remove". Carrying it here rather than as a flag beside the
 * palette is what stops a caller from selecting the high-contrast colours and
 * painting them through the textured path.
 */
export interface PlaySurfaceSet {
  readonly surface: SurfaceTokens;
  readonly chipRing: Hex;
  readonly flatFelt: boolean;
}

/** The answer `surfacePalette` gives, for the frame that asked. */
export interface SelectedPalette extends PlaySurfaceSet {
  readonly name: PaletteName;
}

/**
 * The felt colour of each table. SPEC 16: each table has its own.
 *
 * **Nothing under `src/` reads this map's values any more, and it stays for two
 * reasons that are not habit.** `FeltName` below is `keyof typeof FELT`, so the
 * union every module names is derived from this record rather than written
 * twice; and it is the base set's map, which is what `tokens.test.ts` pins
 * against SPEC 16 colour by colour, what `render-felt.test.ts` compares a bake's
 * ground against, and what `render-surface.spec.ts` samples rendered pixels for.
 * Since `BJ-22` threaded the selected palette through the renderer, the drawing
 * path asks `feltColour` for whichever set the frame chose; this is still the
 * set the tests are entitled to name, because a test that read the colour back
 * out of the code it is checking would agree with it forever.
 */
export const FELT = {
  bronze: SURFACE.feltBronze,
  silver: SURFACE.feltSilver,
  gold: SURFACE.feltGold,
} as const satisfies Record<string, Hex>;

export type FeltName = keyof typeof FELT;

/**
 * One table's felt colour out of an arbitrary set.
 *
 * `FELT` above is the base set's map and is what the chrome and the tests name;
 * this is the same lookup for whichever set a frame selected, so the renderer
 * has one way to ask and there is no second place a felt name is resolved.
 */
export function feltColour(surface: SurfaceTokens, name: FeltName): Hex {
  if (name === 'silver') {
    return surface.feltSilver;
  }
  if (name === 'gold') {
    return surface.feltGold;
  }
  return surface.feltBronze;
}

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

/**
 * The chip ring of the high-contrast set. SPEC 16's eleventh forced-colors row.
 *
 * White, which measures 15.06 / 15.96 / 18.06:1 against the three high-contrast
 * felts and 5.47 / 5.33 / 15.04 / 6.35:1 against the four chip fills, each at or
 * above its base-set counterpart. The fills themselves are unchanged: they carry
 * identity only, and identity is the one thing a high-contrast set must not
 * flatten. `CHIP_GLYPH` is already white and is the same in both sets.
 */
export const HIGH_CONTRAST_CHIP_RING: Hex = '#ffffff';

export const CHIP_FILL = {
  10: '#2e6da4',
  50: '#1f7a49',
  100: '#23272b',
  500: '#6b4fa8',
} as const satisfies Record<number, Hex>;

export type ChipDenomination = keyof typeof CHIP_FILL;

/** The denominations in ascending order, for anything that lays out a rack. */
export const CHIP_DENOMINATIONS = [10, 50, 100, 500] as const;

/** SPEC 16's play-surface set: the felt is a gradient with grain and a rail. */
export const STANDARD_PALETTE: SelectedPalette = Object.freeze({
  name: 'standard',
  surface: SURFACE,
  chipRing: CHIP_RING,
  flatFelt: false,
});

/** SPEC 16's forced-colors set: the same eleven names, and a flat felt. */
export const HIGH_CONTRAST_PALETTE: SelectedPalette = Object.freeze({
  name: 'high-contrast',
  surface: HIGH_CONTRAST_SURFACE,
  chipRing: HIGH_CONTRAST_CHIP_RING,
  flatFelt: true,
});

/**
 * Which play-surface set a frame should draw from, given the platform's flag.
 *
 * **Two frozen constants and no construction, which is load bearing rather than
 * tidy.** `src/render/scene.ts` decides whether the baked felt is still valid by
 * comparing the spec it was baked from against the one this frame wants, and the
 * palette is part of that spec. A function that built a fresh record per frame
 * would make every comparison a miss and rebake the whole felt, its grain and
 * its four printed lines sixty times a second, which QUALITY-BAR section 1
 * forbids in as many words. Returning the same object for the same answer makes
 * the comparison an identity test that is right by construction.
 */
export function surfacePalette(forcedColors: boolean): SelectedPalette {
  return forcedColors ? HIGH_CONTRAST_PALETTE : STANDARD_PALETTE;
}

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
