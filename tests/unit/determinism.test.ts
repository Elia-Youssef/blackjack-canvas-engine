/**
 * Item `B16`, Critical, 10 points, at `BJ-12`, tracing SPEC 4.1: "All
 * randomness comes from the seeded rng module: no core module calls
 * Math.random, the shoe draws from its own split stream, and a seeded session
 * reproduces an identical round transcript across runs and across deck
 * counts."
 *
 * Three clauses, three devices.
 *
 * 1. **The transcript.** A seeded session is played twice from two fresh
 *    tables and the whole readout is serialised at every step: the phase and
 *    its payload, every card, the timers, the shoe's counters and the wallet's
 *    four-term identity. The two transcripts must be equal element for
 *    element, at 6 decks and again at 8, across enough rounds that several
 *    reshuffles sit inside the compared window, so SPEC 4.1's cut card and
 *    reshuffle are on the reproduced path and not beside it. "Across deck
 *    counts" is read as each count reproducing its own transcript: 6 and 8 are
 *    not each other's, and the run asserts they differ in the cards they
 *    dealt, not merely in the deck label the readout carries.
 *
 * 2. **The split stream, proven load-bearing.** SPEC 4.1 hangs the whole
 *    guarantee on the shoe taking its own stream through `split()`, so a
 *    consumer added beside it cannot shift the deal. The proof drains a shoe
 *    through three reshuffle cycles with a sibling consumer and the parent
 *    session stream both drawing in between, and requires the dealt sequence
 *    to be identical to a run with no consumer at all. The control that makes
 *    the comparison falsifiable is a source stream advanced by a single word
 *    before the shoe is built, which must change the sequence.
 *
 * 3. **The `Math.random` clause.** The ban is lint-enforced as item `M3`, in
 *    `tools/eslint-plugin-core-boundary`, proven there by mutation additions
 *    that drop a violating module into the real `src/core/`. B16's evidence
 *    file carries the clause itself as well: every module under `src/core/` is
 *    scanned, comments stripped, and the pattern is required to match planted
 *    samples first, because a scan whose pattern has a typo in it finds
 *    nothing and reports clean forever.
 *
 * The driving policy is a pure function of the readout, so the transcript is a
 * function of the table seed alone. It takes insurance every third round, so
 * SPEC 4.7's stake and settlement are inside the reproduced window too.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { handValue } from '../../src/core/hand';
import { createRng } from '../../src/core/rng';
import type { DeckCount, Shoe } from '../../src/core/shoe';
import { createShoe } from '../../src/core/shoe';
import type { Table, TableReadout } from '../../src/core/table';
import { createTable } from '../../src/core/table';

// ---------------------------------------------------------------------------
// Playing a seeded session, deterministically
// ---------------------------------------------------------------------------

/** Rounds per transcript. Enough to cross several reshuffles; see below. */
const SESSION_ROUNDS = 250;

/** The pinned session seed the reproduction claims are made on. */
const SESSION_SEED = 20260812;

/** The wager every round carries. Small, so 250 rounds cannot bust out. */
const SESSION_CHIP = 10;

/** A frame long enough to pay for any single timed step. */
const TICK = 0.25;

/** A stalled session must fail loudly, not hang the suite. */
const OP_LIMIT = SESSION_ROUNDS * 100;

function mustOk(table: Table, intent: Parameters<Table['apply']>[0]): void {
  const result = table.apply(intent);
  if (!result.ok) {
    throw new Error(`${intent.kind} was refused by ${result.layer} as ${result.reason}`);
  }
}

/**
 * One step of the session, decided from the readout alone. The same policy
 * `strategy-coach.test.ts` drives its seeded sessions with: split up to
 * twice, double on 10 and 11, hit below 17, and take SPEC 4.7's offer every
 * third round so the side wager is inside the reproduced window.
 */
