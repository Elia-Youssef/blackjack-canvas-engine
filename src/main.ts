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
 *     the settings and the coach record, is loaded at `BJ-20` and handed in
 *     exactly here. `src/storage/` is deliberately not imported yet: nothing
 *     reads or writes it until that part, and a half-wired persistence would
 *     make `I4` and `I5` ungradeable.
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
 * **There is no error boundary here, and that is deliberate.** QUALITY-BAR
 * section 12 wants one, and item `M4` at `BJ-21` grades it: a thrown error from
 * the loop, a `window.onerror` and an `unhandledrejection` each stopping the
 * loop cleanly and showing a styled recovery panel. Wrapping the loop in a
 * `try` here without that panel would swallow the failure and leave a frozen
 * canvas, which is the exact defect that item exists to prevent. There is no
 * `catch` in this file at all.
 */

import { record as recordRound, NO_HISTORY, type History } from './core/history';
import type { HouseRules } from './core/rules';
import {
  NO_STATISTICS,
  observeBankrollReset,
  observeRound,
  openSession as openStatisticsSession,
  statisticsReadout,
  type Statistics,
} from './core/statistics';
import {
  DEFAULT_COACH_MODE,
  NO_DECISIONS,
  actionOf,
  observe,
  openSession as openCoachSession,
  situationAt,
  strategyTable,
  type CoachMode,
  type CoachRecord,
} from './core/strategy';
import {
  DEFAULT_SPEED,
  createTable,
  type Speed,
  type Table,
  type TableOptions,
  type TableReadout,
} from './core/table';
import type { Intent, SettledHand } from './core/types';
import { LOWEST_TABLE, createWallet, tableLimits, type TableId } from './core/wallet';
import { PACING_NAMES, resolveMotion, type Motion } from './render/animate';
import { createPlaySurface, type PlaySurface, type SceneState } from './render/scene';
import { DEFAULT_SURFACE_SIZE, type SurfaceSize } from './render/surface';
import { surfacePalette, type SelectedPalette } from './render/tokens';
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
import type { Shell } from './ui/layout';
import { createFrameLoop, type FrameLoop } from './ui/loop';
import { createMotionPreference, type MotionPreference } from './ui/motion';
import type {
  ChromeActions,
  ChromeState,
  HandVerdict,
  LayoutState,
  Notice,
  OverlayId,
} from './ui/state';

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
 * selected and why. It reports `standard-fallback` under forced colors today,
 * because SPEC 16 defines no high-contrast set for the play surface;
 * `src/render/tokens.ts` carries that park in full and `BJ-18`'s report carries
 * the sketched resolution.
 *
 * `announced` and `queue` are item `G4`'s: what each live region was last
 * written with, and what the one queue is still holding.
 */
export interface AccessibilityProbe {
  readonly forcedColors: boolean;
  readonly palette: { readonly name: SelectedPalette['name']; readonly reason: SelectedPalette['reason'] };
  readonly announced: { readonly polite: string | null; readonly assertive: string | null };
  readonly queue: QueueState;
}

/** A running game. Returned by `boot`, and the handle `BJ-20` will persist. */
export interface Game {
  /** The machine's snapshot. The only authority on the game's state. */
  readout(): TableReadout;
  /** What SPEC 13 persists, as one value. Nothing writes it yet. */
  session(): SessionState;
  /** What the last frame resolved for motion. Items `E7` and `E9`. */
  motion(): MotionProbe;
  /** What the last frame resolved for the layout. Items `F1`, `F3`, `F6`. */
  layout(): LayoutProbe;
  /** What the last frame resolved for accessibility. Items `G4` and `G9`. */
  accessibility(): AccessibilityProbe;
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
}

