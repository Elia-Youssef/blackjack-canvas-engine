/**
 * The composition root. `BJ-15`.
 *
 * `BJ-0` left a bootstrap seam here and one boot marker, and said that what
 * happens inside it belongs to the part that owns it. This is that part: the
 * machine, the play surface, the frame loop and the DOM chrome are composed
 * here, and nowhere else in the project does one module know about all four.
 *
 * DESIGN section 3's frame, in its five steps, is the whole of `frame` below:
 *
 *   1. drain the queued input intents
 *   2. apply at most one accepted intent, discarding the rest of the queue if it
 *      changed the phase
 *   3. `table.update(dt)`, with the delta clamped inside the machine
 *   4. render the play surface
 *   5. sync the DOM chrome from state
 *
 * Steps 1 and 2 are one call here, `table.drain()`, because the machine owns
 * both: the discard rule is a property of the queue and not of the caller, which
 * is why `drainInput` below queues nothing and decides nothing about legality.
 *
 * Input is drained before the update so a press takes effect on the frame it
 * happens, and the DOM is synced after the render so the chrome shows the same
 * state the canvas just drew.
 *
 * **`boot` is exported and takes its options.** Three reasons, and none of them
 * is a test:
 *
 *   - `core/` has no clock and may not invent a session seed (item `M3`), so
 *     SPEC 4.1's seed has to arrive from outside `core/` and this is outside.
 *   - SPEC 13's persisted document, the best chip balance, the selected table,
 *     the statistics, the history, the settings and the coach record, is loaded
 *     at `BJ-20` exactly here, saved at the round boundary and on setting
 *     changes, and written once more on the way out of sight. `src/storage/`
 *     is imported by this file and by nothing else outside its own directory,
 *     which keeps the load, the save and the reset each at one caller.
 *   - The browser gate needs a known deal over the shipped bundle, and a
 *     parameterised entry point is the smallest way to give it one. It is the
 *     same device `TableOptions.seed` and `TableOptions.shoe` already are in
 *     `core/`: disclosed, off every path a player can take, and unable to change
 *     what an unparameterised boot does.
 *
 * Calling `boot` a second time disposes the first game before building the
 * second. That is not a convenience: two live frame loops writing one canvas is
 * a defect that would be invisible until it was not, and a composition root that
 * can be called twice has to answer for it.
 *
 * **The error boundary is here, and it is one wrapper and one call.** `BJ-21`,
 * item `M4`, QUALITY-BAR section 12. The frame callback handed to the loop is
 * wrapped in `boundary.run`, which is the criterion's "thrown error from the
 * loop"; the other two routes are the page-level listeners `src/ui/recovery.ts`
 * installs, and all three end in the same stop and the same panel. The stop is
 * `dispose` on the game this module last built, so the loop, every listener and
 * the shell go together and nothing is left half alive.
 *
 * There is still no `catch` in this file. The one `try` in the project's chrome
 * is inside `recovery.ts`, where the value it catches is read and reported;
 * wrapping the loop here without that panel would swallow the failure and leave
 * a frozen canvas, which is the defect item `M4` exists to prevent.
 *
 * **The feature test runs before the boot, and before anything that could
 * throw for want of a platform.** `BJ-21`, item `A5`. `start` below asks
 * `src/ui/capability.ts` what is missing and mounts the page's own notice
 * instead of booting when the answer is not empty. Nothing this module imports
 * touches a gated platform API while it is being evaluated, which is what makes
 * "before anything that would throw" true of the bundle and not only of this
 * file.
 */

import { record as recordRound, type History } from './core/history';
import { houseRules, type HouseRules } from './core/rules';
import {
  observeBankrollReset,
  observeRound,
  openSession as openStatisticsSession,
  statisticsReadout,
  type Statistics,
} from './core/statistics';
import {
  actionOf,
  observe,
  openSession as openCoachSession,
  recommend,
  situationAt,
  strategyTable,
  type CoachAction,
  type CoachMode,
  type CoachRecord,
} from './core/strategy';
import {
  createTable,
  type Speed,
  type Table,
  type TableOptions,
  type TableReadout,
} from './core/table';
import type { Intent, IntentKind, SettledHand } from './core/types';
import { createWallet, tableLimits, type TableId } from './core/wallet';
import { PACING_NAMES, resolveMotion, type Motion } from './render/animate';
import {
  createPlaySurface,
  type FanReading,
  type PlaySurface,
  type SceneState,
} from './render/scene';
import type { SurfaceSize } from './render/surface';
import { surfacePalette, type SelectedPalette } from './render/tokens';
import {
  createAudioEngine,
  type AudioEngine,
  type CueId,
} from './ui/audio';
import { cuesFor, type CueFrame } from './ui/cues';
import {
  barsStick,
  planSurface,
  resolveBreakpoint,
  sameSizing,
  type BreakpointName,
  type ChromeHeights,
  type StageBox,
  type SurfacePlan,
  type Viewport,
} from './ui/breakpoints';
import type { QueueState } from './ui/announce';
import { createChrome } from './ui/chrome';
import { resolvedLocale } from './ui/format';
import { createForcedColorsPreference, type ForcedColorsPreference } from './ui/forced-colors';
import { missingCapabilities, showUnsupportedNotice } from './ui/capability';
import { createFeltLayer, type Shell } from './ui/layout';
import { createFrameLoop, type FrameLoop } from './ui/loop';
import { createErrorBoundary, type ErrorBoundary } from './ui/recovery';
import {
  alwaysReduceOf,
  createMotionPreference,
  type MotionPreference,
  type MotionSetting,
} from './ui/motion';
import type { Theme } from './ui/theme';
import type {
  ChromeActions,
  ChromeState,
  HandVerdict,
  LayoutState,
  Notice,
  OverlayId,
} from './ui/state';
import type { GameDocument } from './storage/document';
import { openPersistence, type Persistence } from './storage/persistence';

import './ui/tokens.css';
import './ui/chrome.css';

export const GAME_ID = 'blackjack';

/**
 * The play surface's logical space, its two framings and the floor it is drawn
 * at all moved to `src/ui/breakpoints.ts` at `BJ-16`, with the breakpoint table
 * that decides between them. What is left here is the platform reading:
 * `planSurface` is a pure function of a box, a breakpoint, a size setting and a
 * device pixel ratio, and this is the only file that knows where any of the four
 * comes from.
 */

