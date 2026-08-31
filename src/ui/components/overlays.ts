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
 * The Settings panel is SPEC 14's whole list since `BJ-20`, item `I5`: the
 * house rules, the coach (all three modes, hint restored with its pre-decision
 * highlight), Speed, play-surface size, sound with the volume slider beside
 * the play screen's mute, theme, reduced motion, and Reset all data behind a
 * confirmation, with the "stored in this browser only" sentence beside it.
 * The read-only statement panel it was until this part kept its statements,
 * and they stay true: what changed is that every one of them is now a control.
 *
 * **The two settings SPEC 14 calls immediate are the two that always were.** That
 * section groups Speed and play-surface size as presentation settings that
 * "take effect immediately, mid-round included, because neither can change an
 * outcome", and the house rules are their opposite: staged, and applied by the
 * machine at the next deal, which is that section's own boundary. The two
 * presentation settings and the staged rules are therefore different routes in
 * `ChromeActions`, and the panel says which is which in its own notes.
 *
 * **Chrome CSS durations deliberately do not scale with Speed.** SPEC 5 scopes
 * the Fast multiplier to the constants it lists, and the `--dur-*` tokens are
 * QUALITY-BAR 15's, not SPEC 5's: a Speed that also shortened the chrome's
 * transitions would be a fourth motion mode rather than a faster game. Stated
 * here once, where the Speed control lands, so nobody "fixes" it.
 */

import type { CoachMode } from '../../core/strategy';
import { COACH_MODES } from '../../core/strategy';
import { DEFAULT_RULES } from '../../core/rules';
import type { History, HistoryEntry } from '../../core/history';
import { MILESTONES, type MilestoneId } from '../../core/statistics';
import { SPEEDS, type Speed } from '../../core/table';
import type { DeckCount } from '../../core/shoe';
import { DECK_COUNTS } from '../../core/shoe';
import type { SplitRule } from '../../core/hand';
import { SURFACE_SIZES, type SurfaceSize } from '../../render/surface';
import { MAX_VOLUME, MIN_VOLUME } from '../audio';
import { button, el, empty, setAttribute, setHidden, setText } from '../dom';
import {
  NOTHING_YET,
  chips as formatChips,
  delta as formatDelta,
  percent,
  percentOfHundred,
} from '../format';
import { MOTION_SETTINGS, type MotionSetting } from '../motion';
import {
  OVERLAY_IDS,
  OVERLAY_TITLES,
  type ChromeActions,
  type ChromeState,
  type Component,
  type OverlayId,
} from '../state';
import { THEMES, type Theme } from '../theme';
import { milestoneRowText, outcomeText, playerActionText, tableText } from '../text';

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

/**
 * SPEC 7's three coach modes, in `COACH_MODES`' own order.
 *
 * `hint` is offered since `BJ-20`, item `J4`: its surface is the recommendation
 * highlighted on the action bar before the player acts, which the actions
 * component now draws, so the control changes something a player can see.
 * Built from the strategy module's own list so a fourth mode added there is a
 * missing label here rather than a mode nobody can choose.
 */
const MODE_LABELS: Readonly<Record<CoachMode, string>> = Object.freeze({
  off: 'Off',
  hint: 'Hint',
  review: 'Review',
});

/** SPEC 14's split comparison, in the words the house-rule note uses. */
const SPLIT_RULE_LABELS: Readonly<Record<SplitRule, string>> = Object.freeze({
  equalValue: 'Equal value',
  equalRank: 'Equal rank',
});

/** SPEC 14's theme trio, in SPEC 14's order. */
const THEME_LABELS: Readonly<Record<Theme, string>> = Object.freeze({
  system: 'System',
  light: 'Light',
  dark: 'Dark',
});

/** SPEC 14's reduced-motion pair, in SPEC 14's order. */
const MOTION_SETTING_LABELS: Readonly<Record<MotionSetting, string>> = Object.freeze({
  system: 'System',
  always: 'Always',
});

/**
 * The slider's granularity: one percent of full volume, fine enough to land on
 * the engine's own clamps and coarse enough to tab through.
 */
const VOLUME_STEP = 0.01;

/** The three boolean house rules, which are toggles rather than pairs. */
type RuleToggle = 'doubleAfterSplit' | 'surrender' | 'evenMoney';

const RULE_TOGGLE_LABELS: Readonly<Record<RuleToggle, string>> = Object.freeze({
  doubleAfterSplit: 'Double after split',
  surrender: 'Surrender',
  evenMoney: 'Even money',
});

