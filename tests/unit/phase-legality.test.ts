/**
 * Item `C2`, Critical, 16 points: "Every action attempted in every state is
 * accepted only where legal, and a rejected action changes no state and
 * surfaces a reason." Built at `BJ-7`.
 *
 * **The criterion is the assertion, and every figure below is written out from
 * SPEC 10 rather than imported.** The machine holds its own legality table and
 * deliberately does not export it: a sweep that read the table it is grading
 * would agree with any edit to it forever, which is the one failure a legality
 * test exists to prevent. So SPEC 10's diagram is transcribed here, line by
 * line, and the machine is measured against the transcription.
 *
 * **The sweep is exhaustive by arithmetic, not by intention.** Eleven phases
 * crossed with seventeen intents is 187 cells, of which SPEC 10 makes 17 legal
 * and 170 illegal, and all three numbers are derived below and asserted. Every
 * cell is attempted on **a machine of its own**, built by `createTable` and
 * driven into its phase, so no cell can be judged on a state some earlier cell
 * left behind.
 *
 * **Ten of the eleven phases are reached by transitions the machine performed
 * itself**, and the eleventh differs only in what its wallet did. `createTable`
 * always opens at `start` and exposes no phase setter, which is asserted; the
 * rest is `apply` and `update`. Two things the machine cannot yet discover are
 * supplied, and both are named where they are used:
 *
 *   1. The dealer's **up card**, through `TableOptions.openingUpCard`, because
 *      SPEC 10's branch at the end of the deal reads it and no card is dealt
 *      until `B6` at `BJ-8`. It is a `Rank`, and every rank selects one of the
 *      three successors SPEC 10 already gives `dealing`.
 *   2. The **net on a settled hand**, through a wallet that credits a losing
 *      one, because SPEC 4.10's ladder is not wired until `BJ-8` and every
 *      round here therefore closes at zero. `bustOut` is the phase SPEC 10
 *      enters when the balance has fallen below the table minimum, so without a
 *      round that can lose it is unreachable. The wallet is the real
 *      `createWallet`, wrapped; the machine under test is untouched.
 *
 * **Three negative controls, each required to disagree on exactly its derived
 * set.** A phase-blind table that accepts everything everywhere has to differ
 * on all 170 illegal cells. A table that folds insurance into the peek, which
 * is the misreading SPEC 10 and SPEC 4.4 both warn about, has to differ on
 * exactly 4. A table on which the betting controls never close, which is the
 * defect `wallet.ts` warns about in as many words because nothing in the wallet
 * is a phase gate, has to differ on exactly 40. Same device as the shoe's two
 * broken shuffles and the settlement ladder's three reorderings: the control is
 * what makes the claim falsifiable.
 *
 * **What this file does not claim.** `C1` at `BJ-20` grades a complete round
 * end to end in a browser with real cards, `C6` grades one accepted action per
 * frame under rapid input, `C4` the bust-out flow and `C8` the round result.
 * `B15` at `BJ-15` grades the betting refusals where a player can read them.
 * The phase order driven here is the machine's own, with no cards in it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Rank } from '../../src/core/cards';
import { RANKS } from '../../src/core/cards';
import { offersInsurance, peeksOn } from '../../src/core/dealer';
import type { IntentResult, Table, TableReadout } from '../../src/core/table';
import {
  FAST_SPEED_MULTIPLIER,
  INTENT_KINDS,
  MAX_STEP,
  OPENING_DEAL,
  PEEK_PAUSE,
  PHASE_KINDS,
  RESUME_GAP,
  TIMINGS,
  branchAfterDealing,
  clampDelta,
  createTable,
} from '../../src/core/table';
import type { Intent, IntentKind, Outcome, PhaseKind } from '../../src/core/types';
import type {
  BetResult,
  ChipDenomination,
  CommitResult,
  Refusal,
  TableLimits,
  Wallet,
  WalletReadout,
} from '../../src/core/wallet';
import { createWallet, tableLimits } from '../../src/core/wallet';

// ---------------------------------------------------------------------------
// SPEC 10, transcribed. Nothing below is imported from the module under test.
// ---------------------------------------------------------------------------

/**
 * SPEC 10: "Eleven phases plus three overlays. The eleven are `start`,
 * `betting`, `dealing`, `peek`, `insurance`, `playerTurn`, `reveal`,
 * `dealerTurn`, `settling`, `roundResult` and `bustOut`."
 */
const PHASES: readonly PhaseKind[] = [
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
];

/**
 * Every action SPEC 10's flow diagram offers, read off it line by line.
 *
 * The three overlays are not actions. SPEC 10 makes Settings, How to Play and
 * Statistics reachable at any time and never blocking state, so they change no
 * phase and belong to the chrome; `C5` at `BJ-15` grades that opening and
 * closing one leaves game state unchanged.
 */
const INTENTS: readonly IntentKind[] = [
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
];

/**
 * SPEC 10's legality table, one row per phase, quoted from the diagram.
 *
 * - `START ---- pick table, Start`
 * - `BETTING -- chips / Clear / Repeat / Max adjust the wager` and `-- Deal`
 * - `DEALING -- timed`, `PEEK -- hole card checked`, `REVEAL -- timed pause`,
 *   `DEALER_TURN -- timed draws`, `SETTLING -- per-hand outcomes`: five paced
 *   transitions, and the diagram gives none of them a player action.
 * - `INSURANCE -- insurance, or even money on a player natural` and
 *   `-- accepted or declined`
 * - `PLAYER_TURN -- Hit / Stand / Double / Split / Surrender`
 * - `ROUND_RESULT -- Next Hand`
 * - `BUST_OUT -- drop a table, or free reset to 1,000`
 */
const LEGALITY: Readonly<Record<PhaseKind, readonly IntentKind[]>> = {
  start: ['chooseTable', 'start'],
  betting: ['tapChip', 'clear', 'repeat', 'max', 'deal'],
  dealing: [],
  peek: [],
  insurance: ['takeInsurance', 'declineInsurance'],
  playerTurn: ['hit', 'stand', 'double', 'split', 'surrender'],
  reveal: [],
  dealerTurn: [],
  settling: [],
  roundResult: ['nextHand'],
  bustOut: ['dropTable', 'resetBankroll'],
};

/** SPEC 10's screens that wait for a player, so no timer may move them. */
const UNTIMED: readonly PhaseKind[] = [
  'start',
  'betting',
  'insurance',
  'playerTurn',
  'roundResult',
  'bustOut',
];

/**
 * The size of the sweep, derived.
 *
 * 11 phases x 17 intents = 187 cells. SPEC 10 makes 2 legal at `start`, 5 at
 * `betting`, 2 at `insurance`, 5 at `playerTurn`, 1 at `roundResult` and 2 at
 * `bustOut`, and none at any of the five timed phases:
 * 2 + 5 + 2 + 5 + 1 + 2 = 17 legal, so 187 - 17 = 170 illegal.
 */
const CELLS = PHASES.length * INTENTS.length;
const LEGAL_CELLS = 17;
const ILLEGAL_CELLS = CELLS - LEGAL_CELLS;

// ---------------------------------------------------------------------------
// SPEC 4.11, SPEC 5, SPEC 6 and QUALITY-BAR section 7, written out
// ---------------------------------------------------------------------------

/** SPEC 4.11: the starting bankroll. */
const SPEC_STARTING_CHIPS = 1000;

/** SPEC 6: the two tables this file seats a player at. */
const SPEC_BRONZE = { minimum: 10, maximum: 100 } as const;
const SPEC_SILVER = { minimum: 50, maximum: 500, unlocksAt: 2500 } as const;

/** SPEC 5's seven reference timings, in seconds, and the Fast multiplier. */
const SPEC_TIMINGS = {
  dealInterval: 0.22,
  cardTravel: 0.28,
  holeCardFlip: 0.3,
  handRecentre: 0.18,
  revealPause: 0.45,
  dealerDrawInterval: 0.65,
  settlePause: 0.55,
} as const;
const SPEC_FAST_MULTIPLIER = 0.6;

/** QUALITY-BAR section 7: clamp every delta to 0.25 s, drop a gap past 5 s. */
const QB_CLAMP = 0.25;
const QB_RESUME_GAP = 5;

/** The chip one tap puts on the board, and the wager every round here carries. */
const ROUND_CHIP: ChipDenomination = 50;
const ROUND_WAGER = 50;

/** Up cards for SPEC 10's three branches, and the ranks that take each. */
const ACE_UP: Rank = 'A';
const TEN_UP: Rank = '10';
const PLAIN_UP: Rank = '7';

