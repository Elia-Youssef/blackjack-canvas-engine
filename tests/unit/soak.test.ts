/**
 * Items `H6` (Critical, 19 points) and `B5` (Major, 8 points), at `BJ-12`.
 *
 * `H6`, tracing QUALITY-BAR section 6: "A 50000-round headless soak completes
 * with no crash, no duplicate card in play, a non-negative balance, and chips +
 * committed + insuranceStake - deferredStake moving only by a settled outcome.
 * The three-term form of this identity fails on any insured round and is a
 * negative control for the check."
 *
 * `B5`, tracing SPEC 4.1: "The defensive rebuild path is never reached during a
 * 50000-round soak, and when forced it never returns a card that is in play."
 *
 * **The identity is audited between every two observations, not at the round's
 * ends.** Every `apply` and every `update` is bracketed by readouts, and the
 * four-term sum must move by exactly zero except at three places the rules
 * name: the peek settling SPEC 4.7's side wager, the settlement crediting SPEC
 * 4.10's nets, and SPEC 4.12's free reset, which `wallet.ts` documents as the
 * one deliberate injection and which is why the soak measures the movement
 * rather than the value. That third allowance is a documented reading of the
 * criterion's "moving only by a settled outcome": the reset is a player action
 * SPEC 4.12 defines as restoring 1,000 chips, the soak drives it every time the
 * bankroll busts out, and the movement it allows is pinned to exactly
 * `1,000 - conserved`, so nothing else can hide under the exemption.
 *
 * **The criterion's three-term control fails on every insured round, and its
 * firing law is derived, not observed.** Dropping `insuranceStake` from the
 * identity leaves `chips + committed - deferredStake`, and that reading cannot
 * survive an insured round: at the take the stake leaves the balance and lands
 * in the dropped term, and at the peek settlement it comes back through the
 * dropped term, so the form fails exactly twice per insured round, funded or
 * deferred, and nowhere else. The boundary release is neutral in it, because
 * the balance and the subtracted term fall together there. The audit therefore
 * requires, per round and with strict equality, two failures on an insured
 * round and zero on any other, and over the whole soak
 * `droppingStakeViolations === 2 x insuredRounds`, which on the pinned seeds
 * is 3,900 failures across 1,950 insured rounds.
 *
 * **A second three-term reading is kept beside it, because it is the only one
 * that isolates the fourth term.** Dropping `deferredStake` instead leaves
 * `chips + committed + insuranceStake`, which agrees with the four-term law on
 * every fully funded round and comes apart only while a shortfall is
 * outstanding, which SPEC 4.7 makes reachable on exactly one path: an
 * even-money stake the balance cannot fully fund. That form fails exactly
 * twice per deferred round, at the take and at the boundary release, so the
 * audit requires `droppingDeferredViolations === 2 x deferredRounds`, per
 * round and in total, and requires deferred rounds in the mix: a soak with
 * none would prove nothing about the fourth term. The scripted rounds below
 * pin both firing patterns step by step, on a funded round where only the
 * criterion's control fires and on three deferred rounds where the two fire at
 * different points.
 *
 * **Zero comparisons are `===` comparisons throughout.** `settlement.ts`
 * legitimately returns `-0` at a wager of 0, and `-0 === 0` is true where
 * `Object.is(-0, 0)` is not, so the audit never asserts a zero through the
 * runner's identity matcher.
 *
 * **What this file does not claim.** The shuffle's uniformity is `B2`'s
 * measured band in `tests/unit/shoe.test.ts`; the seeded transcripts are
 * `B16`'s in `tests/unit/determinism.test.ts`; frame-rate independence is
 * `M5`'s in `tests/unit/frame-independence.test.ts`; and the per-clause rules
 * the soak exercises are the `BJ-8` suites'. What is here is breadth under one
 * roof: fifty thousand rounds, every action class driven and counted, all nine
 * settlement rungs reached, and the conservation law held between every two
 * frames on the way.
 *
 * The whole soak reproduces from two pinned seeds: `TABLE_SEED` feeds the
 * machine's session stream and `DRIVER_SEED` feeds the auto-player's own child
 * stream, per SPEC 4.1 and item `M3`: no randomness outside the seeded module,
 * and every independent consumer on its own `split()`.
 */

import { describe, expect, it } from 'vitest';

import type { Card, Rank } from '../../src/core/cards';
import { handValue } from '../../src/core/hand';
import type { Rng } from '../../src/core/rng';
import { createRng } from '../../src/core/rng';
import type { DeckCount } from '../../src/core/shoe';
import { CARDS_PER_DECK, DECK_COUNTS, createShoe, cutCardRange } from '../../src/core/shoe';
import type { IntentResult, TableOptions, TableReadout } from '../../src/core/table';
import { createTable } from '../../src/core/table';
import type { Intent, PhaseKind, Rung } from '../../src/core/types';
import type { ChipDenomination, Wallet, WalletReadout } from '../../src/core/wallet';
import { NO_WAGER, STARTING_CHIPS, createWallet, tableLimits } from '../../src/core/wallet';

import { scriptedShoe } from './support/stacked-shoe';