function stepOnce(table: Table, state: TableReadout): void {
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
      // Unreachable at a flat 10 wager from 1,000 chips over 250 rounds on
      // this seed. A policy change that makes it reachable must be a loud
      // failure, not a silently shorter transcript.
      throw new Error('the session busted out, so the transcript is not the claimed session');
    default:
      table.update(TICK);
  }
}

/** One session's evidence: the serialised steps, and the cards they dealt. */
interface Transcript {
  /** The whole readout at every step, serialised. */
  readonly steps: readonly string[];
  /** Only the cards on the felt at every step, for the cross-deck claims. */
  readonly felt: readonly string[];
  /** Reshuffles observed inside the window, via the dealt counter resetting. */
  readonly reshuffles: number;
}

function feltOf(state: TableReadout): string {
  const cards: string[] = [];
  for (const hand of state.hands) {
    for (const card of hand.cards) {
      cards.push(`${card.rank}:${card.suit}`);
    }
  }
  for (const card of state.dealerVisible) {
    cards.push(`${card.rank}:${card.suit}`);
  }
  return cards.join(',');
}

/** Play one seeded session and keep everything it published. */
function transcript(seed: number, decks: DeckCount): Transcript {
  const table = createTable({ seed, rules: { decks } });
  const steps: string[] = [JSON.stringify(table.readout())];
  const felt: string[] = [];
  let reshuffles = 0;
  let dealtBefore = 0;
  let ops = 0;

  while (table.readout().rounds < SESSION_ROUNDS) {
    ops += 1;
    if (ops > OP_LIMIT) {
      throw new Error(`the session did not finish inside ${String(OP_LIMIT)} steps`);
    }
    const state = table.readout();
    stepOnce(table, state);
    const after = table.readout();
    if (after.shoe.dealt < dealtBefore) {
      reshuffles += 1;
    }
    dealtBefore = after.shoe.dealt;
    steps.push(JSON.stringify(after));
    felt.push(feltOf(after));
  }

  return { steps, felt, reshuffles };
}

describe('B16: a seeded session reproduces an identical round transcript', () => {
  const six = transcript(SESSION_SEED, 6);
  const sixAgain = transcript(SESSION_SEED, 6);
  const eight = transcript(SESSION_SEED, 8);
  const eightAgain = transcript(SESSION_SEED, 8);

  it('replays identically across runs on 6 decks', () => {
    expect(six.steps.length).toBe(sixAgain.steps.length);
    expect(six.steps).toEqual(sixAgain.steps);
  });

  it('replays identically across runs on 8 decks', () => {
    expect(eight.steps.length).toBe(eightAgain.steps.length);
    expect(eight.steps).toEqual(eightAgain.steps);
  });

  it('compared a session long enough to mean something, reshuffles included', () => {
    // SPEC 4.1 puts the cut card 25 to 40 percent from the bottom, so 250
    // rounds cross the boundary several times and the reshuffle is inside the
    // reproduced window, not beside it.
    expect(six.steps.length).toBeGreaterThan(4000);
    expect(six.reshuffles).toBeGreaterThan(3);
    expect(eight.reshuffles).toBeGreaterThan(2);
  });

  it('gives each deck count its own transcript: 6 and 8 are not each other\'s', () => {
    // The felt trail compares the cards that were actually dealt, so this
    // cannot pass on the deck label in the readout alone: an 8-deck shoe that
    // quietly dealt the 6-deck sequence would fail here.
    expect(eight.felt).not.toEqual(six.felt);
    expect(eight.steps).not.toEqual(six.steps);
  });

  it('produces a different transcript from an adjacent seed, so equality bites', () => {
    const other = transcript(SESSION_SEED + 1, 6);
    expect(other.felt).not.toEqual(six.felt);
  });
});

// ---------------------------------------------------------------------------
// The shoe's split stream is load-bearing
// ---------------------------------------------------------------------------

/** Reshuffle cycles the consumer proof drains through. */
const CYCLES = 3;

