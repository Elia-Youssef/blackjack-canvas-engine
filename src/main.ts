/**
 * Blackjack entry point.
 *
 * BJ-0 ships the toolchain and the CI gates, not the game. There is deliberately
 * no game logic, no rendering and no chrome in this file: each of those arrives
 * with the part that owns it in the active build plan, and every one of them is
 * graded by an acceptance item this part is not allowed to touch.
 *
 * What is here is the bootstrap seam and one boot marker, and both earn their
 * place. Without a module-level side effect the entry chunk is tree-shaken to
 * nothing, Vite drops the script tag, and the emitted bundle is a single HTML
 * file. A deterministic-build check over that file would pass while proving
 * nothing at all about the TypeScript pipeline, and the browser gate would have
 * nothing to assert against. The marker is what makes both of them real.
 *
 * The marker is not chrome. It is not a button, a readout, a panel or a label,
 * and nothing is drawn. The project architecture boundary is untouched.
 */

// The design tokens, imported once at the composition root so that every
// custom property is defined on :root before any chrome renders. Item E1.
// Nothing else in the project may declare one.
import './ui/tokens.css';

export const GAME_ID = 'blackjack';

/**
 * The seam every later part fills. BJ-0 owns the fact that there is one; what
 * happens inside it belongs to BJ-13 onward.
 */
function boot(): void {
  document.documentElement.dataset['game'] = GAME_ID;
}

boot();