// ---------------------------------------------------------------------------
// SPEC 4.11 and 4.7, transcribed
// ---------------------------------------------------------------------------

/** SPEC 4.11's conserved quantity, all four terms. */
function fourTerm(wallet: WalletReadout): number {
  return wallet.chips + wallet.committed + wallet.insuranceStake - wallet.deferredStake;
}

/**
 * The criterion's three-term form: the identity with `insuranceStake` dropped.
 * It fails exactly twice on every insured round, at the take and at the peek
 * settlement, because both movements pass through the dropped term; the
 * boundary release is neutral in it.
 */
function threeTermDroppingStake(wallet: WalletReadout): number {
  return wallet.chips + wallet.committed - wallet.deferredStake;
}

/**
 * The other three-term form: the identity with `deferredStake` dropped. It is
 * the only reading that isolates the fourth term, agreeing with the four-term
 * law on every fully funded round and failing exactly twice on a deferred
 * even-money round, at the take and at the boundary release.
 */
function threeTermDroppingDeferred(wallet: WalletReadout): number {
  return wallet.chips + wallet.committed + wallet.insuranceStake;
}

/** The criterion's own number. Not a tunable. */
const SOAK_ROUNDS = 50_000;

/** The machine's session seed. The soak reproduces from this and DRIVER_SEED. */
const TABLE_SEED = 20260824;

/** The auto-player's seed. Its stream is split below, per item `M3`. */
const DRIVER_SEED = 4712;

/**
 * One frame of QUALITY-BAR section 7's largest believable delta, so the soak
 * spends the fewest updates per timed step that a legal frame allows.
 */
const TICK = 0.25;

/**
 * SPEC 4.1's worst-case round in cards, per shoe size: the most cards 146 in
 * pip value can buy out of each composition. Quoted from SPEC 4.1's table; the
 * derivation from the composition itself is `tests/unit/cut-card.test.ts`'s.
 */
const WORST_CASE_ROUND: Record<DeckCount, number> = { 6: 72, 8: 80 };

/** The phases during which cards are on the felt and in play. SPEC 10. */
const MID_ROUND: readonly PhaseKind[] = [
  'dealing',
  'peek',
  'insurance',
  'playerTurn',
  'reveal',
  'dealerTurn',
  'settling',
];

/** No single round takes anywhere near this many observations. */
const ROUND_OP_LIMIT = 400;

