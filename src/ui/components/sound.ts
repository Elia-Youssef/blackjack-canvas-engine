/**
 * The play screen's mute control. `BJ-19`, item `K3`'s single-action clause.
 *
 *   "Master mute and volume persist and mute is reachable in a single action
 *    from the play screen."
 *
 * **One press, on the play screen, in no overlay and behind no disclosure.**
 * The control lives in the top bar beside the panel openers, which is the one
 * row of the shell that no phase ever takes away and that the responsive
 * disclosure never swallows: the disclosure at `compact` and `portrait` holds
 * eleven of SPEC 11's fourteen readouts and nothing else, so a mute that sat
 * inside the readouts panel would be two actions deep at exactly the widths a
 * phone plays at. `tests/browser/audio-settings.spec.ts` asserts the
 * reachability at wide, medium and compact rather than reading this file.
 *
 * **The state is carried three ways, and all three are the control's own.**
 * `aria-pressed` exposes it to assistive technology; the label changes, from
 * "Mute" to "Unmute", so the state is in words and not only in a colour; and
 * the pressed style the stylesheet already gives every `aria-pressed` control
 * underlines it, which is the non-colour signal that survives forced colors
 * and colour-vision deficiencies alike. That is `BJ-18`'s rule for a state
 * carried by more than colour, applied on arrival rather than retrofitted.
 *
 * **Never greyed.** Nothing refuses a mute: it decides no round, it is legal
 * in every phase, and the availability layer never hears of it. The control
 * carries no `aria-disabled` at any screen, which the same spec asserts rather
 * than assumes, and the mirror's list of unavailable controls never names it
 * because `unavailableNow` reads the machine and the machine has no stake in
 * silence.
 *
 * The volume half of SPEC 14's sound is not here. The slider is item `I5` at
 * `BJ-20`, on purpose, and the engine's `setVolume` is the programmatic path
 * it will bind to; what this part ships toward it is the boot pass-through and
 * the read side, both asserted in the spec above.
 */

import { button, setAttribute, setText } from '../dom';
import type { ChromeActions, ChromeState, Component } from '../state';

/** The label at each state. Both are verbs, because both are what one press does. */
function labelFor(muted: boolean): string {
  return muted ? 'Unmute' : 'Mute';
}

/**
 * Build the mute control.
 *
 * The press asks the composition root to toggle rather than setting a value
 * it read off the DOM: the engine holds the one copy of the state, and a
 * control that kept a second copy would be a second place the two could
 * disagree.
 */
export function createSound(actions: ChromeActions): Component {
  const control = button('Mute', () => {
    actions.toggleMuted();
  }, {
    className: 'bj-button bj-button--quiet',
    attributes: { 'data-control': 'mute', 'aria-pressed': 'false' },
  });

  return {
    root: control,
    update(state: ChromeState): void {
      setAttribute(control, 'aria-pressed', String(state.muted));
      setText(control, labelFor(state.muted));
    },
  };
}
