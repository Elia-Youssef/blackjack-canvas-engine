/**
 * Item J3, severity Major, 17 points.
 *
 *   "For all ten dealer up cards crossed with every hard total, soft total and
 *    pair, the table generated from the active house-rule record equals the
 *    corresponding cell of the committed reference chart, for each of the 8
 *    rule combinations: shoe size 6 or 8, DAS on or off, surrender on or off.
 *    The reference chart is test data and does not ship."
 *
 * SPEC 7 and DESIGN section 7. The criterion is a sweep and an equality, and
 * everything below either performs that sweep or protects it.
 *
 * **The expected values come from outside the code under test.**
 * `reference/basic-strategy-charts.ts` holds all eight combinations, written out
 * by hand from published basic strategy for a shoe of 4 to 8 decks with the
 * dealer standing on soft 17, which is the game SPEC 4 describes. It imports
 * nothing from `src/` and no cell in it was produced by running the generator.
 * That file is the whole reason this item is worth 17 points: a chart pasted
 * from the generator's own output agrees with the generator's misreading
 * forever, which is exactly what `tests/unit/reference/` exists to prevent, and
 * it is the same discipline `hand-evaluator.ts` applies to SPEC 4.2.
 *
 * **The arithmetic of the sweep, derived rather than asserted as a number.**
 * Ten dealer up cards, crossed with 18 hard totals (4 through 21), 10 soft
 * totals (12 through 21) and 10 pair rows (A,A through 10,10). That is
 * `(18 + 10 + 10) x 10 = 380` cells per combination and `380 x 8 = 3,040`
 * comparisons. Every one of those figures is computed from the row and column
 * lists below and checked against **both** the module's published lists and the
 * chart's, so a row quietly dropped from either side fails the count rather
 * than shrinking the sweep.
 *
 * **The two axes that move cells, and the one that does not.**
 *
 *   - DAS moves exactly 7 pair cells and nothing else.
 *   - Surrender moves exactly 7 cells, all of them one of two hard totals: the
 *     four hard cells themselves, and the three 8,8 cells whose fall-through is
 *     that same hard 16.
 *   - **The shoe size moves nothing.** The 6-deck and 8-deck reference charts
 *     were written out separately and came out identical cell for cell, which
 *     is the correct answer for total-dependent S17 play: published charts group
 *     4 through 8 decks. Both are still swept, so a generator that grew a wrong
 *     deck branch would be caught. The finding is recorded rather than
 *     engineered around, and neither of the two documents that say otherwise is
 *     edited to match it: `BlackJack/SPEC.md` section 7, "Changing shoe size or
 *     turning DAS off changes some recommendations", and `BlackJack/DESIGN.md`
 *     section 7, "because the correct action genuinely changes with shoe size,
 *     DAS availability and surrender availability". Both are satisfied through
 *     the DAS axis; the shoe-size half of each is the user's to resolve, in one
 *     approved edit that touches both.
 *
 * Both sets are written out below as exact expectations, and two deliberately
 * wrong generators are required to disagree on **exactly** their own set and
 * nowhere else. A control that merely disagrees somewhere proves nothing: a
 * sweep that had stopped comparing would let a wrong generator pass and would
 * also let a wrong control pass.
 *
 * **Scope.** This is the coach as logic. What it hands on is someone else's:
 *
 *   - Rendering a hint, a review line or an accuracy readout is chrome, and
 *     item `J4` at `BJ-20` grades the three modes end to end in the browser.
 *   - Session and lifetime statistics as a whole are `statistics.ts` at
 *     `BJ-10`; this file owns only the two counters SPEC 7 names and the one
 *     place they separate.
 *   - Persisting them is SPEC 13's, at `BJ-11`.
 *   - The coach verdict on SPEC 12's round result is item `C8` at `BJ-15`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Card, Rank } from '../../src/core/cards';
import { RANKS, card, isTenValue } from '../../src/core/cards';
import { handValue } from '../../src/core/hand';
import type { HouseRules } from '../../src/core/rules';
import { houseRules } from '../../src/core/rules';
import type {
  ChartRank,
  CoachAction,
  CoachRecord,
  CoachSituation,
  PreferenceList,
  StrategyTable,
} from '../../src/core/strategy';
import {
  COACH_MODES,
  DEFAULT_COACH_MODE,
  HARD_TOTALS,
  LOWEST_HARD_TOTAL,
  LOWEST_SOFT_TOTAL,
  NO_DECISIONS,
  PAIR_RANKS,
  SOFT_TOTALS,
  UP_CARDS,
  accuracy,
  actionOf,
  chartRank,
  compare,
  hint,
  legal,
  observe,
  openSession,
  recommend,
  recordDecision,
  situationAt,
  strategyTable,
} from '../../src/core/strategy';
import type { Table, TableReadout } from '../../src/core/table';
import { TIMINGS, createTable } from '../../src/core/table';
import type { HandInPlay, IntentKind } from '../../src/core/types';
import type { ChipDenomination, Wallet } from '../../src/core/wallet';
import { createWallet, tableLimits } from '../../src/core/wallet';

import { scriptedShoe } from './support/stacked-shoe';

import type { RuleCombination } from './reference/basic-strategy-charts';
import {
  CELLS_PER_COMBINATION,
  CHART_COLUMNS,
  CHART_COMBINATIONS,
  CHART_DECKS,
  CHART_HARD_TOTALS,
  CHART_PAIRS,
  CHART_SOFT_TOTALS,
  decode,
  referenceHard,
  referencePair,
  referenceSoft,
} from './reference/basic-strategy-charts';

// ---------------------------------------------------------------------------
// The arithmetic of the sweep, written here and reconciled with both sides
// ---------------------------------------------------------------------------

/** SPEC 7's ten dealer up cards: 2 through 10 and the Ace. */
const UP_CARD_COUNT = 10;

/** Hard 4 through hard 21. 4 is 2,2 and 21 is the auto-stand of SPEC 4.5. */
const HARD_ROW_COUNT = 18;

/** Soft 12 through soft 21. 12 is A,A; a lone Ace is soft 11 and no decision. */
const SOFT_ROW_COUNT = 10;

