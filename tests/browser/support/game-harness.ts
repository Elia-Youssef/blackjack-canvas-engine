/**
 * The in-page harness behind `betting.spec.ts`, `overlays.spec.ts` and
 * `round-result.spec.ts`. Nothing here ships.
 *
 * It is `tests/browser/support/render-demo.ts`'s pattern exactly, and for the
 * same reason. The specs bundle this file with Vite's library build at test
 * time, with `write: false`, and inject the emitted chunk into the served
 * `dist/` page. The shipped bundle never imports it: `npm run verify:build`
 * fingerprints the same bytes with and without it.
 *
 * **Why a harness rather than the shipped bundle's own export.** Three of this
 * part's clauses cannot be reached on an unparameterised launch:
 *
 *   - SPEC 4.11's "Deal is blocked below the table minimum" needs a table whose
 *     minimum is above the smallest chip, which is Silver or Gold, and SPEC 6
 *     opens those on a best chip balance of 2,500 and 10,000. SPEC 13 starts
 *     every launch at 1,000 and does not persist the balance, so no sequence of
 *     presses on a fresh page reaches one.
 *   - "Max computes a legal multiple of 10" is only interesting when the ceiling
 *     is not already one, which needs a balance off the 10 grid, which needs a
 *     surrender or a natural on a known deal.
 *   - SPEC 12's round result has to be checked against the round that actually
 *     happened, which means reading the machine.
 *
 * `main.ts` exports `boot(options)` for the first two, because SPEC 4.1's seed
 * cannot come from `core/` and SPEC 13's persisted document arrives through the
 * same door at `BJ-20`. What the shipped **bundle** does not do is re-export it:
 * Rollup drops an application entry's exports, the emitted chunk is a facade for
 * `index.html`, and nothing was added to the build to change that. So the
 * harness imports the composition root from source and boots it over the served
 * page, whose stylesheet, markup and shipped chunk are `dist/`'s.
 *
 * Every spec still exercises the shipped chunk directly wherever the clause can
 * be reached without options, and says which tests those are.
 */

import {
  boot,
  currentGame,
  type AccessibilityProbe,
  type AudioProbe,
  type BootOptions,
  type Game,
  type LayoutProbe,
  type MotionProbe,
} from '../../../src/main';
import {
  CHIP_DENOMINATIONS,
  CHIP_FILL,
  CHIP_GLYPH,
  surfacePalette,
} from '../../../src/render/tokens';

/**
 * The options a spec may pass across the Playwright boundary.
 *
 * `BootOptions` minus its mount point, which is an `HTMLElement` and therefore
 * not serialisable. The harness always mounts where the page already does.
 */
export type HarnessBootOptions = Omit<BootOptions, 'root'>;

/**
 * One frame's reading of SPEC 4.11's four terms, and the sum the wallet
 * publishes for them.
 *
 * Sampled per frame rather than at chosen moments, because two of the four are
 * non-zero only inside a paced window: SPEC 4.7's stake is taken when the offer
 * is accepted and settled at the peek, which SPEC 5 gives 0.3 s. A spec that
 * polled from outside the page could miss that window on a loaded machine; a
 * sampler on the animation frame cannot, because it runs on the same frames the
 * game does. It is the browser-side shape of the audit the `H6` soak performs
 * headlessly at `BJ-12`.
 */
export interface WalletSample {
  readonly phase: string;
  readonly chips: number;
  readonly committed: number;
  readonly insuranceStake: number;
  readonly deferredStake: number;
  readonly conserved: number;
}