/** Everything the composition root holds beside the machine. SPEC 13's set. */
export interface SessionState {
  readonly statistics: Statistics;
  readonly history: History;
  readonly coach: CoachRecord;
  readonly coachMode: CoachMode;
  /**
   * SPEC 5's Speed. `BJ-14`, item `E9`.
   *
   * In the session value rather than only inside the machine, because SPEC 13
   * persists the settings and this is the shape `BJ-20` writes. `E9`'s
   * "persists" clause is ruled to close there, at that part's reload specs; what
   * `BJ-14` owes it is a value in a serialisable shape, which this is, and a
   * setting whose only home is the machine so a restore has one place to put it.
   */
  readonly speed: Speed;
  /**
   * QUALITY-BAR section 4's play-surface size. `BJ-16`, item `F6`.
   *
   * Here for the reason `speed` is: SPEC 13 persists the settings, this is the
   * shape `BJ-20` writes, and `F6`'s "persists" clause is ruled to close there
   * on the same terms `E9`'s did. What `BJ-16` owes that part is a value in a
   * serialisable shape whose only home is this record, so a restore has one
   * place to put it and the layout has one place to read it.
   */
  readonly surfaceSize: SurfaceSize;
  /**
   * SPEC 14's mute. `BJ-19`, item `K3`.
   *
   * Here on the Speed precedent: SPEC 13 persists the settings, `BJ-20` wires
   * the reload flows, and the "persists" clause closes there with `I4` and
   * `I5`. What `BJ-19` owes that part is the boot pass-through below, which
   * applies a restored value at the audio engine's creation exactly as
   * QUALITY-BAR section 10 asks, and this read side, so a restore has one
   * place to land and a save has one place to read.
   */
  readonly muted: boolean;
  /**
   * SPEC 14's volume, `MIN_VOLUME` to `MAX_VOLUME`. `BJ-19`, item `K3`, on the
   * same terms as `muted` beside it. The slider that writes it is `I5` at
   * `BJ-20`; the engine's clamping is the only arithmetic either will need.
   */
  readonly volume: number;
  /**
   * SPEC 14's theme. `BJ-20`, item `E2`.
   *
   * On the Speed precedent: the document was the first thing that had to name
   * it, and this is the shape the save reads and the restore writes. The
   * chrome resolves it to the one `data-theme` attribute the stylesheet's
   * selectors already answer to; the play surface never sees it, because SPEC
   * 16 fixes the felt's palette across both themes.
   */
  readonly theme: Theme;
  /**
   * SPEC 14's reduced-motion setting, as the word rather than the boolean.
   * `BJ-20`, item `I5`.
   *
   * The boolean the frame resolves is `alwaysReduceOf(this) || the platform
   * query`, which is `resolveReducedMotion`'s whole rule; the word is what
   * persists and what the Settings control offers.
   */
  readonly reducedMotion: MotionSetting;
  /**
   * SPEC 17's How-to-Play seen flag. `BJ-20`, item `J7`.
   *
   * False until the player dismisses the overlay the first time, true from
   * then on, saved at the dismissal itself so a reload honours it.
   */
  readonly howToPlaySeen: boolean;
}

/**
 * What the presentation layer resolved for the last frame it drew. `BJ-14`.
 *
 * Read only, and nothing in the game reads it. It exists because item `E7`'s
 * claim is an **absence**, "removes every animation entirely", and an absence
 * cannot be observed without an instrument: a spec that watched the canvas would
 * be comparing screenshots of a felt whose grain is baked from a hash. So the
 * surface counts what is mid-tween and this reports the count, and the same
 * number is what makes the control honest, since it has to be positive under
 * no-preference or the assertion under the flag asserts nothing.
 *
 * `pacing` is the whole of item `E9`'s "every pacing constant", resolved at this
 * frame's Speed, so a spec can require the Fast table to be the Normal table
 * times 0.6 across every entry rather than across the ones it remembered.
 */
export interface MotionProbe {
  readonly reducedMotion: boolean;
  readonly speed: Speed;
  /** How many tweens the play surface had in flight on the last frame. */
  readonly tweensInFlight: number;
  /** Every pacing constant by name, in seconds, at this frame's Speed. */
  readonly pacing: Readonly<Record<string, number>>;
}

/**
 * What the layout resolved for the last frame it drew. `BJ-16`.
 *
 * Read only, and nothing in the game reads it. It is `MotionProbe`'s pattern for
 * the same kind of claim: item `F6` says the size setting "raises the
 * logical-to-CSS scale by that factor", and a scale is a number the page has no
 * other way to publish. Every field is measurable from the DOM as well, and the
 * browser specs measure the DOM first and cross-check this second, so the probe
 * cannot be the only witness to anything.
 */
export interface LayoutProbe {
  readonly breakpoint: BreakpointName;
  readonly stickyBars: boolean;
  readonly surfaceSize: SurfaceSize;
  /** The logical space this frame drew in. DESIGN section 4's two framings. */
  readonly framing: { readonly width: number; readonly height: number };
  /** CSS pixels per logical unit, at this frame's size setting. */
  readonly scale: number;
  /** The same, at 100 percent: what the layout would choose on its own. */
  readonly baseScale: number;
  /** The surface's CSS box and its backing store, in their own units. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly storeWidth: number;
  readonly storeHeight: number;
  readonly dpr: number;
  /**
   * What the last frame resolved for item `E8`'s card-legibility fan floor.
   *
   * The same rule as every other field here: the browser spec measures the
   * composited canvas first, which is where a card's width is actually
   * observable, and reads this second for the decomposition into a width, a
   * pitch and a regime that no bitmap can be asked for.
   */
  readonly fan: FanReading;
}

/**
 * What the accessibility layer resolved for the last frame. `BJ-18`.
 *
 * `MotionProbe`'s pattern, for the same kind of claim and with the same rule:
 * every field here is also observable from the DOM, and the specs measure the
 * DOM first and cross-check this second, so the probe cannot be the only witness
 * to anything. What it adds is the two things the page cannot publish as text.
 *
 * `palette` is item `G9`'s canvas half: which play-surface token set the frame
 * selected. It reported `standard-fallback` from `BJ-18` until `BJ-22`, while
 * SPEC 16 defined no high-contrast set for the play surface; the sheet gained
 * that table at `BJ-22`, the renderer draws from it, and the two names left are
 * the two sets.
 *
 * `announced` and `queue` are item `G4`'s: what each live region was last
 * written with, and what the one queue is still holding.
 */
