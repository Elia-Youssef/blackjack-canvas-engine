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

import {
  doubleRefusal,
  hitRefusal,
  splitRefusal,
  surrenderRefusal,
  type ActionContext,
  type RejectionReason,
} from '../../core/table';
import type { HandInPlay, PlayerAction } from '../../core/types';
import { canFund } from '../../core/wallet';
import { button, el, setAttribute, setDisabled, setHidden } from '../dom';
import type { ChromeActions, ChromeState, Component } from '../state';
import { reasonText } from '../text';

/** One control: the intent it queues, its label, and why it may be unavailable. */
interface ActionRow {
  readonly action: PlayerAction;
  readonly label: string;
  /** `null` when the action is available on this hand right now. */
  readonly refusal: (hand: HandInPlay, context: ActionContext, chips: number) => RejectionReason | null;
}

/**
 * SPEC 4.5's table, in its order.
 *
 * Double and Split ask the availability rule first and the balance second,
 * which is the order `table.ts` applies them in: the availability layer sits
 * above the wallet, and a hand that cannot be split at all should say so rather
 * than complain about money.
 */
const ROWS: readonly ActionRow[] = Object.freeze([
  { action: 'hit', label: 'Hit', refusal: (hand) => hitRefusal(hand) },
  { action: 'stand', label: 'Stand', refusal: () => null },
  {
    action: 'double',
    label: 'Double',
    refusal: (hand, context, chips) =>
      doubleRefusal(hand, context) ?? (canFund(hand.wager, chips) ? null : 'insufficient-chips'),
  },
  {
    action: 'split',
    label: 'Split',
    refusal: (hand, context, chips) =>
      splitRefusal(hand, context) ?? (canFund(hand.wager, chips) ? null : 'insufficient-chips'),
  },
  {
    action: 'surrender',
    label: 'Surrender',
    refusal: (hand, context) => surrenderRefusal(hand, context),
  },
]);

/** Build the action bar. Visible at SPEC 10's `playerTurn` and nowhere else. */
export function createActions(actions: ChromeActions): Component {
  const controls = new Map<PlayerAction, HTMLButtonElement>();
  const root = el('div', {
    className: 'bj-actions',
    attributes: { 'data-screen': 'player-turn', role: 'group', 'aria-label': 'Hand actions' },
  });

  for (const row of ROWS) {
    const control = button(
      row.label,
      () => {
        actions.queue({ kind: row.action });
      },
      { className: 'bj-button', attributes: { 'data-action': row.action } },
    );
    controls.set(row.action, control);
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
      for (const row of ROWS) {
        const control = controls.get(row.action);
        if (control === undefined) {
          continue;
        }
        const refusal = row.refusal(hand, context, wallet.chips);
        setDisabled(control, refusal !== null, refusal === null ? null : reasonText(refusal));
        setAttribute(control, 'data-reason', refusal);
      }
    },
  };
}
