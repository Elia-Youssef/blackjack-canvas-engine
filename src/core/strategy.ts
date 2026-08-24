/**
 * The strategy coach. SPEC 7 and DESIGN section 7. Item `J3`, 17 points, Major.
 *
 * SPEC 7 asks for "a complete basic strategy table for the current house rules
 * (shoe size, S17, DAS, surrender availability), covering hard totals, soft
 * totals and pairs", and it says in as many words that the table **is
 * generated** from the active house-rule record, "never stored as one chart".
 * So there is no chart in this file. There are the rules of basic strategy for
 * the game SPEC 4 describes, written per row as the up cards a play applies
 * against, and `strategyTable` resolves them against one `HouseRules` record
 * into the 380 cells of the three surfaces.
 *
 * **What stops a wrong generator from being invisible is not in this file.**
 * `tests/unit/reference/basic-strategy-charts.ts` holds the eight rule
 * combinations written out by hand from published basic strategy for S17
 * multi-deck play, and `tests/unit/strategy-coach.test.ts` compares every cell
 * of every combination against it. That chart imports nothing from `src/` and
 * is test data: SPEC 7 and DESIGN section 7 both require it never to ship, and
 * nothing here reads it.
 *
 * **The three axes, and the one that turns out not to move.** SPEC 7 fixes the
 * rule set at 8 combinations: shoe size 6 or 8, crossed with DAS on or off,
 * crossed with surrender on or off. S17 is fixed by SPEC 4.9 and `rules.ts`
 * carries no toggle for it, and SPEC 4.6's equal-value or equal-rank split
 * comparison changes no recommendation, "because basic strategy never splits a
 * ten-value pair under either reading". Of the three axes that remain, two move
 * cells here and one does not:
 *
 *   - **DAS moves 7 pair cells**: 2,2 and 3,3 against a 2 and a 3, 4,4 against
 *     a 5 and a 6, and 6,6 against a 2. Each is a split that only pays because
 *     the hands it creates may be doubled.
 *   - **Surrender moves 7 cells**, all of them one of two hard totals: 15
 *     against a 10, 16 against a 9, a 10 and an Ace, and the three 8,8 cells
 *     whose fall-through is that same hard 16.
 *   - **The shoe size moves nothing.** Published basic strategy for a dealer
 *     who stands on soft 17 groups 4 through 8 decks under one chart, because
 *     the total-dependent play is the same across that range, so there is no
 *     `decks` branch below. This is a finding rather than an omission: the
 *     reference charts were written independently for 6 and for 8 decks and
 *     came out identical cell for cell.
 *
 * **That finding has two textual homes, and they have to move together.** Both
 * are left exactly as written, because a spec is not edited to fit an
 * implementation and because editing one of a matched pair is how the two come
 * apart:
 *
 *   1. `BlackJack/SPEC.md` section 7: "Changing shoe size or turning DAS off
 *      changes some recommendations."
 *   2. `BlackJack/DESIGN.md` section 7: "because the correct action genuinely
 *      changes with shoe size, DAS availability and surrender availability".
 *
 * Each is satisfied through the DAS axis, which really does move seven cells.
 * The shoe-size half of each is unsatisfiable and is the user's to resolve, in
 * one approved edit that touches both.
 *
 * **Every cell is a preference list, and the coach walks it.** DESIGN section 7
 * gives the reason: "double if allowed, otherwise hit" is one cell rather than
 * a branch per cell, and the walk is what makes it correct on a three-card hand
 * or on a balance that cannot fund the increment. **Legality is never decided
 * here.** `hitRefusal`, `doubleRefusal`, `splitRefusal` and `surrenderRefusal`
 * are `table.ts`'s exported availability predicates and are asked directly, so
 * SPEC 4.5, 4.6 and 4.8 have exactly one reading in this game. The one thing
 * this file reads for itself is the chip half of SPEC 4.5 and 4.6, and it reads
 * it as `wallet.ts` does: a hand's own wager against the balance. That
 * comparison cannot be delegated, because the wallet decides it inside
 * `commitDouble` and `commitSplit`, which **spend** the chips they check, and a
 * coach that asked by committing would be a coach that changed the game. It is
 * pinned to the wallet by test instead.
 *
 * **The coach reads and never writes.** Nothing in this file takes a `Table`, a
 * `Wallet` or a `Shoe`. It takes a readout, a hand and two numbers, all of them
 * `readonly`, and every function is pure. DESIGN section 7: "Turning the coach
 * on or off cannot change a single gameplay outcome, and a test asserts that a
 * seeded session plays identically with the coach on and off."
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { Card, Rank } from './cards';
import { pipValue } from './cards';
import { TARGET, canSplit, handValue } from './hand';
import type { HouseRules } from './rules';
import type { ActionContext, TableReadout } from './table';
import { doubleRefusal, hitRefusal, splitRefusal, surrenderRefusal } from './table';
import type { HandInPlay, IntentKind } from './types';
import { canFund } from './wallet';

// ---------------------------------------------------------------------------
// The alphabet of a decision
// ---------------------------------------------------------------------------

/**
 * What basic strategy can recommend. Five of SPEC 4.5's six player actions.
 *
 * Insurance is deliberately not one of them. SPEC 4.5 lists it, but SPEC 7
 * gives the coach three surfaces and none of them is the side wager: insurance
 * is not a question about a hand's total against an up card, it is a separate
 * wager on the hole card, and basic strategy declines it without looking
 * anything up. Item `J4` at `BJ-20`, which grades the modes end to end, names
 * none of it either.
 */
