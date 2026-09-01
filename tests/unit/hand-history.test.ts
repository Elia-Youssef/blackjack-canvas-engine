/**
 * Item `J5`, severity Minor, 5 points.
 *
 *   "Hand history retains the last 50 completed rounds with every specified
 *    field, and survives a reload."
 *
 * SPEC 8, one paragraph, and every clause of it is driven below: the count of
 * 50, the eviction at 51, the field list, and the "cleared only by a full data
 * reset" that closes it.
 *
 * **"Survives a reload", read as a unit test can prove it.** Persisting
 * anything is `BJ-11`, which the brief for this part puts out of scope in as
 * many words, and item `I1`'s versioned `localStorage` document and item `I4`'s
 * fresh launch are where the browser half is graded. What is provable here, and
 * what a reload is made of, is that the document is a plain serialisable value:
 * `JSON.parse(JSON.stringify(history))` is deep-equal to the original and
 * re-serialises to the identical string, so nothing in an entry is a class, a
 * function, an `undefined` or a key order that a round trip loses. That is the
 * reading this file takes, it is stated here so `BJ-11` inherits it rather than
 * rediscovering it, and the wiring is disclosed to `I1` and `I4`.
 *
 * **The expectations are SPEC 8's sentence, transcribed.** `SPEC_8_FIELDS`
 * below writes the seven field groups out as text, maps each to the keys that
 * carry it, and the sweep requires the entry's key set to be **exactly** the
 * mapped set. A field quietly added fails as loudly as one quietly dropped,
 * which is what stops the entry drifting into SPEC 12's round result.
 *
 * **One test here is armour rather than evidence.** `BJ-11` built SPEC 13's
 * `localStorage` document, so the serialise round trip above can now be run as a
 * store round trip: the list is written through the real persistence write and
 * read back through the real loader. It is added because the sanitiser at
 * `BJ-11` reads every SPEC 8 field and a silent disagreement between the two
 * modules would be invisible to either one's own suite. **It closes no item.**
 * `J5`'s "survives a reload" is still read here as the serialisable-value claim
 * the paragraph above states, and whether the sheet should say more than that is
 * a question that remains the user's. `I1` and `I4` are unaffected.
 *
 * **What this file does not claim.** The eleven milestones and the two scopes
 * of counters are item `J6` in `tests/unit/milestones.test.ts`. The overlay
 * that reviews this list is chrome, at `BJ-15`. The action journal on
 * `RoundResult` is an extension `BJ-10` made to `table.ts` because SPEC 8's
 * "every action taken" cannot be recovered from a finished round; no acceptance
 * item is claimed for it, and it is exercised here only as the field it exists
 * to fill.
 */

import { describe, expect, it } from 'vitest';

import type { Rank } from '../../src/core/cards';
import { handValue } from '../../src/core/hand';
import type { History, HistoryEntry } from '../../src/core/history';
import { HISTORY_LIMIT, NO_HISTORY, clear, record } from '../../src/core/history';
import { houseRules } from '../../src/core/rules';
import type { CoachVerdict } from '../../src/core/strategy';
import { actionOf, compare, situationAt, strategyTable } from '../../src/core/strategy';
import type { Table, TableReadout } from '../../src/core/table';
import { PLAYER_ACTIONS, createTable } from '../../src/core/table';
import type { HandInPlay, PlayerAction } from '../../src/core/types';
import { createPersistence } from '../../src/storage/persistence';
import { createMemoryStore } from '../../src/storage/store';

import { acceptIntent as accept, bounded } from './support/drive';
import { scriptedShoe } from './support/stacked-shoe';

// ---------------------------------------------------------------------------
// SPEC 8, transcribed
// ---------------------------------------------------------------------------

/** SPEC 8: "The last **50** completed rounds." */
const SPEC_ROUNDS_KEPT = 50;

/**
 * SPEC 8's entry, as a map from the sentence to the keys that carry it.
 *
 * The seven groups are the seven the paragraph lists, in its order, written out
 * here rather than imported so this file agrees with SPEC 8 and not with
 * `history.ts`. A group maps to entry-level keys, to per-hand keys, or to both:
 * SPEC 4.10 settles per hand, so the outcome and its reason live on the hand,
 * and the wager and the chip delta live in both places because a double or a
 * split moves one and not the other.
 */
