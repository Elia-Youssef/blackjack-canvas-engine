/**
 * Item `M5`, Critical, 11 points, at `BJ-12`, tracing QUALITY-BAR section 7:
 * "Presentation timing is frame-rate independent at 15, 30, 60, 144, 240 and
 * 1000 fps and on an unstable clock including zero and negative deltas, with a
 * negative control that the check detects as a failure."
 *
 * **The check compares wall-clock times, not only sequences, and that is the
 * whole lesson.** An earlier build shipped a frame-independence check that
 * compared a fixed sequence of states and could not have failed: a machine
 * that stepped once per frame regardless of the delta produces the same
 * sequence at every rate, just at wildly different speeds. So each timed step
 * here is recorded with the wall-clock time it fired at, and the times are
 * held to a derived schedule:
 *
 *   - **Lower bound.** A step never fires before its SPEC 5 duration has been
 *     paid: `wall >= ideal`, where `ideal` is the running sum of the durations
 *     of every step fired so far. The accumulator carries its remainder across
 *     timed transitions, so quantisation does not compound within a chain.
 *   - **Upper bound.** A step fires at most one frame late per chain:
 *     `wall <= ideal + (drops + 1) * dt`, where `drops` counts the entries
 *     into untimed phases so far. Each entry discards under one frame of
 *     remainder, per `update`'s own contract in `table.ts`: "The remainder
 *     carries across a timed transition and is dropped at an untimed one."
 *     The trailing `+ 1` is the current chain's own quantisation.
 *
 * A per-frame stepper violates the lower bound at every configured rate; a
 * loop that consumes the delta at half or double speed violates one bound or
 * the other within the first chain. All three are run through the same
 * checking function as the real machine and must be flagged, which is the
 * negative control the criterion names.
 *
 * **The sequence half still holds and is still asserted**: the serialised
 * state at every transition, the cards dealt, the wallet's four-term identity
 * and every round result must be identical across all six rates and the
 * unstable clock. The unstable clock is excluded from the schedule half
 * alone, because wall time under a clock that runs backwards is not
 * well-defined; what it must prove is that zeros and negatives change no
 * state and no outcome, which the sequence comparison and the direct clause
 * tests below carry.
 *
 * **The intents are applied at frame boundaries and consume no wall time**,
 * so the schedule is the machine's own pacing and not the driver's: every
 * decision the policy owes is applied before the frame's update, in one
 * boundary, identically at every rate.
 *
 * `clampDelta` is driven directly, clause by QUALITY-BAR clause, because `M5`
 * names the unstable clock and the clamp is where its deltas are judged; the
 * resume rule lives in `update` and is driven at a non-zero accumulator,
 * where the weaker drop-the-delta reading fails. `tests/unit/
 * phase-legality.test.ts` pins the same clauses as part of `C2`'s timer
 * coverage; `M5`'s evidence file carries them itself rather than citing
 * another item's.
 */

import { describe, expect, it } from 'vitest';

import { handValue } from '../../src/core/hand';
import type { Table, TableReadout } from '../../src/core/table';
import {
  MAX_STEP,
  PEEK_PAUSE,
  PHASE_KINDS,
  RESUME_GAP,
  TIMINGS,
  clampDelta,
  createTable,
} from '../../src/core/table';
import type { PhaseKind } from '../../src/core/types';

// ---------------------------------------------------------------------------
// QUALITY-BAR section 7, transcribed
// ---------------------------------------------------------------------------

/** QB 7: the largest delta a loop may believe, and the resume threshold. */
const QB_CLAMP = 0.25;
const QB_RESUME = 5;

/** The six configured rates of the criterion, in frames per second. */
const RATES = [15, 30, 60, 144, 240, 1000] as const;

/** Rounds per transcribed session. Enough for splits and a side wager. */
const SESSION_ROUNDS = 40;

/** The pinned seed every run transcribes. */
const SESSION_SEED = 20260824;

/** The flat wager of the transcribed session. */
const SESSION_CHIP = 10;