/** The game this module last built, so a second boot can dispose the first. */
let current: Game | null = null;

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
function sceneState(readout: TableReadout, motion: Motion): SceneState {
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
  current?.dispose();

  document.documentElement.dataset['game'] = GAME_ID;
  // QUALITY-BAR section 11: the locale is passed to `Intl` explicitly and the
  // resolved value is written back, because `lang` and the host default locale
  // are otherwise unrelated. Items `L1` to `L5` at `BJ-21` grade the sweep.
  document.documentElement.lang = resolvedLocale();

  const wallet = createWallet(
    options.bestBalance === undefined ? {} : { bestBalance: options.bestBalance },
  );
  const tableOptions: TableOptions = {
    wallet,
    table: options.table ?? LOWEST_TABLE.id,
    rules: options.rules ?? {},
    seed: options.seed ?? Date.now(),
    speed: options.speed ?? DEFAULT_SPEED,
  };
  const table: Table = createTable(tableOptions);
  const chart = strategyTable(table.readout().rules);

  // The only place in the project that asks the platform for the flag. SPEC 14's
  // reduced-motion setting joins it at `BJ-20`; the option is its "always" arm.
  const preference: MotionPreference = createMotionPreference(
    options.alwaysReduceMotion === undefined ? {} : { alwaysReduce: options.alwaysReduceMotion },
  );
  // The only place in the project that asks the platform for forced colors, on
  // the same terms and for the same reason. Item `G9`: the chrome's half is done
  // by the stylesheet, which reads the query itself; the canvas has no
  // stylesheet, so the query is resolved here and handed to the token layer.
  const forcedColors: ForcedColorsPreference = createForcedColorsPreference();

  let statistics: Statistics = openStatisticsSession(NO_STATISTICS);
  let history: History = NO_HISTORY;
  let coach: CoachRecord = openCoachSession(NO_DECISIONS);
  let coachMode: CoachMode = options.coachMode ?? DEFAULT_COACH_MODE;
  let verdicts: HandVerdict[] | null = coachMode === 'off' ? null : [];
  let notice: Notice | null = null;
  let overlay: OverlayId | null = null;
  let surfaceSize: SurfaceSize = options.surfaceSize ?? DEFAULT_SURFACE_SIZE;

  const actions: ChromeActions = {
    queue(intent: Intent): void {
      table.queue(intent);
    },
    openOverlay(id: OverlayId): void {
      overlay = id;
    },
    closeOverlay(): void {
      overlay = null;
    },
    setCoachMode(mode: CoachMode): void {
      coachMode = mode;
      if (mode !== 'off' && verdicts === null) {
        verdicts = [];
      }
    },
    setSpeed(speed: Speed): void {
      // SPEC 14: immediately, mid-round included. There is nothing to defer to a
      // round boundary, because Speed decides no transition; `table.setSpeed`
      // leaves the accumulator alone, so a phase already half spent stays half
      // spent and the change is a shorter remainder rather than a restart.
      table.setSpeed(speed);
    },
    setSurfaceSize(size: SurfaceSize): void {
      // SPEC 14 again: immediately, mid-round included. The next frame plans the
      // surface from the new size and resizes the backing store, and the machine
      // is not told, because a CSS scale decides nothing about a round.
      surfaceSize = size;
    },
  };

  const chrome = createChrome(actions);
  const root = mountPoint(options);
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
    offscreen: () => chrome.shell.feltCanvas,
    sizing: plan.sizing,
    separateFelt: true,
  });

  /**
   * The frame's palette selection. Item `G9`, and the play surface's half of it.
   *
   * Resolved beside the motion policy and from the same one platform read the
   * chrome is given, so the stylesheet's forced-colors block and the renderer's
   * token set are one decision rather than two answers to one question. It is
   * held for the probe rather than passed into the draw calls, because there is
   * currently one set to select: `src/render/tokens.ts` carries why.
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
    };
  }

  /**
   * DESIGN section 3 steps 1 and 2, plus SPEC 7's accuracy tracking.
   *
   * The coach's situation is read **before** the drain, because the drain is
   * what changes it: `strategy.observe` compares what the player did against
   * what basic strategy would have done in the position they did it from. The
   * active hand index is taken from the same pre-drain phase, which is what
   * makes the verdict attributable to a hand for SPEC 12.
   */
  function drainInput(): void {
    const before = table.readout();
    const situation = situationAt(before);
    const report = table.drain();

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
    // A reason belongs to the screen it was refused on. SPEC 10 gives each
    // control one screen, so carrying "that is below the table minimum" into the
    // deal would be a sentence about a control the player can no longer see. A
    // refusal never changes the phase itself, so this cannot erase a fresh one.
    if (readout.phase.kind !== was) {
      notice = null;
    }
    closeRound(readout);

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

    surface.render(sceneState(readout, motion), dt);
    chrome.sync(chromeState(readout, motion, forced), dt);
  }

  const loop: FrameLoop = createFrameLoop({ onFrame: frame });

  // One synchronous frame before the loop starts, so the page is never briefly
  // blank and so a caller that reads the DOM immediately after `boot` finds a
  // rendered chrome rather than an empty shell.
  frame(0);
  loop.start();

  const game: Game = {
    readout: () => table.readout(),
    session: () => ({ statistics, history, coach, coachMode, speed: table.speed(), surfaceSize }),
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
      palette: { name: palette.name, reason: palette.reason },
      announced: chrome.announcer.spoken(),
      queue: chrome.announcer.queue(),
    }),
    dispose(): void {
      loop.stop();
      preference.dispose();
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
  current = game;
  return game;
}

boot();
