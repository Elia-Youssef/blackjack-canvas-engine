/**
 * SPEC 10's three overlays: Settings, How to Play, Statistics and history.
 * Item `C5`, Major.
 *
 *   "Overlays never cover a continuous readout, and opening then closing any
 *    overlay leaves game state unchanged."
 *
 * Both halves are structural rather than careful.
 *
 * **Never covers a readout** is geometry. The host below is placed inside the
 * shell's play-surface row by `layout.ts`, and SPEC 11's readouts are a row
 * above it, so the overlay has no way to reach their boxes short of leaving the
 * document flow. It is `position: absolute` against that row and never `fixed`,
 * which is the one change that would let it. `C5` measures the rendered boxes on
 * three engines rather than reading the stylesheet.
 *
 * **Leaves game state unchanged** is the absence of a route. SPEC 10 makes the
 * overlays "reachable at any time and never blocking state", and `core/types.ts`
 * records why they are not intents: three rows in the legality table that are
 * legal in all eleven phases mean nothing, and would invite a later part to
 * route a real transition through one. Opening and closing sets one field of
 * chrome state, and nothing in this file is handed a `Table`.
 *
 * **The loop keeps running behind an overlay**, which is what "never blocking
 * state" means and what makes the play surface persist behind it. A pause would
 * be a fifth thing an overlay does to the game, and SPEC 10 gives it none.
 *
 * The Settings panel here is deliberately partial: it carries SPEC 7's coach
 * control, because `C8` needs the coach to be switchable, and it states the
 * house rules in force. SPEC 14's editable toggles, the Speed control, the
 * play-surface size, sound, theme and Reset all data are item `I5` at `BJ-20`,
 * and a control that did nothing would be worse than an absent one.
 */

import type { CoachMode } from '../../core/strategy';
import type { History, HistoryEntry } from '../../core/history';
import { MILESTONES, type MilestoneId } from '../../core/statistics';
import { button, el, empty, setAttribute, setHidden, setText } from '../dom';
import { NOTHING_YET, chips as formatChips, delta as formatDelta, percentOfHundred } from '../format';
import {
  OVERLAY_IDS,
  OVERLAY_TITLES,
  type ChromeActions,
  type ChromeState,
  type Component,
  type OverlayId,
} from '../state';
import { milestoneText, outcomeText, playerActionText, tableText } from '../text';

/**
 * The two coach modes this part offers. SPEC 7 has three.
 *
 * `hint` is deliberately absent. Its surface is the recommendation highlighted
 * **before** the player acts, which is item `J4` at `BJ-20`; offering the mode
 * here would put a control in Settings that changed nothing a player could see.
 * `review` is the mode whose surface is the round result, which is `C8` and is
 * built. `strategy.ts` still carries all three, `COACH_MODES` still lists them,
 * and `BJ-20` adds the third control to this same group.
 */
const OFFERED_MODES: readonly { readonly mode: CoachMode; readonly label: string }[] = Object.freeze([
  { mode: 'off', label: 'Off' },
  { mode: 'review', label: 'Review' },
]);

/** One labelled statistic. */
function stat(label: string, name: string): { row: HTMLElement; value: HTMLElement } {
  const value = el('dd', {
    className: 'bj-stat__value',
    text: NOTHING_YET,
    attributes: { 'data-stat': name },
  });
  return {
    row: el('div', {
      className: 'bj-stat',
      children: [el('dt', { className: 'bj-stat__label', text: label }), value],
    }),
    value,
  };
}

/** SPEC 8's entry, as one line of the history list. */
function historyLine(entry: HistoryEntry, index: number): HTMLElement {
  const hands = entry.hands
    .map((hand) => `${outcomeText(hand.outcome)} ${formatChips(hand.value)}`)
    .join(', ');
  const actions =
    entry.actions.length === 0
      ? 'no actions'
      : entry.actions.map((action) => playerActionText(action)).join(', ');
  return el('li', {
    className: 'bj-history__entry',
    attributes: { 'data-history': String(index) },
    text:
      `Wager ${formatChips(entry.wager)}. Dealer ${formatChips(entry.dealerValue)}. ` +
      `${hands}. ${actions}. Round ${formatDelta(entry.delta)}.`,
  });
}

