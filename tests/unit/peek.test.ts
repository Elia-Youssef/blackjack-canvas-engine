/**
 * Item B7, severity Critical, 13 points.
 *
 *   "The dealer peeks on an Ace or ten-value up card, resolves immediately on a
 *    natural with player naturals pushing, and leaks nothing through timing or
 *    animation when there is no natural."
 *
 * SPEC 4.4. **The item is one sentence and three claims, and this file is
 * deliberately not all three.** The split is disclosed here the way
 * `shoe.test.ts` discloses the parts of `B5` and `B16` it builds but does not
 * close, because a test file that quietly graded a third of a criterion and
 * reported a pass would be worth less than no test at all.
 *
 *   1. **Which up cards the dealer peeks behind, and which offer insurance.**
 *      Closed here, over all 13 ranks and all 169 up and hole rank pairs.
 *   2. **The resolution: a natural ends the round at once and a player natural
 *      pushes.** The bit that says whether there is a natural is here. Ending
 *      the round on it is the phase machine's at `BJ-7`, and the push is rung 2
 *      of the settlement ladder at `BJ-5`. SPEC 4.4's ordering requirement, that
 *      the insurance and even-money offers close *before* the peek result is
 *      applied, is why `offersInsurance` is a separate predicate from `peek`;
 *      the ordering itself becomes enforceable where phases exist, which is
 *      `BJ-7`, and it is not closed here.
 *   3. **Leaking nothing when there is no natural.** The half a headless module
 *      can carry is graded here in full: the result exposes one bit, the two
 *      branches are the same shape, and a caller cannot come away holding the
 *      hole card. The timing and animation half is item **`E6` at `BJ-14`**,
 *      whose criterion carries it in as many words, "The dealer's peek is
 *      identical in motion and pacing whether or not it finds a natural: no
 *      tell, no timing difference, no animation variation", and whose method is
 *      the scripted capture of both peek branches. It is not graded here and
 *      there is no frame here to grade it with.
 *
 * The rank labels and the rule are carried in this file rather than taken from
 * `src/`, on the reasoning `hand-value.test.ts` gives: a truth table that took
 * its rule from the code it is checking would agree with that code's misreading
 * forever. The ten-value set comes from `reference/hand-evaluator.ts`, the
 * second implementation this project already keeps for SPEC 4.2, so there is
 * one of those and not two. `isAceLabel` and `isDealerNatural` stay inline on
 * purpose: the first is one comparison, and the second is the truth rule under
 * test, which has to be this file's own reading of SPEC 4.2 to be worth
 * anything.
 */

import { describe, expect, it } from 'vitest';

import type { Card } from '../../src/core/cards';
import { RANKS, SUITS, card, isAce, isTenValue } from '../../src/core/cards';
import type { PeekResult } from '../../src/core/dealer';
import { offersInsurance, peek, peeksOn } from '../../src/core/dealer';

import { isTenValueRank } from './reference/hand-evaluator';

// ---------------------------------------------------------------------------
// The alphabet and the rule, carried here rather than taken from the code
// ---------------------------------------------------------------------------

const RANK_LABELS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

type RankLabel = (typeof RANK_LABELS)[number];

const SUIT_LABELS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;

/** SPEC 4.4: the up cards the dealer looks behind, written out. */
const PEEK_RANKS = ['A', '10', 'J', 'Q', 'K'] as const;

/** SPEC 4.4 and 4.7: the up card that carries an insurance offer, written out. */
const INSURANCE_RANKS = ['A'] as const;

/** The 169 ordered up and hole rank pairs. */
const RANK_PAIRS = 169;

/**
 * Pairs the dealer peeks behind: 5 up cards x 13 hole cards.
 */
const PEEKED_PAIRS = 65;

/**
 * Naturals among them: an Ace up with each of the four ten-value holes, and
 * each of the four ten-value up cards with an Ace hole.
 */
const NATURAL_PAIRS = 8;

/** SPEC 4.2, as prose: the Ace is the only rank with two readings. */
function isAceLabel(label: RankLabel): boolean {
  return label === 'A';
}

/**
 * SPEC 4.2's natural, for the two cards a dealer holds at the peek: an Ace plus
 * a ten-value card. Either card may be the Ace, and neither an Ace with an Ace
 * nor a ten with a ten is one.
 *
 * `isTenValueRank` is the reference implementation's, which derives ten-ness
 * from the printed label instead of from a table; the shape of the rule, which
 * is what B7 turns on, is this file's own.
 */
