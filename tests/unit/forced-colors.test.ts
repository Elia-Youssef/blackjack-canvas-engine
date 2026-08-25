/**
 * The forced-colors half that can be checked without a browser. Armour under
 * item `G9`, built at `BJ-18`.
 *
 *   "Under forced-colors active the chrome adopts the system palette, no chrome
 *    element depends on a colour the canvas supplies, and the play surface
 *    switches to its high-contrast token set through the media query."
 *
 * Three clauses, and this file grades the two that are source facts.
 * `tests/browser/forced-colors.spec.ts` measures the rendered page on the
 * engines that can emulate the query; what is here is the token layer, which is
 * where the chrome's adoption is actually written, and the renderer's palette
 * selection, which is arithmetic.
 *
 * **The third clause carries a park, and this file states it as an assertion.**
 * SPEC 16 defines no high-contrast play-surface palette: it carries one table of
 * eleven tokens, each with a measured ratio, and section 16 is the source of
 * truth for every colour in this game. So `HIGH_CONTRAST_SURFACE` is `null`, the
 * selector reports its fallback and the reason for it, and the assertion below
 * pins that state deliberately: the day the sheet gains the table, this test
 * fails and sends its author to `src/render/tokens.ts`, which is where the park
 * and its resolution are written down. A park nobody is reminded of is a park
 * that becomes a defect.
 *
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  HIGH_CONTRAST_SURFACE,
  SURFACE,
  surfacePalette,
  type SurfaceTokens,
} from '../../src/render/tokens';
import { FORCED_COLORS_QUERY, createForcedColorsPreference } from '../../src/ui/forced-colors';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKENS = readFileSync(join(PROJECT_ROOT, 'src', 'ui', 'tokens.css'), 'utf8');
const CHROME = readFileSync(join(PROJECT_ROOT, 'src', 'ui', 'chrome.css'), 'utf8');

/**
 * The CSS system colours a forced-colors page may spend.
 *
 * The CSS Color 4 forced-colors set, which is what a browser maps a high
 * contrast theme onto. Anything outside this list in the block below would be a
 * colour this project chose, which is the whole thing the query exists to stop.
 */
const SYSTEM_COLOURS = new Set([
  'Canvas',
  'CanvasText',
  'LinkText',
  'VisitedText',
  'ActiveText',
  'ButtonFace',
  'ButtonText',
  'ButtonBorder',
  'Field',
  'FieldText',
  'Highlight',
  'HighlightText',
  'SelectedItem',
  'SelectedItemText',
  'Mark',
  'MarkText',
  'GrayText',
  'AccentColor',
  'AccentColorText',
]);

/** The chrome palette, as `tokens.css` names the active alias of each. */
const CHROME_TOKENS = [
  '--bj-ground',
  '--bj-elevated',
  '--bj-text',
  '--bj-text-muted',
  '--bj-accent',
  '--bj-positive',
  '--bj-negative',
];

/**
 * The play-surface tokens the **chrome** spends, and therefore the ones the
 * query has to re-point. SPEC 16 gives the chips their denominational colours
 * and the betting bar repeats them so a tapped chip looks like the chip that
 * lands on the felt; item `G9`'s second clause is that this dependency ends
 * under forced colors.
 */
const CANVAS_TOKENS_IN_CHROME = [
  '--chip-ring',
  '--chip-glyph',
  '--chip-10-fill',
  '--chip-50-fill',
  '--chip-100-fill',
  '--chip-500-fill',
];

/** Every `--token: value;` inside the first `@media (forced-colors: active)`. */
function forcedColorsBlock(css: string): Map<string, string> {
  const start = css.indexOf('@media (forced-colors: active)');
  const found = new Map<string, string>();
  if (start < 0) {
    return found;
  }
  const end = css.indexOf('\n}', css.indexOf(':root {', start));
  const block = css.slice(start, end < 0 ? css.length : end);
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      found.set(name, value.trim());
    }
  }
  return found;
}

const FORCED = forcedColorsBlock(TOKENS);

describe('G9: the scanner can see what it hunts for', () => {
  it('reads declarations out of a forced-colors block and none out of a file without one', () => {
    const planted = forcedColorsBlock(
      '@media (forced-colors: active) {\n  :root {\n    --bj-text: CanvasText;\n  }\n}\n',
    );
    expect([...planted.entries()]).toEqual([['--bj-text', 'CanvasText']]);
    expect(forcedColorsBlock(':root { --bj-text: #fff; }').size).toBe(0);
  });
});

