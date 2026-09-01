/**
 * The shared machine-driving scaffolding, pinned.
 *
 * `tests/unit/support/drive.ts` holds `bounded` and `acceptResult`, which were
 * copied twelve times each before `AUDIT-1` moved them into one file. The move
 * is what makes this file necessary: twelve private copies each had one caller,
 * so a broken copy was one red suite, while one shared copy has **47 call sites
 * across the unit suites** and a broken one is silent. The review that asked for
 * this measured exactly that: deleting `acceptResult`'s refusal guard, leaving
 * `return result;`, left the whole suite at 1196 of 1196 green.
 *
 * Nothing in the suite is currently refused, which is why a mutation entry on
 * `drive.ts` would survive rather than grade. So the control is planted here on
 * `tests/unit/source-scan.test.ts`'s precedent, which the same wave established
 * two files away for the other extracted helper: the primitive is driven
 * directly, with a refusal and an acceptance constructed rather than waited for.
 *
 * **Each assertion is independently checkable.** The three below break on three
 * different edits: the guard, the pass-through, and the counter's comparison.
 * Blinding any one of them reddens this file on its own.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { acceptResult, bounded } from './support/drive';

import type { IntentResult } from '../../src/core/table';

/** A refusal exactly as `table.apply` shapes one. */
const REFUSED: IntentResult = {
  ok: false,
  kind: 'deal',
  layer: 'wallet',
  reason: 'below-minimum',
};

/** An acceptance exactly as `table.apply` shapes one. */
const ACCEPTED: IntentResult = { ok: true, kind: 'deal', phase: 'dealing' };

describe('acceptResult: a refusal is a failure, in the refusal own words', () => {
  it('throws on a refusal, naming the kind, the layer and the reason', () => {
    // The whole point of the helper: a drive that walked past a refusal would
    // go on to assert against a machine that never moved, and the failure would
    // land somewhere else entirely with none of these three words in it.
    let thrown: unknown = null;
    try {
      acceptResult(REFUSED);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, 'a refusal was accepted').toBeInstanceOf(Error);
    const message = thrown instanceof Error ? thrown.message : '';
    expect(message, 'the refused intent is not named').toContain('deal');
    expect(message, 'the layer that refused is not named').toContain('wallet');
    expect(message, 'the reason is not named').toContain('below-minimum');
  });

  it('returns an acceptance unchanged, by identity', () => {
    // The other half, and the reason the helper returns rather than asserts:
    // call sites read the wager and the hand index out of the result it hands
    // back. A guard that threw on everything would pass the test above.
    expect(acceptResult(ACCEPTED)).toBe(ACCEPTED);
  });
});

describe('bounded: a stall fails loudly and names what it was doing', () => {
  it('throws a RangeError naming its label past the limit, and not at it', () => {
    // Both edges, because the off-by-one is the failure this helper can have:
    // a counter that threw at the limit would fail drives that were working,
    // and one that never threw would hang the runner instead of naming a stall.
    const turn = bounded('driving the machine somewhere', 3);
    for (let step = 0; step < 3; step += 1) {
      expect(() => {
        turn();
      }, `turn ${String(step + 1)} of 3 threw at the limit`).not.toThrow();
    }
    let thrown: unknown = null;
    try {
      turn();
    } catch (error) {
      thrown = error;
    }
    expect(thrown, 'the counter ran past its limit without complaining').toBeInstanceOf(RangeError);
    const message = thrown instanceof RangeError ? thrown.message : '';
    expect(message, 'the stalled drive is not named').toContain('driving the machine somewhere');
    expect(message, 'the budget it spent is not named').toContain('3');
  });

  it('counts each returned counter on its own', () => {
    // Twelve files share one function now, and a counter that shared state
    // across calls would fail the second suite to use it for the first one's
    // reasons.
    const first = bounded('first drive', 1);
    const second = bounded('second drive', 1);
    first();
    second();
    expect(() => {
      first();
    }).toThrow(/first drive/);
    expect(() => {
      second();
    }).toThrow(/second drive/);
  });
});
