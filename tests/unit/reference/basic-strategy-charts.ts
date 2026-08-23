/**
 * The committed basic strategy reference charts. Item `J3`.
 *
 * **This file must not import anything from `src/`, and it must never ship.**
 * SPEC 7 and DESIGN section 7 both require it: "the generated table is verified
 * cell by cell against a committed reference chart", and "the chart is data in
 * the test tree, never in the bundle, so the shipped game carries the generator
 * only". It sits beside `hand-evaluator.ts`, which is the same discipline
 * applied to SPEC 4.2, and for the same reason. A chart produced by running the
 * generator and pasting its output agrees with the generator's misreading
 * forever, which is precisely the failure `tests/unit/reference/` exists to
 * prevent.
 *
 * ## How these charts were derived
 *
 * By hand, from standard published basic strategy for a shoe of 4 to 8 decks
 * with the dealer standing on soft 17, which is the game SPEC 4 describes: SPEC
 * 4.1 fixes the shoe at 6 or 8 decks, SPEC 4.9 fixes S17 by name and rejects the
 * hit-soft-17 variant, SPEC 4.10 pays a natural at 3:2, SPEC 4.6 permits
 * resplitting to four hands, and SPEC 4.8 offers late surrender. They were
 * written out as the grids below before `src/core/strategy.ts` was compared
 * against them, and no cell here was copied from that file or from its output.
 *
 * Rank labels, action names and the token vocabulary are plain strings, not the
 * game's `Rank`, `CoachAction` or `ChartRank` types, so this file shares no
 * declaration with the code it is checking.
 *
 * ## The eight combinations, and the axis that turns out flat
 *
 * SPEC 7 fixes the rule set at 8: shoe size 6 or 8, crossed with DAS on or off,
 * crossed with surrender on or off. All eight are enumerated below and all eight
 * are swept.
 *
 * **The 6-deck and 8-deck charts came out identical, cell for cell.** That is
 * the correct answer and not a gap in the work: published basic strategy for
 * S17 groups 4 through 8 decks under one chart because the total-dependent play
 * does not change across that range, and the two were written out separately
 * here before being compared. `CHART_DECKS` still carries both and the sweep
 * still runs both, so a generator that grew a wrong deck branch would be caught;
 * what the axis does not do is differ.
 *
 * **Two documents say otherwise, and both are left exactly as written**, because
 * a spec is not edited to fit an implementation and because editing one of a
 * matched pair is how the two come apart:
 *
 *   1. `BlackJack/SPEC.md` section 7: "Changing shoe size or turning DAS off
 *      changes some recommendations."
 *   2. `BlackJack/DESIGN.md` section 7: "because the correct action genuinely
 *      changes with shoe size, DAS availability and surrender availability".
 *
 * Each is satisfied through the DAS axis, which does move seven cells. The
 * shoe-size half of each is a finding for the user, to be resolved in one
 * approved edit that touches both homes.
 *
 * The two axes that do move cells move them here:
 *
 *   - **DAS**, on seven pair cells: 2,2 and 3,3 against a 2 and a 3, 4,4 against
 *     a 5 and a 6, and 6,6 against a 2.
 *   - **Surrender**, on seven cells that are all one of two hard totals: 15
 *     against a 10, 16 against a 9, a 10 and an Ace, and the three 8,8 cells
 *     whose fall-through is that same hard 16.
 *
 * ## The token vocabulary
 *
 * The abbreviations published charts print, expanded into the preference lists
 * DESIGN section 7 asks for. A pair token carries its own fall-through, which is
 * what that holding is worth on the hard or soft surface when SPEC 4.6 will not
 * allow the split.
 */

/** One cell as a published chart abbreviates it. */
export type ChartToken =
  /** Hit. */
  | 'H'
  /** Stand. */
  | 'S'
  /** Double if the hand allows it, otherwise hit. */
  | 'D'
  /** Double if the hand allows it, otherwise stand, not hit. */
  | 'Ds'
  /** Surrender if the house and the hand allow it, otherwise hit. */
  | 'Rh'
  /** Split if it can be funded and taken, otherwise hit. */
  | 'P'
  /** Split if it can be funded and taken, otherwise stand. */
  | 'Ps'
  /** Split, otherwise surrender, otherwise hit. */
  | 'Prh';

/** What each abbreviation means, spelled out as the actions to try in order. */
const MEANING: Readonly<Record<ChartToken, readonly string[]>> = {
  H: ['hit'],
  S: ['stand'],
  D: ['double', 'hit'],
  Ds: ['double', 'stand'],
  Rh: ['surrender', 'hit'],
  P: ['split', 'hit'],
  Ps: ['split', 'stand'],
  Prh: ['split', 'surrender', 'hit'],
};

