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
 *
 * **`BJ-16` split the fourteen into three and eleven.** DESIGN section 4 gives
 * the two narrow breakpoints a top bar of "chips, wager and hand value" with
 * "everything else behind the disclosure", and the portrait diagram in that
 * section carries the same three. Fourteen readouts at 320 CSS px wrap to seven
 * rows and eat the whole of a 256 px viewport, which is item `F7`'s "loss of
 * function" rather than a tight fit.
 *
 * The disclosure is a real `<details>`, and that choice is load bearing three
 * ways: it is keyboard operable and named by the platform, so it needs no ARIA
 * and leaves item `G1` at `BJ-18` exactly the surface it had; it is one element
 * rather than a fourth overlay, which SPEC 10 does not have; and its open state
 * is a DOM property the chrome can set per breakpoint, so at `wide` and `medium`
 * all fourteen are on screen at once and item `C5`'s measurement of fourteen
 * rendered boxes is unchanged. Below 768 px it starts closed and the player
 * opens it; nothing is removed from the page at any width, which is what "fully
 * functional" in item `F3` is about.
 */

import { handValue } from '../../core/hand';
import { tableLimits } from '../../core/wallet';
import { countUp } from '../../render/animate';
import type { BreakpointName } from '../breakpoints';
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

/**
 * The same readout's label, which names the active hand by index at a split.
 * `BJ-20`, item `C3`'s "visually indicated", and the review that measured the
 * shipped page found no sighted answer anywhere: the mirror's naming and the
 * announcer's sentence are both inside visually hidden surfaces, and the play
 * surface gives every hand an equal band. This label is the sighted half, on
 * the one readout DESIGN section 4 keeps in the top bar at every width, in
 * the same words the mirror already uses, so a sighted player and a screen
 * reader user are told the same thing by the same name.
 */
function activeHandTerm(state: ChromeState): string {
  const { phase, hands } = state.readout;
  if (phase.kind === 'playerTurn' && hands.length > 1) {
    return `Hand ${chips(phase.activeHand + 1)} of ${chips(hands.length)}`;
  }
  return 'Hand';
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
 * DESIGN section 4's three: the readouts the narrow top bar keeps.
 *
 * The other eleven are the disclosure's. The split is by key rather than by
 * position in `ROWS`, so SPEC 11's order is still the order they are built in
 * and a reordering of that list cannot silently change which three stay.
 */
export const PRIMARY_READOUT_KEYS: readonly string[] = Object.freeze([
  BALANCE_KEY,
  'wager',
  'hand-value',
]);

/** The eleven behind the disclosure at `compact` and `portrait`. */
export const SECONDARY_READOUT_KEYS: readonly string[] = Object.freeze(
  ROWS.map((row) => row.key).filter((key) => !PRIMARY_READOUT_KEYS.includes(key)),
);

/** The two breakpoints that show all fourteen at once, disclosure open. */
function showsEveryReadout(breakpoint: BreakpointName): boolean {
  return breakpoint === 'wide' || breakpoint === 'medium';
}

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
  const primary = el('dl', { className: 'bj-readouts__list' });
  const secondary = el('dl', { className: 'bj-readouts__list' });
  let counting: Counting | null = null;
  // The one label the sync step rewrites: `activeHandTerm` names the active
  // split hand by index. Held by reference the way the values are, and written
  // through `setText`, which writes only when it moved.
  let handLabel: HTMLElement | null = null;

  for (const row of ROWS) {
    const value = el('dd', { className: 'bj-readout__value', text: NOTHING_YET });
    values.set(row.key, value);
    const label = el('dt', { className: 'bj-readout__label', text: row.label });
    if (row.key === 'hand-value') {
      handLabel = label;
    }
    const into = PRIMARY_READOUT_KEYS.includes(row.key) ? primary : secondary;
    into.append(
      el('div', {
        className: 'bj-readout',
        attributes: { 'data-readout': row.key },
        children: [label, value],
      }),
    );
  }

  // Open at build time, because the first frame has not resolved a breakpoint
  // yet and a page that started with eleven readouts missing would flash them
  // in. The sync below closes it on the frame a narrow viewport is resolved.
  const more = el('details', {
    className: 'bj-readouts__more',
    attributes: { 'data-readouts': 'more', open: '' },
    children: [
      el('summary', {
        className: 'bj-readouts__summary',
        text: 'More readouts',
        attributes: { 'data-control': 'more-readouts' },
      }),
      secondary,
    ],
  });

  const root = el('section', {
    className: 'bj-readouts',
    attributes: { 'aria-label': 'Table readouts' },
    children: [primary, more],
  });

  /**
   * The breakpoint the disclosure was last set from.
   *
   * The open state is written **on a change of breakpoint and never otherwise**,
   * so a player who opens the disclosure at `portrait` keeps it open: a sync
   * step that wrote it every frame would close it under their finger. It is the
   * same rule every other writer in the chrome follows, applied to a property a
   * person can also change.
   */
  let appliedBreakpoint: BreakpointName | null = null;

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
      // The same guard `scene.ts`'s `advance` carries, for the same reason:
      // only `table.update` clamps its delta, and a non-finite one written into
      // an age stays there for ever, because `Math.min(NaN, span)` is `NaN` and
      // nothing resets the count. The balance would then stop moving for the
      // rest of the session. A large delta is still allowed to saturate, which
      // is how a resume lands the count on its target.
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      counting.age = Math.min(counting.age + step, state.motion.seconds('balanceCountUp'));
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
      const { breakpoint } = state.layout;
      if (breakpoint !== appliedBreakpoint) {
        appliedBreakpoint = breakpoint;
        more.open = showsEveryReadout(breakpoint);
      }
      for (const row of ROWS) {
        const node = values.get(row.key);
        if (node !== undefined) {
          setText(node, row.key === BALANCE_KEY ? balanceText(state, dt) : row.value(state));
        }
      }
      // Item `C3`'s sighted half: the hand readout's label names the active
      // split hand by index, in the mirror's own words.
      if (handLabel !== null) {
        setText(handLabel, activeHandTerm(state));
      }
    },
  };
}

/** The readout keys, so a test can require the whole of SPEC 11's list. */
export const READOUT_KEYS: readonly string[] = Object.freeze(ROWS.map((row) => row.key));