/**
 * One frame's reading of everything item `E7` calls an animation. `BJ-14`.
 *
 * Sampled per frame for the same reason the wallet is: an animation is visible
 * only while it is running, and "removes every animation entirely" is a claim
 * about **every frame**, not about the frames a spec happened to look at. Four
 * readings, and each carries one clause:
 *
 *   - `tweens` is what the play surface had in flight, which is the canvas half.
 *   - `balance` is SPEC 11's chip readout as the page rendered it and `chips` is
 *     what the machine held on the same frame. Equal on every frame means the
 *     count-up did not run; differing on some frame means it did. That is the
 *     DOM half, and it needs both numbers, because a readout that agreed with
 *     the machine because both were wrong would still be a snap.
 *   - `phase` is SPEC 10's screen, which is the sequence of states the criterion
 *     requires identical between the two modes.
 */
export interface MotionSample {
  readonly at: number;
  readonly phase: string;
  readonly tweens: number;
  readonly reducedMotion: boolean;
  readonly speed: string;
  /** SPEC 11's chip readout, as text, exactly as the page rendered it. */
  readonly balance: string;
  /** The balance the machine held on the same frame. */
  readonly chips: number;
  /**
   * The pending wager the machine held on the same frame. `BJ-20`, item `C6`:
   * SPEC 4.11 moves the wager out of the balance at the deal rather than at
   * the tap, so the per-frame reading a rapid burst of chip presses shows is
   * this one and not the balance's.
   */
  readonly wager: number;
}

/** No trace runs longer than this, so a spec cannot hang on a stuck page. */
const TRACE_FRAME_LIMIT = 4000;

/** What the specs may ask the page for. Read-only, plus the one boot. */
export interface GameHarness {
  boot(options: HarnessBootOptions): void;
  readout(): ReturnType<Game['readout']>;
  session(): ReturnType<Game['session']>;
  /** What the last frame resolved for motion. Items `E7` and `E9`. */
  motion(): MotionProbe;
  /** What the last frame resolved for the layout. `BJ-16`, item `F6`. */
  layout(): LayoutProbe;
  /** What the last frame resolved for accessibility. `BJ-18`, items `G4`, `G9`. */
  accessibility(): AccessibilityProbe;
  /**
   * What the audio layer holds, and every cue it has been offered. `BJ-19`.
   *
   * The cue tally is the only window into item `K5`'s emission claim from
   * outside the page: a cue that was muted or found no context changed
   * nothing observable, so the counts are the offers. Read-only.
   */
  audio(): AudioProbe;
  /**
   * The play-surface set the renderer is drawing with, as hexes. `BJ-22`.
   *
   * Item `G2`'s audit measures rendered pixels against the colours the canvas
   * was told to paint, and under forced colors it cannot ask the stylesheet:
   * the chrome's custom properties are re-pointed at system colours, so
   * `getComputedStyle` answers `Canvas` and `ButtonText` while the canvas is
   * drawing SPEC 16's forced-colors table. This reports what the renderer
   * selected, which is the only honest source for that question.
   */
  surfaceTokens(): SurfaceTokenReport;
  /** Begin sampling the wallet every frame, until SPEC 10's round result. */
  watch(): void;
  /** Everything `watch` has sampled, oldest first. */
  samples(): readonly WalletSample[];
  /** Begin sampling the motion state every frame, until `stopTrace`. */
  trace(): void;
  /** Stop the motion sampler. */
  stopTrace(): void;
  /** Everything `trace` has sampled, oldest first. */
  motionTrace(): readonly MotionSample[];
}

/** Every colour the play surface paints as a flat fill, plus the felt set. */
export interface SurfaceTokenReport {
  readonly name: string;
  readonly flatFelt: boolean;
  readonly cardMargin: string;
  readonly cardFace: string;
  readonly cardBack: string;
  readonly rankBlack: string;
  readonly rankRed: string;
  readonly rail: string;
  readonly print: string;
  readonly chipRing: string;
  readonly chipGlyph: string;
  readonly felts: readonly string[];
  readonly chipFills: readonly string[];
}

let game: Game | null = null;
const recorded: WalletSample[] = [];
const traced: MotionSample[] = [];
let tracing = false;

/** SPEC 11's chip readout, as the page has it rendered right now. */
function balanceText(): string {
  return document.querySelector('[data-readout="chips"] .bj-readout__value')?.textContent ?? '';
}