function isDealerNatural(up: RankLabel, hole: RankLabel): boolean {
  return (
    (isAceLabel(up) && isTenValueRank(hole)) || (isTenValueRank(up) && isAceLabel(hole))
  );
}

// ---------------------------------------------------------------------------
// Building cards, and reading a result without trusting its shape
// ---------------------------------------------------------------------------

/** The up card and the hole card, in two different suits. */
function deal(up: RankLabel, hole: RankLabel): [Card, Card] {
  return [card(up, 'spades'), card(hole, 'hearts')];
}

/**
 * One own property of a result, read without assuming the result's shape.
 *
 * The cast goes through `unknown` because `PeekResult` has no index signature,
 * which is the point: these tests are looking for fields the interface does not
 * declare, so they cannot go through the interface to find them.
 */
function fieldOf(result: PeekResult, name: string): unknown {
  return (result as unknown as Record<string, unknown>)[name];
}

/**
 * Everything a caller can observe about a result, as one string.
 *
 * Own property names rather than `Object.keys`, so a non-enumerable field added
 * to hide from a serialiser is still seen here, and the symbols separately,
 * since a symbol-keyed field is invisible to both.
 */
function observable(result: PeekResult): string {
  const names = Object.getOwnPropertyNames(result);
  return JSON.stringify({
    names,
    values: names.map((name) => String(fieldOf(result, name))),
    symbols: Object.getOwnPropertySymbols(result).length,
    frozen: Object.isFrozen(result),
    json: JSON.stringify(result),
    prototype: Object.getPrototypeOf(result) === Object.prototype,
  });
}