export interface AccessibilityProbe {
  readonly forcedColors: boolean;
  readonly palette: { readonly name: SelectedPalette['name']; readonly flatFelt: boolean };
  readonly announced: { readonly polite: string | null; readonly assertive: string | null };
  readonly queue: QueueState;
}

/**
 * What the audio layer resolved, and what it was offered. `BJ-19`, item `K5`.
 *
 * `MotionProbe`'s pattern: a claim about emission cannot be observed from the
 * DOM, because a cue that found no context, or found the game muted, changed
 * nothing on the page. The counts below are the offers rather than the sounds,
 * which is the half the criterion grades: "emitted on its stated trigger
 * exactly once, and on no other trigger". `offeredInPhase` keys them by the
 * SPEC 10 screen the machine was on, which is what makes a negative control
 * writable from outside: a cue that must not fire in a phase is a key this
 * record must not carry. The browser gate reads this through the test-time
 * harness; the shipped chunk exports nothing, and the record crosses that
 * boundary as plain numbers.
 *
 * **Item `K4`'s capture rides this record, and closes later.** "Every audio
 * cue has a visual counterpart and the game is fully understandable with
 * sound off" is method D and closes at the `BJ-23` demonstration session,
 * which captures `artifacts/demos/audio-parity`; what this part ships is the
 * armour, not the closure, and the armour is this tally beside the page the
 * cues fired on, so the session can hold the two halves of the parity claim
 * in one recording.
 */
export interface AudioProbe {
  /** SPEC 14's mute, as the engine holds it. */
  readonly muted: boolean;
  /** SPEC 14's volume, after the engine's clamping. */
  readonly volume: number;
  /** Whether the first gesture has been answered, however it answered. */
  readonly started: boolean;
  /** How many times each of SPEC 15's thirteen cues has been offered. */
  readonly cues: Readonly<Record<CueId, number>>;
  /** The same counts, keyed `cue@phase`. */
  readonly cuePhases: Readonly<Record<string, number>>;
}

/** A running game. Returned by `boot`, and the handle `BJ-20` will persist. */
export interface Game {
  /** The machine's snapshot. The only authority on the game's state. */
  readout(): TableReadout;
  /**
   * What the session holds beside the machine, as one value. SPEC 13's set,
   * assembled for the save and for the harness a spec reads.
   */
  session(): SessionState;
  /** What the last frame resolved for motion. Items `E7` and `E9`. */
  motion(): MotionProbe;
  /** What the last frame resolved for the layout. Items `F1`, `F3`, `F6`. */
  layout(): LayoutProbe;
  /** What the last frame resolved for accessibility. Items `G4` and `G9`. */
  accessibility(): AccessibilityProbe;
  /** What the audio layer holds, and every cue it has been offered. Item `K5`. */
  audio(): AudioProbe;
  /** Stop the loop and take the chrome off the page. */
  dispose(): void;
}

/** What a boot may be told. Every field has a default. */
export interface BootOptions {
  /** Where the chrome is mounted. Defaults to the page's `#app`. */
  readonly root?: HTMLElement;
  /** SPEC 4.1's session seed. Defaults to the clock, which `core/` cannot read. */
  readonly seed?: number;
  /** SPEC 13's persisted table. Defaults to the one SPEC 6 never locks. */
  readonly table?: TableId;
  /** SPEC 13's persisted high-water mark, which SPEC 6 keys the unlocks to. */
  readonly bestBalance?: number;
  /** SPEC 14's house rules, as an override of the SPEC defaults. */
  readonly rules?: Partial<HouseRules>;
  /** SPEC 7's coach mode. Off by default, which SPEC 7 states. */
  readonly coachMode?: CoachMode;
  /** SPEC 5's Speed. Normal by default; SPEC 13 persists it from `BJ-20`. */
  readonly speed?: Speed;
  /** SPEC 14's play-surface size. 100 by default; SPEC 13 persists it at `BJ-20`. */
  readonly surfaceSize?: SurfaceSize;
  /**
   * Force reduced motion on, whatever the platform says. Item `E7`.
   *
   * SPEC 14's reduced-motion setting is "system / always" and item `I5` at
   * `BJ-20` builds its control; this is the "always" arm arriving early, as an
   * option rather than as a control, so the resolution rule is composed and
   * exercised from the day the flag exists. Left alone, the platform's
   * `prefers-reduced-motion` decides, which is what `E7` is graded on.
   */
  readonly alwaysReduceMotion?: boolean;
  /**
   * SPEC 14's mute, applied at the audio engine's creation. `BJ-19`, `K3`.
   *
   * The persisted-settings door `speed` and `alwaysReduceMotion` arrive
   * through, on the `E9` precedent: QUALITY-BAR section 10 wants a restored
   * mute applied at creation, so the value has to reach the engine before any
   * gesture creates a context for it to govern. Unset means unmuted, which is
   * `DEFAULT_MUTED`'s own reading; the reload that would set it is `BJ-20`.
   */
  readonly muted?: boolean;
  /**
   * SPEC 14's volume, applied at the audio engine's creation. `BJ-19`, `K3`.
   *
   * Clamped to `MIN_VOLUME` to `MAX_VOLUME` by the engine, whatever arrives.
   */
  readonly volume?: number;
}

/** The game this module last built, so a second boot can dispose the first. */
let current: Game | null = null;

/**
 * Where the last boot mounted its chrome, so a failure has somewhere to write.
 *
 * The boundary is installed once, at module scope, before any game exists, and
 * the mount point is decided per boot by `mountPoint` below. Held here rather
 * than passed in, so the panel lands where the page put the game even when the
 * page put it somewhere other than `#app`.
 */
let mounted: HTMLElement | null = null;

