/**
 * SPEC 11's continuous readouts. Items `C5` and `M1`.
 *
 * "Always visible, in the chrome, where no overlay can cover them." Fourteen of
 * them, in SPEC 11's own order, each a real DOM element with a real label:
 * chips, wager, active hand value, dealer visible hand value, cards remaining,
 * shoe penetration, table name and limits, hands played, wins, losses, pushes,
 * blackjacks, best chip balance, current streak.
 *
 * **"Where no overlay can cover them" is geometry, not layering.** The shell in
 * `layout.ts` puts this panel in its own grid row and the overlay host inside
 * the row below it, so an overlay has no way to reach this element's box short
 * of leaving the flow entirely. `C5` measures exactly that, in rendered pixels.
 *
 * **The dealer's value counts face-up cards only** while the hole card is down,
 * which SPEC 11 states and which is `handValue(readout.dealerVisible)` rather
 * than a second rule about which cards count: the machine publishes the face-up
 * cards and a count of the concealed ones, so the arithmetic cannot see a card
 * the player cannot.
 */

import { handValue } from '../../core/hand';
import { tableLimits } from '../../core/wallet';
import { el, setText } from '../dom';
import { NOTHING_YET, chips, percent } from '../format';
import type { ChromeState, Component } from '../state';
import { tableText } from '../text';

/** One readout: a stable key, its label, and how its value is read. */
interface ReadoutRow {
  readonly key: string;
  readonly label: string;
  readonly value: (state: ChromeState) => string;
}

/**
 * The hand SPEC 11 calls "active", or `null` when there is not one.
 *
 * During the player's turn it is the hand the machine is asking about, which is
 * the only reading SPEC 4.6's left-to-right play allows. Outside that phase a
 * single unsplit hand is still unambiguous and is shown; a settled split is not,
 * and SPEC 12's round result is where each of its hands is printed with its own
 * value, so this reads blank rather than picking one arbitrarily.
 */
function activeHandValue(state: ChromeState): string {
  const { phase, hands } = state.readout;
  let hand = hands.length === 1 ? hands[0] : undefined;
  if (phase.kind === 'playerTurn') {
    hand = hands[phase.activeHand];
  }
  if (hand === undefined || hand.cards.length === 0) {
    return NOTHING_YET;
  }
  return chips(handValue(hand.cards).total);
}

/** SPEC 11's list, in SPEC 11's order. */
const ROWS: readonly ReadoutRow[] = Object.freeze([
  { key: 'chips', label: 'Chips', value: (s) => chips(s.readout.wallet.chips) },
  { key: 'wager', label: 'Wager', value: (s) => chips(s.readout.wallet.wager) },
  { key: 'hand-value', label: 'Hand', value: activeHandValue },
  {
    key: 'dealer-value',
    label: 'Dealer',
    value: (s) =>
      s.readout.dealerVisible.length === 0
        ? NOTHING_YET
        : chips(handValue(s.readout.dealerVisible).total),
  },
  { key: 'cards-remaining', label: 'Cards left', value: (s) => chips(s.readout.shoe.remaining) },
  { key: 'penetration', label: 'Penetration', value: (s) => percent(s.readout.shoe.penetration) },
  {
    key: 'table',
    label: 'Table',
    value: (s) => {
      const limits = tableLimits(s.readout.table);
      return `${tableText(limits.id)} ${chips(limits.minimum)} to ${chips(limits.maximum)}`;
    },
  },
  { key: 'hands-played', label: 'Hands', value: (s) => chips(s.statistics.session.handsPlayed) },
  { key: 'wins', label: 'Wins', value: (s) => chips(s.statistics.session.wins) },
  { key: 'losses', label: 'Losses', value: (s) => chips(s.statistics.session.losses) },
  { key: 'pushes', label: 'Pushes', value: (s) => chips(s.statistics.session.pushes) },
  { key: 'blackjacks', label: 'Blackjacks', value: (s) => chips(s.statistics.session.blackjacks) },
  { key: 'best-balance', label: 'Best', value: (s) => chips(s.statistics.bestBalance) },
  { key: 'streak', label: 'Streak', value: (s) => chips(s.statistics.streak) },
]);

/** Build the readout panel. */
export function createReadouts(): Component {
  const values = new Map<string, HTMLElement>();
  const list = el('dl', { className: 'bj-readouts__list' });

  for (const row of ROWS) {
    const value = el('dd', { className: 'bj-readout__value', text: NOTHING_YET });
    values.set(row.key, value);
    list.append(
      el('div', {
        className: 'bj-readout',
        attributes: { 'data-readout': row.key },
        children: [el('dt', { className: 'bj-readout__label', text: row.label }), value],
      }),
    );
  }

  const root = el('section', {
    className: 'bj-readouts',
    attributes: { 'aria-label': 'Table readouts' },
    children: [list],
  });

  return {
    root,
    update(state: ChromeState): void {
      for (const row of ROWS) {
        const node = values.get(row.key);
        if (node !== undefined) {
          setText(node, row.value(state));
        }
      }
    },
  };
}

/** The readout keys, so a test can require the whole of SPEC 11's list. */
export const READOUT_KEYS: readonly string[] = Object.freeze(ROWS.map((row) => row.key));
