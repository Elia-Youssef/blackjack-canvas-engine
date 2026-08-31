/**
 * Unit armour under `BJ-14`'s motion layer. Items `E6`, `E7` and `E9`.
 *
 * **No item is closed here.** `E6` is method D and closes at the ACCEPTANCE
 * section 4 demonstration session, on the capture `demo/motion`. `E7` and `E9`
 * are method T and are graded by `tests/browser/reduced-motion.spec.ts` and
 * `tests/browser/speed-setting.spec.ts` over the built `dist/`, because a
 * removed CSS transition, a page-wide media query and a real round on a real
 * canvas cannot be seen from a unit test. What this file covers is the part of
 * the part that is arithmetic: the tween shapes, the pacing block, the Speed
 * multiplier as the machine applies it, and the two absences that a scanner has
 * to compute or nobody is computing them.
 *
 * Four things here are worth reading before the assertions.
 *
 * **The peek is measured on both branches.** `E6`'s criterion was extended in
 * 2026-08-23 to grade SPEC 4.4's no-tell clause, and the half of it a headless
 * test can hold is that the peek takes exactly the same time whether or not it
 * finds a natural, at both speeds. Two scripted rounds differ in the hole card
 * alone and their peek phases are timed to the frame.
 *
 * **The Speed multiplier is measured on the machine, not read off a record.**
 * A test that asserted `PACING.dealInterval * 0.6` would pass over a machine
 * that ignored the setting entirely. Each timed phase is driven at a fixed fine
 * step at both speeds and its wall duration compared against the derived
 * schedule, which is `M5`'s device at `BJ-12` narrowed to one question.
 *
 * **The reduced-motion trap is answered structurally.** The brief's own words:
 * "Nothing in `core/` reads the reduced-motion flag. The same phase-duration
 * test runs with the flag both ways and asserts the results match." Both halves
 * are below: the phase durations are measured with a `Motion` resolved each way
 * and required identical, and `src/core/` is scanned for every spelling of the
 * flag, with a control that proves the scanner can see one.
 *
 * **The flash ceiling is counted, not argued.** QUALITY-BAR section 4 bounds
 * flashing at three in any rolling one-second window. The win pulse's envelope
 * is sampled and its peaks counted in a sliding window at both speeds, and a
 * deliberately faster envelope has to breach the same counter.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stripComments as withoutComments } from './support/source-scan';

import type { Rank } from '../../src/core/cards';
import { card } from '../../src/core/cards';
import type { PhaseKind } from '../../src/core/types';
import {
  DEFAULT_SPEED,
  FAST_SPEED_MULTIPLIER,
  PEEK_PAUSE,
  SPEEDS,
  TIMINGS,
  createTable,
  speedMultiplier,
  type Speed,
  type Table,
} from '../../src/core/table';
import {
  FLASH_LIMIT_HZ,
  PACING,
  PACING_NAMES,
  SATURATED_RED_FRACTION,
  WIN_PULSE_CYCLES,
  WIN_PULSE_HEADROOM,
  winPulseInk,
  WIN_PULSE_PERIOD,
  arcTravel,
  countUp,
  ease,
  easeOut,
  flipScale,
  flipShowsFace,
  redFraction,
  resolveMotion,
  slide,
  toward,
  winPulse,
  type PacingName,
} from '../../src/render/animate';
import { CHIP_GEOMETRY } from '../../src/render/chips';
import {
  createPlaySurface,
  easeStep,
  type Easing,
  type PlaySurface,
  type SceneState,
} from '../../src/render/scene';
import {
  EASE,
  HIGH_CONTRAST_SURFACE,
  STANDARD_PALETTE,
  SURFACE,
} from '../../src/render/tokens';
import {
  REDUCED_MOTION_QUERY,
  createMotionPreference,
  resolveReducedMotion,
} from '../../src/ui/motion';

import {
  createStyleFreeCanvas,
  type RecordedCall,
  type RecordedEntry,
} from './support/recording-context';
import { scriptedShoe } from './support/stacked-shoe';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Both motion modes, so every sweep below runs in each. */
const MODES = [false, true] as const;

/** A resolved policy, for readability at the call sites. */
function motionOf(reducedMotion: boolean, speed: Speed = DEFAULT_SPEED) {
  return resolveMotion({ reducedMotion, speed });
}

// ---------------------------------------------------------------------------
// SPEC 5: all tunable constants in one place, and this layer consumes that place
// ---------------------------------------------------------------------------

