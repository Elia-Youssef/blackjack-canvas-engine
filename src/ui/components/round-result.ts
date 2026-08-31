/**
 * SPEC 12's round result. Item `C8`, Major.
 *
 *   "The round result shows, per hand: the outcome and its reason, both hand
 *    values, the chip delta on that hand, the insurance result where one exists,
 *    the coach verdict when the coach is on, and the resulting balance."
 *
 * Seven things, and the machine carries four of them. `SettledHand` is the
 * wager, the credit, SPEC 4.10's outcome and the rung that decided it, and
 * `RoundResult` adds the side wager and the resulting balance. **The two hand
 * values are computed here rather than read off that record**, which is
 * `types.ts`'s own instruction: the cards are still on the felt at SPEC 10's
 * round result, because `table.ts` sweeps at `Next Hand` and not at the
 * settlement, so `handValue(readout.hands[i].cards)` and
 * `handValue(readout.dealerVisible)` are the values themselves rather than a
 * copy of them kept beside the cards they came from.
 *
 * **`result.hands[i]` and `readout.hands[i]` are the same hand.** `table.ts`
 * builds the result with one `map` over the felt's hands, so the two lists are
 * in SPEC 4.6's play order and zipping them is safe. Neither is the wallet's
 * commit order, which is what `HandInPlay.walletHand` exists for and what
 * nothing here touches.
 *
 * **The chip delta is `credit - wager`**, which is SPEC 4.10's own "net on the
 * hand's wager": the wager left the balance at the deal and settlement credits
 * back `wager + net`, so a lost hand credits zero and shows the whole wager
 * lost, and a push credits the wager and shows zero.
 *
 * **The panel is not an overlay.** It is a screen of the round, not one of SPEC
 * 10's three overlays, and it sits in the controls row beside the other screens
 * so that it cannot cover a continuous readout either. `C5` measures the
 * overlays; this panel is in the flow with the betting bar and the action bar.
 */

import { handValue } from '../../core/hand';
import type { InsuranceResult, RoundResult, SettledHand } from '../../core/types';
import { button, el, empty, setHidden, setText } from '../dom';
import { chips as formatChips, delta as formatDelta } from '../format';
import type { ChromeState, ChromeActions, Component, HandVerdict } from '../state';
import {
  actionText,
  addressText,
  outcomeText,
  preferenceText,
  rungText,
  sideWagerText,
} from '../text';

/** One labelled field of the result, with the field name a test can find. */
function field(label: string, name: string, text: string): HTMLElement {
  return el('div', {
    className: 'bj-result__field',
    children: [
      el('dt', { className: 'bj-result__label', text: label }),
      el('dd', {
        className: 'bj-result__value',
        text,
        attributes: { 'data-field': name },
      }),
    ],
  });
}

/**
 * SPEC 7's one-line explanation for a decision.
 *
 * A matched decision gets a line too. SPEC 7 only requires the differing case to
 * be reported, but "Stand matched basic strategy" is a verdict rather than a
 * scolding, and `C8` asks for the coach verdict rather than for the coach
 * correction.
 */
function verdictText(entry: HandVerdict): string {
  const { verdict } = entry;
  const where = addressText(verdict.address);
  if (verdict.matched) {
    return `${actionText(verdict.played)} matched basic strategy on ${where}.`;
  }
  return (
    `You played ${actionText(verdict.played)}; basic strategy plays ` +
    `${actionText(verdict.recommended)} on ${where}, preferring ${preferenceText(verdict.preference)}.`
  );
}

/** SPEC 12's "the insurance result if any", as one line. */
function insuranceText(insurance: InsuranceResult): string {
  const kind = sideWagerText(insurance.evenMoney);
  const deferred =
    insurance.deferred === 0
      ? ''
      : ` ${formatChips(insurance.deferred)} of the stake was unfunded and was taken at the boundary.`;
  return (
    `${kind}: staked ${formatChips(insurance.stake)}, returned ` +
    `${formatChips(insurance.credit)}, net ${formatDelta(insurance.net)}.${deferred}`
  );
}

