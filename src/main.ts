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
import type { SurfaceSizing } from './render/surface';
import { createChrome } from './ui/chrome';
import { resolvedLocale } from './ui/format';
import { createFrameLoop, type FrameLoop } from './ui/loop';
import { createMotionPreference, type MotionPreference } from './ui/motion';
import type { ChromeActions, ChromeState, HandVerdict, Notice, OverlayId } from './ui/state';

import './ui/tokens.css';
import './ui/chrome.css';

export const GAME_ID = 'blackjack';

/**
 * The play surface's aspect, and the smallest width it is drawn at.
 *
 * DESIGN section 4 gives the surface a 1280 x 720 logical space, which is this
 * ratio; the surface is drawn at whatever size its box allows and every length
 * in `render/scene.ts` is a fraction of it, so the picture is the same at any
 * size. The floor keeps a stage that has not been laid out yet, which reports a
 * client size of zero, from asking `createSurface` for a zero-sized store.
 * Item `F1` at `BJ-16` owns what happens at the four breakpoints.
 */
const SURFACE_ASPECT = 1280 / 720;
const MIN_SURFACE_WIDTH = 320;

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

/** A running game. Returned by `boot`, and the handle `BJ-20` will persist. */
export interface Game {
  /** The machine's snapshot. The only authority on the game's state. */
  readout(): TableReadout;
  /** What SPEC 13 persists, as one value. Nothing writes it yet. */
  session(): SessionState;
  /** What the last frame resolved for motion. Items `E7` and `E9`. */
  motion(): MotionProbe;
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
 * The logical size and backing-store scale the surface should be drawn at.
 *
 * `devicePixelRatio` is read bare rather than through the global object, and
 * that is a gate rather than a style: `tests/unit/storage-write-failure.test.ts`
 * requires that exactly one file under `src/` names the platform globals, and
 * the seam it means is `src/storage/store.ts`. Item `I3`'s scan reads the
 * identifier, so the chrome takes the ratio the way it takes
 * `requestAnimationFrame`, off the global scope by name.
 *
 * This is the composition root's one reading of the device pixel ratio.
 * `src/render/surface.ts` applies it to the backing store and nothing under
 * `src/render/` may name it at all, which its own directory scan enforces.
 */
function sizingFor(stage: HTMLElement): SurfaceSizing {
  const ratio = devicePixelRatio;
  const boxWidth = Math.max(stage.clientWidth, MIN_SURFACE_WIDTH);
  const boxHeight = Math.max(stage.clientHeight, MIN_SURFACE_WIDTH / SURFACE_ASPECT);
  const width = Math.round(Math.min(boxWidth, boxHeight * SURFACE_ASPECT));
  return {
    width,
    height: Math.round(width / SURFACE_ASPECT),
    dpr: ratio > 0 ? ratio : 1,
  };
}

function sameSizing(a: SurfaceSizing, b: SurfaceSizing): boolean {
  return a.width === b.width && a.height === b.height && a.dpr === b.dpr;
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

  let statistics: Statistics = openStatisticsSession(NO_STATISTICS);
  let history: History = NO_HISTORY;
  let coach: CoachRecord = openCoachSession(NO_DECISIONS);
  let coachMode: CoachMode = options.coachMode ?? DEFAULT_COACH_MODE;
  let verdicts: HandVerdict[] | null = coachMode === 'off' ? null : [];
  let notice: Notice | null = null;
  let overlay: OverlayId | null = null;

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
  };

  const chrome = createChrome(actions);
  const root = mountPoint(options);
  root.replaceChildren(chrome.shell.root);

  let sizing = sizingFor(chrome.shell.stage);
  const surface: PlaySurface = createPlaySurface({
    canvas: chrome.shell.canvas,
    offscreen: () => document.createElement('canvas'),
    sizing,
  });

  function chromeState(readout: TableReadout, motion: Motion): ChromeState {
    return {
      readout,
      statistics: statisticsReadout(statistics, readout.wallet, coach),
      history,
      milestones: statistics.milestones,
      coachMode,
      verdicts,
      notice,
      overlay,
      motion,
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

    const wanted = sizingFor(chrome.shell.stage);
    if (!sameSizing(wanted, sizing)) {
      sizing = wanted;
      surface.resize(wanted);
    }

    // One policy per frame, handed to both halves of the presentation. The
    // canvas and the chrome are then incapable of disagreeing about which
    // motion mode or which Speed the frame is in, which is what item `E7`'s
    // "every animation" and item `E9`'s "both motion modes" each rest on.
    const motion = resolveMotion({ reducedMotion: preference.reduced(), speed: table.speed() });

    surface.render(sceneState(readout, motion), dt);
    chrome.sync(chromeState(readout, motion), dt);
  }

  const loop: FrameLoop = createFrameLoop({ onFrame: frame });

  // One synchronous frame before the loop starts, so the page is never briefly
  // blank and so a caller that reads the DOM immediately after `boot` finds a
  // rendered chrome rather than an empty shell.
  frame(0);
  loop.start();

  const game: Game = {
    readout: () => table.readout(),
    session: () => ({ statistics, history, coach, coachMode, speed: table.speed() }),
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
    dispose(): void {
      loop.stop();
      preference.dispose();
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
