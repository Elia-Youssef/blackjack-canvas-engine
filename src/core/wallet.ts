/**
 * The wallet, the three tables and the betting arithmetic. SPEC 4.11, 4.12, 6
 * and 13. Items `J1` and `J2`, both Major.
 *
 * One module rather than two because DESIGN section 1 gives `wallet.ts` "chips,
 * per-hand wagers, commit, settle, table limits" and reserves `table.ts` for the
 * phase machine at `BJ-7`. Splitting the limits into a second file would either
 * take that name or add one the architecture does not list.
 *
 * **The wager leaves the balance at the deal, and that is the whole design.**
 * SPEC 4.11 commits the wager out of `chips` at the deal and credits back
 * `wager + net` at settlement. It is what makes "cannot wager more than
 * available" structurally impossible rather than a guard in three places, and it
 * is why Double's "sufficient chips" is a plain look at the balance. Nothing
 * here subtracts a losing wager a second time: `settlement.ts` returns a net on
 * a wager that has already left, so a lost hand credits back zero.
 *
 * **The conserved quantity has four terms**, per SPEC 4.11 and 4.7:
 *
 *     chips + committed + insuranceStake - deferredStake
 *
 * and it moves only by a settled outcome. `BJ-6` pinned two of the four at zero
 * and put them in the readout anyway; `BJ-8` moved them, through `takeInsurance`
 * and `settleInsurance` below, and the expression did not change shape when it
 * did. Writing a form with fewer terms and widening it later is the exact defect
 * the soak `H6` at `BJ-12` carries negative controls for, and which form each
 * sentence is about is worth being exact about.
 *
 * The two-term reading `chips + committed` is the **intuition**: it passes every
 * round until the first insured one, and it is not what that soak measures. What
 * the soak carries as the criterion's own control is the **three-term** form
 * with `insuranceStake` dropped, `chips + committed - deferredStake`, asserted
 * to fail exactly twice on every insured round; a second three-term reading with
 * `deferredStake` dropped, `chips + committed + insuranceStake`, is kept beside
 * it because it is the only one that isolates the fourth term, and it is
 * asserted to fail exactly twice on every deferred round. `B15` at `BJ-15`
 * grades the identity at the controls and `B11` at `BJ-8` grades the two terms
 * themselves.
 *
 * **The balance never goes negative, at any single application and not merely at
 * rest**, which is `B11`'s last clause. Three things make that true rather than
 * lucky, and they are all in this file. `takeInsurance` captures
 * `min(chips, stake)` **before** the debit, so it can never take out more than
 * is there. `settleInsurance` credits `stake + net`, which is `3 x stake` or 0
 * and never negative. And the unfunded remainder is subtracted at `endRound`,
 * which refuses to run while any hand is still committed, so every credit the
 * round is owed has landed before the shortfall is taken back. Subtracting it at
 * the insurance settlement instead is the defect: on the branch where the side
 * wager is lost the credit is 0, and a balance that had been emptied to fund the
 * stake would go negative between two calls. SPEC 4.7 states the margin the
 * ordering rests on: on a dealer natural the insurance credit is `3 x stake`,
 * and otherwise the natural pays `wager x 3 / 2`, both of which exceed any
 * possible shortfall.
 *
 * **A rejected bet changes nothing.** SPEC 4.11: a chip tap that would carry the
 * wager above `min(tableMax, chips)` is rejected with a reason, never silently
 * clamped, and Deal below the table minimum is blocked, never raised to it. Only
 * `Max` and `Repeat` compute a value and both compute a legal one. Every
 * refusal here returns a `Refusal` and leaves the wallet exactly as it was.
 * Turning a `Refusal` into something a player can read is item `B15` at `BJ-15`,
 * where the chip controls exist; the reason value itself is core, so it is here.
 *
 * **The pending wager can only be built by the four controls.** There is no
 * setter. `settle()` in `settlement.ts` is a total function that answers any
 * wager including an off-grid one, so the grid has to be held somewhere, and the
 * only place a wager is born is `tapChip`, `clear`, `maxWager` and
 * `repeatWager`. `dealRefusal` checks the grid again at the commit, because a
 * wager that reached settlement off the grid would produce a half chip on the
 * 3:2 natural and the loss would be invisible.
 *
 * **Only the initial wager is governed by the table.** SPEC 4.11 again: splits
 * and doubles may carry the total committed above the table maximum, so
 * `commitDouble` and `commitSplit` look at the balance and at nothing else. The
 * insurance stake is half the initial wager, which is why the initial wager is
 * recorded per round rather than derived from what a hand is carrying.
 *
 * **Unlocks are a high-water mark, not a balance.** SPEC 6 keys them to the best
 * chip balance ever reached, so they survive a bust and the free reset of SPEC
 * 4.12. `bestBalance` therefore only ever rises, and the reset restores 1,000
 * without touching it. It marks the **balance**, never the balance plus what is
 * still committed: a hand paid while its sibling is still on the table would
 * otherwise mark money that is at risk, and unlock a table early and for good.
 * Lifetime statistics and milestones survive the same reset and are not this
 * module's: `statistics.ts` is built at `BJ-10`, `J6` grades the milestones and
 * `J5` the hand history, and `C4` at `BJ-20` grades the preservation clause end
 * to end alongside `I4`'s persistence of the same figures.
 *
 * **No clock and no randomness.** The wallet is a state machine driven entirely
 * by its own calls, which is what lets the soak run it at thousands of rounds a
 * second. No DOM, no canvas, no renderer import, no `Math.random()`, no clock.
 */

