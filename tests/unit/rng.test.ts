/**
 * The seeded stream. STACK section 3, SPEC 4.1.
 *
 * Three properties, and none of them is "the numbers look random":
 *
 *   1. **Determinism.** The same seed gives the same sequence, so a failing
 *      soak reproduces from its seed and a transcript taken at one frame rate
 *      can be compared with one taken at another.
 *   2. **No modulo bias in `nextInt`.** Checked at a bound where the fault is a
 *      factor of two rather than a rounding error, because that is the only
 *      place a 32-bit source makes it measurable at all. See `AWKWARD_BOUND`.
 *   3. **`split()` derives rather than copies.** SPEC 4.1 hangs the shoe's
 *      reproducibility on this: neither side's draws may move the other's, and
 *      a child taken at one point in the parent's life must differ from a child
 *      taken at another. A split that hands back the parent's state satisfies
 *      the type and fails all three, so the check that clears the real one is
 *      run against a modelled clone and required to catch it.
 *
 * The permutation uniformity of `shuffle` is measured in
 * `tests/unit/shoe.test.ts`, where item B2 claims it.
 */

import { describe, expect, it } from 'vitest';

import type { Rng } from '../../src/core/rng';
import { createRng } from '../../src/core/rng';

/** 2^32, the width of the generator's output word. */
const UINT32_SPAN = 2 ** 32;

/**
 * A bound that 2^32 does not divide, chosen so the fault it exposes is large.
 *
 * `3 * 2^30` leaves `2^30` words over at the top of the range, so reducing a
 * word by `%` folds them back onto the bottom third and gives that third twice
 * the weight of the other two. At a bound of 5 the same fault is 2 parts in
 * 10^10 and no feasible sample sees it, which is exactly why the check lives
 * here at this bound rather than being asserted over a five-card shuffle.
 */
const AWKWARD_BOUND = 3 * 2 ** 30;

/** The width of each of `AWKWARD_BOUND`'s three equal parts. */
const THIRD = 2 ** 30;

/** Draws per distribution measurement. */
const SAMPLES = 60_000;

function draws(rng: Rng, count: number): number[] {
  const out: number[] = [];
  for (let n = 0; n < count; n += 1) {
    out.push(rng.nextUint32());
  }
  return out;
}

