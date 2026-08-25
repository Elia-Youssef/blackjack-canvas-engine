/**
 * The persistent visually hidden mirror of the play state. `BJ-18`, item `G4`
 * (Critical), and QUALITY-BAR section 4's first mechanism.
 *
 *   "A persistent structured mirror. A visually hidden DOM subtree reflecting
 *    the full current state with real semantics. Blackjack: a list of hands,
 *    each with an accessible name like 'Hand 2 of 3, active, soft 16, wager
 *    100', containing a nested list of cards. Updated from the same state sync
 *    as the canvas. This is what satisfies 1.1.1 and 1.3.1."
 *
 * **This is not a live region and must never become one.** The section's own
 * reasoning is that a live region "cannot be navigated, re-read or queried", so
 * it satisfies 4.1.3 and nothing else; the mirror is the half a player can go
 * back to. Nothing in this file carries `aria-live`, and
 * `tests/browser/screen-reader.spec.ts` asserts that absence in as many words,
 * because a mirror that announced would be the two mechanisms collapsed into
 * one, which is the failure item `G4` exists for.
 *
 * **Updated from the same state sync as the canvas.** This is a `Component` like
 * every other, handed the frame's `ChromeState` after the render, so the mirror
 * and the felt are drawn from one snapshot. There is no second read of the
 * machine anywhere in this file and no read of the DOM at all.
 *
 * **Structure, and why each piece is the element it is.**
 *
 *   - The hands are an `<ol>`, because SPEC 4.6 plays them left to right and the
 *     order is the state rather than the presentation. Each hand is a
 *     `role="group"` carrying the template above as its `aria-label`, which is
 *     the one construct that gives a set of nodes an accessible name a screen
 *     reader announces on entry while still reading the nodes themselves. An
 *     `aria-label` on the `<li>` would override its contents as the name on some
 *     engines and hide the cards it was meant to introduce.
 *   - The cards are a nested `<ul>` with one card per item, as words. QUALITY-BAR
 *     section 4 allows a card's rank and suit to live solely on canvas "and those
 *     appear in the mirror as words", which is `cardText`.
 *   - The dealer is a group of its own rather than a fourth hand, because SPEC 11
 *     counts the dealer's face-up cards only while the hole card is down and the
 *     concealed count is part of what the mirror has to state.
 *   - Everything else is a paragraph, because it is a sentence.
 *
 * **What is deliberately not here.** SPEC 11's fourteen counters are already real
 * DOM text in the readouts, reachable at every breakpoint, so repeating them here
 * would be a second copy of a number to keep in step. The mirror carries what is
 * otherwise only on the felt: the cards, the per-hand values a split makes
 * ambiguous, the dealer's concealed card, the offer being decided, and the
 * refusal reason behind every greyed control on the current screen.
 *
 * **The write-only-when-changed rule applies here exactly as it does to the
 * readouts.** A mirror rebuilt every frame would be a subtree replaced sixty
 * times a second under a screen reader's cursor, which is worse than no mirror:
 * an assistive technology re-reads a changed subtree. Every write below is
 * guarded by a key, and `tests/browser/screen-reader.spec.ts` counts DOM
 * mutations across idle frames and requires zero.
 */

import { handValue } from '../../core/hand';
import { tableLimits } from '../../core/wallet';
import { unavailableNow } from '../availability';
import { el, empty, setAttribute, setHidden, setText } from '../dom';
import { chips as formatChips } from '../format';
import type { ChromeState, Component } from '../state';
import {
  cardText,
  dealerMirrorText,
  handMirrorName,
  houseRulesText,
  offerText,
  phaseText,
  tableText,
  unavailableText,
} from '../text';

/** One hand's row: the group that names it, and the list of its cards. */
interface HandRow {
  readonly item: HTMLElement;
  readonly group: HTMLElement;
  readonly cards: HTMLElement;
  /** The key the card list was last built from. */
  cardKey: string;
}

/** A hand's cards as one comparable string, so a rebuild happens on a change. */
function cardKeyOf(cards: readonly { readonly rank: string; readonly suit: string }[]): string {
  return cards.map((card) => `${card.rank}${card.suit}`).join(',');
}

