/**
 * The table: SPEC 10's eleven phases, the one entry point every action goes
 * through, the intent queue, the timers, and the round those phases play out.
 * Items `C2` (Critical) at `BJ-7`, and `B6`, `B9`, `B10`, `B11` and `B12` at
 * `BJ-8`.
 *
 * DESIGN section 2 makes this module "the only authority" and everything else
 * an observer, and DESIGN section 3 gives the per-frame order it runs in. Both
 * are here and nowhere else.
 *
 * **`BJ-7` built the machine and `BJ-8` built the moves.** The phase union,
 * `apply`, the queue and the timers are unchanged; what joined them is the deal
 * of SPEC 4.3, the five player actions of SPEC 4.5, the split of SPEC 4.6, the
 * side wager of SPEC 4.7, the surrender of SPEC 4.8 and the settlement of SPEC
 * 4.10 wired through `settlement.ts`. Every one of the nine expressions `BJ-7`
 * listed as inert is now reached and can answer two ways, and every one of them
 * carries a mutation entry.
 *
 * **There is no way to put this machine in a phase.** It opens at SPEC 10's
 * `start`, the returned object carries no setter, and every one of the other ten
 * phases is entered by an accepted intent or by a timed step written here. The
 * one datum a caller supplied at `BJ-7`, the dealer's up card, is gone: the
 * `dealerUp` step draws a card from the shoe and the up card is that card's
 * rank, so the branch reads what was dealt and nothing outside can choose it.
 *
 * **The randomness is the seeded stream and nothing else.** SPEC 4.1 and item
 * `M3`: the table takes a seed, builds one session stream from it and hands that
 * stream to the shoe, which splits its own child off it. There is no second
 * consumer yet, and when one arrives it takes its own `split()` rather than
 * sharing the shoe's, which is what keeps a seeded deal stable against a
 * consumer added later. A shoe may be injected instead, which is how a test
 * puts a known pair in front of a known up card without hunting for a seed.
 *
 * **Legality is checked first, and it is checked here.** SPEC 4.11 blocks
 * "changing the wager after the deal" and "acting after the round ends", and
 * `wallet.ts` deliberately holds neither: its own header says in as many words
 * that it is not a phase gate and that `tap`, `clear`, `max` and `repeat` are
 * gated at `BJ-7`. So all four are gated here, by phase, before anything else is
 * consulted. A rejection carries which layer refused it, because "the screen has
 * gone", "not on this hand" and "the wager is over the ceiling" are three
 * different sentences to put in front of a player and `B15` at `BJ-15` has to
 * tell them apart.
 *
 * **A rejection is a value and mutates nothing.** Every refusal a player can
 * reach comes back as an `IntentResult`, in the house style of `shoe.ts` and
 * `wallet.ts`. The `RangeError` throws in this file are caller defects, and
 * `wallet.ts`'s handoff is what makes the distinction matter: a second initial
 * commit, settling a hand twice, closing a round with a hand unsettled, closing
 * one with the side wager still open and a reset mid-round are all throws there,
 * and this module's phase and availability gates are exactly what makes every
 * one of them unreachable from any player action in any phase.
 *
 * **The offer closes before the peek result is applied.** SPEC 4.4, and it is
 * the reason `insurance` is a phase rather than a step inside `peek`. The
 * dealing branch asks `offersInsurance(up)` first and only ever calls `peek`
 * inside the `peek` phase, which is the ordering `dealer.ts` documented and
 * could not enforce, because it has no phases to enforce it with. SPEC 4.7's
 * side wager is then resolved in that same step, immediately after the peek, on
 * both of its paths.
 *
 * **Every timer is a float accumulator and there is no clock in this file.**
 * DESIGN section 3: no `setTimeout` drives game state, no frame counter exists,
 * and queued work drains in a `while` loop against the accumulator so wall
 * clock pacing survives a stutter. `update(dt)` is handed the delta by whoever
 * owns the loop, which is `main.ts` at `BJ-15`, and clamps it per QUALITY-BAR
 * section 7 before it is believed.
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { Card, Rank } from './cards';
import { isAce } from './cards';
import { offersInsurance, peek, peeksOn, shouldHit } from './dealer';
import { TARGET, canSplit, handValue, isBust, isNatural } from './hand';
import { createRng } from './rng';
import type { HouseRules } from './rules';
import { houseRules } from './rules';
// `settleInsurance` is aliased because `wallet.ts` exposes a method of the same
// name that answers a different question: this one turns a stake and the peek's
// bit into a net, and the wallet's turns a net into a balance movement.
import type { DealerHand, PlayerHand } from './settlement';
import { settleInsurance as insuranceNet, settle } from './settlement';
import type { Shoe, ShoeReadout } from './shoe';
import { createShoe } from './shoe';
import type {
  DealStep,
  HandInPlay,
  HandState,
  InsuranceOffer,
  InsuranceResult,
  Intent,
  IntentKind,
  Phase,
  PhaseKind,
  PlayerAction,
  SettledHand,
} from './types';
import type { Refusal, TableId, TableLimits, Wallet, WalletReadout } from './wallet';
import { LOWEST_TABLE, NO_WAGER, bustOut, canEnter, createWallet, tableLimits } from './wallet';

// ---------------------------------------------------------------------------
// SPEC 5: the reference timings, all tunable constants in one place
// ---------------------------------------------------------------------------

/**
 * SPEC 5's seven reference timings, in seconds. "All tunable constants in one
 * place" is that section's own instruction, and this is the place.
 *
 * They are in `core/` rather than beside the design tokens because they are
 * game pacing and not presentation: they decide the **sequence of states** the
 * machine passes through and how long each one lasts, which SPEC 5 says
 * reduced motion must not change. `E1`'s token layer under `render/` and
 * `ui/` owns the durations of the animations that play inside these windows,
 * and the `core/` boundary already forbids this file from reaching them.
 *
 * Four of the seven pace a phase below. `cardTravel` and `handRecentre` are
 * tween lengths with no phase of their own, and `holeCardFlip` is both: it is
 * the flip's own duration and, through `PEEK_PAUSE`, the length of the peek.
 * They are all here because SPEC 5 asks for one place, and a constant kept
 * somewhere else is the one that drifts.
 */
export const TIMINGS = Object.freeze({
  /** SPEC 5: 0.22 s between the cards of the opening deal. */
  dealInterval: 0.22,
  /** SPEC 5: 0.28 s of arc travel per card. A tween, not a phase. */
  cardTravel: 0.28,
  /** SPEC 5: 0.30 s for the hole card's horizontal-scale flip. */
  holeCardFlip: 0.3,
  /** SPEC 5: 0.18 s to re-centre a hand. A tween, not a phase. */
  handRecentre: 0.18,
  /** SPEC 5: 0.45 s of pause before the dealer plays. */
  revealPause: 0.45,
  /** SPEC 5: 0.65 s between the dealer's draws, so a player can follow them. */
  dealerDrawInterval: 0.65,
  /** SPEC 5: 0.55 s of pause while the hands settle. */
  settlePause: 0.55,
});

/**
 * What Fast multiplies every pacing constant above by. SPEC 5.
 *
 * Named beside them because SPEC 5 puts it there and because a multiplier
 * defined next to the control that toggles it would be a second copy of a
 * number the simulation has to agree with. **Nothing here reads it yet**:
 * applying it needs the Settings control and a persisted value, and item `E9`
 * at `BJ-14` grades the whole clause, that Fast multiplies every pacing
 * constant by 0.6, applies in both motion modes, persists, and changes neither
 * the sequence of states nor any outcome.
 */
export const FAST_SPEED_MULTIPLIER = 0.6;

/**
 * How long the `peek` phase lasts, on both of its branches.
 *
 * SPEC 5 lists no peek constant, so this is derived rather than invented: the
 * peek is the dealer looking at the hole card, so it is paced by the hole
 * card's own flip and no new number enters the game. **One constant and no
 * branch** is the part of SPEC 4.4's "no tell, no timing difference" that a
 * headless module can hold; the motion half of that sentence is item `E6` at
 * `BJ-14`, whose scripted capture takes a peek on both branches and requires
 * them identical in motion and pacing.
 *
 * **This binds once, so `E9`'s Speed setting must multiply at the consumption
 * site.** The value is read out of `TIMINGS` here at module load, and an alias
 * cannot follow a record that is later replaced or copied. So when `BJ-14`
 * applies Fast it multiplies the duration `timedStep` returns and nothing else.
 * A scaled copy of `TIMINGS` would shorten the deal and the reveal and leave
 * the peek at Normal speed, which is a peek whose length no longer matches the
 * pacing around it: the timing difference SPEC 4.4 forbids, graded by `E6`.
 */
export const PEEK_PAUSE = TIMINGS.holeCardFlip;

// ---------------------------------------------------------------------------
// QUALITY-BAR section 7: the delta a loop is allowed to believe
// ---------------------------------------------------------------------------

/**
 * The largest delta one `update` may consume. QUALITY-BAR section 7: 0.25 s.
 *
 * The number is not this file's to choose. `requestAnimationFrame` stops in a
 * backgrounded tab and resumes with a large gap, and QUALITY-BAR section 7
 * records that hazard measured at 275 px of travel in a single 250 ms hitch.
 * Clamping here means a resumed tab advances the round by one step rather than
 * by however long the player was away, which is also what makes item `C7` at
 * `BJ-20` reachable: hiding the tab must preserve state with no penalty.
 */