/** How the draws fall across the three equal parts of `AWKWARD_BOUND`. */
function thirds(next: () => number): number[] {
  const counts = [0, 0, 0];
  for (let n = 0; n < SAMPLES; n += 1) {
    const bucket = Math.min(2, Math.floor(next() / THIRD));
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

/** The furthest a bucket sits from its expected share. */
function worstBucket(counts: readonly number[], expected: number): number {
  let worst = 0;
  for (const count of counts) {
    worst = Math.max(worst, Math.abs(count - expected));
  }
  return worst;
}

/**
 * True when `child` reproduces the parent's own next words.
 *
 * This is the signature of a `split()` that copied state instead of deriving
 * it, and it is the check the clone control below has to fail.
 */
function marchesInLockstep(parent: Rng, child: Rng, samples: number): boolean {
  const fromChild = draws(child, samples);
  const fromParent = draws(parent, samples);
  return fromChild.every((word, index) => word === fromParent[index]);
}

describe('the generator is seeded and reproducible', () => {
  it('gives the same sequence from the same seed', () => {
    expect(draws(createRng(2026), 1000)).toEqual(draws(createRng(2026), 1000));
  });

  it('gives a different sequence from an adjacent seed', () => {
    expect(draws(createRng(2026), 64)).not.toEqual(draws(createRng(2027), 64));
    expect(draws(createRng(0), 64)).not.toEqual(draws(createRng(1), 64));
  });

  it('diverges from the very first word, not from the third', () => {
    const first = createRng(0).nextUint32();
    const second = createRng(1).nextUint32();
    expect(first).not.toBe(second);
  });

  it('produces whole 32-bit words and never a negative one', () => {
    const rng = createRng(5);
    for (const word of draws(rng, 5000)) {
      expect(Number.isInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
      expect(word).toBeLessThan(UINT32_SPAN);
    }
  });

  it('refuses a seed that is not a whole number', () => {
    for (const seed of [1.5, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createRng(seed)).toThrow(RangeError);
    }
  });

  it('accepts a negative seed and a zero seed', () => {
    expect(draws(createRng(-1), 8)).toHaveLength(8);
    expect(draws(createRng(0), 8)).not.toEqual(draws(createRng(-1), 8));
  });

  it('does not fall into a short cycle', () => {
    const seen = new Set(draws(createRng(31337), 20_000));
    // 20,000 draws from 2^32 values collide about 46 times by chance, so
    // anything under 19,900 distinct words is structure rather than luck.
    expect(seen.size).toBeGreaterThan(19_900);
  });
});

describe('nextFloat lands in [0, 1)', () => {
  it('never reaches 1 and never goes below 0', () => {
    const rng = createRng(17);
    for (let n = 0; n < 50_000; n += 1) {
      const value = rng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  /**
   * The grid itself, because neither statistical test above can carry this
   * claim and both of them look as though they do.
   *
   * `nextUint32() / (2^32 - 1)` is the classic wrong divisor and it reaches
   * exactly 1. The 50,000-draw check misses it: the top word turns up with
   * probability 1.16e-5 per run, so that test passes on essentially every run
   * of a generator that can return 1. The tenths miss it too, since a grid
   * stretched by one part in four billion moves no bucket anywhere.
   *
   * So this one pins the spacing rather than sampling the range. Two streams
   * from one seed produce the same words, and multiplying the float back up by
   * 2^32 has to land on the other stream's word exactly. That fixes the grid at
   * `k / 2^32`, which puts the largest value at `1 - 2^-32` and makes 1
   * unreachable by construction instead of by luck. Under the wrong divisor the
   * product stops being that integer for every word except zero, so it fails on
   * the first real draw rather than once in 86,000 runs.
   */
  it('lands on the k / 2^32 grid, so 1 is unreachable by construction', () => {
    const floats = createRng(19);
    const words = createRng(19);
    for (let n = 0; n < 5000; n += 1) {
      expect(floats.nextFloat() * UINT32_SPAN).toBe(words.nextUint32());
    }
  });

  it('fills all ten tenths evenly', () => {
    const rng = createRng(18);
    const counts = new Array<number>(10).fill(0);
    for (let n = 0; n < SAMPLES; n += 1) {
      const bucket = Math.min(9, Math.floor(rng.nextFloat() * 10));
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    const expected = SAMPLES / 10;
    const sigma = Math.sqrt(SAMPLES * 0.1 * 0.9);
    expect(worstBucket(counts, expected)).toBeLessThan(5 * sigma);
  });
});

describe('nextInt is uniform and never reduces by modulo', () => {
  it('refuses a bound that is not a whole number in 1 to 2^32', () => {
    const rng = createRng(3);
    for (const bound of [0, -1, -100, 2.5, Number.NaN, UINT32_SPAN + 1]) {
      expect(() => rng.nextInt(bound)).toThrow(RangeError);
    }
  });

  it('returns 0 for a bound of 1, and stays inside every other bound', () => {
    const rng = createRng(4);
    for (let n = 0; n < 100; n += 1) {
      expect(rng.nextInt(1)).toBe(0);
    }
    for (const bound of [2, 3, 5, 7, 47, 52, 63, 64, 65, 312, 416]) {
      for (let n = 0; n < 500; n += 1) {
        const value = rng.nextInt(bound);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(bound);
      }
    }
  });

  it('reaches every value of a small bound', () => {
    const rng = createRng(6);
    for (const bound of [2, 3, 5, 6, 47, 63]) {
      const seen = new Set<number>();
      for (let n = 0; n < bound * 200; n += 1) {
        seen.add(rng.nextInt(bound));
      }
      expect(seen.size).toBe(bound);
    }
  });

  it('spreads a small bound evenly', () => {
    const rng = createRng(7);
    const bound = 6;
    const counts = new Array<number>(bound).fill(0);
    for (let n = 0; n < SAMPLES; n += 1) {
      const value = rng.nextInt(bound);
      counts[value] = (counts[value] ?? 0) + 1;
    }
    const share = 1 / bound;
    const sigma = Math.sqrt(SAMPLES * share * (1 - share));
    expect(worstBucket(counts, SAMPLES * share)).toBeLessThan(5 * sigma);
  });

  it('spreads a bound 2^32 does not divide evenly', () => {
    const rng = createRng(8);
    const counts = thirds(() => rng.nextInt(AWKWARD_BOUND));
    const sigma = Math.sqrt(SAMPLES * (1 / 3) * (2 / 3));
    expect(worstBucket(counts, SAMPLES / 3)).toBeLessThan(5 * sigma);
  });

  /**
   * The negative control for the test above, and the reason it is written at
   * this bound. Reducing the same word by `%` gives the bottom third of the
   * range twice the weight of the other two, which is 10,000 counts out on an
   * expected 20,000 against a band of 577.
   */
  it('rejects the same measurement when the reduction is a modulo', () => {
    const rng = createRng(8);
    const counts = thirds(() => rng.nextUint32() % AWKWARD_BOUND);
    const sigma = Math.sqrt(SAMPLES * (1 / 3) * (2 / 3));
    expect(worstBucket(counts, SAMPLES / 3)).toBeGreaterThan(5 * sigma);
  });

  it('handles a bound of the whole word range', () => {
    const rng = createRng(9);
    for (let n = 0; n < 2000; n += 1) {
      const value = rng.nextInt(UINT32_SPAN);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(UINT32_SPAN);
    }
  });
});

describe('split derives an independent stream rather than copying one', () => {
  /** Where in the parent's life the clone control is taken. */
  const CLONE_AT = 37;

  it('does not hand back the sequence the parent still has to deal', () => {
    const parent = createRng(2024);
    draws(parent, CLONE_AT);
    const child = parent.split();
    expect(marchesInLockstep(parent, child, 64)).toBe(false);
  });

  /**
   * The negative control. Two streams from one seed, advanced to the same
   * point, hold identical state, which is exactly what a `split()` that copied
   * its parent's four words would hand back. The check above has to catch it.
   */
  it('catches a split that copies state, by the same check', () => {
    const parent = createRng(2024);
    draws(parent, CLONE_AT);
    const clone = createRng(2024);
    draws(clone, CLONE_AT);
    expect(marchesInLockstep(parent, clone, 64)).toBe(true);
  });

  it('leaves the parent sequence exactly where it was', () => {
    const untouched = draws(createRng(11), 64);
    const split = createRng(11);
    split.split();
    split.split();
    split.split();
    expect(draws(split, 64)).toEqual(untouched);
  });

  it('does not shift a child when the parent keeps drawing', () => {
    const first = createRng(11);
    const wanted = draws(first.split(), 32);

    const second = createRng(11);
    const child = second.split();
    draws(second, 500);
    expect(draws(child, 32)).toEqual(wanted);
  });

  it('does not shift the parent when a child keeps drawing', () => {
    const first = createRng(11);
    first.split();
    const wanted = draws(first, 32);

    const second = createRng(11);
    const child = second.split();
    draws(child, 500);
    expect(draws(second, 32)).toEqual(wanted);
  });

  it('gives a different child at a different point in the parent sequence', () => {
    const early = createRng(11);
    const earlyChild = early.split();

    const late = createRng(11);
    draws(late, 100);
    const lateChild = late.split();

    expect(draws(earlyChild, 32)).not.toEqual(draws(lateChild, 32));
  });

  it('gives a different child on every successive split', () => {
    const parent = createRng(11);
    const firstWords = new Set<number>();
    for (let n = 0; n < 64; n += 1) {
      firstWords.add(parent.split().nextUint32());
    }
    expect(firstWords.size).toBe(64);
  });

  it('splits again from a child', () => {
    const parent = createRng(11);
    const child = parent.split();
    const grandchild = child.split();
    expect(marchesInLockstep(child, grandchild, 64)).toBe(false);
    expect(draws(createRng(11).split(), 32)).not.toEqual(draws(grandchild, 32));
  });

  it('gives a child that is uniform in its own right', () => {
    const child = createRng(12).split().split();
    const bound = 6;
    const counts = new Array<number>(bound).fill(0);
    for (let n = 0; n < SAMPLES; n += 1) {
      const value = child.nextInt(bound);
      counts[value] = (counts[value] ?? 0) + 1;
    }
    const share = 1 / bound;
    const sigma = Math.sqrt(SAMPLES * share * (1 - share));
    expect(worstBucket(counts, SAMPLES * share)).toBeLessThan(5 * sigma);
  });
});
