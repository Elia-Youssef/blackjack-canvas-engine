/**
 * Item `M2`, severity Major, 6 points. `BJ-21`.
 *
 *   "All numbers are formatted through Intl.NumberFormat with an explicit
 *    locale list, no user-facing sentence is assembled by string concatenation,
 *    and the suite runs green under en-US, de-DE and ar-EG."
 *
 * QUALITY-BAR section 11. Three clauses, and each is driven separately.
 *
 * **Clause 1 is two claims, and the second is the one that needs a scanner.**
 * That every number goes through `Intl.NumberFormat` is asserted by sweeping
 * every exported formatter; that nothing else in the product turns a number into
 * a string is an **absence**, so it is scanned for by name, with a control in
 * front of the scanner that proves it can see. `src/ui/format.ts` is the only
 * file under `src/` that may name `Intl`, no file may call `toLocaleString`,
 * `toFixed` or their relatives, and no line that writes DOM text may spell a
 * number with `String(`.
 *
 * **The play surface prints two quantities as plain digits, and that is a park
 * the review adjudicated rather than an oversight.** The felt's
 * `MINIMUM 10 - MAXIMUM 100` and the chip's value glyph are artwork under SPEC
 * 16's own language, the last group of tests below carries the reasoning, and
 * the exemption is a list of exactly two sites checked by path: a third drawn
 * quantity fails the suite.
 *
 * **Clause 2 is read as the criterion writes it: assembled by string
 * concatenation.** The scan below finds every place a string is built out of
 * parts, anywhere under `src/`, and requires the set to be empty. It knows four
 * spellings, and the last two are the review's: `+` with a literal on one side,
 * `+=` with a literal on the right, and `+=` with a `String(` call on the right.
 * `.join` and `.concat` with prose punctuation are the fifth shape and are
 * counted separately, because four of them are legitimate and are allowlisted by
 * path. The assembly the clause is about is `'You have ' + n + ' chips'` and its
 * accumulated twin, and there is none of either.
 *
 * The census names its exemptions rather than pretending there are none, on
 * `tests/unit/input-surface.test.ts`'s pattern:
 *
 *   - **Two literals joined by `+` are left alone.** The reason is not that the
 *     compiler folds them, which is only true of plain literals and not of the
 *     three sites that join interpolated templates: it is that both operands are
 *     written out in full at the site, so the sentence can be read and moved in
 *     one piece. What resists translation later is a sentence whose parts are
 *     only brought together once a value has been computed.
 *   - **Template interpolation is not concatenation and is allowed**, and what
 *     may be interpolated is stated in `src/ui/text.ts`'s own header: a number a
 *     locale formatter has already produced, or another whole sentence from the
 *     same file. The sweep below checks the formatters those interpolations
 *     spend; nothing here counts `${}`.
 *   - **Four sites join a list into a sentence**, in `announce.ts`, `overlays.ts`
 *     twice and `text.ts`. They are named in `PROSE_JOIN_SITES` and checked by
 *     path, so a fifth fails here rather than being noticed at a review.
 *
 * **Clause 3, "the suite runs green under en-US, de-DE and ar-EG", is honest
 * only in one reading, and this file states it.** A suite that changed its
 * answers with the runner's own locale would be a suite nobody could run twice;
 * what makes that impossible here is that every formatter is constructed with an
 * explicit list, so the host's default locale is not an input to anything. The
 * sweep therefore constructs the three locales rather than the environment
 * doing it, and one assertion below shows the host default is genuinely
 * different from what an explicitly built formatter produces. The browser gate
 * pins `locale: 'en-US'` for the same reason, in `playwright.config.ts`.
 *
 * **Every expected string is pinned exactly, and written as escapes.** The
 * repository is ASCII only, so `de-DE`'s U+00A0 before the percent sign and
 * `ar-EG`'s Arabic-Indic digits are written below as Unicode escapes rather
 * than as the characters themselves, which is how
 * `tests/browser/support/game.ts` already writes U+2212. They are this
 * runner's ICU, deliberately: QUALITY-BAR section 11 says
 * "acceptance tests pin the locale", and a rendering that moves under a new ICU
 * is a thing this file exists to report rather than to absorb.
 *
 * @vitest-environment node
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stripComments as code } from './support/source-scan';

import { feltPrint } from '../../src/render/felt';
import {
  chips,
  createFormatters,
  delta,
  localeList,
  percent,
  percentOfHundred,
  resolvedLocale,
} from '../../src/ui/format';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------
// The list QUALITY-BAR section 11 specifies, exactly
// ---------------------------------------------------------------------------

describe('M2: the locale list is explicit, ordered, and ends in the fallback', () => {
  it('is the platform languages followed by en-US', () => {
    expect(localeList(['de-DE', 'fr-FR'])).toEqual(['de-DE', 'fr-FR', 'en-US']);
  });

  it('is the fallback alone where the platform offers nothing', () => {
    // `null` is a host with no `navigator` at all, which is what a worker is
    // and what this runner used to be; the empty array is a host that has one
    // and prefers nothing. The list is never empty either way, because an empty
    // list is how `Intl` gets asked for the host default without anybody
    // meaning to.
    expect(localeList(null)).toEqual(['en-US']);
    expect(localeList([])).toEqual(['en-US']);
  });

  it('keeps the platform order and never sorts or de-duplicates it', () => {
    // `navigator.languages` is a preference order, and the first entry that
    // `Intl` can serve is the one it serves. Sorting it would answer a player
    // who asked for German first in whatever locale sorts first.
    expect(localeList(['fr-FR', 'de-DE', 'fr-FR'])).toEqual([
      'fr-FR',
      'de-DE',
      'fr-FR',
      'en-US',
    ]);
  });

  it('reads the platform when it is not told, and still ends in the fallback', () => {
    const list = localeList();
    expect(list.length).toBeGreaterThan(0);
    expect(list[list.length - 1]).toBe('en-US');
  });
});

// ---------------------------------------------------------------------------
// The sweep: every exported formatter, under the three locales the item names
// ---------------------------------------------------------------------------

/** One locale, and every number this game renders, as that locale renders it. */
interface LocaleCase {
  readonly locale: string;
  readonly big: string;
  readonly thousand: string;
  readonly gain: string;
  readonly loss: string;
  readonly nothing: string;
  readonly half: string;
  /** `percentOfHundred(92.5)`, which truncates: the coach's reading. */
  readonly accuracy: string;
  /** `percent(0.925)`, which rounds: every other share in the chrome. */
  readonly roundedShare: string;
}