/**
 * One setting as a row: its label, the group of controls, and the note that
 * says when it takes effect where it has one.
 */
function settingRow(label: string, group: HTMLElement): HTMLElement {
  return el('div', {
    className: 'bj-setting',
    children: [el('p', { className: 'bj-setting__label', text: label }), group],
  });
}

/** The Settings panel: SPEC 14's whole list, since `BJ-20` item `I5`. */
function settingsPanel(actions: ChromeActions): Component {
  const modeButtons = new Map<CoachMode, HTMLButtonElement>();
  const group = el('div', {
    className: 'bj-modes',
    attributes: { role: 'group', 'aria-label': 'Strategy coach' },
  });
  for (const mode of COACH_MODES) {
    const control = button(
      MODE_LABELS[mode],
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

  // SPEC 14's first house rule: the shoe size, as the pair SPEC 4.1 allows. A
  // pair rather than a toggle, because "6 or 8, and there is no third" is a
  // choice between two named things rather than a yes.
  const deckButtons = new Map<DeckCount, HTMLButtonElement>();
  const decks = el('div', {
    className: 'bj-modes',
    attributes: { role: 'group', 'aria-label': 'Shoe size' },
  });
  for (const count of DECK_COUNTS) {
    const control = button(
      `${String(count)} decks`,
      () => {
        actions.setRules({ decks: count });
      },
      { className: 'bj-button', attributes: { 'data-decks': String(count) } },
    );
    deckButtons.set(count, control);
    decks.append(control);
  }

  /**
   * The staged house rules as the panel holds them between frames.
   *
   * The toggles' inversions read against a copy because a click handler has no
   * access to the frame's state; the copy is re-taken from `stagedRules`
   * whenever the composition root replaces the record, which is every change
   * any control made, so the copy and the real stage cannot come apart.
   */
  let held: {
    decks: DeckCount;
    doubleAfterSplit: boolean;
    surrender: boolean;
    evenMoney: boolean;
    splitRule: SplitRule;
  } = {
    decks: DEFAULT_RULES.decks,
    doubleAfterSplit: DEFAULT_RULES.doubleAfterSplit,
    surrender: DEFAULT_RULES.surrender,
    evenMoney: DEFAULT_RULES.evenMoney,
    splitRule: DEFAULT_RULES.splitRule,
  };

  // SPEC 14's three house-rule toggles. One button each, pressed when the rule
  // is on, because a toggle is what each of them is: `aria-pressed` carries the
  // state to a screen reader and the pressed style carries it to an eye.
  const ruleButtons = new Map<RuleToggle, HTMLButtonElement>();
  const toggles = el('div', {
    className: 'bj-modes',
    attributes: { role: 'group', 'aria-label': 'House-rule toggles' },
  });
  for (const key of ['doubleAfterSplit', 'surrender', 'evenMoney'] as const) {
    const control = button(
      RULE_TOGGLE_LABELS[key],
      () => {
        actions.setRules({ [key]: !held[key] });
      },
      { className: 'bj-button', attributes: { 'data-rule': key } },
    );
    ruleButtons.set(key, control);
    toggles.append(control);
  }

  // SPEC 14's split comparison, as the pair of readings SPEC 4.6 offers.
  const splitButtons = new Map<SplitRule, HTMLButtonElement>();
  const splitComparison = el('div', {
    className: 'bj-modes',
    attributes: { role: 'group', 'aria-label': 'Split comparison' },
  });
  for (const rule of ['equalValue', 'equalRank'] as const) {
    const control = button(
      SPLIT_RULE_LABELS[rule],
      () => {
        actions.setRules({ splitRule: rule });
      },
      { className: 'bj-button', attributes: { 'data-split-rule': rule } },
    );
    splitButtons.set(rule, control);
    splitComparison.append(control);
  }

  // SPEC 14's sound: the volume half, beside the play screen's mute. A real
  // `<input type="range">`, which the platform operates by pointer, by touch
  // and by arrow key, and whose `input` event is the one listener under
  // `src/ui/` that is not an activation: it is a continuous control reporting
  // its own movement, and the listener census carries it for that reason.
  const volume = el('input', {
    className: 'bj-volume',
    attributes: {
      type: 'range',
      'data-control': 'volume',
      'aria-label': 'Volume',
      min: String(MIN_VOLUME),
      max: String(MAX_VOLUME),
      step: String(VOLUME_STEP),
    },
  });
  const volumeText = el('p', { className: 'bj-panel__note' });
  // Two events, one gain and one write. `input` fires on every step of a drag
  // and moves the engine's gain live, uncommitted; `change` fires once, when
  // the gesture ends, and is the write. The `BJ-20` review measured the
  // one-event shape at 40 synchronous localStorage writes for a single drag
  // of the track, which is a storm SPEC 14's "take effect immediately" never
  // asked for: immediacy is the gain, and the document needs only the value
  // the finger settled on.
  volume.addEventListener('input', () => {
    const value = Number.parseFloat(volume.value);
    if (Number.isFinite(value)) {
      actions.setVolume(value, false);
    }
  });
  volume.addEventListener('change', () => {
    const value = Number.parseFloat(volume.value);
    if (Number.isFinite(value)) {
      actions.setVolume(value, true);
    }
  });
  const sound = el('div', { className: 'bj-setting', children: [volume, volumeText] });

  // SPEC 14's theme, as the trio that section lists.
  const themeButtons = new Map<Theme, HTMLButtonElement>();
  const themes = el('div', {
    className: 'bj-modes',
    attributes: { role: 'group', 'aria-label': 'Theme' },
  });
  for (const theme of THEMES) {
    const control = button(
      THEME_LABELS[theme],
      () => {
        actions.setTheme(theme);
      },
      { className: 'bj-button', attributes: { 'data-theme': theme } },
    );
    themeButtons.set(theme, control);
    themes.append(control);
  }

  // SPEC 14's reduced motion, as the pair that section prints.
  const motionButtons = new Map<MotionSetting, HTMLButtonElement>();
  const motions = el('div', {
    className: 'bj-modes',
    attributes: { role: 'group', 'aria-label': 'Reduced motion' },
  });
  for (const setting of MOTION_SETTINGS) {
    const control = button(
      MOTION_SETTING_LABELS[setting],
      () => {
        actions.setReducedMotion(setting);
      },
      { className: 'bj-button', attributes: { 'data-motion-setting': setting } },
    );
    motionButtons.set(setting, control);
    motions.append(control);
  }

  /**
   * Whether the confirmation is asking its question. Panel state, held here
   * for the reason the readout panel holds its count: a confirm dialog is the
   * one piece of a settings panel that is genuinely a flow rather than a value.
   * It is disarmed whenever the panel itself closes, so a re-opened Settings
   * never inherits an armed reset from a session that only looked at it.
   */
  let confirming = false;

  // SPEC 14's Reset all data, behind the confirmation the same section
  // requires. The confirm group is inside the panel, which is inside the
  // overlay host the focus policy already traps, so it takes the existing
  // dialog route rather than inventing a second overlay SPEC 10 does not have.
  const resetNote = el('p', {
    className: 'bj-panel__note',
    // SPEC 14's own sentence, which item `I5` grades: progress is this
    // browser's business and nobody else's.
    text: 'Progress is stored in this browser only and can be cleared by the browser itself.',
  });
  const reset = button(
    'Reset all data',
    () => {
      confirming = true;
    },
    { className: 'bj-button', attributes: { 'data-control': 'reset-data' } },
  );
  const confirmText = el('p', {
    className: 'bj-panel__note',
    text: 'This clears best balance, statistics, milestones, unlocks, history and settings.',
  });
  const confirmReset = button(
    'Clear everything',
    () => {
      actions.resetAllData();
    },
    { className: 'bj-button bj-button--primary', attributes: { 'data-control': 'confirm-reset' } },
  );
  const cancelReset = button(
    'Cancel',
    () => {
      confirming = false;
    },
    { className: 'bj-button', attributes: { 'data-control': 'cancel-reset' } },
  );
  const confirm = el('div', {
    className: 'bj-confirm',
    attributes: { role: 'group', 'aria-label': 'Confirm reset' },
    children: [
      confirmText,
      el('div', { className: 'bj-modes', children: [confirmReset, cancelReset] }),
    ],
  });
  confirm.hidden = true;

  const inForce = el('p', { className: 'bj-rules', attributes: { 'data-field': 'house-rules' } });

  const root = el('div', {
    className: 'bj-panel',
    attributes: { 'data-panel': 'settings' },
    children: [
      el('h3', { className: 'bj-panel__heading', text: 'Strategy coach' }),
      el('p', {
        className: 'bj-panel__note',
        text:
          'Hint marks the recommended action before you act. Review names the correct one in ' +
          'the round result when yours differed.',
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
        // with the viewport and magnifies nothing, so this is the only path to
        // a larger card. Written out because a player choosing between the two
        // needs to know the browser's own control will not do it.
        text: 'Browser zoom does not enlarge the cards. This does, and it applies at once.',
      }),
      sizes,
      el('h3', { className: 'bj-panel__heading', text: 'House rules' }),
      el('p', {
        className: 'bj-panel__note',
        // SPEC 14's boundary, as the note beside the controls it governs: the
        // stage is applied at the next deal, and the statement below carries
        // what the current round is running under until then.
        text: 'Rule changes take effect at the start of the next round, never mid-round.',
      }),
      settingRow('Shoe size', decks),
      toggles,
      settingRow('Split comparison', splitComparison),
      inForce,
      el('h3', { className: 'bj-panel__heading', text: 'Sound' }),
      sound,
      el('h3', { className: 'bj-panel__heading', text: 'Appearance' }),
      settingRow('Theme', themes),
      settingRow('Reduced motion', motions),
      el('p', {
        className: 'bj-panel__note',
        // The note the Speed control's own comment promises: the chrome's
        // transitions are QUALITY-BAR 15's durations, and SPEC 5 scopes the
        // Fast multiplier to the constants it lists. Stated so nobody reads
        // their steadiness as the setting failing to reach.
        text: 'Speed shortens the pauses of the game, not of this panel.',
      }),
      el('h3', { className: 'bj-panel__heading', text: 'Data' }),
      resetNote,
      reset,
      confirm,
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

      // The house rules, read off the staged record rather than the machine's:
      // SPEC 14 keeps a change off the felt until the next deal, and a control
      // that snapped back to the rules in force would be a control that looked
      // like it did nothing.
      held = {
        decks: state.stagedRules.decks,
        doubleAfterSplit: state.stagedRules.doubleAfterSplit,
        surrender: state.stagedRules.surrender,
        evenMoney: state.stagedRules.evenMoney,
        splitRule: state.stagedRules.splitRule,
      };
      for (const [count, control] of deckButtons) {
        setAttribute(control, 'aria-pressed', String(count === held.decks));
      }
      for (const [key, control] of ruleButtons) {
        setAttribute(control, 'aria-pressed', String(held[key]));
      }
      for (const [rule, control] of splitButtons) {
        setAttribute(control, 'aria-pressed', String(rule === held.splitRule));
      }

      // The statement of the rules in force, which is the read-only sentence
      // this panel carried before it grew controls, and which now doubles as
      // the honest answer to "has my change landed yet".
      const house = state.readout.rules;
      setText(
        inForce,
        `This round runs ${String(house.decks)} decks. Dealer stands on all 17s. ` +
          `Double after split ${house.doubleAfterSplit ? 'on' : 'off'}. ` +
          `Surrender ${house.surrender ? 'on' : 'off'}. ` +
          `Even money ${house.evenMoney ? 'on' : 'off'}. ` +
          `Split on ${house.splitRule === 'equalValue' ? 'equal value' : 'equal rank'}.`,
      );

      // The volume slider and its reading. Written from the engine's clamped
      // value, so the slider and the gain cannot disagree; the write is
      // guarded so a drag in progress is never yanked back mid-movement.
      const wanted = String(state.volume);
      if (volume.value !== wanted) {
        volume.value = wanted;
      }
      // `state.volume` is already the fraction `percent` takes, so it goes
      // straight in: `percentOfHundred` is for a value that arrives as a
      // percentage already, and multiplying by 100 to have it divided again is
      // exactly the round trip that entry point exists to stop.
      setText(volumeText, `Volume ${percent(state.volume)} of full.`);

      for (const [theme, control] of themeButtons) {
        setAttribute(control, 'aria-pressed', String(theme === state.theme));
      }
      for (const [setting, control] of motionButtons) {
        setAttribute(control, 'aria-pressed', String(setting === state.reducedMotion));
      }

      // The confirmation, hidden until asked and disarmed when the panel
      // itself goes, so a reset is never armed in a panel nobody is looking at.
      if (state.overlay !== 'settings') {
        confirming = false;
      }
      setHidden(confirm, !confirming);
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
              text: milestoneRowText(id, awarded),
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
