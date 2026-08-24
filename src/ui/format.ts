/**
 * Number formatting for the chrome. QUALITY-BAR section 11.
 *
 * Every number a player reads goes through `Intl.NumberFormat` constructed with
 * an **explicit locale list**, because `Intl` with no locale argument reads the
 * host default locale, which has no relationship to the document's `lang`
 * attribute. The list is `[...(navigator.languages ?? []), 'en-US']` exactly as
 * QUALITY-BAR section 11 writes it, and `resolvedLocale` is what the composition
 * root writes back to `lang` so the document says what it is actually rendering.
 *
 * **No acceptance item is claimed here.** The locale sweep across en-US, de-DE
 * and ar-EG is items `L1` to `L5` at `BJ-21`; what this file does is make sure
 * that sweep has something correct to measure rather than a migration to do
 * first. The chrome is written against these three functions from its first
 * line, which is the only moment that costs nothing.
 *
 * The formatters are built once. Constructing an `Intl.NumberFormat` per frame
 * is the classic way to spend a millisecond a frame on a string that did not
 * change, and the chrome syncs on every frame by design.
 */

/** QUALITY-BAR section 11's list, in its order, with the fallback last. */
export function localeList(): readonly string[] {
  const preferred = typeof navigator === 'undefined' ? undefined : navigator.languages;
  return [...(preferred ?? []), 'en-US'];
}

const LOCALES = localeList();

/**
 * Whole chips, grouped. Every quantity in this game is an integer number of
 * chips (SPEC 4.11: there is no rounding rule, because no case requires one),
 * so a fraction here would be a defect upstream and is not formatted away.
 */
const CHIPS = new Intl.NumberFormat(LOCALES, { maximumFractionDigits: 0 });

/** A chip delta, always carrying its sign except at zero. */
const DELTA = new Intl.NumberFormat(LOCALES, {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

/** A fraction as a whole percentage. Shoe penetration and coach accuracy. */
const PERCENT = new Intl.NumberFormat(LOCALES, {
  style: 'percent',
  maximumFractionDigits: 0,
});

/** The locale `Intl` actually resolved, for the document's `lang` attribute. */
export function resolvedLocale(): string {
  return CHIPS.resolvedOptions().locale;
}

/** A count or a balance. */
export function chips(value: number): string {
  return CHIPS.format(value);
}

/** A chip delta on a hand or a round. Zero formats without a sign. */
export function delta(value: number): string {
  return DELTA.format(value);
}

/** A fraction in 0 to 1, as a percentage. */
export function percent(fraction: number): string {
  return PERCENT.format(fraction);
}

/**
 * A percentage already expressed in 0 to 100, as the coach's accuracy is.
 *
 * `strategy.accuracy` returns a percentage rather than a fraction, and dividing
 * at every call site is how one of them ends up showing 0.9 percent. One
 * conversion, here.
 */
export function percentOfHundred(value: number): string {
  return percent(value / 100);
}

/** The one placeholder for a readout with nothing to show yet. */
export const NOTHING_YET = '-';