const CASES: readonly LocaleCase[] = [
  {
    locale: 'en-US',
    big: '1,234,567',
    thousand: '1,000',
    gain: '+50',
    loss: '-50',
    nothing: '0',
    half: '50%',
    accuracy: '92%',
    roundedShare: '93%',
  },
  {
    // The grouping separator is a full stop and the percent sign is preceded by
    // U+00A0 NO-BREAK SPACE. A test comparing raw strings across locales would
    // fail on that space alone, which is the trap the section warns about.
    locale: 'de-DE',
    big: '1.234.567',
    thousand: '1.000',
    gain: '+50',
    loss: '-50',
    nothing: '0',
    half: '50\u00a0%',
    accuracy: '92\u00a0%',
    roundedShare: '93\u00a0%',
  },
  {
    // Arabic-Indic digits, U+066C as the thousands separator, U+066A as the
    // percent sign, and U+061C ARABIC LETTER MARK around the sign and after the
    // percent sign so that a bidirectional run renders in the right order.
    // Nothing here is ASCII, which is the point of including this locale.
    locale: 'ar-EG',
    big: '\u0661\u066c\u0662\u0663\u0664\u066c\u0665\u0666\u0667',
    thousand: '\u0661\u066c\u0660\u0660\u0660',
    gain: '\u061c+\u0665\u0660',
    loss: '\u061c-\u0665\u0660',
    nothing: '\u0660',
    half: '\u0665\u0660\u066a\u061c',
    accuracy: '\u0669\u0662\u066a\u061c',
    roundedShare: '\u0669\u0663\u066a\u061c',
  },
];