/** The Settings panel. SPEC 7's coach control, and the rules in force. */
function settingsPanel(actions: ChromeActions): Component {
  const modeButtons = new Map<CoachMode, HTMLButtonElement>();
  const group = el('div', {
    className: 'bj-modes',
    attributes: { role: 'group', 'aria-label': 'Strategy coach' },
  });
  for (const { mode, label } of OFFERED_MODES) {
    const control = button(
      label,
      () => {
        actions.setCoachMode(mode);
      },
      { className: 'bj-button', attributes: { 'data-coach-mode': mode } },
    );
    modeButtons.set(mode, control);
    group.append(control);
  }

  const rules = el('p', { className: 'bj-rules', attributes: { 'data-field': 'house-rules' } });

  const root = el('div', {
    className: 'bj-panel',
    attributes: { 'data-panel': 'settings' },
    children: [
      el('h3', { className: 'bj-panel__heading', text: 'Strategy coach' }),
      el('p', {
        className: 'bj-panel__note',
        text: 'Review names the correct action in the round result when yours differed.',
      }),
      group,
      el('h3', { className: 'bj-panel__heading', text: 'House rules' }),
      rules,
    ],
  });

  return {
    root,
    update(state: ChromeState): void {
      for (const [mode, control] of modeButtons) {
        setAttribute(control, 'aria-pressed', String(mode === state.coachMode));
      }
      const house = state.readout.rules;
      setText(
        rules,
        `${formatChips(house.decks)} decks. Dealer stands on all 17s. ` +
          `Double after split ${house.doubleAfterSplit ? 'on' : 'off'}. ` +
          `Surrender ${house.surrender ? 'on' : 'off'}. ` +
          `Even money ${house.evenMoney ? 'on' : 'off'}. ` +
          `Split on ${house.splitRule === 'equalValue' ? 'equal value' : 'equal rank'}.`,
      );
    },
  };
}

/** The How to Play panel. SPEC 17's onboarding text is `E2` at `BJ-20`. */
function howToPlayPanel(): Component {
  const root = el('div', {
    className: 'bj-panel',
    attributes: { 'data-panel': 'howToPlay' },
    children: [
      el('p', {
        text:
          'Beat the dealer without going over 21. Face cards count 10 and an Ace counts 11 ' +
          'unless that would bust the hand, in which case it counts 1.',
      }),
      el('p', {
        text:
          'Place a wager with the chips, then Deal. Hit for another card, Stand to keep your ' +
          'total, Double to take exactly one more card for a matched wager, Split a pair into ' +
          'two hands, or Surrender the first two cards for half the wager back.',
      }),
      el('p', {
        text:
          'A natural, an Ace with a ten-value card on the first two cards, pays three to two. ' +
          'Insurance is offered against a dealer Ace and pays two to one.',
      }),
      el('p', {
        // SPEC 13 asks How to Play to say this plainly.
        text: 'Chip balances do not carry between sessions. Every visit starts at 1,000 chips.',
      }),
    ],
  });
  return {
    root,
    update(): void {
      // Static prose. Nothing here reads the game.
    },
  };
}

/** The Statistics and history panel. SPEC 8, SPEC 9 and SPEC 11's two scopes. */
function statisticsPanel(): Component {
  const rows = {
    sessionHands: stat('Session hands', 'session-hands'),
    sessionWins: stat('Session wins', 'session-wins'),
    sessionAccuracy: stat('Session accuracy', 'session-accuracy'),
    lifetimeHands: stat('Lifetime hands', 'lifetime-hands'),
    lifetimeWins: stat('Lifetime wins', 'lifetime-wins'),
    lifetimeAccuracy: stat('Lifetime accuracy', 'lifetime-accuracy'),
  };

  const list = el('dl', {
    className: 'bj-stats',
    children: Object.values(rows).map((row) => row.row),
  });
  const milestones = el('ul', {
    className: 'bj-milestones',
    attributes: { 'data-field': 'milestones' },
  });
  const history = el('ol', { className: 'bj-history', attributes: { 'data-field': 'history' } });
  const noRounds = el('p', { className: 'bj-panel__note', text: 'No rounds played yet.' });

  const root = el('div', {
    className: 'bj-panel',
    attributes: { 'data-panel': 'statistics' },
    children: [
      el('h3', { className: 'bj-panel__heading', text: 'Statistics' }),
      list,
      el('h3', { className: 'bj-panel__heading', text: 'Milestones' }),
      milestones,
      el('h3', { className: 'bj-panel__heading', text: 'Last rounds' }),
      noRounds,
      history,
    ],
  });

  let shownHistory: History | null = null;
  let shownMilestones: readonly MilestoneId[] | null = null;

  return {
    root,
    update(state: ChromeState): void {
      const { session, lifetime } = state.statistics;
      setText(rows.sessionHands.value, formatChips(session.handsPlayed));
      setText(rows.sessionWins.value, formatChips(session.wins));
      setText(
        rows.sessionAccuracy.value,
        session.accuracy === null ? NOTHING_YET : percentOfHundred(session.accuracy),
      );
      setText(rows.lifetimeHands.value, formatChips(lifetime.handsPlayed));
      setText(rows.lifetimeWins.value, formatChips(lifetime.wins));
      setText(
        rows.lifetimeAccuracy.value,
        lifetime.accuracy === null ? NOTHING_YET : percentOfHundred(lifetime.accuracy),
      );

      // Both lists are immutable values replaced on change, so identity is the
      // whole of the dirty check and the panel is free on every other frame.
      if (state.milestones !== shownMilestones) {
        shownMilestones = state.milestones;
        empty(milestones);
        for (const id of MILESTONES) {
          const awarded = state.milestones.includes(id);
          milestones.append(
            el('li', {
              className: 'bj-milestone',
              text: milestoneText(id),
              attributes: { 'data-milestone': id, 'data-awarded': String(awarded) },
            }),
          );
        }
      }

      if (state.history !== shownHistory) {
        shownHistory = state.history;
        empty(history);
        state.history.forEach((entry, index) => {
          history.append(historyLine(entry, index));
        });
        setHidden(noRounds, state.history.length > 0);
      }
    },
  };
}