export const MAX_STEP = 0.25;

/**
 * The gap above which a delta is a resume rather than a frame. QUALITY-BAR
 * section 7: 5 s, dropped rather than consumed.
 *
 * Separate from the clamp because the two answer different questions. A 0.4 s
 * delta is a stutter and the game should still advance, one clamped step at a
 * time. A 30 s delta is a tab that was hidden, and consuming even one step of
 * it would move the round while nobody was looking.
 */
export const RESUME_GAP = 5;

/**
 * The delta `update` will act on. QUALITY-BAR section 7, all three clauses.
 *
 * Negative and non-finite deltas become zero, a gap past `RESUME_GAP` becomes
 * zero, and everything else is clamped to `MAX_STEP`. Exported because item
 * `M5` at `BJ-12` drives frame independence at 15, 30, 60, 144, 240 and 1000
 * fps and on an unstable clock including zero and negative deltas, and it
 * needs the same function the machine uses rather than a second reading of it.
 *
 * Zero and negative both return a positive zero, not `-0`. `-0 === 0` is true
 * while `Object.is(-0, 0)` is false, and the accumulator is compared by the
 * test runner's identity assertion.
 */
export function clampDelta(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) {
    return 0;
  }
  if (dt > RESUME_GAP) {
    return 0;
  }
  return Math.min(dt, MAX_STEP);
}

// ---------------------------------------------------------------------------
// SPEC 4.3: the opening deal, as a queue the dealing phase counts down
// ---------------------------------------------------------------------------

/**
 * SPEC 4.3's order: player, dealer up, player, dealer down.
 *
 * Four steps, and the queue is what makes `dealing` a paced phase rather than
 * an instant one. Item `B6` at `BJ-8` is the claim that the cards really
 * arrive, two to the player and two to the dealer, in this order, with the
 * second of the dealer's face down: `takeDealStep` below draws each one from
 * the shoe `BJ-3` built, and this list is the order it draws them in.
 */
export const OPENING_DEAL: readonly DealStep[] = Object.freeze([
  'playerCard',
  'dealerUp',
  'playerCard',
  'dealerHole',
]);

/** SPEC 4.7: the insurance stake is `wager / 2` of the initial wager. */
const INSURANCE_STAKE_DIVISOR = 2;

/**
 * The hand SPEC 4.4 guarantees is the only one in play at the peek.
 *
 * "The player holds exactly one hand carrying exactly the initial wager,
 * because the peek precedes split, double and surrender." Both the insurance
 * offer and the phase the peek hands play to are about that hand.
 */
const FIRST_HAND = 0;

/** SPEC 4.3: the dealer's first card, face up, and its second, face down. */
const UP_CARD = 0;
const HOLE_CARD = 1;

/**
 * How many cards a hand holds before it has acted. SPEC 4.5 and 4.8.
 *
 * Double Down is "exactly two cards" and surrender is "only on a hand's initial
 * two cards", and both are this number. It is also what SPEC 4.6 splits, which
 * `canSplit` in `hand.ts` already tests for itself.
 */
const INITIAL_CARDS = 2;

/**
 * SPEC 4.6: "At most 3 splits per round, producing at most 4 hands, counted
 * across the whole round, not per hand."
 *
 * One number, because the second is the first plus the original hand and a
 * second constant could disagree with it. `tests/unit/split.test.ts` derives
 * the four hands from the three splits rather than quoting either.
 */
const MAX_SPLITS = 3;

/** What `Array.prototype.findIndex` answers when nothing matches. */
const NOT_FOUND = -1;

/**
 * The seed a table takes when the composition root has not chosen one.
 *
 * `core/` has no clock and calls no `Math.random()`, so it cannot invent a seed
 * and must not try: item `M3` forbids the one and this module's own header
 * forbids the other. `main.ts` at `BJ-15` owns the composition and is where a
 * real session seed comes from. A constant here means a table built with no
 * options deals a fixed, reproducible round, which is what every test in the
 * suite wants and what `B16` at `BJ-12` grades.
 */
export const DEFAULT_SEED = 1;

// ---------------------------------------------------------------------------
// SPEC 10: which intents each phase allows, and no others
// ---------------------------------------------------------------------------

/**
 * SPEC 10's eleven phases, in that section's order. Exported so a caller and a
 * test can enumerate them without writing the list a second time.
 */
export const PHASE_KINDS: readonly PhaseKind[] = Object.freeze([
  'start',
  'betting',
  'dealing',
  'peek',
  'insurance',
  'playerTurn',
  'reveal',
  'dealerTurn',
  'settling',
  'roundResult',
  'bustOut',
]);

/** The eighteen intents SPEC 10's diagram offers, in phase order. */
export const INTENT_KINDS: readonly IntentKind[] = Object.freeze([
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
  'hit',
  'stand',
  'double',
  'split',
  'surrender',
  'nextHand',
  'dropTable',
  'resetBankroll',
]);

/**
 * SPEC 4.5's player actions, in SPEC 10's intent order. Seven of the eighteen.
 *
 * SPEC 8 asks a history entry for "every action taken", and this is the list of
 * what an action is: SPEC 4.5's six-row table, with SPEC 4.7's insurance row
 * read as the two intents SPEC 10 actually offers. Exported so a caller and a
 * test can enumerate them without writing the list a second time, next to
 * `INTENT_KINDS` and the legality table they are the subset of.
 *
 * **The two insurance intents are actions and the eleven others are not.**
 * Declining insurance is a decision the player made at a screen SPEC 10 gives
 * them, and it is the one action that leaves nothing behind to recover it from.
 * Choosing a table, building a wager, dealing and asking for the next hand are
 * screens and money, and SPEC 8 lists the wager as its own field.
 */
export const PLAYER_ACTIONS: readonly PlayerAction[] = Object.freeze([
  'takeInsurance',
  'declineInsurance',
  'hit',
  'stand',
  'double',
  'split',
  'surrender',
]);

/**
 * The action an intent counts as for SPEC 8's journal, or `null` when it is not
 * one of SPEC 4.5's.
 *
 * Here rather than at the recorder, so that what counts as an action is decided
 * once, inside `core/`, where a sweep over `INTENT_KINDS` can drive it. It is
 * the same shape as `strategy.actionOf` and deliberately not the same answer:
 * that one is SPEC 7's "decisions made", which basic strategy has an opinion
 * about and which excludes both insurance intents for the reason `CoachAction`
 * gives. Two questions, two lists, and folding them together would put an
 * insurance decision into the coach's accuracy.
 */
export function playerActionOf(kind: IntentKind): PlayerAction | null {
  const found = PLAYER_ACTIONS.find((action) => action === kind);
  return found ?? null;
}

/**
 * The legality table. SPEC 10's diagram, read as a row per phase.
 *
 * **Deliberately not exported.** `C2`'s sweep writes this table out for itself
 * from SPEC 10 and compares the machine against it; a sweep that imported the
 * table would agree with any edit to it forever, which is the one failure a
 * legality test exists to prevent.
 *
 * **The five timed phases accept nothing at all.** SPEC 10 gives `dealing`,
 * `peek`, `reveal`, `dealerTurn` and `settling` no player action: each one is
 * a paced transition that `update` drives to its end. A control left live
 * across one of them is how a click aimed at the screen before it lands on the
 * screen after, which is the trap DESIGN section 3 names and item `C6` grades
 * end to end at `BJ-20`.
 *
 * **Every intent is legal in exactly one phase**, which is not a rule imposed
 * here but a property of SPEC 10: each control belongs to one screen. The
 * sweep derives it rather than assuming it, and `changeTable` joins `betting`
 * at `BJ-8` without disturbing it.
 */
const LEGAL: Readonly<Record<PhaseKind, readonly IntentKind[]>> = Object.freeze({
  start: Object.freeze<IntentKind[]>(['chooseTable', 'start']),
  betting: Object.freeze<IntentKind[]>([
    'tapChip',
    'clear',
    'repeat',
    'max',
    'changeTable',
    'deal',
  ]),
  dealing: Object.freeze<IntentKind[]>([]),
  peek: Object.freeze<IntentKind[]>([]),
  insurance: Object.freeze<IntentKind[]>(['takeInsurance', 'declineInsurance']),
  playerTurn: Object.freeze<IntentKind[]>(['hit', 'stand', 'double', 'split', 'surrender']),
  reveal: Object.freeze<IntentKind[]>([]),
  dealerTurn: Object.freeze<IntentKind[]>([]),
  settling: Object.freeze<IntentKind[]>([]),
  roundResult: Object.freeze<IntentKind[]>(['nextHand']),
  bustOut: Object.freeze<IntentKind[]>(['dropTable', 'resetBankroll']),
});

// ---------------------------------------------------------------------------
// What one attempted action comes back as
// ---------------------------------------------------------------------------

/**
 * Which layer refused an action.
 *
 * Three, and they are in a fixed order: the phase is asked first, then whether
 * the action is available at all, then the wallet, and no layer is asked once
 * one above it has said no. The distinction is the readable half of `C2`'s
 * "surfaces a reason": "you cannot bet now", "not on this hand" and "that is
 * more than the table takes" are three different sentences, and `B15` at
 * `BJ-15` renders the last of them.
 *
 * `availability` is `BJ-8`'s, and it holds the per-hand rules of SPEC 4.5, 4.6
 * and 4.8 that items `B9`, `B10` and `B12` name, SPEC 4.7's "only if chips
 * available >= the stake" on the insurance offer, and SPEC 10's "Change Table,
 * only with no wager placed". It sits **under** the phase gate, in the same
 * place the wallet sits, exactly as `BJ-7` said it would.
 */