/** A,A through 10,10. One row per chart rank. */
const PAIR_ROW_COUNT = 10;

/** SPEC 7: shoe size 6 or 8, crossed with DAS on or off, crossed with surrender. */
const COMBINATION_COUNT = 8;

/** 380 cells: `(18 + 10 + 10) x 10`. Derived, never typed as a number. */
const CELLS_PER_TABLE = (HARD_ROW_COUNT + SOFT_ROW_COUNT + PAIR_ROW_COUNT) * UP_CARD_COUNT;

/** 3,040 comparisons: 380 cells across each of the 8 rule combinations. */
const SWEPT_CELLS = CELLS_PER_TABLE * COMBINATION_COUNT;

/**
 * The seven pair cells SPEC 4.6's Double after split toggle moves.
 *
 * Each is a split worth taking only because the hands it creates may be
 * doubled: 2,2 and 3,3 against the dealer's two weakest up cards, 4,4 against
 * the two it is worth splitting into at all, and 6,6 against a 2.
 */
const DAS_CELLS: readonly string[] = [
  'pair 2 vs 2',
  'pair 2 vs 3',
  'pair 3 vs 2',
  'pair 3 vs 3',
  'pair 4 vs 5',
  'pair 4 vs 6',
  'pair 6 vs 2',
];

/**
 * The seven cells SPEC 4.8's late surrender toggle moves.
 *
 * Four are the hard totals themselves. The other three are 8,8 against the same
 * three up cards, because a pair cell's fall-through is that holding read as a
 * total and 8,8 read as a total is hard 16.
 */
const SURRENDER_CELLS: readonly string[] = [
  'hard 15 vs 10',
  'hard 16 vs 9',
  'hard 16 vs 10',
  'hard 16 vs A',
  'pair 8 vs 9',
  'pair 8 vs 10',
  'pair 8 vs A',
];

// ---------------------------------------------------------------------------
// Sweeping one table against one committed chart
// ---------------------------------------------------------------------------

/**
 * The three lookups a sweep needs, as an interface a control can also satisfy.
 *
 * `StrategyTable` meets it structurally. The deliberately wrong generators
 * below meet it too, which is how the same sweep drives the real table and its
 * controls over exactly the same cells.
 */
interface Lookup {
  hard(total: number, up: ChartRank): readonly string[];
  soft(total: number, up: ChartRank): readonly string[];
  pair(pair: ChartRank, up: ChartRank): readonly string[];
}

/** One cell where a table and a chart disagreed. */
interface Mismatch {
  readonly cell: string;
  readonly generated: readonly string[];
  readonly reference: readonly string[];
}

interface SweepResult {
  readonly mismatches: readonly Mismatch[];
  readonly cells: number;
}

function differs(generated: readonly string[], reference: readonly string[]): boolean {
  return (
    generated.length !== reference.length ||
    generated.some((action, index) => action !== reference[index])
  );
}

/**
 * Compare every cell of one table against one combination's committed chart.
 *
 * The columns come from the chart file rather than from the module, so a
 * generator that dropped a column would be swept for it anyway and would fail
 * on the lookup rather than on a shortened loop.
 */
function sweep(lookup: Lookup, combination: RuleCombination): SweepResult {
  const mismatches: Mismatch[] = [];
  let cells = 0;

  function check(cell: string, generated: readonly string[], reference: readonly string[]): void {
    cells += 1;
    if (differs(generated, reference)) {
      mismatches.push({ cell, generated, reference });
    }
  }

  for (const total of CHART_HARD_TOTALS) {
    for (const up of CHART_COLUMNS) {
      check(
        `hard ${String(total)} vs ${up}`,
        lookup.hard(total, up),
        referenceHard(combination, total, up),
      );
    }
  }
  for (const total of CHART_SOFT_TOTALS) {
    for (const up of CHART_COLUMNS) {
      check(
        `soft ${String(total)} vs ${up}`,
        lookup.soft(total, up),
        referenceSoft(combination, total, up),
      );
    }
  }
  for (const pair of CHART_PAIRS) {
    for (const up of CHART_COLUMNS) {
      check(
        `pair ${pair} vs ${up}`,
        lookup.pair(pair, up),
        referencePair(combination, pair, up),
      );
    }
  }

  return { mismatches, cells };
}

/** The house-rule record one of SPEC 7's eight combinations names. */
function rulesFor(combination: RuleCombination): HouseRules {
  return houseRules({
    decks: combination.decks,
    doubleAfterSplit: combination.doubleAfterSplit,
    surrender: combination.surrender,
  });
}

/** A short name for a combination, for a failure message. */
function nameOf(combination: RuleCombination): string {
  return `${String(combination.decks)} decks, DAS ${
    combination.doubleAfterSplit ? 'on' : 'off'
  }, surrender ${combination.surrender ? 'on' : 'off'}`;
}

function cellsOf(mismatches: readonly Mismatch[]): readonly string[] {
  return [...mismatches.map((mismatch) => mismatch.cell)].sort();
}

// ---------------------------------------------------------------------------
// The alphabet, reconciled across all three transcriptions
// ---------------------------------------------------------------------------