/**
 * Expand one abbreviation into the actions to try, best first.
 *
 * The grids below are typed as lists of `ChartToken`, so a typo in a cell is a
 * compile error rather than something this has to catch at run time. The test
 * asserts every one of these eight expansions by hand, which is the only place
 * the vocabulary itself is checked.
 */
export function decode(token: ChartToken): readonly string[] {
  return MEANING[token];
}

// ---------------------------------------------------------------------------
// The axes
// ---------------------------------------------------------------------------

/** The ten dealer up cards, low to high with the Ace last, as charts print. */
export const CHART_COLUMNS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'A',
] as const;

/** One dealer up card column. */
export type ChartColumn = (typeof CHART_COLUMNS)[number];

/** The ten pair rows, the Ace first. */
export const CHART_PAIRS = [
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
] as const;

/** One pair row. */
export type ChartPair = (typeof CHART_PAIRS)[number];

/**
 * The hard totals a hand can hold, 4 through 21.
 *
 * 4 is 2,2 and 5 is 2,3; three cards cannot make a hard total under 6. The top
 * of the range is 21, which SPEC 4.5 stands automatically, so the row is never
 * consulted in play and is here because a lookup surface with a hole in it
 * throws on a hand the game can hold.
 */
export const CHART_HARD_TOTALS = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
] as const;

/**
 * The soft totals a hand of two or more cards can hold, 12 through 21.
 *
 * Soft 12 is A,A and nothing else; a lone Ace is soft 11 and one card is never
 * a decision.
 */
export const CHART_SOFT_TOTALS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21] as const;

/** SPEC 4.1: the shoe is 6 or 8 decks and there is no third. */
export const CHART_DECKS = [6, 8] as const;

/** One of the eight rule combinations SPEC 7 enumerates. */
export interface RuleCombination {
  readonly decks: 6 | 8;
  readonly doubleAfterSplit: boolean;
  readonly surrender: boolean;
}

/** All eight, written out rather than produced by a loop over the axes. */
export const CHART_COMBINATIONS: readonly RuleCombination[] = [
  { decks: 6, doubleAfterSplit: true, surrender: true },
  { decks: 6, doubleAfterSplit: true, surrender: false },
  { decks: 6, doubleAfterSplit: false, surrender: true },
  { decks: 6, doubleAfterSplit: false, surrender: false },
  { decks: 8, doubleAfterSplit: true, surrender: true },
  { decks: 8, doubleAfterSplit: true, surrender: false },
  { decks: 8, doubleAfterSplit: false, surrender: true },
  { decks: 8, doubleAfterSplit: false, surrender: false },
];

// ---------------------------------------------------------------------------
// Hard totals. Surrender moves four of these cells; DAS and the deck count
// move none of them.
// ---------------------------------------------------------------------------

type Row = readonly ChartToken[];

/** Hard totals with SPEC 4.8's late surrender available. */
const HARD_SURRENDER_ON: Readonly<Record<number, Row>> = {
  //      2     3     4     5     6     7     8     9     10    A
  4: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  5: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  6: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  7: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  8: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  9: ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  10: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  11: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H'],
  12: ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  13: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  14: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  15: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'Rh', 'H'],
  16: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'Rh', 'Rh', 'Rh'],
  17: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  18: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  19: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
};

/**
 * Hard totals with SPEC 4.8's toggle off.
 *
 * Written out in full rather than derived from the grid above by stripping a
 * token. A transform would be a second generator and would agree with itself.
 */
const HARD_SURRENDER_OFF: Readonly<Record<number, Row>> = {
  //      2     3     4     5     6     7     8     9     10    A
  4: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  5: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  6: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  7: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  8: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  9: ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  10: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  11: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H'],
  12: ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  13: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  14: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  15: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  16: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  17: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  18: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  19: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
};

// ---------------------------------------------------------------------------
// Soft totals. No axis moves any of these cells: surrender is never the play
// on a hand that cannot bust, DAS governs hands only a split can create, and
// the deck count moves nothing anywhere.
// ---------------------------------------------------------------------------

const SOFT: Readonly<Record<number, Row>> = {
  //       2     3     4     5     6     7     8     9     10    A
  12: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  13: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  14: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  15: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  16: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  17: ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  18: ['S', 'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H'],
  19: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
};

// ---------------------------------------------------------------------------
// Pairs. Four full grids, one per DAS and surrender combination, each written
// out rather than transformed from a neighbour.
// ---------------------------------------------------------------------------

/** Double after split on, late surrender on. */
const PAIRS_DAS_ON_SURRENDER_ON: Readonly<Record<ChartPair, Row>> = {
  //       2     3     4     5     6     7     8     9      10     A
  A: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  2: ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  3: ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  4: ['H', 'H', 'H', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
  5: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  6: ['P', 'P', 'Ps', 'Ps', 'Ps', 'H', 'H', 'H', 'H', 'H'],
  7: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'P', 'H', 'H', 'H', 'H'],
  8: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'P', 'P', 'Prh', 'Prh', 'Prh'],
  9: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'S', 'Ps', 'Ps', 'S', 'S'],
  10: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
};