/** Ranks by branch. SPEC 4.2: four ten-value ranks, one Ace, eight others. */
const PEEK_RANKS = 4;
const INSURANCE_RANKS = 1;
const PLAIN_RANKS = RANKS.length - PEEK_RANKS - INSURANCE_RANKS;

/** A margin far larger than any accumulated floating-point error. */
const EPSILON = 0.001;

// ---------------------------------------------------------------------------
// Driving the machine
// ---------------------------------------------------------------------------

/**
 * Every loop below is bounded, for the reason `wallet.test.ts` gives.
 *
 * A transition that stopped firing would turn "advance until the phase
 * changes" into a loop no per-test timeout can interrupt, because it is
 * synchronous. Counting the turns makes a stall a loud failure, which is a
 * detection rather than a hang.
 */
const LOOP_LIMIT = 2000;

function bounded(label: string): () => void {
  let turns = 0;
  return () => {
    turns += 1;
    if (turns > LOOP_LIMIT) {
      throw new RangeError(`${label} did not finish inside ${String(LOOP_LIMIT)} turns`);
    }
  };
}

/** Read an accepted result, or fail loudly with the reason it was refused. */
function accept(result: IntentResult): IntentResult {
  if (!result.ok) {
    throw new Error(
      `expected ${result.kind} to be accepted; the ${result.layer} layer refused it as ${result.reason}`,
    );
  }
  return result;
}

/** Feed the accumulator in chunks no larger than QUALITY-BAR section 7's clamp. */
function feed(table: Table, seconds: number): void {
  const turn = bounded('feeding the accumulator');
  let left = seconds;
  while (left > 0) {
    turn();
    const chunk = Math.min(left, QB_CLAMP);
    table.update(chunk);
    left -= chunk;
  }
}

/** The phase and, inside the deal, how much of the queue is left. */
function signature(table: Table): string {
  const { phase } = table.readout();
  return phase.kind === 'dealing' ? `dealing:${String(phase.queue.length)}` : phase.kind;
}

/**
 * Drive the machine to a phase, taking only the actions SPEC 10 offers.
 *
 * At `betting` it taps a chip when the board is empty and deals when it is
 * not, at `insurance` it declines, at `playerTurn` it stands and at
 * `roundResult` it takes the next hand. Everything else is a paced transition
 * and gets a clamped frame. Nothing here reaches inside the machine.
 */
function driveTo(table: Table, target: PhaseKind): Table {
  const turn = bounded(`driving the machine to ${target}`);
  while (table.readout().phase.kind !== target) {
    turn();
    const state = table.readout();
    switch (state.phase.kind) {
      case 'start':
        accept(table.apply({ kind: 'start' }));
        break;
      case 'betting':
        accept(
          state.wallet.wager === 0
            ? table.apply({ kind: 'tapChip', chip: ROUND_CHIP })
            : table.apply({ kind: 'deal' }),
        );
        break;
      case 'insurance':
        accept(table.apply({ kind: 'declineInsurance' }));
        break;
      case 'playerTurn':
        accept(table.apply({ kind: 'stand' }));
        break;
      case 'roundResult':
        accept(table.apply({ kind: 'nextHand' }));
        break;
      default:
        table.update(QB_CLAMP);
    }
  }
  return table;
}

/**
 * Drive one round from `betting` to `roundResult`, recording the phases it
 * passed through and checking the accumulator at every screen that waits.
 */