// ---------------------------------------------------------------------------
// SPEC 4.11: the bankroll, the chips and the grid they build
// ---------------------------------------------------------------------------

/**
 * The starting bankroll, and what SPEC 4.12's free reset restores.
 *
 * One constant for both, because SPEC 4.11 and SPEC 4.12 name the same 1,000 and
 * a reset that restored a different figure would be a second starting bankroll.
 * SPEC 13 starts every launch here too: the chip balance is not persisted.
 */
export const STARTING_CHIPS = 1000;

/** SPEC 4.11's four chip denominations, ascending. There is no 25. */
export const CHIP_DENOMINATIONS = [10, 50, 100, 500] as const;

export type ChipDenomination = (typeof CHIP_DENOMINATIONS)[number];

/**
 * The grid every reachable wager sits on, and what `Max` floors to.
 *
 * It is the smallest denomination and the divisor of the other three, which is
 * the property SPEC 4.11 hangs the entire game's arithmetic on: the 3:2 natural,
 * the insurance stake, the 2:1 payout and the surrender return are all exact
 * integers because of it. `tests/unit/payout-integrality.test.ts` derives that
 * from the denominations rather than quoting it, and item `B14` owns the claim.
 */
export const WAGER_GRID = 10;

/**
 * The wager an untouched betting screen carries, and what `Clear` returns to.
 *
 * Zero doubles as "no round has been dealt yet" for `Repeat`, which is sound
 * because `dealRefusal` refuses a wager of zero: no round can ever have been
 * dealt at one, so the two readings cannot collide.
 */
export const NO_WAGER = 0;

/** True for one of SPEC 4.11's four denominations, and for nothing else. */
export function isChipDenomination(value: number): value is ChipDenomination {
  return CHIP_DENOMINATIONS.some((chip) => chip === value);
}

// ---------------------------------------------------------------------------
// SPEC 6: the three tables
// ---------------------------------------------------------------------------

/** The three tables of SPEC 6, and there is no fourth. */
export type TableId = 'bronze' | 'silver' | 'gold';

/** One row of SPEC 6's table, as the game reads it. */
export interface TableLimits {
  readonly id: TableId;
  /** SPEC 4.11: the initial wager Deal is blocked below. */
  readonly minimum: number;
  /** SPEC 4.11: the ceiling on an initial wager. Splits and doubles pass it. */
  readonly maximum: number;
  /**
   * The best chip balance ever reached that unlocks this table. SPEC 6.
   *
   * Bronze is "always" in SPEC 6 and is written here as 0 rather than as a
   * special case, because a balance is never negative and one predicate that
   * answers for all three cannot drift from a branch that answers for two.
   */
  readonly unlocksAt: number;
}

/**
 * SPEC 6's three tables, lowest first.
 *
 * The order is load bearing twice over: SPEC 4.12 drops a busted player to a
 * *lower* table and SPEC 13's launch fallback takes the *highest* unlocked one
 * that 1,000 affords, and neither phrase means anything without it.
 * `tests/unit/tables.test.ts` asserts the three columns rise together, so a
 * reordering is a failure rather than a silent change of meaning.
 */
export const TABLES: readonly TableLimits[] = Object.freeze([
  Object.freeze<TableLimits>({ id: 'bronze', minimum: 10, maximum: 100, unlocksAt: 0 }),
  Object.freeze<TableLimits>({ id: 'silver', minimum: 50, maximum: 500, unlocksAt: 2500 }),
  Object.freeze<TableLimits>({ id: 'gold', minimum: 100, maximum: 2000, unlocksAt: 10000 }),
]);

/**
 * The table SPEC 4.12 resets to, and the one SPEC 6 never locks.
 *
 * Read off the front of the list rather than written out, so a reordering moves
 * it too instead of leaving a stale name pointing at the wrong row.
 */
export const LOWEST_TABLE: TableLimits = firstTable();

function firstTable(): TableLimits {
  const first = TABLES[0];
  if (first === undefined) {
    throw new RangeError('SPEC 6 configures three tables and the list is empty');
  }
  return first;
}

/** True for one of SPEC 6's three table names, and for nothing else. */
export function isTableId(value: string): value is TableId {
  return TABLES.some((table) => table.id === value);
}

/**
 * One table's limits by name.
 *
 * Refuses an unknown name rather than answering, for the reason `shoe.ts`
 * refuses a deck count outside 6 and 8: a table name arriving from settings or
 * from storage has been through `JSON.parse` and carries no type at all.
 * Keeping a corrupt document from reaching this call is item `I2` at `BJ-11`,
 * whose criterion is that such a value does not prevent the game from starting.
 */
export function tableLimits(id: TableId): TableLimits {
  const found = TABLES.find((table) => table.id === id);
  if (found === undefined) {
    throw new RangeError(`SPEC 6 configures bronze, silver and gold; ${id} is not one of them`);
  }
  return found;
}

/**
 * Whether a table is unlocked. SPEC 6, and half of item `J1`.
 *
 * Keyed to the best chip balance **ever reached**, never to the current one,
 * which is item `J2` in as many words and is why an unlock survives a bust and
 * the free reset of SPEC 4.12. Inclusive at the threshold: SPEC 6 says
 * "best chip balance >= 2,500", so landing exactly on it unlocks Silver.
 */