/**
 * The dealt sequence across whole reshuffle cycles, with an optional
 * interloper invoked before every draw and at every round boundary. The
 * boundary is driven as SPEC 4.1 has it: rounds end, and the shoe reshuffles
 * at the boundary after the cut card surfaces.
 */
function dealtSequence(shoe: Shoe, interleave?: () => void): readonly string[] {
  const keys: string[] = [];
  for (let cycle = 0; cycle < CYCLES; cycle += 1) {
    while (!shoe.cutCardReached()) {
      interleave?.();
      const card = shoe.draw();
      keys.push(`${card.rank}:${card.suit}`);
    }
    interleave?.();
    if (!shoe.endRound()) {
      throw new Error('the boundary after the cut card must reshuffle');
    }
  }
  return keys;
}

describe('B16: the shoe draws from its own split stream', () => {
  const undisturbed = dealtSequence(createShoe(6, createRng(SESSION_SEED)));

  it('deals the same sequence with a sibling consumer and the parent both drawing', () => {
    // The table hands its session stream to `createShoe`, which splits its
    // own child; a consumer added later takes another child of the same
    // parent. Here both the sibling and the parent draw between every one of
    // the shoe's draws, across three reshuffles, and the deal must not move.
    const session = createRng(SESSION_SEED);
    const shoe = createShoe(6, session);
    const sibling = session.split();
    let turn = 0;
    const disturbed = dealtSequence(shoe, () => {
      turn += 1;
      if (turn % 3 === 0) {
        sibling.nextUint32();
      }
      if (turn % 7 === 0) {
        session.nextUint32();
      }
    });
    expect(turn).toBeGreaterThan(undisturbed.length);
    expect(disturbed).toEqual(undisturbed);
  });

  it('detects a shifted source, so the sequence comparison can actually fail', () => {
    // The control: one word drawn from the source before the shoe is built
    // must change the deal, because `split()` derives the child from the
    // parent's state. A comparison that passed this too would be comparing
    // nothing.
    const advanced = createRng(SESSION_SEED);
    advanced.nextUint32();
    expect(dealtSequence(createShoe(6, advanced))).not.toEqual(undisturbed);
  });
});

// ---------------------------------------------------------------------------
// No core module calls Math.random
// ---------------------------------------------------------------------------

describe('B16: no core module calls Math.random', () => {
  /**
   * The clause is lint-enforced as item `M3`: the `core-boundary` rule
   * rejects the call, `npm run lint` is a merge gate, and the mutation
   * harness proves it by dropping a violating module into the real
   * `src/core/`. This scan carries the clause in B16's own evidence file,
   * with the strip and the planted samples `payout-integrality.test.ts` uses,
   * because comments legitimately name the banned call while stating the ban.
   */
  it('scans every src/core module, with a pattern that is proven to match', () => {
    const banned = /Math\s*\.\s*random/;
    // The pattern must find planted samples first: a typo in it, `randon`
    // say, would find nothing anywhere and report clean forever.
    expect(banned.test('return Math.random();')).toBe(true);
    expect(banned.test('Math\n  . random()')).toBe(true);
    expect(banned.test('the seeded stream')).toBe(false);

    const coreDir = fileURLToPath(new URL('../../src/core', import.meta.url));
    const modules = readdirSync(coreDir).filter((name) => name.endsWith('.ts'));
    // Thirteen modules as of BJ-12. A shrunken listing would be a scan
    // quietly looking at the wrong directory.
    expect(modules.length).toBeGreaterThanOrEqual(13);

    for (const name of modules) {
      const source = readFileSync(
        fileURLToPath(new URL(`../../src/core/${name}`, import.meta.url)),
        'utf8',
      );
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      // The strip did not eat the code with the comments.
      expect(code.length).toBeGreaterThan(0);
      expect(code).toContain('export');
      expect(banned.test(code), `${name} reaches Math.random`).toBe(false);
    }
  });
});
