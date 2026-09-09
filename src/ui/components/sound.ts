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
 * **The state is `aria-pressed`, and the name is the setting.** The label is
 * "Mute" at both states and never becomes "Unmute": a toggle whose name changes
 * to describe the next press carries the action in its name and the setting in
 * its state, so the two halves of one announcement contradict each other, and
 * "Unmute, toggle button, pressed" says that unmuting is on at the moment the
 * sound is off. That inversion shipped from `BJ-19` until `AUDIT-2`'s finding
 * `Z4-02`; the cure is the form the WAI-ARIA practice names first, a static name
 * with the state in `aria-pressed`, which is also the form every other pressed
 * control in this chrome already has ("Bronze 10 to 100", "Normal", "Dark",
 * "Surrender", "6 decks", "125%"). The non-colour signal is unaffected and is
 * the reason this arm was chosen over dropping `aria-pressed`: the pressed style
 * the stylesheet gives every `aria-pressed` control underlines it, which
 * survives forced colors and colour-vision deficiencies alike, and it is
 * asserted on both arms in `tests/browser/audio-settings.spec.ts`. The change
 * itself is announced in words by `src/ui/announce.ts`, "Sound muted." and
 * "Sound on.", which is the event half of the same state.
 *
 * **Never greyed.** Nothing refuses a mute: it decides no round, it is legal
 * in every phase, and the availability layer never hears of it. The control
 * carries no `aria-disabled` at any screen, which the same spec asserts rather
 * than assumes, and the mirror's list of unavailable controls never names it
 * because `unavailableNow` reads the machine and the machine has no stake in
 * silence.
 *
 * The volume half of SPEC 14's sound is not here. `BJ-20` built the slider as
 * item `I5`, in the Settings panel (`src/ui/components/overlays.ts`), where the
 * setting sits beside the rest of SPEC 14's; it reaches the engine's
 * `setVolume` through `ChromeActions.setVolume`. Only the single-action clause
 * is this file's, which is why mute is the one sound control the top bar
 * carries.
 */

import { button, setAttribute } from '../dom';
import type { ChromeActions, ChromeState, Component } from '../state';

/** The control's name: the setting it holds, at every state. See the header. */
const LABEL = 'Mute';

/**
 * Build the mute control.
 *
 * The press asks the composition root to toggle rather than setting a value
 * it read off the DOM: the engine holds the one copy of the state, and a
 * control that kept a second copy would be a second place the two could
 * disagree.
 */
export function createSound(actions: ChromeActions): Component {
  const control = button(LABEL, () => {
    actions.toggleMuted();
  }, {
    className: 'bj-button bj-button--quiet',
    attributes: { 'data-control': 'mute', 'aria-pressed': 'false' },
  });

  return {
    root: control,
    update(state: ChromeState): void {
      setAttribute(control, 'aria-pressed', String(state.muted));
    },
  };
}