export function isUnlocked(id: TableId, bestBalance: number): boolean {
  return bestBalance >= tableLimits(id).unlocksAt;
}

/** Every unlocked table at a given high-water mark, lowest first. SPEC 6. */
export function unlockedTables(bestBalance: number): readonly TableLimits[] {
  return TABLES.filter((table) => bestBalance >= table.unlocksAt);
}

/**
 * Whether a table can be entered. Item `J1`: "a table cannot be entered without
 * meeting its threshold and affording its minimum."
 *
 * Both halves, and the second one is about the **current** balance while the
 * first is about the high-water mark. A player who reached 10,000 and lost it
 * keeps Gold unlocked and still cannot sit down at it on 40 chips.
 */
export function canEnter(id: TableId, bestBalance: number, chips: number): boolean {
  const limits = tableLimits(id);
  return bestBalance >= limits.unlocksAt && chips >= limits.minimum;
}

/**
 * The highest table a balance can both unlock and afford, or `null` when none.
 *
 * Scanned from the top of SPEC 6's list down, so "highest" is the list's order
 * rather than a comparison invented here. `null` is reachable only below the
 * lowest minimum, which on the shipped set means fewer than 10 chips: SPEC 4.12
 * calls that being out at the table and offers the free reset.
 */
export function highestEnterableTable(bestBalance: number, chips: number): TableLimits | null {
  for (let index = TABLES.length - 1; index >= 0; index -= 1) {
    const table = TABLES[index];
    if (table !== undefined && canEnter(table.id, bestBalance, chips)) {
      return table;
    }
  }
  return null;
}

/** Which table a launch opens at, and whether SPEC 13's fallback decided it. */
export interface LaunchChoice {
  readonly table: TableId;
  /**
   * True when the persisted table could not be entered at the starting bankroll
   * and the fallback chose instead.
   *
   * Item `J1` requires this to be unreachable under the shipped table set, and
   * `tests/unit/tables.test.ts` asserts it over every consistent pair rather
   * than only asserting the three minima. Both fail if a minimum passes 1,000.
   */
  readonly fromFallback: boolean;
}

/**
 * Which table a fresh launch opens at. SPEC 13, and the second half of `J1`.
 *
 * SPEC 13 starts every launch at 1,000 chips at the persisted table, and every
 * minimum in SPEC 6 is at or below 1,000, so the persisted table is always
 * affordable and the fallback below is currently unreachable. The loader still
 * carries it, which is what this function is: the highest unlocked table whose
 * minimum 1,000 affords.
 *
 * A persisted table the high-water mark does not unlock takes the fallback too.
 * SPEC 13 persists the unlocks and the selected table in the same document, so
 * that pair is inconsistent rather than merely unaffordable, and answering with
 * a locked table would seat the player somewhere SPEC 6 says they cannot sit.
 *
 * **That document is loaded rather than refused, and this function is what
 * resolves it.** `BJ-11` reads the mark and the selected table as two
 * independently salvaged fields, so the pair can disagree even when neither
 * value is corrupt and item `I2`'s criterion, that nothing saved stops the game
 * starting, would not be met by refusing the load. `src/storage/document.ts`
 * states the same division from the other side: it salvages field by field and
 * deliberately holds no opinion about this pair, because SPEC 13 already names
 * the function that does.
 */
export function launchTable(persisted: TableId, bestBalance: number): LaunchChoice {
  if (canEnter(persisted, bestBalance, STARTING_CHIPS)) {
    return Object.freeze({ table: persisted, fromFallback: false });
  }
  const fallback = highestEnterableTable(bestBalance, STARTING_CHIPS);
  return Object.freeze({
    table: fallback === null ? LOWEST_TABLE.id : fallback.id,
    fromFallback: true,
  });
}

/** What SPEC 4.12 offers a player whose balance fell below the table minimum. */
export interface BustOut {
  /** True when the balance is below the current table's minimum. SPEC 4.12. */
  readonly out: boolean;
  /**
   * Tables below the current one that are unlocked and still affordable, lowest
   * first. Empty when the balance cannot afford any of them, which leaves the
   * reset as the only way on. SPEC 4.12: "drop to a lower table if they can
   * still afford it".
   */
  readonly lowerTables: readonly TableId[];
  /** SPEC 4.12: the free reset restores the starting bankroll. */
  readonly resetTo: number;
  /** SPEC 4.12: the reset seats the player at the lowest table. */
  readonly resetTable: TableId;
}

/**
 * SPEC 4.12's bust-out, as a question about a balance rather than a screen.
 *
 * The reset is offered on every answer, not only when `lowerTables` is empty,
 * because SPEC 4.12 gives the player both routes and item `L4` at `BJ-21` says
 * the reset is free, unlimited and always available. Which of the two the
 * player takes, and the screen that asks, are `C4` at `BJ-20`.
 */
export function bustOut(current: TableId, bestBalance: number, chips: number): BustOut {
  const limits = tableLimits(current);
  // Keyed on the id rather than on object identity: `indexOf` answering -1 is a
  // legal `slice` argument, so a miss would quietly turn "the tables below mine"
  // into "all but the last" rather than failing.
  const index = TABLES.findIndex((table) => table.id === current);
  const lower = TABLES.slice(0, index).filter((table) =>
    canEnter(table.id, bestBalance, chips),
  );
  return Object.freeze({
    out: chips < limits.minimum,
    lowerTables: Object.freeze(lower.map((table) => table.id)),
    resetTo: STARTING_CHIPS,
    resetTable: LOWEST_TABLE.id,
  });
}