/** Build the mirror. Mounted once, by `chrome.ts`, and never rebuilt. */
export function createMirror(): Component {
  const phase = el('p', { attributes: { 'data-mirror': 'phase' } });

  const dealerSummary = el('p', { attributes: { 'data-mirror': 'dealer-summary' } });
  const dealerCards = el('ul', { attributes: { 'data-mirror': 'dealer-cards' } });
  const dealer = el('div', {
    attributes: { role: 'group', 'aria-label': 'Dealer', 'data-mirror': 'dealer' },
    children: [dealerSummary, dealerCards],
  });

  const hands = el('ol', { attributes: { 'data-mirror': 'hands' } });
  const noHands = el('p', { attributes: { 'data-mirror': 'no-hands' }, text: 'No hands in play.' });

  const wallet = el('p', { attributes: { 'data-mirror': 'wallet' } });
  const table = el('p', { attributes: { 'data-mirror': 'table' } });
  const rules = el('p', { attributes: { 'data-mirror': 'rules' } });
  const offer = el('p', { attributes: { 'data-mirror': 'offer' } });

  const unavailableList = el('ul', { attributes: { 'data-mirror': 'unavailable' } });
  const unavailable = el('div', {
    attributes: { role: 'group', 'aria-label': 'Unavailable controls' },
    children: [unavailableList],
  });

  const root = el('section', {
    className: 'bj-mirror bj-visually-hidden',
    attributes: { 'aria-label': 'Play state', 'data-mirror': 'root' },
    children: [phase, dealer, hands, noHands, wallet, table, rules, offer, unavailable],
  });

  const rows: HandRow[] = [];
  let dealerKey: string | null = null;
  let unavailableKey: string | null = null;

  /** Add or remove hand rows until there are exactly `wanted` of them. */
  function fitRows(wanted: number): void {
    while (rows.length > wanted) {
      rows.pop()?.item.remove();
    }
    while (rows.length < wanted) {
      const cards = el('ul', { attributes: { 'data-mirror-cards': String(rows.length) } });
      const group = el('div', {
        attributes: { role: 'group', 'data-mirror-hand': String(rows.length) },
        children: [cards],
      });
      const item = el('li', { children: [group] });
      rows.push({ item, group, cards, cardKey: '' });
      hands.append(item);
    }
  }

  return {
    root,
    update(state: ChromeState): void {
      const { readout } = state;
      const { phase: current, hands: inPlay, dealerVisible, dealerConcealed } = readout;

      setText(phase, phaseText(current, inPlay.length));

      // The dealer. The key carries the concealed count as well as the cards,
      // because the hole card turning face up changes both at once and a key
      // built from the cards alone would miss the frame it stops being hidden.
      const dealerNow = `${cardKeyOf(dealerVisible)}|${String(dealerConcealed)}`;
      if (dealerNow !== dealerKey) {
        dealerKey = dealerNow;
        setText(
          dealerSummary,
          dealerMirrorText(
            dealerVisible,
            dealerConcealed,
            dealerVisible.length === 0 ? null : handValue(dealerVisible),
          ),
        );
        empty(dealerCards);
        for (const card of dealerVisible) {
          dealerCards.append(el('li', { text: cardText(card) }));
        }
        for (let hidden = 0; hidden < dealerConcealed; hidden += 1) {
          dealerCards.append(el('li', { text: 'One card face down' }));
        }
      }

      // The hands. The row skeletons move only when the count does, which is a
      // split or a sweep; each row's name and card list move only when that
      // hand does.
      setHidden(noHands, inPlay.length > 0);
      fitRows(inPlay.length);
      inPlay.forEach((hand, index) => {
        const row = rows[index];
        if (row === undefined) {
          return;
        }
        const active = current.kind === 'playerTurn' && current.activeHand === index;
        setAttribute(
          row.group,
          'aria-label',
          handMirrorName(
            hand,
            { index, of: inPlay.length, active },
            hand.cards.length === 0 ? null : handValue(hand.cards),
          ),
        );
        const key = cardKeyOf(hand.cards);
        if (key !== row.cardKey) {
          row.cardKey = key;
          empty(row.cards);
          for (const card of hand.cards) {
            row.cards.append(el('li', { text: cardText(card) }));
          }
        }
      });

      // The money and the table, which QUALITY-BAR section 4 requires as real
      // DOM text somewhere reachable. The readouts carry the same two numbers
      // on screen; this is the copy that sits beside the cards they belong to.
      setText(
        wallet,
        `Chips ${formatChips(readout.wallet.chips)}. Wager ${formatChips(readout.wallet.wager)}.`,
      );
      const limits = tableLimits(readout.table);
      setText(
        table,
        `${tableText(limits.id)} table. Minimum ${formatChips(limits.minimum)}, ` +
          `maximum ${formatChips(limits.maximum)}.`,
      );
      setText(rules, houseRulesText(readout.rules));

      // SPEC 4.7's decision, while one is being asked for.
      setHidden(offer, current.kind !== 'insurance');
      setText(offer, current.kind === 'insurance' ? offerText(current.offer) : '');

      // The `BJ-15` review's `MIN-4`: the reason a control is greyed, in a place
      // a keyboard or touch user can reach without hovering anything.
      const greyed = unavailableNow(readout);
      const key = greyed.map((entry) => `${entry.label}:${entry.refusal}`).join('|');
      if (key !== unavailableKey) {
        unavailableKey = key;
        empty(unavailableList);
        setHidden(unavailable, greyed.length === 0);
        for (const entry of greyed) {
          unavailableList.append(el('li', { text: unavailableText(entry.label, entry.refusal) }));
        }
      }
    },
  };
}
