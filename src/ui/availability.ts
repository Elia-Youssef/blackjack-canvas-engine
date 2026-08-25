/**
 * Which controls the current screen is offering, and why the rest are greyed.
 * `BJ-18`, and the `BJ-15` review's `MIN-4`.
 *
 * Every one of these readings already existed at `BJ-18`, spread across the
 * three components that render the controls. This file is not a new rule: it is
 * the same readings moved to one place, because item `G1`'s mirror has to state
 * the same answers in words and a second derivation of "why is Double greyed"
 * is exactly the defect the components' own headers warn about. `actions.ts`,
 * `betting.ts` and `screens.ts` all call this now, so a control and the sentence
 * describing it cannot disagree.
 *
 * **Nothing here decides a rule.** Every refusal is asked of `core/`:
 * `hitRefusal`, `doubleRefusal`, `splitRefusal` and `surrenderRefusal` from
 * `table.ts`, `canFund`, `chipEnabled` and `canEnter` from `wallet.ts`. What
 * this file adds is the order the two layers are asked in, which is the order
 * `table.ts` applies them in, and a label for each control.
 *
 * **Stand still has no predicate behind it**, for the reason `actions.ts` gave
 * at `BJ-15` and which has not changed: SPEC 4.5 gives Stand one condition,
 * "hand live", and the phase gate is the whole of it because the active hand
 * during `playerTurn` is live by construction. Inventing one here would be the
 * second reading this file exists to remove.
 */

import {
  doubleRefusal,
  hitRefusal,
  splitRefusal,
  surrenderRefusal,
  type ActionContext,
  type RejectionReason,
  type TableReadout,
} from '../core/table';
import type { HandInPlay, PlayerAction } from '../core/types';
import {
  CHIP_DENOMINATIONS,
  TABLES,
  canEnter,
  canFund,
  chipEnabled,
  tableLimits,
  type ChipDenomination,
  type TableId,
} from '../core/wallet';

import { chips as formatChips } from './format';
import { tableText } from './text';

/** One control, its label, and the reason it is unavailable, or `null`. */
export interface ControlAvailability {
  /** The control's own key, as its `data-` attribute spells it. */
  readonly key: string;
  /** The label the control carries, which is also what the mirror names it by. */
  readonly label: string;
  /** `null` when the control is available right now. */
  readonly refusal: RejectionReason | null;
}

/**
 * SPEC 4.5's five actions, as a type.
 *
 * `takeInsurance` and `declineInsurance` are `PlayerAction`s as well, because
 * SPEC 8's journal records them, but they are not hand actions: SPEC 4.7 puts
 * both on the insurance screen, where `insuranceRefusal` answers for them.
 * Excluding them by name rather than listing the five means a sixth hand action
 * added to the union is a compile error here rather than a control nobody wrote.
 */
export type HandAction = Exclude<PlayerAction, 'takeInsurance' | 'declineInsurance'>;

/** SPEC 4.5's five actions, in SPEC 4.5's order, with their labels. */
export const ACTION_LABELS: Readonly<Record<HandAction, string>> = Object.freeze({
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double',
  split: 'Split',
  surrender: 'Surrender',
});

/** The five actions in the order `actions.ts` renders them. */
export const HAND_ACTIONS: readonly HandAction[] = Object.freeze([
  'hit',
  'stand',
  'double',
  'split',
  'surrender',
]);

/**
 * Why one hand action is unavailable on this hand, or `null`.
 *
 * The availability layer is asked before the wallet, which is the order
 * `table.ts` applies them in: a hand that cannot be split at all should say so
 * rather than complain about money.
 */
export function actionRefusal(
  action: HandAction,
  hand: HandInPlay,
  context: ActionContext,
  chips: number,
): RejectionReason | null {
  switch (action) {
    case 'hit':
      return hitRefusal(hand);
    case 'stand':
      return null;
    case 'double':
      return doubleRefusal(hand, context) ?? (canFund(hand.wager, chips) ? null : 'insufficient-chips');
    case 'split':
      return splitRefusal(hand, context) ?? (canFund(hand.wager, chips) ? null : 'insufficient-chips');
    case 'surrender':
      return surrenderRefusal(hand, context);
  }
}

/**
 * SPEC 4.7's one refusal on the offer screen.
 *
 * Even money is offered regardless of balance and insurance is not: `table.ts`
 * takes an even-money stake with the shortfall deferred and refuses an ordinary
 * one the balance cannot cover, so the test is guarded on `evenMoney` rather
 * than applied to both.
 */
export function insuranceRefusal(
  offer: { readonly stake: number; readonly evenMoney: boolean },
  chips: number,
): RejectionReason | null {
  return !offer.evenMoney && chips < offer.stake ? 'insufficient-chips' : null;
}

/** The label one chip control carries. SPEC 4.11's four denominations. */
export function chipLabel(denomination: ChipDenomination): string {
  return formatChips(denomination);
}

/** The label one table button carries. SPEC 6's name and its two limits. */
export function tableLabel(id: TableId): string {
  const limits = tableLimits(id);
  return `${tableText(id)} ${formatChips(limits.minimum)} to ${formatChips(limits.maximum)}`;
}

/**
 * Every control the current screen offers, with the reason for each greyed one.
 *
 * The list is the current screen's alone. A screen with no unavailable control
 * returns its controls with `null` refusals, and a phase that offers no control
 * at all, which is every one of SPEC 10's five timed phases, returns nothing.
 */
export function screenAvailability(readout: TableReadout): readonly ControlAvailability[] {
  const { phase, hands, rules, splits, wallet, table } = readout;
  switch (phase.kind) {
    case 'start':
      return TABLES.map((limits) => ({
        key: `table-${limits.id}`,
        label: tableLabel(limits.id),
        refusal: canEnter(limits.id, wallet.bestBalance, wallet.chips) ? null : 'table-locked',
      }));

    case 'betting': {
      const limits = tableLimits(table);
      return CHIP_DENOMINATIONS.map((denomination) => ({
        key: `chip-${String(denomination)}`,
        label: chipLabel(denomination),
        refusal: chipEnabled(denomination, limits, wallet.chips) ? null : 'above-ceiling',
      }));
    }

    case 'playerTurn': {
      const hand = hands[phase.activeHand];
      if (hand === undefined) {
        return [];
      }
      const context: ActionContext = { rules, splits };
      return HAND_ACTIONS.map((action) => ({
        key: action,
        label: ACTION_LABELS[action],
        refusal: actionRefusal(action, hand, context, wallet.chips),
      }));
    }

    case 'insurance':
      return [
        {
          key: 'take-insurance',
          label: 'Take',
          refusal: insuranceRefusal(phase.offer, wallet.chips),
        },
        { key: 'decline-insurance', label: 'Decline', refusal: null },
      ];

    case 'roundResult':
      return [{ key: 'next-hand', label: 'Next Hand', refusal: null }];

    case 'bustOut':
      return [{ key: 'reset-bankroll', label: 'Free reset', refusal: null }];

    case 'dealing':
    case 'peek':
    case 'reveal':
    case 'dealerTurn':
    case 'settling':
      return [];
  }
}

/** Only the greyed ones, which is what the mirror lists and why. */
export function unavailableNow(
  readout: TableReadout,
): readonly { readonly label: string; readonly refusal: RejectionReason }[] {
  const found: { label: string; refusal: RejectionReason }[] = [];
  for (const control of screenAvailability(readout)) {
    if (control.refusal !== null) {
      found.push({ label: control.label, refusal: control.refusal });
    }
  }
  return found;
}
