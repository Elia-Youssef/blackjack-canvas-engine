/**
 * What the DOM sync step is given, and what the chrome may ask the game to do.
 *
 * DESIGN section 3 step 5 is "sync the DOM chrome from state". One value in,
 * every component reads what it needs off it, and no component holds state of
 * its own beyond the elements it built. That is what makes the sync step
 * idempotent: running it twice on the same state produces the same DOM, which
 * is the property a per-frame sync depends on.
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
import type { MilestoneId, StatisticsReadout } from '../core/statistics';
import type { CoachMode, CoachVerdict } from '../core/strategy';
import type { RejectionLayer, RejectionReason, Speed, TableReadout } from '../core/table';
import type { Intent, IntentKind } from '../core/types';
import type { Motion } from '../render/animate';
import type { SurfaceSize } from '../render/surface';
import type { BreakpointName } from './breakpoints';

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
 * The layer travels with the reason because the three are different sentences
 * about different things, and because a reader of this record should be able to
 * tell "you cannot bet now" from "that is more than the table takes" without
 * decoding the reason to work it out.
 */
export interface Notice {
  readonly intent: IntentKind;
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
  /** SPEC 9's awarded milestones, in award order. */
  readonly milestones: readonly MilestoneId[];
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
   * `table.setSpeed`, which is the only thing about a built table that moves.
   */
  setSpeed(speed: Speed): void;
  /**
   * SPEC 14's play-surface size. `BJ-16`, item `F6`.
   *
   * The second presentation setting, and it takes the first one's route for the
   * same reason: SPEC 14 groups Speed and play-surface size as the two settings
   * that "take effect immediately, mid-round included, because neither can
   * change an outcome", so neither is an intent and neither waits for a round
   * boundary. The composition root applies it to the next frame's surface plan,
   * which is the only thing it touches.
   */
  setSurfaceSize(size: SurfaceSize): void;
}

/** One assembled piece of chrome: its root element, and how it is synced. */
export interface Component {
  /**
   * One frame's sync.
   *
   * `dt` is the seconds since the previous frame, the same delta the machine and
   * the play surface were given. Every component but the readouts ignores it:
   * the sync step is a pure function of `state` and running it twice on one
   * state produces the same DOM. SPEC 5's balance count-up is the one exception
   * in the whole chrome, it holds the number it is currently showing, and its
   * own header says so.
   */
  update(state: ChromeState, dt: number): void;
  readonly root: HTMLElement;
}
