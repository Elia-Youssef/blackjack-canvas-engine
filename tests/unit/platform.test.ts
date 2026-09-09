/**
 * The two platform readings the chrome shares, and the one attribute the theme
 * setting resolves to. `AUDIT-2`, findings `Z5-03` and `Z5-04`.
 *
 * Both files had no unit caller and no mutation-ledger entry at all.
 *
 * **`mediaQuery` had never been called by a test.** Every construction of the
 * two preferences passes `query` explicitly, which is precisely the branch that
 * skips it, so neither of its properties, that it answers `null` rather than
 * throwing on a host with no `matchMedia` and that it asks for the query it was
 * given, was inside the unit gate. `src/ui/motion.ts` says the guard is "for the
 * headless runner"; nothing headless reached it. The arms below are what make
 * that sentence true, and they are only possible under `environment: 'node'`,
 * where `matchMedia` and `document` genuinely do not exist. That is the point:
 * the guard cannot be exercised in a browser.
 *
 * **`themeAttribute` had no unit test either**, its only witness being six
 * assertions in one browser spec, and its doc said `setAttribute(name, null)`
 * removes the attribute. The platform method of that name does not; this
 * chrome's wrapper does, and the two are pinned together here so the sentence
 * cannot drift from the code again.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { setAttribute } from '../../src/ui/dom';
import { FORCED_COLORS_QUERY, createForcedColorsPreference } from '../../src/ui/forced-colors';
import { REDUCED_MOTION_QUERY, createMotionPreference } from '../../src/ui/motion';
import { mediaQuery, pageDocument } from '../../src/ui/platform';
import { DEFAULT_THEME, THEMES, themeAttribute } from '../../src/ui/theme';

describe('E7, G9: the platform readings degrade rather than throw', () => {
  it('runs where neither global exists, which is what makes these arms mean anything', () => {
    expect(typeof matchMedia, 'this runner has a matchMedia, so the guards are untested').toBe(
      'undefined',
    );
    expect(typeof document, 'this runner has a document, so the guards are untested').toBe(
      'undefined',
    );
  });

  it('answers null for any query rather than throwing', () => {
    expect(mediaQuery(REDUCED_MOTION_QUERY)).toBeNull();
    expect(mediaQuery(FORCED_COLORS_QUERY)).toBeNull();
    expect(mediaQuery('(min-width: 0px)')).toBeNull();
  });

  it('answers null for the document rather than throwing', () => {
    expect(pageDocument()).toBeNull();
  });

  it('lets both preferences be built with no query passed at all', () => {
    // The default path, which is the one the composition root takes and the one
    // no unit test used to reach. A host that has not been asked has not
    // expressed a preference, so both answer the unreduced, unforced default:
    // defaulting the other way would remove the animation from every
    // environment the unit suite runs in and hide the difference `E7` measures.
    const motion = createMotionPreference();
    expect(motion.reduced()).toBe(false);
    expect(motion.systemPrefers()).toBe(false);
    // And the always arm still works with no platform underneath it.
    motion.setAlwaysReduce(true);
    expect(motion.reduced()).toBe(true);
    motion.dispose();

    expect(createForcedColorsPreference().active()).toBe(false);
  });
});

describe('E2: the theme setting resolves to one attribute value, or to none', () => {
  it('answers the attribute for the two explicit themes and null for system', () => {
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
    expect(themeAttribute('system')).toBeNull();
    // Total over SPEC 14's three, so a fourth setting is a compile error here
    // rather than a theme that silently resolves to the platform's.
    expect(THEMES.map((theme) => themeAttribute(theme))).toEqual([null, 'light', 'dark']);
    expect(themeAttribute(DEFAULT_THEME)).toBeNull();
  });

  it('is removal because the chrome wrapper removes, not because the platform does', () => {
    // The claim the doc used to make about the platform method, measured on a
    // stand-in that records which of the two calls it receives. `null` reaches
    // `removeAttribute`; a value reaches `setAttribute`. A wrapper that passed
    // the `null` straight through would write the string "null", which nothing
    // in the stylesheet matches and nothing in the unit gate would have seen.
    const calls: string[] = [];
    const node = {
      getAttribute: (): string | null => null,
      setAttribute: (name: string, value: string): void => {
        calls.push(`set ${name}=${value}`);
      },
      removeAttribute: (name: string): void => {
        calls.push(`remove ${name}`);
      },
    } as unknown as Element;

    setAttribute(node, 'data-theme', themeAttribute('system'));
    setAttribute(node, 'data-theme', themeAttribute('dark'));
    expect(calls).toEqual(['remove data-theme', 'set data-theme=dark']);
    expect(calls.join(' ')).not.toContain('null');
  });
});