export type CoachAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender';

/**
 * One cell of the table: the actions to try, best first.
 *
 * DESIGN section 7's `['double', 'hit']`. The list is walked down to the first
 * action currently legal, so the last entry of every list is one a live hand
 * can always take. Two lists reach three long, and both are a pair whose split,
 * whose surrender and whose hit are three different answers to the same holding
 * depending on what the round has already spent.
 */
export type PreferenceList = readonly CoachAction[];

/**
 * A rank as a chart prints it: the three face cards folded onto `10`.
 *
 * Every published basic strategy chart has ten columns rather than thirteen,
 * because SPEC 4.2 gives J, Q and K the same value as a 10 and no rule in this
 * game distinguishes them. The same ten labels index the pair rows, with the
 * same fold and for the same reason.
 */
export type ChartRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

/**
 * The ten dealer up cards, in the column order a chart prints them.
 *
 * Low to high with the Ace last, which every published chart uses and which is
 * deliberately **not** `RANKS` from `cards.ts`. That one is the shoe's build
 * order with the Ace first, and it is fixed because changing it would change
 * every seeded deal in the project. Two orders, two reasons, no shared list.
 */
export const UP_CARDS: readonly ChartRank[] = Object.freeze([
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
]);

/**
 * The ten pair rows, in the row order a chart prints them: the Ace first.
 *
 * A,A goes at the top because it is the one pair that is always split and the
 * only one whose fall-through is a soft total. Both are easier to read at the
 * head of the list than buried between the 9s and the 10s.
 */
export const PAIR_RANKS: readonly ChartRank[] = Object.freeze([
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
]);

/**
 * The lowest hard total a hand can hold, which is 2,2.
 *
 * It is on the surface even though `cellFor` can never route a 2,2 to it: two
 * cards of equal value are a pair under either reading of SPEC 4.6, so the pair
 * surface answers first. The row is load-bearing anyway, because it is the
 * **fall-through** the 2,2 pair row walks to when the split is refused for want
 * of chips or at SPEC 4.6's three-split cap. Six other hard rows and one soft
 * row are on their surfaces for exactly that reason.
 */
export const LOWEST_HARD_TOTAL = 4;

/**
 * The lowest soft total a hand of two or more cards can hold, which is A,A.
 *
 * A lone Ace is soft 11, and a hand of one card is never a decision, so the
 * surface starts at 12. That row is A,A read as a total rather than as a pair,
 * and it is where the A,A pair row walks when SPEC 4.6 will not split.
 */
export const LOWEST_SOFT_TOTAL = 12;

/**
 * The totals from `low` up to SPEC 4.2's 21, inclusive.
 *
 * Both surfaces run to 21 rather than stopping at 20. A hand of exactly 21
 * stands automatically per SPEC 4.5 and never reaches the coach, but a lookup
 * surface with a hole in it throws on a hand the game can hold, and the row
 * costs one line to keep the function total.
 */
function totalsFrom(low: number): readonly number[] {
  const totals: number[] = [];
  for (let total = low; total <= TARGET; total += 1) {
    totals.push(total);
  }
  return Object.freeze(totals);
}

/** The 4 to 21 of the hard surface, 18 rows. */
export const HARD_TOTALS: readonly number[] = totalsFrom(LOWEST_HARD_TOTAL);

/** The 12 to 21 of the soft surface, 10 rows. */
export const SOFT_TOTALS: readonly number[] = totalsFrom(LOWEST_SOFT_TOTAL);

/**
 * A dealt rank as the chart indexes it: SPEC 4.2's ten-value set, folded.
 *
 * The four ten-value ranks are matched by literal rather than through
 * `isTenValue`, because a predicate call does not narrow the union and the
 * return would need a cast that a later rank change could survive silently. The
 * tie back to the one authority on that set is an assertion instead:
 * `tests/unit/strategy-coach.test.ts` requires this to answer `'10'` for
 * exactly the ranks `cards.ts`'s `isTenValue` accepts, and for no others.
 */
