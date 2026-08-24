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
import { countUp } from '../../render/animate';
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

/** SPEC 11's chip balance. The one readout SPEC 5 asks to count rather than snap. */
const BALANCE_KEY = 'chips';

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
  { key: BALANCE_KEY, label: 'Chips', value: (s) => chips(s.readout.wallet.chips) },
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

/**
 * SPEC 5: "the balance counts up rather than snapping".
 *
 * The one piece of the chrome that holds presentation state across frames, and
 * the only place in `src/ui/` where the sync step is not a pure function of the
 * frame's `ChromeState`. It holds the number currently on screen and walks it
 * toward the machine's, over `PACING.balanceCountUp`.
 *
 * **Under reduced motion it holds nothing.** `motion.progress` answers 1 from
 * the first frame, so the shown value is the target on the frame the balance
 * moves and the readout snaps, which is exactly what QUALITY-BAR section 4 asks
 * for: the animation removed entirely, the value unchanged.
 *
 * **The count never lies about where it ended.** `countUp` is exactly the target
 * at a progress of 1 and is rounded on the way out, so the readout finishes on
 * the machine's integer and never shows a fraction of a chip. A test that polls
 * a balance therefore reaches the exact number rather than approaching it.
 */
interface Counting {
  /** The number the readout is showing. */
  shown: number;
  /** Where the count started. */
  from: number;
  /** Where it is going: the balance the machine last published. */
  to: number;
  /** Seconds since the count started. */
  age: number;
}

/** Build the readout panel. */
export function createReadouts(): Component {
  const values = new Map<string, HTMLElement>();
  const list = el('dl', { className: 'bj-readouts__list' });
  let counting: Counting | null = null;

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

  /** The balance to print this frame: the count's value, or the machine's. */
  function balanceText(state: ChromeState, dt: number): string {
    const target = state.readout.wallet.chips;
    if (counting === null) {
      // The first frame of a session shows the balance it starts on. A count-up
      // from nowhere would be a readout animating before anything happened.
      counting = { shown: target, from: target, to: target, age: 0 };
      return chips(target);
    }
    if (counting.to !== target) {
      counting.from = counting.shown;
      counting.to = target;
      counting.age = 0;
    } else {
      counting.age = Math.min(counting.age + dt, state.motion.seconds('balanceCountUp'));
    }
    counting.shown = countUp(
      counting.from,
      counting.to,
      state.motion.progress('balanceCountUp', counting.age),
    );
    return chips(counting.shown);
  }

  return {
    root,
    update(state: ChromeState, dt: number): void {
      for (const row of ROWS) {
        const node = values.get(row.key);
        if (node !== undefined) {
          setText(node, row.key === BALANCE_KEY ? balanceText(state, dt) : row.value(state));
        }
      }
    },
  };
}

/** The readout keys, so a test can require the whole of SPEC 11's list. */
export const READOUT_KEYS: readonly string[] = Object.freeze(ROWS.map((row) => row.key));