/** Every pair the dealer peeks behind, as up and hole rank labels. */
function eachPeekedPair(visit: (up: RankLabel, hole: RankLabel) => void): void {
  for (const up of RANK_LABELS) {
    if (!PEEK_RANKS.some((peeked) => peeked === up)) {
      continue;
    }
    for (const hole of RANK_LABELS) {
      visit(up, hole);
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('the alphabet and the rule this file checks against', () => {
  it('is the same 13 ranks the game deals', () => {
    expect([...RANKS]).toEqual([...RANK_LABELS]);
    expect(new Set(RANKS).size).toBe(13);
    expect([...SUITS]).toEqual([...SUIT_LABELS]);
  });

  it('agrees with the game on which ranks are an Ace and which are worth ten', () => {
    for (const label of RANK_LABELS) {
      expect(isAce(label)).toBe(isAceLabel(label));
      expect(isTenValue(label)).toBe(isTenValueRank(label));
    }
    expect(RANK_LABELS.filter((label) => isTenValueRank(label))).toEqual(['10', 'J', 'Q', 'K']);
    expect(RANK_LABELS.filter(isAceLabel)).toEqual(['A']);
  });
});

describe('B7: which up cards the dealer peeks behind. SPEC 4.4', () => {
  it('peeks on exactly the Ace and the four ten-value ranks', () => {
    expect(RANK_LABELS.filter((label) => peeksOn(label))).toEqual([...PEEK_RANKS]);
  });

  it('peeks on no other rank, one rank at a time', () => {
    for (const label of RANK_LABELS) {
      const wanted = isAceLabel(label) || isTenValueRank(label);
      expect(peeksOn(label)).toBe(wanted);
    }
    expect(RANK_LABELS.filter((label) => peeksOn(label))).toHaveLength(5);
  });
});

describe('B7: which up card carries an insurance offer. SPEC 4.4 and 4.7', () => {
  it('offers insurance on exactly the Ace', () => {
    expect(RANK_LABELS.filter((label) => offersInsurance(label))).toEqual([...INSURANCE_RANKS]);
  });

  it('offers nothing on a ten-value up card, which peeks and applies at once', () => {
    for (const label of RANK_LABELS) {
      if (isTenValueRank(label)) {
        expect(peeksOn(label)).toBe(true);
        expect(offersInsurance(label)).toBe(false);
      }
    }
  });

  it('never offers insurance on an up card it does not peek behind', () => {
    for (const label of RANK_LABELS) {
      if (offersInsurance(label)) {
        expect(peeksOn(label)).toBe(true);
      }
    }
  });
});

describe('B7: the peek result over all 169 up and hole pairs. SPEC 4.4', () => {
  it('calls a natural exactly on an Ace with a ten-value card, either way round', () => {
    const wrong: string[] = [];
    let peeked = 0;
    let naturals = 0;
    let refused = 0;

    for (const up of RANK_LABELS) {
      for (const hole of RANK_LABELS) {
        const [upCard, holeCard] = deal(up, hole);
        if (!peeksOn(up)) {
          refused += 1;
          expect(() => peek(upCard, holeCard)).toThrow(RangeError);
          continue;
        }
        peeked += 1;
        const wanted = isDealerNatural(up, hole);
        if (wanted) {
          naturals += 1;
        }
        const got = peek(upCard, holeCard).dealerNatural;
        if (got !== wanted) {
          wrong.push(`${up} up, ${hole} in the hole: ${String(got)}, wanted ${String(wanted)}`);
        }
      }
    }

    expect(wrong).toEqual([]);
    expect(peeked + refused).toBe(RANK_PAIRS);
    expect(peeked).toBe(PEEKED_PAIRS);
    expect(naturals).toBe(NATURAL_PAIRS);
  });

  it('is a natural on an Ace up with any ten-value hole card', () => {
    for (const hole of ['10', 'J', 'Q', 'K'] as const) {
      expect(peek(...deal('A', hole)).dealerNatural).toBe(true);
      expect(peek(...deal(hole, 'A')).dealerNatural).toBe(true);
    }
  });

  it('is not a natural on two ten-value cards, in any of the sixteen pairs', () => {
    for (const up of ['10', 'J', 'Q', 'K'] as const) {
      for (const hole of ['10', 'J', 'Q', 'K'] as const) {
        expect(peek(...deal(up, hole)).dealerNatural).toBe(false);
      }
    }
  });

  it('is not a natural on two Aces, which is soft 12 and not 21', () => {
    expect(peek(...deal('A', 'A')).dealerNatural).toBe(false);
  });

  it('is not a natural on any other hole card behind an Ace', () => {
    for (const hole of RANK_LABELS) {
      const wanted = isTenValueRank(hole);
      expect(peek(...deal('A', hole)).dealerNatural).toBe(wanted);
    }
  });
});

/**
 * SPEC 4.4 peeks behind an Ace or a ten-value up card and behind nothing else,
 * and `dealer.ts` refuses any other up card rather than answering "no natural"
 * for it. The choice is argued there; what is asserted here is that the refusal
 * happens, and that it is decided by the up card alone.
 *
 * That second half is the one that matters for this item: a refusal whose text
 * or type varied with the hole card would be a tell in a stack trace, which is
 * the same defect as a tell on screen wearing different clothes.
 */
describe('B7: an up card the dealer does not peek behind is refused', () => {
  it('throws for every one of the eight other ranks, whatever is in the hole', () => {
    let refusals = 0;
    for (const up of RANK_LABELS) {
      if (peeksOn(up)) {
        continue;
      }
      for (const hole of RANK_LABELS) {
        expect(() => peek(...deal(up, hole))).toThrow(RangeError);
        refusals += 1;
      }
    }
    expect(refusals).toBe((RANK_LABELS.length - PEEK_RANKS.length) * RANK_LABELS.length);
    expect(refusals).toBe(104);
  });

  it('says the same thing whatever the hole card is', () => {
    for (const up of RANK_LABELS) {
      if (peeksOn(up)) {
        continue;
      }
      const messages = new Set<string>();
      for (const hole of RANK_LABELS) {
        for (const suit of SUIT_LABELS) {
          try {
            peek(card(up, 'spades'), card(hole, suit));
            throw new Error(`peeking behind ${up} was allowed`);
          } catch (thrown) {
            if (!(thrown instanceof RangeError)) {
              throw thrown;
            }
            messages.add(thrown.message);
          }
        }
      }
      expect(messages.size).toBe(1);
      // Not `toContain(up)`: the message cites SPEC 4.4, so a bare "4" would
      // match the citation rather than the up card and pass for the wrong
      // reason. This substring can only come from the interpolated rank.
      expect([...messages][0]).toContain(`${up} is neither`);
    }
  });
});

/**
 * SPEC 4.4: "The peek must leak nothing when there is no natural: no tell, no
 * timing difference, no animation variation."
 *
 * The half of that a headless module owns is the result itself. A caller cannot
 * leak what it was never handed, so the assertions here are about what the
 * caller comes away holding: one bit, in a shape that does not vary, with no
 * trace of the card that was looked at.
 */
describe('B7: the result of a peek carries one bit and nothing else', () => {
  it('has exactly two possible values across every pair the dealer peeks', () => {
    const results = new Set<PeekResult>();
    const shapes = new Set<string>();
    eachPeekedPair((up, hole) => {
      const result = peek(...deal(up, hole));
      results.add(result);
      shapes.add(observable(result));
    });
    // One object per branch, shared: two peeks that found no natural hand back
    // the very same object, so not even identity separates their hole cards.
    expect(results.size).toBe(2);
    expect(shapes.size).toBe(2);
  });

  it('is the same object for every hole card behind an Ace that is not a ten', () => {
    const results = new Set<PeekResult>();
    for (const hole of RANK_LABELS) {
      if (isTenValueRank(hole)) {
        continue;
      }
      results.add(peek(...deal('A', hole)));
    }
    expect(results.size).toBe(1);
    expect(RANK_LABELS.filter((label) => !isTenValueRank(label))).toHaveLength(9);
  });

  it('gives the same object on a no-natural peek behind any up card it peeks', () => {
    const results = new Set<PeekResult>();
    eachPeekedPair((up, hole) => {
      if (!isDealerNatural(up, hole)) {
        results.add(peek(...deal(up, hole)));
      }
    });
    expect(results.size).toBe(1);
  });

  it('carries one boolean field, under the same name, on both branches', () => {
    const natural = peek(...deal('A', 'K'));
    const plain = peek(...deal('A', '9'));
    for (const result of [natural, plain]) {
      expect(Object.getOwnPropertyNames(result)).toEqual(['dealerNatural']);
      expect(Object.getOwnPropertySymbols(result)).toEqual([]);
      expect(typeof result.dealerNatural).toBe('boolean');
      expect(Object.isFrozen(result)).toBe(true);
    }
    expect(Object.getOwnPropertyNames(natural)).toEqual(Object.getOwnPropertyNames(plain));
    expect(JSON.stringify(natural)).toBe('{"dealerNatural":true}');
    expect(JSON.stringify(plain)).toBe('{"dealerNatural":false}');
  });

  it('holds no field equal to or derived from the hole card', () => {
    eachPeekedPair((up, hole) => {
      const [upCard, holeCard] = deal(up, hole);
      const result = peek(upCard, holeCard);
      const held = Object.getOwnPropertyNames(result).map((name) => fieldOf(result, name));
      for (const value of held) {
        expect(typeof value).toBe('boolean');
        expect(value).not.toBe(holeCard);
        expect(value).not.toBe(holeCard.rank);
        expect(value).not.toBe(holeCard.suit);
      }
      expect(JSON.stringify(result)).not.toContain(holeCard.suit);
    });
  });

  it('cannot be decorated with the card the caller was not given', () => {
    const result = peek(...deal('K', '4'));
    const mutable = result as { dealerNatural: boolean; hole?: string };
    expect(() => {
      mutable.hole = '4';
    }).toThrow(TypeError);
    expect(() => {
      mutable.dealerNatural = true;
    }).toThrow(TypeError);
    expect(result.dealerNatural).toBe(false);
    expect(Object.getOwnPropertyNames(result)).toEqual(['dealerNatural']);
  });
});

describe('B7: the peek reads ranks, and nothing else', () => {
  it('gives the same result for every suit either card can be', () => {
    let compared = 0;
    eachPeekedPair((up, hole) => {
      const baseline = peek(card(up, 'clubs'), card(hole, 'clubs'));
      for (const upSuit of SUIT_LABELS) {
        for (const holeSuit of SUIT_LABELS) {
          const result = peek(card(up, upSuit), card(hole, holeSuit));
          // The very same object, which is stronger than an equal one: the two
          // constants are all there is to return.
          expect(result).toBe(baseline);
          compared += 1;
        }
      }
    });
    expect(compared).toBe(PEEKED_PAIRS * SUIT_LABELS.length * SUIT_LABELS.length);
  });

  it('peeks and offers on the rank alone, in all four suits', () => {
    for (const label of RANK_LABELS) {
      for (const suit of SUIT_LABELS) {
        const held = card(label, suit);
        expect(peeksOn(held.rank)).toBe(peeksOn(label));
        expect(offersInsurance(held.rank)).toBe(offersInsurance(label));
      }
    }
  });
});