const SPEC_8_FIELDS: readonly {
  readonly group: string;
  readonly entry: readonly string[];
  readonly hand: readonly string[];
}[] = Object.freeze([
  Object.freeze({
    group: 'the player hands and their values',
    entry: Object.freeze(['hands']),
    hand: Object.freeze(['cards', 'value']),
  }),
  Object.freeze({
    group: 'the dealer hand and its value',
    entry: Object.freeze(['dealer', 'dealerValue']),
    hand: Object.freeze([]),
  }),
  Object.freeze({
    group: 'every action taken',
    entry: Object.freeze(['actions']),
    hand: Object.freeze([]),
  }),
  Object.freeze({
    group: 'the wager',
    entry: Object.freeze(['wager']),
    hand: Object.freeze(['wager']),
  }),
  Object.freeze({
    group: 'the outcome',
    entry: Object.freeze([]),
    hand: Object.freeze(['outcome', 'rung']),
  }),
  Object.freeze({
    group: 'the chip delta',
    entry: Object.freeze(['delta']),
    hand: Object.freeze(['delta']),
  }),
  Object.freeze({
    group: 'the coach verdict if the coach was on',
    entry: Object.freeze(['coach']),
    hand: Object.freeze([]),
  }),
]);

/** SPEC 4.11: the starting bankroll, and the wager these rounds carry. */
const SPEC_STARTING_CHIPS = 1000;
const ROUND_WAGER = 10;

/** SPEC 5: a frame long enough to pay for any one timed step. */
const TICK = 0.25;

/** Bounded, in the house pattern: a stall must fail loudly, not hang. */
const LOOP_LIMIT = 2000;

// ---------------------------------------------------------------------------
// Driving the machine
// ---------------------------------------------------------------------------

/**
 * What the driver does at SPEC 10's player turn, and what it did.
 *
 * The action is returned rather than inferred, so that the coach comparison
 * below is made against the move the policy actually played. A driver that
 * assumed Stand would put a verdict about a stand into a round that split.
 */
type Policy = (table: Table) => PlayerAction;

/** SPEC 4.5's Stand, on every hand. The plain policy. */
const stand: Policy = (table) => {
  accept(table, { kind: 'stand' });
  return 'stand';
};

/** SPEC 4.6's Split on the first hand, then Stand on both. */
const splitThenStand: Policy = (table) => {
  if (table.readout().hands.length === 1) {
    accept(table, { kind: 'split' });
    return 'split';
  }
  accept(table, { kind: 'stand' });
  return 'stand';
};

/** SPEC 4.5's Double Down. One card, and the hand is over. */
const double: Policy = (table) => {
  accept(table, { kind: 'double' });
  return 'double';
};

/** SPEC 4.8's late surrender. Half the wager back, and the hand is over. */
const surrender: Policy = (table) => {
  accept(table, { kind: 'surrender' });
  return 'surrender';
};

interface DriveOptions {
  /** What to do at SPEC 10's player turn. Stand by default. */
  readonly policy?: Policy;
  /** SPEC 7's review comparison at every decision. Off by default. */
  readonly observing?: boolean;
  /** SPEC 4.7's offer, when one is made. Declined by default. */
  readonly insurance?: 'take' | 'decline';
}

/** What one driven round produced, and the balance it was dealt against. */
interface PlayedRound {
  /** The readout at SPEC 10's `roundResult`, cards still on the felt. */
  readonly readout: TableReadout;
  /** The balance the instant before `deal` was accepted. SPEC 4.11. */
  readonly chipsBeforeDeal: number;
  /** Coach verdicts, one per decision, or `null` when the coach was off. */
  readonly verdicts: readonly CoachVerdict[] | null;
}

/**
 * Drive one round from wherever the machine is to SPEC 12's result.
 *
 * `bustOut` is a loud failure rather than a branch: a test that wants SPEC
 * 4.12's screen drives it deliberately, and a test that reaches it by accident
 * has stopped measuring what it thought it was.
 */
function playRound(table: Table, options: DriveOptions = {}): PlayedRound {
  const policy = options.policy ?? stand;
  const observing = options.observing ?? false;
  const offer = options.insurance ?? 'decline';
  const turn = bounded('driving one round to SPEC 12 result', LOOP_LIMIT);
  const verdicts: CoachVerdict[] = [];
  const chart = strategyTable(houseRules());
  let chipsBeforeDeal = table.readout().wallet.chips;

  for (;;) {
    const state = table.readout();
    if (state.phase.kind === 'roundResult') {
      return Object.freeze({
        readout: state,
        chipsBeforeDeal,
        verdicts: observing ? Object.freeze(verdicts) : null,
      });
    }
    turn();
    switch (state.phase.kind) {
      case 'start':
        accept(table, { kind: 'start' });
        break;
      case 'betting':
        if (state.wallet.wager === 0) {
          accept(table, { kind: 'tapChip', chip: ROUND_WAGER });
        } else {
          chipsBeforeDeal = state.wallet.chips;
          accept(table, { kind: 'deal' });
        }
        break;
      case 'insurance':
        accept(table, offer === 'take' ? { kind: 'takeInsurance' } : { kind: 'declineInsurance' });
        break;
      case 'playerTurn': {
        // SPEC 7's situation is read from the screen the player is looking at,
        // before the move, and compared against the move they made.
        const situation = observing ? situationAt(state) : null;
        // `actionOf` is `strategy.ts`'s own answer to which intents are a
        // decision basic strategy has an opinion about, so the two insurance
        // intents come back `null` here rather than being filtered by a second
        // list written in this file.
        const played = actionOf(policy(table));
        if (situation !== null && played !== null) {
          const verdict = compare(chart, situation, played);
          if (verdict !== null) {
            verdicts.push(verdict);
          }
        }
        break;
      }
      case 'bustOut':
        throw new Error('SPEC 4.12 bust-out reached; these rounds are wagered to avoid it');
      default:
        table.update(TICK);
    }
  }
}