// ---------------------------------------------------------------------------
// SPEC 4.11: the betting controls, as arithmetic
// ---------------------------------------------------------------------------

/**
 * Why an operation was refused. SPEC 4.11 requires a reason on each of them.
 *
 * A value rather than a sentence, because the sentence is the chrome's: `B15` at
 * `BJ-15` grades a rejection the player can read, and `C2` at `BJ-7` grades that
 * a rejected action changes no state and surfaces a reason at all. Both need
 * something to render, and neither can render a boolean.
 */
export type Refusal =
  /** Deal with nothing wagered. SPEC 4.11: "dealing without a valid wager". */
  | 'no-wager'
  /** A wager off the 10 grid, which no tap, `Max` or `Repeat` can build. */
  | 'off-grid'
  /** Over `min(tableMax, chips)`. SPEC 4.11 rejects, and never clamps. */
  | 'above-ceiling'
  /** Under the table minimum. SPEC 4.11 blocks Deal, and never raises it. */
  | 'below-minimum'
  /** `Repeat` before any round has been dealt. */
  | 'nothing-to-repeat'
  /** A double or split increment the balance cannot fund. SPEC 4.5, 4.6. */
  | 'insufficient-chips';

/** A wager the controls accepted, or the reason they did not. */
export type BetResult =
  | { readonly ok: true; readonly wager: number }
  | { readonly ok: false; readonly reason: Refusal };

function accepted(wager: number): BetResult {
  return Object.freeze({ ok: true, wager });
}

function refused(reason: Refusal): BetResult {
  return Object.freeze({ ok: false, reason });
}

/**
 * The ceiling no wager may pass. SPEC 4.11: `min(table maximum, balance)`.
 *
 * The balance is in it because the wager leaves the balance at the deal, so a
 * wager above it could not be paid for. Both halves in one function, because a
 * caller that took the table maximum alone would let the player commit money
 * they do not have and the deficit would surface as a negative balance.
 */
export function wagerCeiling(limits: TableLimits, chips: number): number {
  return Math.min(limits.maximum, chips);
}

/**
 * Whether a chip may be offered at all. SPEC 4.11: "chips whose denomination
 * alone exceeds that ceiling render disabled".
 *
 * The denomination alone, not the denomination on top of the current wager. A
 * 500 chip at a Bronze table is disabled because 500 can never be wagered
 * there; a 50 chip on a wager of 80 at that table is enabled and its tap is
 * *rejected*, which is a different thing the player is allowed to attempt.
 * Rendering either state is item `B15` at `BJ-15`.
 */
export function chipEnabled(chip: ChipDenomination, limits: TableLimits, chips: number): boolean {
  return chip <= wagerCeiling(limits, chips);
}

/**
 * A chip tap. SPEC 4.11: adds the denomination, or is rejected with a reason.
 *
 * **Rejected, never clamped**, which is the whole point of returning a result
 * instead of a number. Clamping to the ceiling would put a wager on the board
 * the player did not build, and at a table maximum that is not a multiple of a
 * denomination it would also be the one way a tap could leave the 10 grid.
 * The caller keeps the wager it already had; nothing here can change it.
 */
export function tapChip(
  wager: number,
  chip: ChipDenomination,
  limits: TableLimits,
  chips: number,
): BetResult {
  if (!isChipDenomination(chip)) {
    throw new RangeError(`SPEC 4.11 offers 10, 50, 100 and 500; ${String(chip)} is not a chip`);
  }
  const next = wager + chip;
  if (next > wagerCeiling(limits, chips)) {
    return refused('above-ceiling');
  }
  return accepted(next);
}

/**
 * `Max`. SPEC 4.11: `floor(min(tableMax, chips) / 10) * 10`.
 *
 * The floor is the only rounding in this game and it exists so that `Max` can
 * never produce a wager off the 10 grid: a balance of 137 at a Bronze table
 * maxes to 100, and a balance of 45 to 40 rather than to 45. The `min` is the
 * half that is easy to drop, and dropping it maxes to the table's ceiling on a
 * balance that cannot cover it.
 *
 * Returns 0 below the smallest chip, which is a legal wager to hold and not a
 * legal one to deal: `dealRefusal` blocks it, and SPEC 4.12's bust-out is the
 * answer the player actually needs there.
 */
export function maxWager(limits: TableLimits, chips: number): number {
  return Math.floor(wagerCeiling(limits, chips) / WAGER_GRID) * WAGER_GRID;
}

/**
 * `Repeat`. SPEC 4.11: "previous round's wager if affordable".
 *
 * **"Affordable" is read as the whole ceiling, not the balance alone.** SPEC
 * 4.11 blocks "any wager above the balance or the table maximum" and promises
 * that only `Max` and `Repeat` compute a value and that both compute a legal
 * one. Reading affordability as the balance alone breaks that promise the first
 * time a player carries a 2,000 wager from Gold to a Silver table they can
 * easily afford, so the previous wager is checked against `min(tableMax, chips)`
 * and refused as `above-ceiling` when it passes either half.
 *
 * The table **minimum** is deliberately not consulted. A wager below it is a
 * legal wager that Deal refuses, per SPEC 4.11's "blocked below the minimum,
 * never raised to it", so a 10 repeated at a Silver table lands on the board at
 * 10 and the player taps up to 50. Raising it here would be the same defect as
 * clamping a tap, in the one control that is allowed to compute.
 */
