/**
 * The seeded pseudo-random number generator. STACK section 3, SPEC 4.1.
 *
 * Every random decision in the game comes from here. Nothing in `core/` calls
 * `Math.random()`, the BJ-0 lint boundary refuses it, and this module is the
 * reason that ban costs nothing: a seeded session replays exactly, a soak that
 * fails reproduces from its seed alone, and a transcript taken at 30 frames per
 * second can be compared with one taken at 144.
 *
 * It lives under `core/` rather than in `packages/engine` because extraction is
 * ENG-1's job and the engine package is deliberately empty until then. STACK
 * section 5 settles that order.
 *
 * **`split()` is the load-bearing operation, not `nextFloat()`.** SPEC 4.1
 * requires the shoe to take its own stream so that adding a future consumer
 * cannot shift the deal. That guarantee only holds if a child stream is derived
 * from the parent rather than copied from it, and if taking a child does not
 * disturb the parent's own sequence. Both are stated as claims below and both
 * are checked in `tests/unit/rng.test.ts`, because a `split()` that hands back
 * the parent's state satisfies the type and destroys the property.
 *
 * The generator is **sfc32**: four 32-bit words of state, one 32-bit word out
 * per step. STACK section 3 offers sfc32 or xoshiro128**; sfc32 is chosen for
 * the shorter state advance and because every operation in it stays inside
 * what `|`, `^` and `Math.imul` give exactly in a double, so the sequence is
 * identical on every platform without a 64-bit integer type anywhere.
 *
 * One note for whoever cross-checks this against published reference vectors:
 * the counter `d` is incremented **before** it is folded into the output, which
 * is canonical sfc32 but reads as a start of `d + 1`. The first word out of a
 * stream seeded with `d` uses `d + 1`, so a vector table expecting the seeded
 * value to appear first will look one step off. Nothing downstream depends on
 * which convention is used, only on it not changing.
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`, and no clock: the
 * seed always arrives as a parameter. A generator that reached for the wall
 * clock would be unseedable in exactly the cases the seed exists for.
 */

/** One independent stream of random numbers. */
export interface Rng {
  /**
   * The raw generator word, uniform over 0 to 2^32 - 1.
   *
   * Exposed because it is the primitive the other three are built from, and a
   * uniformity check that cannot see it would be testing the reductions rather
   * than the generator.
   */
  nextUint32(): number;
  /** A value in [0, 1), with 2^32 outcomes evenly spaced across the interval. */
  nextFloat(): number;
  /** A uniform integer in 0 to `bound - 1`. Unbiased, and never by modulo. */
  nextInt(bound: number): number;
  /** An unbiased Fisher-Yates shuffle, in place. */
  shuffle<T>(items: T[]): void;
  /** An independent child stream. Neither side's draws move the other's. */
  split(): Rng;
}

/** 2^32. The size of the generator's output range, and of `nextFloat`'s grid. */
const UINT32_SPAN = 0x1_0000_0000;

/** The odd 32-bit increment splitmix uses to walk a seed. */
const GOLDEN_GAMMA = 0x9e37_79b9;

/**
 * Steps discarded after seeding.
 *
 * sfc32 recovers from a poor initial state within a few rounds, and the words
 * it is given here are already avalanched by `mix32`, so this is belt and
 * braces rather than a requirement. It is cheap, it happens once per stream,
 * and it means a seed of 0 and a seed of 1 diverge from the first output rather
 * than from the third.
 */
const WARMUP_STEPS = 12;

/**
 * The splitmix32 finaliser: a bijection on 32 bits with full avalanche.
 *
 * Used for two jobs that are the same job. Expanding one seed into four state
 * words, and deriving a child stream's seed from a parent's state. Both need
 * nearby inputs to produce unrelated outputs, which is exactly what a mixer is
 * and exactly what copying state is not.
 */