/** SPEC 10's `Next Hand`, which is the only sweep of the felt. */
function nextHand(table: Table): void {
  accept(table, { kind: 'nextHand' });
}

/** A table dealing a written-down script, at SPEC 14's default house rules. */
function dealing(script: readonly Rank[]): Table {
  return createTable({ shoe: scriptedShoe(script) });
}

/** The one entry a recorded round produces, or a loud failure. */
function only(history: History): HistoryEntry {
  const entry = history[0];
  if (entry === undefined) {
    throw new Error('a recorded round produced no entry');
  }
  return entry;
}

/** One round of a written-down script, recorded, with nothing else in front. */
function entryOf(script: readonly Rank[], options: DriveOptions = {}): HistoryEntry {
  const round = playRound(dealing(script), options);
  return only(record(NO_HISTORY, round.readout, round.verdicts));
}

// ---------------------------------------------------------------------------
// The scripts these tests are built on
// ---------------------------------------------------------------------------

/** Player 17 against a dealer 16 that draws to 21. No offer, one decision. */
const PLAIN: readonly Rank[] = Object.freeze(['9', '7', '8', '9', '5']);

/** A dealer Ace over an 8: SPEC 4.7 offers, SPEC 4.4 finds no natural, 20 beats 19. */
const DEALER_ACE: readonly Rank[] = Object.freeze(['10', 'A', 'K', '8']);

/** A dealer Ace over a King: SPEC 4.7's offer against the natural it wins on. */
const DEALER_NATURAL: readonly Rank[] = Object.freeze(['9', 'A', '7', 'K']);

/** SPEC 4.7's even money: a player natural against a dealer Ace over a 6. */
const EVEN_MONEY: readonly Rank[] = Object.freeze(['A', 'A', 'K', '6']);

/** A pair of eights split into two winners against a busting dealer. */
const SPLIT: readonly Rank[] = Object.freeze(['8', '9', '8', '7', '2', '3', '10']);

/** Player 5,3 against a dealer soft 17; one hit brings a 9, and 17 pushes. */
const HIT_THEN_STAND: readonly Rank[] = Object.freeze(['5', '6', '3', 'A', '9']);

/** Player 20 against a dealer 17 that stands. Four cards, one decision. */
const PLAIN_TWENTY: readonly Rank[] = Object.freeze(['10', '9', 'K', '8']);

/** Player 11 doubled into 20, against a dealer that draws to a hard 17. */
const DOUBLED: readonly Rank[] = Object.freeze(['5', '6', '6', '10', '9', 'A']);

/** Player 16 against a dealer 9. SPEC 4.8 returns half and the round ends. */
const SURRENDERED: readonly Rank[] = Object.freeze(['10', '9', '6', '8']);

// ---------------------------------------------------------------------------
// Field completeness
// ---------------------------------------------------------------------------

/** The keys SPEC 8's transcription says an entry carries, sorted. */
function expectedEntryKeys(): readonly string[] {
  return SPEC_8_FIELDS.flatMap((field) => field.entry).sort();
}

/** The keys SPEC 8's transcription says a settled hand carries, sorted. */
function expectedHandKeys(): readonly string[] {
  return SPEC_8_FIELDS.flatMap((field) => field.hand).sort();
}

/**
 * Whether a value carries exactly these keys, each of them defined.
 *
 * A boolean rather than an assertion, so the negative controls below can drive
 * the same function over a damaged entry and require it to say no. A sweep that
 * can only pass proves nothing about the sweep.
 */
function hasExactly(value: object, keys: readonly string[]): boolean {
  const found = Object.keys(value).sort();
  if (found.length !== keys.length) {
    return false;
  }
  return found.every(
    (key, index) => key === keys[index] && (value as Record<string, unknown>)[key] !== undefined,
  );
}