/** No session at any configured rate needs more frames than this. */
const FRAME_LIMIT = 400_000;

/** Comparison slack for sums of SPEC 5 durations, well under any frame. */
const EPSILON = 1e-6;

/**
 * The five timed phases and what one step of each costs, from the machine's
 * own SPEC 5 record. That these constants match SPEC 5's numbers is
 * `phase-legality.test.ts`'s assertion; what M5 needs is the machine held to
 * its own record at every frame rate.
 */
const STEP_DURATION: Partial<Record<PhaseKind, number>> = {
  dealing: TIMINGS.dealInterval,
  peek: PEEK_PAUSE,
  reveal: TIMINGS.revealPause,
  dealerTurn: TIMINGS.dealerDrawInterval,
  settling: TIMINGS.settlePause,
};

/** The six phases that wait for the player and hold no timer. SPEC 10. */
const UNTIMED: readonly PhaseKind[] = [
  'start',
  'betting',
  'insurance',
  'playerTurn',
  'roundResult',
  'bustOut',
];

// ---------------------------------------------------------------------------
// Driving one session at one clock
// ---------------------------------------------------------------------------

function mustOk(table: Table, intent: Parameters<Table['apply']>[0]): void {
  const result = table.apply(intent);
  if (!result.ok) {
    throw new Error(`${intent.kind} was refused by ${result.layer} as ${result.reason}`);
  }
}

/**
 * The state a transcript compares, serialised without the two fields that are
 * legitimately clock-shaped: the accumulator, which quantises differently per
 * rate, and the intent queue, which this driver never uses. Everything else,
 * the cards, the phases and their payloads, the shoe's counters and the
 * wallet's four-term identity, must be identical across every clock.
 */
function still(state: TableReadout): string {
  return JSON.stringify({
    phase: state.phase,
    table: state.table,
    rules: state.rules,
    hands: state.hands,
    dealerVisible: state.dealerVisible,
    dealerConcealed: state.dealerConcealed,
    rounds: state.rounds,
    splits: state.splits,
    shoe: state.shoe,
    wallet: state.wallet,
  });
}

/** One decision, pure in the readout, identical at every rate. */
function decideOnce(table: Table, state: TableReadout): void {
  switch (state.phase.kind) {
    case 'start':
      mustOk(table, { kind: 'start' });
      return;
    case 'betting':
      if (state.wallet.wager === 0) {
        mustOk(table, { kind: 'tapChip', chip: SESSION_CHIP });
        return;
      }
      mustOk(table, { kind: 'deal' });
      return;
    case 'insurance':
      if (state.rounds % 3 === 0 && table.apply({ kind: 'takeInsurance' }).ok) {
        return;
      }
      mustOk(table, { kind: 'declineInsurance' });
      return;
    case 'playerTurn': {
      const hand = state.hands[state.phase.activeHand];
      if (hand === undefined) {
        throw new Error(`no hand at ${String(state.phase.activeHand)}`);
      }
      if (state.splits < 2 && table.apply({ kind: 'split' }).ok) {
        return;
      }
      const total = handValue(hand.cards).total;
      if ((total === 10 || total === 11) && table.apply({ kind: 'double' }).ok) {
        return;
      }
      if (total < 17) {
        mustOk(table, { kind: 'hit' });
        return;
      }
      mustOk(table, { kind: 'stand' });
      return;
    }
    case 'roundResult':
      mustOk(table, { kind: 'nextHand' });
      return;
    case 'bustOut':
      throw new Error('the session busted out, so the transcript is not the claimed session');
    default:
      throw new Error(`decideOnce was asked at the timed phase ${state.phase.kind}`);
  }
}

/** One timed step the machine took: when it fired, and what it owed. */
interface TimedStep {
  /** Wall-clock seconds when the step fired, summed from the raw deltas. */
  readonly wall: number;
  /** The SPEC 5 duration the step's phase owed. */
  readonly duration: number;
  /** Untimed-phase entries before this step: the accumulator drops so far. */
  readonly dropsBefore: number;
}