function driveRound(table: Table): readonly PhaseKind[] {
  const seen: PhaseKind[] = [table.readout().phase.kind];
  const turn = bounded('driving one round to the round result');
  while (table.readout().phase.kind !== 'roundResult') {
    turn();
    const was = table.readout().phase.kind;
    switch (was) {
      case 'betting':
        accept(table.apply({ kind: 'deal' }));
        break;
      case 'insurance':
        accept(table.apply({ kind: 'declineInsurance' }));
        break;
      case 'playerTurn':
        accept(table.apply({ kind: 'stand' }));
        break;
      default:
        table.update(QB_CLAMP);
    }
    const state = table.readout();
    if (UNTIMED.includes(state.phase.kind)) {
      // The invariant `apply` relies on instead of carrying a reset it could
      // never exercise: a screen with no timer holds no accumulated time.
      expect(state.elapsed).toBe(0);
    }
    if (state.phase.kind !== was) {
      seen.push(state.phase.kind);
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Wallets: the real one, wrapped where `BJ-8` will supply a number
// ---------------------------------------------------------------------------

/** What a wrapper may stand in for. Everything else delegates untouched. */
interface WalletHooks {
  /** Counts the decisions the machine actually asked the wallet to make. */
  readonly onCall?: () => void;
  /** The net `settlement.ts`'s ladder will supply once `BJ-8` wires it. */
  readonly net?: (wager: number) => number;
  /** A SPEC 4.11 refusal at the commit, to prove the machine surfaces it. */
  readonly dealRefusal?: Refusal;
}

/**
 * The real wallet with one number substituted, never a stand-in for it.
 *
 * Two of `BJ-7`'s three untestable corners are numbers the wallet is handed
 * rather than behaviour of the machine: the net on a settled hand, which SPEC
 * 4.10's ladder decides and `BJ-8` wires, and the reason a commit was refused,
 * which SPEC 4.11 decides and `wallet.test.ts` already grades over 240 cases.
 * Supplying those here leaves the machine entirely alone, which is the point:
 * every assertion in this file is about `table.ts`.
 */
function wrapWallet(inner: Wallet, hooks: WalletHooks = {}): Wallet {
  function called(): void {
    hooks.onCall?.();
  }
  return Object.freeze({
    readout: (): WalletReadout => inner.readout(),
    tap: (chip: ChipDenomination, limits: TableLimits): BetResult => {
      called();
      return inner.tap(chip, limits);
    },
    clear: (): BetResult => {
      called();
      return inner.clear();
    },
    max: (limits: TableLimits): BetResult => {
      called();
      return inner.max(limits);
    },
    repeat: (limits: TableLimits): BetResult => {
      called();
      return inner.repeat(limits);
    },
    commitInitial: (limits: TableLimits): CommitResult => {
      called();
      if (hooks.dealRefusal !== undefined) {
        return Object.freeze({ ok: false, reason: hooks.dealRefusal });
      }
      return inner.commitInitial(limits);
    },
    commitDouble: (hand: number): CommitResult => {
      called();
      return inner.commitDouble(hand);
    },
    commitSplit: (hand: number): CommitResult => {
      called();
      return inner.commitSplit(hand);
    },
    settleHand: (hand: number, net: number): number => {
      called();
      const wager = inner.readout().hands[hand]?.wager ?? 0;
      return inner.settleHand(hand, hooks.net === undefined ? net : hooks.net(wager));
    },
    endRound: (): void => {
      called();
      inner.endRound();
    },
    reset: (): void => {
      called();
      inner.reset();
    },
  });
}

/** Build a wager out of chip taps, largest denomination first. SPEC 4.11. */
function place(wallet: Wallet, limits: TableLimits, target: number): void {
  const turn = bounded('building a wager out of chip taps');
  for (const chip of [500, 100, 50, 10] as const) {
    while (wallet.readout().wager + chip <= target) {
      turn();
      if (!wallet.tap(chip, limits).ok) {
        throw new Error(`a ${String(chip)} chip was refused while building ${String(target)}`);
      }
    }
  }
  if (wallet.readout().wager !== target) {
    throw new Error(`the four denominations cannot build ${String(target)}`);
  }
}

/** One round lost outright, through the wallet's own calls. SPEC 4.10 rung 5. */
function loseOneRound(wallet: Wallet, limits: TableLimits, wager: number): void {
  place(wallet, limits, wager);
  if (!wallet.commitInitial(limits).ok) {
    throw new Error(`the wallet refused a ${String(wager)} commit`);
  }
  wallet.settleHand(0, -wager);
  wallet.endRound();
}

/**
 * A real wallet with SPEC 6's Silver unlocked and 90 chips left.
 *
 * 1,000 less a lost 500 and a lost 410 is 90, both of which are on SPEC 4.11's
 * 10 grid, at or above Silver's 50 minimum and inside its 500 maximum, so the
 * wallet reaches 90 entirely through the four betting controls and a
 * settlement. 90 is the balance the bust-out below needs: one more losing
 * round at 50 leaves 40, which is under Silver's minimum and over Bronze's, so
 * SPEC 4.12 says the player is out at Silver and may still drop to Bronze.
 */
function silverWalletAt90(): Wallet {
  const wallet = createWallet({ bestBalance: SPEC_SILVER.unlocksAt });
  const silver = tableLimits('silver');
  loseOneRound(wallet, silver, 500);
  loseOneRound(wallet, silver, 410);
  if (wallet.readout().chips !== 90) {
    throw new Error(`expected 90 chips, found ${String(wallet.readout().chips)}`);
  }
  return wallet;
}

/**
 * A machine that has just been shown SPEC 4.12's bust-out, by playing a round
 * and losing it.
 *
 * The only thing the wrapper supplies is the net, which SPEC 4.10's ladder
 * will supply at `BJ-8`. Everything else is the machine: it deals, runs the
 * queue, stands, reveals, settles the hand through the wallet, closes the
 * round, and then takes SPEC 10's `chips < tableMin ? BUST_OUT : BETTING`
 * branch on `nextHand` by itself.
 */
function bustedOut(): Table {
  const wallet = wrapWallet(silverWalletAt90(), { net: (wager) => -wager });
  const table = driveTo(createTable({ wallet, table: 'silver' }), 'roundResult');
  if (table.readout().wallet.chips !== 40) {
    throw new Error(`expected 40 chips after the loss, found ${String(table.readout().wallet.chips)}`);
  }
  accept(table.apply({ kind: 'nextHand' }));
  return table;
}

/**
 * A machine sitting in one phase, built for that cell and nothing else.
 *
 * Ten of the eleven are `createTable()` driven forward by `apply` and
 * `update`. The eleventh is the same, with a wallet that lost the round.
 */
function machineAt(kind: PhaseKind): Table {
  switch (kind) {
    case 'start':
      return createTable();
    case 'betting': {
      // A completed round, so Repeat has something to repeat, and then a chip
      // on the board, so Deal has something to commit. Without both, two of
      // the five legal cells here would be refused by the wallet rather than
      // accepted, and the sweep would be measuring the wrong thing.
      const table = driveTo(createTable(), 'roundResult');
      accept(table.apply({ kind: 'nextHand' }));
      accept(table.apply({ kind: 'tapChip', chip: ROUND_CHIP }));
      return table;
    }
    case 'dealing': {
      const table = machineAt('betting');
      accept(table.apply({ kind: 'deal' }));
      return table;
    }
    case 'peek':
      return driveTo(createTable({ openingUpCard: TEN_UP }), 'peek');
    case 'insurance':
      return driveTo(createTable({ openingUpCard: ACE_UP }), 'insurance');
    case 'playerTurn':
      return driveTo(createTable({ openingUpCard: PLAIN_UP }), 'playerTurn');
    case 'reveal':
    case 'dealerTurn':
    case 'settling':
    case 'roundResult':
      return driveTo(createTable(), kind);
    case 'bustOut':
      return bustedOut();
  }
}

/** One intent of each kind, with the payloads SPEC 10 gives them. */
const SAMPLES: Readonly<Record<IntentKind, Intent>> = {
  chooseTable: { kind: 'chooseTable', table: 'bronze' },
  start: { kind: 'start' },
  tapChip: { kind: 'tapChip', chip: 10 },
  clear: { kind: 'clear' },
  repeat: { kind: 'repeat' },
  max: { kind: 'max' },
  deal: { kind: 'deal' },
  takeInsurance: { kind: 'takeInsurance' },
  declineInsurance: { kind: 'declineInsurance' },
  hit: { kind: 'hit' },
  stand: { kind: 'stand' },
  double: { kind: 'double' },
  split: { kind: 'split' },
  surrender: { kind: 'surrender' },
  nextHand: { kind: 'nextHand' },
  dropTable: { kind: 'dropTable', table: 'bronze' },
  resetBankroll: { kind: 'resetBankroll' },
};

/** One cell of the sweep: what was attempted, and what the machine did. */
interface Measured {
  readonly phase: PhaseKind;
  readonly kind: IntentKind;
  readonly result: IntentResult;
  readonly before: TableReadout;
  readonly after: TableReadout;
}

let measured: readonly Measured[] | null = null;

/**
 * Attempt every intent in every phase, once, on a machine of its own.
 *
 * Measured once and read by the sweep and by all three controls, so that every
 * one of them is judging the same run of the same machine.
 */
function sweep(): readonly Measured[] {
  if (measured === null) {
    const cells: Measured[] = [];
    for (const phase of PHASES) {
      for (const kind of INTENTS) {
        const table = machineAt(phase);
        if (table.readout().phase.kind !== phase) {
          throw new Error(`the machine built for ${phase} is in ${table.readout().phase.kind}`);
        }
        const before = table.readout();
        const result = table.apply(SAMPLES[kind]);
        cells.push({ phase, kind, result, before, after: table.readout() });
      }
    }
    measured = cells;
  }
  return measured;
}

// ---------------------------------------------------------------------------
// The machine is the machine, and the sweep drives it
// ---------------------------------------------------------------------------

describe('C2: the sweep drives a real machine into every phase', () => {
  it('opens at SPEC 10 start and exposes no way to be put anywhere else', () => {
    const table = createTable();
    expect(table.readout().phase.kind).toBe('start');
    // DESIGN section 3's frame, and nothing else. A phase setter would make
    // every assertion below a statement about a fixture instead of a machine.
    expect(Object.keys(table)).toEqual(['readout', 'apply', 'queue', 'drain', 'update']);
    expect(Object.isFrozen(table)).toBe(true);
  });

  it('reaches all eleven phases, ten of them by its own transitions', () => {
    const reached: PhaseKind[] = [];
    for (const kind of PHASES) {
      const table = machineAt(kind);
      expect(table.readout().phase.kind).toBe(kind);
      reached.push(kind);
    }
    expect(reached).toEqual([...PHASES]);
    expect(reached.length).toBe(11);
  });

  it('carries the eleven phases and seventeen intents SPEC 10 names, and no others', () => {
    expect([...PHASE_KINDS]).toEqual([...PHASES]);
    expect([...INTENT_KINDS]).toEqual([...INTENTS]);
    expect(PHASES.length).toBe(11);
    expect(INTENTS.length).toBe(17);
    expect(new Set(PHASES).size).toBe(PHASES.length);
    expect(new Set(INTENTS).size).toBe(INTENTS.length);
    // Every kind has a sample, or a cell of the sweep would be attempting the
    // wrong thing. `Record<IntentKind, Intent>` makes the compiler agree.
    expect(Object.keys(SAMPLES).sort()).toEqual([...INTENTS].sort());
  });

  /**
   * DESIGN section 1 puts the game's discriminated unions in `core/types.ts`,
   * and `settlement.ts` at `BJ-5` named that module as the one that would
   * absorb `Outcome` when the phase machine arrived. It is re-exported there
   * rather than declared a second time, so the union still has exactly one
   * home and `BJ-8` imports every union it needs from one place. The
   * assignment below is what proves the re-export resolves.
   */
  it('publishes the settlement outcome union from the type module, per DESIGN 1', () => {
    const outcomes: readonly Outcome[] = [
      'SURRENDER',
      'PUSH',
      'BLACKJACK',
      'DEALER_WIN',
      'PLAYER_WIN',
    ];
    expect(outcomes.length).toBe(5);
    expect(new Set(outcomes).size).toBe(5);
  });

  it('gives each intent exactly one phase, which is what SPEC 10 does', () => {
    let legal = 0;
    for (const kind of INTENTS) {
      const phases = PHASES.filter((phase) => LEGALITY[phase].includes(kind));
      expect(phases.length).toBe(1);
      legal += phases.length;
    }
    expect(legal).toBe(LEGAL_CELLS);
    expect(legal).toBe(17);
    expect(CELLS).toBe(187);
    expect(ILLEGAL_CELLS).toBe(170);
  });
});

// ---------------------------------------------------------------------------
// C2, both halves, over all 187 cells
// ---------------------------------------------------------------------------

describe('C2: accepted only where legal, and a rejection changes nothing', () => {
  it('accepts exactly the 17 legal cells and refuses the other 170 by phase', () => {
    const wrong: string[] = [];
    let accepted = 0;
    let refused = 0;

    for (const cell of sweep()) {
      const legal = LEGALITY[cell.phase].includes(cell.kind);
      const where = `${cell.phase}/${cell.kind}`;
      if (legal) {
        accepted += 1;
        if (!cell.result.ok) {
          wrong.push(`${where} was refused by ${cell.result.layer} as ${cell.result.reason}`);
        }
        continue;
      }
      refused += 1;
      if (cell.result.ok) {
        wrong.push(`${where} was accepted`);
        continue;
      }
      // C2's "surfaces a reason", and it is the phase that surfaced it: the
      // wallet is never consulted on a screen that does not offer the control.
      if (cell.result.layer !== 'phase') {
        wrong.push(`${where} was refused by ${cell.result.layer}, not by the phase`);
      }
      if (cell.result.reason !== 'wrong-phase') {
        wrong.push(`${where} named ${cell.result.reason} rather than wrong-phase`);
      }
      if (cell.result.kind !== cell.kind) {
        wrong.push(`${where} came back naming ${cell.result.kind}`);
      }
    }

    expect(wrong).toEqual([]);
    expect(accepted).toBe(LEGAL_CELLS);
    expect(accepted).toBe(17);
    expect(refused).toBe(ILLEGAL_CELLS);
    expect(refused).toBe(170);
    expect(accepted + refused).toBe(CELLS);
    expect(accepted + refused).toBe(187);
  });

  it('leaves every field of the readout untouched on all 170 rejections', () => {
    let compared = 0;
    for (const cell of sweep()) {
      if (LEGALITY[cell.phase].includes(cell.kind)) {
        continue;
      }
      compared += 1;
      // The whole readout, not a field of it: the phase and its payload, the
      // table, the hands, the dealer, the up card, the accumulator, the intent
      // queue, the round count and every one of the wallet's nine numbers.
      expect(cell.after, `${cell.phase}/${cell.kind} changed the machine`).toEqual(cell.before);
    }
    expect(compared).toBe(ILLEGAL_CELLS);
    expect(compared).toBe(170);
  });

  /**
   * An accepted result publishes the phase it left behind, and the chrome at
   * `BJ-15` reads it to know which screen to draw. Asserted on a transition
   * and on an action that stays put, because a result that always named one
   * phase would be right on half the cases by accident.
   */
  it('names the phase each accepted action left behind, moved or not', () => {
    const moved = accept(createTable().apply({ kind: 'start' }));
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.phase).toBe('betting');
      expect(moved.kind).toBe('start');
    }

    const stayed = accept(machineAt('betting').apply({ kind: 'tapChip', chip: 10 }));
    expect(stayed.ok).toBe(true);
    if (stayed.ok) {
      expect(stayed.phase).toBe('betting');
    }

    const dealt = accept(machineAt('betting').apply({ kind: 'deal' }));
    expect(dealt.ok).toBe(true);
    if (dealt.ok) {
      expect(dealt.phase).toBe('dealing');
    }

    const chose = accept(createTable().apply({ kind: 'chooseTable', table: 'bronze' }));
    expect(chose.ok).toBe(true);
    if (chose.ok) {
      expect(chose.phase).toBe('start');
    }
  });

  it('publishes a readout wide enough for that comparison to mean anything', () => {
    const state = machineAt('dealing').readout();
    expect(Object.keys(state)).toEqual([
      'phase',
      'table',
      'hands',
      'dealer',
      'upCard',
      'elapsed',
      'queued',
      'rounds',
      'wallet',
    ]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.phase)).toBe(true);
  });

  /**
   * The control for the comparison above, and the reason it is not idle.
   *
   * A readout that handed back the machine's own arrays would compare equal to
   * itself after any mutation whatsoever, and all 170 assertions would pass on
   * a machine that mutated on every rejection. So a snapshot is taken, the
   * machine is driven forward, and the snapshot has to still describe the
   * moment it was taken.
   */
  it('hands back a snapshot and not a view, or the 170 comparisons are idle', () => {
    const table = machineAt('dealing');
    const snapshot = table.readout();
    expect(snapshot.phase.kind).toBe('dealing');
    expect(snapshot.hands.length).toBe(1);
    expect(snapshot.rounds).toBe(1);

    table.queue({ kind: 'clear' });
    const queuedSnapshot = table.readout();
    expect(queuedSnapshot.queued.length).toBe(1);
    // Drained and gone: the queue the machine holds is empty from here on, so
    // the snapshot taken above is the only thing that still remembers it.
    expect(table.drain().rejected.length).toBe(1);
    expect(table.readout().queued).toEqual([]);

    driveTo(table, 'roundResult');
    expect(table.readout().hands).toEqual([]);
    expect(table.readout().rounds).toBe(2);

    // Every one of these is read off the object taken before the round ran.
    expect(snapshot.phase.kind).toBe('dealing');
    expect(snapshot.hands.length).toBe(1);
    expect(snapshot.hands[0]?.wager).toBe(ROUND_WAGER);
    expect(snapshot.rounds).toBe(1);
    expect(snapshot.elapsed).toBe(0);
    expect(queuedSnapshot.queued.length).toBe(1);
    expect(table.readout()).not.toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Three negative controls, each on its own derived set
// ---------------------------------------------------------------------------

describe('C2: the legality table disagrees with three misreadings of SPEC 10', () => {
  /** Where the machine and a table disagree, over the measured sweep. */
  function disagreements(table: Readonly<Record<PhaseKind, readonly IntentKind[]>>): Measured[] {
    return sweep().filter((cell) => cell.result.ok !== table[cell.phase].includes(cell.kind));
  }

  it('agrees with SPEC 10 on every one of the 187 cells', () => {
    expect(disagreements(LEGALITY)).toEqual([]);
    expect(sweep().length).toBe(CELLS);
    expect(sweep().length).toBe(187);
  });

  /**
   * A table with no phases in it. This is the whole of what `C2` forbids, and
   * it is what a machine that gated nothing would look like: every control
   * live on every screen, so a chip tap lands mid-deal and Next Hand fires
   * during the dealer's turn.
   */
  it('disagrees with a phase-blind table on exactly the 170 illegal cells', () => {
    const blind: Readonly<Record<PhaseKind, readonly IntentKind[]>> = {
      start: INTENTS,
      betting: INTENTS,
      dealing: INTENTS,
      peek: INTENTS,
      insurance: INTENTS,
      playerTurn: INTENTS,
      reveal: INTENTS,
      dealerTurn: INTENTS,
      settling: INTENTS,
      roundResult: INTENTS,
      bustOut: INTENTS,
    };
    const differ = disagreements(blind);
    expect(differ.length).toBe(ILLEGAL_CELLS);
    expect(differ.length).toBe(170);
    for (const cell of differ) {
      expect(cell.result.ok).toBe(false);
    }
  });

  /**
   * Insurance folded into the peek, which SPEC 10 and SPEC 4.4 both warn
   * against in as many words: the offer has to close **before the peek result
   * is applied**, because insurance can only win on the branch the peek
   * decides and would otherwise resolve after the one outcome it can win on.
   *
   * The two tables differ on four cells and nowhere else: the two insurance
   * intents stop being legal at `insurance` and start being legal at `peek`.
   * 2 + 2 = 4.
   */
  it('disagrees with insurance folded into the peek on exactly 4 cells', () => {
    const folded: Record<PhaseKind, readonly IntentKind[]> = {
      ...LEGALITY,
      peek: ['takeInsurance', 'declineInsurance'],
      insurance: [],
    };
    const differ = disagreements(folded);
    expect(differ.length).toBe(4);
    expect(differ.map((cell) => `${cell.phase}/${cell.kind}`).sort()).toEqual([
      'insurance/declineInsurance',
      'insurance/takeInsurance',
      'peek/declineInsurance',
      'peek/takeInsurance',
    ]);
  });

  /**
   * The betting controls left live after the deal, which is the defect
   * `wallet.ts` names: **nothing in the wallet is a phase gate**, and `tap`,
   * `clear`, `max` and `repeat` are all accepted mid-round by design there. If
   * this module does not close them, SPEC 4.11's "changing the wager after the
   * deal" is blocked nowhere at all.
   *
   * The four controls are already legal at `betting`, so the two tables differ
   * on the other ten phases only: 4 x 10 = 40.
   */
  it('disagrees with betting controls that never close on exactly 40 cells', () => {
    const controls: readonly IntentKind[] = ['tapChip', 'clear', 'max', 'repeat'];
    const alsoOpen = (phase: PhaseKind): readonly IntentKind[] => [
      ...new Set([...LEGALITY[phase], ...controls]),
    ];
    const open: Readonly<Record<PhaseKind, readonly IntentKind[]>> = {
      start: alsoOpen('start'),
      betting: alsoOpen('betting'),
      dealing: alsoOpen('dealing'),
      peek: alsoOpen('peek'),
      insurance: alsoOpen('insurance'),
      playerTurn: alsoOpen('playerTurn'),
      reveal: alsoOpen('reveal'),
      dealerTurn: alsoOpen('dealerTurn'),
      settling: alsoOpen('settling'),
      roundResult: alsoOpen('roundResult'),
      bustOut: alsoOpen('bustOut'),
    };
    const differ = disagreements(open);
    expect(differ.length).toBe(controls.length * (PHASES.length - 1));
    expect(differ.length).toBe(40);
    for (const cell of differ) {
      expect(controls).toContain(cell.kind);
      expect(cell.phase).not.toBe('betting');
    }
  });
});

// ---------------------------------------------------------------------------
// Two layers, in one order
// ---------------------------------------------------------------------------

describe('C2: the phase is asked before the wallet, and the reason says which', () => {
  it('does not consult the wallet at all when the phase has already refused', () => {
    let calls = 0;
    const wallet = wrapWallet(createWallet(), {
      onCall: () => {
        calls += 1;
      },
    });
    const table = createTable({ wallet });

    // A 500 chip at a Bronze table is over SPEC 4.11's ceiling of
    // min(100, 1000), so the wallet would refuse this tap on its own and would
    // name a different reason. On the start screen the phase refuses it first
    // and the wallet is never asked, which is the ordering in one assertion.
    const result = table.apply({ kind: 'tapChip', chip: 500 });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.layer).toBe('phase');
    expect(result.reason).toBe('wrong-phase');
    expect(calls).toBe(0);
  });

  it('lets the wallet refuse what the phase allowed, and names the wallet', () => {
    let calls = 0;
    const wallet = wrapWallet(createWallet(), {
      onCall: () => {
        calls += 1;
      },
    });
    const table = createTable({ wallet });
    accept(table.apply({ kind: 'start' }));
    const before = table.readout();

    const result = table.apply({ kind: 'tapChip', chip: 500 });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.layer).toBe('wallet');
    expect(result.reason).toBe('above-ceiling');
    expect(calls).toBe(1);
    // SPEC 4.11: rejected with a reason and changes nothing, never clamped.
    expect(table.readout()).toEqual(before);
    expect(table.readout().wallet.wager).toBe(0);
  });

  /**
   * SPEC 10: "Deal, only when tableMin <= wager <= min(tableMax, chips)".
   *
   * All three bounds are `dealRefusal`'s, inside the commit, and the machine
   * surfaces the reason that function gives rather than deriving one. Two of
   * the four reasons are reachable through the controls, and the other two are
   * not by construction: no tap, `Max` or `Repeat` can build a wager off the
   * 10 grid or above the ceiling, which is `B15`'s property and is asserted
   * over 648 taps and 240 repeats in `wallet.test.ts`.
   */
  it('composes Deal as phase, then wallet, and surfaces the wallet reason', () => {
    const empty = driveTo(createTable(), 'betting');
    const noWager = empty.apply({ kind: 'deal' });
    expect(noWager.ok).toBe(false);
    if (!noWager.ok) {
      expect(noWager.layer).toBe('wallet');
      expect(noWager.reason).toBe('no-wager');
    }

    const silver = createTable({
      wallet: createWallet({ bestBalance: SPEC_SILVER.unlocksAt }),
      table: 'silver',
    });
    accept(silver.apply({ kind: 'start' }));
    accept(silver.apply({ kind: 'tapChip', chip: 10 }));
    const short = silver.apply({ kind: 'deal' });
    expect(short.ok).toBe(false);
    if (!short.ok) {
      expect(short.layer).toBe('wallet');
      // SPEC 4.11: blocked below the minimum, never raised to it.
      expect(short.reason).toBe('below-minimum');
    }
    expect(silver.readout().wallet.wager).toBe(10);
    expect(silver.readout().phase.kind).toBe('betting');

    // And the same intent one screen later is refused by the phase instead,
    // without the wallet being asked what it thinks of the wager.
    const dealing = machineAt('dealing');
    const late = dealing.apply({ kind: 'deal' });
    expect(late.ok).toBe(false);
    if (!late.ok) {
      expect(late.layer).toBe('phase');
      expect(late.reason).toBe('wrong-phase');
    }
  });

  /**
   * The machine surfaces the reason it was handed, whichever it is.
   *
   * Driven through a wallet that refuses the commit with each of SPEC 4.11's
   * six reasons in turn, because a machine that re-derived a reason instead of
   * passing it through would look correct on the two a player can reach and
   * would invent an answer on the rest.
   */
  it('passes every SPEC 4.11 refusal through unchanged, and changes nothing', () => {
    const reasons: readonly Refusal[] = [
      'no-wager',
      'off-grid',
      'above-ceiling',
      'below-minimum',
      'nothing-to-repeat',
      'insufficient-chips',
    ];
    let checked = 0;
    for (const reason of reasons) {
      const table = createTable({ wallet: wrapWallet(createWallet(), { dealRefusal: reason }) });
      accept(table.apply({ kind: 'start' }));
      accept(table.apply({ kind: 'tapChip', chip: ROUND_CHIP }));
      const before = table.readout();
      const result = table.apply({ kind: 'deal' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.layer).toBe('wallet');
        expect(result.reason).toBe(reason);
      }
      expect(table.readout()).toEqual(before);
      expect(table.readout().phase.kind).toBe('betting');
      checked += 1;
    }
    expect(checked).toBe(reasons.length);
    expect(checked).toBe(6);
  });

  it('refuses a locked table at the start screen and an unoffered one at the bust-out', () => {
    const start = createTable();
    const locked = start.apply({ kind: 'chooseTable', table: 'gold' });
    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      // SPEC 6: Gold needs a best chip balance of 10,000, and a fresh wallet
      // has reached 1,000. `J1` grades the predicate itself at `BJ-6`.
      expect(locked.layer).toBe('wallet');
      expect(locked.reason).toBe('table-locked');
    }
    expect(start.readout().table).toBe('bronze');
    expect(accept(start.apply({ kind: 'chooseTable', table: 'bronze' })).ok).toBe(true);

    const out = machineAt('bustOut');
    const up = out.apply({ kind: 'dropTable', table: 'gold' });
    expect(up.ok).toBe(false);
    if (!up.ok) {
      // The layer as well as the reason: SPEC 4.12's list of lower tables is
      // the wallet's answer, so this is not the phase turning the drop down.
      expect(up.layer).toBe('wallet');
      expect(up.reason).toBe('table-locked');
    }
    expect(out.readout().table).toBe('silver');
  });

  /**
   * `TableOptions.table` seats the player and validates nothing, so the `start`
   * intent is the only thing between a locked table and play. SPEC 6 and item
   * `J1`: a table cannot be entered without meeting its threshold and
   * affording its minimum.
   */
  it('refuses Start at a table SPEC 6 has not unlocked, and changes nothing', () => {
    const table = createTable({ table: 'silver' });
    expect(table.readout().table).toBe('silver');
    const before = table.readout();

    const result = table.apply({ kind: 'start' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('start');
      expect(result.layer).toBe('wallet');
      expect(result.reason).toBe('table-locked');
    }
    // Still on the start screen, and nothing at all has moved.
    expect(table.readout().phase.kind).toBe('start');
    expect(table.readout()).toEqual(before);
  });

  it('accepts Start at the same table once the high-water mark has unlocked it', () => {
    const table = createTable({
      table: 'silver',
      wallet: createWallet({ bestBalance: SPEC_SILVER.unlocksAt }),
    });
    // SPEC 6 keys the unlock to the best chip balance ever reached, and SPEC 13
    // persists it, so the only difference from the case above is the mark.
    const result = accept(table.apply({ kind: 'start' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.phase).toBe('betting');
    }
    expect(table.readout().phase.kind).toBe('betting');
    expect(table.readout().table).toBe('silver');
  });

  it('throws on an intent kind SPEC 10 does not offer, rather than refusing it', () => {
    const table = createTable();
    const overlay = { kind: 'openSettings' } as unknown as Intent;
    expect(() => table.apply(overlay)).toThrow(RangeError);
    expect(table.readout().phase.kind).toBe('start');
  });
});

// ---------------------------------------------------------------------------
// SPEC 4.12: the two ways off the bust-out screen
// ---------------------------------------------------------------------------

describe('C2: SPEC 10 enters the bust-out only when SPEC 4.12 says the player is out', () => {
  it('takes the bust-out arm of Next Hand after a round the player lost', () => {
    const table = bustedOut();
    expect(table.readout().phase.kind).toBe('bustOut');
    expect(table.readout().wallet.chips).toBe(40);
    expect(table.readout().table).toBe('silver');
  });

  it('takes the betting arm when the balance still covers the minimum', () => {
    const table = driveTo(createTable(), 'roundResult');
    expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS);
    accept(table.apply({ kind: 'nextHand' }));
    expect(table.readout().phase.kind).toBe('betting');
  });

  it('drops to a lower table the balance can still afford, per SPEC 4.12', () => {
    const table = machineAt('bustOut');
    accept(table.apply({ kind: 'dropTable', table: 'bronze' }));
    expect(table.readout().table).toBe('bronze');
    expect(table.readout().phase.kind).toBe('betting');
    expect(table.readout().wallet.chips).toBe(40);
  });

  it('takes the free reset back to 1000 at the lowest table, per SPEC 4.12', () => {
    const table = machineAt('bustOut');
    accept(table.apply({ kind: 'resetBankroll' }));
    expect(table.readout().table).toBe('bronze');
    expect(table.readout().phase.kind).toBe('betting');
    expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS);
    // SPEC 6 keys the unlocks to the best chip balance ever reached, so Silver
    // survives the reset. `J2` grades that at `BJ-6`; what is asserted here is
    // that the machine did not reach past the wallet to undo it.
    expect(table.readout().wallet.bestBalance).toBe(SPEC_SILVER.unlocksAt);
  });
});

// ---------------------------------------------------------------------------
// SPEC 10 and SPEC 4.4: the branch at the end of the deal
// ---------------------------------------------------------------------------

describe('C2: the deal branches on the up card, offering before it peeks', () => {
  it('sends each of the thirteen ranks where SPEC 10 sends it', () => {
    const counts = { insurance: 0, peek: 0, playerTurn: 0 };
    for (const rank of RANKS) {
      const branch = branchAfterDealing(rank);
      counts[branch] += 1;
      if (rank === 'A') {
        expect(branch).toBe('insurance');
      } else if (['10', 'J', 'Q', 'K'].includes(rank)) {
        expect(branch).toBe('peek');
      } else {
        expect(branch).toBe('playerTurn');
      }
    }
    expect(counts.insurance).toBe(INSURANCE_RANKS);
    expect(counts.peek).toBe(PEEK_RANKS);
    expect(counts.playerTurn).toBe(PLAIN_RANKS);
    expect(counts.insurance + counts.peek + counts.playerTurn).toBe(RANKS.length);
    expect(RANKS.length).toBe(13);
    // No up card is the "otherwise" arm, which is where every round in this
    // part goes until `B6` at `BJ-8` deals one.
    expect(branchAfterDealing(null)).toBe('playerTurn');
  });

  /**
   * The ordering control, and it is SPEC 4.4's requirement rather than a
   * preference: the offer must close **before the peek result is applied**,
   * so a branch that asked "does the dealer peek" first would send an Ace
   * straight to the peek and insurance could only ever be lost.
   *
   * The two readings differ on exactly one rank, because the Ace is the only
   * rank both predicates answer yes to.
   */
  it('disagrees with a branch that peeked before it offered, on exactly the Ace', () => {
    let disagreements = 0;
    for (const rank of RANKS) {
      const peekFirst = peeksOn(rank)
        ? 'peek'
        : offersInsurance(rank)
          ? 'insurance'
          : 'playerTurn';
      if (branchAfterDealing(rank) !== peekFirst) {
        disagreements += 1;
        expect(rank).toBe('A');
        expect(branchAfterDealing(rank)).toBe('insurance');
        expect(peekFirst).toBe('peek');
      }
    }
    expect(disagreements).toBe(INSURANCE_RANKS);
    expect(disagreements).toBe(1);
  });

  it('runs a whole round on every up card, through the phases SPEC 10 gives it', () => {
    const ace: readonly PhaseKind[] = [
      'betting',
      'dealing',
      'insurance',
      'peek',
      'playerTurn',
      'reveal',
      'dealerTurn',
      'settling',
      'roundResult',
    ];
    const ten: readonly PhaseKind[] = [
      'betting',
      'dealing',
      'peek',
      'playerTurn',
      'reveal',
      'dealerTurn',
      'settling',
      'roundResult',
    ];
    const plain: readonly PhaseKind[] = [
      'betting',
      'dealing',
      'playerTurn',
      'reveal',
      'dealerTurn',
      'settling',
      'roundResult',
    ];

    let rounds = 0;
    for (const rank of RANKS) {
      const table = createTable({ openingUpCard: rank });
      accept(table.apply({ kind: 'start' }));
      accept(table.apply({ kind: 'tapChip', chip: ROUND_CHIP }));
      const seen = driveRound(table);
      const expected = rank === 'A' ? ace : branchAfterDealing(rank) === 'peek' ? ten : plain;
      expect(seen, `up card ${rank}`).toEqual([...expected]);
      // The wager left the balance at the deal and came back at the settlement,
      // because no net is wired yet. SPEC 4.11's identity holds either way.
      const state = table.readout();
      expect(state.wallet.chips).toBe(SPEC_STARTING_CHIPS);
      expect(state.wallet.conserved).toBe(SPEC_STARTING_CHIPS);
      expect(state.rounds).toBe(1);
      rounds += 1;
    }
    expect(rounds).toBe(RANKS.length);
    expect(rounds).toBe(13);
  });

  it('closes SPEC 4.7 offer on both answers, and both hand to the peek', () => {
    let answered = 0;
    for (const answer of ['takeInsurance', 'declineInsurance'] as const) {
      const table = machineAt('insurance');
      const { phase } = table.readout();
      expect(phase.kind).toBe('insurance');
      if (phase.kind === 'insurance') {
        // SPEC 4.7: the stake is half the initial wager, which at the peek is
        // the only wager there is. Taking it out of the balance and paying it
        // 2:1 is item `B11` at `BJ-8`.
        expect(phase.offer.stake).toBe(ROUND_WAGER / 2);
        expect(phase.offer.evenMoney).toBe(false);
      }
      accept(table.apply({ kind: answer }));
      expect(table.readout().phase.kind).toBe('peek');
      answered += 1;
    }
    expect(answered).toBe(2);
  });

  /**
   * The stake is pinned to `wager / 2` and not to a number.
   *
   * Every other round in this file wagers 50, so a stake hardcoded at 25 would
   * satisfy the assertion above forever. Three wagers, two of them at a Silver
   * table so the 500 is inside SPEC 6's maximum, and all three exact integers
   * because SPEC 4.11 keeps every reachable wager on the 10 grid.
   */
  it('stakes half of whatever the initial wager was, over three of them', () => {
    const wagers: readonly { chip: ChipDenomination; table: 'bronze' | 'silver' }[] = [
      { chip: 10, table: 'bronze' },
      { chip: 50, table: 'bronze' },
      { chip: 500, table: 'silver' },
    ];
    let checked = 0;
    for (const { chip, table: seat } of wagers) {
      const table = createTable({
        openingUpCard: ACE_UP,
        table: seat,
        wallet: createWallet({ bestBalance: SPEC_SILVER.unlocksAt }),
      });
      accept(table.apply({ kind: 'start' }));
      accept(table.apply({ kind: 'tapChip', chip }));
      driveTo(table, 'insurance');
      const { phase } = table.readout();
      expect(phase.kind).toBe('insurance');
      if (phase.kind === 'insurance') {
        expect(phase.offer.stake).toBe(chip / 2);
        expect(Number.isInteger(phase.offer.stake)).toBe(true);
      }
      checked += 1;
    }
    expect(checked).toBe(3);
    // Half of 10, 50 and 500: three different answers, so no constant fits.
    expect(new Set(wagers.map((entry) => entry.chip / 2)).size).toBe(3);
  });

  it('queues SPEC 4.3 four cards in the order that section gives', () => {
    const table = machineAt('dealing');
    const { phase } = table.readout();
    expect(phase.kind).toBe('dealing');
    if (phase.kind === 'dealing') {
      expect([...phase.queue]).toEqual(['playerCard', 'dealerUp', 'playerCard', 'dealerHole']);
      expect(phase.queue.length).toBe(4);
    }
    expect([...OPENING_DEAL]).toEqual(['playerCard', 'dealerUp', 'playerCard', 'dealerHole']);
  });
});

// ---------------------------------------------------------------------------
// DESIGN section 3: the per-frame drain
// ---------------------------------------------------------------------------

describe('C2: one accepted intent per frame, and the queue behind it', () => {
  it('applies one accepted intent and leaves the rest queued', () => {
    const table = machineAt('betting');
    expect(table.readout().wallet.wager).toBe(ROUND_WAGER);
    table.queue({ kind: 'tapChip', chip: 10 });
    table.queue({ kind: 'tapChip', chip: 10 });
    table.queue({ kind: 'tapChip', chip: 10 });
    expect(table.readout().queued.length).toBe(3);

    const report = table.drain();
    expect(report.applied?.ok).toBe(true);
    expect(report.applied?.kind).toBe('tapChip');
    expect(report.rejected).toEqual([]);
    expect(report.discarded).toBe(0);
    expect(report.remaining).toBe(2);
    // One tap, not three. The other two are still there for the next frame.
    expect(table.readout().wallet.wager).toBe(ROUND_WAGER + 10);
    expect(table.readout().queued.length).toBe(2);

    table.drain();
    expect(table.readout().wallet.wager).toBe(ROUND_WAGER + 20);
  });

  /**
   * The trap DESIGN section 3 names: "A queued click aimed at a screen that
   * has gone must never be judged against the screen that replaced it."
   *
   * `Max` is legal at `betting` and would put the whole ceiling on the board.
   * Queued behind Next Hand, it was aimed at the round result, so the wager
   * has to stay at nothing however many frames go by.
   */
  it('discards a queued intent behind a phase change instead of judging it later', () => {
    const table = driveTo(createTable(), 'roundResult');
    table.queue({ kind: 'nextHand' });
    table.queue({ kind: 'max' });

    const report = table.drain();
    expect(report.applied?.kind).toBe('nextHand');
    expect(report.rejected).toEqual([]);
    expect(report.discarded).toBe(1);
    expect(report.remaining).toBe(0);
    expect(table.readout().phase.kind).toBe('betting');
    expect(table.readout().queued).toEqual([]);
    expect(table.readout().wallet.wager).toBe(0);

    // And it is gone rather than merely deferred: another frame does not find
    // it, and the board is still empty.
    const second = table.drain();
    expect(second.applied).toBeNull();
    expect(table.readout().wallet.wager).toBe(0);
  });

  it('keeps the queue when the accepted intent stayed on the same screen', () => {
    const table = machineAt('betting');
    table.queue({ kind: 'clear' });
    table.queue({ kind: 'max' });
    const report = table.drain();
    expect(report.applied?.kind).toBe('clear');
    expect(report.discarded).toBe(0);
    expect(report.remaining).toBe(1);
    expect(table.readout().wallet.wager).toBe(0);
    table.drain();
    // SPEC 4.11's Max at a Bronze table on the full bankroll.
    expect(table.readout().wallet.wager).toBe(SPEC_BRONZE.maximum);
  });

  it('does not let a dead control consume the frame a live one should have', () => {
    const table = machineAt('betting');
    table.queue({ kind: 'hit' });
    table.queue({ kind: 'stand' });
    table.queue({ kind: 'tapChip', chip: 10 });

    const report = table.drain();
    expect(report.rejected.map((result) => result.kind)).toEqual(['hit', 'stand']);
    for (const rejected of report.rejected) {
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) {
        expect(rejected.layer).toBe('phase');
      }
    }
    expect(report.applied?.kind).toBe('tapChip');
    expect(report.remaining).toBe(0);
    expect(table.readout().wallet.wager).toBe(ROUND_WAGER + 10);
  });

  it('reports nothing at all on an empty queue, and changes nothing', () => {
    const table = machineAt('betting');
    const before = table.readout();
    const report = table.drain();
    expect(report.applied).toBeNull();
    expect(report.rejected).toEqual([]);
    expect(report.discarded).toBe(0);
    expect(report.remaining).toBe(0);
    expect(table.readout()).toEqual(before);
  });

  it('queues rather than applies, so the frame decides when an intent acts', () => {
    const table = machineAt('betting');
    const before = table.readout();
    table.queue({ kind: 'max' });
    const state = table.readout();
    expect(state.queued.length).toBe(1);
    expect(state.wallet.wager).toBe(before.wallet.wager);
    expect(state.phase.kind).toBe('betting');
  });
});