describe('J5: SPEC 8 hand history', () => {
  describe("SPEC 8's field list, transcribed and swept", () => {
    it('names all seven of SPEC 8 field groups, each mapped to at least one key', () => {
      expect(SPEC_8_FIELDS).toHaveLength(7);
      for (const field of SPEC_8_FIELDS) {
        expect(field.entry.length + field.hand.length).toBeGreaterThan(0);
      }
    });

    it('gives an entry exactly the keys SPEC 8 field list maps to', () => {
      expect(hasExactly(entryOf(PLAIN), expectedEntryKeys())).toBe(true);
    });

    it('gives every settled hand exactly the per-hand keys SPEC 8 maps to', () => {
      const entry = entryOf(SPLIT, { policy: splitThenStand });
      expect(entry.hands).toHaveLength(2);
      for (const hand of entry.hands) {
        expect(hasExactly(hand, expectedHandKeys())).toBe(true);
      }
    });

    it('catches a dropped field and an added one, which is what makes it a sweep', () => {
      const entry = entryOf(PLAIN);
      const dropped: Record<string, unknown> = { ...entry };
      delete dropped['actions'];
      const added: Record<string, unknown> = { ...entry, table: 'bronze' };
      const blanked: Record<string, unknown> = { ...entry, delta: undefined };

      expect(hasExactly(dropped, expectedEntryKeys())).toBe(false);
      expect(hasExactly(added, expectedEntryKeys())).toBe(false);
      expect(hasExactly(blanked, expectedEntryKeys())).toBe(false);
    });

    it('sweeps every entry of a full history, not merely the newest', () => {
      const table = createTable({ seed: 7 });
      let history: History = NO_HISTORY;
      for (let round = 0; round < SPEC_ROUNDS_KEPT; round += 1) {
        const played = playRound(table);
        history = record(history, played.readout, played.verdicts);
        nextHand(table);
      }
      expect(history).toHaveLength(SPEC_ROUNDS_KEPT);
      for (const entry of history) {
        expect(hasExactly(entry, expectedEntryKeys())).toBe(true);
        for (const hand of entry.hands) {
          expect(hasExactly(hand, expectedHandKeys())).toBe(true);
        }
      }
    });
  });

  describe('the last 50 completed rounds', () => {
    /**
     * Rounds through the real seeded shoe, each one recorded on its own as well
     * as into the running list, so the ring can be compared entry by entry
     * against what it should be holding rather than against its own length. The
     * wager is the table minimum, so the drive cannot reach SPEC 4.12's
     * bust-out and end early.
     */
    function ringOf(rounds: number): {
      readonly history: History;
      readonly expected: readonly HistoryEntry[];
    } {
      const table = createTable({ seed: 11 });
      const expected: HistoryEntry[] = [];
      let history: History = NO_HISTORY;
      for (let round = 0; round < rounds; round += 1) {
        const played = playRound(table);
        history = record(history, played.readout, played.verdicts);
        expected.push(only(record(NO_HISTORY, played.readout, played.verdicts)));
        nextHand(table);
      }
      return { history, expected: Object.freeze(expected) };
    }

    it('holds every round while there are fewer than 50, newest first', () => {
      const { history, expected } = ringOf(SPEC_ROUNDS_KEPT - 1);
      expect(history).toHaveLength(SPEC_ROUNDS_KEPT - 1);
      expect(history[0]).toEqual(expected[expected.length - 1]);
      expect(history[history.length - 1]).toEqual(expected[0]);
    });

    it('holds exactly 50 at 50, still with the first round at the end', () => {
      const { history, expected } = ringOf(SPEC_ROUNDS_KEPT);
      expect(history).toHaveLength(SPEC_ROUNDS_KEPT);
      expect(history[0]).toEqual(expected[SPEC_ROUNDS_KEPT - 1]);
      expect(history[SPEC_ROUNDS_KEPT - 1]).toEqual(expected[0]);
    });

    it('evicts the oldest at 51 and stays at 50, which is the negative control', () => {
      const { history, expected } = ringOf(SPEC_ROUNDS_KEPT + 1);
      expect(history).toHaveLength(SPEC_ROUNDS_KEPT);
      // The first round is gone, and gone rather than merely displaced: a ring
      // that grew instead of evicting would still be holding it somewhere.
      expect(history).not.toContainEqual(expected[0]);
      expect(history[SPEC_ROUNDS_KEPT - 1]).toEqual(expected[1]);
      expect(history[0]).toEqual(expected[SPEC_ROUNDS_KEPT]);
    });

    it('keeps the newest 50 in order at 120 rounds, well past one shoe', () => {
      const played = 120;
      const { history, expected } = ringOf(played);
      expect(history).toHaveLength(SPEC_ROUNDS_KEPT);
      for (let index = 0; index < SPEC_ROUNDS_KEPT; index += 1) {
        expect(history[index]).toEqual(expected[played - 1 - index]);
      }
    });

    it('publishes the limit SPEC 8 states, and uses it', () => {
      expect(HISTORY_LIMIT).toBe(SPEC_ROUNDS_KEPT);
    });
  });

  describe('the values are the round that was actually played', () => {
    it('carries the player cards from the felt, with their values beside them', () => {
      const entry = entryOf(SPLIT, { policy: splitThenStand });
      expect(entry.hands.map((hand) => hand.cards.map((played) => played.rank))).toEqual([
        ['8', '2'],
        ['8', '3'],
      ]);
      for (const hand of entry.hands) {
        expect(hand.value).toBe(handValue(hand.cards).total);
      }
      expect(entry.hands.map((hand) => hand.value)).toEqual([10, 11]);
    });

    it('carries the dealer hand with the hole card, and its value', () => {
      const entry = entryOf(PLAIN);
      expect(entry.dealer.map((played) => played.rank)).toEqual(['7', '9', '5']);
      expect(entry.dealerValue).toBe(handValue(entry.dealer).total);
      expect(entry.dealerValue).toBe(21);
    });

    it('carries the dealer hole card even when the peek ended the round', () => {
      const entry = entryOf(DEALER_NATURAL, { insurance: 'take' });
      expect(entry.dealer.map((played) => played.rank)).toEqual(['A', 'K']);
      expect(entry.dealerValue).toBe(21);
    });

    it('carries SPEC 4.11 initial wager, and each hand own wager beside it', () => {
      const entry = entryOf(SPLIT, { policy: splitThenStand });
      expect(entry.wager).toBe(ROUND_WAGER);
      expect(entry.hands.map((hand) => hand.wager)).toEqual([ROUND_WAGER, ROUND_WAGER]);
    });

    it('carries SPEC 4.10 outcome and the rung that decided it, per hand', () => {
      expect(entryOf(PLAIN).hands.map((hand) => [hand.outcome, hand.rung])).toEqual([
        ['DEALER_WIN', 8],
      ]);
      expect(
        entryOf(SPLIT, { policy: splitThenStand }).hands.map((hand) => [hand.outcome, hand.rung]),
      ).toEqual([
        ['PLAYER_WIN', 6],
        ['PLAYER_WIN', 6],
      ]);
      expect(
        entryOf(DEALER_NATURAL, { insurance: 'take' }).hands.map((hand) => [
          hand.outcome,
          hand.rung,
        ]),
      ).toEqual([['DEALER_WIN', 4]]);
    });

    /**
     * SPEC 8's chip delta, against the only thing that can settle it: what the
     * balance actually did. Six rounds, four of which move SPEC 4.7's side
     * wager as well as the hands, because a delta that quietly dropped the
     * insurance leg would still agree with the hands on the other two.
     */
    it('carries a chip delta equal to what the balance moved, side wager included', () => {
      const cases: readonly {
        readonly script: readonly Rank[];
        readonly options: DriveOptions;
        readonly expected: number;
      }[] = Object.freeze([
        Object.freeze({ script: PLAIN, options: {}, expected: -ROUND_WAGER }),
        Object.freeze({ script: DEALER_ACE, options: {}, expected: ROUND_WAGER }),
        Object.freeze({
          script: SPLIT,
          options: { policy: splitThenStand },
          expected: 2 * ROUND_WAGER,
        }),
        // SPEC 4.7: the stake comes back and 2 x stake is paid on top, against
        // a hand that lost its whole wager. The round comes out level.
        Object.freeze({
          script: DEALER_NATURAL,
          options: { insurance: 'take' as const },
          expected: 0,
        }),
        // The stake is lost and the hand wins: `+wager - wager / 2`.
        Object.freeze({
          script: DEALER_ACE,
          options: { insurance: 'take' as const },
          expected: ROUND_WAGER / 2,
        }),
        // SPEC 4.7's even money nets `+wager` on both branches.
        Object.freeze({
          script: EVEN_MONEY,
          options: { insurance: 'take' as const },
          expected: ROUND_WAGER,
        }),
      ]);

      for (const { script, options, expected } of cases) {
        const played = playRound(dealing(script), options);
        const entry = only(record(NO_HISTORY, played.readout, played.verdicts));
        expect(entry.delta).toBe(played.readout.wallet.chips - played.chipsBeforeDeal);
        expect(entry.delta).toBe(expected);
      }
    });

    it('carries a per-hand delta that is SPEC 4.10 net on that hand wager', () => {
      const entry = entryOf(SPLIT, { policy: splitThenStand });
      expect(entry.hands.map((hand) => hand.delta)).toEqual([ROUND_WAGER, ROUND_WAGER]);
      expect(entry.delta).toBe(2 * ROUND_WAGER);
    });

    it('opens every one of these rounds from SPEC 4.11 starting bankroll', () => {
      expect(dealing(PLAIN).readout().wallet.chips).toBe(SPEC_STARTING_CHIPS);
    });
  });

  describe('every action taken', () => {
    function actionsOf(script: readonly Rank[], options: DriveOptions = {}): readonly PlayerAction[] {
      return entryOf(script, options).actions;
    }

    it('records the one decision a plain round contains', () => {
      expect(actionsOf(PLAIN)).toEqual(['stand']);
    });

    it('records SPEC 4.7 declined offer, which leaves no other trace at all', () => {
      // The whole reason the journal exists. A round that declined insurance
      // and a round that was never offered it are otherwise identical
      // afterwards, in the cards, in the wallet and in the settlement.
      expect(actionsOf(DEALER_ACE)).toEqual(['declineInsurance', 'stand']);
      expect(actionsOf(PLAIN)).not.toContain('declineInsurance');
    });

    it('records SPEC 4.7 taken offer', () => {
      expect(actionsOf(DEALER_NATURAL, { insurance: 'take' })).toEqual(['takeInsurance']);
    });

    it('records a split and both hands that followed it, in play order', () => {
      expect(actionsOf(SPLIT, { policy: splitThenStand })).toEqual(['split', 'stand', 'stand']);
    });

    it('records SPEC 4.5 Double Down, and separates the two wagers it leaves', () => {
      const entry = entryOf(DOUBLED, { policy: double });
      expect(entry.actions).toEqual(['double']);
      expect(entry.actions).toContain('double');

      // SPEC 8's "the wager" is SPEC 4.11's **initial** wager, which is the one
      // quantity the table minimum and maximum govern; the hand carries what a
      // double left on it. A round with no double cannot tell the two apart, so
      // this is the round that pins which is which.
      expect(entry.wager).toBe(ROUND_WAGER);
      expect(entry.hands).toHaveLength(1);
      expect(entry.hands[0]?.wager).toBe(2 * ROUND_WAGER);
      expect(entry.hands[0]?.cards.map((played) => played.rank)).toEqual(['5', '6', '9']);
      expect(entry.hands[0]?.value).toBe(20);
      expect(entry.hands[0]?.outcome).toBe('PLAYER_WIN');
      expect(entry.delta).toBe(2 * ROUND_WAGER);
    });

    it('records SPEC 4.8 Surrender, and the half wager it gave back', () => {
      const entry = entryOf(SURRENDERED, { policy: surrender });
      expect(entry.actions).toEqual(['surrender']);
      expect(entry.actions).toContain('surrender');
      expect(entry.wager).toBe(ROUND_WAGER);
      expect(entry.hands[0]?.wager).toBe(ROUND_WAGER);
      expect(entry.hands[0]?.outcome).toBe('SURRENDER');
      expect(entry.hands[0]?.rung).toBe(1);
      expect(entry.delta).toBe(-ROUND_WAGER / 2);
    });

    it('records every one of SPEC 4.5 seven actions across the rounds above', () => {
      // The whole of `PLAYER_ACTIONS`, gathered from real rounds, so an action
      // dropped from that list leaves a round whose history is missing a move
      // the player made. Written as a set comparison against the module's own
      // published list, so the two cannot drift apart silently.
      const seen = new Set<PlayerAction>([
        ...actionsOf(DEALER_ACE),
        ...actionsOf(DEALER_NATURAL, { insurance: 'take' }),
        ...actionsOf(SPLIT, { policy: splitThenStand }),
        ...actionsOf(DOUBLED, { policy: double }),
        ...actionsOf(SURRENDERED, { policy: surrender }),
        ...actionsOf(HIT_THEN_STAND, {
          policy: (() => {
            let hit = false;
            return (table): PlayerAction => {
              if (!hit) {
                hit = true;
                accept(table, { kind: 'hit' });
                return 'hit';
              }
              accept(table, { kind: 'stand' });
              return 'stand';
            };
          })(),
        }),
      ]);
      expect([...seen].sort()).toEqual([...PLAYER_ACTIONS].sort());
      expect(seen.size).toBe(7);
    });

    it('records a hit before the stand that ended the hand', () => {
      let hit = false;
      const policy: Policy = (table) => {
        if (!hit) {
          hit = true;
          accept(table, { kind: 'hit' });
          return 'hit';
        }
        accept(table, { kind: 'stand' });
        return 'stand';
      };
      expect(actionsOf(HIT_THEN_STAND, { policy })).toEqual(['hit', 'stand']);
    });

    it('records what was taken and not what was attempted, the negative control', () => {
      // SPEC 4.6 refuses a split on 9 and 8, and SPEC 4.11 changes nothing at
      // all when it does. An action the player attempted is not an action
      // taken, and a journal that recorded attempts would disagree with the
      // cards printed beside it.
      const policy: Policy = (table) => {
        expect(table.apply({ kind: 'split' }).ok).toBe(false);
        accept(table, { kind: 'stand' });
        return 'stand';
      };
      const entry = entryOf(PLAIN, { policy });
      expect(entry.actions).toEqual(['stand']);
      expect(entry.actions).not.toContain('split');
    });

    it('gives each round its own journal, and an entry is a value not a window', () => {
      // Two rounds whose action lists differ, because an entry that had kept
      // the machine's own array would agree with itself right up until the
      // round after it played something else. The felt is swept between them,
      // and the first entry has to be unmoved by both.
      const table = dealing([...PLAIN_TWENTY, ...HIT_THEN_STAND]);
      let hit = false;
      const hitOnce: Policy = (inner) => {
        if (!hit) {
          hit = true;
          accept(inner, { kind: 'hit' });
          return 'hit';
        }
        accept(inner, { kind: 'stand' });
        return 'stand';
      };

      const first = only(record(NO_HISTORY, playRound(table).readout, null));
      expect(first.actions).toEqual(['stand']);

      nextHand(table);
      expect(first.actions).toEqual(['stand']);

      const second = only(record(NO_HISTORY, playRound(table, { policy: hitOnce }).readout, null));
      expect(second.actions).toEqual(['hit', 'stand']);
      expect(first.actions).toEqual(['stand']);
    });
  });

  describe('the coach verdict if the coach was on', () => {
    it('is null when the coach was off, which is a different thing from none', () => {
      expect(entryOf(PLAIN).coach).toBeNull();
    });

    it('is one verdict per decision when the coach was on, in the order made', () => {
      const entry = entryOf(SPLIT, { policy: splitThenStand, observing: true });
      expect(entry.coach).not.toBeNull();
      expect(entry.coach?.map((verdict) => verdict.played)).toEqual(['split', 'stand', 'stand']);
    });

    it('is an empty list when the coach was on and the round offered no decision', () => {
      // SPEC 4.4: the peek found a dealer natural, so the player never acted.
      const entry = entryOf(DEALER_NATURAL, { insurance: 'take', observing: true });
      expect(entry.coach).toEqual([]);
      expect(entry.coach).not.toBeNull();
    });
  });

  describe('survives a reload', () => {
    /**
     * The unit-provable half of `J5`'s clause, per this file's header. The
     * `localStorage` document is item `I1` at `BJ-11` and the fresh launch is
     * item `I4`; what is asserted here is that nothing in the value stops
     * either from working.
     */
    function rehydrated(history: History): History {
      return JSON.parse(JSON.stringify(history)) as History;
    }

    it('round-trips through JSON deep-equal and byte-identical', () => {
      const table = createTable({ seed: 5 });
      let history: History = NO_HISTORY;
      for (let round = 0; round < 4; round += 1) {
        const played = playRound(table, { observing: round % 2 === 0 });
        history = record(history, played.readout, played.verdicts);
        nextHand(table);
      }
      const serialised = JSON.stringify(history);
      expect(rehydrated(history)).toEqual(history);
      expect(JSON.stringify(rehydrated(history))).toBe(serialised);
    });

    it('carries no undefined, no function and no class through the round trip', () => {
      const entry = entryOf(SPLIT, { policy: splitThenStand });
      const back = JSON.parse(JSON.stringify(entry)) as HistoryEntry;
      expect(back).toEqual(entry);
      expect(hasExactly(back, expectedEntryKeys())).toBe(true);
      for (const hand of back.hands) {
        expect(hasExactly(hand, expectedHandKeys())).toBe(true);
      }
    });

    it('keeps a null coach verdict null rather than losing the key', () => {
      const back = JSON.parse(JSON.stringify(entryOf(PLAIN))) as HistoryEntry;
      expect(Object.keys(back)).toContain('coach');
      expect(back.coach).toBeNull();
    });

    /**
     * Armour for the reload clause, and it closes nothing. See the header.
     *
     * The serialise round trip above proves the value survives `JSON`. This one
     * puts it through the store instead: `BJ-11`'s writer, `BJ-11`'s envelope
     * and `BJ-11`'s field-by-field loader, which reads every SPEC 8 field and
     * would drop an entry it disagreed with. Neither module's own suite can see
     * that disagreement, because each is testing itself.
     */
    it('survives a store round trip through the BJ-11 document, claiming nothing', () => {
      const table = createTable({ seed: 9 });
      let history: History = NO_HISTORY;
      for (let round = 0; round < 4; round += 1) {
        const played = playRound(table, { observing: round % 2 === 0 });
        history = record(history, played.readout, played.verdicts);
        nextHand(table);
      }
      expect(history).toHaveLength(4);

      const store = createMemoryStore();
      const written = createPersistence({ store, durable: true, failure: null });
      expect(written.update({ history }).ok).toBe(true);

      const reopened = createPersistence({ store, durable: true, failure: null });
      expect(reopened.readout().load.source).toBe('stored');
      expect(reopened.readout().load.repairs).toEqual([]);
      expect(reopened.document().history).toEqual(history);
      expect(reopened.restored().history).toEqual(history);
    });
  });

  describe('cleared only by a full data reset', () => {
    it('clears to empty, which is item I5 control at BJ-20', () => {
      const history = record(NO_HISTORY, playRound(dealing(PLAIN)).readout, null);
      expect(history).toHaveLength(1);
      expect(clear()).toHaveLength(0);
      expect(clear()).toEqual(NO_HISTORY);
      // The value handed to the caller is untouched by the clear, because the
      // module replaces rather than mutates.
      expect(history).toHaveLength(1);
    });

    it('survives SPEC 4.12 free bankroll reset, which is a different reset', () => {
      // The bankroll is drained to SPEC 10's bust-out through real rounds, at
      // the Bronze maximum so it gets there, and the free reset is taken. SPEC
      // 8 clears the history only on a full data reset, and SPEC 4.12 is not
      // one, so every entry recorded before the reset is still there after it
      // and recording carries straight on.
      const table = createTable({ seed: 2 });
      let history: History = NO_HISTORY;
      const turn = bounded('draining the bankroll to SPEC 10 bust-out', LOOP_LIMIT);
      while (table.readout().phase.kind !== 'bustOut') {
        turn();
        const state = table.readout();
        switch (state.phase.kind) {
          case 'start':
            accept(table, { kind: 'start' });
            break;
          case 'betting':
            if (state.wallet.wager === 0) {
              accept(table, { kind: 'max' });
            } else {
              accept(table, { kind: 'deal' });
            }
            break;
          case 'insurance':
            accept(table, { kind: 'declineInsurance' });
            break;
          case 'playerTurn':
            accept(table, { kind: 'stand' });
            break;
          case 'roundResult':
            history = record(history, table.readout(), null);
            nextHand(table);
            break;
          default:
            table.update(TICK);
        }
      }

      const before = history;
      expect(before.length).toBeGreaterThan(0);
      accept(table, { kind: 'resetBankroll' });
      expect(table.readout().wallet.chips).toBe(SPEC_STARTING_CHIPS);
      expect(history).toEqual(before);

      // Recording carries straight on from where it was: the new round goes on
      // the front and the rounds played before the reset shuffle down behind it.
      const after = playRound(table);
      history = record(history, after.readout, after.verdicts);
      expect(history).toHaveLength(Math.min(before.length + 1, HISTORY_LIMIT));
      expect(history.slice(1)).toEqual(before.slice(0, HISTORY_LIMIT - 1));
    });
  });

  describe('what it refuses', () => {
    it('refuses a readout that is not at SPEC 10 round result', () => {
      const table = dealing(PLAIN);
      accept(table, { kind: 'start' });
      expect(() => record(NO_HISTORY, table.readout(), null)).toThrow(/completed round/);
    });

    it('refuses a round result whose hole card is somehow still down', () => {
      const played = playRound(dealing(PLAIN));
      const concealed: TableReadout = Object.freeze({ ...played.readout, dealerConcealed: 1 });
      expect(() => record(NO_HISTORY, concealed, null)).toThrow(/hole card/);
    });

    it('refuses a result whose hand count disagrees with the felt', () => {
      const played = playRound(dealing(SPLIT), { policy: splitThenStand });
      const short: TableReadout = Object.freeze({
        ...played.readout,
        hands: Object.freeze(played.readout.hands.slice(0, 1)),
      });
      expect(() => record(NO_HISTORY, short, null)).toThrow(/settled hands/);
    });

    /**
     * The per-index guard under the count check, and it is a twin: the same
     * three lines sit in `statistics.ts`'s `observeRound`, where
     * `tests/unit/milestones.test.ts` pins the other copy with the same
     * construction. Neither is reachable through the machine, because
     * `readout()` builds `hands` with a `map` and a map is always dense, so a
     * hand-built readout carrying a hole is the only way in and both modules
     * refuse it rather than printing a hand that is not on the felt.
     */
    it('refuses a result whose hand count agrees but whose hands carry a hole', () => {
      const played = playRound(dealing(PLAIN));
      expect(played.readout.hands).toHaveLength(1);
      expect(played.readout.hands.every((hand) => hand !== undefined)).toBe(true);
      const holed: TableReadout = Object.freeze({
        ...played.readout,
        hands: Object.freeze(Array.from({ length: 1 })) as readonly HandInPlay[],
      });
      expect(() => record(NO_HISTORY, holed, null)).toThrow(/settled but is not on the felt/);
    });
  });
});