/** SPEC 4.10 has nine rungs, and the soak must reach every one. */
const ALL_RUNGS: readonly Rung[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// ---------------------------------------------------------------------------
// The audited table: every observation checked, every movement explained
// ---------------------------------------------------------------------------

/** SPEC 4.7's side wager, as the audit tracks it from the take to the print. */
interface SideWager {
  readonly stake: number;
  readonly evenMoney: boolean;
  readonly deferred: number;
}

/** What the soak counted, for the breadth assertions at the end. */
interface Tally {
  roundsClosed: number;
  hits: number;
  stands: number;
  doubles: number;
  splits: number;
  surrenders: number;
  insuranceTaken: number;
  insuranceDeclined: number;
  insuredRounds: number;
  evenMoneyTaken: number;
  deferredRounds: number;
  resets: number;
  reshuffles: number;
  maxHands: number;
  /** Failures of `chips + committed - deferredStake`: the criterion's control. */
  droppingStakeViolations: number;
  /** Failures of `chips + committed + insuranceStake`: the fourth term isolated. */
  droppingDeferredViolations: number;
  rungs: Set<Rung>;
}

function emptyTally(): Tally {
  return {
    roundsClosed: 0,
    hits: 0,
    stands: 0,
    doubles: 0,
    splits: 0,
    surrenders: 0,
    insuranceTaken: 0,
    insuranceDeclined: 0,
    insuredRounds: 0,
    evenMoneyTaken: 0,
    deferredRounds: 0,
    resets: 0,
    reshuffles: 0,
    maxHands: 0,
    droppingStakeViolations: 0,
    droppingDeferredViolations: 0,
    rungs: new Set<Rung>(),
  };
}

interface Audited {
  state(): TableReadout;
  apply(intent: Intent): IntentResult;
  tick(): void;
  /** Reconcile SPEC 12's round result against everything the audit tracked. */
  closeRound(): void;
  readonly tally: Tally;
}

/**
 * Wrap a table so that no observation escapes the audit.
 *
 * `realShoe` is false only for the scripted control rounds below, whose
 * injected shoe is the disclosed test-only seam of `TableOptions` and reports
 * a stack that is not a full complement. Every wallet check and the duplicate
 * check still run there; only the two claims that are about the real shoe's
 * composition are skipped.
 */
function auditedTable(options: TableOptions, realShoe: boolean): Audited {
  const table = createTable(options);
  let current = table.readout();
  let sideWager: SideWager | null = null;
  let sideWagerNet: number | null = null;
  /** `shoe.dealt` at the deal, so in-play arithmetic has a base. Null between rounds. */
  let roundBase: number | null = null;
  /** The control counters at the last boundary, for the per-round firing law. */
  let stakeViolationsAtClose = 0;
  let deferredViolationsAtClose = 0;
  const tally = emptyTally();

  function fail(message: string): never {
    throw new Error(
      `round ${String(current.rounds)}, phase ${current.phase.kind}: ${message}`,
    );
  }

  /**
   * H6's conservation law, between two consecutive observations. The four-term
   * sum must move by exactly `allowed`; the two three-term readings are
   * measured against the same allowance and their failures are counted rather
   * than thrown, because failing is what a control is for. `closeRound` holds
   * each counter to its derived per-round firing law.
   */
  function audit(before: TableReadout, after: TableReadout, allowed: number): void {
    const moved = fourTerm(after.wallet) - fourTerm(before.wallet);
    if (moved !== allowed) {
      fail(
        `the four-term identity moved by ${String(moved)} where ${String(allowed)} was settled`,
      );
    }
    if (threeTermDroppingStake(after.wallet) - threeTermDroppingStake(before.wallet) !== allowed) {
      tally.droppingStakeViolations += 1;
    }
    const movedDroppingDeferred =
      threeTermDroppingDeferred(after.wallet) - threeTermDroppingDeferred(before.wallet);
    if (movedDroppingDeferred !== allowed) {
      tally.droppingDeferredViolations += 1;
    }
  }

  /** Every invariant that must hold at every observation, H6 and B5 alike. */
  function invariants(after: TableReadout): void {
    const wallet = after.wallet;
    if (!Number.isInteger(wallet.chips) || wallet.chips < 0) {
      fail(`SPEC 4.11: the balance is ${String(wallet.chips)}`);
    }
    if (wallet.conserved !== fourTerm(wallet)) {
      fail('the published conserved figure is not the four-term sum of its own fields');
    }

    const shoe = after.shoe;
    if (shoe.rebuilds !== 0) {
      fail('SPEC 4.1: the defensive rebuild fired in play');
    }
    if (shoe.remaining !== shoe.stacked - shoe.dealt) {
      fail('the shoe readout does not add up');
    }
    if (realShoe && shoe.stacked !== shoe.complement) {
      fail('the stack stopped being the full complement between boundaries');
    }
    const expectInPlay =
      MID_ROUND.includes(after.phase.kind) && roundBase !== null ? shoe.dealt - roundBase : 0;
    if (shoe.inPlay !== expectInPlay) {
      fail(
        `SPEC 4.1: ${String(shoe.inPlay)} cards in play where the round dealt ${String(expectInPlay)}`,
      );
    }

    // No duplicate card in play: never the same object twice, and never more
    // copies of a rank and suit than the shoe holds. SPEC 4.1.
    const felt: Card[] = [];
    for (const hand of after.hands) {
      felt.push(...hand.cards);
    }
    felt.push(...after.dealerVisible);
    if (new Set<Card>(felt).size !== felt.length) {
      fail('SPEC 4.1: the same card object is on the felt twice');
    }
    const copies = new Map<string, number>();
    for (const card of felt) {
      const key = `${card.rank}:${card.suit}`;
      const count = (copies.get(key) ?? 0) + 1;
      if (count > after.rules.decks) {
        fail(`SPEC 4.1: ${key} is on the felt more times than the shoe contains it`);
      }
      copies.set(key, count);
    }
  }

  function countAction(kind: Intent['kind']): void {
    switch (kind) {
      case 'hit':
        tally.hits += 1;
        break;
      case 'stand':
        tally.stands += 1;
        break;
      case 'double':
        tally.doubles += 1;
        break;
      case 'split':
        tally.splits += 1;
        break;
      case 'surrender':
        tally.surrenders += 1;
        break;
      case 'takeInsurance':
        tally.insuranceTaken += 1;
        break;
      case 'declineInsurance':
        tally.insuranceDeclined += 1;
        break;
      default:
        break;
    }
  }

  function apply(intent: Intent): IntentResult {
    const before = current;
    const offer = before.phase.kind === 'insurance' ? before.phase.offer : null;
    const result = table.apply(intent);
    const after = table.readout();
    // SPEC 4.12's reset is the one movement that is not a settled outcome, and
    // it is pinned to exactly the restoration it performs.
    const allowed =
      result.ok && intent.kind === 'resetBankroll'
        ? STARTING_CHIPS - fourTerm(before.wallet)
        : 0;
    audit(before, after, allowed);
    current = after;
    invariants(after);

    if (result.ok) {
      countAction(intent.kind);
      if (intent.kind === 'deal') {
        roundBase = after.shoe.dealt;
        // B5's guarantee at every round start: the cards on hand exceed the
        // derived worst case, so no round can reach the rebuild.
        if (realShoe && after.shoe.remaining <= WORST_CASE_ROUND[after.rules.decks]) {
          fail(
            `SPEC 4.1: a round began on ${String(after.shoe.remaining)} cards against a ` +
              `worst case of ${String(WORST_CASE_ROUND[after.rules.decks])}`,
          );
        }
      }
      if (intent.kind === 'takeInsurance') {
        if (offer === null) {
          fail('takeInsurance was accepted outside the insurance phase');
        }
        sideWager = Object.freeze({
          stake: offer.stake,
          evenMoney: offer.evenMoney,
          deferred: after.wallet.deferredStake,
        });
      }
      if (intent.kind === 'resetBankroll') {
        tally.resets += 1;
      }
    }
    return result;
  }

  function tick(): void {
    const before = current;
    table.update(TICK);
    const after = table.readout();
    let allowed = 0;
    if (
      before.phase.kind === 'peek' &&
      after.phase.kind !== 'peek' &&
      sideWager !== null &&
      sideWagerNet === null
    ) {
      // SPEC 4.7: the side wager settles at the peek, at 2:1 or as a lost
      // stake and at nothing else. The movement is captured here and must
      // match the printed insurance net at the round result.
      const moved = fourTerm(after.wallet) - fourTerm(before.wallet);
      if (moved !== 2 * sideWager.stake && moved !== -sideWager.stake) {
        fail(`SPEC 4.7: the side wager settled at ${String(moved)} on a stake of ${String(sideWager.stake)}`);
      }
      sideWagerNet = moved;
      allowed = moved;
    } else {
      const phase = after.phase;
      if (before.phase.kind === 'settling' && phase.kind === 'roundResult') {
        // SPEC 4.10 and 4.11: the settlement moves the identity by exactly the
        // sum of the nets it printed, and by nothing else. The deferred
        // release inside the same step is identity-neutral by SPEC 4.7.
        let nets = 0;
        for (const hand of phase.result.hands) {
          nets += hand.credit - hand.wager;
        }
        allowed = nets;
        if (after.shoe.dealt < before.shoe.dealt) {
          tally.reshuffles += 1;
        }
      }
    }
    audit(before, after, allowed);
    current = after;
    invariants(after);
  }

  function closeRound(): void {
    const state = current;
    const phase = state.phase;
    if (phase.kind !== 'roundResult') {
      fail('closeRound was asked outside the round result');
    }
    const result = phase.result;
    if (result.chips !== state.wallet.chips) {
      fail('SPEC 12: the printed balance is not the balance');
    }
    const wallet = state.wallet;
    if (
      wallet.committed !== 0 ||
      wallet.insuranceStake !== 0 ||
      wallet.deferredStake !== 0 ||
      wallet.wager !== NO_WAGER
    ) {
      fail('SPEC 4.7 and 4.11: a commitment or the side wager survived the round boundary');
    }
    if (result.hands.length !== state.hands.length) {
      fail('SPEC 12 printed a different number of hands than are on the felt');
    }
    for (const hand of result.hands) {
      tally.rungs.add(hand.rung);
    }
    if (result.hands.length > tally.maxHands) {
      tally.maxHands = result.hands.length;
    }

    if (sideWager === null) {
      if (result.insurance !== null) {
        fail('SPEC 12 printed an insurance result no offer was taken for');
      }
    } else {
      const insurance = result.insurance;
      if (insurance === null) {
        fail('SPEC 12 lost the insurance result');
      }
      if (sideWagerNet === null || insurance.net !== sideWagerNet) {
        fail('the identity movement at the peek does not match the printed insurance net');
      }
      if (insurance.stake !== sideWager.stake) {
        fail('the printed stake is not the stake that was taken');
      }
      if (insurance.deferred !== sideWager.deferred) {
        fail('the printed shortfall is not the shortfall that was recorded');
      }
      if (insurance.evenMoney !== sideWager.evenMoney) {
        fail('the printed offer kind is not the offer that was taken');
      }
      if (insurance.credit !== sideWager.stake + insurance.net) {
        fail('SPEC 4.7: the insurance credit is not stake + net');
      }
      tally.insuredRounds += 1;
      if (insurance.evenMoney) {
        tally.evenMoneyTaken += 1;
      }
      if (insurance.deferred > 0) {
        tally.deferredRounds += 1;
      }
    }

    // The controls' firing law, per round and with strict equality. The
    // criterion's three-term form fails exactly twice on an insured round, at
    // the take and at the peek settlement, and never on any other round; the
    // fourth-term isolator fails exactly twice on a deferred round, at the
    // take and at the release, and is silent on a funded one. A per-round law
    // is stronger than the whole-soak totals it implies: a firing missed in
    // one round cannot be paid for by a spurious one in another.
    const stakeFired = tally.droppingStakeViolations - stakeViolationsAtClose;
    const deferredFired = tally.droppingDeferredViolations - deferredViolationsAtClose;
    const insuredHere = sideWager !== null;
    const deferredHere = sideWager !== null && sideWager.deferred > 0;
    if (stakeFired !== (insuredHere ? 2 : 0)) {
      fail(
        `the criterion's three-term control fired ${String(stakeFired)} times on ` +
          `${insuredHere ? 'an insured' : 'an uninsured'} round`,
      );
    }
    if (deferredFired !== (deferredHere ? 2 : 0)) {
      fail(
        `the fourth-term isolator fired ${String(deferredFired)} times on ` +
          `${deferredHere ? 'a deferred' : 'an undeferred'} round`,
      );
    }
    stakeViolationsAtClose = tally.droppingStakeViolations;
    deferredViolationsAtClose = tally.droppingDeferredViolations;

    sideWager = null;
    sideWagerNet = null;
    roundBase = null;
    tally.roundsClosed += 1;
    if (state.rounds !== tally.roundsClosed) {
      fail(
        `the machine has closed ${String(state.rounds)} rounds and the audit ${String(tally.roundsClosed)}`,
      );
    }
  }

  return { state: (): TableReadout => current, apply, tick, closeRound, tally };
}

function mustOk(result: IntentResult): void {
  if (!result.ok) {
    throw new Error(`${result.kind} was refused by ${result.layer} as ${result.reason}`);
  }
}

// ---------------------------------------------------------------------------
// The auto-player: every action class driven, from its own seeded stream
// ---------------------------------------------------------------------------

/**
 * One betting decision. Mostly a tap and a deal; sometimes Max, which is what
 * makes an all-in even-money stake, and with it SPEC 4.7's deferral,
 * reachable; sometimes Repeat or Clear, so the whole control set is on the
 * driven path. A refused control is a value, changes nothing, and the audit
 * has already checked exactly that.
 */
function betOnce(audited: Audited, driver: Rng): void {
  const state = audited.state();
  const roll = driver.nextInt(20);
  if (state.wallet.wager === NO_WAGER) {
    if (roll === 0) {
      audited.apply({ kind: 'max' });
      return;
    }
    if (roll === 1) {
      audited.apply({ kind: 'repeat' });
      return;
    }
    const pick = driver.nextInt(6);
    const chip: ChipDenomination = pick < 3 ? 10 : pick < 5 ? 50 : 100;
    audited.apply({ kind: 'tapChip', chip });
    return;
  }
  if (roll === 19) {
    audited.apply({ kind: 'clear' });
    return;
  }
  if (roll >= 17) {
    audited.apply({ kind: 'tapChip', chip: 10 });
    return;
  }
  mustOk(audited.apply({ kind: 'deal' }));
}

/** SPEC 4.7's decision. Even money is taken often, insurance half the time. */
function answerOffer(audited: Audited, driver: Rng): void {
  const state = audited.state();
  const phase = state.phase;
  if (phase.kind !== 'insurance') {
    throw new Error(`answerOffer was asked at ${phase.kind}`);
  }
  const wantsIt = phase.offer.evenMoney ? driver.nextInt(3) > 0 : driver.nextInt(2) === 0;
  if (wantsIt && audited.apply({ kind: 'takeInsurance' }).ok) {
    return;
  }
  mustOk(audited.apply({ kind: 'declineInsurance' }));
}

/**
 * One play decision. Splits are taken greedily when the machine allows them,
 * doubles on the classic totals and occasionally elsewhere, surrenders now
 * and then, and the hit line is noisy on purpose: a policy that never busts
 * or never stands proves nothing about half the settlement ladder.
 */
function actOnce(audited: Audited, driver: Rng): void {
  const state = audited.state();
  const phase = state.phase;
  if (phase.kind !== 'playerTurn') {
    throw new Error(`actOnce was asked at ${phase.kind}`);
  }
  const hand = state.hands[phase.activeHand];
  if (hand === undefined) {
    throw new Error(`no hand at ${String(phase.activeHand)}`);
  }
  const total = handValue(hand.cards).total;
  if (
    hand.cards.length === 2 &&
    !hand.fromSplit &&
    driver.nextInt(12) === 0 &&
    audited.apply({ kind: 'surrender' }).ok
  ) {
    return;
  }
  if (driver.nextInt(10) < 7 && audited.apply({ kind: 'split' }).ok) {
    return;
  }
  if (
    hand.cards.length === 2 &&
    ((total >= 9 && total <= 11) || driver.nextInt(8) === 0) &&
    audited.apply({ kind: 'double' }).ok
  ) {
    return;
  }
  if (total < 12) {
    mustOk(audited.apply({ kind: 'hit' }));
    return;
  }
  if (total < 17 && driver.nextInt(10) < 6) {
    mustOk(audited.apply({ kind: 'hit' }));
    return;
  }
  mustOk(audited.apply({ kind: 'stand' }));
}

// ---------------------------------------------------------------------------
// H6 and the first clause of B5: the soak itself
// ---------------------------------------------------------------------------

describe('H6 and B5: the 50,000-round soak', () => {
  it(
    'holds every invariant across 50,000 auto-played rounds, and the identity moves only by a settled outcome',
    () => {
      // The driver's randomness is the seeded module's, on its own child
      // stream, so the entire soak replays from TABLE_SEED and DRIVER_SEED.
      const driver = createRng(DRIVER_SEED).split();
      const audited = auditedTable({ seed: TABLE_SEED }, true);

      let opsThisRound = 0;
      let lastRounds = -1;
      while (audited.tally.roundsClosed < SOAK_ROUNDS) {
        const state = audited.state();
        if (state.rounds !== lastRounds) {
          lastRounds = state.rounds;
          opsThisRound = 0;
        }
        opsThisRound += 1;
        if (opsThisRound > ROUND_OP_LIMIT) {
          throw new Error(`round ${String(state.rounds)} did not finish inside ${String(ROUND_OP_LIMIT)} observations`);
        }
        switch (state.phase.kind) {
          case 'start':
            mustOk(audited.apply({ kind: 'start' }));
            break;
          case 'betting':
            betOnce(audited, driver);
            break;
          case 'insurance':
            answerOffer(audited, driver);
            break;
          case 'playerTurn':
            actOnce(audited, driver);
            break;
          case 'roundResult':
            audited.closeRound();
            if (audited.tally.roundsClosed < SOAK_ROUNDS) {
              mustOk(audited.apply({ kind: 'nextHand' }));
            }
            break;
          case 'bustOut':
            mustOk(audited.apply({ kind: 'resetBankroll' }));
            break;
          default:
            audited.tick();
        }
      }

      const tally = audited.tally;
      expect(tally.roundsClosed).toBe(SOAK_ROUNDS);

      // The breadth is asserted, not hoped. A soak whose policy never split
      // would prove nothing about splits, so every action class carries a
      // floor comfortably below its pinned-seed count, and the count is in
      // the failure message when one is ever missed.
      expect(tally.hits, `hits: ${String(tally.hits)}`).toBeGreaterThan(10_000);
      expect(tally.stands, `stands: ${String(tally.stands)}`).toBeGreaterThan(10_000);
      expect(tally.doubles, `doubles: ${String(tally.doubles)}`).toBeGreaterThan(1_000);
      expect(tally.splits, `splits: ${String(tally.splits)}`).toBeGreaterThan(1_000);
      expect(tally.surrenders, `surrenders: ${String(tally.surrenders)}`).toBeGreaterThan(500);
      expect(tally.insuranceTaken, `taken: ${String(tally.insuranceTaken)}`).toBeGreaterThan(500);
      expect(
        tally.insuranceDeclined,
        `declined: ${String(tally.insuranceDeclined)}`,
      ).toBeGreaterThan(500);
      expect(tally.insuredRounds).toBe(tally.insuranceTaken);
      expect(tally.evenMoneyTaken, `even money: ${String(tally.evenMoneyTaken)}`).toBeGreaterThan(5);
      expect(tally.resets, `resets: ${String(tally.resets)}`).toBeGreaterThan(0);
      expect(tally.reshuffles, `reshuffles: ${String(tally.reshuffles)}`).toBeGreaterThan(400);
      expect(tally.maxHands, 'no round ever held a split hand').toBeGreaterThanOrEqual(3);

      // All nine rungs of SPEC 4.10 were reached and settled through.
      for (const rung of ALL_RUNGS) {
        expect(tally.rungs.has(rung), `rung ${String(rung)} was never settled`).toBe(true);
      }
      expect(tally.rungs.size).toBe(ALL_RUNGS.length);

      // H6's negative control, on the driven mix, while the four-term law
      // held at every observation (or the audit would have thrown). The
      // criterion's three-term form fails on any insured round, and its
      // firing law is exact: twice per insured round, at the take and at the
      // peek settlement, nowhere else. On the pinned seeds that is 3,900
      // failures across 1,950 insured rounds. The per-round form of the same
      // law has already been enforced at every boundary by `closeRound`.
      expect(tally.droppingStakeViolations).toBe(2 * tally.insuredRounds);

      // The fourth-term isolator beside it: dropping `deferredStake` instead
      // fails exactly twice per deferred round, at the take and at the
      // release, and agrees with the four-term law everywhere else. On the
      // pinned seeds that is 10 failures across 5 deferred rounds; without
      // deferred rounds in the mix it would prove nothing, so their presence
      // is asserted rather than assumed.
      expect(tally.deferredRounds, `deferred: ${String(tally.deferredRounds)}`).toBeGreaterThan(0);
      expect(tally.droppingDeferredViolations).toBe(2 * tally.deferredRounds);
    },
    300_000,
  );
});

// ---------------------------------------------------------------------------
// H6's controls, pinned: the scripted rounds where each form must fail
// ---------------------------------------------------------------------------

/** Drain a fresh wallet to a chosen balance through its own controls. */
function walletAt(target: number): Wallet {
  const wallet = createWallet();
  const bronze = tableLimits('bronze');
  let turns = 0;
  while (wallet.readout().chips > target) {
    turns += 1;
    if (turns > 100) {
      throw new Error(`draining a wallet to ${String(target)} did not finish`);
    }
    const loss = Math.min(bronze.maximum, wallet.readout().chips - target);
    for (const chip of [100, 50, 10] as const) {
      while (wallet.readout().wager + chip <= loss) {
        if (!wallet.tap(chip, bronze).ok) {
          throw new Error(`a ${String(chip)} chip was refused while draining`);
        }
      }
    }
    const commit = wallet.commitInitial(bronze);
    if (!commit.ok) {
      throw new Error(`the wallet refused a ${String(loss)} commit while draining`);
    }
    wallet.settleHand(commit.hand, -commit.wager);
    wallet.endRound();
  }
  if (wallet.readout().chips !== target) {
    throw new Error(`expected ${String(target)} chips, found ${String(wallet.readout().chips)}`);
  }
  return wallet;
}

/**
 * The scripted control rounds, written in SPEC 4.3's deal order: player,
 * dealer up, player, dealer down. The ordinary round is a hard 16 against a
 * dealer Ace; the even-money rounds hold a player natural against the Ace,
 * which is the one door SPEC 4.7 opens to the deferral. The hole card decides
 * the peek's branch, and a nine leaves the dealer standing on soft 20, so
 * every round is fully determined by its four cards.
 */
const ORDINARY_NO_NATURAL: readonly Rank[] = ['9', 'A', '7', '9'];
const EVEN_MONEY_NATURAL: readonly Rank[] = ['A', 'A', '10', '10'];
const EVEN_MONEY_NO_NATURAL: readonly Rank[] = ['A', 'A', '10', '9'];

interface ControlScenario {
  readonly name: string;
  /** The balance the wallet is drained to before the round. 1,000 is fresh. */
  readonly chips: number;
  readonly taps: readonly ChipDenomination[];
  readonly script: readonly Rank[];
  /** SPEC 4.7: `wager / 2` of the initial wager. */
  readonly stake: number;
  readonly deferred: number;
  readonly evenMoney: boolean;
  /** SPEC 4.7's net on the side wager: `2 x stake` or `-stake`. */
  readonly insuranceNet: number;
  /** The whole round's movement of the balance, wager and stake together. */
  readonly net: number;
}

/**
 * One funded round and three deferred ones, so both controls' firing patterns
 * are pinned where they differ. All-in leaves the whole stake unfunded; 130
 * chips against a 100 wager leave 30 toward a 50 stake, so 20 is deferred.
 * Both branches of the peek are driven. Every even-money round nets exactly
 * `+wager` per SPEC 4.7, and the funded round loses the wager and the stake.
 */
const CONTROL_SCENARIOS: readonly ControlScenario[] = [
  {
    name: 'a funded ordinary stake, on which only the criterion control fires',
    chips: 1000,
    taps: [50],
    script: ORDINARY_NO_NATURAL,
    stake: 25,
    deferred: 0,
    evenMoney: false,
    insuranceNet: -25,
    net: -75,
  },
  {
    name: 'a fully deferred stake against a dealer natural',
    chips: 100,
    taps: [100],
    script: EVEN_MONEY_NATURAL,
    stake: 50,
    deferred: 50,
    evenMoney: true,
    insuranceNet: 100,
    net: 100,
  },
  {
    name: 'a fully deferred stake with no dealer natural',
    chips: 100,
    taps: [100],
    script: EVEN_MONEY_NO_NATURAL,
    stake: 50,
    deferred: 50,
    evenMoney: true,
    insuranceNet: -50,
    net: 100,
  },
  {
    name: 'a partly deferred stake against a dealer natural',
    chips: 130,
    taps: [100],
    script: EVEN_MONEY_NATURAL,
    stake: 50,
    deferred: 20,
    evenMoney: true,
    insuranceNet: 100,
    net: 100,
  },
] as const;

describe('H6: the two three-term controls, pinned step by step', () => {
  for (const scenario of CONTROL_SCENARIOS) {
    it(scenario.name, () => {
      const audited = auditedTable(
        { wallet: walletAt(scenario.chips), shoe: scriptedShoe(scenario.script) },
        false,
      );
      mustOk(audited.apply({ kind: 'start' }));
      for (const chip of scenario.taps) {
        mustOk(audited.apply({ kind: 'tapChip', chip }));
      }
      mustOk(audited.apply({ kind: 'deal' }));
      let turns = 0;
      const turn = (): void => {
        turns += 1;
        if (turns > 60) {
          throw new Error('the scripted round did not finish');
        }
      };
      while (audited.state().phase.kind === 'dealing') {
        turn();
        audited.tick();
      }

      // SPEC 4.7's offer, exactly as scripted: even money regardless of
      // balance on a natural, the ordinary terms otherwise.
      const offerPhase = audited.state().phase;
      if (offerPhase.kind !== 'insurance') {
        throw new Error(`expected the offer, found ${offerPhase.kind}`);
      }
      expect(offerPhase.offer.stake).toBe(scenario.stake);
      expect(offerPhase.offer.evenMoney).toBe(scenario.evenMoney);

      // The take. The four-term identity does not move. The criterion's
      // control fails its first time on every scenario, because the stake
      // leaves the balance for its dropped term; the fourth-term isolator
      // fails only when part of the stake was deferred into its own.
      mustOk(audited.apply({ kind: 'takeInsurance' }));
      expect(audited.state().wallet.deferredStake).toBe(scenario.deferred);
      expect(audited.tally.droppingStakeViolations).toBe(1);
      expect(audited.tally.droppingDeferredViolations).toBe(scenario.deferred > 0 ? 1 : 0);

      // The peek settlement: the criterion control's second failure, because
      // the credit comes back through its dropped term. The isolator moves by
      // exactly the settled net here and stays clean.
      while (audited.state().phase.kind === 'peek') {
        turn();
        audited.tick();
      }
      expect(audited.tally.droppingStakeViolations).toBe(2);
      expect(audited.tally.droppingDeferredViolations).toBe(scenario.deferred > 0 ? 1 : 0);

      // Play out to the result. Only the funded round leaves a live hand to
      // stand; a natural resolves on its own.
      while (audited.state().phase.kind !== 'roundResult') {
        turn();
        if (audited.state().phase.kind === 'playerTurn') {
          mustOk(audited.apply({ kind: 'stand' }));
          continue;
        }
        audited.tick();
      }

      // The boundary. Neutral in the criterion's form, because the balance
      // and its subtracted term fall together at the release; the isolator's
      // second failure on a deferred round, because only the balance moves in
      // it. The four-term audit inside every tick has already proven the
      // release neutral in the real law.
      expect(audited.tally.droppingStakeViolations).toBe(2);
      expect(audited.tally.droppingDeferredViolations).toBe(scenario.deferred > 0 ? 2 : 0);

      const done = audited.state();
      expect(done.wallet.chips).toBe(scenario.chips + scenario.net);
      const phase = done.phase;
      if (phase.kind !== 'roundResult') {
        throw new Error('the walk stopped somewhere that is not the round result');
      }
      const insurance = phase.result.insurance;
      expect(insurance).not.toBeNull();
      expect(insurance?.stake).toBe(scenario.stake);
      expect(insurance?.net).toBe(scenario.insuranceNet);
      expect(insurance?.deferred).toBe(scenario.deferred);
      expect(insurance?.evenMoney).toBe(scenario.evenMoney);
      audited.closeRound();
    });
  }
});

// ---------------------------------------------------------------------------
// B5's second clause: the rebuild, forced
// ---------------------------------------------------------------------------

describe('B5: the defensive rebuild, forced, returns no card that is in play', () => {
  /**
   * The margins the soak's never-fires clause rests on, re-stated as
   * arithmetic: at 25 percent the cards behind the cut exceed the worst-case
   * round on both configured sizes. The worst-case figures are SPEC 4.1's,
   * derived from the composition in `tests/unit/cut-card.test.ts`.
   */
  it('has a margin behind the cut card on both shoe sizes', () => {
    expect(cutCardRange(6).min).toBe(78);
    expect(cutCardRange(8).min).toBe(104);
    for (const decks of DECK_COUNTS) {
      expect(cutCardRange(decks).min).toBeGreaterThan(WORST_CASE_ROUND[decks]);
    }
  });

  for (const decks of DECK_COUNTS) {
    it(`rebuilds a ${String(decks)}-deck shoe without returning an in-play card`, () => {
      const shoe = createShoe(decks, createRng(9000 + decks));
      const complement = decks * CARDS_PER_DECK;

      // A first round short of the cut card, so the boundary passes without a
      // reshuffle and its cards leave play. 60 is comfortably inside the cut
      // on both sizes: at most 40 percent sits behind the cut, so at least 60
      // percent of the shoe is dealt before it surfaces.
      const opening = 60;
      const readout = shoe.readout();
      expect(opening).toBeLessThan(readout.stacked - readout.undealtAtCut);
      for (let n = 0; n < opening; n += 1) {
        shoe.draw();
      }
      expect(shoe.cutCardReached()).toBe(false);
      expect(shoe.endRound()).toBe(false);
      expect(shoe.readout().inPlay).toBe(0);

      // A second round that never ends drains the stack. Everything drawn
      // from here on is in play when the rebuild fires.
      const inPlay: Card[] = [];
      while (shoe.cardsRemaining() > 0) {
        inPlay.push(shoe.draw());
      }
      expect(inPlay).toHaveLength(complement - opening);
      expect(shoe.readout().rebuilds).toBe(0);
      expect(shoe.readout().cutCardReached).toBe(true);

      // The forced draw. The rebuild must produce exactly the cards that are
      // not on the table: the complement minus everything in play.
      const returned: Card[] = [shoe.draw()];
      expect(shoe.readout().rebuilds).toBe(1);
      expect(shoe.readout().stacked).toBe(opening);
      while (shoe.cardsRemaining() > 0) {
        returned.push(shoe.draw());
      }
      expect(returned).toHaveLength(opening);

      // No rebuilt card duplicates an in-play card: together they are one
      // full complement, every rank and suit exactly `decks` times. This is
      // the multiset the invariant is about, and an object-identity check
      // would be vacuous here because the rebuild constructs fresh cards.
      const together = new Map<string, number>();
      for (const card of [...inPlay, ...returned]) {
        const key = `${card.rank}:${card.suit}`;
        together.set(key, (together.get(key) ?? 0) + 1);
      }
      expect(together.size).toBe(CARDS_PER_DECK);
      for (const count of together.values()) {
        expect(count).toBe(decks);
      }

      // `rebuilds` counts attempts. With every card in play the next attempt
      // has nothing to rebuild from and throws rather than inventing a card,
      // and the attempt still counts.
      expect(() => shoe.draw()).toThrow(RangeError);
      expect(shoe.readout().rebuilds).toBe(2);
    });
  }
});
