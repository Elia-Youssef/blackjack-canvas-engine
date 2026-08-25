/**
 * The DOM sync step. DESIGN section 3, step 5.
 *
 * "Sync the DOM chrome from state" is one function, called once per frame after
 * the render, and this is it. It takes the frame's `ChromeState` and hands it to
 * every component; each component reads what it needs and writes only what
 * moved. Nothing here reads the DOM back, so the sync is a pure function of the
 * state as far as the page is concerned, and running it twice on one state
 * produces the same page.
 *
 * **Every component is assembled here and nowhere else.** The composition root
 * builds the game, this builds the chrome, and the two meet at one call. That is
 * what keeps `main.ts` readable at the size the shell has now reached, and what
 * `BJ-16`, `BJ-18` and `BJ-20` will each add one component to.
 *
 * **The sync is per frame and is deliberately cheap.** Text is written only when
 * it changed, and the two lists that cost anything to build, the round result
 * and the history, are rebuilt on an identity change of the immutable value
 * behind them. A chrome that rebuilt itself sixty times a second would also
 * destroy focus sixty times a second, which is the defect this shape avoids
 * rather than an optimisation.
 */

import { createActions } from './components/actions';
import { createBetting } from './components/betting';
import { createNotice } from './components/notice';
import { createOverlays } from './components/overlays';
import { createReadouts } from './components/readouts';
import { createRoundResult } from './components/round-result';
import {
  createBustOutScreen,
  createInsuranceScreen,
  createStartScreen,
} from './components/screens';
import { setAttribute } from './dom';
import { createShell, type Shell } from './layout';
import type { ChromeActions, ChromeState, Component } from './state';

/** The assembled chrome: its shell, and the one sync step. */
export interface Chrome {
  readonly shell: Shell;
  /** DESIGN section 3 step 5. Called once per frame, after the render. */
  sync(state: ChromeState): void;
}

/** Build every component, mount it in its region, and return the sync step. */
export function createChrome(actions: ChromeActions): Chrome {
  const shell = createShell();

  const readouts = createReadouts();
  const overlays = createOverlays(actions);
  const notice = createNotice();
  const start = createStartScreen(actions);
  const betting = createBetting(actions);
  const handActions = createActions(actions);
  const insurance = createInsuranceScreen(actions);
  const result = createRoundResult(actions);
  const bustOutScreen = createBustOutScreen(actions);

  shell.top.append(readouts.root, overlays.controls);
  shell.body.append(overlays.host);
  shell.controls.append(
    notice.root,
    start.root,
    betting.root,
    handActions.root,
    insurance.root,
    result.root,
    bustOutScreen.root,
  );

  const components: readonly Component[] = Object.freeze([
    readouts,
    notice,
    start,
    betting,
    handActions,
    insurance,
    result,
    bustOutScreen,
  ]);

  return {
    shell,
    sync(state: ChromeState): void {
      // The phase on the shell, so a stylesheet can respond to the screen
      // without a component telling it to, and so a test can wait for one.
      setAttribute(shell.root, 'data-phase', state.readout.phase.kind);
      setAttribute(shell.root, 'data-overlay', state.overlay);
      for (const component of components) {
        component.update(state);
      }
      overlays.update(state);
    },
  };
}
