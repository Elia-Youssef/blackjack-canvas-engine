/**
 * The three screens that are neither betting nor the player's turn: SPEC 10's
 * start screen, SPEC 4.7's insurance offer and SPEC 4.12's bust-out. Item `M1`.
 *
 * All three are real DOM, all three are hidden outside their own phase, and none
 * of them is drawn on the canvas. A phase with no controls of its own, which is
 * every one of SPEC 10's five timed phases, shows none of these: the legality
 * table gives those phases no legal intent at all, so a control left live across
 * one of them would be a click aimed at a screen that has already gone.
 *
 * **No acceptance item is claimed for the start screen's table buttons.** SPEC 6
 * puts the choice on the start screen and SPEC 10 routes Change Table back to
 * it, so a start screen with no choice on it would make Change Table a dead end;
 * they are built for that reason. Item `C4` at `BJ-20` grades this screen end to
 * end, including the Change Table edge, and the verdict is that part's.
 *
 * **Even money is offered regardless of balance, and insurance is not.** SPEC
 * 4.7 gives the two availability rules and `table.ts` applies them at the intent:
 * an ordinary stake is refused when the balance cannot cover it, an even-money
 * stake is taken with the shortfall deferred. The Take control follows the same
 * split, which is why the balance test below is guarded on `evenMoney` rather
 * than applied to both.
 */

import { bustOut, tableLimits, type TableId, TABLES } from '../../core/wallet';
import { insuranceRefusal, tableLabel, tableRefusal } from '../availability';
import { button, el, empty, setAttribute, setDisabled, setHidden, setText } from '../dom';
import { chips as formatChips } from '../format';
import type { ChromeActions, ChromeState, Component } from '../state';
import { offerText, reasonText, tableText } from '../text';

/**
 * SPEC 10's start screen: pick a table, then Start.
 *
 * A locked or unaffordable table is disabled with SPEC 6's reason on it. The
 * machine refuses `chooseTable` for the same table with `table-locked`, so the
 * disabled state is a preview of an answer rather than a rule of its own.
 *
 * **The displayed reason is split by cause. `BJ-21`.** SPEC 6 gives entry two
 * conditions and the machine answers both with the one word `table-locked`,
 * which leaves a player who merely cannot cover today's minimum reading "that
 * table is not open to you yet" and concluding they have to win their way to a
 * threshold they have already passed. `tableRefusal` derives which of the two
 * failed, from `core/wallet.ts`'s own predicates, and the sentence follows;
 * the machine's refusal kinds are untouched, and `chooseTable` still answers
 * `table-locked` for either.
 */
export function createStartScreen(actions: ChromeActions): Component {
  const tableButtons = new Map<TableId, HTMLButtonElement>();
  const choices = el('div', {
    className: 'bj-tables',
    attributes: { role: 'group', 'aria-label': 'Tables' },
  });

  for (const limits of TABLES) {
    const control = button(
      tableLabel(limits.id),
      () => {
        actions.queue({ kind: 'chooseTable', table: limits.id });
      },
      { className: 'bj-button bj-table', attributes: { 'data-table': limits.id } },
    );
    tableButtons.set(limits.id, control);
    choices.append(control);
  }

  const start = button('Start', () => { actions.queue({ kind: 'start' }); }, {
    className: 'bj-button bj-button--primary',
    attributes: { 'data-control': 'start' },
  });

  const root = el('div', {
    className: 'bj-screen bj-screen--start',
    attributes: { 'data-screen': 'start' },
    children: [
      el('h2', { className: 'bj-screen__title', text: 'Choose a table' }),
      choices,
      start,
    ],
  });

  return {
    root,
    update(state: ChromeState): void {
      setHidden(root, state.readout.phase.kind !== 'start');
      const { bestBalance, chips } = state.readout.wallet;
      for (const [id, control] of tableButtons) {
        const refusal = tableRefusal(id, bestBalance, chips);
        setDisabled(
          control,
          refusal !== null,
          refusal === null ? null : reasonText(refusal),
          tableLabel(id),
        );
        setAttribute(control, 'aria-pressed', String(id === state.readout.table));
      }
    },
  };
}

/** SPEC 4.7's offer: take it, or decline it. The decision point has no timer. */
export function createInsuranceScreen(actions: ChromeActions): Component {
  const prompt = el('p', { className: 'bj-screen__prompt' });
  const take = button('Take', () => { actions.queue({ kind: 'takeInsurance' }); }, {
    className: 'bj-button bj-button--primary',
    attributes: { 'data-control': 'take-insurance' },
  });
  const decline = button('Decline', () => { actions.queue({ kind: 'declineInsurance' }); }, {
    className: 'bj-button',
    attributes: { 'data-control': 'decline-insurance' },
  });

  const root = el('div', {
    className: 'bj-screen bj-screen--insurance',
    attributes: { 'data-screen': 'insurance' },
    children: [prompt, el('div', { className: 'bj-screen__buttons', children: [take, decline] })],
  });

  return {
    root,
    update(state: ChromeState): void {
      const { phase, wallet } = state.readout;
      setHidden(root, phase.kind !== 'insurance');
      if (phase.kind !== 'insurance') {
        return;
      }
      const { offer } = phase;
      // The sentence and the availability rule are both read from one place, so
      // the prompt the screen prints and the prompt the mirror states are the
      // same string and the greyed Take and the mirror's reason are one reading.
      setText(prompt, offerText(offer));
      const refusal = insuranceRefusal(offer, wallet.chips);
      setDisabled(take, refusal !== null, refusal === null ? null : reasonText(refusal), 'Take');
      setAttribute(take, 'data-even-money', String(offer.evenMoney));
    },
  };
}

/** SPEC 4.12: drop to a lower table that the balance still affords, or reset. */
export function createBustOutScreen(actions: ChromeActions): Component {
  const message = el('p', { className: 'bj-screen__prompt' });
  const drops = el('div', {
    className: 'bj-screen__buttons',
    attributes: { role: 'group', 'aria-label': 'Lower tables' },
  });
  const reset = button('Free reset', () => { actions.queue({ kind: 'resetBankroll' }); }, {
    className: 'bj-button bj-button--primary',
    attributes: { 'data-control': 'reset-bankroll' },
  });

  const root = el('div', {
    className: 'bj-screen bj-screen--bust-out',
    attributes: { 'data-screen': 'bust-out' },
    children: [
      el('h2', { className: 'bj-screen__title', text: 'Out at this table' }),
      message,
      drops,
      reset,
    ],
  });

  let shown: string | null = null;

  return {
    root,
    update(state: ChromeState): void {
      const { phase, table, wallet } = state.readout;
      setHidden(root, phase.kind !== 'bustOut');
      if (phase.kind !== 'bustOut') {
        return;
      }
      const offer = bustOut(table, wallet.bestBalance, wallet.chips);
      setText(
        message,
        `The minimum here is ${formatChips(tableLimits(table).minimum)} and you hold ` +
          `${formatChips(wallet.chips)}. The reset is free and restores ` +
          `${formatChips(offer.resetTo)} at ${tableText(offer.resetTable)}.`,
      );

      // The list of lower tables only moves when the balance or the table does,
      // so it is rebuilt on a change rather than on every frame.
      const key = offer.lowerTables.join(',');
      if (key !== shown) {
        shown = key;
        empty(drops);
        for (const id of offer.lowerTables) {
          drops.append(
            button(
              `Drop to ${tableText(id)}`,
              () => {
                actions.queue({ kind: 'dropTable', table: id });
              },
              { className: 'bj-button', attributes: { 'data-drop-table': id } },
            ),
          );
        }
      }
    },
  };
}
