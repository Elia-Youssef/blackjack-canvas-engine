/**
 * SPEC 4.11's betting controls. Item `B15`, Critical.
 *
 *   "A chip tap that would carry the wager above min(table maximum, balance) is
 *    rejected with a reason and changes nothing; it is never silently clamped,
 *    and a chip whose denomination alone exceeds the ceiling renders disabled.
 *    Only Max and Repeat compute a value and both compute a legal multiple of
 *    10. Deal is blocked below the table minimum rather than raised to it."
 *
 * Every one of those rules already exists, in `core/wallet.ts`, decided once and
 * unit tested at `BJ-6`. **This file binds them and rebuilds none of them.** It
 * asks `chipEnabled` which chips to disable, and it asks nothing else: the tap,
 * Clear, Max, Repeat and Deal all go through `table.queue` and are answered by
 * the machine, so the wager on screen is the wager the wallet holds and there is
 * no second copy of it here to drift.
 *
 * **Two different things, and SPEC 4.11 distinguishes them.** A chip whose
 * *denomination alone* exceeds `min(tableMax, chips)` can never be wagered at
 * this table and renders `disabled`, which is the platform's own unavailability
 * and needs no hit test. A chip whose denomination fits but whose *tap* would
 * carry the wager past the ceiling stays enabled and is **rejected** when
 * pressed, with the reason surfaced. Disabling the second one would hide a
 * refusal the player is entitled to attempt, and clamping it would put a wager
 * on the board that the player did not build.
 *
 * **Deal stays pressable.** SPEC 4.11 says Deal is "blocked ... with a reason
 * surfaced to the player", and a control that does nothing when pressed surfaces
 * nothing. The refusal comes back from `dealRefusal` through the machine and
 * lands in the notice, which is what "blocked below the table minimum rather
 * than raised to it" looks like from the player's side: the wager they built is
 * still on the board, unchanged, with a sentence explaining it.
 */

import {
  CHIP_DENOMINATIONS,
  chipEnabled,
  tableLimits,
  type ChipDenomination,
} from '../../core/wallet';
import { chipLabel } from '../availability';
import { button, el, setDisabled, setHidden } from '../dom';
import type { ChromeActions, ChromeState, Component } from '../state';

/** The label the disabled chips carry, per SPEC 4.11's ceiling. */
const OVER_CEILING = 'This chip is more than the table maximum or your balance allows.';

/** Build the betting bar. Visible at SPEC 10's `betting` phase and nowhere else. */
export function createBetting(actions: ChromeActions): Component {
  const chipButtons = new Map<ChipDenomination, HTMLButtonElement>();

  const rack = el('div', {
    className: 'bj-chips',
    attributes: { role: 'group', 'aria-label': 'Chips' },
  });
  for (const denomination of CHIP_DENOMINATIONS) {
    const control = button(
      chipLabel(denomination),
      () => {
        actions.queue({ kind: 'tapChip', chip: denomination });
      },
      {
        className: 'bj-chip',
        attributes: { 'data-chip': String(denomination) },
      },
    );
    chipButtons.set(denomination, control);
    rack.append(control);
  }

  const clear = button('Clear', () => { actions.queue({ kind: 'clear' }); }, {
    className: 'bj-button',
    attributes: { 'data-control': 'clear' },
  });
  const repeat = button('Repeat', () => { actions.queue({ kind: 'repeat' }); }, {
    className: 'bj-button',
    attributes: { 'data-control': 'repeat' },
  });
  const max = button('Max', () => { actions.queue({ kind: 'max' }); }, {
    className: 'bj-button',
    attributes: { 'data-control': 'max' },
  });
  const deal = button('Deal', () => { actions.queue({ kind: 'deal' }); }, {
    className: 'bj-button bj-button--primary',
    attributes: { 'data-control': 'deal' },
  });
  const changeTable = button('Change Table', () => { actions.queue({ kind: 'changeTable' }); }, {
    className: 'bj-button',
    attributes: { 'data-control': 'change-table' },
  });

  const root = el('div', {
    className: 'bj-betting',
    attributes: { 'data-screen': 'betting', 'aria-label': 'Betting controls', role: 'group' },
    children: [
      rack,
      el('div', {
        className: 'bj-betting__buttons',
        children: [clear, repeat, max, deal, changeTable],
      }),
    ],
  });

  return {
    root,
    update(state: ChromeState): void {
      setHidden(root, state.readout.phase.kind !== 'betting');

      const limits = tableLimits(state.readout.table);
      const balance = state.readout.wallet.chips;
      for (const [denomination, control] of chipButtons) {
        // SPEC 4.11's one disabled case, asked of the wallet and not re-derived.
        const enabled = chipEnabled(denomination, limits, balance);
        setDisabled(control, !enabled, OVER_CEILING, chipLabel(denomination));
      }
    },
  };
}
