/**
 * SPEC 4.5's five player actions, as five real buttons. Item `M1`.
 *
 * **Every refusal is asked of `core/`, and none is re-derived here.**
 * `table.ts` exports `hitRefusal`, `doubleRefusal`, `splitRefusal` and
 * `surrenderRefusal` for exactly this: its own header says the chrome "has to
 * grey a control out before the player presses it", and the funding half comes
 * from `wallet.ts`'s `canFund`. A second reading of SPEC 4.5, 4.6 or 4.8 in this
 * file would agree with the first on every hand until a house rule moved, which
 * is the failure those exports exist to prevent.
 *
 * **`BJ-18` moved the composition of those calls to `src/ui/availability.ts`**,
 * unchanged, because item `G4`'s mirror has to state the same answers in words:
 * the reason Double is greyed is now read once and rendered twice, on the
 * control and in the mirror, rather than derived in each place.
 *
 * **Stand is the one action with no predicate behind it, and that is deliberate
 * rather than an omission.** SPEC 4.5 gives Stand one condition, "hand live",
 * and `table.ts` applies no hand-level refusal to it: the phase gate is the
 * whole of the rule, because the active hand during `playerTurn` is live by
 * construction. Inventing a `standRefusal` here would be the second reading the
 * paragraph above is about. `strategy.ts` takes the same position and reads
 * `state === 'live'`; the two agree today, and the day they stop agreeing is the
 * day `table.ts` grows the predicate and both call it.
 *
 * **A disabled control carries its reason.** SPEC 4.11 asks for a reason on
 * every refusal, and a greyed button with no explanation is the half of that
 * sentence a player cannot act on, so the sentence rides on `title` and the
 * machine's own reason value on `data-reason`.
 */

import type { ActionContext } from '../../core/table';
import type { PlayerAction } from '../../core/types';
import { ACTION_LABELS, HAND_ACTIONS, actionRefusal } from '../availability';
import { button, el, setAttribute, setDisabled, setHidden } from '../dom';
import type { ChromeActions, ChromeState, Component } from '../state';
import { reasonText } from '../text';

/** Build the action bar. Visible at SPEC 10's `playerTurn` and nowhere else. */
export function createActions(actions: ChromeActions): Component {
  const controls = new Map<PlayerAction, HTMLButtonElement>();
  const root = el('div', {
    className: 'bj-actions',
    attributes: { 'data-screen': 'player-turn', role: 'group', 'aria-label': 'Hand actions' },
  });

  for (const action of HAND_ACTIONS) {
    const control = button(
      ACTION_LABELS[action],
      () => {
        actions.queue({ kind: action });
      },
      { className: 'bj-button', attributes: { 'data-action': action } },
    );
    controls.set(action, control);
    root.append(control);
  }

  return {
    root,
    update(state: ChromeState): void {
      const { phase, hands, rules, splits, wallet } = state.readout;
      setHidden(root, phase.kind !== 'playerTurn');
      if (phase.kind !== 'playerTurn') {
        return;
      }
      const hand = hands[phase.activeHand];
      if (hand === undefined) {
        return;
      }
      const context: ActionContext = { rules, splits };
      for (const action of HAND_ACTIONS) {
        const control = controls.get(action);
        if (control === undefined) {
          continue;
        }
        const refusal = actionRefusal(action, hand, context, wallet.chips);
        setDisabled(
          control,
          refusal !== null,
          refusal === null ? null : reasonText(refusal),
          ACTION_LABELS[action],
        );
        setAttribute(control, 'data-reason', refusal);
      }
    },
  };
}