/**
 * The page's error boundary. `BJ-21`, item `M4`.
 *
 * Installed at module scope and never disposed, which is the difference between
 * it and everything else this file builds: it belongs to the page rather than to
 * a game, and a game that has just been stopped by a failure is exactly when its
 * listeners must still be attached. The stop reads `current` through the same
 * handle a second `boot` disposes, so a crash after an in-page Reset stops the
 * game that is actually running.
 */
const boundary: ErrorBoundary = createErrorBoundary({
  mount: () => mounted ?? document.body,
  stop: () => {
    current?.dispose();
  },
});

/**
 * The game this module currently runs, or `null` before the first boot.
 *
 * The test harness's window: an in-page Reset re-boots internally, so a
 * handle a caller took from `boot` goes stale the moment the player confirms,
 * and the `BJ-20` review found the harness holding exactly that disposed
 * closure. Reading through this accessor follows the re-boot. Nothing in the
 * shipped page needs it, and the emitted application chunk carries no exports
 * either way.
 */
export function currentGame(): Game | null {
  return current;
}

/** The mount point, created if the page does not carry one. */
function mountPoint(options: BootOptions): HTMLElement {
  if (options.root !== undefined) {
    return options.root;
  }
  const existing = document.getElementById('app');
  if (existing !== null) {
    return existing;
  }
  const created = document.createElement('div');
  created.id = 'app';
  document.body.append(created);
  return created;
}

/**
 * The viewport, in CSS pixels. Item `F1`, and the one platform read behind it.
 *
 * `innerWidth` and `innerHeight` are read bare rather than through the global
 * object, and that is a gate rather than a style:
 * `tests/unit/storage-write-failure.test.ts` requires that exactly one file
 * under `src/` names the platform globals, and the seam it means is
 * `src/storage/store.ts`. So the chrome takes the viewport the way it already
 * takes `requestAnimationFrame`, `matchMedia` and `devicePixelRatio`, off the
 * global scope by name.
 *
 * **The visual viewport, not the document's client box.** They differ by the
 * width of a classic scrollbar, and the difference lands exactly on the
 * boundaries QUALITY-BAR section 5 fixes: a 1024 px window with a vertical
 * scrollbar has a 1009 px client box, and resolving that to `medium` would make
 * the wide floor mean something different from the number the section states and
 * different again from what a device reports for itself.
 */
function viewportNow(): Viewport {
  return { width: innerWidth, height: innerHeight };
}

/**
 * The box the play surface is fitted into: the shell's middle row.
 *
 * **The row, and deliberately not the stage inside it.** Above 100 percent the
 * surface is larger than its stage and the stage scrolls to it, so a plan
 * measured from the stage's client box would shrink by a scrollbar's width the
 * moment the setting was raised, and shrink again on the frame after that. The
 * row is a grid track of a shell with a definite height: nothing inside it can
 * change its size, which is what makes the base scale stable.
 */
function stageBox(body: HTMLElement): StageBox {
  return { width: body.clientWidth, height: body.clientHeight };
}

/**
 * This is the composition root's one reading of the device pixel ratio.
 * `src/render/surface.ts` applies it to the backing store and nothing under
 * `src/render/` may name it at all, which its own directory scan enforces.
 */
function pixelRatio(): number {
  return devicePixelRatio;
}

/**
 * What the two bars need, so `barsStick` can say whether they fit.
 *
 * Three content heights, read off the rendering the previous frame produced.
 * `scrollHeight` rather than a rendered box for the two bars, because a bar's
 * content height is what it needs and is the reading that does not move when the
 * decision moves; the overhead is what the shell adds around the three rows,
 * derived rather than restated so that the safe-area insets are inside it.
 *
 * **Measuring the page to decide the page's layout is the shape of the defect
 * `BJ-14` shipped**, so the rule is stated once and obeyed here: every input is
 * invariant under the decision it feeds. `position: sticky` leaves an element in
 * flow, so neither bar's content height changes when it stops sticking, and the
 * play-surface row is a length in both modes. The floor under the overhead is
 * for the one frame after a resize where the rows have not been re-laid yet.
 */
function chromeHeights(shell: Shell): ChromeHeights {
  // The overhead is read off the shell's own box rather than derived from what
  // the rows currently occupy, and that is the difference between a number and a
  // coincidence: where the rows do not fill the shell, a derived reading counts
  // the empty space as overhead and the sum stops meaning anything. Padding and
  // the two row gaps are lengths, so they are the same in both modes.
  const style = getComputedStyle(shell.root);
  const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  const gaps = 2 * Number.parseFloat(style.rowGap);
  return {
    top: shell.top.scrollHeight,
    controls: shell.controls.scrollHeight,
    overhead: Number.isFinite(padding + gaps) ? padding + gaps : 0,
  };
}

/**
 * Which of SPEC 4.10's five outcomes a winning hand has. SPEC 5's win pulse.
 *
 * A natural and an ordinary win are wins; a push, a surrender and a dealer win
 * are not. A push is deliberately not a win: SPEC 11 counts pushes in a column
 * of their own and SPEC 4.10 returns the wager rather than paying it, so
 * pulsing one would be the felt telling a player something the round result
 * contradicts.
 */
function isWin(outcome: SettledHand['outcome']): boolean {
  return outcome === 'PLAYER_WIN' || outcome === 'BLACKJACK';
}

/**
 * What the play surface draws, read off the machine's snapshot. SPEC 4.3.
 *
 * `won` is `null` at every phase but SPEC 10's round result, where the settled
 * hands are in the readout's hand order (`table.ts` settles them in that order
 * and `BJ-15` relies on the same alignment for SPEC 12's per-hand result). Null
 * rather than false, because a hand mid-round has not lost either.
 */
function sceneState(
  readout: TableReadout,
  motion: Motion,
  palette: SelectedPalette,
): SceneState {
  const settled = readout.phase.kind === 'roundResult' ? readout.phase.result.hands : null;
  return {
    felt: readout.table,
    limits: tableLimits(readout.table),
    dealer: readout.dealerVisible,
    dealerConcealed: readout.dealerConcealed,
    hands: readout.hands.map((hand, index) => {
      const outcome = settled?.[index];
      return {
        cards: hand.cards,
        wager: hand.wager,
        won: outcome === undefined ? null : isWin(outcome.outcome),
      };
    }),
    pendingWager: readout.wallet.wager,
    motion,
    palette,
  };
}

