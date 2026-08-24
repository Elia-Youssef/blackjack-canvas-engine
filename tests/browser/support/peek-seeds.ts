/**
 * Which side of SPEC 4.4's peek a session seed lands on. Support for item `E6`.
 *
 *   "The dealer's peek is identical in motion and pacing whether or not it finds
 *    a natural: no tell, no timing difference, no animation variation."
 *
 * Capturing that clause needs two rounds that differ in exactly one card: a
 * dealer Ace showing, and a hole card that is a ten in one round and is not in
 * the other. `boot` takes a **seed** and not a shoe, deliberately, because the
 * composition root's own header gives three reasons for the seed and none of
 * them would justify handing the shipped page a scripted deck. So the two rounds
 * are found rather than staged: this module drives the real machine headlessly
 * over the seed space and reports the first seed on each arm.
 *
 * It imports `core/` alone, no DOM and no composition root, so the same search
 * runs in Node inside a spec and in the browser inside the demonstration hook,
 * and both get the same two numbers. Nothing here reads a clock or a random
 * source: the shoe is `BJ-3`'s seeded stream, so the answer is stable across
 * runs and across engines.
 */

import { createTable } from '../../../src/core/table';
import type { PhaseKind } from '../../../src/core/types';

/** SPEC 4.4 offers insurance against an Ace, which is the up card the peek needs. */
const PEEK_UP_CARD = 'A';

/** The smallest legal wager. The search settles nothing and tracks no money. */
const SEARCH_WAGER = 10;

/** How far the search looks before failing loudly rather than returning less. */
const SEED_LIMIT = 5000;

/** A step large enough to walk a deal quickly; QUALITY-BAR 7's clamp bounds it. */
const SEARCH_STEP = 0.25;

/** No opening deal needs more frames than this to reach a decision point. */
const SEARCH_FRAMES = 500;

/** Which arm of SPEC 4.4's peek a seed lands on. */
export type PeekBranch = 'natural' | 'none';

/** A seed, and what its peek found. */
export interface PeekSeed {
  readonly branch: PeekBranch;
  readonly seed: number;
}

/**
 * What one seed's opening deal does, or `null` when it shows no Ace.
 *
 * `settling` immediately after the insurance offer is answered is the peek
 * having found a natural: SPEC 10 routes that arm straight past the player's
 * turn. Any other screen is the arm that found nothing. The classification is a
 * reading of the machine's own phases rather than of the hole card, which the
 * readout deliberately does not publish while it is down.
 */
export function classify(seed: number): PeekBranch | null {
  const table = createTable({ seed });
  table.apply({ kind: 'start' });
  table.apply({ kind: 'tapChip', chip: SEARCH_WAGER });
  table.apply({ kind: 'deal' });

  for (let frame = 0; frame < SEARCH_FRAMES; frame += 1) {
    const snapshot = table.readout();
    const kind: PhaseKind = snapshot.phase.kind;
    if (kind === 'dealing' || kind === 'peek') {
      table.update(SEARCH_STEP);
      continue;
    }
    if (snapshot.dealerVisible[0]?.rank !== PEEK_UP_CARD) {
      return null;
    }
    if (kind === 'insurance') {
      table.apply({ kind: 'declineInsurance' });
      continue;
    }
    return kind === 'settling' ? 'natural' : 'none';
  }
  return null;
}

let found: readonly PeekSeed[] | null = null;

/** The first seed on each arm of the peek, searched once and remembered. */
export function peekBranches(): readonly PeekSeed[] {
  if (found !== null) {
    return found;
  }
  const seeds = new Map<PeekBranch, number>();
  for (let seed = 1; seed <= SEED_LIMIT && seeds.size < 2; seed += 1) {
    const branch = classify(seed);
    if (branch !== null && !seeds.has(branch)) {
      seeds.set(branch, seed);
    }
  }
  if (seeds.size < 2) {
    throw new Error('no seed pair reaches both arms of the peek within the search limit');
  }
  found = Object.freeze(
    [...seeds.entries()].map(([branch, seed]) => Object.freeze({ branch, seed })),
  );
  return found;
}

/** The seed for one arm of the peek. */
export function peekSeed(branch: PeekBranch): number {
  const entry = peekBranches().find((candidate) => candidate.branch === branch);
  if (entry === undefined) {
    throw new Error(`no seed found for the ${branch} branch`);
  }
  return entry.seed;
}
