/**
 * What the DOM sync step is given, and what the chrome may ask the game to do.
 *
 * DESIGN section 3 step 5 is "sync the DOM chrome from state". One value in,
 * every component reads what it needs off it, and three components hold state of
 * their own beyond the elements they built: SPEC 5's balance count-up, the
 * announcement queue and the settings panel's reset confirmation, each named at
 * its own declaration. For every other component the sync step is idempotent,
 * running it twice on the same state produces the same DOM, which is the
 * property a per-frame sync depends on.
 *
 * **The overlay is on this state and is not an intent.** SPEC 10 makes
 * Settings, How to Play and Statistics "reachable at any time and never
 * blocking state", and `core/types.ts` records why they are absent from the
 * intent union: an overlay intent would sit in the legality table as three rows
 * legal in all eleven phases, and would invite a later part to route a real
 * transition through one. Which overlay is open is chrome state, held by the
 * chrome, and item `C5` grades that opening and closing one changes nothing in
 * the machine.
 */

import type { History } from '../core/history';
import type { HouseRules } from '../core/rules';
import type { MilestoneId, StatisticsReadout } from '../core/statistics';
import type { CoachAction, CoachMode, CoachVerdict } from '../core/strategy';
import type { RejectionLayer, RejectionReason, Speed, TableReadout } from '../core/table';
import type { Intent } from '../core/types';
import type { Motion } from '../render/animate';
import type { SurfaceSize } from '../render/surface';
import type { BreakpointName } from './breakpoints';
import type { MotionSetting } from './motion';
import type { Theme } from './theme';

/** SPEC 10's three overlays, and there is no fourth. */
export type OverlayId = 'settings' | 'howToPlay' | 'statistics';

/** The three, in the order they appear in the chrome. */
export const OVERLAY_IDS: readonly OverlayId[] = Object.freeze([
  'settings',
  'howToPlay',
  'statistics',
]);

/** The title each overlay carries, and the label of the control that opens it. */
export const OVERLAY_TITLES: Readonly<Record<OverlayId, string>> = Object.freeze({
  settings: 'Settings',
  howToPlay: 'How to Play',
  statistics: 'Statistics and history',
});

/**
 * One refused action, as the chrome shows it. SPEC 4.11's "with a reason
 * surfaced to the player".
 *
 * The layer travels with the reason because the two are different sentences
 * about different things, and because a reader of this record should be able to
 * tell "you cannot bet now" from "that is more than the table takes" without
 * decoding the reason to work it out.
 *
 * **The refused intent does not travel with them** (`AUDIT-2`, finding
 * `X3-07`). It was carried to the DOM boundary and dropped there:
 * `components/notice.ts` renders the reason and the layer and writes no
 * `data-intent`, so the field was filled on every refusal and read by nothing.
 * A control that needs to know which intent was refused has the reason, which
 * is the half the player is shown.
 */
export interface Notice {
  readonly layer: RejectionLayer;
  readonly reason: RejectionReason;
}

/**
 * One coach verdict, and the hand it was made on. SPEC 12 and item `C8`.
 *
 * `CoachVerdict` carries no hand index, because `strategy.ts` compares one
 * decision and has no idea how many hands the round is carrying. SPEC 12 prints
 * the round result **per hand**, so the index is attached where it is known:
 * the composition root observes a decision at the moment the machine accepts it,
 * and `phase.activeHand` is what SPEC 4.6 was playing at that moment.
 *
 * **The index is stable for the life of the round.** A split inserts the new
 * hand immediately after the active one, so only hands to the right of the
 * active hand ever shift, and those have not been decided yet: hands are played
 * left to right, so by the time a hand is active no further insertion can
 * happen to its left.
 */
export interface HandVerdict {
  /** The index into `readout().hands`, which is SPEC 4.6's play order. */
  readonly hand: number;
  readonly verdict: CoachVerdict;
}

/**
 * What the frame resolved about the shape of the page. `BJ-16`.
 *
 * The chrome writes all three onto the shell as attributes and the stylesheet
 * selects on them, which is why they travel on the state rather than being read
 * off the platform by a component: `src/ui/breakpoints.ts` explains why the
 * breakpoint cannot be a media query, and a component that measured the viewport
 * for itself would be a second answer to a question the frame has already
 * answered once, exactly as a second reduced-motion read would be.
 */
