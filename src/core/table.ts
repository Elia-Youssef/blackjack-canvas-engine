/**
 * The table: SPEC 10's eleven phases, the one entry point every action goes
 * through, the intent queue and the timers. Item `C2`, Critical.
 *
 * DESIGN section 2 makes this module "the only authority" and everything else
 * an observer, and DESIGN section 3 gives the per-frame order it runs in. Both
 * are here and nowhere else.
 *
 * **This part is the machine and not the moves.** The actions themselves,
 * dealing cards into a round and the effects of Hit, Double, Split, Insurance
 * and Surrender, are items `B6` and `B9` to `B12` at `BJ-8`. What is here is
 * the thing those actions arrive at: which of them SPEC 10 allows on which
 * screen, that one rejected on the way in changes nothing at all, and the paced
 * transitions between screens that no action drives. The seams `BJ-8` fills are
 * each named where they are, and none of them reshapes the phase union,
 * `apply`, the queue or the timers.
 *
 * **There is no way to put this machine in a phase.** It opens at SPEC 10's
 * `start`, the returned object carries no setter, and every one of the other ten
 * phases is entered by an accepted intent or by a timed step written here. The
 * one datum a caller may supply that the machine cannot yet discover for itself
 * is the dealer's up card, because SPEC 10's branch at the end of the deal reads
 * it and no card is dealt until `BJ-8`. It is a `Rank`, every value of which
 * `branchAfterDealing` already answers with one of the three successors SPEC 10
 * gives `dealing`, so it selects a legal branch and cannot invent a state.
 *
 * **Nine expressions here are inert until `BJ-8`, and this is the list**, in
 * the style `wallet.ts` uses for the two identity terms it pins at zero: an
 * inert expression is one no test can hold and no mutation can break, so it has
 * to be named rather than counted as covered. Seven are inert because no card
 * exists yet: `shouldHit(dealer)` in the dealer's draw step, the whole of
 * `dealerNaturalAtPeek`, the natural arm of `applyPeek`, the `dealer` and
 * `upCard` clears at the round boundary, the `dealer` copy in the readout, and
 * the `cards` copy in `copyHand`. Two are live but constant: `evenMoney` on the
 * insurance offer, which asks SPEC 4.2's real question of an empty hand, and
 * the move-right arm of `resolveActiveHand`, which needs a second hand. Every
 * one of them is the right expression already, is reached by real code today,
 * and starts deciding something the moment `B6`, `B10` and `B11` land at
 * `BJ-8`; `C1` at `BJ-20` grades the round they sit in end to end. Nothing in
 * this file is unreachable in the sense of dead: these are reached and cannot
 * yet answer two ways.
 *
 * **Legality is checked first, and it is checked here.** SPEC 4.11 blocks
 * "changing the wager after the deal" and "acting after the round ends", and
 * `wallet.ts` deliberately holds neither: its own header says in as many words
 * that it is not a phase gate and that `tap`, `clear`, `max` and `repeat` are
 * gated at `BJ-7`. So all four are gated here, by phase, before the wallet is
 * consulted at all. A rejection carries which layer refused it, because "the
 * screen has gone" and "the wager is over the ceiling" are different sentences
 * to put in front of a player and `B15` at `BJ-15` has to tell them apart.
 *
 * **A rejection is a value and mutates nothing.** Every refusal a player can
 * reach comes back as an `IntentResult`, in the house style of `shoe.ts` and
 * `wallet.ts`. The `RangeError` throws in this file are caller defects, and
 * `wallet.ts`'s handoff is what makes the distinction matter: a second initial
 * commit, settling a hand twice, closing a round with a hand unsettled and a
 * reset mid-round are all throws there, and this module's phase legality is
 * exactly what makes every one of them unreachable from any player action in
 * any phase. A player action that could reach a wallet throw is a defect here,
 * not there.
 *
 * **The offer closes before the peek result is applied.** SPEC 4.4, and it is
 * the reason `insurance` is a phase rather than a step inside `peek`. The
 * dealing branch asks `offersInsurance(up)` first and only ever calls `peek`
 * inside the `peek` phase, which is the ordering `dealer.ts` documented and
 * could not enforce, because it has no phases to enforce it with.
 *
 * **Every timer is a float accumulator and there is no clock in this file.**
 * DESIGN section 3: no `setTimeout` drives game state, no frame counter exists,
 * and queued work drains in a `while` loop against the accumulator so wall
 * clock pacing survives a stutter. `update(dt)` is handed the delta by whoever
 * owns the loop, which is `main.ts` at `BJ-19`, and clamps it per QUALITY-BAR
 * section 7 before it is believed.
 *
 * No DOM, no canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { Card, Rank } from './cards';
import { offersInsurance, peek, peeksOn, shouldHit } from './dealer';
import { isNatural } from './hand';
import type {
  DealStep,
  HandInPlay,
  HandState,
  InsuranceOffer,
  Intent,
  IntentKind,
  Phase,
  PhaseKind,
  SettledHand,
} from './types';
import type { Refusal, TableId, TableLimits, Wallet, WalletReadout } from './wallet';
import { LOWEST_TABLE, bustOut, canEnter, createWallet, tableLimits } from './wallet';

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
 * Four steps, and the queue is the machine's contribution: it is what makes
 * `dealing` a paced phase rather than an instant one, and what `DEAL_INTERVAL`
 * paces. That the cards really arrive, two face up to the player and one face
 * up plus one face down to the dealer, in this order, is item `B6` at `BJ-8`,
 * whose criterion states the order in as many words and whose implementation
 * draws them from the shoe `BJ-3` built.
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

/** What `Array.prototype.findIndex` answers when nothing matches. */
const NOT_FOUND = -1;

