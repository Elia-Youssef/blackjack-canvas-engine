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
 * describing it cannot disagree. `betting.ts` reads `chipRefusal` for exactly
 * that reason (`AUDIT-2`, finding `Z5-06`): it used to take only `chipLabel`
 * from here and pair the predicate with the reason again for itself, which left
 * the chip row as the one row where the guard was not in place.
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
  isUnlocked,
  tableLimits,
  type ChipDenomination,
  type TableId,
  type TableLimits,
} from '../core/wallet';

import { chips as formatChips } from './format';
import { tableText, type ChooserRefusal, type DisplayReason, type ReasonFigures } from './text';

/** One control, its label, and the reason it is unavailable, or `null`. */
export interface ControlAvailability {
  /** The control's own key, as its `data-` attribute spells it. */
  readonly key: string;
  /** The label the control carries, which is also what the mirror names it by. */
  readonly label: string;
  /** `null` when the control is available right now. */
  readonly refusal: DisplayReason | null;
  /**
   * The numbers this control's sentence names, or `null` where it names none.
   *
   * `AUDIT-2`, finding `J2-03`. Derived here rather than at each renderer,
   * because the greyed button's accessible name and the mirror's list are two
   * surfaces for one sentence and the mirror reads this record rather than the
   * screen: without the figures travelling with the refusal, one of the two
   * would have to build the sentence from numbers the other did not have.
   */
  readonly figures: ReasonFigures | null;
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

/**
 * SPEC 4.5's five actions, in SPEC 4.5's order, with their labels.
 *
 * **These are the control-row labels, and `double` is deliberately not the name
 * `src/ui/text.ts`'s `actionText` gives it.** SPEC.md draws the action row as
 * "Hit / Stand / Double / Split / Surrender", and SPEC 4.5's action table calls
 * the same action "Double Down"; the button register follows the row and the
 * prose register follows the table, so the coach verdict and the history line
 * say "Double Down" while the button says "Double". The other four agree. Both
 * spellings have a spec source, so unifying them in either direction drops one
 * of the two and is a question for whoever owns the spec, not a tidy-up.
 */
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
 *
 * The funding half goes through `canFund` like every other funding gate in the
 * game, so this layer and the machine cannot drift into offering a control the
 * machine then refuses (`AUDIT-2` finding `Z1-02`).
 */
export function insuranceRefusal(
  offer: { readonly stake: number; readonly evenMoney: boolean },
  chips: number,
): RejectionReason | null {
  return !offer.evenMoney && !canFund(offer.stake, chips) ? 'insufficient-chips' : null;
}

/** The label one chip control carries. SPEC 4.11's four denominations. */
export function chipLabel(denomination: ChipDenomination): string {
  return formatChips(denomination);
}

/**
 * Why the betting bar greys one chip, or `null`. `AUDIT-2`, finding `Z5-06`.
 *
 * The predicate is `core/wallet.ts`'s `chipEnabled` and the reason is the one
 * `src/ui/text.ts` prints for it, and this is the only place the two are put
 * together. The chip row used to be the one row where they were not: the mirror
 * paired them here and `src/ui/components/betting.ts` paired them again for
 * itself, so the greyed chip and the sentence describing it agreed only because
 * both happened to spell the same predicate and the same literal, which is the
 * defect this whole module exists to remove.
 */
export function chipRefusal(
  denomination: ChipDenomination,
  limits: TableLimits,
  chips: number,
): DisplayReason | null {
  return chipEnabled(denomination, limits, chips) ? null : 'chip-over-ceiling';
}

/** The label one table button carries. SPEC 6's name and its two limits. */
export function tableLabel(id: TableId): string {
  const limits = tableLimits(id);
  return `${tableText(id)} ${formatChips(limits.minimum)} to ${formatChips(limits.maximum)}`;
}

/**
 * Why the start screen greys one table, or `null` when it does not. `BJ-21`.
 *
 * SPEC 6 gives entry two conditions and the machine answers both with one
 * `table-locked`, which is right for a machine and wrong for a player: "not
 * open to you yet" reads as "win more" to somebody whose only problem is that
 * today's balance does not cover the minimum. This is the split, and it is a
 * derivation rather than a rule: **both readings are `core/wallet.ts`'s own
 * predicates**, `canEnter` deciding whether the table is enterable at all and
 * `isUnlocked` deciding which of the two conditions failed. Nothing here
 * compares a balance to a threshold.
 *
 * The unlock is asked first because it is the condition that outranks the
 * other: a table whose threshold has never been reached is shut whatever
 * today's balance is, while an unlocked table the player cannot afford right
 * now is one good round away.
 */
export function tableRefusal(
  id: TableId,
  bestBalance: number,
  chips: number,
): ChooserRefusal | null {
  if (canEnter(id, bestBalance, chips)) {
    return null;
  }
  return isUnlocked(id, bestBalance) ? 'table-unaffordable' : 'table-not-unlocked';
}

/**
 * SPEC 6's two numbers for one table: its unlock threshold and the mark the
 * threshold is measured against. `AUDIT-2`, finding `J2-03`.
 *
 * No figure is written twice: the threshold is `core/wallet.ts`'s own, and the
 * mark is the machine's readout. This file still compares nothing.
 */
export function tableFigures(id: TableId, bestBalance: number): ReasonFigures {
  return { unlocksAt: tableLimits(id).unlocksAt, bestBalance };
}

/**
 * The controls of the current screen that can be greyed, with the reason for
 * each one that is.
 *
 * **Not every control the screen offers**, and the difference matters to a
 * reader deciding what this is safe to build on (`AUDIT-2`, finding `Z5-06`):
 * `'betting'` returns the four chips and not Clear, Repeat, Max, Deal or Change
 * Table; `'start'` returns the three table buttons and not Start; `'bustOut'`
 * returns the free reset and not the drop-table buttons beside it. Those are the
 * controls no rule ever greys, and the one consumer, `unavailableNow`, wants the
 * greyable subset. What is complete here is the other direction, which is the
 * one item `G1` needs: every `setDisabled` site in the chrome is covered, so the
 * mirror lists every greyed control there is. The full per-screen census is
 * `tests/browser/support/controls.ts`'s `SCREEN_CONTROLS`, which item `D2`
 * grades against a different question.
 *
 * A screen with no unavailable control returns its controls with `null`
 * refusals, and a phase that offers no control at all, which is every one of
 * SPEC 10's five timed phases, returns nothing.
 */
export function screenAvailability(readout: TableReadout): readonly ControlAvailability[] {
  const { phase, hands, rules, splits, wallet, table } = readout;
  switch (phase.kind) {
    case 'start':
      return TABLES.map((limits) => ({
        key: `table-${limits.id}`,
        label: tableLabel(limits.id),
        refusal: tableRefusal(limits.id, wallet.bestBalance, wallet.chips),
        // SPEC 6's threshold and the mark it is measured against, both read
        // from the places that own them. Carried on every table row rather than
        // only on the locked ones, because which arm refused is the sentence's
        // question and not this map's.
        figures: tableFigures(limits.id, wallet.bestBalance),
      }));

    case 'betting': {
      const limits = tableLimits(table);
      return CHIP_DENOMINATIONS.map((denomination) => ({
        key: `chip-${String(denomination)}`,
        label: chipLabel(denomination),
        figures: null,
        // The display-only split, on `tableRefusal`'s precedent: this is the
        // denomination against the table rather than a tap against the
        // ceiling, and the two are different facts about the same word.
        refusal: chipRefusal(denomination, limits, wallet.chips),
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
        figures: null,
      }));
    }

    case 'insurance':
      return [
        {
          key: 'take-insurance',
          label: 'Take',
          refusal: insuranceRefusal(phase.offer, wallet.chips),
          figures: null,
        },
        { key: 'decline-insurance', label: 'Decline', refusal: null, figures: null },
      ];

    case 'roundResult':
      return [{ key: 'next-hand', label: 'Next Hand', refusal: null, figures: null }];

    case 'bustOut':
      return [{ key: 'reset-bankroll', label: 'Free reset', refusal: null, figures: null }];

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
): readonly {
  readonly label: string;
  readonly refusal: DisplayReason;
  readonly figures: ReasonFigures | null;
}[] {
  const found: { label: string; refusal: DisplayReason; figures: ReasonFigures | null }[] = [];
  for (const control of screenAvailability(readout)) {
    if (control.refusal !== null) {
      found.push({ label: control.label, refusal: control.refusal, figures: control.figures });
    }
  }
  return found;
}