/**
 * Build and start a game. Disposes whatever this module last built.
 *
 * Nothing in the chrome calls this a second time; the only callers are the page
 * itself, once, and the browser gate, which boots a known deal over the shipped
 * bundle.
 */
export function boot(options: BootOptions = {}): Game {
  return bootSession(options);
}

/** Build a session, optionally carrying an already-open persistence fallback. */
function bootSession(options: BootOptions, carriedPersistence?: Persistence): Game {
  current?.dispose();

  document.documentElement.dataset['game'] = GAME_ID;
  // QUALITY-BAR section 11: the locale is passed to `Intl` explicitly and the
  // resolved value is written back, because `lang` and the host default locale
  // are otherwise unrelated. Items `L1` to `L5` at `BJ-21` grade the sweep.
  document.documentElement.lang = resolvedLocale();

  // SPEC 13's load, once, before anything is built from it. `BJ-20`, item `I4`.
  // The probe inside answers for a store the platform refuses to hand over, the
  // read answers for a document nothing could be salvaged from, and every field
  // below reads the sanitised result rather than the stored bytes. An explicit
  // option still wins over the document, which is the override seam the browser
  // gate drives a known deal through and the reason every merge below runs the
  // option on the right.
  const persistence: Persistence = carriedPersistence ?? openPersistence();
  const restored = persistence.session();
  const persisted: GameDocument = restored.document;

  const wallet = createWallet(
    options.bestBalance === undefined
      ? { bestBalance: persisted.bestBalance }
      : { bestBalance: options.bestBalance },
  );
  const tableOptions: TableOptions = {
    wallet,
    table: options.table ?? restored.launch.table,
    rules: { ...persisted.settings.rules, ...options.rules },
    seed: options.seed ?? Date.now(),
    speed: options.speed ?? persisted.settings.speed,
  };
  const table: Table = createTable(tableOptions);
  let chart: ReturnType<typeof strategyTable> = strategyTable(table.readout().rules);
  let chartRules: HouseRules = table.readout().rules;

  // SPEC 14's settings, as the session holds them. The rules the panel stages
  // sit beside the machine's in-force record until the next deal applies them,
  // which is the one boundary SPEC 14 gives a house-rule change.
  let settingsRules: HouseRules = houseRules({
    ...persisted.settings.rules,
    ...options.rules,
  });
  let reducedMotion: MotionSetting =
    options.alwaysReduceMotion === undefined
      ? persisted.settings.reducedMotion
      : options.alwaysReduceMotion
        ? 'always'
        : 'system';

  // The only place in the project that asks the platform for the flag. SPEC 14's
  // reduced-motion setting is resolved through it: "always" adds reduction and
  // "system" leaves the query to answer, which `resolveReducedMotion` states.
  const preference: MotionPreference = createMotionPreference({
    alwaysReduce: alwaysReduceOf(reducedMotion),
  });
  // The only place in the project that asks the platform for forced colors, on
  // the same terms and for the same reason. Item `G9`: the chrome's half is done
  // by the stylesheet, which reads the query itself; the canvas has no
  // stylesheet, so the query is resolved here and handed to the token layer.
  const forcedColors: ForcedColorsPreference = createForcedColorsPreference();

  let statistics: Statistics = openStatisticsSession(restored.statistics);
  let history: History = restored.history;
  let coach: CoachRecord = openCoachSession(restored.coach);
  let coachMode: CoachMode = options.coachMode ?? persisted.settings.coach;
  let verdicts: HandVerdict[] | null = coachMode === 'off' ? null : [];
  let notice: Notice | null = null;
  let surfaceSize: SurfaceSize = options.surfaceSize ?? persisted.settings.surfaceSize;
  let theme: Theme = persisted.settings.theme;
  let howToPlaySeen: boolean = restored.howToPlaySeen;
  // SPEC 17: shown automatically on first launch, and only then. The dismissal
  // writes the flag below, so the second launch starts with no overlay.
  let overlay: OverlayId | null = howToPlaySeen ? null : 'howToPlay';

  // The audio engine, `BJ-19`. Built beside the two platform preferences
  // because it is the third thing that reads one: the gesture policy asks the
  // page for its first pointerdown or keydown, and nothing sounds until then.
  // The persisted mute and volume are applied here, at creation, which is the
  // only moment QUALITY-BAR section 10 gives them to be applied in.
  const audio: AudioEngine = createAudioEngine({
    muted: options.muted === undefined ? persisted.settings.muted : options.muted,
    volume: options.volume === undefined ? persisted.settings.volume : options.volume,
  });

  /**
   * SPEC 13's save, from the live session. `BJ-20`, item `I4`.
   *
   * The document is assembled, never stored: every field is read off the thing
   * that owns it, so there is no second copy of a setting to drift. The
   * session scope is projected out inside `persistence.save`, the wallet's
   * high-water mark is the document's `bestBalance`, and the machine's own
   * table names the seat. A write that throws degrades only the carry, which
   * is `persistence.ts`'s contract and not this function's business.
   */
  function save(): void {
    const snapshot = table.readout();
    const document: GameDocument = Object.freeze({
      bestBalance: snapshot.wallet.bestBalance,
      table: snapshot.table,
      statistics,
      coach,
      history,
      settings: Object.freeze({
        rules: settingsRules,
        coach: coachMode,
        speed: table.speed(),
        surfaceSize,
        muted: audio.muted(),
        volume: audio.volume(),
        theme,
        reducedMotion,
      }),
      howToPlaySeen,
    });
    persistence.save(document);
  }

  const actions: ChromeActions = {
    queue(intent: Intent): void {
      table.queue(intent);
    },
    openOverlay(id: OverlayId): void {
      overlay = id;
    },
    closeOverlay(): void {
      // SPEC 17: the first dismissal of How to Play is the seen flag. It is
      // written here rather than in the frame, because closing the overlay is
      // the one route every dismissal takes, whether the player pressed the
      // Close button, answered Escape through the focus policy, or moved on;
      // and it is saved at once, so a crash between the dismissal and the next
      // round boundary cannot un-see what the player saw.
      if (overlay === 'howToPlay' && !howToPlaySeen) {
        howToPlaySeen = true;
        save();
      }
      overlay = null;
    },
    setCoachMode(mode: CoachMode): void {
      coachMode = mode;
      if (mode !== 'off' && verdicts === null) {
        verdicts = [];
      }
      save();
    },
    setSpeed(speed: Speed): void {
      // SPEC 14: immediately, mid-round included. There is nothing to defer to a
      // round boundary, because Speed decides no transition; `table.setSpeed`
      // leaves the accumulator alone, so a phase already half spent stays half
      // spent and the change is a shorter remainder rather than a restart.
      table.setSpeed(speed);
      save();
    },
    setSurfaceSize(size: SurfaceSize): void {
      // SPEC 14 again: immediately, mid-round included. The next frame plans the
      // surface from the new size and resizes the backing store, and the machine
      // is not told, because a CSS scale decides nothing about a round.
      surfaceSize = size;
      save();
    },
    setRules(patch: Partial<HouseRules>): void {
      // SPEC 14: staged, not applied. The machine holds the stage until the
      // next deal, the panel reads the merged record for its pressed states,
      // and the save carries the merged record so a reload restores the choice.
      settingsRules = Object.freeze({ ...settingsRules, ...patch });
      table.setRules(settingsRules);
      save();
    },
    setTheme(next: Theme): void {
      theme = next;
      save();
    },
    setReducedMotion(setting: MotionSetting): void {
      // SPEC 14's two words. "always" adds reduction; "system" hands the
      // question back to the platform query, which `resolveReducedMotion`
      // reads the way it always has.
      reducedMotion = setting;
      preference.setAlwaysReduce(alwaysReduceOf(setting));
      save();
    },
    toggleMuted(): void {
      // SPEC 14's sound, and item `K3`'s single action. The engine holds the
      // one copy of the value; the next frame's chrome state reads it back,
      // so the control, the gain and the announcement cannot disagree.
      audio.setMuted(!audio.muted());
      save();
    },
    setVolume(volume: number, commit: boolean): void {
      // SPEC 14's other sound control, `I5`. The engine clamps whatever the
      // slider sends, and the frame's chrome state reads the clamped value
      // back, so the control and the gain cannot disagree. The gain moves on
      // every call; the document is written only on the committing one, which
      // is the slider's gesture end, so a drag is one write and not a storm.
      audio.setVolume(volume);
      if (commit) {
        save();
      }
    },
    resetAllData(): void {
      // SPEC 14's Reset all data, `I5`. The stored document goes first, then
      // the whole game re-boots onto the defaults: the ruling's natural route.
      // A full re-boot is the honest shape of "clears every persisted value",
      // because a fresh boot is the one route that already answers for a first
      // launch, from the How-to-Play overlay to the 1,000 chips. The previous
      // game's `dispose` runs inside `boot` and takes its listeners with it,
      // and it saves nothing on the way out: `persistence.resetAll` has already
      // replaced the in-memory document with the default one, and a
      // dispose-time save would write the cleared values straight back.
      persistence.resetAll();
      // The mount is the one option a reset carries forward: it is where the
      // page put the game, not a piece of the state being cleared, and a
      // fresh boot that fell back to `#app` would re-mount a game the page
      // had deliberately placed elsewhere.
      bootSession(options.root === undefined ? {} : { root: options.root }, persistence);
    },
  };

  const chrome = createChrome(actions);
  const root = mountPoint(options);
  // Where a failure would put the recovery panel. Written before the shell is
  // mounted, so a throw from this boot's own first frame has a home already.
  mounted = root;
  root.replaceChildren(chrome.shell.root);

  /**
   * The shape of the page, resolved once per frame and used by both halves.
   *
   * The breakpoint decides the framing the surface is planned in and the
   * selectors the stylesheet applies, and both have to be the same answer or the
   * canvas is drawn for one layout inside another. One resolution per frame,
   * handed to the plan and to the chrome, is the same discipline `resolveMotion`
   * already has for the motion policy.
   */
  function layoutNow(): LayoutState {
    const viewport = viewportNow();
    return {
      breakpoint: resolveBreakpoint(viewport),
      stickyBars: barsStick(viewport, chromeHeights(chrome.shell)),
      surfaceSize,
    };
  }

  let layout: LayoutState = layoutNow();
  let plan: SurfacePlan = planSurface(
    stageBox(chrome.shell.body),
    layout.breakpoint,
    layout.surfaceSize,
    pixelRatio(),
  );
  const surface: PlaySurface = createPlaySurface({
    canvas: chrome.shell.canvas,
    // A new canvas every call, which is what the scene's bake caches need. It
    // makes the grain squares here; the felt bakes take theirs from the layer
    // below, which is the shell's own stack. Handing the shipped canvas back
    // here, as this root did until `BJ-22`'s fix round, would have every bake
    // paint over the last one the cache still claimed to hold.
    offscreen: () => document.createElement('canvas'),
    feltLayer: createFeltLayer(chrome.shell),
    sizing: plan.sizing,
  });

  /**
   * The frame's palette selection. Item `G9`, and the play surface's half of it.
   *
   * Resolved beside the motion policy and from the same one platform read the
   * chrome is given, so the stylesheet's forced-colors block and the renderer's
   * token set are one decision rather than two answers to one question. From
   * `BJ-22` it is handed to the scene as well as held for the probe: SPEC 16
   * defines the forced-colors set, so there is a second set to select and the
   * canvas draws from whichever one this frame chose.
   */
  let palette: SelectedPalette = surfacePalette(false);

  function chromeState(readout: TableReadout, motion: Motion, forced: boolean): ChromeState {
    return {
      layout,
      readout,
      statistics: statisticsReadout(statistics, readout.wallet, coach),
      history,
      milestones: statistics.milestones,
      coachMode,
      verdicts,
      notice,
      overlay,
      motion,
      forcedColors: forced,
      muted: audio.muted(),
      volume: audio.volume(),
      theme,
      reducedMotion,
      stagedRules: settingsRules,
      hint: currentHint(readout),
    };
  }

  /**
   * SPEC 7's hint, for the frame that is about to draw. `BJ-20`, item `J4`.
   *
   * Null everywhere but `playerTurn` under the hint mode, and computed from
   * the same chart the coach's observations use, so the highlighted control
   * and the recorded verdict cannot disagree about what was recommended. The
   * lookup only happens in hint mode: `strategy.ts` gates the mode itself,
   * and an off coach is one that never ran rather than one that ran quietly.
   */
  function currentHint(readout: TableReadout): CoachAction | null {
    if (coachMode !== 'hint') {
      return null;
    }
    const situation = situationAt(readout);
    if (situation === null) {
      return null;
    }
    return recommend(chart, situation)?.action ?? null;
  }

  /**
   * DESIGN section 3 steps 1 and 2, plus SPEC 7's accuracy tracking.
   *
   * The coach's situation is read **before** the drain, because the drain is
   * what changes it: `strategy.observe` compares what the player did against
   * what basic strategy would have done in the position they did it from. The
   * active hand index is taken from the same pre-drain phase, which is what
   * makes the verdict attributable to a hand for SPEC 12.
   *
   * `appliedIntent` is written for the cue derivation below: an accepted
   * intent is the trigger of SPEC 15's button-press cue, and the drain is the
   * one boundary every press already passes through, so the audio layer
   * observes it here rather than growing a listener of its own.
   */
  let appliedIntent: IntentKind | null = null;

  function drainInput(): void {
    const before = table.readout();
    const situation = situationAt(before);
    const report = table.drain();

    appliedIntent = report.applied !== null && report.applied.ok ? report.applied.kind : null;
    const applied = report.applied;
    if (applied !== null && applied.ok) {
      if (applied.kind === 'deal') {
        verdicts = coachMode === 'off' ? null : [];
      }
      if (applied.kind === 'resetBankroll') {
        // SPEC 4.12 and SPEC 9 row 11: the free reset is not a recovery, so the
        // latch it would otherwise satisfy is cleared with the bankroll.
        statistics = observeBankrollReset(statistics);
      }
      const action = actionOf(applied.kind);
      if (action !== null && situation !== null && before.phase.kind === 'playerTurn') {
        const observation = observe(coachMode, coach, chart, situation, action);
        coach = observation.record;
        if (observation.verdict !== null) {
          // Turning the coach off mid-round leaves the verdicts already recorded
          // in place: they are printed in that round's result and kept in its
          // history entry, and only the decisions after the switch go
          // unobserved. That is the reading SPEC 7 supports, since a verdict is
          // a record of a comparison that really happened, and it is written
          // down here so a later part changes it deliberately or not at all.
          const entry: HandVerdict = { hand: before.phase.activeHand, verdict: observation.verdict };
          verdicts = verdicts === null ? [entry] : [...verdicts, entry];
        }
      }
    }

    // A refusal outranks an acceptance in the same frame. SPEC 4.11 requires the
    // reason to reach the player, and a click accepted 16 ms later must not be
    // what decides whether they ever see it.
    const refused = report.rejected.at(-1);
    if (refused !== undefined && !refused.ok) {
      notice = { intent: refused.kind, layer: refused.layer, reason: refused.reason };
    } else if (applied !== null) {
      notice = null;
    }
  }

  /**
   * SPEC 11's counters and SPEC 8's history, folded in once per round.
   *
   * `observeRound` refuses a round it has already counted, and the guard here is
   * the same comparison it makes: `table.ts` increments its round counter when
   * it enters SPEC 10's round result, so the first frame that sees the new count
   * is the one boundary there is.
   */
  function closeRound(readout: TableReadout): void {
    if (readout.phase.kind !== 'roundResult' || readout.rounds <= statistics.rounds) {
      return;
    }
    statistics = observeRound(statistics, readout, coach).statistics;
    history = recordRound(
      history,
      readout,
      verdicts === null ? null : verdicts.map((entry) => entry.verdict),
    );
    // SPEC 13's round boundary is the first of the two save points: the chips
    // are not in the document, but the high-water mark, the lifetime tallies,
    // the milestones and the history entry all just moved, and the boundary is
    // the moment nothing else is half-written. The second point is a setting
    // change, in the actions above.
    save();
  }

  /**
   * The audio observation point. `BJ-19`, item `K5`.
   *
   * One place, this one, offers cues to the engine, and it is the same
   * boundary the coach's observations and the announcer's deltas are computed
   * at: the frame, after the drain and the update, holding the machine's
   * snapshot, the intent the drain accepted and the awarded milestones. The
   * double-fire hazard the part brief names, chrome sync and an audio observer
   * each seeing one transition and each firing for it, is answered by there
   * being no second observer: the chrome is synced from the same state below
   * and never offers a cue. `src/ui/cues.ts` is the pure derivation and this
   * is its only caller.
   */
  let previousCue: CueFrame | null = null;

  function emitCues(readout: TableReadout): void {
    const frame: CueFrame = { applied: appliedIntent, readout, milestones: statistics.milestones };
    for (const cue of cuesFor(previousCue, frame)) {
      audio.cue(cue, readout.phase.kind);
    }
    previousCue = frame;
  }

  function frame(dt: number): void {
    // A game whose chrome has been taken off the page stops, rather than
    // drawing forever into a canvas nobody can see. `dispose` is the ordinary
    // route and it stops the loop directly; this is the other one, for a shell
    // that was replaced rather than disposed, which is what a second `boot`
    // from a different module instance does. Two live loops writing one page is
    // exactly the defect a composition root that can be called twice has to
    // answer for.
    if (!chrome.shell.root.isConnected) {
      loop.stop();
      return;
    }
    const was = table.readout().phase.kind;
    drainInput();
    table.update(dt);

    const readout = table.readout();
    // SPEC 14 and SPEC 7: the coach's table is generated from the rules in
    // force, so it moves when they do. The machine applies a staged record at
    // the deal and publishes a new frozen one, which makes identity the whole
    // of the dirty check; recommendations never run off a chart the round is
    // not playing under.
    if (readout.rules !== chartRules) {
      chartRules = readout.rules;
      chart = strategyTable(readout.rules);
    }
    // A reason belongs to the screen it was refused on. SPEC 10 gives each
    // control one screen, so carrying "that is below the table minimum" into the
    // deal would be a sentence about a control the player can no longer see. A
    // refusal never changes the phase itself, so this cannot erase a fresh one.
    if (readout.phase.kind !== was) {
      notice = null;
    }
    closeRound(readout);
    emitCues(readout);

    // The shape of the page, then the surface that has to fit inside it. The
    // breakpoint is resolved from the viewport, which no layout of ours can
    // change, and the box is a grid track of a shell with a definite height, so
    // neither reading can be moved by what this frame is about to draw. A
    // resize is one frame behind a rotation, because the attribute that selects
    // the new layout is written in the chrome sync at the end of this frame and
    // the box is measured at the top of the next one; the machine's state is
    // untouched by either, which is what item `F5` is about.
    layout = layoutNow();
    const wanted = planSurface(
      stageBox(chrome.shell.body),
      layout.breakpoint,
      layout.surfaceSize,
      pixelRatio(),
    );
    if (!sameSizing(wanted.sizing, plan.sizing)) {
      surface.resize(wanted.sizing);
    }
    plan = wanted;

    // One policy per frame, handed to both halves of the presentation. The
    // canvas and the chrome are then incapable of disagreeing about which
    // motion mode or which Speed the frame is in, which is what item `E7`'s
    // "every animation" and item `E9`'s "both motion modes" each rest on.
    const motion = resolveMotion({ reducedMotion: preference.reduced(), speed: table.speed() });

    // One platform read per frame, handed to both halves, exactly as the motion
    // policy is. Item `G9`.
    const forced = forcedColors.active();
    palette = surfacePalette(forced);

    surface.render(sceneState(readout, motion, palette), dt);
    chrome.sync(chromeState(readout, motion, forced), dt);
  }

  // QUALITY-BAR section 7, and item `C7`'s mechanism. A hidden tab pauses the
  // animation by stopping the loop, and the pause is where the document is
  // written on the way out of sight, because `pagehide` covers the unload the
  // hidden moment misses and `beforeunload` is the one hook the section
  // forbids. The machine needs no telling: a loop that stops asks `update`
  // nothing, so no accumulator advances while nobody can see it.
  //
  // The frame is handed to the loop wrapped in the boundary, which is item
  // `M4`'s first route. `src/ui/loop.ts` schedules the next frame before it
  // calls back, so a throw already stopped the loop before this wrapper saw it;
  // what the wrapper adds is the clean stop of everything else and the panel.
  const loop: FrameLoop = createFrameLoop({
    onFrame: (dt: number): void => {
      boundary.run(() => {
        frame(dt);
      });
    },
    onHidden: save,
  });

  const game: Game = {
    readout: () => table.readout(),
    session: () => ({
      statistics,
      history,
      coach,
      coachMode,
      speed: table.speed(),
      surfaceSize,
      muted: audio.muted(),
      volume: audio.volume(),
      theme,
      reducedMotion,
      howToPlaySeen,
    }),
    layout: (): LayoutProbe => ({
      breakpoint: layout.breakpoint,
      stickyBars: layout.stickyBars,
      surfaceSize: layout.surfaceSize,
      framing: { width: plan.framing.width, height: plan.framing.height },
      scale: plan.scale,
      baseScale: plan.baseScale,
      cssWidth: plan.sizing.width,
      cssHeight: plan.sizing.height,
      storeWidth: surface.surface.canvas.width,
      storeHeight: surface.surface.canvas.height,
      dpr: plan.sizing.dpr,
      fan: surface.fan(),
    }),
    motion(): MotionProbe {
      const resolved = resolveMotion({
        reducedMotion: preference.reduced(),
        speed: table.speed(),
      });
      const pacing: Record<string, number> = {};
      for (const name of PACING_NAMES) {
        pacing[name] = resolved.seconds(name);
      }
      return {
        reducedMotion: resolved.reducedMotion,
        speed: resolved.speed,
        tweensInFlight: surface.tweensInFlight(),
        pacing,
      };
    },
    accessibility: (): AccessibilityProbe => ({
      forcedColors: forcedColors.active(),
      palette: { name: palette.name, flatFelt: palette.flatFelt },
      announced: chrome.announcer.spoken(),
      queue: chrome.announcer.queue(),
    }),
    audio(): AudioProbe {
      return {
        muted: audio.muted(),
        volume: audio.volume(),
        started: audio.started(),
        cues: audio.offered(),
        cuePhases: audio.offeredInPhase(),
      };
    },
    dispose(): void {
      // `dispose`, not `stop`: this takes the visibility listeners off too, so
      // a game that is gone cannot answer a later tab switch on behalf of a
      // page it no longer owns. Nothing is saved here, for the reason the
      // reset action spells out: a dispose-time write would race the very
      // reset that disposed it.
      loop.dispose();
      preference.dispose();
      // The audio engine's listeners come off with the rest. It listens on the
      // document rather than in the shell, so a game disposed by a second
      // `boot` would otherwise leave a gesture handler behind for a page it no
      // longer owns, exactly the leak the focus policy's disposal answers for.
      audio.dispose();
      // The chrome's own listeners come off before its shell does. `BJ-17`: the
      // focus policy is the one thing in the chrome that listens outside the
      // shell, so a game disposed by a second `boot` would otherwise leave an
      // `Escape` handler behind for a page it no longer owns.
      chrome.dispose();
      chrome.shell.root.remove();
      if (current === game) {
        current = null;
      }
    },
  };
  // Published before the first frame runs, and that ordering is item `M4`'s.
  // The boundary stops a failure by disposing `current`, so a throw out of the
  // synchronous frame below has to find a handle to dispose; with the
  // publication after it, the one frame most likely to fail on a strange
  // platform would be the one frame that could not be stopped.
  current = game;

  // One synchronous frame before the loop starts, so the page is never briefly
  // blank and so a caller that reads the DOM immediately after `boot` finds a
  // rendered chrome rather than an empty shell. Wrapped like the loop's, for
  // the reason above.
  boundary.run(() => {
    frame(0);
  });
  if (!boundary.failed()) {
    loop.start();
  }

  return game;
}

/**
 * The page's entry. `BJ-21`, items `A5` and `M4`.
 *
 * The feature test first, because a browser that cannot give this game a
 * drawing context must read a notice rather than a stack: item `A5`'s "never a
 * blank canvas and never an uncaught error" is a statement about this order.
 * The boot second, wrapped, so a failure while the composition root is being
 * assembled reaches the same panel every later failure does.
 */
function start(): void {
  if (showUnsupportedNotice(missingCapabilities())) {
    return;
  }
  boundary.run(() => {
    boot();
  });
}

start();