export function chartRank(rank: Rank): ChartRank {
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') {
    return '10';
  }
  return rank;
}

// ---------------------------------------------------------------------------
// The five shapes a cell can take
// ---------------------------------------------------------------------------

/** Hit, with nothing to fall back to. A live hand can always hit. */
const HIT: PreferenceList = Object.freeze(['hit']);

/** Stand. The terminal of every list a further card could only worsen. */
const STAND: PreferenceList = Object.freeze(['stand']);

/** A chart's `D`: double if it is allowed on this hand, otherwise hit. */
const DOUBLE_OR_HIT: PreferenceList = Object.freeze(['double', 'hit']);

/**
 * A chart's `Ds`: double if allowed, otherwise **stand**, not hit.
 *
 * The distinction is the whole reason a cell is a list. Soft 18 against a 3
 * through a 6 is worth doubling on two cards and is worth standing on with
 * three, and a chart that collapsed the two would take a card on an 18.
 */
const DOUBLE_OR_STAND: PreferenceList = Object.freeze(['double', 'stand']);

/** A chart's `Rh`: surrender if the house and the hand allow it, else hit. */
const SURRENDER_OR_HIT: PreferenceList = Object.freeze(['surrender', 'hit']);

/** SPEC 4.6's Split, as the head of a pair cell. */
const SPLIT: CoachAction = 'split';

/**
 * Split first, then whatever the same holding is worth as a total.
 *
 * A pair cell can never be `['split']` alone. SPEC 4.6 refuses a split for want
 * of chips, at the three-split cap and on a split Ace hand, and DESIGN section
 * 7 walks the list "down to the first action currently legal", so a one-entry
 * list would leave the coach with nothing to say about a hand the player is
 * holding. The tail is that same hand read on the hard or soft surface, which
 * is what a player actually does with a pair they cannot split.
 */
function splitOr(tail: PreferenceList): PreferenceList {
  return Object.freeze([SPLIT, ...tail]);
}

/** Whether the up card is one of the columns a chart row names. */
function against(up: ChartRank, columns: readonly ChartRank[]): boolean {
  return columns.includes(up);
}

/**
 * The bust-card columns, 2 through 6, which most stiff totals stand against.
 *
 * Named once because six rows share it. "Stand against 2 through 6" is one rule
 * about the dealer's chance of busting, not six coincidences.
 */
const DEALER_STIFF: readonly ChartRank[] = Object.freeze(['2', '3', '4', '5', '6']);

// ---------------------------------------------------------------------------
// SPEC 7's three surfaces, generated per rule record
// ---------------------------------------------------------------------------

/**
 * One hard total against one up card, under one rule record.
 *
 * Published basic strategy for a shoe of 4 to 8 decks with the dealer standing
 * on soft 17, which SPEC 4.9 fixes. Read top down, hardest total first, because
 * that is the order in which the rules stop being conditional: everything from
 * 17 up stands against everything.
 *
 * Two rows consult the house rules and both consult only SPEC 4.8's toggle.
 * Nothing here reads `decks` or `doubleAfterSplit`: the first changes no cell
 * across the range SPEC 4.1 offers, and the second is a property of a hand
 * created by a split, which only the pair surface can create.
 */
function hardPreference(total: number, up: ChartRank, rules: HouseRules): PreferenceList {
  if (total >= 17) {
    return STAND;
  }
  if (total === 16) {
    if (against(up, DEALER_STIFF)) {
      return STAND;
    }
    // SPEC 4.8's late surrender, on the three up cards a 16 is worst against.
    if (rules.surrender && against(up, ['9', '10', 'A'])) {
      return SURRENDER_OR_HIT;
    }
    return HIT;
  }
  if (total === 15) {
    if (against(up, DEALER_STIFF)) {
      return STAND;
    }
    // A 15 surrenders against a 10 alone. Against an Ace it does not, and that
    // is the S17 reading: the hit-soft-17 chart adds that cell, and SPEC 4.9
    // rejects hit-soft-17 by name.
    if (rules.surrender && up === '10') {
      return SURRENDER_OR_HIT;
    }
    return HIT;
  }
  if (total === 13 || total === 14) {
    return against(up, DEALER_STIFF) ? STAND : HIT;
  }
  if (total === 12) {
    // The one stiff total that hits a 2 and a 3. At 12 only a ten-value card
    // busts the draw, so improving beats waiting on the dealer's two weakest
    // bust cards.
    return against(up, ['4', '5', '6']) ? STAND : HIT;
  }
  if (total === 11) {
    // Double against everything but the Ace. Doubling 11 into an Ace is the
    // hit-soft-17 chart's cell, not this one's.
    return up === 'A' ? HIT : DOUBLE_OR_HIT;
  }
  if (total === 10) {
    return against(up, ['10', 'A']) ? HIT : DOUBLE_OR_HIT;
  }
  if (total === 9) {
    return against(up, ['3', '4', '5', '6']) ? DOUBLE_OR_HIT : HIT;
  }
  // 4 through 8: nothing to protect and nothing worth stopping at one card, so
  // hit. An 8 doubles against a 5 and a 6 in a single-deck game, not in a shoe.
  return HIT;
}