export type RejectionLayer = 'phase' | 'availability' | 'wallet';

/**
 * Why an action was refused.
 *
 * `wrong-phase` is this module's own and is the whole of `C2`'s left-hand
 * side. The nine reasons after it are the availability layer's, one per clause
 * of SPEC 4.5, 4.6, 4.7, 4.8 and 10 that can turn an action down without any
 * money being involved. `table-locked` covers SPEC 6's entry rule and SPEC
 * 4.12's drop, both of which `wallet.ts` answers. The rest is `wallet.ts`'s
 * `Refusal` union unchanged, because SPEC 4.11's reasons belong to the module
 * that decides them and a second spelling of `above-ceiling` here would drift.
 *
 * **`insufficient-chips` is not respelled either.** SPEC 4.6 requires Split to
 * be "unavailable on that hand with the reason surfaced" when the balance
 * cannot cover it, and `wallet.ts` already decides exactly that question inside
 * `commitSplit`. So the availability layer does not ask it a second time: the
 * commit is attempted and its refusal is surfaced with the `wallet` layer on
 * it. Two readings of "can the balance cover this" is how one of them drifts.
 */
export type RejectionReason =
  /** The screen does not offer this control at all. SPEC 10. */
  | 'wrong-phase'
  /** SPEC 10: Change Table is offered "only with no wager placed". */
  | 'pending-wager'
  /** The hand has already stood, busted, doubled or surrendered. SPEC 4.5. */
  | 'hand-resolved'
  /** SPEC 4.5 and 4.6: no hit, no double and no resplit on a split Ace hand. */
  | 'split-aces'
  /** SPEC 4.5 and 4.8: Double and Surrender want a hand's first two cards. */
  | 'not-two-cards'
  /** SPEC 4.6: the two cards are not a pair under the house's comparison. */
  | 'not-a-pair'
  /** SPEC 4.6: at most 3 splits per round, counted across the whole round. */
  | 'split-limit'
  /** SPEC 4.8: surrender is "not available after a split". */
  | 'from-split'
  /** SPEC 4.8's house-rule toggle is off. */
  | 'surrender-off'
  /** SPEC 4.6's Double after split toggle is off. */
  | 'double-after-split-off'
  /** SPEC 6's entry rule, and SPEC 4.12's drop. */
  | 'table-locked'
  | Refusal;

/** An action the machine took, and the phase it left behind. */
export interface IntentAccepted {
  readonly ok: true;
  readonly kind: IntentKind;
  /** The phase after the action. The same one when the action stayed put. */
  readonly phase: PhaseKind;
}

/** An action the machine refused, with the layer that refused it. */
export interface IntentRejected {
  readonly ok: false;
  readonly kind: IntentKind;
  readonly layer: RejectionLayer;
  readonly reason: RejectionReason;
}

/** What `apply` answers. Never a throw for anything a player can do. */
export type IntentResult = IntentAccepted | IntentRejected;

/**
 * What one frame's drain did. DESIGN section 3.
 *
 * `discarded` is the count the trap in DESIGN section 3 is about: intents that
 * were still queued when an accepted one changed the phase, and which are
 * thrown away rather than judged against the screen that replaced the one they
 * were aimed at.
 */
export interface DrainReport {
  /** The one accepted intent, or `null` when the frame accepted none. */
  readonly applied: IntentResult | null;
  /** Every intent judged and refused before it, in the order they arrived. */
  readonly rejected: readonly IntentResult[];
  /** Queued intents thrown away because the phase changed under them. */
  readonly discarded: number;
  /** Queued intents still waiting, because the accepted one stayed put. */
  readonly remaining: number;
}

// ---------------------------------------------------------------------------
// SPEC 4.5, 4.6 and 4.8: whether an action is available on a hand at all
// ---------------------------------------------------------------------------

/**
 * What the availability rules need to know about the round a hand sits in.
 *
 * Two fields, because only two of the rules look past the hand itself: SPEC
 * 4.6's split cap is counted across the round and every toggle lives in the
 * house-rule record. The balance is deliberately absent, for the reason
 * `RejectionReason` gives: `wallet.ts` already decides whether a wager can be
 * funded and a second reading here would drift from it.
 */
export interface ActionContext {
  /** The house rules in force. SPEC 14, and `rules.ts`. */
  readonly rules: HouseRules;
  /** Splits taken this round. SPEC 4.6 counts them across the round. */
  readonly splits: number;
}

/**
 * Why Hit is unavailable on a hand, or `null` when it is available. SPEC 4.5.
 *
 * That table's Hit row is "Hand live and under 21. Never on a split Ace hand."
 * The first two clauses are one condition rather than two, and deliberately: a
 * hand that reaches exactly 21 stands automatically per that same section, so
 * it stops being live at the moment it stops being under 21, and a second test
 * for 21 here would be a reading of the auto-stand that could disagree with the
 * one that performs it.
 *
 * Exported with its three siblings because the chrome at `BJ-15` has to grey a
 * control out **before** the player presses it, and because the split-Ace
 * clause is otherwise unreachable through `apply`: SPEC 4.6 stands a split Ace
 * hand automatically, so it is never the active hand and the phase gate turns
 * every action on it down first. The clause is still the rule, and a pure
 * function is the only thing that can be asked about a hand play cannot build.
 * That is `settlement.ts`'s rung 1 precedent exactly.
 */
export function hitRefusal(hand: HandInPlay): RejectionReason | null {
  if (hand.fromSplitAces) {
    return 'split-aces';
  }
  if (hand.state !== 'live') {
    return 'hand-resolved';
  }
  return null;
}

/**
 * Why Double Down is unavailable on a hand, or `null`. SPEC 4.5, item `B9`.
 *
 * "Exactly two cards, chips available >= the hand's wager. Permitted after a
 * split when DAS is on. Never on a split Ace hand." Three of the four clauses
 * are here in that order; the chips are the wallet's, one layer down.
 */
export function doubleRefusal(hand: HandInPlay, context: ActionContext): RejectionReason | null {
  if (hand.fromSplitAces) {
    return 'split-aces';
  }
  if (hand.state !== 'live') {
    return 'hand-resolved';
  }
  if (hand.cards.length !== INITIAL_CARDS) {
    return 'not-two-cards';
  }
  if (hand.fromSplit && !context.rules.doubleAfterSplit) {
    return 'double-after-split-off';
  }
  return null;
}

/**
 * Why Split is unavailable on a hand, or `null`. SPEC 4.6, item `B10`.
 *
 * The pair test is `canSplit` in `hand.ts`, asked under the house's comparison
 * rather than re-derived: that function's own header says a `true` from it is
 * not "Split is available", and this function is the rest of the sentence.
 *
 * **The cap is counted across the round and not per hand**, which SPEC 4.6 says
 * in as many words, so it reads `context.splits` rather than the length of any
 * hand's history. Split Aces are refused before the cap is consulted, because
 * "may never be resplit" is a property of the hand and holds at any count.
 */
export function splitRefusal(hand: HandInPlay, context: ActionContext): RejectionReason | null {
  if (hand.fromSplitAces) {
    return 'split-aces';
  }
  if (hand.state !== 'live') {
    return 'hand-resolved';
  }
  if (!canSplit(hand.cards, context.rules.splitRule)) {
    return 'not-a-pair';
  }
  if (context.splits >= MAX_SPLITS) {
    return 'split-limit';
  }
  return null;
}

/**
 * Why Surrender is unavailable on a hand, or `null`. SPEC 4.8, item `B12`.
 *
 * "Only on a hand's initial two cards, before any other action on it. Not
 * available after a split, a hit or a double." The toggle is asked first
 * because "this table does not offer surrender" is true of every hand and is
 * the sentence a player needs; the split is asked before the card count because
 * a hand fresh from a split has exactly two cards and would otherwise be
 * refused for the wrong reason.
 *
 * **"Late surrender only: after the peek" is not tested here, because it cannot
 * fail here.** SPEC 10 gives Surrender to `playerTurn` alone, and the only
 * routes into `playerTurn` are through the peek or from an up card SPEC 4.4
 * never peeks behind, which is an up card no dealer natural can be built on.
 * The phase gate is the whole of that clause.
 */
export function surrenderRefusal(hand: HandInPlay, context: ActionContext): RejectionReason | null {
  if (!context.rules.surrender) {
    return 'surrender-off';
  }
  if (hand.state !== 'live') {
    return 'hand-resolved';
  }
  if (hand.fromSplit) {
    return 'from-split';
  }
  if (hand.cards.length !== INITIAL_CARDS) {
    return 'not-two-cards';
  }
  return null;
}

// ---------------------------------------------------------------------------
// SPEC 10: the branch at the end of the deal
// ---------------------------------------------------------------------------