export function repeatWager(previous: number, limits: TableLimits, chips: number): BetResult {
  if (previous <= NO_WAGER) {
    return refused('nothing-to-repeat');
  }
  if (previous > wagerCeiling(limits, chips)) {
    return refused('above-ceiling');
  }
  return accepted(previous);
}

/**
 * Why Deal is blocked, or `null` when it is not. SPEC 4.11.
 *
 * The order of the four checks is the order of how hard the bound is. A wager
 * of zero is not a wager at all. The grid is next because a wager off it cannot
 * have come from any control in this module and is the one defect that reaches
 * settlement as a half chip rather than as a visible refusal. The ceiling
 * outranks the minimum because it is the bound a tap enforces, so on a balance
 * below the table minimum the honest answer is that the money is not there
 * rather than that the wager is small.
 *
 * **Blocked, never raised.** Nothing here returns a corrected wager, and
 * `commitInitial` has no path that adjusts one.
 */
export function dealRefusal(wager: number, limits: TableLimits, chips: number): Refusal | null {
  if (wager <= NO_WAGER) {
    return 'no-wager';
  }
  if (wager % WAGER_GRID !== 0) {
    return 'off-grid';
  }
  if (wager > wagerCeiling(limits, chips)) {
    return 'above-ceiling';
  }
  if (wager < limits.minimum) {
    return 'below-minimum';
  }
  return null;
}

/**
 * Whether the balance covers one more wager of a given size. SPEC 4.5 and 4.6.
 *
 * "Chips available >= the hand's wager", which is the funding half of Double
 * Down and of Split. **One reading, and this is it.** `commitDouble` and
 * `commitSplit` below ask it before they spend, `strategy.ts` asks it to decide
 * whether the coach may recommend an action the player cannot pay for, and the
 * chrome at `BJ-15` asks it to grey the two controls out before they are
 * pressed. Three call sites and one comparison: the coach and the chrome cannot
 * ask the commits themselves, because a commit **spends** what it checks, and
 * three separate spellings of `>=` would agree until a house rule moved.
 *
 * Exported at `BJ-15` for the reason the `BJ-9` handoff gave: the chrome needed
 * the same answer, and a third inline reading is what the export exists to
 * prevent.
 */
export function canFund(wager: number, chips: number): boolean {
  return wager <= chips;
}

// ---------------------------------------------------------------------------
// The wallet
// ---------------------------------------------------------------------------

/** One hand's committed wager, as everything outside the wallet may read it. */
export interface HandWager {
  /**
   * The hand's current wager. SPEC 4.11: after a double it is the doubled
   * amount, and each hand of a split carries its own.
   */
  readonly wager: number;
  /** True once settlement has credited this hand. It stops being committed. */
  readonly settled: boolean;
}

/** A commitment the wallet accepted, or the reason it did not. */
export type CommitResult =
  | { readonly ok: true; readonly hand: number; readonly wager: number }
  | { readonly ok: false; readonly reason: Refusal };

/**
 * The wallet's state, as everything outside it is allowed to see it.
 *
 * `conserved` is the four-term identity of SPEC 4.11 and 4.7 computed from the
 * four fields above it, so a reader never has to assemble it and cannot assemble
 * it from three. It moves only by a settled outcome and by SPEC 4.12's reset,
 * which is the one deliberate injection in the game and the reason the soak
 * `H6` at `BJ-12` measures the movement rather than the value.
 */
export interface WalletReadout {
  /** The balance. SPEC 4.11 starts it at 1,000 and never lets it go negative. */
  readonly chips: number;
  /** The wager being built at the controls. Not yet committed. */
  readonly wager: number;
  /**
   * The initial wager of the round most recently dealt, for `Repeat`. Zero
   * before the first deal, which no committed wager can be.
   */
  readonly previousWager: number;
  /** Every unsettled hand's wager, summed. On the table, not in the balance. */
  readonly committed: number;
  /**
   * SPEC 4.7's insurance stake, while one is open. Zero before the offer is
   * taken and zero again once it has settled. Item `B11`.
   */
  readonly insuranceStake: number;
  /**
   * SPEC 4.7's unfunded part of an even-money stake, while one is outstanding.
   * Zero in every other case, and released at the round boundary. Item `B11`.
   */
  readonly deferredStake: number;
  /** `chips + committed + insuranceStake - deferredStake`. SPEC 4.11. */
  readonly conserved: number;
  /** The best chip balance ever reached. SPEC 6 keys every unlock to it. */
  readonly bestBalance: number;
  /** This round's hands, in the order they were committed. SPEC 4.6. */
  readonly hands: readonly HandWager[];
}