/** Everything one run produced. */
interface Run {
  /** The serialised state at every transition, applies and steps together. */
  readonly sequence: readonly string[];
  /** The timed steps alone, for the schedule check. */
  readonly steps: readonly TimedStep[];
  readonly splits: number;
  readonly insuranceDecisions: number;
}

/**
 * Transcribe the pinned session under one clock.
 *
 * Every frame: first every decision the current untimed phase owes, applied
 * at the boundary and consuming no time, then exactly one `update(dt)`. With
 * every configured frame interval under the shortest SPEC 5 duration, one
 * update fires at most one step, so each state change during `update` is one
 * timed step and carries its phase's own duration.
 */
function runSession(deltaAt: (frame: number) => number): Run {
  const table = createTable({ seed: SESSION_SEED });
  const sequence: string[] = [];
  const steps: TimedStep[] = [];
  let wall = 0;
  let drops = 0;
  let splits = 0;
  let insuranceDecisions = 0;

  for (let frame = 0; table.readout().rounds < SESSION_ROUNDS; frame += 1) {
    if (frame > FRAME_LIMIT) {
      throw new Error(`the session did not finish inside ${String(FRAME_LIMIT)} frames`);
    }

    let state = table.readout();
    let decisions = 0;
    while (UNTIMED.includes(state.phase.kind) && state.rounds < SESSION_ROUNDS) {
      decisions += 1;
      if (decisions > 40) {
        throw new Error(`the policy stalled at ${state.phase.kind}`);
      }
      if (state.phase.kind === 'insurance') {
        insuranceDecisions += 1;
      }
      const splitsBefore = state.splits;
      decideOnce(table, state);
      state = table.readout();
      if (state.splits > splitsBefore) {
        splits += 1;
      }
      sequence.push(still(state));
    }
    if (state.rounds >= SESSION_ROUNDS) {
      break;
    }

    const before = state;
    const dt = deltaAt(frame);
    wall += dt;
    table.update(dt);
    const after = table.readout();
    // Every change an update can make renews the phase object or deals a
    // card, so this cheap detector misses no step.
    if (after.phase !== before.phase || after.shoe.dealt !== before.shoe.dealt) {
      const duration = STEP_DURATION[before.phase.kind];
      if (duration === undefined) {
        throw new Error(`a step fired out of the untimed phase ${before.phase.kind}`);
      }
      sequence.push(still(after));
      steps.push({ wall, duration, dropsBefore: drops });
      if (UNTIMED.includes(after.phase.kind)) {
        drops += 1;
      }
    }
  }

  return { sequence, steps, splits, insuranceDecisions };
}

/**
 * How many steps break the derived schedule. Zero for the real machine at
 * every configured rate; positive for every wrong form below. The bound is
 * the header's: paid-in-full below, one frame per chain above.
 */