export interface LayoutState {
  /** QUALITY-BAR section 5's four, resolved by width first. Item `F1`. */
  readonly breakpoint: BreakpointName;
  /** Whether both bars stick at this viewport height. Item `F7`. */
  readonly stickyBars: boolean;
  /** SPEC 14's play-surface size, in percent. Item `F6`. */
  readonly surfaceSize: SurfaceSize;
}

/** Everything the chrome renders from, as one frozen snapshot per frame. */
export interface ChromeState {
  /** The shape of the page this frame. `BJ-16`, items `F1`, `F3`, `F6`, `F7`. */
  readonly layout: LayoutState;
  /** The machine's own snapshot. The only authority on the game. */
  readonly readout: TableReadout;
  /** SPEC 11's session and lifetime counters, assembled by `statistics.ts`. */
  readonly statistics: StatisticsReadout;
  /** SPEC 8's last 50 rounds, newest first. */
  readonly history: History;
  /** SPEC 9's awarded milestones, in award order. The whole standing list. */
  readonly milestones: readonly MilestoneId[];
  /**
   * SPEC 9's milestones **this frame** awarded, in award order. Usually empty.
   *
   * The standing list above answers "has this been awarded"; this one answers
   * "was it awarded just now", which is the announcer's question and the audio
   * cue's. Both come from the list `observeRound` returns rather than from a
   * difference of two records taken in the chrome.
   */
  readonly awarded: readonly MilestoneId[];
  /** SPEC 7's coach mode. `off` shows nothing and counts nothing. */
  readonly coachMode: CoachMode;
  /**
   * SPEC 7's review verdicts for the round being shown, or `null` when the
   * coach was off for it. Empty means the coach was on and the round offered no
   * decision the chart has an opinion about, which is a different sentence.
   */
  readonly verdicts: readonly HandVerdict[] | null;
  /** The most recent refusal, or `null` once an action has been accepted. */
  readonly notice: Notice | null;
  /** Which overlay is open, or `null`. Chrome state, never the machine's. */
  readonly overlay: OverlayId | null;
  /**
   * The frame's resolved motion policy. `BJ-14`, items `E7` and `E9`.
   *
   * It carries SPEC 5's Speed as well as the reduced-motion flag, so the Speed
   * control reads its own pressed state off the same value the machine and the
   * play surface were given rather than off a third copy kept in the chrome.
   */
  readonly motion: Motion;
  /**
   * Whether the platform is in forced colors this frame. `BJ-18`, item `G9`.
   *
   * On the state for the reason the motion policy is: the composition root asks
   * the platform once per frame and hands the same answer to both halves of the
   * presentation, so the stylesheet's own reading of the media query and the
   * renderer's palette selection cannot disagree about which mode the frame is
   * in. The chrome writes it onto the shell as an attribute, which is what lets
   * a browser spec see what the page resolved rather than what it emulated.
   */
  readonly forcedColors: boolean;
  /**
   * SPEC 14's mute, as the frame resolved it. `BJ-19`, item `K3`.
   *
   * The audio engine owns the value; this is the copy the sync step renders
   * the mute control from, on the same terms the Speed control reads
   * `motion.speed` rather than keeping a second copy in the chrome. The
   * composition root sets it from the engine every frame, so a control
   * pressed on screen and a gain applied under the page cannot disagree
   * about whether the game is quiet.
   */
  readonly muted: boolean;
  /**
   * SPEC 14's volume, after the engine's clamping. `BJ-20`, item `I5`.
   *
   * On `muted`'s terms exactly: the engine owns the value, this is the copy
   * the slider renders, and the composition root sets it from the engine
   * every frame so the two cannot disagree.
   */
  readonly volume: number;
  /**
   * SPEC 14's theme. `BJ-20`, item `E2`.
   *
   * The word, not the resolved palette: the stylesheet resolves it against
   * `prefers-color-scheme`, which is the clause "follows the query by
   * default, and the override wins in both directions". The chrome writes
   * the one `data-theme` attribute the stylesheet answers to.
   */
  readonly theme: Theme;
  /**
   * SPEC 14's reduced-motion setting, as the word. `BJ-20`, item `I5`.
   *
   * `motion.reducedMotion` beside it is what the frame resolved this word
   * and the platform query to; the word is what the Settings control offers
   * and what persists.
   */
  readonly reducedMotion: MotionSetting;
  /**
   * SPEC 14's house rules staged for the next round, or `null` when the next
   * round runs under the rules in force. `BJ-20`, corrected at `AUDIT-2`.
   *
   * Deliberately not `readout.rules`, which are the rules in force: SPEC 14
   * applies a change "at the start of the next round, never mid-round", so
   * between the change and that boundary the two records differ, and the
   * panel's pressed states must show what the player chose rather than snap
   * back to what the round is running under.
   *
   * **It is the machine's own `stagedRules()` and not a second copy of it.**
   * The composition root kept a parallel record and published that, so the
   * panel's toggles and the panel's own sentence about the rules in force were
   * two answers to one question and contradicted each other for the whole of
   * the betting screen (finding `J2-02`), while the accessor the machine
   * published for exactly this shipped uncalled (finding `Z2-01`). `null` is
   * load-bearing rather than a convenience: it is what tells the panel to
   * describe the round instead of the deal to come, and the machine resolves a
   * stage equal to the rules in force to it.
   */
  readonly stagedRules: HouseRules | null;
  /**
   * SPEC 7's hint for the hand in front of the player, or `null`. `BJ-20`,
   * item `J4`.
   *
   * Null everywhere except `playerTurn` under the hint mode. The actions
   * component reads it to mark the recommended control; nothing may use it
   * to refuse or delay one, because "the coach never blocks an action" is
   * the clause the item exists for.
   */
  readonly hint: CoachAction | null;
  /**
   * Whether anything written now will still be there next session.
   * QUALITY-BAR section 8's last clause, `AUDIT-1` and `AUDIT-2`.
   *
   * `storage/store.ts` answers `durable: false` on the arm where the probe was
   * refused, which is a browser with site data blocked or a private mode that
   * throws on the property access, and `persistence.ts` runs a memory fallback
   * behind it so the session plays normally and carries nothing. The whole
   * apparatus was built and tested at `BJ-11` and read by nothing, so Settings
   * stated "stored in this browser only" in the one session where nothing is
   * stored at all.
   *
   * **It is the carry rather than the probe, and it is read per frame.**
   * `AUDIT-2`, finding `J3-02`: a quota-full origin resolves `window
   * .localStorage` perfectly well and then throws on every `setItem`, which
   * loses the same session in the same way and answered `durable: true`. The
   * measured session played three rounds, changed Speed and theme, stored
   * nothing, and reloaded to a light theme with no statistics and no
   * explanation anywhere on the page. `persistence.readout().carryDegraded` is
   * both routes, and unlike the probe's answer it genuinely moves during a
   * session, so it is taken every frame rather than once at boot. The graded
   * SPEC 14 sentence is untouched; this decides whether a second, sibling note
   * sits under it, and the announcement queue says it once at the edge.
   */
  readonly carryDegraded: boolean;
}