/**
 * One soft total against one up card.
 *
 * No house rule reaches this surface, and the parameter list says so by not
 * taking a record. Surrender is never the play on a hand that cannot bust, DAS
 * governs hands only a split can create, and the shoe size moves nothing.
 */
function softPreference(total: number, up: ChartRank): PreferenceList {
  if (total >= 19) {
    // Soft 19 stands against a 6 here. The double is the hit-soft-17 chart's.
    return STAND;
  }
  if (total === 18) {
    if (against(up, ['3', '4', '5', '6'])) {
      return DOUBLE_OR_STAND;
    }
    if (against(up, ['9', '10', 'A'])) {
      return HIT;
    }
    // 2, 7 and 8. An 18 beats or ties what those up cards most often make, and
    // standing against the 2 rather than doubling is the S17 reading.
    return STAND;
  }
  if (total === 17) {
    return against(up, ['3', '4', '5', '6']) ? DOUBLE_OR_HIT : HIT;
  }
  if (total === 15 || total === 16) {
    return against(up, ['4', '5', '6']) ? DOUBLE_OR_HIT : HIT;
  }
  if (total === 13 || total === 14) {
    return against(up, ['5', '6']) ? DOUBLE_OR_HIT : HIT;
  }
  // Soft 12, which is A,A and nothing else. The single card a double buys is
  // worth less than the free draws a hand that cannot bust still has coming.
  return HIT;
}

/**
 * Whether basic strategy splits this pair against this up card.
 *
 * The only place `doubleAfterSplit` changes an answer, and it changes four rows
 * of it: a split that is worth taking only because the hands it creates may be
 * doubled stops being worth taking when SPEC 4.6's toggle is off.
 */
function splitsOn(pair: ChartRank, up: ChartRank, rules: HouseRules): boolean {
  switch (pair) {
    case 'A':
      // Always. Two hands each starting from an Ace beat one soft 12 against
      // every up card there is, and SPEC 4.6's one card each does not undo it.
      return true;
    case '2':
    case '3':
      return rules.doubleAfterSplit
        ? against(up, ['2', '3', '4', '5', '6', '7'])
        : against(up, ['4', '5', '6', '7']);
    case '4':
      return rules.doubleAfterSplit && against(up, ['5', '6']);
    case '5':
      // Never. A pair of 5s is a hard 10 and hard 10 doubles; splitting trades
      // the best two-card double in the game for two hands starting at 5.
      return false;
    case '6':
      return rules.doubleAfterSplit
        ? against(up, DEALER_STIFF)
        : against(up, ['3', '4', '5', '6']);
    case '7':
      return against(up, ['2', '3', '4', '5', '6', '7']);
    case '8':
      // Always, including against a 10 and an Ace. Two hands starting at 8 are
      // worth more than one hard 16, which is the worst total in the game.
      return true;
    case '9':
      // Everything but the 7, the 10 and the Ace. Against a 7 an 18 already
      // beats the 17 the dealer most often holds.
      return against(up, ['2', '3', '4', '5', '6', '8', '9']);
    case '10':
      // Never, under either reading of SPEC 4.6's pair test. This is the cell
      // SPEC 7 names as the reason the equal-value and equal-rank toggle
      // changes no recommendation: a 20 is not a hand to take apart.
      return false;
  }
}

/**
 * The same holding read on the total surfaces, which is a pair cell's tail.
 *
 * A,A is soft 12; every other pair is twice its pip value, taken from
 * `cards.ts` rather than from a second table of what a rank is worth.
 */
function pairTail(pair: ChartRank, up: ChartRank, rules: HouseRules): PreferenceList {
  if (pair === 'A') {
    return softPreference(LOWEST_SOFT_TOTAL, up);
  }
  return hardPreference(pipValue(pair) * 2, up, rules);
}

/** One pair row against one up card: the split, then the total behind it. */
function pairPreference(pair: ChartRank, up: ChartRank, rules: HouseRules): PreferenceList {
  const tail = pairTail(pair, up, rules);
  return splitsOn(pair, up, rules) ? splitOr(tail) : tail;
}