describe('J3: the sweep covers what SPEC 7 says it covers', () => {
  it('has the same ten up cards on the module, on the chart and here', () => {
    expect(UP_CARDS.length).toBe(UP_CARD_COUNT);
    expect(CHART_COLUMNS.length).toBe(UP_CARD_COUNT);
    expect([...UP_CARDS].sort()).toEqual([...CHART_COLUMNS].sort());
  });

  it('has the same rows on the module, on the chart and here', () => {
    expect(HARD_TOTALS.length).toBe(HARD_ROW_COUNT);
    expect(SOFT_TOTALS.length).toBe(SOFT_ROW_COUNT);
    expect(PAIR_RANKS.length).toBe(PAIR_ROW_COUNT);
    expect([...CHART_HARD_TOTALS]).toEqual([...HARD_TOTALS]);
    expect([...CHART_SOFT_TOTALS]).toEqual([...SOFT_TOTALS]);
    expect([...CHART_PAIRS].sort()).toEqual([...PAIR_RANKS].sort());
  });

  it('starts the hard surface at 2,2 and the soft surface at A,A', () => {
    expect(LOWEST_HARD_TOTAL).toBe(4);
    expect(LOWEST_SOFT_TOTAL).toBe(12);
    expect(HARD_TOTALS[0]).toBe(LOWEST_HARD_TOTAL);
    expect(SOFT_TOTALS[0]).toBe(LOWEST_SOFT_TOTAL);
    expect(HARD_TOTALS[HARD_TOTALS.length - 1]).toBe(21);
    expect(SOFT_TOTALS[SOFT_TOTALS.length - 1]).toBe(21);
  });

  it('agrees with the chart on how many cells one combination holds', () => {
    expect(CELLS_PER_TABLE).toBe(380);
    expect(CELLS_PER_COMBINATION).toBe(CELLS_PER_TABLE);
  });

  it('enumerates the eight combinations SPEC 7 names, each of them once', () => {
    expect(CHART_COMBINATIONS.length).toBe(COMBINATION_COUNT);
    expect(new Set(CHART_COMBINATIONS.map(nameOf)).size).toBe(COMBINATION_COUNT);
    expect([...CHART_DECKS]).toEqual([6, 8]);
    expect(SWEPT_CELLS).toBe(3040);
  });

  it('expands each of the eight chart abbreviations exactly one way', () => {
    expect(decode('H')).toEqual(['hit']);
    expect(decode('S')).toEqual(['stand']);
    expect(decode('D')).toEqual(['double', 'hit']);
    expect(decode('Ds')).toEqual(['double', 'stand']);
    expect(decode('Rh')).toEqual(['surrender', 'hit']);
    expect(decode('P')).toEqual(['split', 'hit']);
    expect(decode('Ps')).toEqual(['split', 'stand']);
    expect(decode('Prh')).toEqual(['split', 'surrender', 'hit']);
  });

  it('folds exactly the ten-value ranks onto the chart 10 column', () => {
    for (const rank of RANKS) {
      expect(chartRank(rank) === '10').toBe(isTenValue(rank));
    }
    expect(new Set(RANKS.map(chartRank)).size).toBe(UP_CARD_COUNT);
  });
});

// ---------------------------------------------------------------------------
// The criterion itself
// ---------------------------------------------------------------------------