// ---------------------------------------------------------------------------
// DESIGN section 3 and QUALITY-BAR section 7: the timers
// ---------------------------------------------------------------------------

describe('C2: every timer is a float accumulator, clamped and carried', () => {
  it('carries SPEC 5 timings, the Fast multiplier and the derived peek pause', () => {
    expect(TIMINGS.dealInterval).toBe(SPEC_TIMINGS.dealInterval);
    expect(TIMINGS.cardTravel).toBe(SPEC_TIMINGS.cardTravel);
    expect(TIMINGS.holeCardFlip).toBe(SPEC_TIMINGS.holeCardFlip);
    expect(TIMINGS.handRecentre).toBe(SPEC_TIMINGS.handRecentre);
    expect(TIMINGS.revealPause).toBe(SPEC_TIMINGS.revealPause);
    expect(TIMINGS.dealerDrawInterval).toBe(SPEC_TIMINGS.dealerDrawInterval);
    expect(TIMINGS.settlePause).toBe(SPEC_TIMINGS.settlePause);
    expect(Object.keys(TIMINGS)).toEqual(Object.keys(SPEC_TIMINGS));
    expect(Object.isFrozen(TIMINGS)).toBe(true);
    expect(FAST_SPEED_MULTIPLIER).toBe(SPEC_FAST_MULTIPLIER);
    // SPEC 5 lists no peek constant, so the peek is paced by the hole card's
    // own flip rather than by a number invented for it. One constant, no
    // branch, which is the half of SPEC 4.4's no-tell clause a headless module
    // can hold; `E6` at `BJ-14` grades the motion half on both branches.
    expect(PEEK_PAUSE).toBe(SPEC_TIMINGS.holeCardFlip);

    // Every duration is positive, which is what makes the drain loop finite:
    // each turn subtracts one from the accumulator, so it strictly decreases.
    for (const [name, value] of Object.entries(TIMINGS)) {
      expect(value, name).toBeGreaterThan(0);
    }
  });

  it('clamps a delta exactly as QUALITY-BAR section 7 says to', () => {
    expect(MAX_STEP).toBe(QB_CLAMP);
    expect(RESUME_GAP).toBe(QB_RESUME_GAP);
    expect(clampDelta(0.1)).toBe(0.1);
    expect(clampDelta(QB_CLAMP)).toBe(QB_CLAMP);
    expect(clampDelta(1)).toBe(QB_CLAMP);
    expect(clampDelta(QB_RESUME_GAP)).toBe(QB_CLAMP);
    // A gap longer than 5 s is a resume: dropped rather than consumed.
    expect(clampDelta(QB_RESUME_GAP + EPSILON)).toBe(0);
    expect(clampDelta(3600)).toBe(0);
    // Negative and not finite are treated as zero.
    expect(clampDelta(0)).toBe(0);
    expect(clampDelta(-1)).toBe(0);
    expect(clampDelta(Number.NaN)).toBe(0);
    expect(clampDelta(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampDelta(Number.NEGATIVE_INFINITY)).toBe(0);
    // A positive zero, because the accumulator is compared with the runner's
    // identity assertion and `Object.is(-0, 0)` is false.
    expect(Object.is(clampDelta(-0), 0)).toBe(true);
    expect(Object.is(clampDelta(-5), 0)).toBe(true);
  });

  it('accumulates frames too small to advance a phase on their own', () => {
    const table = machineAt('dealing');
    expect(signature(table)).toBe('dealing:4');
    expect(table.readout().elapsed).toBe(0);

    table.update(0.1);
    expect(signature(table)).toBe('dealing:4');
    expect(table.readout().elapsed).toBeCloseTo(0.1, 10);

    table.update(0.1);
    expect(signature(table)).toBe('dealing:4');
    expect(table.readout().elapsed).toBeCloseTo(0.2, 10);

    // 0.2 + 0.05 clears SPEC 5's 0.22 deal interval, and the remainder stays
    // on the accumulator rather than being thrown away.
    table.update(0.05);
    expect(signature(table)).toBe('dealing:3');
    expect(table.readout().elapsed).toBeCloseTo(0.25 - SPEC_TIMINGS.dealInterval, 10);
  });

  it('fires no timed transition before its SPEC 5 constant has been paid', () => {
    const timed: readonly { kind: PhaseKind; duration: number }[] = [
      { kind: 'dealing', duration: SPEC_TIMINGS.dealInterval },
      { kind: 'peek', duration: SPEC_TIMINGS.holeCardFlip },
      { kind: 'reveal', duration: SPEC_TIMINGS.revealPause },
      { kind: 'dealerTurn', duration: SPEC_TIMINGS.dealerDrawInterval },
      { kind: 'settling', duration: SPEC_TIMINGS.settlePause },
    ];
    let checked = 0;
    for (const { kind, duration } of timed) {
      const table = machineAt(kind);
      const before = signature(table);
      const already = table.readout().elapsed;
      expect(already).toBeLessThan(duration);

      feed(table, duration - already - EPSILON);
      expect(signature(table), `${kind} moved early`).toBe(before);

      feed(table, EPSILON * 2);
      expect(signature(table), `${kind} did not move on time`).not.toBe(before);
      checked += 1;
    }
    expect(checked).toBe(timed.length);
    expect(checked).toBe(5);
    // The five timed phases of SPEC 10, and the six that wait for a player.
    expect(timed.length + UNTIMED.length).toBe(PHASES.length);
  });

  it('advances a one-second frame by one clamped step, not by four', () => {
    const table = machineAt('dealing');
    expect(signature(table)).toBe('dealing:4');
    table.update(1);
    // Unclamped, a full second would have paid SPEC 5's 0.22 interval four
    // times over and emptied the queue in a single frame.
    expect(signature(table)).toBe('dealing:3');
    expect(table.readout().elapsed).toBeCloseTo(QB_CLAMP - SPEC_TIMINGS.dealInterval, 10);
  });

  /**
   * QUALITY-BAR section 7, clause three, in the words it uses: a gap longer
   * than 5 s is a resume and **the accumulator** is dropped rather than
   * consumed. Driven at a non-zero accumulator, because at zero "drop the
   * delta" and "drop the accumulator" answer identically and the weaker
   * reading passes.
   */
  it('empties the accumulator on a resume rather than only dropping the delta', () => {
    const table = machineAt('dealing');
    table.update(0.21);
    expect(table.readout().elapsed).toBeCloseTo(0.21, 10);
    expect(signature(table)).toBe('dealing:4');

    table.update(QB_RESUME_GAP + 25);
    expect(table.readout().elapsed).toBe(0);
    // Nothing was consumed either: the resume did not pay for a card.
    expect(signature(table)).toBe('dealing:4');

    // 0.21 banked plus an ordinary 16 ms frame would have cleared SPEC 5's
    // 0.22 interval and landed a card on the first frame back.
    table.update(0.016);
    expect(signature(table)).toBe('dealing:4');
    expect(table.readout().elapsed).toBeCloseTo(0.016, 10);
  });

  it('changes nothing at all on a resume that arrives with nothing owed', () => {
    const table = machineAt('settling');
    // The accumulator this machine carries into `settling` is dropped, and
    // nothing else moves: no step, no phase, no hand, no chip.
    const owed = table.readout().elapsed;
    expect(owed).toBeGreaterThan(0);
    table.update(QB_RESUME_GAP + 1);
    expect(table.readout().elapsed).toBe(0);
    expect(table.readout().phase.kind).toBe('settling');
    expect(table.readout().wallet).toEqual(machineAt('settling').readout().wallet);
  });

  it('carries the remainder across a timed transition and drops it at an untimed one', () => {
    // reveal -> dealerTurn is timed to timed, so the overspill is still owed.
    const carried = machineAt('reveal');
    const start = carried.readout().elapsed;
    feed(carried, SPEC_TIMINGS.revealPause - start + 0.1);
    expect(carried.readout().phase.kind).toBe('dealerTurn');
    expect(carried.readout().elapsed).toBeCloseTo(0.1, 6);

    // peek -> playerTurn is timed to untimed, and a screen that waits for the
    // player has not started waiting yet, so the overspill is dropped.
    const dropped = machineAt('peek');
    const held = dropped.readout().elapsed;
    feed(dropped, SPEC_TIMINGS.holeCardFlip - held + 0.1);
    expect(dropped.readout().phase.kind).toBe('playerTurn');
    expect(dropped.readout().elapsed).toBe(0);
  });

  it('does nothing at all on a screen SPEC 10 gives no timer', () => {
    let checked = 0;
    for (const kind of UNTIMED) {
      const table = machineAt(kind);
      const before = table.readout();
      expect(before.elapsed).toBe(0);
      for (let frame = 0; frame < 40; frame += 1) {
        table.update(QB_CLAMP);
      }
      expect(table.readout(), `${kind} moved on its own`).toEqual(before);
      checked += 1;
    }
    expect(checked).toBe(UNTIMED.length);
    expect(checked).toBe(6);
  });

  /**
   * DESIGN section 3: no `setTimeout` drives game state and no frame counter
   * exists. Neither is a claim any number can see, so the source is scanned.
   */
  it('drives state from no clock, no timer and no frame counter', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../src/core/table.ts', import.meta.url)),
      'utf8',
    );
    // Comments are prose and are allowed to name what the module does not do,
    // the same strip `payout-integrality.test.ts` uses and for the same reason.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // The scan reads the module, and the strip did not eat the code with it.
    expect(code).toContain('export function createTable(');
    expect(code).toContain('export function clampDelta(');
    expect(code).toContain('while (step !== null && elapsed >= step.duration)');

    // Each pattern carries a sample it must match, which is the house control
    // `payout-integrality.test.ts` puts on its own scan: a pattern with a typo
    // in it, `setTimeOut` for `setTimeout`, finds nothing and reports clean
    // forever, and no assertion about an absence can see the difference.
    const banned: readonly { pattern: RegExp; sample: string }[] = [
      { pattern: /\bsetTimeout\b/, sample: '  setTimeout(tick, 220);' },
      { pattern: /\bsetInterval\b/, sample: '  const id = setInterval(tick, 16);' },
      { pattern: /\brequestAnimationFrame\b/, sample: '  requestAnimationFrame(frame);' },
      { pattern: /\bqueueMicrotask\b/, sample: '  queueMicrotask(() => advance());' },
      { pattern: /\bDate\b/, sample: '  const now = Date.now();' },
      { pattern: /\bperformance\b/, sample: '  const now = performance.now();' },
      { pattern: /\bMath\s*\.\s*random\b/, sample: '  const cut = Math.random();' },
      { pattern: /\bframeCount\b/, sample: '  frameCount += 1;' },
      { pattern: /\bframes\s*\+=/, sample: '  frames += 1;' },
    ];

    const missedItsSample = banned
      .filter((entry) => !entry.pattern.test(entry.sample))
      .map((entry) => String(entry.pattern));
    expect(missedItsSample, 'a pattern that matches nothing reports clean forever').toEqual([]);
    expect(banned.length).toBe(9);

    const found = banned.filter((entry) => entry.pattern.test(code)).map((entry) =>
      String(entry.pattern),
    );
    expect(found).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// No player action may reach a wallet throw, in any phase
// ---------------------------------------------------------------------------

describe('C2: no action in any phase can reach a wallet throw', () => {
  /**
   * `wallet.ts`'s handoff, made a test.
   *
   * A second initial commit, settling a hand twice, a round closed with a hand
   * still committed, a reset mid-round and a hand index nothing carries are
   * all `RangeError`s there, and its header says the phase machine is what has
   * to make them unreachable. So every intent is offered in a fixed rotation,
   * frame after frame, and the machine has to answer every one of them with a
   * value and hold SPEC 4.11's identity throughout.
   */
  it('survives every intent offered in rotation for 400 frames', () => {
    const table = createTable({ openingUpCard: ACE_UP });
    let frames = 0;
    for (let frame = 0; frame < 400; frame += 1) {
      table.queue(SAMPLES[INTENTS[frame % INTENTS.length] ?? 'clear']);
      table.drain();
      table.update(QB_CLAMP);
      const state = table.readout();
      expect(state.wallet.chips).toBeGreaterThanOrEqual(0);
      expect(state.wallet.conserved).toBe(
        state.wallet.chips +
          state.wallet.committed +
          state.wallet.insuranceStake -
          state.wallet.deferredStake,
      );
      // No net is wired, so no settled outcome can move the identity yet.
      expect(state.wallet.conserved).toBe(SPEC_STARTING_CHIPS);
      if (UNTIMED.includes(state.phase.kind)) {
        expect(state.elapsed).toBe(0);
      }
      frames += 1;
    }
    expect(frames).toBe(400);
    // The rotation really played, rather than stalling on a screen.
    expect(table.readout().rounds).toBeGreaterThan(0);
  });

  it('plays four rounds back to back through the same round boundary', () => {
    const table = driveTo(createTable(), 'betting');
    let played = 0;
    for (let round = 0; round < 4; round += 1) {
      accept(table.apply({ kind: 'tapChip', chip: ROUND_CHIP }));
      driveRound(table);
      expect(table.readout().phase.kind).toBe('roundResult');
      expect(table.readout().hands).toEqual([]);
      expect(table.readout().wallet.hands).toEqual([]);
      accept(table.apply({ kind: 'nextHand' }));
      played += 1;
    }
    expect(played).toBe(4);
    expect(table.readout().rounds).toBe(4);
    expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS);
    // SPEC 4.11: the controls empty at the deal, which is what leaves Repeat
    // something to do on the round after.
    expect(table.readout().wallet.previousWager).toBe(ROUND_WAGER);
    expect(accept(table.apply({ kind: 'repeat' })).ok).toBe(true);
    expect(table.readout().wallet.wager).toBe(ROUND_WAGER);
  });
});