// ---------------------------------------------------------------------------
// The generated table
// ---------------------------------------------------------------------------

/** Which surface answered a lookup, and the row and column it answered on. */
export type CellAddress =
  | { readonly surface: 'hard'; readonly total: number; readonly up: ChartRank }
  | { readonly surface: 'soft'; readonly total: number; readonly up: ChartRank }
  | { readonly surface: 'pair'; readonly pair: ChartRank; readonly up: ChartRank };

/** One answered lookup: the cell, and where on the table it came from. */
export interface StrategyCell {
  readonly preference: PreferenceList;
  readonly address: CellAddress;
}

/**
 * SPEC 7's complete table for one house-rule record.
 *
 * The three surfaces are materialised once at construction and read through
 * named accessors rather than exposed as arrays, so a caller cannot index past
 * a row and cannot hold a reference it could sort or splice. A row or column
 * outside the published domain is a caller defect and throws, which is
 * `dealer.ts`'s stance on an up card SPEC 4.4 never peeks behind.
 */
export interface StrategyTable {
  /** The record this table was generated from. Frozen by `rules.ts`. */
  readonly rules: HouseRules;
  /** A hard total, 4 through 21, against one of the ten up cards. */
  hard(total: number, up: ChartRank): PreferenceList;
  /** A soft total, 12 through 21, against one of the ten up cards. */
  soft(total: number, up: ChartRank): PreferenceList;
  /** A pair, by the chart rank of either card, against one up card. */
  pair(pair: ChartRank, up: ChartRank): PreferenceList;
  /** The cell a real holding lands on, and which surface answered it. */
  cellFor(cards: readonly Card[], up: Rank): StrategyCell;
}

/** One surface: each row key to its ten columns, built once. */
type Surface<Row> = ReadonlyMap<Row, ReadonlyMap<ChartRank, PreferenceList>>;

function buildSurface<Row>(
  rows: readonly Row[],
  cell: (row: Row, up: ChartRank) => PreferenceList,
): Surface<Row> {
  const surface = new Map<Row, ReadonlyMap<ChartRank, PreferenceList>>();
  for (const row of rows) {
    const columns = new Map<ChartRank, PreferenceList>();
    for (const up of UP_CARDS) {
      columns.set(up, cell(row, up));
    }
    surface.set(row, columns);
  }
  return surface;
}

function read<Row>(
  surface: Surface<Row>,
  row: Row,
  up: ChartRank,
  label: string,
): PreferenceList {
  const columns = surface.get(row);
  if (columns === undefined) {
    throw new RangeError(`the ${label} surface has no row ${String(row)}`);
  }
  const cell = columns.get(up);
  if (cell === undefined) {
    throw new RangeError(`${String(up)} is not one of SPEC 7's ten dealer up cards`);
  }
  return cell;
}

/**
 * Generate SPEC 7's table for one house-rule record.
 *
 * Called once per rule set rather than once per decision. The record is frozen
 * and the 380 cells behind it cannot move while it is in force, and SPEC 14
 * puts a house-rule change at the start of the next round, never mid-round.
 */
export function strategyTable(rules: HouseRules): StrategyTable {
  const hardSurface = buildSurface(HARD_TOTALS, (total, up) => hardPreference(total, up, rules));
  const softSurface = buildSurface(SOFT_TOTALS, (total, up) => softPreference(total, up));
  const pairSurface = buildSurface(PAIR_RANKS, (pair, up) => pairPreference(pair, up, rules));

  function hard(total: number, up: ChartRank): PreferenceList {
    return read(hardSurface, total, up, 'hard total');
  }

  function soft(total: number, up: ChartRank): PreferenceList {
    return read(softSurface, total, up, 'soft total');
  }

  function pair(rank: ChartRank, up: ChartRank): PreferenceList {
    return read(pairSurface, rank, up, 'pair');
  }

  /**
   * Which surface a holding belongs to. SPEC 4.6's pair test decides first.
   *
   * The test is `canSplit` under the house's own comparison, asked rather than
   * re-derived, so a table built with `equalRank` reads a King and a Jack as a
   * hard 20 and one built with `equalValue` reads them as the 10,10 row. Both
   * answer stand, which is SPEC 7's stated reason the toggle changes nothing.
   */
  function cellFor(cards: readonly Card[], up: Rank): StrategyCell {
    const column = chartRank(up);
    const first = cards[0];
    if (first !== undefined && canSplit(cards, rules.splitRule)) {
      const held = chartRank(first.rank);
      return Object.freeze({
        preference: pair(held, column),
        address: Object.freeze({ surface: 'pair', pair: held, up: column } as const),
      });
    }
    const value = handValue(cards);
    if (value.soft) {
      return Object.freeze({
        preference: soft(value.total, column),
        address: Object.freeze({ surface: 'soft', total: value.total, up: column } as const),
      });
    }
    return Object.freeze({
      preference: hard(value.total, column),
      address: Object.freeze({ surface: 'hard', total: value.total, up: column } as const),
    });
  }

  return Object.freeze({ rules, hard, soft, pair, cellFor });
}

