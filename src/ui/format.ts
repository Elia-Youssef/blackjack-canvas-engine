/**
 * Number formatting for the chrome. QUALITY-BAR section 11, item `M2`.
 *
 * Every number a player reads goes through `Intl.NumberFormat` constructed with
 * an **explicit locale list**, because `Intl` with no locale argument reads the
 * host default locale, which has no relationship to the document's `lang`
 * attribute. The list is `[...(navigator.languages ?? []), 'en-US']` exactly as
 * QUALITY-BAR section 11 writes it, and `resolvedLocale` is what the composition
 * root writes back to `lang` so the document says what it is actually rendering.
 *
 * **This file is the only place in `src/` that names `Intl`**, and
 * `tests/unit/locale.test.ts` asserts that with a scanner that can see. It is
 * also the only place a number becomes text **in the chrome**: nothing under
 * `src/` calls `toLocaleString`, `toFixed` or their relatives at all, and no
 * line that writes DOM text spells a number with `String(`. One home for the
 * rule means a locale the game formats badly is one function away from being
 * fixed everywhere.
 *
 * **The play surface is the stated exception, and it is exactly two sites.**
 * `src/render/felt.ts` prints the table's limits on the felt and
 * `src/render/chips.ts` prints a chip's denomination on the chip, both as plain
 * digits. SPEC 16 makes both artwork: the felt's line is "a decorative repeat"
 * of numbers whose authoritative copy is this file's output in the DOM, and the
 * value glyph is a chip's identity, the carve-out QUALITY-BAR section 4 already
 * makes for a card's rank. Item `M2`'s review adjudicated the pair as a park
 * rather than a defect, and `tests/unit/locale.test.ts` pins the exemption to
 * those two sites by path so that a third drawn quantity fails the suite.
 *
 * **`createFormatters` exists so the sweep can be a sweep.** Item `M2` requires
 * the formatters to behave under `en-US`, `de-DE` and `ar-EG`, and a module that
 * built its three `Intl.NumberFormat`s from the host's languages and nothing
 * else could only ever be tested against the runner's own settings. The factory
 * takes the list; the module-level set below is the same factory called once
 * with the platform's answer, so the shipped path and the swept path are one
 * piece of code with one argument between them.
 *
 * The formatters are built once per list. Constructing an `Intl.NumberFormat`
 * per frame is the classic way to spend a millisecond a frame on a string that
 * did not change, and the chrome syncs on every frame by design.
 */

/** The platform's preferred languages, or `null` where there is no platform. */
function platformLanguages(): readonly string[] | null {
  return typeof navigator === 'undefined' ? null : navigator.languages;
}

/**
 * QUALITY-BAR section 11's list, in its order, with the fallback last.
 *
 * The argument is the platform's answer and defaults to it. It is a parameter
 * rather than a read so that the list rule itself can be driven with a known
 * platform, which is the only way to assert "the fallback is last" against a
 * runner whose own answer already ends in `en-US`.
 *
 * `null` rather than `undefined` for "there is no platform to ask", because a
 * default parameter is applied to an explicit `undefined` as well as to an
 * absent argument: a caller passing `undefined` to mean "nothing" would be
 * handed the platform's own answer instead, and the one case that most needs
 * asserting would be the one case that could not be.
 */
export function localeList(
  preferred: readonly string[] | null = platformLanguages(),
): readonly string[] {
  return [...(preferred ?? []), 'en-US'];
}

/** The four formatters the chrome reads numbers through, for one locale list. */
export interface Formatters {
  /** The locale `Intl` resolved, for the document's `lang` attribute. */
  resolvedLocale(): string;
  /** A count or a balance. */
  chips(value: number): string;
  /** A chip delta on a hand or a round. Zero formats without a sign. */
  delta(value: number): string;
  /** A fraction in 0 to 1, as a percentage. */
  percent(fraction: number): string;
  /** A percentage already expressed in 0 to 100, as the coach's accuracy is. */
  percentOfHundred(value: number): string;
}

/** What a percentage already out of a hundred has to be divided by. */
const PERCENT_SCALE = 100;

/**
 * Build the set for one explicit locale list.
 *
 * Every quantity in this game is an integer number of chips (SPEC 4.11: there
 * is no rounding rule, because no case requires one), so a fraction reaching
 * `chips` would be a defect upstream and is not formatted away.
 */
export function createFormatters(locales: readonly string[]): Formatters {
  const whole = new Intl.NumberFormat(locales, { maximumFractionDigits: 0 });
  const signed = new Intl.NumberFormat(locales, {
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  });
  const share = new Intl.NumberFormat(locales, {
    style: 'percent',
    maximumFractionDigits: 0,
  });
  return {
    resolvedLocale: () => whole.resolvedOptions().locale,
    chips: (value: number) => whole.format(value),
    delta: (value: number) => signed.format(value),
    percent: (fraction: number) => share.format(fraction),
    /**
     * `strategy.accuracy` returns a percentage rather than a fraction, and
     * dividing at every call site is how one of them ends up showing 0.9
     * percent. One conversion, here.
     */
    percentOfHundred: (value: number) => share.format(value / PERCENT_SCALE),
  };
}

/** The set the chrome uses, built once from the platform's own list. */
const PLATFORM = createFormatters(localeList());

/** The locale `Intl` actually resolved, for the document's `lang` attribute. */
export function resolvedLocale(): string {
  return PLATFORM.resolvedLocale();
}

/** A count or a balance. */
export function chips(value: number): string {
  return PLATFORM.chips(value);
}

/** A chip delta on a hand or a round. Zero formats without a sign. */
export function delta(value: number): string {
  return PLATFORM.delta(value);
}

/** A fraction in 0 to 1, as a percentage. */
export function percent(fraction: number): string {
  return PLATFORM.percent(fraction);
}

/** A percentage already expressed in 0 to 100, as the coach's accuracy is. */
export function percentOfHundred(value: number): string {
  return PLATFORM.percentOfHundred(value);
}

/** The one placeholder for a readout with nothing to show yet. */
export const NOTHING_YET = '-';
