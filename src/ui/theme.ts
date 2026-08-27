/**
 * SPEC 14's theme setting, and the one attribute that carries it. `BJ-20`,
 * item `E2` (Major).
 *
 *   "Light and dark themes both render correctly, follow prefers-color-scheme
 *    by default, and the settings override wins in both directions."
 *
 * **The stylesheet is the resolution rule and this file is not a second one.**
 * `src/ui/tokens.css` already carries the whole mechanism: the dark palette is
 * the default at `:root`, a guarded `@media (prefers-color-scheme: light)`
 * block re-points the tokens for every root that has not explicitly chosen
 * dark, and the two attribute selectors `:root[data-theme='light']` and
 * `:root[data-theme='dark']` win over the query in both directions. What the
 * chrome owes that mechanism is exactly one writer of the attribute and one
 * spelling of "which attribute value", which is what lives here.
 *
 * `'system'` is the absence of the attribute rather than a third value of it,
 * because the stylesheet's guarded query is what "follow the platform" means:
 * a root carrying `data-theme='system'` would match neither attribute selector
 * and would still follow the query, but it would also keep a player's old
 * choice visible in the DOM after they switched back to system, which is a
 * lie about what the page is doing. `themeAttribute` below is the whole of
 * the translation and the only place it is spelled.
 *
 * The type was declared in `src/storage/document.ts` at `BJ-11` because the
 * persisted document was the first thing that had to name the setting. It
 * moves here on the Speed precedent (`BJ-14`, `core/table.ts`) and the sound
 * precedent (`BJ-19`, `ui/audio.ts`): the constants live beside the module
 * that reads them, and `document.ts` re-exports so no caller moved. The edge
 * runs one way only; `src/ui/` imports nothing from `src/storage/`.
 */

/** SPEC 14's theme setting: follow the platform, or choose. */
export type Theme = 'system' | 'light' | 'dark';

/** The three, in SPEC 14's order. */
export const THEMES = ['system', 'light', 'dark'] as const satisfies readonly Theme[];

/** SPEC 14 prints "system / light / dark", and the platform's answer is first. */
export const DEFAULT_THEME: Theme = 'system';

/**
 * The `data-theme` value a theme resolves to, or `null` to take the attribute
 * off and let `prefers-color-scheme` decide.
 *
 * A function rather than a map so that the `null` for `'system'` is a returned
 * value of the one spelling: `setAttribute(name, null)` removes, which is the
 * DOM's own way of saying "no override", and a map whose value was the string
 * `'system'` would invite a writer that set it.
 */
export function themeAttribute(theme: Theme): string | null {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }
  return null;
}