describe('J3: every cell of every combination equals the committed chart', () => {
  it('sweeps 3,040 cells and finds no disagreement', () => {
    let swept = 0;
    for (const combination of CHART_COMBINATIONS) {
      const result = sweep(strategyTable(rulesFor(combination)), combination);
      expect({ combination: nameOf(combination), mismatches: result.mismatches }).toEqual({
        combination: nameOf(combination),
        mismatches: [],
      });
      expect(result.cells).toBe(CELLS_PER_TABLE);
      swept += result.cells;
    }
    expect(swept).toBe(SWEPT_CELLS);
  });

  it('records that the 6-deck and 8-deck tables are identical, cell for cell', () => {
    // Not an axis that moves. Published basic strategy for S17 groups 4 to 8
    // decks under one chart and the two reference charts came out identical, so
    // this asserts the finding rather than hiding it behind a sweep that would
    // pass either way. The DAS axis below is what carries SPEC 7's sentence.
    for (const doubleAfterSplit of [true, false]) {
      for (const surrender of [true, false]) {
        const six = strategyTable(houseRules({ decks: 6, doubleAfterSplit, surrender }));
        const eight = strategyTable(houseRules({ decks: 8, doubleAfterSplit, surrender }));
        for (const total of CHART_HARD_TOTALS) {
          for (const up of CHART_COLUMNS) {
            expect(six.hard(total, up)).toEqual(eight.hard(total, up));
          }
        }
        for (const total of CHART_SOFT_TOTALS) {
          for (const up of CHART_COLUMNS) {
            expect(six.soft(total, up)).toEqual(eight.soft(total, up));
          }
        }
        for (const pair of CHART_PAIRS) {
          for (const up of CHART_COLUMNS) {
            expect(six.pair(pair, up)).toEqual(eight.pair(pair, up));
          }
        }
      }
    }
  });

  it('ends every preference list in an action a live hand can always take', () => {
    for (const combination of CHART_COMBINATIONS) {
      const table = strategyTable(rulesFor(combination));
      const cells: PreferenceList[] = [];
      for (const total of HARD_TOTALS) {
        for (const up of UP_CARDS) {
          cells.push(table.hard(total, up));
        }
      }
      for (const total of SOFT_TOTALS) {
        for (const up of UP_CARDS) {
          cells.push(table.soft(total, up));
        }
      }
      for (const pair of PAIR_RANKS) {
        for (const up of UP_CARDS) {
          cells.push(table.pair(pair, up));
        }
      }
      expect(cells.length).toBe(CELLS_PER_TABLE);
      for (const cell of cells) {
        expect(cell.length).toBeGreaterThan(0);
        expect(['hit', 'stand']).toContain(cell[cell.length - 1]);
        expect(new Set(cell).size).toBe(cell.length);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The negative controls. Each wrong generator must disagree on exactly its own
// derived set of cells and nowhere else.
// ---------------------------------------------------------------------------

describe('J3: a wrong generator is caught, on exactly the cells it gets wrong', () => {
  it('a generator with DAS inverted disagrees on exactly the seven pair cells', () => {
    for (const combination of CHART_COMBINATIONS) {
      const inverted = strategyTable(
        houseRules({
          decks: combination.decks,
          doubleAfterSplit: !combination.doubleAfterSplit,
          surrender: combination.surrender,
        }),
      );
      const result = sweep(inverted, combination);
      expect(cellsOf(result.mismatches)).toEqual([...DAS_CELLS].sort());
      expect(result.cells).toBe(CELLS_PER_TABLE);
    }
  });

  it('a generator that ignores surrender disagrees on exactly the seven surrender cells', () => {
    for (const combination of CHART_COMBINATIONS) {
      const real = strategyTable(rulesFor(combination));
      const result = sweep(withoutSurrender(real), combination);
      expect(cellsOf(result.mismatches)).toEqual(
        combination.surrender ? [...SURRENDER_CELLS].sort() : [],
      );
      expect(result.cells).toBe(CELLS_PER_TABLE);
    }
  });

  it('the two wrong sets are disjoint, so neither control could stand in for the other', () => {
    expect(DAS_CELLS.length).toBe(7);
    expect(SURRENDER_CELLS.length).toBe(7);
    expect(DAS_CELLS.filter((cell) => SURRENDER_CELLS.includes(cell))).toEqual([]);
  });
});

/**
 * A generator that emits the right rule set and then drops surrender from every
 * list, which is the failure a rule-flipping control cannot reach.
 */
function withoutSurrender(table: StrategyTable): Lookup {
  const strip = (cell: PreferenceList): readonly string[] =>
    cell.filter((action) => action !== 'surrender');
  return {
    hard: (total, up): readonly string[] => strip(table.hard(total, up)),
    soft: (total, up): readonly string[] => strip(table.soft(total, up)),
    pair: (pair, up): readonly string[] => strip(table.pair(pair, up)),
  };
}

// ---------------------------------------------------------------------------
// Building a situation the coach can be asked about
// ---------------------------------------------------------------------------

const SPADES = 'spades' as const;

/** One card, in a suit nothing in this game reads. `cards.ts` says why. */
function held(rank: Rank): Card {
  return card(rank, SPADES);
}

/** Cards from rank labels, in the order the hand holds them. */
function hand(...ranks: readonly Rank[]): readonly Card[] {
  return ranks.map(held);
}

const ROUND_WAGER: ChipDenomination = 10;

/** One hand, built rather than dealt, the way `split.test.ts` builds one. */
function handOf(
  overrides: Partial<HandInPlay> & { readonly cards: HandInPlay['cards'] },
): HandInPlay {
  return Object.freeze({
    wager: ROUND_WAGER,
    state: 'live' as const,
    fromSplit: false,
    fromSplitAces: false,
    walletHand: 0,
    ...overrides,
  });
}

/** One decision in front of the coach. Chips default to plenty. */
function situationOf(
  cards: readonly Card[],
  up: Rank,
  overrides: {
    readonly hand?: Partial<HandInPlay>;
    readonly splits?: number;
    readonly chips?: number;
  } = {},
): CoachSituation {
  return Object.freeze({
    hand: handOf({ cards, ...overrides.hand }),
    up,
    splits: overrides.splits ?? 0,
    chips: overrides.chips ?? 1000,
  });
}

/** The default table, which is SPEC 4.1, 4.6, 4.7 and 4.8's defaults. */
function defaultTable(): StrategyTable {
  return strategyTable(houseRules());
}

function advised(table: StrategyTable, situation: CoachSituation): CoachAction | null {
  return recommend(table, situation)?.action ?? null;
}

// ---------------------------------------------------------------------------
// DESIGN section 7: the walk down to the first legal action
// ---------------------------------------------------------------------------

describe('J3: the preference list is walked down to the first legal action', () => {
  const table = defaultTable();

  it('doubles a hard 11 on two cards and hits the same total on three', () => {
    expect(table.hard(11, '6')).toEqual(['double', 'hit']);
    expect(advised(table, situationOf(hand('5', '6'), '6'))).toBe('double');
    expect(advised(table, situationOf(hand('4', '3', '4'), '6'))).toBe('hit');
  });

  it('hits a hard 11 the balance cannot double, and doubles it at exactly the wager', () => {
    // SPEC 4.5's "chips available >= the hand's wager", at the boundary and one
    // chip under it. A wager of 10 needs 10 more, not 9.
    expect(advised(table, situationOf(hand('5', '6'), '6', { chips: ROUND_WAGER }))).toBe(
      'double',
    );
    expect(advised(table, situationOf(hand('5', '6'), '6', { chips: ROUND_WAGER - 1 }))).toBe(
      'hit',
    );
    expect(advised(table, situationOf(hand('5', '6'), '6', { chips: 0 }))).toBe('hit');
  });

  it('stands rather than hits when a Ds cell cannot be doubled', () => {
    // Soft 18 against a 5: `['double', 'stand']`. On three cards the double is
    // gone and the answer is stand, not the hit a `['double', 'hit']` cell
    // would fall to.
    expect(table.soft(18, '5')).toEqual(['double', 'stand']);
    expect(advised(table, situationOf(hand('A', '7'), '5'))).toBe('double');
    expect(advised(table, situationOf(hand('A', '4', '3'), '5'))).toBe('stand');
  });

  it('hits a hard 11 from a split when Double after split is off', () => {
    const dasOff = strategyTable(houseRules({ doubleAfterSplit: false }));
    const fromSplit = { hand: { fromSplit: true } };
    expect(advised(table, situationOf(hand('5', '6'), '6', fromSplit))).toBe('double');
    expect(advised(dasOff, situationOf(hand('5', '6'), '6', fromSplit))).toBe('hit');
  });

  it('surrenders a hard 16 on two cards and hits it after a hit or a split', () => {
    expect(table.hard(16, '10')).toEqual(['surrender', 'hit']);
    expect(advised(table, situationOf(hand('10', '6'), '10'))).toBe('surrender');
    expect(advised(table, situationOf(hand('10', '4', '2'), '10'))).toBe('hit');
    expect(
      advised(table, situationOf(hand('10', '6'), '10', { hand: { fromSplit: true } })),
    ).toBe('hit');
  });

  it('never offers surrender at all when the SPEC 4.8 toggle is off', () => {
    const noSurrender = strategyTable(houseRules({ surrender: false }));
    expect(noSurrender.hard(16, '10')).toEqual(['hit']);
    expect(advised(noSurrender, situationOf(hand('10', '6'), '10'))).toBe('hit');
    for (const total of HARD_TOTALS) {
      for (const up of UP_CARDS) {
        expect(noSurrender.hard(total, up)).not.toContain('surrender');
      }
    }
  });

  it('walks a pair cell to its tail when the split cannot be funded or taken', () => {
    // 8,8 against a 10 is `['split', 'surrender', 'hit']`. Each refusal moves
    // the answer one place down, and every one of the three is reachable.
    expect(table.pair('8', '10')).toEqual(['split', 'surrender', 'hit']);
    expect(advised(table, situationOf(hand('8', '8'), '10'))).toBe('split');
    expect(advised(table, situationOf(hand('8', '8'), '10', { chips: 0 }))).toBe('surrender');
    expect(
      advised(
        table,
        situationOf(hand('8', '8'), '10', { chips: 0, hand: { fromSplit: true } }),
      ),
    ).toBe('hit');
    expect(
      advised(table, situationOf(hand('8', '8'), '10', { splits: 3, hand: { fromSplit: true } })),
    ).toBe('hit');
  });

  it('walks A,A to soft 12 and 2,2 to hard 4 when the split is refused', () => {
    expect(table.pair('A', '6')).toEqual(['split', 'hit']);
    expect(table.soft(LOWEST_SOFT_TOTAL, '6')).toEqual(['hit']);
    expect(advised(table, situationOf(hand('A', 'A'), '6', { chips: 0 }))).toBe('hit');
    expect(table.hard(LOWEST_HARD_TOTAL, '6')).toEqual(['hit']);
    expect(advised(table, situationOf(hand('2', '2'), '6', { chips: 0 }))).toBe('hit');
  });

  it('has nothing to recommend on a split Ace hand, and says so with a value', () => {
    // SPEC 4.6 stands a split Ace hand automatically, so it is never the active
    // hand, and SPEC 4.5 forbids the hit every list would otherwise end on.
    const splitAces = { hand: { fromSplit: true, fromSplitAces: true } };
    expect(recommend(table, situationOf(hand('A', 'A'), '6', splitAces))).toBeNull();
    expect(recommend(table, situationOf(hand('A', '5'), '4', splitAces))).toBeNull();
  });

  it('has nothing to recommend on a hand that is no longer live', () => {
    for (const state of ['stood', 'bust', 'doubled', 'surrendered', 'blackjack'] as const) {
      expect(recommend(table, situationOf(hand('10', '9', '5'), '6', { hand: { state } }))).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// The legality the coach reads, and where it comes from
// ---------------------------------------------------------------------------

describe('J3: the coach reads legality from the machine, not from a second reading', () => {
  const table = defaultTable();

  it('agrees with the wallet about which doubles and splits the balance funds', () => {
    // Gold, because its 2,000 maximum is the only one that lets a wager reach
    // half the bankroll and put the boundary inside the test.
    for (const wager of [100, 500, 510, 1000]) {
      const wallet = fundedWallet(wager);
      const chips = wallet.readout().chips;

      const doubling = situationOf(hand('9', '2'), '6', { chips, hand: { wager } });
      const coachDoubles = legal('double', table, doubling);
      expect(coachDoubles).toBe(wallet.commitDouble(0).ok);

      const splitting = fundedWallet(wager);
      const splittable = situationOf(hand('8', '8'), '6', {
        chips: splitting.readout().chips,
        hand: { wager },
      });
      expect(legal('split', table, splittable)).toBe(splitting.commitSplit(0).ok);
    }
  });

  it('finds the boundary where the wallet finds it, and not one chip away', () => {
    const halfBankroll = fundedWallet(500);
    expect(halfBankroll.readout().chips).toBe(500);
    expect(legal('double', table, situationOf(hand('9', '2'), '6', { chips: 500, hand: { wager: 500 } }))).toBe(
      true,
    );
    expect(legal('double', table, situationOf(hand('9', '2'), '6', { chips: 499, hand: { wager: 500 } }))).toBe(
      false,
    );
  });

  it('refuses every action on a split Ace hand, as SPEC 4.5 and 4.6 do', () => {
    const situation = situationOf(hand('A', 'A'), '6', {
      hand: { fromSplit: true, fromSplitAces: true },
    });
    expect(legal('hit', table, situation)).toBe(false);
    expect(legal('double', table, situation)).toBe(false);
    expect(legal('split', table, situation)).toBe(false);
    expect(legal('stand', table, situation)).toBe(true);
  });

  it('counts the split cap of SPEC 4.6 across the round, as the machine does', () => {
    const pair = hand('8', '8');
    expect(legal('split', table, situationOf(pair, '6', { splits: 2 }))).toBe(true);
    expect(legal('split', table, situationOf(pair, '6', { splits: 3 }))).toBe(false);
  });
});

/** A wallet that has committed one wager at Gold, so a balance is left over. */
function fundedWallet(wager: number): Wallet {
  const wallet = createWallet({ bestBalance: 10000 });
  const gold = tableLimits('gold');
  let left = wager;
  for (const chip of [500, 100, 50, 10] as const) {
    while (left >= chip) {
      if (!wallet.tap(chip, gold).ok) {
        throw new Error(`a ${String(chip)} chip was refused while building ${String(wager)}`);
      }
      left -= chip;
    }
  }
  if (left !== 0) {
    throw new Error(`${String(wager)} is not a wager SPEC 4.11's chips can build`);
  }
  if (!wallet.commitInitial(gold).ok) {
    throw new Error(`the wallet refused a ${String(wager)} commit`);
  }
  return wallet;
}

// ---------------------------------------------------------------------------
// SPEC 7: the equal-value and equal-rank toggle changes no recommendation
// ---------------------------------------------------------------------------

describe('J3: the split comparison of SPEC 4.6 changes no recommendation', () => {
  it('answers identically under equalValue and equalRank, on every two-card holding', () => {
    const byValue = strategyTable(houseRules({ splitRule: 'equalValue' }));
    const byRank = strategyTable(houseRules({ splitRule: 'equalRank' }));
    let holdings = 0;
    for (const first of RANKS) {
      for (const second of RANKS) {
        for (const up of RANKS) {
          const situation = situationOf(hand(first, second), up);
          expect(advised(byValue, situation)).toBe(advised(byRank, situation));
          holdings += 1;
        }
      }
    }
    // 13 ranks squared, against all 13 dealt up cards.
    expect(holdings).toBe(RANKS.length ** 3);
  });

  it('routes a ten-value pair of different ranks to a cell that stands either way', () => {
    const byValue = strategyTable(houseRules({ splitRule: 'equalValue' }));
    const byRank = strategyTable(houseRules({ splitRule: 'equalRank' }));
    const kingJack = hand('K', 'J');
    expect(byValue.cellFor(kingJack, '6').address).toEqual({
      surface: 'pair',
      pair: '10',
      up: '6',
    });
    expect(byRank.cellFor(kingJack, '6').address).toEqual({
      surface: 'hard',
      total: 20,
      up: '6',
    });
    expect(byValue.cellFor(kingJack, '6').preference).toEqual(['stand']);
    expect(byRank.cellFor(kingJack, '6').preference).toEqual(['stand']);
  });
});

// ---------------------------------------------------------------------------
// The lookup surfaces are total over what a hand can hold, and loud otherwise
// ---------------------------------------------------------------------------

describe('J3: the surfaces answer every holding a live hand can reach', () => {
  const table = defaultTable();

  it('routes every two-card and three-card holding to a published cell', () => {
    let holdings = 0;
    for (const first of RANKS) {
      for (const second of RANKS) {
        for (const up of RANKS) {
          expect(table.cellFor(hand(first, second), up).preference.length).toBeGreaterThan(0);
          holdings += 1;
        }
      }
    }
    for (const first of RANKS) {
      for (const second of RANKS) {
        for (const third of RANKS) {
          const cards = hand(first, second, third);
          if (handValue(cards).total > 21) {
            continue;
          }
          expect(table.cellFor(cards, '6').preference.length).toBeGreaterThan(0);
          holdings += 1;
        }
      }
    }
    expect(holdings).toBeGreaterThan(RANKS.length ** 3);
  });

  it('throws on a row outside the published domain, rather than guessing', () => {
    expect(() => table.hard(3, '6')).toThrow(RangeError);
    expect(() => table.hard(22, '6')).toThrow(RangeError);
    expect(() => table.soft(11, '6')).toThrow(RangeError);
    expect(() => table.soft(22, '6')).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// The committed chart is a second implementation, and stays one
// ---------------------------------------------------------------------------

describe('J3: the reference chart shares no declaration with what it checks', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./reference/basic-strategy-charts.ts', import.meta.url)),
    'utf8',
  );

  /**
   * The comment strip `payout-integrality.test.ts` uses, and for its reason.
   * Most of that file's header is prose explaining why it imports nothing from
   * `src/`, and a scan that went red on the explanation would be switched off
   * inside a week.
   */
  function withoutComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('imports nothing at all, so it cannot share a misreading', () => {
    // The claim behind the whole item. A chart that reached into `src/` for a
    // type, a constant or a rank list would agree with the generator on
    // whatever it borrowed, and the sweep would stop proving anything about it.
    const code = withoutComments(source);
    expect(code).toContain('export function referenceHard');
    expect(code).not.toMatch(/\bimport\b/);
    expect(code).not.toContain('src/');
  });

  it('spells the actions the same way the module does, which is asserted not assumed', () => {
    const table = defaultTable();
    expect([...table.hard(11, '6')]).toEqual([...decode('D')]);
    expect([...table.soft(18, '5')]).toEqual([...decode('Ds')]);
    expect([...table.pair('8', '10')]).toEqual([...decode('Prh')]);
  });

  it('is not imported by the machine, so no action can be routed through the coach', () => {
    // SPEC 7: the coach "never blocks an action". The seeded transcript below
    // proves it behaviourally; this proves it structurally, and it is the
    // cheaper of the two to keep true. `table.ts` names the coach in prose,
    // which is why the comments come off first.
    const machine = withoutComments(
      readFileSync(
        fileURLToPath(new URL('../../src/core/table.ts', import.meta.url)),
        'utf8',
      ),
    );
    expect(machine).toContain('export function createTable');
    expect(machine).not.toContain('strategy');
  });
});

// ---------------------------------------------------------------------------
// The coach hands out nothing a caller could edit underneath it
// ---------------------------------------------------------------------------

describe('J3: everything the coach publishes is frozen', () => {
  const rules = houseRules();
  const table = strategyTable(rules);

  it('keeps the record it was generated from rather than a copy of it', () => {
    expect(table.rules).toBe(rules);
  });

  it('freezes every cell, so a caller cannot splice a preference list', () => {
    expect(Object.isFrozen(table.hard(11, '6'))).toBe(true);
    expect(Object.isFrozen(table.soft(18, '5'))).toBe(true);
    expect(Object.isFrozen(table.pair('8', '10'))).toBe(true);
    expect(Object.isFrozen(table.cellFor(hand('8', '8'), '10'))).toBe(true);
  });

  it('freezes the situation it reads off the readout, and what it concludes', () => {
    const round = splitRound();
    const situation = situationAt(round.readout());
    expect(situation).not.toBeNull();
    expect(Object.isFrozen(situation)).toBe(true);
    if (situation !== null) {
      expect(Object.isFrozen(recommend(table, situation))).toBe(true);
    }
    expect(Object.isFrozen(NO_DECISIONS)).toBe(true);
    expect(Object.isFrozen(recordDecision(NO_DECISIONS, true))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SPEC 7's three modes and the accuracy behind them
// ---------------------------------------------------------------------------

describe('J3: the modes and the accuracy counters of SPEC 7', () => {
  const table = defaultTable();
  const situation = situationOf(hand('10', '6'), '10');

  it('is off by default', () => {
    expect(DEFAULT_COACH_MODE).toBe('off');
  });

  it('offers exactly the three modes SPEC 7 names, and defaults to one of them', () => {
    expect([...COACH_MODES]).toEqual(['off', 'hint', 'review']);
    expect(COACH_MODES).toContain(DEFAULT_COACH_MODE);
    expect(new Set(COACH_MODES).size).toBe(COACH_MODES.length);
    for (const mode of COACH_MODES) {
      // Hint mode is the only one that highlights, and Off is the only one
      // that counts nothing. Driven from the published list rather than from
      // three literals, so a fourth mode could not arrive untested.
      expect(hint(mode, table, situation) === null).toBe(mode !== 'hint');
      expect(observe(mode, NO_DECISIONS, table, situation, 'hit').record.session.decisions).toBe(
        mode === 'off' ? 0 : 1,
      );
    }
  });

  it('hints only in hint mode', () => {
    expect(hint('off', table, situation)).toBeNull();
    expect(hint('review', table, situation)).toBeNull();
    expect(hint('hint', table, situation)?.action).toBe('surrender');
  });

  it('compares what was played against what was recommended', () => {
    const matched = compare(table, situation, 'surrender');
    expect(matched?.matched).toBe(true);
    expect(matched?.recommended).toBe('surrender');
    const missed = compare(table, situation, 'hit');
    expect(missed?.matched).toBe(false);
    expect(missed?.played).toBe('hit');
    expect(missed?.recommended).toBe('surrender');
    expect(missed?.preference).toEqual(['surrender', 'hit']);
  });

  it('counts nothing at all while the coach is off', () => {
    const seen = observe('off', NO_DECISIONS, table, situation, 'hit');
    expect(seen.record).toBe(NO_DECISIONS);
    expect(seen.verdict).toBeNull();
  });

  it('counts a decision into both scopes at once', () => {
    let record: CoachRecord = NO_DECISIONS;
    record = observe('review', record, table, situation, 'surrender').record;
    record = observe('review', record, table, situation, 'hit').record;
    record = observe('hint', record, table, situation, 'surrender').record;
    expect(record.session).toEqual({ decisions: 3, matched: 2 });
    expect(record.lifetime).toEqual({ decisions: 3, matched: 2 });
  });

  it('reports no percentage before the first decision, and one after', () => {
    expect(accuracy(NO_DECISIONS.session)).toBeNull();
    expect(accuracy({ decisions: 4, matched: 3 })).toBe(75);
    expect(accuracy({ decisions: 3, matched: 0 })).toBe(0);
  });

  it('restarts the session counters and keeps the lifetime ones', () => {
    let record: CoachRecord = NO_DECISIONS;
    record = observe('review', record, table, situation, 'surrender').record;
    record = observe('review', record, table, situation, 'hit').record;
    const next = openSession(record);
    expect(next.session).toEqual({ decisions: 0, matched: 0 });
    expect(next.lifetime).toEqual({ decisions: 2, matched: 1 });
    expect(accuracy(next.session)).toBeNull();
    expect(accuracy(next.lifetime)).toBe(50);
  });

  it('counts the five hand actions as decisions and nothing else', () => {
    const decisions: readonly IntentKind[] = ['hit', 'stand', 'double', 'split', 'surrender'];
    for (const intent of decisions) {
      expect(actionOf(intent)).toBe(intent);
    }
    const others: readonly IntentKind[] = [
      'chooseTable',
      'start',
      'tapChip',
      'clear',
      'repeat',
      'max',
      'changeTable',
      'deal',
      'takeInsurance',
      'declineInsurance',
      'nextHand',
      'dropTable',
      'resetBankroll',
    ];
    for (const intent of others) {
      expect(actionOf(intent)).toBeNull();
    }
    expect(decisions.length + others.length).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// Driving the real machine
// ---------------------------------------------------------------------------

/** SPEC 5: one deal interval pays for exactly one card. */
const TICK = TIMINGS.dealInterval;

/** Bounded, for the reason `wallet.test.ts` gives: a stall must fail loudly. */
const LOOP_LIMIT = 40000;

function bounded(label: string): () => void {
  let turns = 0;
  return () => {
    turns += 1;
    if (turns > LOOP_LIMIT) {
      throw new RangeError(`${label} did not finish inside ${String(LOOP_LIMIT)} turns`);
    }
  };
}

function accept(table: Table, intent: Parameters<Table['apply']>[0]): void {
  const result = table.apply(intent);
  if (!result.ok) {
    throw new Error(`${intent.kind} was refused by ${result.layer} as ${result.reason}`);
  }
}

/**
 * One move, chosen from the readout alone.
 *
 * **Nothing here consults the coach.** The two runs of a session have to issue
 * the same intents in the same order for the comparison to mean anything, so
 * the policy reads only what the machine publishes. Splitting and doubling are
 * both in it deliberately: a coach that wrote to table state would show up
 * first on the paths that spend money.
 */
function playerMove(table: Table, state: TableReadout): IntentKind {
  const { phase } = state;
  if (phase.kind !== 'playerTurn') {
    throw new Error(`the machine is at ${phase.kind}, not the player turn`);
  }
  const active = state.hands[phase.activeHand];
  if (active === undefined) {
    throw new Error(`there is no hand ${String(phase.activeHand)} to play`);
  }
  const total = handValue(active.cards).total;
  if (state.splits < 2 && table.apply({ kind: 'split' }).ok) {
    return 'split';
  }
  if ((total === 10 || total === 11) && table.apply({ kind: 'double' }).ok) {
    return 'double';
  }
  if (total < 17) {
    accept(table, { kind: 'hit' });
    return 'hit';
  }
  accept(table, { kind: 'stand' });
  return 'stand';
}

/** One step of a session: an intent if the phase offers one, else a tick. */
function step(table: Table, state: TableReadout): IntentKind | null {
  switch (state.phase.kind) {
    case 'start':
      accept(table, { kind: 'start' });
      return 'start';
    case 'betting':
      if (state.wallet.wager === 0) {
        accept(table, { kind: 'tapChip', chip: ROUND_WAGER });
        return 'tapChip';
      }
      accept(table, { kind: 'deal' });
      return 'deal';
    case 'insurance':
      // Deterministic, and identical in both runs: every third round takes it,
      // so SPEC 4.7's stake, its deferral and its settlement are all on the
      // path the transcript covers.
      if (state.rounds % 3 === 0 && table.apply({ kind: 'takeInsurance' }).ok) {
        return 'takeInsurance';
      }
      accept(table, { kind: 'declineInsurance' });
      return 'declineInsurance';
    case 'playerTurn':
      return playerMove(table, state);
    case 'roundResult':
      accept(table, { kind: 'nextHand' });
      return 'nextHand';
    default:
      table.update(TICK);
      return null;
  }
}

interface Session {
  readonly steps: readonly string[];
  readonly advice: number;
  readonly record: CoachRecord;
}

/** How many rounds a seeded session plays before the transcripts are compared. */
const SESSION_ROUNDS = 120;

/**
 * Play one seeded session, with the coach watching or not watching.
 *
 * The transcript is the whole readout at every step, serialised: the phase and
 * its payload, every hand and every card, the dealer's visible cards, the
 * timers, the shoe's counters and the wallet's four-term identity. If the coach
 * so much as advanced a timer, two of these would differ.
 */
function playSession(seed: number, coachOn: boolean): Session {
  const table = createTable({ seed });
  const strategy = strategyTable(table.readout().rules);
  const steps: string[] = [JSON.stringify(table.readout())];
  let record: CoachRecord = NO_DECISIONS;
  let advice = 0;
  const turn = bounded(`a ${String(SESSION_ROUNDS)} round seeded session`);

  while (table.readout().rounds < SESSION_ROUNDS) {
    turn();
    const state = table.readout();
    if (state.phase.kind === 'bustOut') {
      break;
    }
    const situation = coachOn ? situationAt(state) : null;
    if (situation !== null && hint('hint', strategy, situation) !== null) {
      advice += 1;
    }
    const played = step(table, state);
    const action = played === null ? null : actionOf(played);
    if (situation !== null && action !== null) {
      record = observe('review', record, strategy, situation, action).record;
    }
    steps.push(JSON.stringify(table.readout()));
  }

  return { steps, advice, record };
}

describe('J3: turning the coach on cannot change a single gameplay outcome', () => {
  const seed = 20260823;
  const withCoach = playSession(seed, true);
  const withoutCoach = playSession(seed, false);

  it('plays a seeded session identically, step for step', () => {
    expect(withCoach.steps.length).toBe(withoutCoach.steps.length);
    expect(withCoach.steps).toEqual(withoutCoach.steps);
  });

  it('ends on the same readout, down to the wallet identity and the shoe', () => {
    expect(withCoach.steps[withCoach.steps.length - 1]).toBe(
      withoutCoach.steps[withoutCoach.steps.length - 1],
    );
  });

  it('played a session long enough for the comparison to mean something', () => {
    expect(withCoach.steps.length).toBeGreaterThan(1000);
  });

  it('really did run the coach, on hundreds of decisions', () => {
    // Without this the test above would pass just as well against a coach that
    // did nothing at all, which is the one way it could be vacuous.
    expect(withCoach.advice).toBeGreaterThan(100);
    expect(withCoach.record.session.decisions).toBeGreaterThan(100);
    expect(withCoach.record.lifetime.decisions).toBe(withCoach.record.session.decisions);
    expect(accuracy(withCoach.record.session)).not.toBeNull();
  });

  it('counted nothing on the run where the coach was off', () => {
    expect(withoutCoach.advice).toBe(0);
    expect(withoutCoach.record).toBe(NO_DECISIONS);
  });

  it('produces a different transcript from a different seed, so the comparison bites', () => {
    const other = playSession(seed + 1, false);
    expect(other.steps).not.toEqual(withoutCoach.steps);
  });
});

// ---------------------------------------------------------------------------
// Reading the machine's own readout
// ---------------------------------------------------------------------------

describe('J3: the coach reads the situation off the published readout', () => {
  it('answers nothing on every phase that is not the player turn', () => {
    const table = createTable({ seed: 5 });
    const seen = new Set<string>();
    const turn = bounded('collecting one round of phases');
    while (table.readout().rounds < 2) {
      turn();
      const state = table.readout();
      seen.add(state.phase.kind);
      if (state.phase.kind !== 'playerTurn') {
        expect(situationAt(state)).toBeNull();
      } else {
        expect(situationAt(state)).not.toBeNull();
      }
      if (state.phase.kind === 'bustOut') {
        break;
      }
      step(table, state);
    }
    expect(seen.has('playerTurn')).toBe(true);
    expect(seen.size).toBeGreaterThan(4);
  });

  it('reads the active hand of SPEC 4.6 and not the first one', () => {
    // 8,8 against a 6, split into two hands that hold different cards, so a
    // coach that read `hands[0]` would be visibly looking at the wrong hand.
    const table = splitRound();
    const first = table.readout();
    expect(first.hands.length).toBe(2);
    expect(activeIndex(first)).toBe(0);
    accept(table, { kind: 'stand' });
    settleToPlayerTurn(table);

    const second = table.readout();
    expect(activeIndex(second)).toBe(1);
    const situation = situationAt(second);
    expect(situation).not.toBeNull();
    expect(situation?.hand).toEqual(second.hands[1]);
    expect(situation?.hand).not.toEqual(second.hands[0]);
    expect(situation?.up).toBe('6');
    expect(situation?.splits).toBe(1);
    expect(situation?.chips).toBe(second.wallet.chips);
  });
});

function activeIndex(state: TableReadout): number {
  return state.phase.kind === 'playerTurn' ? state.phase.activeHand : -1;
}

function settleToPlayerTurn(table: Table): void {
  const turn = bounded('driving the machine back to the player turn');
  while (!['playerTurn', 'roundResult'].includes(table.readout().phase.kind)) {
    turn();
    table.update(TICK);
  }
}

/**
 * A round that splits 8,8 against a 6 and leaves two hands holding different
 * cards. The dealer's hole card is a 10, which no peek is taken behind on a 6.
 */
function splitRound(): Table {
  const table = createTable({
    shoe: scriptedShoe(['8', '6', '8', '10', '2', '9', '10', '10', '10']),
  });
  accept(table, { kind: 'start' });
  accept(table, { kind: 'tapChip', chip: ROUND_WAGER });
  accept(table, { kind: 'deal' });
  settleToPlayerTurn(table);
  accept(table, { kind: 'split' });
  settleToPlayerTurn(table);
  return table;
}
