/**
 * The house-rule record: the settings that change how a round plays. SPEC 14,
 * and the rules of SPEC 4.1, 4.6, 4.7 and 4.8 that each toggle governs.
 *
 * DESIGN section 1 gives this module "the house-rule record that everything else
 * reads", and it is on that list rather than invented for `BJ-8`. It is built
 * here because `B9`, `B10`, `B11` and `B12` each name a toggle in their own
 * criterion and none of them owns it: Double after split is `B10`'s clause and
 * `B9`'s availability rule at once, and surrender's toggle is `B12`'s while the
 * shoe size is `B2`'s. A record none of them owns is the only place all five can
 * read the same answer.
 *
 * **No item claims this file.** The toggles are graded through the rules they
 * change, which is where a wrong default is visible: `B9` and `B10` on Double
 * after split, `B10` on the split comparison, `B11` on even money, `B12` on
 * surrender and `B2` on the shoe size. Item `J3` at `BJ-9` reads this same record
 * to generate the coach's table for **8 rule combinations**, which is shoe size
 * crossed with Double after split crossed with surrender; the record it reads is
 * this one and not a second list assembled there.
 *
 * **Five fields, and each one is a sentence SPEC 14 puts in the Settings panel.**
 * SPEC 14 lists twelve settings; seven of them are the coach mode, Speed, the
 * play-surface size, sound, theme, reduced motion and Reset all data, and not one
 * of those can change an outcome. SPEC 14 says so in as many words: "House-rule
 * changes take effect at the start of the next round, never mid-round" and
 * "Speed and play-surface size are presentation settings". So the split is not a
 * judgement call: what is here is what a round's result depends on.
 *
 * **S17 is deliberately not a field.** SPEC 4.9 is one comparison with "no
 * special case", the hit-soft-17 variant is named there and rejected, SPEC 14
 * offers no toggle for it, and the rule is printed on the felt. A field here
 * would be a second reading of SPEC 4.9 that `dealer.ts` has no branch for, and
 * `tests/unit/dealer-policy.test.ts` runs the variant as a **negative control**
 * that must disagree with the shipped policy. SPEC 7 lists S17 among what the
 * coach must be correct for because the coach's chart depends on it, not because
 * it moves; `J3`'s 8 combinations are 2 x 2 x 2 and S17 is not one of the three.
 *
 * **Nothing here is applied mid-round.** SPEC 14: house-rule changes take effect
 * at the start of the next round. A record is handed to `createTable` and is read
 * from there on; swapping one in mid-round is a caller defect that the table has
 * no setter for, which is the same stance it takes on the phase.
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { SplitRule } from './hand';
import type { DeckCount } from './shoe';
import { DEFAULT_DECKS } from './shoe';

/**
 * The house rules a round is played under. SPEC 14.
 *
 * Every field is `readonly`, so a record handed to a table cannot be edited
 * underneath it and turn a rule change into something that happened mid-round.
 */
export interface HouseRules {
  /**
   * The shoe size. SPEC 4.1: 6 or 8, and there is no third.
   *
   * Here rather than beside the shoe because SPEC 14 puts it first in the
   * Settings panel and SPEC 7 puts it first in what the coach reads. The type
   * is `shoe.ts`'s, so a count outside the two is not expressible.
   */
  readonly decks: DeckCount;
  /**
   * Double after split. SPEC 4.6: "permitted. House-rule toggle, default on."
   *
   * It gates Double Down on a hand created by a split, which is `B9`'s
   * availability rule and `B10`'s last clause.
   */
  readonly doubleAfterSplit: boolean;
  /** Late surrender. SPEC 4.8: "House-rule toggle, default on." Item `B12`. */
  readonly surrender: boolean;
  /**
   * Even money on a player natural against a dealer Ace. SPEC 4.7: "House-rule
   * toggle, default on." Item `B11`.
   *
   * Off, the offer is still made on a dealer Ace, because insurance and even
   * money are the same side wager under SPEC 4.7 and only the 1:1 framing goes
   * away. What changes is that a player holding a natural is offered it on the
   * ordinary terms, which means it is offered only if the balance covers the
   * stake and no shortfall can be deferred.
   */
  readonly evenMoney: boolean;
  /**
   * How SPEC 4.6 compares a hand's first two cards for a split.
   *
   * "Offered when a hand's initial two cards have equal value, so any two
   * ten-value cards may be split. Configurable to equal rank; default is equal
   * value." The comparison itself is `hand.ts`'s `canSplit`, and this field is
   * only which of its two readings is in force.
   */
  readonly splitRule: SplitRule;
}

/**
 * The defaults SPEC 4.1, 4.6, 4.7, 4.8 and 14 give, and nothing chosen here.
 *
 * Every value is quoted from a section that states it: 6 decks from SPEC 4.1,
 * "default on" three times from SPEC 4.6, 4.7 and 4.8, and "default is equal
 * value" from SPEC 4.6. Frozen, because a shared record that a caller could edit
 * would change the rules of every table already sitting on it.
 */
export const DEFAULT_RULES: HouseRules = Object.freeze({
  decks: DEFAULT_DECKS,
  doubleAfterSplit: true,
  surrender: true,
  evenMoney: true,
  splitRule: 'equalValue',
});

/**
 * A complete record from a partial one, filling every omission from the
 * defaults above.
 *
 * The whole reason `TableOptions` can take `rules` as a partial: a test or a
 * settings panel that turns one toggle off should not have to restate the other
 * four, and restating them is how a default drifts out of a caller rather than
 * out of SPEC. Frozen for the reason `DEFAULT_RULES` is.
 */
export function houseRules(overrides: Partial<HouseRules> = {}): HouseRules {
  return Object.freeze({ ...DEFAULT_RULES, ...overrides });
}