/**
 * SPEC 11's "current wager": the money actually at stake this frame.
 * `AUDIT-2`, finding `J2-01`.
 *
 * **`wallet.wager` is the wager being built at the controls, and nothing more.**
 * `commitInitial` sets it to zero the instant a deal is accepted, so a readout
 * that showed it read 0 on every frame of `dealing`, `peek`, `insurance`,
 * `playerTurn`, `reveal`, `dealerTurn`, `settling` and `roundResult` while 460
 * or 100 and 100 sat on the table. SPEC 11 asks for a continuous readout and
 * DESIGN section 4 keeps this one of only three in the top bar below 768 px,
 * where the other eleven are behind the disclosure: one of the three was dead
 * for the whole of every hand, at the width that can least afford it.
 *
 * **The rule is phase-free, because the hands are the fact.** With no hand in
 * play there is nothing at stake and the pending wager is what the player is
 * building; with hands in play the money at stake is their wagers, summed,
 * which is the same number `wallet.committed` carries during the round and the
 * right one at SPEC 10's round result, where the hands are still on the felt
 * with their wagers and `committed` has already been swept to zero.
 *
 * **The sum rather than the active hand's own wager**, because this readout
 * sits beside the balance and answers "what is this round costing me": a split
 * of two hands of 100 has 200 at stake, and the per-hand figure is already in
 * the mirror's own name for each hand and in SPEC 12's per-hand result. SPEC
 * 4.7's insurance stake is deliberately not added: it is a side bet with its own
 * screen and its own sentence, and folding it in would make one number answer
 * two questions.
 *
 * One reading, here, because the readouts panel and the accessibility mirror
 * both state it and a second derivation is how they came to disagree.
 */
export function wagerAtStake(readout: TableReadout): number {
  const { hands, wallet } = readout;
  if (hands.length === 0) {
    return wallet.wager;
  }
  return hands.reduce((total, hand) => total + hand.wager, 0);
}