/** The whole contract. Phases, cards and intents are `BJ-7`'s and `BJ-8`'s. */
export interface Wallet {
  /** The state, for a readout, for the round result and for a test. */
  readout(): WalletReadout;
  /** SPEC 4.11's chip tap. Rejected over the ceiling, and changes nothing. */
  tap(chip: ChipDenomination, limits: TableLimits): BetResult;
  /** SPEC 4.11's Clear. Cannot fail: zero is always a legal wager to hold. */
  clear(): BetResult;
  /** SPEC 4.11's Max. Always legal, and always on the 10 grid. */
  max(limits: TableLimits): BetResult;
  /** SPEC 4.11's Repeat, against the wager the last deal committed. */
  repeat(limits: TableLimits): BetResult;
  /**
   * The deal. SPEC 4.11: the pending wager leaves the balance and becomes hand
   * 0's. The only wager the table minimum and maximum govern.
   */
  commitInitial(limits: TableLimits): CommitResult;
  /** SPEC 4.5's Double. The increment leaves the balance when it is accepted. */
  commitDouble(hand: number): CommitResult;
  /** SPEC 4.6's Split. The new hand's equal wager leaves the balance too. */
  commitSplit(hand: number): CommitResult;
  /**
   * SPEC 4.7's insurance stake. Only `min(chips, stake)` leaves the balance and
   * the shortfall becomes `deferredStake`. The identity does not move.
   */
  takeInsurance(stake: number): void;
  /**
   * SPEC 4.7's side wager settled. Credits `stake + net`, so the identity moves
   * by exactly `net` and the balance can only rise. Returns the credit.
   */
  settleInsurance(net: number): number;
  /**
   * Settlement. SPEC 4.11 credits back `wager + net`, so the hand stops being
   * committed and the identity moves by exactly `net`. Returns the credit.
   */
  settleHand(hand: number, net: number): number;
  /**
   * The round boundary. Every hand must have settled and any side wager must
   * have resolved. SPEC 4.7's unfunded remainder is released here.
   */
  endRound(): void;
  /** SPEC 4.12's free reset: 1,000 chips, and the high-water mark survives. */
  reset(): void;
}

/** What a wallet is built from. Only the high-water mark carries over. */
export interface WalletOptions {
  /**
   * A persisted best chip balance. SPEC 13 persists this and not the balance,
   * so a fresh launch starts at 1,000 with the unlocks it had.
   */
  readonly bestBalance?: number;
}

/**
 * A wallet. SPEC 4.11, 4.12 and 6, items `J1` and `J2`.
 *
 * Refuses a best balance that is not a whole number of chips at or above the
 * starting bankroll, for the reason `tableLimits` refuses an unknown table name:
 * a persisted figure has been through `JSON.parse` and carries no type. A `NaN`
 * accepted here would lock every table forever and read as a game with no
 * progression rather than as a corrupt save. Item `I2` at `BJ-11` is what stops
 * one reaching this call.
 */