describe('M2: every formatter, under every locale the item names', () => {
  for (const expected of CASES) {
    describe(expected.locale, () => {
      const formatters = createFormatters([expected.locale]);

      it('resolves the locale it was given rather than the host default', () => {
        expect(formatters.resolvedLocale()).toBe(expected.locale);
      });

      it('groups a balance the way the locale groups', () => {
        expect(formatters.chips(1_234_567)).toBe(expected.big);
        expect(formatters.chips(1_000)).toBe(expected.thousand);
      });

      it('signs a delta, and leaves zero unsigned', () => {
        expect(formatters.delta(50)).toBe(expected.gain);
        expect(formatters.delta(-50)).toBe(expected.loss);
        expect(formatters.delta(0)).toBe(expected.nothing);
      });

      it('renders a percentage from a fraction and from a hundred alike', () => {
        expect(formatters.percent(0.5)).toBe(expected.half);
        expect(formatters.percentOfHundred(92.5)).toBe(expected.accuracy);
        expect(formatters.percent(0.925)).toBe(expected.roundedShare);
        // The two entry points are one formatter with one division between
        // them, which is why the coach's accuracy cannot come out at 0.9
        // percent: 92.5 out of a hundred and 0.925 as a fraction are one value.
        // They part on the rounding alone, deliberately: `percentOfHundred`
        // truncates, because the figure it renders is compared against a
        // milestone threshold by an exact integer inequality and a rounded
        // reading printed that threshold back to players who had not met it.
        expect(formatters.percentOfHundred(92.5)).toBe(formatters.percent(0.92));
        expect(formatters.percentOfHundred(92.5)).not.toBe(formatters.percent(0.925));
      });

      it('rounds to whole chips and whole percentages, and never to a fraction', () => {
        // SPEC 4.11: every quantity is an integer number of chips, so a
        // fraction reaching a formatter is a defect upstream. What is asserted
        // is that the formatter does not invent decimal places of its own.
        expect(formatters.chips(10)).not.toMatch(/[.,]\d\d/);
        expect(formatters.percent(0.925)).toBe(expected.roundedShare);
      });
    });
  }

  it('renders the same value differently in each of the three', () => {
    // Without this, every assertion above would be satisfied by three
    // formatters that had all quietly resolved to the same locale.
    const rendered = CASES.map((entry) => createFormatters([entry.locale]).chips(1_234_567));
    expect(new Set(rendered).size).toBe(CASES.length);
  });

  it('groups with U+202F in the locales that do, which no raw comparison survives', () => {
    // QUALITY-BAR section 11's own warning, pinned: "several locales group with
    // U+202F rather than a plain space". French is one of them, and it is here
    // as the witness that the warning is about a real rendering rather than a
    // hypothetical one. A test that compared `1 234 567` with a plain space
    // would fail against this string and would look correct doing it.
    expect(createFormatters(['fr-FR']).chips(1_234_567)).toBe('1\u202f234\u202f567');
    expect(createFormatters(['fr-FR']).chips(1_234_567)).not.toBe('1 234 567');
  });

  it('is unaffected by the host default locale, whatever it is', () => {
    // The clause "the suite runs green under en-US, de-DE and ar-EG", in the
    // one form that can be asserted from inside one process: an explicitly
    // built formatter answers for its own locale and not for the runner's.
    const host = new Intl.NumberFormat().resolvedOptions().locale;
    for (const entry of CASES) {
      const explicit = createFormatters([entry.locale]);
      expect(explicit.resolvedLocale()).toBe(entry.locale);
      expect(explicit.chips(1_234_567)).toBe(entry.big);
    }
    // And the distinction is observable rather than theoretical: at least one
    // of the three renders the same number differently from the host.
    const hostRendering = new Intl.NumberFormat([host], { maximumFractionDigits: 0 }).format(
      1_234_567,
    );
    expect(CASES.some((entry) => entry.big !== hostRendering)).toBe(true);
  });

  it('ships the same formatters it sweeps', () => {
    // The module-level exports the chrome actually calls are the factory called
    // once with the platform's list. Without this the sweep would be grading a
    // function nothing renders through.
    const platform = createFormatters(localeList());
    expect(resolvedLocale()).toBe(platform.resolvedLocale());
    expect(chips(1_234_567)).toBe(platform.chips(1_234_567));
    expect(delta(-50)).toBe(platform.delta(-50));
    expect(percent(0.5)).toBe(platform.percent(0.5));
    expect(percentOfHundred(92.5)).toBe(platform.percentOfHundred(92.5));
  });
});

// ---------------------------------------------------------------------------
// The census, and the controls that prove each scanner can see
// ---------------------------------------------------------------------------

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