// ---------------------------------------------------------------------------
// What the coach may see, and what it may conclude from it
// ---------------------------------------------------------------------------

/**
 * The decision in front of the player, as the coach sees it.
 *
 * Four `readonly` fields and not a `Table`. The coach cannot advance a phase,
 * draw a card or spend a chip because it is never handed anything that can, and
 * that is the structural half of DESIGN section 7's guarantee. The other half
 * is the seeded transcript in `tests/unit/strategy-coach.test.ts`.
 */
export interface CoachSituation {
  /** The active hand, from `readout().hands[activeHand]`. */
  readonly hand: HandInPlay;
  /** The dealer's up card, from `readout().dealerVisible[0]`. */
  readonly up: Rank;
  /** Splits taken this round, from `readout().splits`. SPEC 4.6's cap. */
  readonly splits: number;
  /**
   * The balance, from `readout().wallet.chips`.
   *
   * The number rather than a verdict, because SPEC 4.5 and 4.6 both gate on
   * "chips available >= the hand's wager" and `wallet.ts` decides exactly that
   * inside `commitDouble` and `commitSplit`. Those commits **spend** the chips
   * they check, so the coach cannot ask them and asks the same question of the
   * same figure instead. `tests/unit/strategy-coach.test.ts` pins the two
   * answers together against a real wallet on both sides of the boundary.
   */
  readonly chips: number;
}

/**
 * The situation at a `playerTurn`, or `null` when there is no decision.
 *
 * A readout is the only thing the machine publishes and the only thing this
 * takes. Every other phase answers `null` rather than throwing, because "the
 * player is not being asked anything right now" is an ordinary state of a
 * running game rather than a caller defect.
 *
 * `dealerVisible[0]` is the up card while the hole card is down, which SPEC 4.3
 * fixes: the deal is player, dealer up, player, dealer down, and `table.ts`
 * publishes only the face-up cards until the reveal.
 */
export function situationAt(readout: TableReadout): CoachSituation | null {
  const { phase } = readout;
  if (phase.kind !== 'playerTurn') {
    return null;
  }
  const hand = readout.hands[phase.activeHand];
  const up = readout.dealerVisible[0];
  if (hand === undefined || up === undefined) {
    return null;
  }
  return Object.freeze({
    hand,
    up: up.rank,
    splits: readout.splits,
    chips: readout.wallet.chips,
  });
}

/**
 * Whether the balance covers one more wager the size of this hand's.
 *
 * SPEC 4.5's "chips available >= the hand's wager" and SPEC 4.6's "requires
 * chips available >= that hand's wager". **The comparison is `wallet.ts`'s
 * `canFund` and is not spelled again here**: `BJ-9` wrote it out because the
 * wallet exposed no pure predicate and only decided the question inside the two
 * commits, which spend what they check; `BJ-15` needed the same answer for the
 * chrome and exported one, so the coach, the chrome and both commits now ask a
 * single comparison. What is left here is which figures to ask it about.
 */
function fundsAnEqualWager(situation: CoachSituation): boolean {
  return canFund(situation.hand.wager, situation.chips);
}

/**
 * Whether an action is available on this hand right now.
 *
 * **Every clause of SPEC 4.5, 4.6 and 4.8 is asked of `table.ts`**, whose four
 * exported refusal predicates are the game's one reading of them. A second
 * reading here would agree with the first on every hand until a house rule
 * moved, which is the failure those exports exist to prevent.
 *
 * Stand is the one action with no predicate to ask, because SPEC 4.5 gives it
 * one condition and that condition is "hand live". Inventing a `standRefusal`
 * that `table.ts` does not export would be the second reading this function is
 * written to avoid.
 */
export function legal(
  action: CoachAction,
  table: StrategyTable,
  situation: CoachSituation,
): boolean {
  const context: ActionContext = { rules: table.rules, splits: situation.splits };
  const { hand } = situation;
  switch (action) {
    case 'stand':
      return hand.state === 'live';
    case 'hit':
      return hitRefusal(hand) === null;
    case 'double':
      return doubleRefusal(hand, context) === null && fundsAnEqualWager(situation);
    case 'split':
      return splitRefusal(hand, context) === null && fundsAnEqualWager(situation);
    case 'surrender':
      return surrenderRefusal(hand, context) === null;
  }
}

