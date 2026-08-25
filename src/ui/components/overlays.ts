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
 * control, because `C8` needs the coach to be switchable, SPEC 5's Speed
 * control, which item `E9` at `BJ-14` grades, QUALITY-BAR section 4's
 * play-surface size, which item `F6` at `BJ-16` grades, and it states the house
 * rules in force. SPEC 14's editable house-rule toggles, sound, theme, the
 * reduced-motion setting and Reset all data are item `I5` at `BJ-20`, and a
 * control that did nothing would be worse than an absent one.
 *
 * **The two settings SPEC 14 calls immediate are the two that are built.** That
 * section groups Speed and play-surface size as presentation settings that
 * "take effect immediately, mid-round included, because neither can change an
 * outcome", and every other setting in it either changes the house rules at a
 * round boundary or waits on a subsystem a later part builds. Neither of the two
 * is persisted here; both persist at `BJ-20`, which is the ruling `E9` already
 * carries and which `F6` takes on the same terms.
 *
 * **Speed is the first real setting in this panel**, and it is here rather than
 * at `BJ-20` because `E9` grades it: SPEC 14 says Speed "takes effect
 * immediately, mid-round included, because neither can change an outcome", so
 * the control hands the value straight to `table.setSpeed` through
 * `ChromeActions` and nothing waits for a round boundary. Its persistence is the
 * one clause of `E9` this part does not close; `BJ-20`'s reload specs do, and
 * `tests/browser/speed-setting.spec.ts` says so in its own header.
 */

import type { CoachMode } from '../../core/strategy';
import type { History, HistoryEntry } from '../../core/history';
import { MILESTONES, type MilestoneId } from '../../core/statistics';
import { SPEEDS, type Speed } from '../../core/table';
import { SURFACE_SIZES, type SurfaceSize } from '../../render/surface';
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

/**
 * SPEC 5's two speeds, with the words SPEC 5 and SPEC 14 both use.
 *
 * Built from `SPEEDS`, which `core/table.ts` exports beside the multiplier, so
 * a third speed added there appears here as a missing label rather than as a
 * control nobody wrote. Item `E9` iterates the same list.
 */
const SPEED_LABELS: Readonly<Record<Speed, string>> = Object.freeze({
  normal: 'Normal',
  fast: 'Fast',
});

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

  // SPEC 5's Speed. Item `E9`, and SPEC 14's "takes effect immediately".
  const speedButtons = new Map<Speed, HTMLButtonElement>();
  const speeds = el('div', {
    className: 'bj-modes',
    attributes: { role: 'group', 'aria-label': 'Speed' },
  });
  for (const speed of SPEEDS) {
    const control = button(
      SPEED_LABELS[speed],
      () => {
        actions.setSpeed(speed);
      },
      { className: 'bj-button', attributes: { 'data-speed': speed } },
    );
    speedButtons.set(speed, control);
    speeds.append(control);
  }

  // QUALITY-BAR section 4's play-surface size. Item `F6` at `BJ-16`, and the
  // second of SPEC 14's two immediate presentation settings.
  const sizeButtons = new Map<SurfaceSize, HTMLButtonElement>();
  const sizes = el('div', {
    className: 'bj-modes',
    attributes: { role: 'group', 'aria-label': 'Play surface size' },
  });
  for (const size of SURFACE_SIZES) {
    const control = button(
      percentOfHundred(size),
      () => {
        actions.setSurfaceSize(size);
      },
      { className: 'bj-button', attributes: { 'data-surface-size': String(size) } },
    );
    sizeButtons.set(size, control);
    sizes.append(control);
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
      el('h3', { className: 'bj-panel__heading', text: 'Speed' }),
      el('p', {
        className: 'bj-panel__note',
        // SPEC 5's own sentence, and SPEC 14's: the pacing shortens, nothing
        // else does. Written out so a player knows it cannot cost them a hand.
        text: 'Fast shortens every pause and deal. It changes no card and no outcome.',
      }),
      speeds,
      el('h3', { className: 'bj-panel__heading', text: 'Play surface size' }),
      el('p', {
        className: 'bj-panel__note',
        // SPEC 14's own sentence, shortened: browser zoom shrinks the canvas box
        // with the viewport and magnifies nothing, so this is the only path to a
        // larger card. Written out because a player choosing between the two
        // needs to know the browser's own control will not do it.
        text: 'Browser zoom does not enlarge the cards. This does, and it applies at once.',
      }),
      sizes,
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
      for (const [speed, control] of speedButtons) {
        setAttribute(control, 'aria-pressed', String(speed === state.motion.speed));
      }
      for (const [size, control] of sizeButtons) {
        // Read off the frame's own layout state, which is the value the surface
        // plan was built from, so the pressed control and the drawn canvas
        // cannot disagree about which size the frame is at.
        setAttribute(control, 'aria-pressed', String(size === state.layout.surfaceSize));
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
  /**
   * The control that opens one overlay. `BJ-17`, item `D4`.
   *
   * Published rather than queried for, because the focus policy has to restore
   * focus to the control that opened a panel and a selector string in
   * `src/ui/input.ts` would be a second name for a button this file already
   * holds. It is also the answer on the engines where a press does not focus
   * what it pressed, which is WebKit, and where reading `document.activeElement`
   * on open therefore finds `<body>`.
   */
  opener(id: OverlayId): HTMLElement | null;
  /** One frame's sync. `dt` is passed to the open panel and used by none yet. */
  update(state: ChromeState, dt: number): void;
}

export function createOverlays(actions: ChromeActions): Overlays {
  const panels: Readonly<Record<OverlayId, Component>> = {
    settings: settingsPanel(actions),
    howToPlay: howToPlayPanel(),
    statistics: statisticsPanel(),
  };

  // Held by id as well as appended, because item `D4` restores focus to the
  // control that opened a panel and the map is how that control is found again.
  // A `Map` keeps its insertion order, so the row below is still SPEC 10's.
  const openers: ReadonlyMap<OverlayId, HTMLButtonElement> = new Map(
    OVERLAY_IDS.map((id) => [
      id,
      button(
        OVERLAY_TITLES[id],
        () => {
          actions.openOverlay(id);
        },
        { className: 'bj-button bj-button--quiet', attributes: { 'data-open-overlay': id } },
      ),
    ]),
  );

  const controls = el('nav', {
    className: 'bj-overlay-controls',
    attributes: { 'aria-label': 'Panels' },
    children: [...openers.values()],
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
    // `tabindex="-1"` so the dialog itself can take focus when it opens, which
    // is item `D4`'s "modals trap focus and restore it on close" and
    // QUALITY-BAR section 3's "overlays take focus on open". Focus goes to the
    // panel rather than to its Close button so that what is read on arrival is
    // the panel's own name. It is not in the tab order: `src/ui/input.ts` is the
    // only thing that focuses it, and `Tab` from it lands on the first control
    // inside. `aria-modal` is deliberately absent, for the reason that module's
    // header gives at length.
    attributes: { role: 'dialog', 'data-overlay-host': 'true', tabindex: '-1' },
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
    opener: (id: OverlayId): HTMLElement | null => openers.get(id) ?? null,
    update(state: ChromeState, dt: number): void {
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

      panels[open].update(state, dt);
      setText(title, OVERLAY_TITLES[open]);
      setText(note, subtitle(state));
      setAttribute(host, 'aria-label', OVERLAY_TITLES[open]);
      setAttribute(host, 'data-open', open);
    },
  };
}