function scheduleViolations(steps: readonly TimedStep[], dt: number): number {
  let ideal = 0;
  let violations = 0;
  for (const step of steps) {
    ideal += step.duration;
    const latest = ideal + (step.dropsBefore + 1) * dt;
    if (step.wall < ideal - EPSILON || step.wall > latest + EPSILON) {
      violations += 1;
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// The six rates, and the unstable clock
// ---------------------------------------------------------------------------

/**
 * The unstable clock the criterion names: ordinary frames of several lengths
 * with zeros and negatives mixed in. Two delta classes are driven by their
 * own direct tests below rather than here, deliberately. A delta past the
 * resume gap drops the accumulator, which is allowed to move a transition
 * later than the schedule bound built for continuous clocks. And a delta
 * large enough that one update pays two steps takes the machine through a
 * state between two of this sampler's observations, so the sequence
 * comparison would report a shorter transcript for a machine that behaved
 * identically; every delta here therefore stays under 0.21, which keeps the
 * carried remainder under one deal interval, and the multi-step drain has
 * its own assertion where the intermediate state is checked directly.
 */
const UNSTABLE_DELTAS: readonly number[] = [
  0.016, 0, 0.001, -0.05, 0.007, 0.2, -1, 0.033, 0.21, 0, 0.004, 0.12,
];

describe('M5: the same seeded session at 15, 30, 60, 144, 240 and 1000 fps', () => {
  const runs = RATES.map((rate) => ({ rate, run: runSession(() => 1 / rate) }));
  const reference = runs[0];
  if (reference === undefined) {
    throw new Error('the configured rates are missing');
  }

  it('transcribes the identical sequence of states and outcomes at every rate', () => {
    for (const { rate, run } of runs) {
      expect(run.sequence.length, `${String(rate)} fps`).toBe(reference.run.sequence.length);
      expect(run.sequence, `${String(rate)} fps`).toEqual(reference.run.sequence);
    }
  });

  it('holds every step to the derived wall-clock schedule at every rate', () => {
    for (const { rate, run } of runs) {
      expect(run.steps.length, `${String(rate)} fps`).toBe(reference.run.steps.length);
      expect(scheduleViolations(run.steps, 1 / rate), `${String(rate)} fps`).toBe(0);
    }
  });

  it('transcribed a session with something in it', () => {
    // A session with no split and no side wager would compare pacing over a
    // fraction of the machine. The floors are on the pinned seed.
    expect(reference.run.steps.length).toBeGreaterThan(300);
    expect(reference.run.splits).toBeGreaterThan(0);
    expect(reference.run.insuranceDecisions).toBeGreaterThan(0);
  });

  it('transcribes the identical sequence on the unstable clock', () => {
    const unstable = runSession((frame) => {
      const delta = UNSTABLE_DELTAS[frame % UNSTABLE_DELTAS.length];
      if (delta === undefined) {
        throw new Error('the unstable clock is empty');
      }
      return delta;
    });
    expect(unstable.sequence.length).toBe(reference.run.sequence.length);
    expect(unstable.sequence).toEqual(reference.run.sequence);
  });

  /**
   * The negative control the criterion names, three ways, all through the
   * same checking function the real runs pass. The first is the prior
   * build's actual defect: a machine that steps once per frame produces the
   * reference sequence exactly, and only the wall-clock check can see it.
   */
  it('detects a per-frame stepper as a failure at every rate', () => {
    for (const { rate, run } of runs) {
      const dt = 1 / rate;
      const perFrame = run.steps.map((step, index) => ({
        wall: (index + 1) * dt,
        duration: step.duration,
        dropsBefore: step.dropsBefore,
      }));
      expect(scheduleViolations(perFrame, dt), `${String(rate)} fps`).toBeGreaterThan(0);
    }
  });

  it('detects a clock consumed at double speed, and one at half speed', () => {
    for (const { rate, run } of runs) {
      const dt = 1 / rate;
      const rushed = run.steps.map((step) => ({ ...step, wall: step.wall / 2 }));
      const dragged = run.steps.map((step) => ({ ...step, wall: step.wall * 2 }));
      expect(scheduleViolations(rushed, dt), `${String(rate)} fps rushed`).toBeGreaterThan(0);
      expect(scheduleViolations(dragged, dt), `${String(rate)} fps dragged`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// The clamp and the resume, driven directly
// ---------------------------------------------------------------------------

/** A fresh machine at the top of the opening deal: four steps owed, zero banked. */
function atDealing(): Table {
  const table = createTable({ seed: 3 });
  mustOk(table, { kind: 'start' });
  mustOk(table, { kind: 'tapChip', chip: SESSION_CHIP });
  mustOk(table, { kind: 'deal' });
  return table;
}

/** How many cards of SPEC 4.3's opening deal are still owed. */
function owedDeals(table: Table): number {
  const phase = table.readout().phase;
  if (phase.kind !== 'dealing') {
    throw new Error(`the machine is at ${phase.kind}, not dealing`);
  }
  return phase.queue.length;
}

describe('M5: the delta clamp, clause by QUALITY-BAR clause', () => {
  it('believes an ordinary frame, clamps a long one, and drops a resume', () => {
    expect(MAX_STEP).toBe(QB_CLAMP);
    expect(RESUME_GAP).toBe(QB_RESUME);
    expect(clampDelta(1 / 1000)).toBe(1 / 1000);
    expect(clampDelta(1 / 15)).toBe(1 / 15);
    expect(clampDelta(QB_CLAMP)).toBe(QB_CLAMP);
    expect(clampDelta(0.3)).toBe(QB_CLAMP);
    expect(clampDelta(1)).toBe(QB_CLAMP);
    expect(clampDelta(QB_RESUME)).toBe(QB_CLAMP);
    expect(clampDelta(QB_RESUME + 0.001)).toBe(0);
    expect(clampDelta(3600)).toBe(0);
  });

  it('treats zero, negative and non-finite deltas as zero, and as a positive zero', () => {
    expect(clampDelta(0)).toBe(0);
    expect(clampDelta(-0.016)).toBe(0);
    expect(clampDelta(-1)).toBe(0);
    expect(clampDelta(Number.NaN)).toBe(0);
    expect(clampDelta(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampDelta(Number.NEGATIVE_INFINITY)).toBe(0);
    // Positive zero, stated by the module: the accumulator is compared with
    // the runner's identity assertion and `Object.is(-0, 0)` is false.
    expect(Object.is(clampDelta(-0), 0)).toBe(true);
    expect(Object.is(clampDelta(-3), 0)).toBe(true);
  });

  it('consumes one clamped step of a long frame, not the whole gap', () => {
    const table = atDealing();
    expect(owedDeals(table)).toBe(4);
    table.update(3);
    // Unclamped, three seconds pays SPEC 5's deal interval thirteen times
    // over and the whole deal lands in one frame. Clamped, it pays for one
    // card and banks the remainder.
    expect(owedDeals(table)).toBe(3);
    expect(table.readout().elapsed).toBeCloseTo(QB_CLAMP - TIMINGS.dealInterval, 10);
  });

  it('pays two steps out of one frame when the accumulator covers both', () => {
    const table = atDealing();
    table.update(0.21);
    expect(owedDeals(table)).toBe(4);
    table.update(QB_CLAMP);
    // 0.21 banked plus 0.25 believed is 0.46, which pays SPEC 5's 0.22
    // interval twice with 0.02 left on the accumulator. A drain that took
    // one step per frame would leave three cards owed here.
    expect(owedDeals(table)).toBe(2);
    expect(table.readout().elapsed).toBeCloseTo(0.21 + QB_CLAMP - 2 * TIMINGS.dealInterval, 10);
  });

  it('advances nothing on zero and negative deltas mid-chain', () => {
    const table = atDealing();
    table.update(0.1);
    expect(table.readout().elapsed).toBe(0.1);
    table.update(0);
    table.update(-0.5);
    table.update(Number.NaN);
    expect(table.readout().elapsed).toBe(0.1);
    expect(owedDeals(table)).toBe(4);
  });

  it('empties the accumulator on a resume rather than only dropping the delta', () => {
    const table = atDealing();
    table.update(0.21);
    expect(table.readout().elapsed).toBe(0.21);
    table.update(QB_RESUME + 1);
    // QUALITY-BAR section 7 in its own words: the accumulator is dropped,
    // not merely the delta, and nothing is consumed. Driven at a non-zero
    // accumulator because at zero the weaker reading passes.
    expect(table.readout().elapsed).toBe(0);
    expect(owedDeals(table)).toBe(4);
    table.update(0.016);
    expect(table.readout().elapsed).toBe(0.016);
    expect(owedDeals(table)).toBe(4);
  });

  it('agrees with SPEC 10 on which phases are timed, so the schedule covers them all', () => {
    const timed = Object.keys(STEP_DURATION);
    expect(timed).toHaveLength(5);
    expect([...timed, ...UNTIMED].sort()).toEqual([...PHASE_KINDS].sort());
  });
});
