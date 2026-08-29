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
 * **The third clause carried a park from `BJ-18` until `BJ-22`, and the park is
 * spent.** SPEC 16 defined no high-contrast play-surface palette, so
 * `HIGH_CONTRAST_SURFACE` was `null`, the selector reported a fallback, and the
 * assertion below pinned that state deliberately so that the day the sheet
 * gained the table this file would fail and send its author to
 * `src/render/tokens.ts`. That is exactly what happened: SPEC 16 gained the
 * forced-colors subsection at `BJ-22` under the user's carve-out, this test went
 * red, and the wiring and the flip landed in the same change. What the block
 * below asserts now is the resolved state: a real set, selected on the flag, and
 * a fallback that no longer exists to be taken.
 *
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CHIP_RING,
  HIGH_CONTRAST_CHIP_RING,
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
    expect(selected.surface).toBe(SURFACE);
    expect(selected.chipRing).toBe(CHIP_RING);
    expect(selected.flatFelt).toBe(false);
  });

  it('selects the high-contrast set when the platform is in forced colors', () => {
    const selected = surfacePalette(true);
    expect(selected.name).toBe('high-contrast');
    expect(selected.surface).toBe(HIGH_CONTRAST_SURFACE);
    expect(selected.chipRing).toBe(HIGH_CONTRAST_CHIP_RING);
    // SPEC 16's forced-colors subsection: "the gradient and the grain are
    // suppressed under this set". It travels with the colours rather than
    // beside them, so a caller cannot take one without the other.
    expect(selected.flatFelt).toBe(true);
  });

  it('answers with the same object each time, which the felt cache depends on', () => {
    // `src/render/scene.ts` decides whether the baked felt is still valid by
    // comparing specs, and the palette is one of the fields. A selector that
    // built a fresh record per frame would make every comparison a miss and
    // rebake the grain and the four printed lines sixty times a second, which
    // QUALITY-BAR section 1 forbids in as many words.
    expect(surfacePalette(true)).toBe(surfacePalette(true));
    expect(surfacePalette(false)).toBe(surfacePalette(false));
    expect(surfacePalette(true)).not.toBe(surfacePalette(false));
  });

  it('carries a real set rather than the park BJ-18 left, and every name of it', () => {
    // The park, resolved. `HIGH_CONTRAST_SURFACE` was `null` from `BJ-18` until
    // SPEC 16 gained the forced-colors table; this asserts that it is a complete
    // set of the same ten names, so a token added to one set and forgotten in the
    // other is a red suite rather than a colour that silently stops switching.
    // `tests/unit/tokens.test.ts` is where the values themselves are pinned to
    // the contract and every ratio re-derived.
    const standard: SurfaceTokens = SURFACE;
    const high: SurfaceTokens = HIGH_CONTRAST_SURFACE;
    expect(Object.keys(high).sort()).toEqual(Object.keys(standard).sort());
    for (const [name, value] of Object.entries(high)) {
      expect(value, `${name} is not a hex`).toMatch(/^#[0-9a-f]{6}$/);
    }
    // And it is genuinely a different set: a high-contrast palette equal to the
    // one it replaces would satisfy every structural assertion above.
    const moved = Object.keys(standard).filter(
      (name) =>
        standard[name as keyof SurfaceTokens] !== high[name as keyof SurfaceTokens],
    );
    expect(moved.length, 'the high-contrast set repeats the standard one').toBe(
      Object.keys(standard).length,
    );
  });
});