/** Double after split on, late surrender off. */
const PAIRS_DAS_ON_SURRENDER_OFF: Readonly<Record<ChartPair, Row>> = {
  //       2     3     4     5     6     7     8     9      10     A
  A: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  2: ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  3: ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  4: ['H', 'H', 'H', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
  5: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  6: ['P', 'P', 'Ps', 'Ps', 'Ps', 'H', 'H', 'H', 'H', 'H'],
  7: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'P', 'H', 'H', 'H', 'H'],
  8: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'P', 'P', 'P', 'P', 'P'],
  9: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'S', 'Ps', 'Ps', 'S', 'S'],
  10: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
};

/** Double after split off, late surrender on. */
const PAIRS_DAS_OFF_SURRENDER_ON: Readonly<Record<ChartPair, Row>> = {
  //       2     3     4     5     6     7     8     9      10     A
  A: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  2: ['H', 'H', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  3: ['H', 'H', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  4: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  5: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  6: ['H', 'P', 'Ps', 'Ps', 'Ps', 'H', 'H', 'H', 'H', 'H'],
  7: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'P', 'H', 'H', 'H', 'H'],
  8: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'P', 'P', 'Prh', 'Prh', 'Prh'],
  9: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'S', 'Ps', 'Ps', 'S', 'S'],
  10: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
};

/** Double after split off, late surrender off. */
const PAIRS_DAS_OFF_SURRENDER_OFF: Readonly<Record<ChartPair, Row>> = {
  //       2     3     4     5     6     7     8     9      10     A
  A: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  2: ['H', 'H', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  3: ['H', 'H', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  4: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  5: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  6: ['H', 'P', 'Ps', 'Ps', 'Ps', 'H', 'H', 'H', 'H', 'H'],
  7: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'P', 'H', 'H', 'H', 'H'],
  8: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'P', 'P', 'P', 'P', 'P'],
  9: ['Ps', 'Ps', 'Ps', 'Ps', 'Ps', 'S', 'Ps', 'Ps', 'S', 'S'],
  10: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
};

// ---------------------------------------------------------------------------
// Reading a cell
// ---------------------------------------------------------------------------

/** Which column a dealer up card is. Throws on a label no chart has. */
function columnOf(up: ChartColumn): number {
  const index = CHART_COLUMNS.indexOf(up);
  if (index < 0) {
    throw new Error(`not a dealer up card column: ${String(up)}`);
  }
  return index;
}

function cellOf(row: Row | undefined, up: ChartColumn, label: string): readonly string[] {
  if (row === undefined) {
    throw new Error(`the reference chart has no ${label} row`);
  }
  if (row.length !== CHART_COLUMNS.length) {
    throw new Error(
      `the ${label} row has ${String(row.length)} columns, expected ${String(CHART_COLUMNS.length)}`,
    );
  }
  const token = row[columnOf(up)];
  if (token === undefined) {
    throw new Error(`the ${label} row is missing the ${String(up)} column`);
  }
  return decode(token);
}

/** The hard-total cell this combination's chart holds. */
export function referenceHard(
  combination: RuleCombination,
  total: number,
  up: ChartColumn,
): readonly string[] {
  const chart = combination.surrender ? HARD_SURRENDER_ON : HARD_SURRENDER_OFF;
  return cellOf(chart[total], up, `hard ${String(total)}`);
}

/** The soft-total cell. No axis selects a different chart here. */
export function referenceSoft(
  _combination: RuleCombination,
  total: number,
  up: ChartColumn,
): readonly string[] {
  return cellOf(SOFT[total], up, `soft ${String(total)}`);
}

/** The pair cell this combination's chart holds. */
export function referencePair(
  combination: RuleCombination,
  pair: ChartPair,
  up: ChartColumn,
): readonly string[] {
  const chart = combination.doubleAfterSplit
    ? combination.surrender
      ? PAIRS_DAS_ON_SURRENDER_ON
      : PAIRS_DAS_ON_SURRENDER_OFF
    : combination.surrender
      ? PAIRS_DAS_OFF_SURRENDER_ON
      : PAIRS_DAS_OFF_SURRENDER_OFF;
  return cellOf(chart[pair], up, `pair ${String(pair)},${String(pair)}`);
}

/**
 * How many cells one combination's chart holds.
 *
 * Derived from the three row lists and the one column list rather than typed as
 * a number, so a row quietly dropped from a grid changes this figure and the
 * sweep's own count assertion fails on it.
 */
export const CELLS_PER_COMBINATION =
  (CHART_HARD_TOTALS.length + CHART_SOFT_TOTALS.length + CHART_PAIRS.length) *
  CHART_COLUMNS.length;
