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
 * `BJ-18` and `BJ-20` will each add one component to. `BJ-16` added no
 * component: the responsive work is three attributes written below, a stylesheet
 * that selects on them, and a disclosure inside the readouts.
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
import { createFocusPolicy } from './input';
import { createShell, type Shell } from './layout';
import { OVERLAY_IDS, type ChromeActions, type ChromeState, type Component } from './state';

/** The assembled chrome: its shell, and the one sync step. */
export interface Chrome {
  readonly shell: Shell;
  /**
   * DESIGN section 3 step 5. Called once per frame, after the render.
   *
   * `dt` is the seconds since the previous frame, handed on to the components.
   * Only SPEC 5's balance count-up uses it; every other component is a pure
   * function of the state and ignores it.
   */
  sync(state: ChromeState, dt: number): void;
  /**
   * Release everything the chrome attached outside its own shell. `BJ-17`.
   *
   * There is exactly one such thing, the focus policy's document `keydown`, and
   * it is the reason this method exists: `boot` disposes the game it built last
   * before building another, and a listener left behind by a disposed game would
   * answer `Escape` on behalf of a shell that is no longer in the page. The
   * shell itself is removed by the composition root, which owns where it was
   * mounted.
   */
  dispose(): void;
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

  // `BJ-17`, item `D4`. Built here rather than in the composition root because
  // every element it looks after is built here, and because a second holder of
  // the shell's focus would be a second writer of the same thing.
  const focus = createFocusPolicy({
    root: shell.root,
    anchor: shell.controls,
    dialog: overlays.host,
    // The policy is written over `string`, because a focus trap is not a
    // Blackjack idea and STACK section 3 predicts it moving to the shared
    // engine. So the id is narrowed here, where SPEC 10's three are known, and
    // an id that is not one of them has no opener rather than being asserted
    // into one.
    opener: (id) => {
      const known = OVERLAY_IDS.find((candidate) => candidate === id);
      return known === undefined ? null : overlays.opener(known);
    },
    close: () => {
      actions.closeOverlay();
    },
  });

  return {
    shell,
    dispose(): void {
      focus.dispose();
    },
    sync(state: ChromeState, dt: number): void {
      // The phase on the shell, so a stylesheet can respond to the screen
      // without a component telling it to, and so a test can wait for one.
      setAttribute(shell.root, 'data-phase', state.readout.phase.kind);
      setAttribute(shell.root, 'data-overlay', state.overlay);
      // The motion mode on the shell as well, so the browser gate can read what
      // the page resolved rather than what it emulated, and so a later part has
      // a hook for the reduced-motion setting SPEC 14 lists. It is written from
      // the same boolean the play surface was handed, so the canvas and the
      // chrome cannot disagree about which mode the frame is in.
      setAttribute(shell.root, 'data-motion', state.motion.reducedMotion ? 'reduce' : 'full');
      // Named apart from the Speed control's own `data-speed`, so a selector
      // for one cannot resolve to the other: the shell says what the frame
      // resolved and the button says what it would choose.
      setAttribute(shell.root, 'data-motion-speed', state.motion.speed);
      // `BJ-16`'s three. The stylesheet has no media query and selects on these
      // instead, for the reason `src/ui/breakpoints.ts` gives at length: a
      // breakpoint in a media query is a dimension literal in a component
      // stylesheet, which the token scan fails, and the width-first rule with
      // orientation below one threshold has no clean media-query form. They are
      // written here rather than by the composition root because every other
      // attribute on the shell is written here, and because a second DOM writer
      // is how two writers start disagreeing about a frame.
      setAttribute(shell.root, 'data-breakpoint', state.layout.breakpoint);
      setAttribute(shell.root, 'data-sticky-bars', state.layout.stickyBars ? 'on' : 'off');
      // Named apart from the size control's own `data-surface-size`, for the
      // reason `data-motion-speed` is named apart from `data-speed`: the shell
      // says what the frame resolved and the button says what it would choose,
      // and one selector must not resolve to both.
      setAttribute(shell.root, 'data-layout-size', String(state.layout.surfaceSize));
      for (const component of components) {
        component.update(state, dt);
      }
      overlays.update(state, dt);
      // Last, and it has to be last: the policy asks whether the element that
      // holds focus is still in the page and still visible, and every writer
      // that could have taken it away has now run. `BJ-17`, item `D4`.
      focus.sync({ overlay: state.overlay });
    },
  };
}