/**
 * What a control may ask for. Three kinds, and the split is SPEC 10's.
 *
 * `queue` is the only route from a control to the game, and it queues rather
 * than applies: DESIGN section 3 drains at most one accepted intent per frame
 * and discards the rest when the phase changes underneath them, which is what
 * stops a click aimed at a screen that has gone from being judged against the
 * screen that replaced it. A control that called `apply` directly would defeat
 * that, so no component is handed a `Table`.
 */
export interface ChromeActions {
  /** Queue one of SPEC 10's eighteen intents. */
  queue(intent: Intent): void;
  /** Open one of SPEC 10's three overlays, or close whichever is open. */
  openOverlay(id: OverlayId): void;
  closeOverlay(): void;
  /** SPEC 7 and SPEC 14: the coach is "toggleable at any time". */
  setCoachMode(mode: CoachMode): void;
  /**
   * SPEC 5's Speed. SPEC 14: it "takes effect immediately, mid-round included".
   *
   * Not an intent, and for the same reason the overlays are not: it decides no
   * transition, so a row in SPEC 10's legality table saying it is legal in all
   * eleven phases would say nothing. The composition root passes it straight to
   * `table.setSpeed`, the only presentation setting the machine itself holds.
   */
  setSpeed(speed: Speed): void;
  /**
   * SPEC 14's play-surface size. `BJ-16`, item `F6`.
   *
   * The second presentation setting, and it takes the first one's route for
   * the same reason: SPEC 14 groups Speed and play-surface size as the two settings
   * that "take effect immediately, mid-round included, because neither can
   * change an outcome", so neither is an intent and neither waits for a round
   * boundary. The composition root applies it to the next frame's surface plan,
   * which is the only thing it touches.
   */
  setSurfaceSize(size: SurfaceSize): void;
  /**
   * SPEC 14's sound, and item `K3`'s single action: toggle the master mute.
   *
   * Not an intent and not an overlay, for the two reasons the settings above
   * are not: it decides no transition, and it must be reachable in one press
   * from the play screen rather than from inside a panel. The composition
   * root wires it to the audio engine, which is the one thing that holds the
   * value. The volume half SPEC 14 also lists is `setVolume` below, which
   * `BJ-20` added as its own action when the slider landed; it is the same
   * route to the same engine, and it is separate because a slider commits on
   * the gesture's end and a toggle has no such moment.
   */
  toggleMuted(): void;
  /**
   * SPEC 14's volume. `BJ-20`, item `I5`.
   *
   * The slider's route to the engine, beside `toggleMuted` for the same
   * reason that action exists: the control is inside the Settings panel but
   * the value belongs to the engine, and a second holder of it is how the
   * slider and the gain start disagreeing. `commit` is the write: a drag's
   * `input` stream moves the gain with it uncommitted, and the gesture's end
   * commits once, so a slide is one localStorage write rather than one per
   * step (the `BJ-20` review measured forty).
   */
  setVolume(volume: number, commit: boolean): void;
  /**
   * SPEC 14's theme. `BJ-20`, item `E2`. The word is stored; the chrome
   * resolves it to the attribute the stylesheet selects on.
   */
  setTheme(theme: Theme): void;
  /**
   * SPEC 14's reduced-motion setting. `BJ-20`, item `I5`.
   */
  setReducedMotion(setting: MotionSetting): void;
  /**
   * SPEC 14's house rules, staged for the next round. `BJ-20`.
   *
   * A patch rather than a record, so the panel changes one toggle without
   * restating the other four, which is how a default drifts out of a caller.
   * The composition root merges, stages and saves; the machine applies at
   * the next deal, which is SPEC 14's boundary.
   */
  setRules(rules: Partial<HouseRules>): void;
  /**
   * SPEC 14's Reset all data, behind its confirmation. `BJ-20`, item `I5`.
   *
   * The confirm dialog is chrome state the panel holds; this action is the
   * one that fires when the player confirms.
   */
  resetAllData(): void;
}

/** One assembled piece of chrome: its root element, and how it is synced. */
export interface Component {
  /**
   * One frame's sync.
   *
   * `dt` is the seconds since the previous frame, the same delta the machine and
   * the play surface were given. Two components spend it: SPEC 5's balance
   * count-up, which holds the number it is currently showing, and QUALITY-BAR
   * section 4's announcement queue, which spaces its writes by it. For every
   * component but those two, and the settings panel's reset confirmation, the
   * sync step is a pure function of `state` and running it twice on one state
   * produces the same DOM. Each of the three says so in its own header.
   */
  update(state: ChromeState, dt: number): void;
  readonly root: HTMLElement;
}