/** SPEC 7's recommendation for the hand in front of the player. */
export interface Recommendation {
  /** The first action in the cell that is legal right now. */
  readonly action: CoachAction;
  /** The whole cell, so the chrome can say what was preferred and refused. */
  readonly preference: PreferenceList;
  /** Which surface and cell answered. SPEC 7's one line is built from it. */
  readonly address: CellAddress;
}

/**
 * Walk the cell down to the first legal action. DESIGN section 7.
 *
 * `null` in two cases, both of them a hand with no decision in it:
 *
 *   - The hand is not `live`. SPEC 4.5 offers an action on a live hand, and a
 *     hand that has stood, busted, doubled, surrendered or is a natural has
 *     nothing to be advised about. Answering `null` rather than throwing also
 *     keeps a bust total, which is outside both surfaces, from ever reaching
 *     the lookup.
 *   - Nothing in the cell is legal. The only hand that produces this is a split
 *     Ace hand, which SPEC 4.6 stands automatically and never makes the active
 *     hand, and on which SPEC 4.5 forbids the hit every list would otherwise
 *     end on. A refusal is a value in this game, so a coach with nothing to say
 *     says so rather than naming an action the player cannot take.
 */
export function recommend(
  table: StrategyTable,
  situation: CoachSituation,
): Recommendation | null {
  if (situation.hand.state !== 'live') {
    return null;
  }
  const cell = table.cellFor(situation.hand.cards, situation.up);
  for (const action of cell.preference) {
    if (legal(action, table, situation)) {
      return Object.freeze({ action, preference: cell.preference, address: cell.address });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// SPEC 7's three modes, and the accuracy behind them
// ---------------------------------------------------------------------------

/** SPEC 7: "Optional, off by default, toggleable at any time." */
export type CoachMode = 'off' | 'hint' | 'review';

/** The three modes, for a settings control and for a sweep. */
export const COACH_MODES: readonly CoachMode[] = Object.freeze(['off', 'hint', 'review']);

/** SPEC 7 and SPEC 14: off by default. */
export const DEFAULT_COACH_MODE: CoachMode = 'off';

/**
 * SPEC 7's hint mode: the recommendation, or nothing at all.
 *
 * The mode gate is here rather than at the chrome, so that "off" means the
 * lookup never happens rather than that its answer is not drawn. A coach that
 * computed a hint and hid it would still be a coach that had run, and item `J4`
 * at `BJ-20` grades the modes by what the player can see.
 */
export function hint(
  mode: CoachMode,
  table: StrategyTable,
  situation: CoachSituation,
): Recommendation | null {
  return mode === 'hint' ? recommend(table, situation) : null;
}

/** SPEC 7's review-mode comparison, as a value the chrome renders later. */
export interface CoachVerdict {
  /** What the player did. */
  readonly played: CoachAction;
  /** What basic strategy recommended, from the same situation. */
  readonly recommended: CoachAction;
  /** SPEC 7: "if the action differed from basic strategy". */
  readonly matched: boolean;
  /** The whole cell, for SPEC 7's one-line explanation. */
  readonly preference: PreferenceList;
  /** Which cell it came from. */
  readonly address: CellAddress;
}

/**
 * Compare what the player did against what the table recommended.
 *
 * Pure, and produced whether the mode is `hint` or `review`. **What changes
 * between the two is what the chrome shows**, which is SPEC 7's difference
 * between highlighting before the act and reporting after it. The verdict is a
 * value either way, because the accuracy figures below count decisions in both
 * modes and cannot count what was never compared.
 *
 * `null` exactly when `recommend` is `null`, so a hand with no decision in it
 * produces no verdict and no counted decision.
 */
export function compare(
  table: StrategyTable,
  situation: CoachSituation,
  played: CoachAction,
): CoachVerdict | null {
  const advice = recommend(table, situation);
  if (advice === null) {
    return null;
  }
  return Object.freeze({
    played,
    recommended: advice.action,
    matched: played === advice.action,
    preference: advice.preference,
    address: advice.address,
  });
}

/**
 * SPEC 7's "decisions made, decisions matching basic strategy", for one scope.
 *
 * **Two counters and no percentage.** SPEC 7 asks for "a running percentage"
 * and this record deliberately does not hold one: a derived figure stored
 * beside the numbers it came from is the exact drift the project's document
 * gate exists to catch, and SPEC 13 persists what was counted rather than what
 * was computed from it. `accuracy` below is the percentage, in one place.
 */
export interface CoachAccuracy {
  /** SPEC 7's "decisions made". */
  readonly decisions: number;
  /** SPEC 7's "decisions matching basic strategy". */
  readonly matched: number;
}

/**
 * SPEC 7's "in both session and lifetime statistics", as one value.
 *
 * One record rather than two loose counters, because they move together on
 * every decision and apart only at a session boundary, and because
 * `statistics.ts` at `BJ-10` and SPEC 13's persistence both consume the pair.
 * Immutable and replaced rather than mutated, so a caller holding yesterday's
 * figures keeps yesterday's figures.
 */
export interface CoachRecord {
  readonly session: CoachAccuracy;
  readonly lifetime: CoachAccuracy;
}

const NO_COUNTERS: CoachAccuracy = Object.freeze({ decisions: 0, matched: 0 });

/** A record with nothing counted yet, for a first launch and for a test. */
export const NO_DECISIONS: CoachRecord = Object.freeze({
  session: NO_COUNTERS,
  lifetime: NO_COUNTERS,
});

/**
 * SPEC 7's running percentage, or `null` before the first decision.
 *
 * `null` rather than 0 or 100, because "no decisions yet" is neither "every
 * decision wrong" nor "every decision right", and a player shown 0% before
 * their first hand would read a coach that SPEC 7 says never scolds as having
 * already judged them.
 */
export function accuracy(counters: CoachAccuracy): number | null {
  if (counters.decisions === 0) {
    return null;
  }
  return (counters.matched * 100) / counters.decisions;
}

function counted(counters: CoachAccuracy, matched: boolean): CoachAccuracy {
  return Object.freeze({
    decisions: counters.decisions + 1,
    matched: counters.matched + (matched ? 1 : 0),
  });
}

/** One decision, counted into both scopes at once. */
export function recordDecision(record: CoachRecord, matched: boolean): CoachRecord {
  return Object.freeze({
    session: counted(record.session, matched),
    lifetime: counted(record.lifetime, matched),
  });
}

/**
 * A new session: the session counters restart and the lifetime ones do not.
 *
 * The whole reason there are two scopes. SPEC 13 persists the lifetime figures
 * and SPEC 11 shows the session ones, so this is the one function allowed to
 * separate them, and `BJ-10` calls it at exactly one place.
 */
export function openSession(record: CoachRecord): CoachRecord {
  return Object.freeze({ session: NO_COUNTERS, lifetime: record.lifetime });
}

/** What one observed decision did to the record, and what it concluded. */
export interface CoachObservation {
  readonly record: CoachRecord;
  readonly verdict: CoachVerdict | null;
}

/**
 * Observe one action the player took. SPEC 7's accuracy tracking.
 *
 * **With the coach off nothing is compared and nothing is counted.** SPEC 7
 * puts accuracy tracking inside the strategy coach, which is "optional, off by
 * default", so a session played with the coach off is a session the coach was
 * not present for and has no opinion about. That is a reading of where the
 * bullet sits rather than a sentence SPEC 7 writes, it is the reading item `J4`
 * at `BJ-20` grades end to end in the browser, and it is recorded here so that
 * a later part changes it deliberately or not at all.
 *
 * **This is the whole of the coach's effect on the game: none.** It returns a
 * new record and takes nothing it could act on. Whether the action was a good
 * one has already stopped mattering by the time this is called, because
 * `table.apply` accepted or refused it without asking.
 */
export function observe(
  mode: CoachMode,
  record: CoachRecord,
  table: StrategyTable,
  situation: CoachSituation,
  played: CoachAction,
): CoachObservation {
  if (mode === 'off') {
    return Object.freeze({ record, verdict: null });
  }
  const verdict = compare(table, situation, played);
  if (verdict === null) {
    return Object.freeze({ record, verdict: null });
  }
  return Object.freeze({ record: recordDecision(record, verdict.matched), verdict });
}

/**
 * The action an intent counts as, or `null` when it is not a hand decision.
 *
 * SPEC 7 tracks "decisions made", and five of SPEC 10's eighteen intents are
 * one. Choosing a table, building a wager, dealing and asking for the next hand
 * are not decisions basic strategy has an opinion about, and neither are the
 * two insurance intents, for the reason `CoachAction` gives.
 *
 * Here rather than at the chrome, so that what counts as a decision is decided
 * once, inside `core/`, where a sweep can drive it.
 */
export function actionOf(intent: IntentKind): CoachAction | null {
  switch (intent) {
    case 'hit':
      return 'hit';
    case 'stand':
      return 'stand';
    case 'double':
      return 'double';
    case 'split':
      return 'split';
    case 'surrender':
      return 'surrender';
    default:
      return null;
  }
}