function mix32(value: number): number {
  let z = value >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0_aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a_2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

/** Four state words from one seed, each the mixer's output at a fresh point. */
function seedWords(seed: number): readonly [number, number, number, number] {
  let walked = seed >>> 0;
  const nextWord = (): number => {
    walked = (walked + GOLDEN_GAMMA) >>> 0;
    return mix32(walked);
  };
  return [nextWord(), nextWord(), nextWord(), nextWord()];
}

/**
 * The seed of the `index`th child of a parent in the given state.
 *
 * Reads the parent's state without advancing it, so `split()` leaves the
 * parent's own sequence exactly as it was. The index is mixed in as well as the
 * state, so two children taken at the same point are still different streams,
 * and the state is mixed in as well as the index, so a child taken after five
 * draws differs from one taken after fifty.
 */
function splitSeed(a: number, b: number, c: number, d: number, index: number): number {
  let acc = mix32(index >>> 0);
  acc = mix32((acc + a) >>> 0);
  acc = mix32((acc ^ b) >>> 0);
  acc = mix32((acc + c) >>> 0);
  return mix32((acc ^ d) >>> 0);
}

/**
 * The smallest number of bits that can hold `bound - 1`, and never fewer than
 * one: `x >>> 32` is `x >>> 0` in this language, so a zero-bit shift would
 * quietly return the whole word for a bound of 1.
 */
function bitsFor(bound: number): number {
  let bits = 1;
  let span = 2;
  while (span < bound) {
    span *= 2;
    bits += 1;
  }
  return bits;
}

/**
 * Exchange two elements whose indices the caller has already proved in range.
 *
 * The two casts are `noUncheckedIndexedAccess` and nothing else. A value test
 * would be worse than a cast here rather than safer: an array that legitimately
 * holds `undefined` shuffles correctly through these writes, and a guard that
 * threw on reading one would break the only case it was added for.
 */
function swap<T>(items: T[], left: number, right: number): void {
  const held = items[left] as T;
  items[left] = items[right] as T;
  items[right] = held;
}

/** A stream over four given state words, unwarmed. */
function createFrom(wordA: number, wordB: number, wordC: number, wordD: number): Rng {
  let a = wordA >>> 0;
  let b = wordB >>> 0;
  let c = wordC >>> 0;
  let d = wordD >>> 0;
  let splits = 0;

  function nextUint32(): number {
    const sum = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (sum + d) | 0;
    c = (c + out) | 0;
    return out >>> 0;
  }

  function nextFloat(): number {
    return nextUint32() / UINT32_SPAN;
  }

  /**
   * A uniform integer in 0 to `bound - 1`, by rejection and never by modulo.
   *
   * The word is cut down to the smallest power of two that covers the bound,
   * which is exact because 2^32 divides by it, and anything landing above the
   * bound is thrown away and redrawn. `word % bound` would be the whole defect:
   * when the bound does not divide 2^32 the low residues each get one extra
   * word, and the excess is invisible at a bound of 5 and enormous at a bound
   * near 2^32. Rejection has no such range where the fault hides.
   *
   * At most half of the draws are rejected, so the expected number of words per
   * call is at most two. Two is reached at a bound of 1, where `bitsFor`
   * deliberately keeps a bit nothing needs and exactly half the draws are
   * thrown away; every larger bound accepts more than half and costs less.
   */
  function nextInt(bound: number): number {
    if (!Number.isInteger(bound) || bound < 1 || bound > UINT32_SPAN) {
      throw new RangeError(
        `nextInt needs an integer bound in 1 to 2^32; got ${String(bound)}`,
      );
    }
    const shift = 32 - bitsFor(bound);
    for (;;) {
      const draw = nextUint32() >>> shift;
      if (draw < bound) {
        return draw;
      }
    }
  }

  /**
   * Fisher-Yates, in place, walking down and drawing from the unvisited prefix.
   *
   * `nextInt(index + 1)` is the whole of the correctness argument. Drawing the
   * partner from the entire array instead is the classic wrong version: it
   * produces `length ** (length - 1)` equally likely traces over `length!`
   * permutations, and those two numbers do not divide, so the permutations
   * cannot come out level. On five elements the most frequent one arrives at
   * 2.88 times its fair share, which is 15 times as often as the least frequent
   * one. `tests/unit/shoe.test.ts` runs both forms and requires the tolerance
   * that passes this one to reject that one.
   */
  function shuffle<T>(items: T[]): void {
    for (let index = items.length - 1; index > 0; index -= 1) {
      swap(items, index, nextInt(index + 1));
    }
  }

  /**
   * An independent child stream. SPEC 4.1.
   *
   * The child's state is the mixer's output over the parent's state and a split
   * counter, so it is derived rather than copied and the parent's own sequence
   * is untouched by the call. Handing back the parent's four words would type
   * check, run, and give the shoe a stream that marched in lockstep with
   * whatever else held the parent.
   */
  function split(): Rng {
    splits += 1;
    const derived = splitSeed(a, b, c, d, splits);
    return fromWords(seedWords(derived));
  }

  return Object.freeze({ nextUint32, nextFloat, nextInt, shuffle, split });
}

/** A stream over four state words, warmed. */
function fromWords(words: readonly [number, number, number, number]): Rng {
  const stream = createFrom(words[0], words[1], words[2], words[3]);
  for (let step = 0; step < WARMUP_STEPS; step += 1) {
    stream.nextUint32();
  }
  return stream;
}

/**
 * A stream from a seed. The same seed gives the same sequence everywhere.
 *
 * The seed must be an integer and is read modulo 2^32, so `1` and `1 + 2^32`
 * are the same stream. A non-integer is refused rather than truncated: a caller
 * that arrived here with a fraction has a bug, and silently flooring it would
 * hide the one thing a seed exists to make reproducible.
 */
export function createRng(seed: number): Rng {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`a seed must be an integer; got ${String(seed)}`);
  }
  return fromWords(seedWords(seed));
}