describe('G9: the chrome adopts the system palette', () => {
  it('declares a forced-colors block in the token layer and nowhere else', () => {
    expect(FORCED.size, 'no forced-colors block in tokens.css').toBeGreaterThan(0);
    // The component stylesheet has no forced-colors block of its own: every rule
    // in it already spends `var(--bj-*)`, so re-pointing the tokens switches the
    // whole chrome at once and leaves no rule that could be missed. The phrase
    // appears in its prose, which is why this looks for the at-rule.
    expect(CHROME).not.toContain('@media (forced-colors');
  });

  it('re-points every chrome token at a system colour', () => {
    for (const token of CHROME_TOKENS) {
      const value = FORCED.get(token);
      expect(value, `${token} is not re-pointed under forced colors`).toBeDefined();
      expect(SYSTEM_COLOURS.has(value ?? ''), `${token} resolves to ${String(value)}`).toBe(true);
    }
  });

  it('re-points every play-surface token the chrome spends', () => {
    for (const token of CANVAS_TOKENS_IN_CHROME) {
      const value = FORCED.get(token);
      expect(value, `${token} is spent by the chrome and not re-pointed`).toBeDefined();
      expect(SYSTEM_COLOURS.has(value ?? ''), `${token} resolves to ${String(value)}`).toBe(true);
    }
  });

  it('spends no other canvas colour anywhere in the chrome stylesheet', () => {
    // The list above is complete because this is what the stylesheet actually
    // uses. A rule that started spending `--felt-rail` or `--card-face` would
    // add a dependency on a colour the canvas supplies, which is exactly item
    // `G9`'s second clause, and it would land here rather than at review.
    const spent = [...CHROME.matchAll(/var\((--(?:felt|card|rank|chip)-[a-z0-9-]+)\)/g)].map(
      (match) => match[1] ?? '',
    );
    expect([...new Set(spent)].sort()).toEqual([...CANVAS_TOKENS_IN_CHROME].sort());
  });

  it('declares no hex inside the forced-colors block', () => {
    for (const [token, value] of FORCED) {
      expect(/#[0-9a-f]/i.test(value), `${token} keeps a chosen colour under forced colors`).toBe(
        false,
      );
    }
  });

  it('leaves the focus ring pointing at the token the system palette moved', () => {
    // `--focus-ring-color` is an alias of `--bj-accent`, which the block above
    // re-points at `Highlight`, so the ring follows the platform without a
    // second declaration. A block that re-declared it would be a second home
    // for one decision.
    expect(TOKENS).toContain('--focus-ring-color: var(--bj-accent)');
    expect(FORCED.has('--focus-ring-color')).toBe(false);
    expect(FORCED.get('--bj-accent')).toBe('Highlight');
  });
});

describe('G9: the play surface selects its palette through the query', () => {
  it('asks the query QUALITY-BAR section 5 names', () => {
    expect(FORCED_COLORS_QUERY).toBe('(forced-colors: active)');
  });

  it('answers false where there is no platform to ask, rather than guessing', () => {
    expect(createForcedColorsPreference({ query: null }).active()).toBe(false);
  });

  it('reads the query live rather than capturing it at construction', () => {
    // A player who turns high contrast on while the game is open gets it on the
    // next frame. The stand-in flips underneath the preference, which a captured
    // value could not do.
    const stand = { matches: false } as MediaQueryList;
    const preference = createForcedColorsPreference({ query: stand });
    expect(preference.active()).toBe(false);
    (stand as { matches: boolean }).matches = true;
    expect(preference.active()).toBe(true);
  });

  it('selects the specified set when the platform is not in forced colors', () => {
    const selected = surfacePalette(false);
    expect(selected.name).toBe('standard');
    expect(selected.reason).toBe('preference');
    expect(selected.surface).toBe(SURFACE);
  });

  it('selects a high-contrast set when one exists, which is the branch that will run', () => {
    // A stand-in rather than an invented palette. What is under test is the
    // selection, and it has to be exercised in the direction it will run the day
    // SPEC 16 defines the table; a branch nothing has ever taken is not tested.
    const standIn: SurfaceTokens = { ...SURFACE, rail: '#ffffff' };
    const selected = surfacePalette(true, standIn);
    expect(selected.name).toBe('high-contrast');
    expect(selected.reason).toBe('preference');
    expect(selected.surface).toBe(standIn);
    // And the flag still decides: the same stand-in is not selected when the
    // platform is not asking for it.
    expect(surfacePalette(false, standIn).surface).toBe(SURFACE);
  });

  it('reports the park rather than hiding it, because SPEC 16 defines no such set', () => {
    // This assertion is the park, pinned. `src/render/tokens.ts` carries it in
    // full: QUALITY-BAR section 5 asks for a high-contrast play-surface palette,
    // SPEC 16 owns every colour in this game and defines none, and no colour may
    // be invented here. When the sheet gains one, this test fails and its author
    // is sent to the resolution.
    expect(HIGH_CONTRAST_SURFACE).toBeNull();
    const selected = surfacePalette(true);
    expect(selected.name).toBe('standard-fallback');
    expect(selected.reason).toBe('unspecified-high-contrast-set');
    expect(selected.surface).toBe(SURFACE);
  });
});