function running(): Game {
  // The module's own accessor first: an in-page Reset re-boots internally,
  // which disposes the game this harness booted and replaces it with a fresh
  // one the local variable never learns about. `currentGame()` follows the
  // re-boot; the local is the fallback for the window between `boot` being
  // called and the module registering the result.
  const live = currentGame();
  if (live !== null) {
    return live;
  }
  if (game === null) {
    throw new Error('the harness has not booted a game');
  }
  return game;
}

const harness: GameHarness = {
  boot(options: HarnessBootOptions): void {
    // `boot` disposes whatever it built last, including the game the shipped
    // page started for itself, so exactly one frame loop is running afterwards.
    game = boot(options);
  },
  readout: () => running().readout(),
  session: () => running().session(),
  motion: () => running().motion(),
  layout: () => running().layout(),
  accessibility: () => running().accessibility(),
  audio: () => running().audio(),

  surfaceTokens(): SurfaceTokenReport {
    // The selection is asked for the same way the frame asks for it, so the
    // report is the set the last frame drew with rather than a guess from the
    // media query. `CHIP_FILL` and `CHIP_GLYPH` are the same in both sets by
    // SPEC 16: identity is the one thing a high-contrast set must not flatten.
    const selected = surfacePalette(running().accessibility().forcedColors);
    return {
      name: selected.name,
      flatFelt: selected.flatFelt,
      cardMargin: selected.surface.cardMargin,
      cardFace: selected.surface.cardFace,
      cardBack: selected.surface.cardBack,
      rankBlack: selected.surface.rankBlack,
      rankRed: selected.surface.rankRed,
      rail: selected.surface.rail,
      print: selected.surface.print,
      chipRing: selected.chipRing,
      chipGlyph: CHIP_GLYPH,
      felts: [selected.surface.feltBronze, selected.surface.feltSilver, selected.surface.feltGold],
      chipFills: CHIP_DENOMINATIONS.map((denomination) => CHIP_FILL[denomination]),
    };
  },

  trace(): void {
    traced.length = 0;
    tracing = true;
    let frames = 0;
    const tick = (): void => {
      const probe = running().motion();
      const snapshot = running().readout();
      traced.push({
        at: performance.now(),
        phase: snapshot.phase.kind,
        tweens: probe.tweensInFlight,
        reducedMotion: probe.reducedMotion,
        speed: probe.speed,
        balance: balanceText(),
        chips: snapshot.wallet.chips,
        wager: snapshot.wallet.wager,
      });
      frames += 1;
      if (tracing && frames < TRACE_FRAME_LIMIT) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  },

  stopTrace(): void {
    tracing = false;
  },

  motionTrace: () => traced,

  watch(): void {
    recorded.length = 0;
    const tick = (): void => {
      const snapshot = running().readout();
      const { chips, committed, insuranceStake, deferredStake, conserved } = snapshot.wallet;
      recorded.push({
        phase: snapshot.phase.kind,
        chips,
        committed,
        insuranceStake,
        deferredStake,
        conserved,
      });
      if (snapshot.phase.kind !== 'roundResult') {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  },

  samples: () => recorded,
};

/**
 * One entry of the shipped page's own phase log. `BJ-14`, item `E9`.
 *
 * Recorded by a `MutationObserver` on the shell's `data-phase` attribute rather
 * than by anything in this file, so the timings it produces are a measurement of
 * the **shipped** bundle driven through its own controls, with nothing injected
 * and no game booted from source. `tests/browser/support/game.ts` installs it.
 */
export interface PhaseTiming {
  readonly phase: string;
  readonly at: number;
}

declare global {
  interface Window {
    /** Assigned by the harness, never by the product. */
    __bjGame?: GameHarness;
    /** Assigned by the phase observer in `game.ts`, never by the product. */
    __bjPhaseLog?: PhaseTiming[];
  }
}

window.__bjGame = harness;