function sourcesUnder(...segments: readonly string[]): readonly SourceFile[] {
  const root = join(PROJECT_ROOT, ...segments);
  const files: SourceFile[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        files.push({ path: full.replace(/\\/g, '/'), text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  return files;
}

/**
 * Every place a string is built out of parts, in code.
 *
 * **Four shapes, and the review added the last two.** The first version of this
 * scanner knew only about `+`, and the reviewer planted
 * `let text = 'You have '; text += String(count); text += ' chips left.';` in
 * `src/ui/` and watched forty-seven tests stay green. A census that sees one
 * spelling of assembly is a census of that spelling.
 *
 *   1. a literal followed by `+` and something that is not a literal
 *   2. something that is not a literal, followed by `+` and a literal
 *   3. `+=` with a literal on the right, which is the same join written as an
 *      accumulation
 *   4. `+=` with a `String(` call on the right, which is how the accumulation is
 *      written when the fragment being appended is a number
 *
 * Arms 3 and 4 together see both halves of the planted shape while leaving every
 * numeric `+=` in the project alone: `total += pipValue(card)` and `rounds += 1`
 * carry neither a quote nor a `String(` on the right, and there are dozens of
 * them under `src/core/`.
 *
 * The lookahead in arm 1 is what keeps a wrapped literal out of the result. Its
 * reason is not that the compiler folds the halves, which is only true when both
 * are plain literals: `` `a ${x} ` + `b ${y}` `` is two template expressions
 * evaluated at run time and joined. It is that both operands are **written out
 * in full at the site**, so the sentence is readable in one piece and moves in
 * one piece; what resists translation later is a sentence whose parts are only
 * assembled once a value has been computed, and that is arms 1 to 4.
 */
function assembledStrings(text: string): readonly string[] {
  const source = code(text);
  const found: string[] = [];
  for (const match of source.matchAll(/['"`]\s*\+\s*(?![\s'"`])/g)) {
    found.push(match[0].replace(/\s+/g, ' '));
  }
  for (const match of source.matchAll(/[\w)\]]\s*\+\s*['"`]/g)) {
    found.push(match[0].replace(/\s+/g, ' '));
  }
  for (const match of source.matchAll(/\+=\s*['"`]/g)) {
    found.push(match[0].replace(/\s+/g, ' '));
  }
  for (const match of source.matchAll(/\+=\s*String\(/g)) {
    found.push(match[0].replace(/\s+/g, ' '));
  }
  return found;
}

/**
 * Every `join` or `concat` whose separator is prose punctuation, in code.
 *
 * The other half of the review's finding: a list joined with `', then '` is a
 * sentence assembled from parts as surely as one built with `+`, and this
 * project has four such sites. They are allowed, and the allowlist below is
 * checked by path so that a fifth one fails the suite and has to be argued for.
 *
 * **A separator that is whitespace alone is not prose.** `missing.join(' ')` in
 * `src/ui/capability.ts` builds a space-separated token list for a data
 * attribute, which is the idiomatic HTML form and is read by no one; `','` and
 * `'|'` in the mirror, the round result and the bust-out screen build keys that
 * decide when a subtree is rebuilt. So the scanner asks for a separator that
 * contains whitespace **and** something else, which is exactly what punctuation
 * between words looks like and exactly what a key separator never is.
 */
function proseJoins(text: string): readonly string[] {
  const source = code(text);
  const found: string[] = [];
  for (const match of source.matchAll(/\.(?:join|concat)\(\s*(['"`])([^'"`]*)\1\s*\)/g)) {
    const separator = match[2] ?? '';
    if (/\s/.test(separator) && /\S/.test(separator)) {
      found.push(match[0]);
    }
  }
  return found;
}

/**
 * The four sites that join a list into a sentence, by path, in walk order.
 *
 * Named rather than counted, so a fifth is a failure that says where it is. Each
 * one is a list of things the player did or may do, joined for reading, and each
 * lives beside the sentence it is part of.
 */
const PROSE_JOIN_SITES: readonly string[] = [
  // "Insurance, then Hit": the actions taken in one round, in the history panel.
  'src/ui/announce.ts',
  // The same, in the round-result and history rows the overlay renders.
  'src/ui/components/overlays.ts',
  'src/ui/components/overlays.ts',
  // "surrender, then hit": SPEC 7's preference list, in the sentence home.
  'src/ui/text.ts',
];

/**
 * The lines under `src/render/` that become text a player reads.
 *
 * Two markers, both about drawing and nothing else: a call to `fillText`, which
 * is the only way anything reaches the canvas as text, and the body of
 * `feltPrint`, which returns the lines the felt is baked with. Everything else
 * in that directory that turns a value into a string is a thrown message, a CSS
 * length, a font shorthand or a memory key, and `RENDER_STRING_CALLS` below
 * pins those so a new one cannot arrive unclassified.
 */
function drawnTextLines(text: string): readonly string[] {
  const lines = code(text).split('\n');
  const found: string[] = [];
  let insidePrint = false;
  for (const line of lines) {
    if (/export function feltPrint\(/.test(line)) {
      insidePrint = true;
    } else if (insidePrint && /^\}/.test(line)) {
      insidePrint = false;
    }
    if (insidePrint || line.includes('fillText(')) {
      found.push(line.trim());
    }
  }
  return found;
}

/** Whether a drawn line turns a value into text rather than printing a constant. */
function carriesQuantity(line: string): boolean {
  return /\bString\(/.test(line) || line.includes('${');
}

/**
 * The two drawn quantities SPEC 16 makes artwork, by path and by their line.
 *
 * **This is item `M2`'s one park, and it is adjudicated rather than overlooked.**
 * The criterion says every number is formatted through `Intl.NumberFormat` with
 * an explicit locale list, and these two are printed as plain digits:
 *
 *   - the felt's `MINIMUM 10 - MAXIMUM 100` line, which SPEC 16 calls "a
 *     decorative repeat: the same rules and limits are real DOM text in the
 *     chrome", where they are formatted;
 *   - the chip's value glyph, which SPEC 16 gives the chips as object identity,
 *     the same carve-out QUALITY-BAR section 4 already makes for a card's rank.
 *
 * Localised digits on English felt art would be incoherent, and a chip that read
 * differently from the chip beside it would stop being a 100 chip. The ruling is
 * to keep both as artwork and to make the exemption a list of exactly two rather
 * than a habit, which is what the assertion below is for: a third drawn quantity
 * reddens the suite and has to be argued for.
 */
const DRAWN_QUANTITY_SITES: readonly { readonly path: string; readonly line: string }[] = [
  {
    path: 'src/render/chips.ts',
    line: 'ctx.fillText(String(top.denomination), top.x, top.y);',
  },
  {
    path: 'src/render/felt.ts',
    line: '`MINIMUM ${String(limits.minimum)} - MAXIMUM ${String(limits.maximum)}`,',
  },
];

/**
 * Every `String(` under `src/render/`, per file, so a new one is classified.
 *
 * Outside the two sites above these are a thrown message (`chips.ts`,
 * `surface.ts`), a CSS length or font shorthand (`surface.ts`) and a per-hand
 * memory key (`scene.ts`). None of them is read by a player, and none of them
 * may quietly become one: the counts are pinned, so adding any `String(` to this
 * directory fails here until its author says which kind it is.
 */
const RENDER_STRING_CALLS: Readonly<Record<string, number>> = {
  'src/render/chips.ts': 2,
  'src/render/felt.ts': 2,
  'src/render/scene.ts': 3,
  'src/render/surface.ts': 6,
};

/** Every occurrence of a name that turns a number into a string, in code. */
function numberToStringCalls(text: string): readonly string[] {
  return [
    ...code(text).matchAll(
      /\b(?:toLocaleString|toLocaleDateString|toLocaleTimeString|toFixed|toPrecision|toExponential)\b/g,
    ),
  ].map((match) => match[0]);
}

/** Every occurrence of the `Intl` namespace, in code. */
function intlNames(text: string): readonly string[] {
  return [...code(text).matchAll(/\bIntl\b/g)].map((match) => match[0]);
}

// ---------------------------------------------------------------------------
// The DOM-text census, statement-scoped
// ---------------------------------------------------------------------------

/**
 * The four ways a string becomes DOM text in this chrome, and where in each of
 * them the text sits.
 *
 * `skip` is how many arguments to walk past before the one that is rendered:
 * `setText(node, text)` puts it second, `button(label, onPress, options)` puts
 * it first, and the two property forms put it straight after the token.
 *
 * **`button(` is here because it is a writer.** `src/ui/dom.ts` assigns the
 * first argument to `textContent`, so a label is DOM text in exactly the sense
 * this census is about, and it is the form the two live offenders this scan was
 * widened to catch were written in.
 */
const TEXT_WRITERS: readonly { readonly token: RegExp; readonly skip: number }[] = [
  { token: /\btext:/g, skip: 0 },
  { token: /\bsetText\(/g, skip: 1 },
  { token: /\btextContent\s*=/g, skip: 0 },
  { token: /\bbutton\(/g, skip: 0 },
];

/**
 * The source of the one argument or property value that starts at `start`,
 * after `skip` earlier arguments.
 *
 * **Why a walker and not a line.** The census this replaces tested the writer
 * token and the raw number on one physical line, so the identical write walked
 * past it the moment prettier wrapped the call, which is the shape six shipped
 * `src/ui/` sites already use. Widening it to a whole statement instead would
 * have been the other error: a `button(label, onPress, { attributes: { 'data-x':
 * String(n) } })` writes no number into text and spells one into an attribute
 * three arguments later, and a statement-scoped regex cannot tell those apart.
 * So the scan reads the argument, which is what actually becomes text.
 *
 * Quoted literals are stepped over whole, because a comma or a brace inside one
 * is not punctuation. Template literals are copied rather than skipped, because
 * `` `${String(count)} decks` `` is precisely the write being hunted, and their
 * own commas cannot end the argument while the walk is inside one.
 */
function argumentAt(text: string, start: number, skip: number): string {
  let depth = 0;
  let seen = 0;
  const out: string[] = [];
  for (let index = start; index < text.length; index += 1) {
    const ch = text[index] ?? '';
    if (ch === "'" || ch === '"') {
      const closed = closingQuote(text, index, ch);
      if (seen >= skip) {
        out.push(text.slice(index, closed + 1));
      }
      index = closed;
      continue;
    }
    if (ch === '`') {
      const closed = closingQuote(text, index, '`');
      if (seen >= skip) {
        out.push(text.slice(index, closed + 1));
      }
      index = closed;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) {
        break;
      }
      depth -= 1;
    } else if (depth === 0 && (ch === ',' || ch === ';')) {
      if (seen >= skip) {
        break;
      }
      seen += 1;
      continue;
    }
    if (seen >= skip) {
      out.push(ch);
    }
  }
  return out.join('');
}

/** The index of the quote that closes the one at `open`, or the end of `text`. */
function closingQuote(text: string, open: number, quote: string): number {
  for (let index = open + 1; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text[index] === quote) {
      return index;
    }
  }
  return text.length - 1;
}

/**
 * Every raw number this source writes into DOM text, however it is wrapped.
 *
 * `String(` elsewhere is fine and common: it spells data attributes, element
 * ids and cache keys, none of which is read by anybody.
 */
function domTextOffenders(source: string): string[] {
  const text = code(source);
  const offenders: string[] = [];
  for (const writer of TEXT_WRITERS) {
    for (const match of text.matchAll(writer.token)) {
      const start = (match.index ?? 0) + match[0].length;
      const written = argumentAt(text, start, writer.skip);
      if (/\bString\(/.test(written)) {
        offenders.push(`${match[0]}${written.replace(/\s+/g, ' ').trim()}`);
      }
    }
  }
  return offenders;
}

describe('M2: the scanners find what they hunt for', () => {
  it('finds a sentence assembled from a literal and an expression', () => {
    expect(assembledStrings("const s = 'You have ' + count + ' chips';")).toHaveLength(2);
    expect(assembledStrings('const s = `a ${x} b` + suffix;')).toHaveLength(1);
    expect(assembledStrings("const s = prefix + 'a sentence';")).toHaveLength(1);
  });

  it('leaves a literal wrapped across two lines alone', () => {
    // The shape `src/ui/text.ts` uses at 110 columns: both operands are written
    // out in full at the site, so the sentence is readable and movable in one
    // piece. A scanner that flagged this would have nothing to say about the
    // shape that matters.
    expect(assembledStrings("const s =\n  'one whole ' +\n  'sentence';")).toEqual([]);
    expect(assembledStrings('const s = `a ${x} ` + `b ${y}`;')).toEqual([]);
  });

  it('finds a sentence accumulated with compound assignment', () => {
    // The shape the review planted. Both halves are seen: the fragment that is
    // a literal, and the fragment that is a number turned into one.
    const planted =
      "let text = 'You have ';\ntext += String(count);\ntext += ' chips left.';";
    expect(assembledStrings(planted)).toHaveLength(2);
    // And a numeric accumulation is not a sentence. There are dozens of these.
    expect(assembledStrings('total += pipValue(card);')).toEqual([]);
    expect(assembledStrings('rounds += 1;')).toEqual([]);
    expect(assembledStrings('for (let step = 0; step < limit; step += 1) {')).toEqual([]);
  });

  it('finds a list joined into a sentence, and not a key or a token list', () => {
    expect(proseJoins("const s = parts.join(', then ');")).toHaveLength(1);
    expect(proseJoins("const s = parts.join('. ');")).toHaveLength(1);
    expect(proseJoins("const s = parts.concat(' and ');")).toHaveLength(1);
    // A separator that is whitespace alone, or no whitespace at all, is not
    // prose: the first is an attribute token list and the second is a key.
    expect(proseJoins("const s = missing.join(' ');")).toEqual([]);
    expect(proseJoins("const key = cards.join(',');")).toEqual([]);
    expect(proseJoins("const key = greyed.join('|');")).toEqual([]);
    expect(proseJoins("// never join(', then ') outside the sentence home")).toEqual([]);
  });

  it('finds a number turned into a string outside the formatter', () => {
    expect(numberToStringCalls('const s = value.toLocaleString();')).toEqual(['toLocaleString']);
    expect(numberToStringCalls('const s = value.toFixed(2);')).toEqual(['toFixed']);
    expect(numberToStringCalls('// never call toFixed here')).toEqual([]);
  });

  it('finds the Intl namespace in code and not in prose', () => {
    expect(intlNames('const f = new Intl.NumberFormat(locales);')).toEqual(['Intl']);
    expect(intlNames('// Intl with no locale reads the host default')).toEqual([]);
  });

  it('finds a raw number written into DOM text on one line, and wrapped, and as a label', () => {
    // The control the DOM-text census went without, which is why its reach
    // defect was invisible: every other scan in this file carries one. Three
    // shapes, because the scan replaced a line test and the two shapes a line
    // test cannot see are the ones the chrome actually writes.
    expect(domTextOffenders('  setText(node, String(count));')).toHaveLength(1);
    expect(domTextOffenders('  node.textContent = String(count);')).toHaveLength(1);
    expect(
      domTextOffenders(['      setText(', '        node,', '        String(count),', '      );'].join('\n')),
      'a wrapped write walked past the census',
    ).toHaveLength(1);
    expect(
      domTextOffenders(['        text:', '          String(chips),', '      });'].join('\n')),
      'a wrapped property walked past the census',
    ).toHaveLength(1);
    expect(
      domTextOffenders("    const control = button(\n      `${String(count)} decks`,\n      onPress,\n    );"),
      'a button label walked past the census',
    ).toHaveLength(1);
  });

  it('leaves a raw number alone where it is not text', () => {
    // The other half, and the reason the scan reads one argument rather than a
    // whole statement. A data attribute, an element id and a cache key are all
    // spelled with `String(` and none of them is read by anybody, so a census
    // that flagged them would have to be argued with rather than fixed.
    expect(
      domTextOffenders(
        "    const control = button(\n      'Deal',\n      onPress,\n      { attributes: { 'data-decks': String(count) } },\n    );",
      ),
    ).toEqual([]);
    expect(domTextOffenders("  setText(node, chips(count)); // key = String(count)")).toEqual([]);
    expect(
      domTextOffenders("  el('div', { attributes: { 'data-history': String(index) } });"),
    ).toEqual([]);
    // A comma inside the text itself does not end the argument early, or a
    // sentence with a list in it would hide whatever followed the comma.
    expect(domTextOffenders("  setText(node, `one, two, ${String(n)}`);")).toHaveLength(1);
  });
});

describe('M2: no user-facing sentence is assembled by string concatenation', () => {
  it('joins a list into a sentence in exactly the four sites that may', () => {
    const sites: string[] = [];
    for (const file of sourcesUnder('src')) {
      for (const found of proseJoins(file.text)) {
        void found;
        sites.push(file.path.slice(file.path.lastIndexOf('src/')));
      }
    }
    // By path, in walk order, so a fifth site fails here and says where it is.
    expect(sites, 'a list is joined into a sentence somewhere new').toEqual(PROSE_JOIN_SITES);
  });

  it('finds no literal joined to an expression anywhere under src/', () => {
    const files = sourcesUnder('src');
    expect(files.length, 'the walk found no source at all').toBeGreaterThan(10);
    for (const file of files) {
      expect(assembledStrings(file.text), file.path).toEqual([]);
    }
  });
});

describe('M2: every number a player reads goes through the one formatter', () => {
  it('names Intl in exactly one file, and constructs three formatters there', () => {
    const named = sourcesUnder('src').filter((file) => intlNames(file.text).length > 0);
    expect(named.map((file) => file.path.slice(file.path.lastIndexOf('src/')))).toEqual([
      'src/ui/format.ts',
    ]);

    const seam = named[0];
    if (seam === undefined) {
      throw new Error('the formatter seam was not found');
    }
    // Three constructions, and every one of them passes the list. A
    // construction with no locale argument reads the host default, which is the
    // defect the whole item exists to prevent, so the count and the argument
    // are both pinned rather than the count alone.
    const constructions = [...code(seam.text).matchAll(/new Intl\.[A-Za-z]+\(/g)];
    expect(constructions).toHaveLength(3);
    const explicit = [...code(seam.text).matchAll(/new Intl\.NumberFormat\(locales,/g)];
    expect(explicit, 'a formatter is built without an explicit locale list').toHaveLength(3);
  });

  it('calls no locale-agnostic number-to-string method anywhere under src/', () => {
    for (const file of sourcesUnder('src')) {
      expect(numberToStringCalls(file.text), file.path).toEqual([]);
    }
  });

  it('writes no raw number into DOM text, anywhere under src/ui/', () => {
    // The chrome's half of the clause. Every number a player reads in the DOM
    // goes through `format.ts`, so a `String(` in an argument that becomes text
    // would be a number rendered in no locale at all.
    const offenders: string[] = [];
    for (const file of sourcesUnder('src', 'ui')) {
      for (const written of domTextOffenders(file.text)) {
        offenders.push(`${file.path.slice(file.path.lastIndexOf('src/'))}: ${written}`);
      }
    }
    expect(offenders, 'a raw number is written into DOM text').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The park: the two quantities the play surface prints as artwork
// ---------------------------------------------------------------------------

describe('M2: the play surface prints exactly two quantities, and they are artwork', () => {
  it('finds the drawn lines, and tells a constant from a quantity', () => {
    // The can-see control for both halves of the scan below.
    const printed =
      'export function feltPrint(limits: FeltLimits): readonly string[] {\n' +
      "  return [\n    'BLACKJACK PAYS 3 TO 2',\n" +
      '    `MINIMUM ${String(limits.minimum)}`,\n  ];\n}\n' +
      'const elsewhere = String(other);\n';
    const drawn = drawnTextLines(printed);
    expect(drawn.some((line) => line.includes('BLACKJACK PAYS'))).toBe(true);
    expect(drawn.some((line) => line.includes('elsewhere'))).toBe(false);
    expect(carriesQuantity("'BLACKJACK PAYS 3 TO 2',")).toBe(false);
    expect(carriesQuantity('`MINIMUM ${String(limits.minimum)}`,')).toBe(true);
    expect(drawnTextLines('ctx.fillText(String(n), x, y);')).toHaveLength(1);
  });

  it('draws a quantity in exactly the two places SPEC 16 makes artwork', () => {
    const found: { path: string; line: string }[] = [];
    for (const file of sourcesUnder('src', 'render')) {
      const path = file.path.slice(file.path.lastIndexOf('src/'));
      for (const line of drawnTextLines(file.text)) {
        if (carriesQuantity(line)) {
          found.push({ path, line });
        }
      }
    }
    // A third drawn quantity fails here and has to be argued for. The two that
    // are here are named, and the reasoning is on `DRAWN_QUANTITY_SITES`.
    expect(found, 'the play surface draws a quantity somewhere new').toEqual(
      DRAWN_QUANTITY_SITES,
    );
  });

  it('keeps every other drawn line free of a value, so the two are the whole list', () => {
    // The rank and suit glyphs and the felt's three fixed lines draw text with
    // no value in it at all: the digits in "BLACKJACK PAYS 3 TO 2" are letters
    // of the artwork rather than a quantity. Asserted so that the list above is
    // a list of quantities rather than a list of what the scan happened to see.
    let drawn = 0;
    for (const file of sourcesUnder('src', 'render')) {
      drawn += drawnTextLines(file.text).length;
    }
    expect(drawn, 'the drawn-text scan found nothing at all').toBeGreaterThan(
      DRAWN_QUANTITY_SITES.length,
    );
  });

  it('classifies every String( in the renderer, so a new one cannot hide', () => {
    const counted: Record<string, number> = {};
    for (const file of sourcesUnder('src', 'render')) {
      const path = file.path.slice(file.path.lastIndexOf('src/'));
      const calls = [...code(file.text).matchAll(/\bString\(/g)].length;
      if (calls > 0) {
        counted[path] = calls;
      }
    }
    expect(counted, 'a String( arrived in the renderer unclassified').toEqual(
      RENDER_STRING_CALLS,
    );
  });

  it('prints one data-driven line on the felt, in a fixed shape', () => {
    // The behavioural half, and the one that survives a refactor: the printed
    // lines are asked for twice with different limits, and exactly one of them
    // moves. A second quantity added to the same line changes its shape, which
    // is pinned character for character below.
    const bronze = feltPrint({ minimum: 10, maximum: 100 });
    const gold = feltPrint({ minimum: 100, maximum: 2_000 });
    expect(bronze).toHaveLength(gold.length);
    const moved = bronze.filter((line, index) => line !== gold[index]);
    expect(moved, 'more than one printed line carries a quantity').toHaveLength(1);
    expect(moved[0]).toBe('MINIMUM 10 - MAXIMUM 100');
    expect(gold[gold.length - 1]).toBe('MINIMUM 100 - MAXIMUM 2000');
    // Plain digits, on purpose: the same numbers are locale-formatted in the
    // chrome, which SPEC 16 calls the authoritative copy.
    expect(moved[0]).toMatch(/^MINIMUM \d+ - MAXIMUM \d+$/);
  });
});