/**
 * Which phase the opening deal hands play to. SPEC 10, and SPEC 4.4's order.
 *
 * An Ace goes to `insurance`, a ten-value card to `peek`, anything else
 * straight to `playerTurn`. **`offersInsurance` is asked before `peeksOn`, and
 * that order is SPEC 4.4's requirement rather than a preference**: the offer
 * has to be made and closed before the peek result is applied, because
 * insurance can only win on the branch the peek decides and, resolved after
 * it, could only ever be lost. The dealer still peeks behind an Ace; the
 * `insurance` phase hands to `peek` when the offer closes.
 *
 * Both predicates come from `dealer.ts` rather than from a local test for an
 * Ace or a ten, for the reason that file gives: a second reading of SPEC 4.4's
 * up-card set would agree with the first on every deal until a house rule
 * moved. `peek` itself is not called here and must not be, since it throws on
 * an up card SPEC 4.4 never peeks behind; the only call site is the `peek`
 * phase.
 *
 * A `null` up card is the "otherwise" arm and is only reachable through a
 * direct call: every round deals a dealer up card before this is asked. It is
 * kept because the function is exported and total, and because SPEC 10 sends
 * every rank that is neither an Ace nor a ten-value card to `playerTurn`.
 */
export function branchAfterDealing(up: Rank | null): 'insurance' | 'peek' | 'playerTurn' {
  if (up === null) {
    return 'playerTurn';
  }
  if (offersInsurance(up)) {
    return 'insurance';
  }
  if (peeksOn(up)) {
    return 'peek';
  }
  return 'playerTurn';
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

/** Everything outside the machine is allowed to see, as one snapshot. */
export interface TableReadout {
  /** The current phase and its payload. SPEC 10. */
  readonly phase: Phase;
  /** The table the player is sitting at. SPEC 6. */
  readonly table: TableId;
  /** The house rules in force. SPEC 14, fixed for this table's life. */
  readonly rules: HouseRules;
  /** This round's hands, left to right. SPEC 4.6. Empty between rounds. */
  readonly hands: readonly HandInPlay[];
  /**
   * The dealer's cards **the player may see**, in deal order. SPEC 4.3.
   *
   * While the hole card is down this is the up card alone, which is what SPEC
   * 11's "dealer visible hand value counts face-up cards only" is computed
   * from: `handValue(readout.dealerVisible)` is that sentence, rather than a
   * second reading of which cards count.
   */
  readonly dealerVisible: readonly Card[];
  /**
   * How many of the dealer's cards are face down. SPEC 4.3: 0 or 1, and 1
   * exactly while the hole card is concealed.
   *
   * A count rather than a flag so that a renderer can draw that many card backs
   * without knowing which position they are in, and so the readout says the
   * whole truth about the dealer's hand while still not carrying the card.
   */
  readonly dealerConcealed: number;
  /** The timed phase's float accumulator, in seconds. DESIGN section 3. */
  readonly elapsed: number;
  /** Intents waiting for the next drain, in the order they arrived. */
  readonly queued: readonly Intent[];
  /** Rounds closed at the round boundary. Never decreases. */
  readonly rounds: number;
  /** SPEC 4.6: splits taken this round, at most 3. Zero between rounds. */
  readonly splits: number;
  /** The shoe's own readout: SPEC 11's cards remaining and penetration. */
  readonly shoe: ShoeReadout;
  /** The wallet's own readout, including SPEC 4.11's four-term identity. */
  readonly wallet: WalletReadout;
}

/**
 * The whole contract. DESIGN section 3's frame is `drain()` then `update(dt)`.
 *
 * There is no phase setter and no way to hand the machine a `Phase`. Every
 * transition in the game is either an accepted intent or a timed step, and
 * both are in this file.
 */
export interface Table {
  /** The state, for a renderer, for a readout and for a test. */
  readout(): TableReadout;
  /**
   * One action. Legality against the current phase first, then availability on
   * the hand, then the wallet. A rejection changes nothing at all.
   */
  apply(intent: Intent): IntentResult;
  /** Put an intent in the queue. DESIGN section 3 step 1. */
  queue(intent: Intent): void;
  /** Apply at most one accepted intent. DESIGN section 3 step 2. */
  drain(): DrainReport;
  /** Advance the timers. DESIGN section 3 step 3. */
  update(dt: number): void;
}

/** What a table is built from. Every field has a default. */
export interface TableOptions {
  /**
   * The wallet the table plays against.
   *
   * Injected rather than constructed here because SPEC 13 persists the best
   * chip balance and the unlocks keyed to it, so the wallet outlives any one
   * table and a table that built its own would make a restored session
   * unreachable. `main.ts` at `BJ-15` owns the composition; `I2` at `BJ-11`
   * owns what a corrupt persisted document may do to it.
   */
  readonly wallet?: Wallet;
  /**
   * The table the player is seated at. SPEC 6, and SPEC 13 persists it.
   * Defaults to the one SPEC 6 never locks.
   *
   * **It seats and does not validate, and the `start` intent is the
   * enforcement point.** A table named here appears in the readout before the
   * player has done anything, so a locked one would be visible; what it cannot
   * do is reach play, because `start` refuses a table SPEC 6's `canEnter` does
   * not open and the machine stays on the start screen. Validating here as well
   * would be a second reading of item `J1`, and the two would drift. Keeping a
   * corrupt persisted value from arriving at all is item `I2` at `BJ-11`, whose
   * criterion is that such a value does not prevent the game from starting.
   */
  readonly table?: TableId;
  /**
   * The house rules, as an override of `rules.ts`'s SPEC defaults. SPEC 14.
   *
   * Partial so that turning one toggle off does not mean restating the other
   * four, which is how a default drifts out of a caller rather than out of
   * SPEC. Read once, at construction: SPEC 14 says house-rule changes take
   * effect at the start of the next round, so a table has no setter for them.
   */
  readonly rules?: Partial<HouseRules>;
  /**
   * The session seed. SPEC 4.1, and item `M3`.
   *
   * One stream is built from it and handed to the shoe, which splits its own
   * child off it, so the deal is stable against a consumer added beside it
   * later. `main.ts` at `BJ-15` supplies a real one; `DEFAULT_SEED` is what a
   * table with no options gets, because `core/` has no clock to invent one.
   */
  readonly seed?: number;
  /**
   * A shoe to deal from, instead of one built from the seed.
   *
   * This is how a test puts a known pair in front of a known up card without
   * searching for a seed that happens to produce one, and it is the same device
   * as the injected wallet above. The shoe's own composition, shuffle and cut
   * card are items `B2` and `B3` and are graded against the real one in
   * `tests/unit/shoe.test.ts`; what the round needs is a source of cards.
   */
  readonly shoe?: Shoe;
}

/** SPEC 10's opening screen, and the six other phases with no payload. */
const START: Phase = Object.freeze({ kind: 'start' });
const BETTING: Phase = Object.freeze({ kind: 'betting' });
const PEEK: Phase = Object.freeze({ kind: 'peek' });
const REVEAL: Phase = Object.freeze({ kind: 'reveal' });
const DEALER_TURN: Phase = Object.freeze({ kind: 'dealerTurn' });
const SETTLING: Phase = Object.freeze({ kind: 'settling' });
const BUST_OUT: Phase = Object.freeze({ kind: 'bustOut' });

/**
 * SPEC 4.3: the phases in which the dealer's second card is still face down.
 *
 * "The hole card stays concealed until the player's turn ends, except for the
 * peek." Those are the four screens before the player's turn has ended, and the
 * exception is what `peek` does with a card it does not hand back: `dealer.ts`
 * returns one of two shared constants precisely so that looking leaks nothing.
 * SPEC 10's `reveal` is where the card turns over, and the peek's natural arm
 * goes straight to `settling`, which is past it, so a dealer natural is shown
 * as SPEC 4.4 requires.
 */
const CONCEALED_PHASES: readonly PhaseKind[] = Object.freeze([
  'dealing',
  'peek',
  'insurance',
  'playerTurn',
]);

/** One timed step of a phase: how long it takes, and what it does. */
interface TimedStep {
  readonly duration: number;
  readonly take: () => void;
}

/** SPEC 4.7's stake, from the moment it is taken until the peek settles it. */
interface OpenStake {
  readonly stake: number;
  readonly evenMoney: boolean;
  /** SPEC 4.7's unfunded remainder, read off the wallet that recorded it. */
  readonly deferred: number;
}

/**
 * A table. SPEC 10, DESIGN sections 2 and 3, items `C2`, `B6` and `B9` to
 * `B12`.
 *
 * It always opens at SPEC 10's `start`, and there is no option that says
 * otherwise. Every one of the other ten phases is reached the only way the
 * game reaches it, by an accepted intent or by a timed step, and the returned
 * object carries no setter that could put the machine anywhere else.
 */
export function createTable(options: TableOptions = {}): Table {
  const wallet: Wallet = options.wallet ?? createWallet();
  const rules: HouseRules = houseRules(options.rules);
  // SPEC 4.1 and item `M3`: one session stream, and the shoe splits its own
  // child off it inside `createShoe`. A consumer added later takes another
  // child rather than sharing the shoe's, so the deal does not shift.
  const shoe: Shoe = options.shoe ?? createShoe(rules.decks, createRng(options.seed ?? DEFAULT_SEED));

  let selected: TableId = options.table ?? LOWEST_TABLE.id;
  let phase: Phase = START;
  let elapsed = 0;
  let rounds = 0;
  let splits = 0;
  let dealQueue: DealStep[] = [];
  /** SPEC 4.7's side wager while it is open, and `null` once it has settled. */
  let openStake: OpenStake | null = null;
  /** The settled side wager, carried to SPEC 12's round result. */
  let insurance: InsuranceResult | null = null;

  /** This round's hands, left to right. SPEC 4.6. */
  const hands: HandInPlay[] = [];
  /** The dealer's cards, up card first. SPEC 4.3. */
  const dealer: Card[] = [];
  /**
   * SPEC 8's "every action taken", this round, in acceptance order.
   *
   * Appended in `apply` and nowhere else, so an action reaches it exactly when
   * the machine accepted it; cleared in `clearTable`, with the felt, so an
   * entry belongs to one round. `BJ-10` added it for item `J5` and claims no
   * item for it: SPEC 8 names the field and a declined insurance offer is the
   * one thing in that list a finished round cannot be asked for.
   */
  const journal: PlayerAction[] = [];
  /** Intents waiting for the next drain. DESIGN section 3. */
  const queued: Intent[] = [];

  function limits(): TableLimits {
    return tableLimits(selected);
  }

  /** What the availability rules of SPEC 4.5, 4.6 and 4.8 are asked against. */
  function context(): ActionContext {
    return Object.freeze({ rules, splits });
  }

  /**
   * A hand by index, or a thrown error.
   *
   * An index no hand carries is a defect in this file rather than a player
   * action, so it is refused the way `wallet.ts` refuses the same thing. A
   * `Refusal` would put it on screen as something the player did wrong.
   */
  function handAt(index: number): HandInPlay {
    const found = hands[index];
    if (found === undefined) {
      throw new RangeError(
        `hand ${String(index)} is not in play; this round has ${String(hands.length)}`,
      );
    }
    return found;
  }

  /**
   * The hand SPEC 4.5 acts on, or a thrown error.
   *
   * Every player action is legal only in `playerTurn`, so reaching this from
   * any other phase means the legality table let one through, which is a
   * defect here and not something a player can do.
   */
  function activeHand(): number {
    if (phase.kind !== 'playerTurn') {
      throw new RangeError(
        `SPEC 4.5 acts on the active hand during the player's turn; the phase is ${phase.kind}`,
      );
    }
    return phase.activeHand;
  }

  /**
   * SPEC 4.7's offer, or a thrown error.
   *
   * The same shape as `activeHand` above and for the same reason: the offer is
   * answerable only during the `insurance` phase, so reaching this anywhere
   * else means the legality table let an answer through.
   */
  function offerNow(): InsuranceOffer {
    if (phase.kind !== 'insurance') {
      throw new RangeError(
        `SPEC 4.7's offer is answered during the insurance phase; the phase is ${phase.kind}`,
      );
    }
    return phase.offer;
  }

  function playerTurnAt(index: number): Phase {
    return Object.freeze({ kind: 'playerTurn', activeHand: index });
  }

  function dealingWith(queue: readonly DealStep[]): Phase {
    return Object.freeze({ kind: 'dealing', queue: Object.freeze([...queue]) });
  }

  /**
   * SPEC 4.7's offer, built the moment SPEC 10 enters the phase.
   *
   * The stake is half **the hand's** wager, which at this moment is the
   * initial wager: SPEC 4.4 puts the peek before split, double and surrender,
   * so no other wager exists to confuse it with and none needs recording.
   * `evenMoney` is SPEC 4.7's other reading of the same stake, asked through
   * SPEC 4.2's single definition of a natural in `hand.ts` rather than through
   * a local test for an Ace beside a ten, and gated on the house-rule toggle
   * SPEC 4.7 gives it.
   *
   * The field is what decides which of SPEC 4.7's two availability rules
   * applies: an ordinary stake is offered "only if chips available >= the
   * stake" and even money is "offered regardless of balance". So the shortfall
   * of SPEC 4.7's fourth identity term can only ever arise on this branch.
   */
  function insuranceOffer(): InsuranceOffer {
    const hand = handAt(FIRST_HAND);
    return Object.freeze({
      stake: hand.wager / INSURANCE_STAKE_DIVISOR,
      evenMoney: rules.evenMoney && isNatural(hand.cards, { fromSplit: hand.fromSplit }),
    });
  }

  /**
   * SPEC 4.4's peek, asked once, in the only phase allowed to ask it.
   *
   * The guard is `dealer.ts`'s: `peeksOn(up)` before `peek(up, hole)`, because
   * `peek` throws on an up card SPEC 4.4 never peeks behind and answering one
   * would hand a concealed card to something with no business looking at it.
   * Both of the tests below are structural rather than logical: the `peek`
   * phase is only ever entered with two dealer cards down and an up card SPEC
   * 4.4 peeks behind, and `noUncheckedIndexedAccess` is what makes the first of
   * them a compiler requirement.
   */
  function dealerNaturalAtPeek(): boolean {
    const up = dealer[UP_CARD];
    const hole = dealer[HOLE_CARD];
    if (up === undefined || hole === undefined) {
      return false;
    }
    return peeksOn(up.rank) ? peek(up, hole).dealerNatural : false;
  }

  /** The rank SPEC 10's dealing branch reads, once the up card is out. */
  function upCardRank(): Rank | null {
    return dealer[UP_CARD]?.rank ?? null;
  }

  /**
   * SPEC 4.2 and 4.5: what a hand is doing now that a card has arrived.
   *
   * A natural first, because SPEC 4.2 makes it a distinct thing from a 21 and
   * SPEC 4.6 turns the 3:2 payout on that distinction; then a bust, then SPEC
   * 4.5's "a hand reaching exactly 21 stands automatically". A hand that is
   * none of the three is still live and the player acts on it again.
   *
   * The natural test carries the hand's own split origin, so a two-card 21 on a
   * split hand comes back as `stood` and settles at rung 7 for 1:1 rather than
   * at rung 3 for 3:2. That is `B10`'s clause, and it is one field rather than
   * a branch because `hand.ts` holds the definition.
   */
  function stateAfterCard(hand: HandInPlay): HandState {
    if (isNatural(hand.cards, { fromSplit: hand.fromSplit })) {
      return 'blackjack';
    }
    if (isBust(hand.cards)) {
      return 'bust';
    }
    if (handValue(hand.cards).total === TARGET) {
      return 'stood';
    }
    return 'live';
  }

  /** Replace a hand with the same hand in a new state. Frozen, like the rest. */
  function resolve(index: number, state: HandState): void {
    hands[index] = Object.freeze({ ...handAt(index), state });
  }

  /** Draw one card from the shoe into a hand, and hand the result back. */
  function dealTo(index: number): HandInPlay {
    const hand = handAt(index);
    const grown: HandInPlay = Object.freeze({
      ...hand,
      cards: Object.freeze([...hand.cards, shoe.draw()]),
    });
    hands[index] = grown;
    return grown;
  }

  /**
   * One card of SPEC 4.3's opening deal, drawn from the shoe. Item `B6`.
   *
   * The order is `OPENING_DEAL`'s and the cards are the shoe's, so the up card
   * SPEC 10's branch reads is the rank of the card that was actually dealt:
   * there is no second place it could be set from and nothing outside this
   * module can choose it. Both dealer steps push into the same array, which is
   * what makes the up card index 0 and the hole card index 1 by the deal order
   * rather than by a flag.
   */
  function takeDealStep(step: DealStep): void {
    if (step === 'playerCard') {
      dealTo(FIRST_HAND);
      return;
    }
    dealer.push(shoe.draw());
  }

  /**
   * SPEC 10: the player acts, unless no hand is left to act on.
   *
   * The scan is left to right, which is SPEC 4.6's play order, and "the first
   * live hand" is therefore also "the next one to the right": every hand left
   * of the active one has already reached a terminal state. When none is live
   * the player's turn is over and SPEC 10 goes to the reveal, which is the arm
   * a player natural takes without ever being offered an action.
   */
  function handOverToPlayer(): Phase {
    const next = hands.findIndex((hand) => hand.state === 'live');
    return next === NOT_FOUND ? REVEAL : playerTurnAt(next);
  }

  /** One step of the `dealing` queue, then SPEC 10's branch when it empties. */
  function dealOneStep(): void {
    const step = dealQueue.shift();
    if (step !== undefined) {
      takeDealStep(step);
    }
    if (dealQueue.length > 0) {
      phase = dealingWith(dealQueue);
      return;
    }
    // SPEC 4.2: the player's two cards may already be a natural, which is
    // terminal, so the hand is read before the branch and not after it.
    resolve(FIRST_HAND, stateAfterCard(handAt(FIRST_HAND)));
    switch (branchAfterDealing(upCardRank())) {
      case 'insurance':
        phase = Object.freeze({ kind: 'insurance', offer: insuranceOffer() });
        return;
      case 'peek':
        phase = PEEK;
        return;
      case 'playerTurn':
        phase = handOverToPlayer();
        return;
    }
  }

  /**
   * SPEC 4.7: the side wager, resolved immediately after the peek. Item `B11`.
   *
   * The net is `settlement.ts`'s, computed from the stake and the bit the peek
   * just produced, and the credit is the wallet's `stake + net`. The unfunded
   * remainder is **not** subtracted here: on the branch where the stake is lost
   * the credit is zero, and a balance emptied to fund the stake would go
   * negative between this call and the hand's. `wallet.ts` releases it at the
   * round boundary instead, after every hand has been credited, and its header
   * carries the whole argument.
   */
  function settleOpenStake(dealerNatural: boolean): void {
    if (openStake === null) {
      return;
    }
    const net = insuranceNet(openStake.stake, dealerNatural);
    insurance = Object.freeze({
      stake: openStake.stake,
      net,
      credit: wallet.settleInsurance(net),
      deferred: openStake.deferred,
      evenMoney: openStake.evenMoney,
    });
    openStake = null;
  }

  /**
   * SPEC 10: a dealer natural resolves the round, otherwise the player acts.
   *
   * The peek is asked once and its bit is used twice, for SPEC 4.7's side wager
   * and for SPEC 10's branch, because two peeks would be two looks at a card
   * SPEC 4.3 keeps concealed. On the natural arm the round goes straight to
   * `settling`, so no split, double or surrender wager can ever be at risk to
   * one, which SPEC 4.4 calls "the whole point of the peek".
   */
  function applyPeek(): void {
    const dealerNatural = dealerNaturalAtPeek();
    settleOpenStake(dealerNatural);
    phase = dealerNatural ? SETTLING : handOverToPlayer();
  }

  /**
   * SPEC 4.9's contention test, which is what decides whether the dealer draws.
   *
   * Neither busted nor surrendered, and deliberately not "still live": by the
   * time the hole card is revealed no hand is live any more, so a live-hand
   * test here would mean the dealer never draws at all. SPEC 4.9 says so.
   */
  function inContention(): boolean {
    return hands.some((hand) => hand.state !== 'bust' && hand.state !== 'surrendered');
  }

  /** SPEC 10's reveal: the pause ends, then the dealer plays or the round settles. */
  function revealHoleCard(): void {
    phase = inContention() ? DEALER_TURN : SETTLING;
  }

  /** Take one card for the dealer, from the same shoe the player is dealt from. */
  function drawDealerCard(): void {
    dealer.push(shoe.draw());
  }

  /**
   * One paced draw of the dealer's turn. SPEC 4.9 and SPEC 5's 0.65 s.
   *
   * The policy is `dealer.ts`'s single comparison and is asked here rather
   * than re-derived, per that module's header: the turn, its pacing and SPEC
   * 4.9's gate are the machine's, the rule is not. Item `B8` at `BJ-4` grades
   * the policy on its own and `C1` at `BJ-20` grades the dealer's turn end to
   * end.
   */
  function dealerDrawStep(): void {
    if (!shouldHit(dealer)) {
      phase = SETTLING;
      return;
    }
    drawDealerCard();
  }

  /** The player side of one settlement. SPEC 4.10, through `settlement.ts`. */
  function playerSideOf(hand: HandInPlay): PlayerHand {
    return Object.freeze({
      cards: hand.cards,
      wager: hand.wager,
      surrendered: hand.state === 'surrendered',
      origin: Object.freeze({ fromSplit: hand.fromSplit }),
    });
  }

  /**
   * The round boundary. SPEC 4.10 settles each hand, SPEC 4.11 credits back.
   *
   * Every hand is settled and then the round is closed, in that order, because
   * `wallet.ts` refuses a boundary with a hand still committed and its handoff
   * puts that discipline here. The shoe's own boundary, SPEC 4.1's reshuffle
   * when the cut card was reached, is `B3`'s `endRound` and is called here for
   * the same reason: the shoe cannot see a round ending, so the round module
   * has to tell it, and it is the only call site.
   *
   * **The hazard `BJ-7` wrote down is resolved by `HandInPlay.walletHand`, and
   * this is the settlement that depends on it.** `wallet.ts` **appends** a
   * split hand while SPEC 4.6 plays hands left to right, so `takeSplit` below
   * **inserts** into `hands` and the two orders come apart at the second split:
   * a resplit of the leftmost hand of three leaves this array holding the
   * wallet's hands in the order 0, 2, 1. `B10` decided to carry the wallet's
   * index rather than force one order to be the other, because they are
   * genuinely different orders, commit order and play order, and forcing them
   * together would mean the wallet inserting too and every index a caller was
   * holding shifting underneath it. Settling by position instead of by
   * `walletHand` pays the doubled wager of one hand onto the undoubled wager of
   * another, which is a wrong payout and not a tidiness note.
   *
   * SPEC 4.7's insurance is not settled here: it resolved at the peek, and
   * `wallet.endRound` refuses to close a round with a stake still open.
   */
  function settleRound(): void {
    const dealerHand: DealerHand = Object.freeze({ cards: Object.freeze([...dealer]) });
    const settled: SettledHand[] = hands.map((hand) => {
      const decided = settle(playerSideOf(hand), dealerHand);
      return Object.freeze({
        wager: hand.wager,
        credit: wallet.settleHand(hand.walletHand, decided.net),
        outcome: decided.outcome,
        rung: decided.rung,
      });
    });
    wallet.endRound();
    shoe.endRound();
    rounds += 1;
    phase = Object.freeze({
      kind: 'roundResult',
      result: Object.freeze({
        hands: Object.freeze(settled),
        insurance,
        chips: wallet.readout().chips,
        // SPEC 8's "every action taken". Copied out frozen, so the entry a
        // recorder keeps is a value and not this round's array, which
        // `clearTable` is about to empty.
        actions: Object.freeze([...journal]),
      }),
    });
  }

  /**
   * Clear the table for the next round. SPEC 10's `Next Hand`, and nowhere else.
   *
   * **The cards stay on the table through SPEC 10's round result, and that is
   * deliberate.** SPEC 12 prints both hand values there and SPEC 10 keeps the
   * play surface behind every screen, so a machine that swept the felt at the
   * settlement would leave the round result with nothing to show and the
   * renderer with nothing to draw. The money is a different question and does
   * move at the settlement: `wallet.endRound` clears its own hands there,
   * because a wager that has been credited is no longer committed.
   *
   * `Next Hand` is the only exit SPEC 10 gives the round result, and Deal is
   * legal only at `betting`, which is only reachable through it, so a second
   * clear at the deal would be a line no round could reach.
   */
  function clearTable(): void {
    hands.length = 0;
    dealer.length = 0;
    splits = 0;
    insurance = null;
    // SPEC 8's journal goes with the felt, and for the same reason: the round
    // result still needs it, and `Next Hand` is where this round stops being
    // the round. `settleRound` has already copied it into the result.
    journal.length = 0;
  }

  /**
   * The step the current phase is counting down, or `null` when it has none.
   *
   * Six of the eleven phases wait for the player and have no timer at all,
   * which is SPEC 4.7's "the decision point has no timer" generalised: a
   * screen the player is reading must not advance underneath them. It is also
   * what makes `update` a no-op on those screens, so a tab hidden at the
   * betting controls costs nothing when it comes back, per item `C7`.
   *
   * **This is where `E9`'s Speed multiplier belongs**, on the duration returned
   * below and nowhere else. Scaling a copy of `TIMINGS` instead would leave
   * every alias of it, `PEEK_PAUSE` among them, bound to the unscaled number.
   */
  function timedStep(): TimedStep | null {
    switch (phase.kind) {
      case 'dealing':
        return { duration: TIMINGS.dealInterval, take: dealOneStep };
      case 'peek':
        return { duration: PEEK_PAUSE, take: applyPeek };
      case 'reveal':
        return { duration: TIMINGS.revealPause, take: revealHoleCard };
      case 'dealerTurn':
        return { duration: TIMINGS.dealerDrawInterval, take: dealerDrawStep };
      case 'settling':
        return { duration: TIMINGS.settlePause, take: settleRound };
      case 'start':
      case 'betting':
      case 'insurance':
      case 'playerTurn':
      case 'roundResult':
      case 'bustOut':
        return null;
    }
  }

  function accepted(kind: IntentKind): IntentResult {
    return Object.freeze({ ok: true, kind, phase: phase.kind });
  }

  function refused(kind: IntentKind, layer: RejectionLayer, reason: RejectionReason): IntentResult {
    return Object.freeze({ ok: false, kind, layer, reason });
  }

  /** SPEC 4.5: end play on the active hand, then move right or reveal. */
  function resolveActiveHand(state: HandState): void {
    resolve(activeHand(), state);
    phase = handOverToPlayer();
  }

  /**
   * SPEC 4.6's split, once it has been allowed and funded. Item `B10`.
   *
   * The pair is separated, the new hand is **inserted beside its parent** so
   * that SPEC 4.6's left-to-right play order survives a resplit, and each
   * resulting hand "immediately receives one card". `fromSplit` goes on both
   * halves, including the parent, because SPEC 4.6's "a two-card 21 on a split
   * hand is 21, not a natural" is about both of them; `fromSplitAces` goes on
   * both for the same reason. Both are set here and never recomputed, which is
   * DESIGN section 2's rule and what stops the 3:2 payout drifting.
   *
   * **Whether the pair was Aces is read off one card**, because `canSplit` has
   * already proved the two match: under SPEC 4.6's equal-value comparison no
   * other rank is worth 1, and under equal rank they are the same rank, so an
   * Ace pairs only with an Ace under either reading. A second test on the other
   * card would be a clause that can never differ.
   */
  function takeSplit(index: number, walletHand: number, wager: number): void {
    const hand = handAt(index);
    const first = hand.cards[0];
    const second = hand.cards[1];
    if (first === undefined || second === undefined) {
      throw new RangeError('SPEC 4.6 splits a two-card hand, and this one is not');
    }
    const aces = isAce(first.rank);
    splits += 1;
    hands[index] = Object.freeze({
      ...hand,
      cards: Object.freeze([first]),
      fromSplit: true,
      fromSplitAces: aces,
    });
    hands.splice(
      index + 1,
      0,
      Object.freeze({
        cards: Object.freeze([second]),
        wager,
        state: 'live',
        fromSplit: true,
        fromSplitAces: aces,
        walletHand,
      }),
    );
    dealOntoSplitHand(index);
    dealOntoSplitHand(index + 1);
    phase = handOverToPlayer();
  }

  /**
   * SPEC 4.6: "Each resulting hand immediately receives one card."
   *
   * And then, for Aces only, "Split Aces receive exactly one card each and
   * stand automatically." That is written as a state rather than as a guard on
   * every action, so the hand simply stops being live and the phase moves past
   * it; a split Ace hand cannot bust on its one card, since the highest total
   * an Ace plus one card can reach is exactly 21, so there is no branch here.
   */
  function dealOntoSplitHand(index: number): void {
    const grown = dealTo(index);
    resolve(index, grown.fromSplitAces ? 'stood' : stateAfterCard(grown));
  }

  /**
   * What an accepted intent does. Reached only after the phase allowed it.
   *
   * The switch is exhaustive over `IntentKind` with no `default`, so a
   * nineteenth intent added to the union fails the typecheck here rather than
   * being silently legal nowhere.
   */
  function perform(intent: Intent): IntentResult {
    switch (intent.kind) {
      case 'chooseTable': {
        const state = wallet.readout();
        if (!canEnter(intent.table, state.bestBalance, state.chips)) {
          return refused('chooseTable', 'wallet', 'table-locked');
        }
        selected = intent.table;
        return accepted('chooseTable');
      }
      case 'start': {
        const state = wallet.readout();
        if (!canEnter(selected, state.bestBalance, state.chips)) {
          return refused('start', 'wallet', 'table-locked');
        }
        phase = BETTING;
        return accepted('start');
      }
      case 'tapChip': {
        const result = wallet.tap(intent.chip, limits());
        return result.ok ? accepted('tapChip') : refused('tapChip', 'wallet', result.reason);
      }
      case 'clear': {
        const result = wallet.clear();
        return result.ok ? accepted('clear') : refused('clear', 'wallet', result.reason);
      }
      case 'max': {
        const result = wallet.max(limits());
        return result.ok ? accepted('max') : refused('max', 'wallet', result.reason);
      }
      case 'repeat': {
        const result = wallet.repeat(limits());
        return result.ok ? accepted('repeat') : refused('repeat', 'wallet', result.reason);
      }
      case 'changeTable': {
        // SPEC 10: "Change Table, only with no wager placed", and SPEC 6 says
        // it "returns to the start screen with the balance intact". A pending
        // wager blocks it with a reason and is never silently cleared, which
        // SPEC 10 calls 4.11's rejection principle applied to the one control
        // that leaves the screen. The reason is the machine's rather than the
        // wallet's: `wallet.ts` has no phases and no opinion on leaving one.
        if (wallet.readout().wager !== NO_WAGER) {
          return refused('changeTable', 'availability', 'pending-wager');
        }
        phase = START;
        return accepted('changeTable');
      }
      case 'deal': {
        // SPEC 10: Deal only when tableMin <= wager <= min(tableMax, chips).
        // All three bounds are `dealRefusal`'s inside `commitInitial`, which
        // returns the reason and leaves the board untouched when it refuses.
        // The order of those bounds is pinned by `B15`'s own tests and is
        // surfaced here rather than re-derived.
        const result = wallet.commitInitial(limits());
        if (!result.ok) {
          return refused('deal', 'wallet', result.reason);
        }
        hands.push(
          Object.freeze({
            cards: Object.freeze([]),
            wager: result.wager,
            state: 'live',
            fromSplit: false,
            fromSplitAces: false,
            walletHand: result.hand,
          }),
        );
        dealQueue = [...OPENING_DEAL];
        phase = dealingWith(dealQueue);
        return accepted('deal');
      }
      case 'takeInsurance': {
        // SPEC 4.7: an ordinary stake is offered "only if chips available >=
        // the stake", and even money is "offered regardless of balance". Those
        // are the same side wager under two availability rules, which is why
        // the offer carries which one it is rather than the machine deciding
        // again here. The shortfall of SPEC 4.7's fourth identity term is
        // reachable on the second branch and on no other.
        const offer = offerNow();
        if (!offer.evenMoney && wallet.readout().chips < offer.stake) {
          return refused('takeInsurance', 'availability', 'insufficient-chips');
        }
        wallet.takeInsurance(offer.stake);
        openStake = Object.freeze({
          stake: offer.stake,
          evenMoney: offer.evenMoney,
          deferred: wallet.readout().deferredStake,
        });
        phase = PEEK;
        return accepted('takeInsurance');
      }
      case 'declineInsurance': {
        // SPEC 4.4 and SPEC 10: accepted or declined, the offer always closes
        // before any peek result is applied, so both answers hand to `peek`
        // and neither can see one.
        phase = PEEK;
        return accepted('declineInsurance');
      }
      case 'hit': {
        // SPEC 4.5: one additional card, then "a hand reaching exactly 21
        // stands automatically" and "a hand over 21 busts immediately and play
        // moves on". A hand still under 21 stays live and the phase object is
        // left exactly as it was, which is what keeps the rest of the frame's
        // queue alive: `drain` compares the phase by identity.
        //
        // **The refusal below is the one this file cannot reach, and it is
        // named rather than counted as covered**, on the footing `hitRefusal`
        // uses for the same clause. Both of that function's answers are
        // provably `null` here: `handOverToPlayer` selects the leftmost hand
        // whose state is `live`, so the active hand is never resolved, and
        // `dealOntoSplitHand` stands a split Ace hand the moment its one card
        // lands, so such a hand is never selected either. The rule is still
        // graded, directly and on hands play cannot assemble, in
        // `tests/unit/split.test.ts`, and it carries a mutation entry there;
        // what is unreachable is this call site, not the clause.
        const index = activeHand();
        const refusal = hitRefusal(handAt(index));
        if (refusal !== null) {
          return refused('hit', 'availability', refusal);
        }
        const state = stateAfterCard(dealTo(index));
        if (state !== 'live') {
          resolve(index, state);
          phase = handOverToPlayer();
        }
        return accepted('hit');
      }
      case 'stand': {
        // SPEC 4.5: end play on this hand. Hands play left to right per SPEC
        // 4.6 and the turn ends when none is live, which is SPEC 4.9's
        // precondition for the reveal.
        resolveActiveHand('stood');
        return accepted('stand');
      }
      case 'double': {
        // SPEC 4.5, item `B9`: "Double this hand's wager, one card, end the
        // hand." The increment leaves the balance when the commit is accepted,
        // per SPEC 4.11, and the hand's wager becomes what the wallet says it
        // is rather than a doubling computed twice.
        //
        // A doubled hand that busts is recorded as `bust` and not as
        // `doubled`, because SPEC 4.9's contention gate asks whether a hand
        // busted and a hand can be both. The wager is doubled either way and
        // the hand ends either way; what the state records is what happened to
        // the cards, and rung 5 of SPEC 4.10 reads the cards regardless.
        const index = activeHand();
        const hand = handAt(index);
        const refusal = doubleRefusal(hand, context());
        if (refusal !== null) {
          return refused('double', 'availability', refusal);
        }
        const commit = wallet.commitDouble(hand.walletHand);
        if (!commit.ok) {
          return refused('double', 'wallet', commit.reason);
        }
        hands[index] = Object.freeze({ ...hand, wager: commit.wager });
        const grown = dealTo(index);
        resolve(index, isBust(grown.cards) ? 'bust' : 'doubled');
        phase = handOverToPlayer();
        return accepted('double');
      }
      case 'split': {
        // SPEC 4.6, item `B10`. The pair test, the split-Ace rule and the cap
        // are the availability layer's; the equal wager is the wallet's, and
        // its refusal is what SPEC 4.6 calls "unavailable on that hand with the
        // reason surfaced, including on the second and third split".
        const index = activeHand();
        const hand = handAt(index);
        const refusal = splitRefusal(hand, context());
        if (refusal !== null) {
          return refused('split', 'availability', refusal);
        }
        const commit = wallet.commitSplit(hand.walletHand);
        if (!commit.ok) {
          return refused('split', 'wallet', commit.reason);
        }
        takeSplit(index, commit.hand, commit.wager);
        return accepted('split');
      }
      case 'surrender': {
        // SPEC 4.8, item `B12`: "Returns wager / 2; the hand ends
        // immediately." The return is not computed here. The hand is marked
        // and rung 1 of SPEC 4.10 nets `-wager / 2` at settlement, so the
        // balance is credited `wager - wager / 2`, which is the half SPEC 4.8
        // returns. A credit written here would be a second arithmetic for the
        // same sentence.
        const index = activeHand();
        const refusal = surrenderRefusal(handAt(index), context());
        if (refusal !== null) {
          return refused('surrender', 'availability', refusal);
        }
        resolveActiveHand('surrendered');
        return accepted('surrender');
      }
      case 'nextHand': {
        // SPEC 10: chips < tableMin ? BUST_OUT : BETTING, asked through SPEC
        // 4.12's own predicate so there is one reading of "out at this table".
        // The felt is swept here rather than at the settlement, so that SPEC
        // 12's round result still has the round it is printing.
        const state = wallet.readout();
        clearTable();
        phase = bustOut(selected, state.bestBalance, state.chips).out ? BUST_OUT : BETTING;
        return accepted('nextHand');
      }
      case 'dropTable': {
        // SPEC 4.12: drop to a lower table if the balance can still afford it.
        // The list is the wallet's, so "lower", "unlocked" and "affordable"
        // are one answer rather than three tests that could disagree.
        const state = wallet.readout();
        const lower = bustOut(selected, state.bestBalance, state.chips).lowerTables;
        if (!lower.includes(intent.table)) {
          return refused('dropTable', 'wallet', 'table-locked');
        }
        selected = intent.table;
        phase = BETTING;
        return accepted('dropTable');
      }
      case 'resetBankroll': {
        // SPEC 4.12: the free reset restores 1,000 at the lowest table, and
        // item `L4` at `BJ-21` makes it free, unlimited and always available,
        // so there is no branch here that could refuse it. The high-water mark,
        // the statistics and the unlocks survive it, which is `wallet.ts`'s.
        wallet.reset();
        selected = LOWEST_TABLE.id;
        phase = BETTING;
        return accepted('resetBankroll');
      }
    }
  }

  /**
   * One action, legality first. Item `C2` in one function.
   *
   * The phase is asked before anything else happens, and a phase rejection
   * returns before the wallet, the hands or the timers are touched at all. An
   * intent kind the union does not carry is a caller defect and is thrown
   * rather than refused, in the house style: a `Refusal` would put a
   * programming error on screen as something the player did wrong.
   *
   * **Nothing here resets the accumulator, and it is not an omission.** Every
   * intent SPEC 10 offers is legal only in one of the six phases with no
   * timer, and `update` leaves the accumulator at zero in every one of those,
   * so it is already zero on the way in. A reset written here would be a line
   * no test could cover and no mutation could break, which is the same reason
   * `wallet.ts` gives for not re-reading its high-water mark on a reset. The
   * invariant is asserted instead, at every phase of every round the suite
   * drives.
   */
  function apply(intent: Intent): IntentResult {
    if (!INTENT_KINDS.includes(intent.kind)) {
      throw new RangeError(`SPEC 10 offers no intent called ${String(intent.kind)}`);
    }
    if (!LEGAL[phase.kind].includes(intent.kind)) {
      return refused(intent.kind, 'phase', 'wrong-phase');
    }
    const result = perform(intent);
    // SPEC 8's journal, at the one point every action passes through and after
    // the action has actually been taken. A refusal from any of the three
    // layers changes nothing at all, so it is not an action taken and does not
    // reach the history; `BJ-10`'s `RoundResult.actions` says so in as many
    // words. Nothing accepted can arrive after `settleRound` has copied the
    // list, because SPEC 10 gives `settling` no legal intent.
    const action = playerActionOf(intent.kind);
    if (result.ok && action !== null) {
      journal.push(action);
    }
    return result;
  }

  function queue(intent: Intent): void {
    queued.push(intent);
  }

  /**
   * DESIGN section 3, steps 1 and 2: drain the queue, apply at most one
   * accepted intent, and discard the rest if the phase changed under them.
   *
   * **A rejected intent does not consume the frame's acceptance.** It was
   * judged against the phase it was aimed at and refused, so the drain carries
   * on to the next one; a frame in which the player pressed a dead control and
   * then a live one has to take the live one. **An intent still queued behind
   * an accepted one that changed the phase is discarded, not re-judged.** That
   * is the trap DESIGN section 3 names in as many words: a queued click aimed
   * at a screen that has gone must never be judged against the screen that
   * replaced it, because on the new screen it may well be legal and would
   * then act on something the player never saw. Item `C6` grades the whole of
   * this end to end in a browser at `BJ-20`.
   *
   * **The comparison is the phase itself, not its tag, and the difference is a
   * defect rather than a preference.** DESIGN section 2 makes the active hand
   * part of the `playerTurn` value, so once a split puts a second hand on the
   * table, Stand moves `playerTurn(0)` to `playerTurn(1)`: the same tag, a
   * different screen. Compared by tag the queue survives, and a double press
   * on Stand stands the hand the player has not looked at yet, which is exactly
   * the trap above. Every phase object is built frozen at each transition and
   * never edited in place, so identity is exact here and strictly stronger than
   * the tag on every other transition too. `BJ-8` brought the second hand, and
   * `tests/unit/split.test.ts` drives that case with a mutation entry beside
   * it that regresses this compare to `phase.kind`.
   */
  function drain(): DrainReport {
    const rejected: IntentResult[] = [];
    let applied: IntentResult | null = null;
    let discarded = 0;

    while (queued.length > 0) {
      const intent = queued.shift();
      if (intent === undefined) {
        break;
      }
      const before = phase;
      const result = apply(intent);
      if (!result.ok) {
        rejected.push(result);
        continue;
      }
      applied = result;
      if (phase !== before) {
        discarded = queued.length;
        queued.length = 0;
      }
      break;
    }

    return Object.freeze({
      applied,
      rejected: Object.freeze(rejected),
      discarded,
      remaining: queued.length,
    });
  }

  /**
   * DESIGN section 3, step 3: advance the timers, with `dt` clamped.
   *
   * The accumulator is a float and the work drains in a `while` loop against
   * it, so a frame long enough to cover two steps takes two and wall clock
   * pacing survives a stutter. There is no frame counter and no `setTimeout`:
   * every duration is in seconds and comes from SPEC 5.
   *
   * **The remainder carries across a timed transition and is dropped at an
   * untimed one.** Carrying it is what keeps the deal, the peek and the
   * dealer's draws on wall clock time through a hitch. Dropping it at a screen
   * that waits for the player is the same rule read the other way: the player
   * has not started reading yet, so none of their first frame has been spent.
   *
   * **A resume empties the accumulator, which is more than dropping the
   * delta.** QUALITY-BAR section 7 says a gap longer than 5 s is a resume and
   * that "the accumulator is dropped rather than consumed", and the two
   * readings differ whenever time was already owed: half a deal interval
   * banked before a tab was hidden would otherwise land its card on the first
   * frame back. `clampDelta` stays a pure function of one delta, because item
   * `M5` at `BJ-12` drives it directly; the part that is about state is here.
   * A delta that is not finite is clause (b)'s zero rather than a resume.
   */
  function update(dt: number): void {
    let step = timedStep();
    if (step === null) {
      return;
    }
    if (Number.isFinite(dt) && dt > RESUME_GAP) {
      elapsed = 0;
      return;
    }
    elapsed += clampDelta(dt);
    while (step !== null && elapsed >= step.duration) {
      elapsed -= step.duration;
      step.take();
      step = timedStep();
    }
    if (step === null) {
      elapsed = 0;
    }
  }

  /** One hand, copied out, so a caller holds a value and not the machine. */
  function copyHand(hand: HandInPlay): HandInPlay {
    return Object.freeze({
      cards: Object.freeze([...hand.cards]),
      wager: hand.wager,
      state: hand.state,
      fromSplit: hand.fromSplit,
      fromSplitAces: hand.fromSplitAces,
      walletHand: hand.walletHand,
    });
  }

  /**
   * How many of the dealer's cards the player may not see. SPEC 4.3, `B6`.
   *
   * One while the hole card has been dealt and the player's turn has not
   * ended, and none otherwise. The count is derived from the phase rather than
   * carried on the cards, and that is the representation `B6` chose: **exactly
   * one card in this game is ever face down**, and SPEC 4.3 fixes which one by
   * the deal order. A per-card flag would be a field that reads the same on
   * every card in every reachable state but one, which is the standard this
   * module already applies to the accumulator reset in `apply`.
   */
  function concealedDealerCards(): number {
    return CONCEALED_PHASES.includes(phase.kind) && dealer.length > HOLE_CARD ? 1 : 0;
  }

  /**
   * The state, as a snapshot rather than as a view.
   *
   * Every array is copied on the way out and every object frozen, which is
   * what makes `C2`'s "a rejected action changes no state" testable at all: a
   * readout that shared the machine's arrays would compare equal to itself
   * after any mutation whatsoever, and the sweep would assert nothing. The
   * phase is shared rather than copied because a phase object is built frozen
   * at each transition and never edited in place, so there is nothing to
   * protect it from.
   *
   * **The hole card is not in it while it is down**, which is the same stance
   * `dealer.ts` takes on the peek's result: a caller cannot leak what it was
   * never handed. `dealerVisible` is the face-up cards and `dealerConcealed`
   * says how many are not, so a renderer knows how many backs to draw without
   * holding the face, and SPEC 11's "dealer visible hand value counts face-up
   * cards only" is `handValue(dealerVisible)` rather than a second rule about
   * which cards count.
   */
  function readout(): TableReadout {
    const concealed = concealedDealerCards();
    return Object.freeze({
      phase,
      table: selected,
      rules,
      hands: Object.freeze(hands.map(copyHand)),
      dealerVisible: Object.freeze(dealer.slice(0, dealer.length - concealed)),
      dealerConcealed: concealed,
      elapsed,
      queued: Object.freeze([...queued]),
      rounds,
      splits,
      shoe: shoe.readout(),
      wallet: wallet.readout(),
    });
  }

  return Object.freeze({ readout, apply, queue, drain, update });
}
