/**
 * The two pieces of machine-driving scaffolding the unit suites share.
 *
 * Neither carries a game rule, a spec figure or an expected value: `bounded` is
 * a turn counter and `acceptResult` / `acceptIntent` turn a refusal into a
 * failure with the refusal's own words in it. That is why they belong here and
 * the things beside them do not. The reference implementations in
 * `tests/unit/reference/`, the negative controls and the transcribed alphabets
 * are deliberately duplicated, because a second reading is the evidence; these
 * two were copied twelve times each because nobody had put them anywhere.
 *
 * **`LOOP_LIMIT` stays with the file that spends it.** The budgets really do
 * differ, 500 through 40,000 across the suites, and a shared default would be a
 * number chosen for the wrong file. It is a parameter here so that each caller
 * still states its own, and the failure message is the same sentence the twelve
 * copies produced, so nothing a red run prints has changed.
 *
 * **This file has a control, and it is `tests/unit/drive.test.ts`.** Twelve
 * private copies each had one caller; one shared copy has 47, so a broken guard
 * here is silent rather than loud, and nothing in the suite is currently refused
 * for a mutation entry to grade. The control drives both primitives directly
 * against a constructed refusal and a constructed acceptance.
 */

import type { IntentResult, Table } from '../../../src/core/table';
import type { Intent } from '../../../src/core/types';

/**
 * A turn counter that throws once the drive has taken too many.
 *
 * The house pattern for every loop that drives the machine: a stall has to fail
 * loudly and name what it was doing, rather than hang the runner.
 */
export function bounded(label: string, limit: number): () => void {
  let turns = 0;
  return () => {
    turns += 1;
    if (turns > limit) {
      throw new RangeError(`${label} did not finish inside ${String(limit)} turns`);
    }
  };
}

/**
 * Require a result to be an acceptance, and hand it back.
 *
 * For the call sites that already hold the result, usually because they go on
 * to read the wager or the hand index out of it.
 */
export function acceptResult(result: IntentResult): IntentResult {
  if (!result.ok) {
    throw new Error(`${result.kind} was refused by ${result.layer} as ${result.reason}`);
  }
  return result;
}

/**
 * Apply an intent and require the machine to accept it.
 *
 * The same sentence as `acceptResult`'s: a refusal carries the kind it refused,
 * so naming the intent and naming the result give the same words.
 */
export function acceptIntent(table: Table, intent: Intent): void {
  acceptResult(table.apply(intent));
}