/** One settled hand, built once per round rather than once per frame. */
function handEntry(
  index: number,
  settled: SettledHand,
  playerValue: number,
  dealerValue: number,
  verdicts: readonly HandVerdict[] | null,
): HTMLElement {
  const fields = el('dl', {
    className: 'bj-result__fields',
    children: [
      field('Outcome', 'outcome', outcomeText(settled.outcome)),
      field('Reason', 'reason', rungText(settled.rung)),
      field('Your hand', 'player-value', formatChips(playerValue)),
      field('Dealer', 'dealer-value', formatChips(dealerValue)),
      field('Wager', 'wager', formatChips(settled.wager)),
      field('Chips', 'delta', formatDelta(settled.credit - settled.wager)),
    ],
  });

  const children: HTMLElement[] = [
    el('h3', { className: 'bj-result__heading', text: `Hand ${formatChips(index + 1)}` }),
    fields,
  ];

  // SPEC 12's "the coach verdict if the coach is on", attributed to the hand the
  // decision was made on. `null` is the coach being off, which is a different
  // sentence from an empty list and prints nothing either way.
  if (verdicts !== null) {
    const mine = verdicts.filter((entry) => entry.hand === index);
    if (mine.length > 0) {
      children.push(
        el('ul', {
          className: 'bj-result__coach',
          attributes: { 'data-field': 'coach' },
          children: mine.map((entry) =>
            el('li', { className: 'bj-result__verdict', text: verdictText(entry) }),
          ),
        }),
      );
    }
  }

  return el('li', {
    className: 'bj-result__hand',
    attributes: { 'data-hand': String(index) },
    children,
  });
}

/** Build the round result panel and its one exit, SPEC 10's Next Hand. */
export function createRoundResult(actions: ChromeActions): Component {
  const hands = el('ol', { className: 'bj-result__hands' });
  const insurance = el('p', {
    className: 'bj-result__insurance',
    attributes: { 'data-field': 'insurance' },
  });
  const balance = el('p', {
    className: 'bj-result__balance',
    attributes: { 'data-field': 'balance' },
  });
  const next = button('Next Hand', () => { actions.queue({ kind: 'nextHand' }); }, {
    className: 'bj-button bj-button--primary',
    attributes: { 'data-control': 'next-hand' },
  });

  const root = el('div', {
    className: 'bj-screen bj-screen--result',
    attributes: { 'data-screen': 'round-result' },
    children: [
      el('h2', { className: 'bj-screen__title', text: 'Round result' }),
      hands,
      insurance,
      balance,
      next,
    ],
  });

  /**
   * The result already rendered, by identity.
   *
   * Every phase object is built frozen at each transition and never edited in
   * place, so identity is exact: the list is rebuilt when the round changes and
   * on no other frame. A per-frame rebuild would throw away focus and would
   * re-run this whole file sixty times a second for a value that moves once.
   */
  let rendered: RoundResult | null = null;

  return {
    root,
    update(state: ChromeState): void {
      const { phase, dealerVisible } = state.readout;
      setHidden(root, phase.kind !== 'roundResult');
      if (phase.kind !== 'roundResult') {
        rendered = null;
        return;
      }
      if (phase.result === rendered) {
        return;
      }
      rendered = phase.result;

      const dealerValue = handValue(dealerVisible).total;
      empty(hands);
      phase.result.hands.forEach((settled, index) => {
        const inPlay = state.readout.hands[index];
        const playerValue = inPlay === undefined ? 0 : handValue(inPlay.cards).total;
        hands.append(handEntry(index, settled, playerValue, dealerValue, state.verdicts));
      });

      const side = phase.result.insurance;
      setHidden(insurance, side === null);
      setText(insurance, side === null ? '' : insuranceText(side));

      setText(balance, `Balance ${formatChips(phase.result.chips)}`);
    },
  };
}