export function createWallet(options: WalletOptions = {}): Wallet {
  const carried = options.bestBalance ?? STARTING_CHIPS;
  if (!Number.isInteger(carried) || carried < STARTING_CHIPS) {
    throw new RangeError(
      `a persisted best balance is a whole number of chips at or above ${String(STARTING_CHIPS)}; ` +
        `${String(carried)} is not`,
    );
  }

  let chips = STARTING_CHIPS;
  let bestBalance = carried;
  let wager: number = NO_WAGER;
  let previousWager: number = NO_WAGER;

  /** This round's hands. Cleared at the round boundary, never before. */
  const hands: { wager: number; settled: boolean }[] = [];

  /**
   * SPEC 4.7 and 4.11's third and fourth terms. Held here from `BJ-6` rather
   * than left out, so that `BJ-8` moved two numbers instead of reshaping the
   * identity, which is exactly what it did.
   */
  let insuranceStake = 0;
  let deferredStake = 0;

  /** The high-water mark of SPEC 6. It rises and never falls. */
  function recordBest(): void {
    if (chips > bestBalance) {
      bestBalance = chips;
    }
  }

  function committed(): number {
    return hands.reduce((total, hand) => (hand.settled ? total : total + hand.wager), 0);
  }

  /**
   * A hand by index, or a thrown error.
   *
   * An index no hand carries is a caller defect rather than a player action, so
   * it is refused the way `shoe.ts` refuses a deck count it does not deal. A
   * `Refusal` would put it on screen as something the player did wrong.
   */
  function handAt(index: number): { wager: number; settled: boolean } {
    const found = hands[index];
    if (found === undefined) {
      throw new RangeError(
        `hand ${String(index)} is not in play; this round has ${String(hands.length)}`,
      );
    }
    return found;
  }

  /** Apply a computed wager, or leave the board exactly as it was. */
  function apply(result: BetResult): BetResult {
    if (result.ok) {
      wager = result.wager;
    }
    return result;
  }

  function readout(): WalletReadout {
    return Object.freeze({
      chips,
      wager,
      previousWager,
      committed: committed(),
      insuranceStake,
      deferredStake,
      conserved: chips + committed() + insuranceStake - deferredStake,
      bestBalance,
      hands: Object.freeze(
        hands.map((hand) => Object.freeze({ wager: hand.wager, settled: hand.settled })),
      ),
    });
  }

  function tap(chip: ChipDenomination, limits: TableLimits): BetResult {
    return apply(tapChip(wager, chip, limits, chips));
  }

  function clear(): BetResult {
    return apply(accepted(NO_WAGER));
  }

  function max(limits: TableLimits): BetResult {
    return apply(accepted(maxWager(limits, chips)));
  }

  function repeat(limits: TableLimits): BetResult {
    return apply(repeatWager(previousWager, limits, chips));
  }

  /**
   * The deal. The pending wager is validated once, here, and then leaves the
   * balance: there is no path that commits a wager `dealRefusal` did not clear,
   * which is what keeps an off-grid wager out of `settle()`.
   *
   * The controls go back to empty, because the wager has stopped being a wager
   * the player is building and become hand 0's. Carrying it into the next round
   * instead would leave SPEC 4.11's `Repeat` with nothing to do.
   *
   * **This is not a phase gate, and nothing in this module is.** A tap arriving
   * after the deal is accepted here and lands on the pending wager, because the
   * wallet has no phases to check it against. SPEC 4.11 blocks changing the
   * wager after the deal, and enforcing that belongs to the phase machine at
   * `BJ-7`: item `C2` grades that every action is accepted only where legal and
   * that a rejected one changes no state and surfaces a reason. `tap`, `clear`,
   * `max` and `repeat` are all gated there rather than here.
   */
  function commitInitial(limits: TableLimits): CommitResult {
    if (hands.length > 0) {
      throw new RangeError('the round already has hands; SPEC 4.11 commits one initial wager');
    }
    const reason = dealRefusal(wager, limits, chips);
    if (reason !== null) {
      return Object.freeze({ ok: false, reason });
    }
    const initial = wager;
    chips -= initial;
    previousWager = initial;
    wager = NO_WAGER;
    hands.push({ wager: initial, settled: false });
    return Object.freeze({ ok: true, hand: 0, wager: initial });
  }

  /**
   * SPEC 4.5's Double, and SPEC 4.11's "the double increment leaves the balance
   * when Double Down is accepted".
   *
   * The balance is the only bound. SPEC 4.11 governs the table maximum on the
   * initial wager alone and says in as many words that splits and doubles may
   * take the total committed above it. Whether the hand is eligible at all,
   * two cards and not a split Ace, is item `B9` at `BJ-8`.
   */
  function commitDouble(hand: number): CommitResult {
    const state = handAt(hand);
    if (state.settled) {
      throw new RangeError(`hand ${String(hand)} has settled and cannot take another chip`);
    }
    const increment = state.wager;
    if (!canFund(increment, chips)) {
      return Object.freeze({ ok: false, reason: 'insufficient-chips' });
    }
    chips -= increment;
    state.wager += increment;
    return Object.freeze({ ok: true, hand, wager: state.wager });
  }

  /**
   * SPEC 4.6's Split, and SPEC 4.11's "the split wager leaves it when Split is
   * accepted".
   *
   * The new hand is appended, so hands stay in the left-to-right order SPEC 4.6
   * plays them in. How many splits are allowed, and that the pair matches, are
   * item `B10` at `BJ-8`; this call knows only that a wager was funded.
   */
  function commitSplit(hand: number): CommitResult {
    const state = handAt(hand);
    if (state.settled) {
      throw new RangeError(`hand ${String(hand)} has settled and cannot be split`);
    }
    const equal = state.wager;
    if (!canFund(equal, chips)) {
      return Object.freeze({ ok: false, reason: 'insufficient-chips' });
    }
    chips -= equal;
    hands.push({ wager: equal, settled: false });
    return Object.freeze({ ok: true, hand: hands.length - 1, wager: equal });
  }

  /**
   * SPEC 4.7's insurance stake, taken out of the balance. Item `B11`.
   *
   * **The funded part is captured before the debit, and that ordering is the
   * whole of the arithmetic.** SPEC 4.7: "only `min(chips, stake)` leaves the
   * balance, and `deferredStake = stake - min(chips, stake)`". Reading `chips`
   * again after subtracting from it would compute the shortfall against a
   * balance that has already paid, which on a fully deferred stake reads zero
   * and quietly credits the player the whole stake for nothing.
   *
   * **The identity does not move here**, which is SPEC 4.7 in as many words:
   * "which the offer leaves unchanged and which moves only on a settled
   * outcome". `chips` falls by `funded`, `insuranceStake` rises by `stake` and
   * `deferredStake` rises by `stake - funded`, and the four-term sum is
   * unchanged by construction.
   *
   * Whether an offer may be taken at all is not this call's. SPEC 4.7 offers
   * ordinary insurance only when the balance covers the stake and offers even
   * money regardless of it, which is a rule about which offer is on the table
   * rather than about chips, so the round module holds it and item `B11` grades
   * it there. What is refused here is a second stake in one round, because SPEC
   * 4.7 makes exactly one offer and a second would be a caller defect.
   */
  function takeInsurance(stake: number): void {
    if (insuranceStake !== 0) {
      throw new RangeError('SPEC 4.7 offers one insurance stake per round, and one is already open');
    }
    if (!Number.isInteger(stake) || stake <= 0) {
      throw new RangeError(
        `SPEC 4.7 stakes a whole number of chips above zero; ${String(stake)} is not one`,
      );
    }
    const funded = Math.min(chips, stake);
    chips -= funded;
    insuranceStake += stake;
    deferredStake += stake - funded;
  }

  /**
   * SPEC 4.7's side wager settled, at the moment the peek decides it.
   *
   * The credit is `stake + net`, exactly parallel to `settleHand` below: SPEC
   * 4.7 says the balance is credited `3 x stake` on a dealer natural, which is
   * the stake returned plus the `+2 x stake` net, and 0 when the stake is lost,
   * which is the stake returned plus its own `-stake`. So the identity moves by
   * exactly `net` and the balance only ever rises.
   *
   * **The unfunded remainder is not touched here, and that is what keeps the
   * balance non-negative.** On the losing branch the credit is 0, so a balance
   * emptied to fund the stake is sitting at zero; subtracting the shortfall now
   * would take it below. `endRound` releases it instead, after every hand has
   * been credited, and SPEC 4.7 states the margin that makes that safe.
   *
   * The net comes in as a number for the reason `settleHand`'s does:
   * `settlement.ts`'s `settleInsurance(stake, dealerNatural)` is the only thing
   * that produces one, and this module has no opinion on which branch it came
   * from.
   */
  function settleInsurance(net: number): number {
    if (insuranceStake === 0) {
      throw new RangeError('no insurance stake is open; SPEC 4.7 settles the one that was taken');
    }
    const credit = insuranceStake + net;
    chips += credit;
    insuranceStake = 0;
    recordBest();
    return credit;
  }

  /**
   * SPEC 4.11: settlement credits back `wager + net`.
   *
   * The wager is credited because it already left at the deal. A losing hand
   * nets `-wager` and credits back zero; nothing here subtracts it twice. The
   * hand keeps its wager after settling so the round result can print it, and
   * stops counting toward `committed`, which is what makes the identity move by
   * exactly `net`.
   *
   * The net comes in as a number rather than as a `HandSettlement`, so the
   * wallet has no opinion on which rung produced it and `settlement.ts` has none
   * on balances. Insurance credits arrive by the same route at `BJ-8`.
   */
  function settleHand(hand: number, net: number): number {
    const state = handAt(hand);
    if (state.settled) {
      throw new RangeError(`hand ${String(hand)} has already settled; SPEC 4.10 settles each once`);
    }
    const credit = state.wager + net;
    chips += credit;
    state.settled = true;
    recordBest();
    return credit;
  }

  /**
   * The round boundary, called once after every hand has settled.
   *
   * It refuses to close a round with money still on the table, for the reason
   * `shoe.ts` puts the reshuffle at `endRound` rather than mid-round: the wallet
   * cannot see a hand being abandoned, so the discipline has to be enforced
   * where it is visible. The round module at `BJ-8` owns that ordering, and an
   * open insurance stake is refused on the same grounds: SPEC 4.7 resolves the
   * side wager at the peek, so one still open at the boundary is a round that
   * skipped it.
   *
   * **SPEC 4.7's unfunded remainder is released here, and here is the only place
   * it can be.** "Settlement credits the insurance result and subtracts
   * `deferredStake`." Subtracting it anywhere earlier can take the balance
   * negative, because the branch that loses the side wager credits nothing; by
   * the time this function runs, the checks above have already proved that every
   * credit the round is owed has landed. The release moves no money in the
   * conserved sense: `chips` falls by the remainder and `deferredStake` falls to
   * zero, and the four-term identity subtracts that term, so the sum is
   * unchanged. It is the accounting catching up with a stake that was never
   * fully paid, not an outcome.
   */
  function endRound(): void {
    const unsettled = hands.filter((hand) => !hand.settled).length;
    if (unsettled > 0) {
      throw new RangeError(
        `${String(unsettled)} hand(s) are still committed; SPEC 4.10 settles every hand`,
      );
    }
    if (insuranceStake !== 0) {
      throw new RangeError(
        'an insurance stake is still open; SPEC 4.7 settles it immediately after the peek',
      );
    }
    chips -= deferredStake;
    deferredStake = 0;
    hands.length = 0;
  }

  /**
   * SPEC 4.12's free bankroll reset.
   *
   * The high-water mark is untouched, which is item `J2`: the unlocks are keyed
   * to it, so they survive the reset without being copied anywhere. Lifetime
   * statistics and milestones survive it too and live in other modules;
   * `statistics.ts` arrives at `BJ-10` with `J6` on the milestones and `J5` on
   * the hand history, and `C4` at `BJ-20` grades the whole preservation clause.
   * Nothing is invented here to stand in for them.
   *
   * **The mark is not re-read here, because it cannot have moved.** A reset only
   * ever raises the balance to 1,000 and no wallet can hold a mark below 1,000:
   * `createWallet` refuses one and the mark only rises. A `recordBest` call here
   * would be a guard that can never fire, which is a line no test can cover and
   * no mutation can break.
   *
   * The pending wager goes back to zero because SPEC 4.12 seats the player at
   * the lowest table, and a wager built against the old table's limits means
   * nothing at the new one. It refuses to run mid-round for the same reason
   * `endRound` does: a reset with chips still committed would create the
   * difference out of nothing.
   *
   * **Both of `endRound`'s conditions, not just the hands one.** An open
   * insurance stake or an unpaid deferred remainder is money the identity is
   * still counting, and raising `chips` to 1,000 underneath either of them adds
   * that term to the conserved total out of nothing. No caller can reach that
   * state today, because `table.ts` only takes a side wager with a hand in play,
   * but that is the caller's shape rather than this module's guarantee, and the
   * rest of the file refuses to lean on it.
   */
  function reset(): void {
    if (hands.length > 0) {
      throw new RangeError('a reset with hands in play would create chips; settle the round first');
    }
    if (insuranceStake !== 0 || deferredStake !== 0) {
      throw new RangeError(
        'a reset with a side wager open would create chips; SPEC 4.7 settles it first',
      );
    }
    chips = STARTING_CHIPS;
    wager = NO_WAGER;
  }

  return Object.freeze({
    readout,
    tap,
    clear,
    max,
    repeat,
    commitInitial,
    commitDouble,
    commitSplit,
    takeInsurance,
    settleInsurance,
    settleHand,
    endRound,
    reset,
  });
}