/** SPEC 11's table name, for the overlay header. Kept beside the title. */
function subtitle(state: ChromeState): string {
  return `${tableText(state.readout.table)} table`;
}

/**
 * Build the overlay host: the three open controls, and the panel they open.
 *
 * The open controls are returned separately from the host, because they belong
 * with the readouts at the top of the shell where nothing can cover them, and
 * the host belongs over the play surface where it covers nothing that matters.
 */
export interface Overlays {
  /** The three buttons that open an overlay. Placed with the readouts. */
  readonly controls: HTMLElement;
  /** The panel itself. Placed inside the play-surface row. */
  readonly host: HTMLElement;
  update(state: ChromeState): void;
}

export function createOverlays(actions: ChromeActions): Overlays {
  const panels: Readonly<Record<OverlayId, Component>> = {
    settings: settingsPanel(actions),
    howToPlay: howToPlayPanel(),
    statistics: statisticsPanel(),
  };

  const controls = el('nav', {
    className: 'bj-overlay-controls',
    attributes: { 'aria-label': 'Panels' },
    children: OVERLAY_IDS.map((id) =>
      button(
        OVERLAY_TITLES[id],
        () => {
          actions.openOverlay(id);
        },
        { className: 'bj-button bj-button--quiet', attributes: { 'data-open-overlay': id } },
      ),
    ),
  });

  const title = el('h2', { className: 'bj-overlay__title' });
  const note = el('p', { className: 'bj-overlay__subtitle' });
  const close = button('Close', () => { actions.closeOverlay(); }, {
    className: 'bj-button',
    attributes: { 'data-control': 'close-overlay' },
  });

  const body = el('div', {
    className: 'bj-overlay__body',
    children: OVERLAY_IDS.map((id) => panels[id].root),
  });

  const host = el('div', {
    className: 'bj-overlay',
    attributes: { role: 'dialog', 'data-overlay-host': 'true' },
    children: [
      el('div', {
        className: 'bj-overlay__header',
        children: [el('div', { children: [title, note] }), close],
      }),
      body,
    ],
  });
  host.hidden = true;

  return {
    controls,
    host,
    update(state: ChromeState): void {
      const open = state.overlay;
      setHidden(host, open === null);
      for (const id of OVERLAY_IDS) {
        setHidden(panels[id].root, id !== open);
      }

      // Nothing below this line is visible when no overlay is open, and the
      // panels are the most expensive thing the sync step can do: the statistics
      // panel formats six numbers through `Intl` and can rebuild two lists. A
      // closed overlay is the common case on every frame of every round, so it
      // costs nothing. The panels are updated on the frame the overlay opens,
      // because `open` is set before the sync step that follows it runs.
      if (open === null) {
        setAttribute(host, 'data-open', null);
        return;
      }

      panels[open].update(state);
      setText(title, OVERLAY_TITLES[open]);
      setText(note, subtitle(state));
      setAttribute(host, 'aria-label', OVERLAY_TITLES[open]);
      setAttribute(host, 'data-open', open);
    },
  };
}