/**
 * The net every hand settles at until `BJ-8` wires the ladder.
 *
 * SPEC 4.11 credits back `wager + net` and SPEC 4.10's nine rungs decide the
 * net. `settlement.ts` built that ladder at `BJ-5` and nothing has wired it,
 * because wiring it needs the cards `B6` deals and the actions `B9` to `B12`
 * take, all at `BJ-8`. Until then every hand closes at zero, so the round
 * **boundary** is real and the arithmetic behind it is not.
 *
 * The boundary has to be real even now: `wallet.ts` throws on a round closed
 * with a hand still committed and on a second initial commit, so a machine
 * that skipped the close would make the next Deal a wallet throw reached by a
 * player action. Item `C1` at `BJ-20` grades the whole phase order end to end
 * with real outcomes, and the soak `H6` at `BJ-12` grades the four-term
 * identity across 50,000 rounds of them.
 */
const UNWIRED_NET = 0;

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

/** The seventeen intents SPEC 10's diagram offers, in phase order. */
export const INTENT_KINDS: readonly IntentKind[] = Object.freeze([
  'chooseTable',
  'start',
  'tapChip',
  'clear',
  'repeat',
  'max',
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
 * sweep derives it rather than assuming it.
 */
const LEGAL: Readonly<Record<PhaseKind, readonly IntentKind[]>> = Object.freeze({
  start: Object.freeze<IntentKind[]>(['chooseTable', 'start']),
  betting: Object.freeze<IntentKind[]>(['tapChip', 'clear', 'repeat', 'max', 'deal']),
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
 * Two, and they are in a fixed order: the phase is asked first and the wallet
 * is not asked at all when the phase has already said no. The distinction is
 * the readable half of `C2`'s "surfaces a reason": "you cannot bet now" and
 * "that is more than the table takes" are different sentences, and `B15` at
 * `BJ-15` renders the second of them.
 *
 * `BJ-8` adds a third for the per-hand availability rules of SPEC 4.5, 4.6 and
 * 4.8, which are items `B9`, `B10` and `B12`: Double on exactly two cards,
 * Split on an equal-value pair inside the three-split cap, Surrender only on a
 * hand's first two cards. All three sit **under** the phase gate, in the same
 * place the wallet sits today, so adding them widens this union and changes
 * nothing else.
 */
export type RejectionLayer = 'phase' | 'wallet';

/**
 * Why an action was refused.
 *
 * `wrong-phase` is this module's own and is the whole of `C2`'s left-hand
 * side. `table-locked` covers SPEC 6's entry rule and SPEC 4.12's drop, both
 * of which `wallet.ts` answers. The rest is `wallet.ts`'s `Refusal` union
 * unchanged, because SPEC 4.11's reasons belong to the module that decides
 * them and a second spelling of `above-ceiling` here would drift.
 */
export type RejectionReason = 'wrong-phase' | 'table-locked' | Refusal;

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
 * A `null` up card is the "otherwise" arm. Until `BJ-8` deals cards there is
 * no up card to read, and SPEC 10 sends every rank that is neither an Ace nor
 * a ten-value card to `playerTurn`.
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
  /** This round's hands, left to right. SPEC 4.6. Empty between rounds. */
  readonly hands: readonly HandInPlay[];
  /** The dealer's cards. Empty until `B6` at `BJ-8` deals them. */
  readonly dealer: readonly Card[];
  /** The up card SPEC 10's dealing branch reads, once it has been dealt. */
  readonly upCard: Rank | null;
  /** The timed phase's float accumulator, in seconds. DESIGN section 3. */
  readonly elapsed: number;
  /** Intents waiting for the next drain, in the order they arrived. */
  readonly queued: readonly Intent[];
  /** Rounds closed at the round boundary. Never decreases. */
  readonly rounds: number;
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
   * One action. Legality against the current phase first, then the layer
   * underneath. A rejection changes nothing at all.
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
   * unreachable. `main.ts` at `BJ-19` owns the composition; `I2` at `BJ-11`
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
   * The rank the `dealerUp` step of SPEC 4.3's opening deal records.
   *
   * **The one seam this part needs, and the smallest one that works.** SPEC
   * 10's branch at the end of the deal reads the dealer's up card, and until
   * `B6` at `BJ-8` draws cards from the shoe the machine has no way to
   * discover one, so `insurance` and `peek` would be unreachable and `C2`'s
   * sweep could not attempt an intent against them. Supplying the rank lets
   * the machine take its own branch by its own transition, which is the whole
   * point: nothing outside this file can set a phase.
   *
   * It cannot build an illegal state. The type is `Rank`, every value of which
   * `branchAfterDealing` already answers, and the answer is one of the three
   * successors SPEC 10 gives `dealing`. `BJ-8` deletes this option: the
   * `dealerUp` step will set the up card from the rank of the card it drew,
   * one statement in one place, and the branch below does not change.
   */
  readonly openingUpCard?: Rank;
}

/** SPEC 10's opening screen, and the six other phases with no payload. */
const START: Phase = Object.freeze({ kind: 'start' });
const BETTING: Phase = Object.freeze({ kind: 'betting' });
const PEEK: Phase = Object.freeze({ kind: 'peek' });
const REVEAL: Phase = Object.freeze({ kind: 'reveal' });
const DEALER_TURN: Phase = Object.freeze({ kind: 'dealerTurn' });
const SETTLING: Phase = Object.freeze({ kind: 'settling' });
const BUST_OUT: Phase = Object.freeze({ kind: 'bustOut' });

/** One timed step of a phase: how long it takes, and what it does. */
interface TimedStep {
  readonly duration: number;
  readonly take: () => void;
}

/**
 * A table. SPEC 10, DESIGN sections 2 and 3, item `C2`.
 *
 * It always opens at SPEC 10's `start`, and there is no option that says
 * otherwise. Every one of the other ten phases is reached the only way the
 * game reaches it, by an accepted intent or by a timed step, and the returned
 * object carries no setter that could put the machine anywhere else.
 */
export function createTable(options: TableOptions = {}): Table {
  const wallet: Wallet = options.wallet ?? createWallet();
  const openingUpCard: Rank | null = options.openingUpCard ?? null;

  let selected: TableId = options.table ?? LOWEST_TABLE.id;
  let phase: Phase = START;
  let elapsed = 0;
  let rounds = 0;
  let upCard: Rank | null = null;
  let dealQueue: DealStep[] = [];

  /** This round's hands, left to right. SPEC 4.6. */
  const hands: HandInPlay[] = [];
  /** The dealer's cards. `B6` at `BJ-8` is what puts one in here. */
  const dealer: Card[] = [];
  /** Intents waiting for the next drain. DESIGN section 3. */
  const queued: Intent[] = [];

  function limits(): TableLimits {
    return tableLimits(selected);
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
   * a local test for an Ace beside a ten. It is false until `BJ-8` deals the
   * cards that could make it true, and the question is already the right one.
   */
  function insuranceOffer(): InsuranceOffer {
    const hand = handAt(FIRST_HAND);
    return Object.freeze({
      stake: hand.wager / INSURANCE_STAKE_DIVISOR,
      evenMoney: isNatural(hand.cards, { fromSplit: hand.fromSplit }),
    });
  }

  /**
   * SPEC 4.4's peek, asked once, in the only phase allowed to ask it.
   *
   * The guard is `dealer.ts`'s: `peeksOn(up)` before `peek(up, hole)`, because
   * `peek` throws on an up card SPEC 4.4 never peeks behind and answering one
   * would hand a concealed card to something with no business looking at it.
   * With no cards dealt there is nothing to peek at and the round carries on,
   * which is the same branch SPEC 10 takes when the dealer holds no natural.
   */
  function dealerNaturalAtPeek(): boolean {
    const up = dealer[0];
    const hole = dealer[1];
    if (up === undefined || hole === undefined) {
      return false;
    }
    return peeksOn(up.rank) ? peek(up, hole).dealerNatural : false;
  }

  /**
   * One card of SPEC 4.3's opening deal. `B6` at `BJ-8` is what fills it.
   *
   * `BJ-7` deals nothing: the shoe is not wired and dealing cards into a round
   * is that item's. What the machine needs out of the deal is the one datum
   * SPEC 10's branch reads, so the `dealerUp` step records it. At `BJ-8` the
   * same step draws a card, pushes it into `dealer` and takes the rank from
   * the card it drew, so the two cannot disagree.
   */
  function takeDealStep(step: DealStep): void {
    if (step === 'dealerUp') {
      upCard = openingUpCard;
    }
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
    switch (branchAfterDealing(upCard)) {
      case 'insurance':
        phase = Object.freeze({ kind: 'insurance', offer: insuranceOffer() });
        return;
      case 'peek':
        phase = PEEK;
        return;
      case 'playerTurn':
        phase = playerTurnAt(FIRST_HAND);
        return;
    }
  }

  /** SPEC 10: a dealer natural resolves the round, otherwise the player acts. */
  function applyPeek(): void {
    phase = dealerNaturalAtPeek() ? SETTLING : playerTurnAt(FIRST_HAND);
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

  /**
   * Take one card for the dealer. `B6` at `BJ-8` is what fills it.
   *
   * Returns whether a card arrived. `BJ-7` wires no shoe, so none can, and
   * that is what ends the dealer's turn on its first tick.
   */
  function drawDealerCard(): boolean {
    return false;
  }

  /**
   * One paced draw of the dealer's turn. SPEC 4.9 and SPEC 5's 0.65 s.
   *
   * The policy is `dealer.ts`'s single comparison and is asked here rather
   * than re-derived, per that module's header: the turn, its pacing and SPEC
   * 4.9's gate are the machine's, the rule is not. Today the draw is what ends
   * the turn, because no card can arrive; `B8` at `BJ-4` grades the policy on
   * its own and `C1` at `BJ-20` grades the dealer's turn end to end.
   */
  function dealerDrawStep(): void {
    if (!shouldHit(dealer) || !drawDealerCard()) {
      phase = SETTLING;
    }
  }

  /**
   * The round boundary. SPEC 4.10 settles each hand, SPEC 4.11 credits back.
   *
   * Every hand is settled and then the round is closed, in that order, because
   * `wallet.ts` refuses a boundary with a hand still committed and its handoff
   * puts that discipline here. The shoe's own boundary, SPEC 4.1's reshuffle
   * when the cut card was reached, is `B3`'s `endRound` and is wired at
   * `BJ-8` alongside the deal that consumes cards in the first place.
   *
   * **A hazard `BJ-8` must resolve, written down rather than guarded against.**
   * The index below is this module's position in `hands`, used as the wallet's
   * hand index. The two structures agree today because a round has exactly one
   * hand, and they agree by position rather than by anything stronger. They can
   * come apart at the split: `wallet.ts` **appends** a new hand, while SPEC
   * 4.6 plays hands left to right, so a resplit of the first of three hands
   * has to **insert** the fourth beside its parent here and would leave the
   * wallet holding a different order. `B10` at `BJ-8` owns the split, and it
   * must take one of two decisions and say which: carry the wallet's hand index
   * on `HandInPlay`, populated from the commit result, or keep both structures
   * positionally aligned by inserting in both. **A hand index is not carried
   * today on purpose**: it would be indistinguishable from the position at
   * every reachable state, so no test could hold it and no mutation could break
   * it, which is the standard this module already applied to the accumulator
   * reset in `apply`. Settling the wrong hand is a wrong payout, so this is not
   * a tidiness note.
   */
  function settleRound(): void {
    const settled: SettledHand[] = hands.map((hand, index) =>
      Object.freeze({ wager: hand.wager, credit: wallet.settleHand(index, UNWIRED_NET) }),
    );
    wallet.endRound();
    rounds += 1;
    hands.length = 0;
    dealer.length = 0;
    upCard = null;
    phase = Object.freeze({
      kind: 'roundResult',
      result: Object.freeze({
        hands: Object.freeze(settled),
        chips: wallet.readout().chips,
      }),
    });
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
    const index = activeHand();
    hands[index] = Object.freeze({ ...handAt(index), state });
    const next = hands.findIndex((hand) => hand.state === 'live');
    phase = next === NOT_FOUND ? REVEAL : playerTurnAt(next);
  }

  /**
   * What an accepted intent does. Reached only after the phase allowed it.
   *
   * The switch is exhaustive over `IntentKind` with no `default`, so a
   * seventeenth intent added to the union fails the typecheck here rather than
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
          }),
        );
        dealQueue = [...OPENING_DEAL];
        phase = dealingWith(dealQueue);
        return accepted('deal');
      }
      case 'takeInsurance':
      case 'declineInsurance': {
        // SPEC 4.4 and SPEC 10: accepted or declined, the offer always closes
        // before any peek result is applied, so both answers hand to `peek`
        // and neither can see one. Taking the stake out of the balance, the
        // 2:1 payout, even money's deferred remainder and the `+wager` net on
        // both of its branches are item `B11` at `BJ-8`.
        phase = PEEK;
        return accepted(intent.kind);
      }
      case 'stand': {
        // SPEC 4.5: end play on this hand. The only one of the five actions
        // the machine can finish on its own, because it needs no card and no
        // chip: hands play left to right per SPEC 4.6 and the turn ends when
        // none is live, which is SPEC 4.9's precondition for the reveal.
        resolveActiveHand('stood');
        return accepted('stand');
      }
      case 'hit':
      case 'double':
      case 'split':
      case 'surrender': {
        // Accepted by the phase and inert until `BJ-8`. Each needs something
        // this part does not have: Hit and Double need a card from the shoe,
        // Double and Split need the wallet commits `wallet.ts` already
        // exports, and all four need the per-hand availability rules of SPEC
        // 4.5, 4.6 and 4.8. Those are items `B9`, `B10` and `B12`, and they
        // arrive **under** this gate rather than beside it: the phase check
        // above does not move, and a hand that may not double is refused by
        // the layer the wallet occupies today.
        return accepted(intent.kind);
      }
      case 'nextHand': {
        // SPEC 10: chips < tableMin ? BUST_OUT : BETTING, asked through SPEC
        // 4.12's own predicate so there is one reading of "out at this table".
        const state = wallet.readout();
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
    return perform(intent);
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
   * part of the `playerTurn` value, so once `BJ-8`'s split puts a second hand
   * on the table, Stand moves `playerTurn(0)` to `playerTurn(1)`: the same tag,
   * a different screen. Compared by tag the queue survives, and a double press
   * on Stand stands the hand the player has not looked at yet, which is exactly
   * the trap above. Every phase object is built frozen at each transition and
   * never edited in place, so identity is exact here and strictly stronger than
   * the tag on every other transition too.
   *
   * The distinguishing case cannot be driven yet: no `BJ-7` transition produces
   * the same tag with a different payload, because that needs two hands.
   * **`BJ-8` must land the two-hand discard regression test and a mutation
   * entry regressing this compare to `phase.kind` alongside its split**, since
   * only there can either of them fail.
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
    });
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
   */
  function readout(): TableReadout {
    return Object.freeze({
      phase,
      table: selected,
      hands: Object.freeze(hands.map(copyHand)),
      dealer: Object.freeze([...dealer]),
      upCard,
      elapsed,
      queued: Object.freeze([...queued]),
      rounds,
      wallet: wallet.readout(),
    });
  }

  return Object.freeze({ readout, apply, queue, drain, update });
}