describe('E6 armour: the pacing block is consumed from the machine, never forked', () => {
  it('carries SPEC 5 seven reference timings as the machine holds them', () => {
    // Identity of value against `TIMINGS`, not against the numbers. A test that
    // wrote 0.22 down here would be the second copy this arrangement exists to
    // prevent: `phase-legality.test.ts` is where the constants are pinned to
    // SPEC 5's figures, and this is where the render layer is pinned to them.
    expect(PACING.dealInterval).toBe(TIMINGS.dealInterval);
    expect(PACING.cardTravel).toBe(TIMINGS.cardTravel);
    expect(PACING.holeCardFlip).toBe(TIMINGS.holeCardFlip);
    expect(PACING.handRecentre).toBe(TIMINGS.handRecentre);
    expect(PACING.revealPause).toBe(TIMINGS.revealPause);
    expect(PACING.dealerDrawInterval).toBe(TIMINGS.dealerDrawInterval);
    expect(PACING.settlePause).toBe(TIMINGS.settlePause);
  });

  it('takes the peek from the machine derived pause, which is the flip itself', () => {
    // SPEC 4.4's no-tell clause in its static form: one constant, no branch,
    // and the same one on both sides of the render boundary.
    expect(PACING.peekPause).toBe(PEEK_PAUSE);
    expect(PEEK_PAUSE).toBe(TIMINGS.holeCardFlip);
  });

  it('derives the chip slide and the count-up from a stated home', () => {
    // A chip crosses the felt at a card's pace, so no new number enters SPEC 5.
    expect(PACING.chipSlide).toBe(TIMINGS.cardTravel);
    // The count-up is a chrome duration and takes QUALITY-BAR section 15's
    // longest step, in seconds. `tokens.test.ts` already pins that step to the
    // design contract, so this only has to pin the conversion.
    expect(PACING.balanceCountUp).toBeCloseTo(0.32, 10);
  });

  it('names every constant in the sweep list, and nothing outside it', () => {
    expect([...PACING_NAMES].sort()).toEqual(Object.keys(PACING).sort());
    expect(new Set(PACING_NAMES).size).toBe(PACING_NAMES.length);
    // The eight the machine and SPEC 5 own, plus the three the presentation
    // layer adds. A constant added without a home fails this line first.
    expect(PACING_NAMES).toHaveLength(11);
    for (const name of PACING_NAMES) {
      expect(PACING[name], name).toBeGreaterThan(0);
    }
  });

  it('writes no SPEC 5 number, scaled or not, into the motion layer', () => {
    // The specific defect `table.ts`'s header warns about: a scaled or restated
    // copy of the constants, with an alias left bound to the unscaled one. The
    // scan covers the two files `BJ-14` owns under `src/render/`, and both the
    // raw constants and their Fast scalings, because either spelling would be
    // the fork. It is deliberately not widened to the whole directory: `card.ts`
    // and `chips.ts` carry geometry fractions that coincide with SPEC 5's
    // figures by accident, and a scan that flagged those would be noise rather
    // than a gate.
    const literal = (value: number): RegExp =>
      new RegExp(`(?<![\\d.])${String(value).replace('.', '\\.')}(?![\\d])`);
    // The can-see control: the pattern really matches a planted literal.
    expect(literal(TIMINGS.dealInterval).test('const interval = 0.22;')).toBe(true);
    expect(literal(TIMINGS.dealInterval).test('const other = 10.221;')).toBe(false);

    const offenders: string[] = [];
    for (const name of ['animate.ts', 'scene.ts']) {
      const source = withoutComments(
        readFileSync(join(PROJECT_ROOT, 'src', 'render', name), 'utf8'),
      );
      for (const value of Object.values(TIMINGS)) {
        for (const spelling of [value, value * FAST_SPEED_MULTIPLIER]) {
          if (literal(spelling).test(source)) {
            offenders.push(`${name}: ${String(spelling)}`);
          }
        }
      }
    }
    expect(offenders, 'SPEC 5 constants are imported, never restated').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// E9: Fast multiplies every pacing constant by 0.6
// ---------------------------------------------------------------------------

describe('E9: Fast multiplies every pacing constant by 0.6, in both motion modes', () => {
  it('multiplies by exactly 0.6, on every constant, in both modes', () => {
    expect(FAST_SPEED_MULTIPLIER).toBe(0.6);
    for (const reducedMotion of MODES) {
      const normal = motionOf(reducedMotion, 'normal');
      const fast = motionOf(reducedMotion, 'fast');
      for (const name of PACING_NAMES) {
        expect(normal.seconds(name), `${name} at Normal`).toBe(PACING[name]);
        expect(fast.seconds(name), `${name} at Fast`).toBe(PACING[name] * FAST_SPEED_MULTIPLIER);
        // Stated as the criterion states it, as well as as the code computes it.
        expect(fast.seconds(name), `${name} ratio`).toBe(normal.seconds(name) * 0.6);
      }
    }
  });

  it('leaves Normal exactly unscaled, so no schedule derived before this part moved', () => {
    expect(speedMultiplier('normal')).toBe(1);
    expect(speedMultiplier('fast')).toBe(FAST_SPEED_MULTIPLIER);
    expect(DEFAULT_SPEED).toBe('normal');
    expect([...SPEEDS]).toEqual(['normal', 'fast']);
    for (const name of PACING_NAMES) {
      expect(PACING[name] * speedMultiplier('normal')).toBe(PACING[name]);
    }
  });
});

// ---------------------------------------------------------------------------
// E9 and E6: the machine really slows down, and the peek tells nothing
// ---------------------------------------------------------------------------

/** A fine fixed step, exact in binary, so accumulation does not drift. */
const STEP = 1 / 256;

/** Two frames of slack. A phase boundary is quantised to one at each end. */
const SLACK = 2 * STEP;

/** No round in this file needs more frames than this. */
const FRAME_LIMIT = 20_000;

/** The wager every scripted round below places. */
const WAGER = 10;

/**
 * How long each phase of one scripted round lasted, in seconds.
 *
 * Measured by driving the machine at a fixed step and recording the frame each
 * phase was entered on, which is `M5`'s device narrowed to one question: not
 * "does the machine keep wall-clock time" but "does the Speed setting reach it".
 */
function phaseDurations(script: readonly Rank[], speed: Speed): Map<PhaseKind, number> {
  const table: Table = createTable({ shoe: scriptedShoe(script), speed });
  table.apply({ kind: 'start' });
  table.apply({ kind: 'tapChip', chip: WAGER });
  table.apply({ kind: 'deal' });

  const durations = new Map<PhaseKind, number>();
  let phase = table.readout().phase.kind;
  let entered = 0;
  let elapsed = 0;

  for (let frame = 0; frame < FRAME_LIMIT; frame += 1) {
    // The player's decisions are applied at the frame boundary and consume no
    // wall time, so what is measured below is the machine's pacing and not the
    // driver's. Insurance is declined and every hand stands, which is the
    // shortest path that still visits all five timed phases.
    const kind = table.readout().phase.kind;
    if (kind === 'insurance') {
      table.apply({ kind: 'declineInsurance' });
    } else if (kind === 'playerTurn') {
      table.apply({ kind: 'stand' });
    }
    const now = table.readout().phase.kind;
    if (now !== phase) {
      durations.set(phase, elapsed - entered);
      phase = now;
      entered = elapsed;
    }
    if (now === 'roundResult') {
      return durations;
    }
    table.update(STEP);
    elapsed += STEP;
    const after = table.readout().phase.kind;
    if (after !== phase) {
      durations.set(phase, elapsed - entered);
      phase = after;
      entered = elapsed;
      if (after === 'roundResult') {
        return durations;
      }
    }
  }
  throw new Error('the scripted round did not reach SPEC 10 round result');
}

/**
 * A round in which the dealer shows an Ace and the hole card is not a ten, so
 * the peek runs and finds nothing. SPEC 4.3 deals player, dealer up, player,
 * dealer down.
 */
const PEEK_NO_NATURAL: readonly Rank[] = ['9', 'A', '7', '6', '5', '4', '3', '2', '8'];

/** The same round with the hole card a ten, so the peek finds a natural. */
const PEEK_NATURAL: readonly Rank[] = ['9', 'A', '7', 'K', '5', '4', '3', '2', '8'];

describe('E6 armour: the peek is one duration, on both branches and at both speeds', () => {
  it('reaches both branches, and they really differ in what the peek found', () => {
    // The control. If both scripts settled the same way the comparison below
    // would be timing one thing twice.
    const found = createTable({ shoe: scriptedShoe(PEEK_NATURAL) });
    found.apply({ kind: 'start' });
    found.apply({ kind: 'tapChip', chip: WAGER });
    found.apply({ kind: 'deal' });
    for (let frame = 0; frame < FRAME_LIMIT; frame += 1) {
      if (found.readout().phase.kind === 'insurance') {
        found.apply({ kind: 'declineInsurance' });
      }
      if (found.readout().phase.kind === 'roundResult') {
        break;
      }
      found.update(STEP);
    }
    const result = found.readout().phase;
    expect(result.kind).toBe('roundResult');
    if (result.kind !== 'roundResult') {
      throw new Error('unreachable');
    }
    // A dealer natural settles the hand at SPEC 4.10's own rung, with no player
    // turn at all: the round that found nothing gets one.
    expect(result.result.hands[0]?.outcome).toBe('DEALER_WIN');
    expect(phaseDurations(PEEK_NO_NATURAL, 'normal').has('playerTurn')).toBe(true);
  });

  for (const speed of SPEEDS) {
    it(`times the peek identically on both branches at ${speed}`, () => {
      const scale = speedMultiplier(speed);
      const withNatural = phaseDurations(PEEK_NATURAL, speed).get('peek');
      const without = phaseDurations(PEEK_NO_NATURAL, speed).get('peek');
      expect(withNatural, 'the natural branch runs a peek').toBeDefined();
      expect(without, 'the other branch runs a peek').toBeDefined();
      // Identical to the frame, and equal to the one constant, scaled. Not just
      // equal to each other: two branches that were both wrong by the same
      // amount would pass a comparison and fail SPEC 4.4 anyway.
      expect(withNatural).toBe(without);
      expect(withNatural ?? 0).toBeGreaterThan(PEEK_PAUSE * scale - SLACK);
      expect(withNatural ?? 0).toBeLessThan(PEEK_PAUSE * scale + SLACK);
    });
  }
});

describe('E9: the machine itself runs to the scaled schedule', () => {
  /**
   * Each timed phase and how many of its steps one round of the script takes.
   *
   * `dealing` is SPEC 4.3's four cards, so it is four intervals. The dealer's
   * turn depends on the cards and is deliberately absent: the script above
   * leaves the dealer standing on the up card in one branch and drawing in the
   * other, and a count written here would be a claim about the script rather
   * than about the multiplier.
   */
  const STEPS: Partial<Record<PhaseKind, { readonly pacing: PacingName; readonly steps: number }>> = {
    dealing: { pacing: 'dealInterval', steps: 4 },
    peek: { pacing: 'peekPause', steps: 1 },
    reveal: { pacing: 'revealPause', steps: 1 },
    settling: { pacing: 'settlePause', steps: 1 },
  };

  for (const speed of SPEEDS) {
    it(`holds every timed phase to its scaled duration at ${speed}`, () => {
      const measured = phaseDurations(PEEK_NO_NATURAL, speed);
      const scale = speedMultiplier(speed);
      let checked = 0;
      for (const [kind, expected] of Object.entries(STEPS)) {
        if (expected === undefined) {
          continue;
        }
        const seen = measured.get(kind as PhaseKind);
        expect(seen, `${kind} was reached`).toBeDefined();
        const want = PACING[expected.pacing] * expected.steps * scale;
        expect(seen ?? 0, `${kind} at ${speed}`).toBeGreaterThan(want - SLACK);
        expect(seen ?? 0, `${kind} at ${speed}`).toBeLessThan(want + SLACK);
        checked += 1;
      }
      expect(checked, 'every listed phase was measured').toBe(4);
    });
  }

  it('changes neither the sequence of states nor any outcome', () => {
    const transcribe = (speed: Speed): { states: PhaseKind[]; result: unknown } => {
      const table = createTable({ shoe: scriptedShoe(PEEK_NO_NATURAL), speed });
      const states: PhaseKind[] = [table.readout().phase.kind];
      const record = (): void => {
        const kind = table.readout().phase.kind;
        if (states[states.length - 1] !== kind) {
          states.push(kind);
        }
      };
      table.apply({ kind: 'start' });
      record();
      table.apply({ kind: 'tapChip', chip: WAGER });
      record();
      table.apply({ kind: 'deal' });
      record();
      for (let frame = 0; frame < FRAME_LIMIT; frame += 1) {
        const kind = table.readout().phase.kind;
        if (kind === 'insurance') {
          table.apply({ kind: 'declineInsurance' });
        } else if (kind === 'playerTurn') {
          table.apply({ kind: 'stand' });
        }
        record();
        if (table.readout().phase.kind === 'roundResult') {
          break;
        }
        table.update(STEP);
        record();
      }
      const phase = table.readout().phase;
      return { states, result: phase.kind === 'roundResult' ? phase.result : null };
    };

    const normal = transcribe('normal');
    const fast = transcribe('fast');
    expect(fast.states).toEqual(normal.states);
    expect(fast.result).toEqual(normal.result);
    expect(normal.result).not.toBeNull();
    // The control: the two runs were not identical in every respect, or the
    // comparison above would hold over a machine that ignored the setting.
    const durations = (speed: Speed): number =>
      [...phaseDurations(PEEK_NO_NATURAL, speed).values()].reduce((sum, value) => sum + value, 0);
    expect(durations('fast')).toBeLessThan(durations('normal'));
  });
});

// ---------------------------------------------------------------------------
// E7: the one switch, and nothing in core/ that could read the flag
// ---------------------------------------------------------------------------

function sourcesUnder(...segments: readonly string[]): { path: string; code: string }[] {
  const root = join(PROJECT_ROOT, ...segments);
  const files: { path: string; code: string }[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        files.push({
          path: full.replace(/\\/g, '/').slice(PROJECT_ROOT.length + 1),
          code: withoutComments(readFileSync(full, 'utf8')),
        });
      }
    }
  };
  walk(root);
  return files;
}

/** Every spelling of the flag this project uses or could plausibly use. */
const FLAG_PATTERNS: readonly { readonly pattern: RegExp; readonly sample: string }[] = [
  { pattern: /\breducedMotion\b/, sample: 'const x = motion.reducedMotion;' },
  { pattern: /prefers-reduced-motion/, sample: "matchMedia('(prefers-reduced-motion: reduce)')" },
  { pattern: /\bmatchMedia\b/, sample: 'const q = matchMedia(query);' },
];

describe('E7: nothing in core/ can read the reduced-motion flag', () => {
  it('proves every pattern against its planted sample', () => {
    for (const { pattern, sample } of FLAG_PATTERNS) {
      expect(pattern.test(sample), pattern.source).toBe(true);
    }
  });

  it('finds the flag in the layers that own it, so the scan is not blind', () => {
    // The can-see control. A scanner that found nothing anywhere would report a
    // clean `core/` whether or not `core/` was clean.
    const named = sourcesUnder('src')
      .filter((file) => FLAG_PATTERNS.some(({ pattern }) => pattern.test(file.code)))
      .map((file) => file.path);
    expect(named).toContain('src/render/animate.ts');
    expect(named).toContain('src/ui/motion.ts');
  });

  it('names it in no file under src/core', () => {
    const offenders = sourcesUnder('src', 'core')
      .filter((file) => FLAG_PATTERNS.some(({ pattern }) => pattern.test(file.code)))
      .map((file) => file.path);
    expect(offenders, 'the simulation must not know the flag exists').toEqual([]);
  });

  it('branches on it in exactly one place in the whole presentation layer', () => {
    // "Removes every animation entirely, not partially" is a structural claim:
    // one switch, in `progress`, which every tween is written over. A second
    // `if (reducedMotion)` anywhere is how partially happens, and this is the
    // line that finds one.
    const branches: string[] = [];
    for (const file of [...sourcesUnder('src', 'render'), ...sourcesUnder('src', 'ui')]) {
      for (const match of file.code.matchAll(/if\s*\(\s*!?\s*(?:[\w$]+\s*\.\s*)*reducedMotion\b/g)) {
        branches.push(`${file.path}: ${match[0]}`);
      }
    }
    expect(branches).toEqual(['src/render/animate.ts: if (reducedMotion']);
  });
});

describe('E7: the flag removes the animation and leaves the pacing alone', () => {
  it('answers a finished progress from the first frame, for every tween', () => {
    for (const speed of SPEEDS) {
      const reduced = motionOf(true, speed);
      const full = motionOf(false, speed);
      for (const name of PACING_NAMES) {
        expect(reduced.progress(name, 0), `${name} at rest`).toBe(1);
        expect(reduced.progress(name, reduced.seconds(name) / 2), `${name} midway`).toBe(1);
        // The control: without the flag the same age is genuinely part way.
        expect(full.progress(name, 0), `${name} at rest`).toBe(0);
        expect(full.progress(name, full.seconds(name) / 2), `${name} midway`).toBeCloseTo(0.5, 10);
        expect(full.progress(name, full.seconds(name)), `${name} done`).toBe(1);
      }
    }
  });

  it('resolves the same pacing with the flag both ways, at both speeds', () => {
    // The brief's trap, written out: the same durations, measured with the flag
    // set each way, must match. Nothing in `core/` takes the flag at all, so
    // this is the render layer's half of the same claim.
    for (const speed of SPEEDS) {
      const reduced = motionOf(true, speed);
      const full = motionOf(false, speed);
      for (const name of PACING_NAMES) {
        expect(reduced.seconds(name), `${name} at ${speed}`).toBe(full.seconds(name));
      }
    }
  });

  it('keeps the machine phase durations identical with the flag both ways', () => {
    // The literal reading of the trap: the phase-duration measurement above,
    // run once per motion mode. `core/` has no motion parameter, so what this
    // proves is that resolving one cannot reach the simulation at all.
    const under = (reducedMotion: boolean): Map<PhaseKind, number> => {
      const motion = motionOf(reducedMotion);
      expect(motion.reducedMotion).toBe(reducedMotion);
      return phaseDurations(PEEK_NO_NATURAL, motion.speed);
    };
    expect([...under(true).entries()]).toEqual([...under(false).entries()]);
  });
});

// ---------------------------------------------------------------------------
// E7: where the flag comes from, and SPEC 14's setting arriving on top of it
// ---------------------------------------------------------------------------

/**
 * A media query list, as much of one as `createMotionPreference` touches.
 *
 * Injected through the disclosed `query` option, in the same spirit as
 * `FrameLoopOptions.schedule` and `TableOptions.shoe`: the browser gate drives
 * the real query, which is what `E7` is graded on, and this drives the
 * resolution rule around it, which a browser cannot show cheaply. A platform
 * change mid-session is one line here and a page reload there.
 */
function stubQuery(matches: boolean): {
  list: MediaQueryList;
  change(next: boolean): void;
  listeners(): number;
} {
  const handlers = new Set<(event: MediaQueryListEvent) => void>();
  let current = matches;
  const list = {
    get matches() {
      return current;
    },
    media: REDUCED_MOTION_QUERY,
    addEventListener(_type: string, handler: (event: MediaQueryListEvent) => void): void {
      handlers.add(handler);
    },
    removeEventListener(_type: string, handler: (event: MediaQueryListEvent) => void): void {
      handlers.delete(handler);
    },
  } as unknown as MediaQueryList;
  return {
    list,
    change(next: boolean): void {
      current = next;
      for (const handler of handlers) {
        handler({ matches: next } as MediaQueryListEvent);
      }
    },
    listeners: () => handlers.size,
  };
}

describe('E7: the resolution rule, and SPEC 14 never overriding the platform', () => {
  it('asks the same condition the stylesheet asks', () => {
    // Two answers to one question, and they have to be the same question. The
    // stylesheet removes the CSS transitions and this module removes the canvas
    // tweens; a query string that drifted would split the page in half.
    const css = readFileSync(join(PROJECT_ROOT, 'src', 'ui', 'tokens.css'), 'utf8');
    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
    expect(css).toContain(`@media ${REDUCED_MOTION_QUERY}`);
  });

  it('adds reduction and never removes it', () => {
    // SPEC 14's two words, in a truth table. "System" honours the query and
    // "always" does not consult it, so a player who asked their platform for
    // reduced motion still gets it whichever arm the setting is on.
    expect(resolveReducedMotion(false, false)).toBe(false);
    expect(resolveReducedMotion(false, true)).toBe(true);
    expect(resolveReducedMotion(true, false)).toBe(true);
    expect(resolveReducedMotion(true, true)).toBe(true);
  });

  it('reads the platform, and answers no-preference where there is none to ask', () => {
    expect(createMotionPreference({ query: stubQuery(true).list }).reduced()).toBe(true);
    expect(createMotionPreference({ query: stubQuery(false).list }).reduced()).toBe(false);
    // A host with no `matchMedia` has not been asked rather than asked and
    // answered: defaulting to reduced would remove the animation from every
    // environment the unit suite runs in and hide the difference `E7` measures.
    expect(createMotionPreference({ query: null }).reduced()).toBe(false);
    expect(createMotionPreference({ query: null }).systemPrefers()).toBe(false);
  });

  it('follows the platform changing mid-session, and stops on dispose', () => {
    const stub = stubQuery(false);
    const preference = createMotionPreference({ query: stub.list });
    expect(preference.reduced()).toBe(false);
    expect(stub.listeners(), 'the preference is listening').toBe(1);

    stub.change(true);
    expect(preference.reduced(), 'a player turning it on is honoured next frame').toBe(true);
    stub.change(false);
    expect(preference.reduced()).toBe(false);

    preference.dispose();
    expect(stub.listeners(), 'dispose lets the query go').toBe(0);
    stub.change(true);
    expect(preference.reduced(), 'a disposed preference stops following').toBe(false);
  });

  it('carries SPEC 14 always arm on top of whatever the platform says', () => {
    const stub = stubQuery(false);
    const preference = createMotionPreference({ query: stub.list });
    expect(preference.reduced()).toBe(false);
    preference.setAlwaysReduce(true);
    expect(preference.reduced(), 'always reduces without asking').toBe(true);
    expect(preference.systemPrefers(), 'and the platform still says what it says').toBe(false);
    preference.setAlwaysReduce(false);
    expect(preference.reduced()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E7: the re-centre lands on the frame the flag says it should
// ---------------------------------------------------------------------------

describe('E7: reduced motion removes the re-centre rather than deferring it', () => {
  /** A hand that has settled at `width` and is about to grow. */
  const settled = (width: number): Easing => ({ from: width, to: width, age: 5 });

  it('shows the new width on the frame the target moves, under the flag', () => {
    // The residual this asserts away: an ease that restarted and then reported
    // the value it held **before** the restart showed the previous target for
    // one frame, because under the flag the pre-restart reading is exactly where
    // the hand used to be. One frame is 67 ms at 15 fps, and `moving` was false
    // throughout, so nothing in the tween count would ever have reported it.
    const held = settled(100);
    const step = easeStep(held, 240, 1 / 60, motionOf(true));
    expect(step.value, 'the hand lays out at its new width immediately').toBe(240);
    expect(step.moving, 'and nothing is in flight to remove').toBe(false);
  });

  it('holds there on every later frame, with nothing left to catch up', () => {
    const held = settled(100);
    easeStep(held, 240, 1 / 60, motionOf(true));
    for (let frame = 0; frame < 5; frame += 1) {
      const step = easeStep(held, 240, 1 / 60, motionOf(true));
      expect(step.value).toBe(240);
      expect(step.moving).toBe(false);
    }
  });

  it('still eases from where it was showing when the flag is not set', () => {
    // The control, and the reason the fix is a reading rather than a branch:
    // outside the flag a restarted ease must start from the value on screen, not
    // jump to the target. `progress` of a zero age is 0, which is `from`.
    const held = settled(100);
    const first = easeStep(held, 240, 1 / 60, motionOf(false));
    expect(first.value, 'the frame the target moves shows the old width').toBe(100);
    expect(first.moving, 'and is in flight from that frame on').toBe(true);

    const halfway = easeStep(held, 240, PACING.handRecentre / 2, motionOf(false));
    expect(halfway.value).toBeGreaterThan(100);
    expect(halfway.value).toBeLessThan(240);
    expect(halfway.moving).toBe(true);

    const landed = easeStep(held, 240, PACING.handRecentre, motionOf(false));
    expect(landed.value, 'and lands exactly on the target').toBe(240);
    expect(landed.moving).toBe(false);
  });

  it('restarts from where it had reached, not from where it set out', () => {
    // A hand that gains a second card mid-slide slides once, from wherever it
    // had got to. Unchanged by the fix, and asserted because the fix rewrote the
    // line that does it.
    const held = settled(100);
    easeStep(held, 240, 1 / 60, motionOf(false));
    const partway = easeStep(held, 240, PACING.handRecentre / 2, motionOf(false));
    const restarted = easeStep(held, 300, 1 / 60, motionOf(false));

    // The restart takes this frame's value, not the previous frame's: the age is
    // advanced before the target is compared, so what the ease starts from is
    // what is on screen when it starts.
    expect(restarted.value).toBeGreaterThan(partway.value);
    expect(restarted.value).toBeLessThan(240);
    expect(held.from, 'and it sets out from exactly that').toBe(restarted.value);
    expect(held.to).toBe(300);
    expect(held.age).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// E6 armour: a chip in flight presents the face of the chip it becomes
// ---------------------------------------------------------------------------

/** A card's far corner index is printed under exactly this. `card.ts`. */
const HALF_TURN = Math.PI;

/**
 * Every glyph drawn under a turn this game does not intend, as the recorder saw
 * it.
 *
 * A flying chip is a one-chip `ChipStackSpec` drawn inside the layer's own turn,
 * because `drawChip` is private by design. The turn is exact for the dash ring,
 * whose arcs are all centred on the point being rotated about, and it is wrong
 * for anything with an upright reading: a numeral drawn under it arrives tilted
 * and snaps upright the moment it lands. So the rule is structural rather than a
 * matter of care, and this is what checks it.
 *
 * **One turn over text is intended, and it is excluded by value rather than by
 * layer: a card's far corner index, printed under exactly a half turn.** That is
 * what a playing card looks like and `BJ-13` graded it. Excluding the angle and
 * not the call site means a card index that drifted off a half turn is caught
 * here as well, and means nothing new can print a glyph sideways by claiming to
 * be a card.
 *
 * The walker keeps a stack of the turn in effect, pushed on `save` and popped on
 * `restore`, which is the canvas's own transform stack. Angles compose, so a
 * half turn inside a half turn is upright again and reads as no turn at all.
 */
function textUnderRotation(entries: readonly RecordedEntry[]): string[] {
  const offenders: string[] = [];
  const turned: number[] = [0];
  const upright = (angle: number): boolean => {
    const wrapped = Math.abs(angle % (2 * HALF_TURN));
    return wrapped < 1e-9 || Math.abs(wrapped - HALF_TURN) < 1e-9;
  };
  for (const entry of entries) {
    if (entry.kind !== 'call') {
      continue;
    }
    if (entry.op === 'save') {
      turned.push(turned[turned.length - 1] ?? 0);
    } else if (entry.op === 'restore') {
      if (turned.length > 1) {
        turned.pop();
      }
    } else if (entry.op === 'rotate') {
      turned[turned.length - 1] = (turned[turned.length - 1] ?? 0) + Number(entry.args[0]);
    } else if (
      (entry.op === 'fillText' || entry.op === 'strokeText') &&
      !upright(turned[turned.length - 1] ?? 0)
    ) {
      offenders.push(String(entry.args[0]));
    }
  }
  return offenders;
}

/** Every numeral drawn at all, in order. */
function textDrawn(entries: readonly RecordedEntry[]): string[] {
  return entries
    .filter((entry): entry is RecordedCall => entry.kind === 'call' && entry.op === 'fillText')
    .map((entry) => String(entry.args[0]));
}

/** A play surface drawing into a recorder, and the frames it drew. */
function recordingSurface(): { surface: PlaySurface; recording: ReturnType<typeof createStyleFreeCanvas>['recording'] } {
  const { canvas, recording } = createStyleFreeCanvas();
  const surface = createPlaySurface({
    canvas,
    offscreen: () => createStyleFreeCanvas().canvas,
    sizing: { width: 800, height: 450, dpr: 1 },
  });
  return { surface, recording };
}

/** A scene with nothing on it but what the caller puts there. */
function scene(overrides: Partial<SceneState>): SceneState {
  return {
    felt: 'bronze',
    limits: { minimum: 10, maximum: 100 },
    dealer: [],
    dealerConcealed: 0,
    hands: [],
    pendingWager: 0,
    motion: motionOf(false),
    palette: STANDARD_PALETTE,
    ...overrides,
  };
}

/** 300 is three chips of one denomination, so the top numeral is unambiguous. */
const FLIGHT_WAGER = 300;

describe('settled play-surface rendering', () => {
  it('keeps a separated baked felt off the animated canvas', () => {
    const foreground = createStyleFreeCanvas();
    const background = createStyleFreeCanvas();
    // The contract from `BJ-22`'s fix round: `offscreen` makes the grain
    // squares, the felt layer hands out a canvas per bake, and the layer is
    // told which one to show. Nothing is ever copied onto a shared canvas.
    const offscreens: ReturnType<typeof createStyleFreeCanvas>[] = [];
    let shown: unknown = null;
    const surface = createPlaySurface({
      canvas: foreground.canvas,
      offscreen: () => {
        const made = createStyleFreeCanvas();
        offscreens.push(made);
        return made.canvas;
      },
      feltLayer: {
        acquire: () => background.canvas,
        show: (canvas) => {
          shown = canvas;
        },
        release: () => undefined,
      },
      sizing: { width: 800, height: 450, dpr: 1 },
    });

    surface.render(scene({ pendingWager: FLIGHT_WAGER }), 0);

    // The felt was baked straight onto the layer's canvas, print and all.
    expect(background.recording.calls('fillText').length, 'the felt was not baked').toBe(4);
    expect(background.recording.calls('fill').length).toBeGreaterThan(0);
    expect(shown, 'the layer was never told which canvas to show').toBe(background.canvas);

    // The offscreens are the two grain squares and nothing else: no felt was
    // baked into one, so nothing had to be copied out of one.
    expect(offscreens).toHaveLength(2);
    for (const made of offscreens) {
      expect(made.recording.calls('fillText')).toHaveLength(0);
    }

    expect(foreground.recording.calls('drawImage')).toHaveLength(0);
    expect(foreground.recording.calls('clearRect')).toHaveLength(1);
    expect(foreground.recording.calls('fill').length, 'the moving scene did not draw').toBeGreaterThan(0);
  });

  it('reuses identical settled pixels instead of repainting every frame', () => {
    const { surface, recording } = recordingSurface();
    const state = scene({});

    surface.render(state, 0);
    expect(recording.entries.length, 'the first frame did not draw').toBeGreaterThan(0);
    recording.entries.length = 0;
    surface.render(state, 1 / 60);

    expect(recording.entries).toHaveLength(0);
    expect(surface.tweensInFlight()).toBe(0);
  });

  it('redraws a changed scene and an identical scene after resize', () => {
    const { surface, recording } = recordingSurface();
    const state = scene({});
    const changed = scene({ felt: 'silver', limits: { minimum: 50, maximum: 500 } });

    surface.render(state, 0);
    recording.entries.length = 0;
    surface.render(changed, 1 / 60);
    expect(recording.entries.length, 'a state change did not draw').toBeGreaterThan(0);

    recording.entries.length = 0;
    surface.resize({ width: 801, height: 451, dpr: 1 });
    surface.render(changed, 1 / 60);
    expect(recording.entries.length, 'a resize did not redraw cleared pixels').toBeGreaterThan(0);
  });

  it('draws the final tween frame before reusing its settled pixels', () => {
    const { surface, recording } = recordingSurface();
    const state = scene({ pendingWager: FLIGHT_WAGER });

    surface.render(state, 0);
    expect(surface.tweensInFlight()).toBeGreaterThan(0);
    recording.entries.length = 0;
    surface.render(state, PACING.chipSlide);
    expect(recording.entries.length, 'the final tween frame did not draw').toBeGreaterThan(0);
    expect(surface.tweensInFlight()).toBe(0);

    recording.entries.length = 0;
    surface.render(state, 1 / 60);
    expect(recording.entries).toHaveLength(0);
  });
});

/**
 * QUALITY-BAR section 7's clauses reach `table.update` and stop there: the
 * composition root hands the raw delta to `surface.render` and to `chrome.sync`.
 * Item `M5` at `BJ-12` drives the machine on an unstable clock and nothing has
 * ever driven the renderer on one, which matters because the renderer's failure
 * on a non-finite delta is permanent rather than transient: `Math.min(NaN, span)`
 * is `NaN`, so an age poisoned once never advances again and every tween sits at
 * progress 0 for the life of its key.
 *
 * A large delta is deliberately not clamped and the third test says so: a resume
 * must land the tweens finished, not leave them mid-flight.
 */
describe('QUALITY-BAR 7: the presentation half survives a hostile clock', () => {
  it('lands its tweens after a non-finite frame instead of freezing at zero', () => {
    const { surface } = recordingSurface();
    const state = scene({ pendingWager: FLIGHT_WAGER });

    surface.render(state, 0);
    expect(surface.tweensInFlight(), 'nothing was in flight to poison').toBeGreaterThan(0);
    surface.render(state, Number.NaN);

    for (let frame = 0; frame < 240; frame += 1) {
      surface.render(state, 1 / 60);
    }
    expect(surface.tweensInFlight(), 'a NaN frame stopped the tween for ever').toBe(0);
  });

  it('does not rewind a settled tween on a negative frame', () => {
    const { surface } = recordingSurface();
    const state = scene({ pendingWager: FLIGHT_WAGER });

    surface.render(state, 0);
    surface.render(state, PACING.chipSlide);
    expect(surface.tweensInFlight()).toBe(0);

    surface.render(state, -PACING.chipSlide);
    expect(surface.tweensInFlight(), 'a negative delta put a settled tween back in flight').toBe(0);
  });

  it('still saturates on a resume-sized frame, which is what a resume needs', () => {
    const { surface } = recordingSurface();
    const state = scene({ pendingWager: FLIGHT_WAGER });

    surface.render(state, 0);
    expect(surface.tweensInFlight()).toBeGreaterThan(0);
    surface.render(state, 30);
    expect(surface.tweensInFlight(), 'a resume left the tweens mid-flight').toBe(0);
  });
});

describe('E6 armour: no numeral is drawn under a rotated transform', () => {
  it('finds one when there is one, and none when there is not', () => {
    // The can-see control. A walker that never reported anything would report a
    // clean frame whatever the frame contained.
    const turned: RecordedEntry[] = [
      { kind: 'call', op: 'save', args: [] },
      { kind: 'call', op: 'rotate', args: [1] },
      { kind: 'call', op: 'fillText', args: ['100', 0, 0] },
      { kind: 'call', op: 'restore', args: [] },
    ];
    expect(textUnderRotation(turned)).toEqual(['100']);
    // The dash turn of a chip at index 2, which is what the defect looked like:
    // 55 degrees off upright, snapping straight the moment the chip landed.
    expect(
      textUnderRotation([
        { kind: 'call', op: 'save', args: [] },
        { kind: 'call', op: 'rotate', args: [2 * CHIP_GEOMETRY.dashTurn] },
        { kind: 'call', op: 'fillText', args: ['100', 0, 0] },
        { kind: 'call', op: 'restore', args: [] },
      ]),
    ).toEqual(['100']);
    // Restored before the text: outside the turn, and not an offence.
    expect(
      textUnderRotation([
        { kind: 'call', op: 'save', args: [] },
        { kind: 'call', op: 'rotate', args: [1] },
        { kind: 'call', op: 'restore', args: [] },
        { kind: 'call', op: 'fillText', args: ['100', 0, 0] },
      ]),
    ).toEqual([]);
    // A turn of nothing is not a turn, and the one intended turn over a glyph
    // is a card's far index at exactly a half turn.
    expect(
      textUnderRotation([
        { kind: 'call', op: 'rotate', args: [0] },
        { kind: 'call', op: 'fillText', args: ['100', 0, 0] },
      ]),
    ).toEqual([]);
    expect(
      textUnderRotation([
        { kind: 'call', op: 'rotate', args: [HALF_TURN] },
        { kind: 'call', op: 'fillText', args: ['A', 0, 0] },
      ]),
    ).toEqual([]);
  });

  it('draws no numeral at all while every chip of a stack is still arriving', () => {
    const { surface, recording } = recordingSurface();
    surface.render(scene({ pendingWager: FLIGHT_WAGER }), 0);

    // Three chips, all new, all in the air on the frame they appear.
    expect(surface.tweensInFlight()).toBe(3);
    expect(recording.calls('rotate')).toHaveLength(3);
    // And nothing is labelled: the value of a stack is read off the chip on top
    // of it, and there is no chip on top of it yet.
    expect(textDrawn(recording.entries)).toEqual([]);
    expect(textUnderRotation(recording.entries)).toEqual([]);
  });

  it('draws exactly the landed stack numeral once the chips are down', () => {
    const { surface, recording } = recordingSurface();
    const state = scene({ pendingWager: FLIGHT_WAGER });
    surface.render(state, 0);
    recording.entries.length = 0;
    surface.render(state, PACING.chipSlide);

    expect(surface.tweensInFlight()).toBe(0);
    expect(recording.calls('rotate'), 'nothing is in the air to turn').toHaveLength(0);
    // `wagerToChips(300)` is three hundreds, and a stack is labelled once.
    expect(textDrawn(recording.entries)).toEqual(['100']);
  });

  it('keeps text out of the turn on a frame that has both text and a flight', () => {
    // The non-vacuous run: a hand's corner indices are drawn in the same frame
    // as three chips in the air, so the walker is reading a stream that really
    // contains text rather than an empty one.
    const { surface, recording } = recordingSurface();
    surface.render(
      scene({
        hands: [{ cards: [card('A', 'spades'), card('K', 'hearts')], wager: FLIGHT_WAGER, won: null }],
      }),
      0,
    );
    // Both corner indices of both cards, so the far one really is printed under
    // the half turn the walker excludes by value: the stream contains text
    // inside a rotation, and the walker still has to come back clean.
    expect(textDrawn(recording.entries).length, 'the frame draws text').toBeGreaterThan(0);
    const turns = recording.calls('rotate').map((call) => Number(call.args[0]));
    expect(turns.filter((angle) => angle === HALF_TURN).length, 'a card turns').toBeGreaterThan(0);
    expect(turns.filter((angle) => angle !== HALF_TURN).length, 'a chip turns').toBeGreaterThan(0);
    expect(textUnderRotation(recording.entries)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// E6 armour: the tween set is the motion SPEC 5 names
// ---------------------------------------------------------------------------

describe('E6 armour: cards travel on an eased arc and land exactly', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 100 };
  const LIFT = 40;

  it('starts at the shoe and ends exactly on the slot', () => {
    expect(arcTravel(from, to, LIFT, 0)).toEqual(from);
    expect(arcTravel(from, to, LIFT, 1)).toEqual(to);
    // Past the end is still the end, so a capped age cannot overshoot.
    expect(arcTravel(from, to, LIFT, 2)).toEqual(to);
  });

  it('bows off the straight line, which a linear slide does not', () => {
    // The negative control SPEC 5 names in as many words: "on an arc with eased
    // motion, not a linear slide". `slide` is the linear one, and it is used for
    // chips; the two must not agree anywhere but the endpoints.
    let off = 0;
    for (let step = 1; step < 10; step += 1) {
      const progress = step / 10;
      const arc = arcTravel(from, to, LIFT, progress);
      const straight = slide(from, to, progress);
      expect(arc.x, 'the arc and the slide share a horizontal ease').toBe(straight.x);
      expect(arc.y, 'the arc rides above the line').toBeLessThan(straight.y);
      off = Math.max(off, straight.y - arc.y);
    }
    // The apex is the full lift, at the middle of the flight.
    expect(off).toBeCloseTo(LIFT, 6);
    expect(slide(from, to, 0.5).y - arcTravel(from, to, LIFT, 0.5).y).toBeCloseTo(LIFT, 10);
  });

  it('is eased rather than linear along its path', () => {
    // A decelerating curve is past halfway at half the time. A linear tween is
    // exactly at halfway, which is what this rejects.
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(arcTravel(from, to, 0, 0.5).x).toBeGreaterThan(50);
  });

  it('settles rather than overshooting', () => {
    // No value on the curve leaves the segment, so nothing passes its slot and
    // comes back. An overshoot would be a second movement to remove.
    for (let step = 0; step <= 100; step += 1) {
      const value = easeOut(step / 100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('E6 armour: the hole card flips through zero width', () => {
  it('is full width at both ends and exactly zero in the middle', () => {
    expect(flipScale(0)).toBe(1);
    expect(flipScale(1)).toBe(1);
    expect(flipScale(0.5)).toBeCloseTo(0, 12);
  });

  it('shows the back before the halfway point and the face after it', () => {
    expect(flipShowsFace(0)).toBe(false);
    expect(flipShowsFace(0.49)).toBe(false);
    expect(flipShowsFace(0.5)).toBe(true);
    expect(flipShowsFace(1)).toBe(true);
  });

  it('swaps the face exactly where the width is zero, and nowhere else', () => {
    // The two are pinned to each other rather than to a number of their own: a
    // swap at any other progress would show a shrinking face or a growing back,
    // which is the defect the zero-width crossing exists to prevent.
    let swapped = -1;
    let narrowest = Number.POSITIVE_INFINITY;
    let narrowestAt = -1;
    for (let step = 0; step <= 1000; step += 1) {
      const progress = step / 1000;
      const width = flipScale(progress);
      if (width < narrowest) {
        narrowest = width;
        narrowestAt = progress;
      }
      if (swapped < 0 && flipShowsFace(progress)) {
        swapped = progress;
      }
    }
    expect(swapped).toBeCloseTo(narrowestAt, 10);
    expect(narrowest).toBeCloseTo(0, 12);
  });

  it('narrows monotonically to the turn and widens monotonically after it', () => {
    // A card turning, not a rectangle pulsing. Two monotone halves is the whole
    // of that difference and is what a mistaken absolute value would break.
    let previous = flipScale(0);
    for (let step = 1; step <= 500; step += 1) {
      const value = flipScale(step / 1000);
      expect(value, `narrowing at ${String(step)}`).toBeLessThanOrEqual(previous);
      previous = value;
    }
    previous = flipScale(0.5);
    for (let step = 501; step <= 1000; step += 1) {
      const value = flipScale(step / 1000);
      expect(value, `widening at ${String(step)}`).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('E6 armour: the balance counts rather than snapping', () => {
  it('starts where it was, ends exactly where the machine is, and stays whole', () => {
    expect(countUp(1000, 1475, 0)).toBe(1000);
    expect(countUp(1000, 1475, 1)).toBe(1475);
    for (let step = 0; step <= 100; step += 1) {
      const value = countUp(1000, 1475, step / 100);
      expect(Number.isInteger(value), 'a balance is whole chips').toBe(true);
      expect(value).toBeGreaterThanOrEqual(1000);
      expect(value).toBeLessThanOrEqual(1475);
    }
  });

  it('really passes through the middle, which a snap does not', () => {
    // The negative control for "rather than snapping": a readout that jumped
    // would take exactly two values across the whole tween.
    const seen = new Set<number>();
    for (let step = 0; step <= 100; step += 1) {
      seen.add(countUp(1000, 1475, step / 100));
    }
    expect(seen.size).toBeGreaterThan(2);
    expect(seen.has(1000)).toBe(true);
    expect(seen.has(1475)).toBe(true);
  });

  it('counts down as readily as up', () => {
    expect(countUp(1475, 1000, 0)).toBe(1475);
    expect(countUp(1475, 1000, 1)).toBe(1000);
    expect(toward(1475, 1000, 0.5)).toBeLessThan(1475);
  });
});

describe('E6 armour: the win pulse stays under the flash ceiling', () => {
  /** Sample the envelope over one whole pulse, at a fine fixed rate. */
  function envelope(motion: ReturnType<typeof motionOf>, hz: number): { t: number; v: number }[] {
    const span = motion.seconds('winPulse');
    const samples: { t: number; v: number }[] = [];
    for (let index = 0; index <= Math.ceil(span * hz); index += 1) {
      const t = index / hz;
      samples.push({ t, v: winPulse(t, motion) });
    }
    return samples;
  }

  /** The most peaks any rolling one-second window of the samples contains. */
  function worstWindow(samples: readonly { t: number; v: number }[]): number {
    const peaks: number[] = [];
    for (let index = 1; index < samples.length - 1; index += 1) {
      const here = samples[index];
      const before = samples[index - 1];
      const after = samples[index + 1];
      if (here === undefined || before === undefined || after === undefined) {
        continue;
      }
      if (here.v > before.v && here.v >= after.v && here.v > 0) {
        peaks.push(here.t);
      }
    }
    let worst = 0;
    for (const start of peaks) {
      worst = Math.max(worst, peaks.filter((at) => at >= start && at < start + 1).length);
    }
    return worst;
  }

  it('derives its period from the ceiling rather than from a chosen number', () => {
    expect(FLASH_LIMIT_HZ).toBe(3);
    expect(WIN_PULSE_HEADROOM).toBe(2);
    expect(WIN_PULSE_PERIOD).toBe(WIN_PULSE_HEADROOM / (FLASH_LIMIT_HZ * FAST_SPEED_MULTIPLIER));
    expect(PACING.winPulse).toBe(WIN_PULSE_PERIOD * WIN_PULSE_CYCLES);
    // The worst case, stated: at Fast the pulse peaks at exactly half the limit.
    expect(WIN_PULSE_CYCLES / (PACING.winPulse * FAST_SPEED_MULTIPLIER)).toBeCloseTo(
      FLASH_LIMIT_HZ / WIN_PULSE_HEADROOM,
      10,
    );
  });

  it('never peaks more than three times in a rolling second, at either speed', () => {
    for (const speed of SPEEDS) {
      const motion = motionOf(false, speed);
      const worst = worstWindow(envelope(motion, 240));
      expect(worst, `peaks per second at ${speed}`).toBeLessThanOrEqual(FLASH_LIMIT_HZ);
      expect(worst, `the pulse does pulse at ${speed}`).toBeGreaterThan(0);
    }
  });

  it('flags an envelope that breaches the ceiling, so the counter can see one', () => {
    // The can-see control. A window counter that never reported a breach would
    // report a compliant pulse whatever the pulse did.
    const fast = Array.from({ length: 241 }, (_, index) => {
      const t = index / 240;
      return { t, v: (1 - Math.cos(2 * Math.PI * 6 * t)) / 2 };
    });
    expect(worstWindow(fast)).toBeGreaterThan(FLASH_LIMIT_HZ);
  });

  it('rests at both ends and rises in between', () => {
    const motion = motionOf(false);
    expect(winPulse(0, motion)).toBeCloseTo(0, 12);
    expect(winPulse(motion.seconds('winPulse'), motion)).toBe(0);
    expect(winPulse(motion.seconds('winPulse') * 2, motion)).toBe(0);
    const peak = Math.max(
      ...Array.from({ length: 400 }, (_, index) =>
        winPulse((index / 400) * motion.seconds('winPulse'), motion),
      ),
    );
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('is removed entirely under reduced motion, on every frame', () => {
    const motion = motionOf(true);
    for (let step = 0; step <= 200; step += 1) {
      expect(winPulse((step / 200) * PACING.winPulse, motion)).toBe(0);
    }
  });

  it('uses no saturated red, and the measurement can tell one', () => {
    // QUALITY-BAR section 4: saturated red is not used in any flashing or
    // pulsing effect. WCAG's own definition of saturated red is a red fraction
    // at or above 0.8, so the sentence is a measurement rather than a promise.
    for (const set of [SURFACE, HIGH_CONTRAST_SURFACE]) {
      expect(redFraction(winPulseInk(set))).toBeLessThan(SATURATED_RED_FRACTION);
    }
    expect(redFraction('#ff0000')).toBeGreaterThanOrEqual(SATURATED_RED_FRACTION);
    expect(redFraction('#000000')).toBe(0);
  });
});

describe('E6 armour: the easing is the committed curve, not an approximation', () => {
  it('pins both endpoints and stays monotone', () => {
    for (const curve of [EASE.out, EASE.inOut]) {
      expect(ease(curve, 0)).toBe(0);
      expect(ease(curve, 1)).toBe(1);
      let previous = 0;
      for (let step = 1; step <= 200; step += 1) {
        const value = ease(curve, step / 200);
        expect(value, `monotone at ${String(step)}`).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
  });

  it('reads its control points from the token record and not from a copy', () => {
    // The curve the canvas runs and the curve the stylesheet runs are the same
    // four numbers, which is why QUALITY-BAR section 15 commits the points.
    expect(EASE.out).toEqual([0.2, 0, 0, 1]);
    // A curve with these points decelerates: past halfway at half the time.
    expect(ease(EASE.out, 0.25)).toBeGreaterThan(0.25);
    expect(ease(EASE.out, 0.75)).toBeGreaterThan(0.75);
  });
});
