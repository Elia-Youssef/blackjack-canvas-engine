/**
 * Item I2, severity Critical, 14 points.
 *
 *   "A corrupt, unparseable or out-of-range saved value does not prevent the
 *    game from starting. Defaults are used and overwritten on the next
 *    successful write."
 *
 * SPEC 18 and SPEC 13. The criterion has three clauses and each is driven
 * separately: nothing corrupt stops the game starting, the defaults that stand
 * in are the ones SPEC states, and the next successful write replaces the
 * document.
 *
 * **"The game starts" is asserted as the game starting, not as a load
 * returning.** `reachesBetting` builds the real phase machine on the wallet the
 * loader produced, the seat `launchTable` chose and the house rules the settings
 * carried, applies SPEC 10's `start` intent and requires the machine to be at
 * SPEC 10's betting screen. Every fixture in the matrix goes through it. A
 * loader that returned a document the game could not be built from would pass a
 * shallower assertion and fail this one, and there are two ways that could
 * happen and both are real: `createWallet` throws on a mark it does not accept,
 * and SPEC 10's `start` refuses a table SPEC 6 does not open.
 *
 * **Two controls, both aimed at the loader's reason for existing.** A
 * **trusting** loader, which hands the stored mark straight to `createWallet`,
 * must throw on every hostile mark where the real one does not: that is the
 * whole of what sanitising the mark buys, and without the control the assertion
 * "the real loader did not throw" is satisfied by a game with no persistence at
 * all. A **session-blind** loader, which skips `openSession` on the loaded
 * statistics, must award SPEC 9's row 11 on the first round or throw at the
 * round boundary where the real one does neither: that is `BJ-10`'s binding
 * handoff, and it is invisible to any test that only reads the loaded document.
 *
 * **The expectations are SPEC's, written out.** The defaults asserted below are
 * quoted from the sections that state them rather than imported from
 * `DEFAULT_SETTINGS`, wherever the value is a spec figure: a sweep that took its
 * defaults from the module under test would agree with a default that drifted.
 *
 * **What this file does not claim.** The versioned envelope and the migration
 * walk are item `I1` in `tests/unit/storage-migration.test.ts`. The probe and
 * the write failures are item `I3` in
 * `tests/unit/storage-write-failure.test.ts`. That a fresh launch starts at
 * 1,000 in a browser is item `I4` at `BJ-20`, and the reset control is `I5`
 * there.
 */

import { describe, expect, it } from 'vitest';

import { acceptIntent as accept } from './support/drive';

import type { History } from '../../src/core/history';
import { NO_HISTORY, record } from '../../src/core/history';
import { DEFAULT_RULES } from '../../src/core/rules';
import type { MilestoneId, Statistics } from '../../src/core/statistics';
import {
  MILESTONES,
  NO_COUNTERS,
  NO_STATISTICS,
  observeRound,
  openSession as openStatisticsSession,
} from '../../src/core/statistics';
import type { CoachRecord, CoachVerdict } from '../../src/core/strategy';
import {
  NO_DECISIONS,
  observe,
  openSession as openCoachSession,
  situationAt,
  strategyTable,
} from '../../src/core/strategy';
import type { Table, TableReadout } from '../../src/core/table';
import { createTable } from '../../src/core/table';
import { STARTING_CHIPS, createWallet } from '../../src/core/wallet';
import type { GameDocument } from '../../src/storage/document';
import {
  DEFAULT_DOCUMENT,
  DEFAULT_SETTINGS,
  DOCUMENT_VERSION,
  STORAGE_KEY,
  openDocumentSession,
  sanitiseDocument,
} from '../../src/storage/document';
import { createPersistence, loadDocument, walletOptionsFor } from '../../src/storage/persistence';
import type { KeyValueStore } from '../../src/storage/store';
import { createMemoryStore } from '../../src/storage/store';

import {
  envelopeText,
  reachesBetting,
  securityError,
  storeHolding,
  storeThatThrows,
} from './support/storage-fixtures';

// ---------------------------------------------------------------------------
// SPEC's figures, written out
// ---------------------------------------------------------------------------

/** SPEC 4.11 and SPEC 13: a launch starts here, and so does the unlock mark. */
const SPEC_STARTING_CHIPS = 1000;

/** SPEC 6: the table that is never locked, which is where a bad seat lands. */
const SPEC_LOWEST_TABLE = 'bronze';

/** SPEC 8: the last 50 completed rounds, and no more. */
const SPEC_ROUNDS_KEPT = 50;

/** SPEC 9: eleven milestones, and the count is the point. */
const SPEC_MILESTONE_COUNT = 11;

/** SPEC 13's persisted set, mapped onto the document's keys. */
const SPEC_13_PERSISTED: readonly { readonly name: string; readonly keys: readonly string[] }[] =
  Object.freeze([
    Object.freeze({ name: 'best chip balance', keys: Object.freeze(['bestBalance']) }),
    Object.freeze({ name: 'lifetime statistics', keys: Object.freeze(['statistics']) }),
    Object.freeze({ name: 'coach accuracy', keys: Object.freeze(['coach']) }),
    // SPEC 9's awarded list rides on the statistics document, so it maps to the
    // same key. Written out anyway, because SPEC 13 names it separately.
    Object.freeze({ name: 'milestones', keys: Object.freeze(['statistics']) }),
    // SPEC 6 derives every unlock from the mark, so this is the mark's key.
    Object.freeze({ name: 'table unlocks', keys: Object.freeze(['bestBalance']) }),
    Object.freeze({ name: 'selected table', keys: Object.freeze(['table']) }),
    Object.freeze({ name: 'hand history', keys: Object.freeze(['history']) }),
    Object.freeze({ name: 'settings', keys: Object.freeze(['settings']) }),
    Object.freeze({ name: 'the How-to-Play seen flag', keys: Object.freeze(['howToPlaySeen']) }),
  ]);

/** SPEC 13's not-persisted set, as the names a document must never carry. */
const SPEC_13_EXCLUDED = Object.freeze(['chips', 'balance', 'phase', 'hands', 'shoe', 'round']);

// ---------------------------------------------------------------------------
// A real round, so the history fixtures are real entries
// ---------------------------------------------------------------------------

/** SPEC 5: a frame long enough to pay for any one timed step. */
const TICK = 0.25;

/** Bounded, in the house pattern: a stall must fail loudly, not hang. */
const LOOP_LIMIT = 500;

/** Play one round through the real machine and stop at SPEC 10's round result. */
function playOneRound(table: Table): TableReadout {
  for (let turn = 0; turn < LOOP_LIMIT; turn += 1) {
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
        return state;
      default:
        table.update(TICK);
    }
  }
  throw new RangeError(`a round did not finish inside ${String(LOOP_LIMIT)} turns`);
}

/** One genuine SPEC 8 entry, so a history fixture is not a hand-written guess. */
const REAL_HISTORY: History = record(NO_HISTORY, playOneRound(createTable({ seed: 11 })), null);

/**
 * The same, with the coach on and recording real verdicts.
 *
 * `REAL_HISTORY` is recorded with `coach: null`, which is the "coach was off"
 * arm, and every history fixture in the matrix is a damaged copy of it. So the
 * branch of `entryOf` that reads a genuine `CoachVerdict` list, five nested
 * fields, a three-armed `CellAddress` and a `PreferenceList`, had no positive
 * round-trip control anywhere: a drift in `verdictOf` would silently drop every
 * round the coach graded out of a reloaded history and leave the uncoached ones
 * standing, which is the shape a player would read as "some of my hands are
 * missing" rather than as a broken save.
 *
 * Observed the way `main.ts` does, before the drain and from the pre-action
 * situation, so the verdicts are the ones a real session records.
 */
function playCoachedRound(seed: number): {
  readonly readout: TableReadout;
  readonly verdicts: readonly CoachVerdict[];
} {
  const table = createTable({ seed });
  const chart = strategyTable(table.readout().rules);
  let coach: CoachRecord = NO_DECISIONS;
  const verdicts: CoachVerdict[] = [];
  for (let turn = 0; turn < LOOP_LIMIT; turn += 1) {
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
      case 'playerTurn': {
        const situation = situationAt(state);
        accept(table, { kind: 'hit' });
        if (situation !== null) {
          const observation = observe('review', coach, chart, situation, 'hit');
          coach = observation.record;
          if (observation.verdict !== null) {
            verdicts.push(observation.verdict);
          }
        }
        break;
      }
      case 'roundResult':
        return { readout: state, verdicts: Object.freeze(verdicts) };
      default:
        table.update(TICK);
    }
  }
  throw new RangeError(`a coached round did not finish inside ${String(LOOP_LIMIT)} turns`);
}

/**
 * A seed hunted for a round the coach actually graded, in the shape
 * `tests/browser/support/flow-seeds.ts` hunts elsewhere: the first seed whose
 * round produces at least one verdict, so the fixture cannot quietly become the
 * uncoached case again.
 */
const COACHED_ROUND = ((): { readonly readout: TableReadout; readonly verdicts: readonly CoachVerdict[] } => {
  for (let seed = 1; seed < 200; seed += 1) {
    const played = playCoachedRound(seed);
    if (played.verdicts.length > 0) {
      return played;
    }
  }
  throw new RangeError('no seed under 200 produced a coached round');
})();

/** One genuine SPEC 8 entry carrying real SPEC 7 verdicts. */
const COACHED_HISTORY: History = record(NO_HISTORY, COACHED_ROUND.readout, COACHED_ROUND.verdicts);

/** Two of SPEC 9's eleven, awarded, so the salvage has something to preserve. */
const HEALTHY_MILESTONES: readonly MilestoneId[] = Object.freeze([
  'firstNatural',
  'reachedSilver',
]);

const HEALTHY_STATISTICS: Statistics = Object.freeze({
  session: NO_COUNTERS,
  lifetime: Object.freeze({
    handsPlayed: 40,
    wins: 18,
    losses: 19,
    pushes: 3,
    blackjacks: 2,
  }),
  streak: 0,
  rounds: 0,
  milestones: HEALTHY_MILESTONES,
  belowLowWater: false,
});

/** A document with nothing wrong with it, for the positive control and as a base. */
const HEALTHY: GameDocument = Object.freeze({
  bestBalance: 12_500,
  table: 'gold',
  statistics: HEALTHY_STATISTICS,
  coach: Object.freeze({
    session: Object.freeze({ decisions: 0, matched: 0 }),
    lifetime: Object.freeze({ decisions: 120, matched: 111 }),
  }),
  history: REAL_HISTORY,
  settings: Object.freeze({
    ...DEFAULT_SETTINGS,
    coach: 'hint',
    theme: 'dark',
    rules: Object.freeze({ ...DEFAULT_RULES, decks: 8 }),
  }),
  howToPlaySeen: true,
});

/** A stored payload built from the healthy one with a field replaced. */
function payloadWith(patch: Readonly<Record<string, unknown>>): string {
  return envelopeText(DOCUMENT_VERSION, { ...HEALTHY, ...patch });
}

/** The healthy document's statistics with one field replaced. */
function statisticsWith(patch: Readonly<Record<string, unknown>>): string {
  return payloadWith({ statistics: { ...HEALTHY.statistics, ...patch } });
}

/** The healthy document's settings with one field replaced. */
function settingsWith(patch: Readonly<Record<string, unknown>>): string {
  return payloadWith({ settings: { ...HEALTHY.settings, ...patch } });
}

// ---------------------------------------------------------------------------
// The corrupt matrix
// ---------------------------------------------------------------------------

/**
 * How far a corruption reaches.
 *
 * `whole` is every case where nothing inside the document can be salvaged: the
 * store refused the read, the string is not JSON, the envelope carries no usable
 * version, or the payload is not an object with fields. `field` is every case
 * where the document parses and one field of it does not, which is where the
 * per-field salvage of `document.ts` applies.
 */
type Reach = 'whole' | 'field';

interface Fixture {
  readonly name: string;
  readonly reach: Reach;
  readonly store: () => KeyValueStore;
}

function holding(name: string, reach: Reach, text: string): Fixture {
  return { name, reach, store: () => storeHolding(text) };
}

/**
 * The fixtures whose store refuses the read outright.
 *
 * Held apart from the rest because there is nothing stored in them to be
 * overwritten, so the criterion's last clause has nothing to say about them.
 * Item `I3` grades what a refusing store does; what matters here is that the
 * game still starts.
 */
const UNREADABLE: readonly Fixture[] = Object.freeze([
  {
    name: 'a store that throws SecurityError on the read',
    reach: 'whole',
    store: (): KeyValueStore => storeThatThrows('read', securityError()),
  },
  {
    name: 'a store that throws something that is not an Error',
    reach: 'whole',
    store: (): KeyValueStore => storeThatThrows('read', 'refused'),
  },
]);

/** Every fixture that is a string sitting in a store that answers. */
const STORED: readonly Fixture[] = Object.freeze([
  // Unparseable strings.
  holding('an empty string', 'whole', ''),
  holding('a blank string', 'whole', '   '),
  holding('a truncated object', 'whole', '{"version":1,"data":{'),
  holding('prose', 'whole', 'not json at all'),
  holding('a JSON null', 'whole', 'null'),
  holding('a JSON number', 'whole', '42'),
  holding('a JSON string', 'whole', '"a document"'),
  holding('a JSON array', 'whole', '[1,2,3]'),

  // The envelope.
  holding('an envelope with no version', 'whole', JSON.stringify({ data: HEALTHY })),
  holding('a version of zero', 'whole', envelopeText(0, HEALTHY)),
  holding('a negative version', 'whole', envelopeText(-3, HEALTHY)),
  holding('a fractional version', 'whole', envelopeText(1.5, HEALTHY)),
  holding('a version that is a string', 'whole', envelopeText('1', HEALTHY)),
  holding('a version that is null', 'whole', envelopeText(null, HEALTHY)),
  holding('a version from the future', 'whole', envelopeText(DOCUMENT_VERSION + 1, HEALTHY)),
  holding('a version far in the future', 'whole', envelopeText(9_999, HEALTHY)),

  // The payload.
  holding('a payload that is missing', 'whole', JSON.stringify({ version: DOCUMENT_VERSION })),
  holding('a payload that is null', 'whole', envelopeText(DOCUMENT_VERSION, null)),
  holding('a payload that is an array', 'whole', envelopeText(DOCUMENT_VERSION, [])),
  holding('a payload that is a number', 'whole', envelopeText(DOCUMENT_VERSION, 7)),

  // SPEC 13's best chip balance.
  holding('a mark below the starting bankroll', 'field', payloadWith({ bestBalance: 999 })),
  holding('a mark of zero', 'field', payloadWith({ bestBalance: 0 })),
  holding('a negative mark', 'field', payloadWith({ bestBalance: -500 })),
  holding('a fractional mark', 'field', payloadWith({ bestBalance: 1000.5 })),
  holding('a mark that is a string', 'field', payloadWith({ bestBalance: '2500' })),
  holding('a mark that is a boolean', 'field', payloadWith({ bestBalance: true })),
  holding('a mark that is null', 'field', payloadWith({ bestBalance: null })),
  holding('a mark past the safe integers', 'field', payloadWith({ bestBalance: 1e300 })),
  holding('no mark at all', 'field', envelopeText(DOCUMENT_VERSION, withoutKey('bestBalance'))),

  // SPEC 6's selected table.
  holding('a table SPEC 6 does not name', 'field', payloadWith({ table: 'platinum' })),
  holding('a table that is a number', 'field', payloadWith({ table: 4 })),
  holding('a table that is empty', 'field', payloadWith({ table: '' })),
  holding('no table at all', 'field', envelopeText(DOCUMENT_VERSION, withoutKey('table'))),

  // SPEC 11's counters and SPEC 9's milestones.
  holding('statistics that are a string', 'field', payloadWith({ statistics: 'none' })),
  holding('a lifetime scope that is a number', 'field', statisticsWith({ lifetime: 3 })),
  holding(
    'a lifetime scope with a negative tally',
    'field',
    statisticsWith({ lifetime: { handsPlayed: 10, wins: -1, losses: 8, pushes: 3, blackjacks: 0 } }),
  ),
  holding(
    'a lifetime scope with a fractional tally',
    'field',
    statisticsWith({ lifetime: { handsPlayed: 10.5, wins: 4, losses: 4, pushes: 2, blackjacks: 0 } }),
  ),
  holding(
    'a lifetime scope whose tallies do not add up',
    'field',
    statisticsWith({ lifetime: { handsPlayed: 10, wins: 4, losses: 4, pushes: 4, blackjacks: 0 } }),
  ),
  holding(
    'more blackjacks than hands played',
    'field',
    statisticsWith({ lifetime: { handsPlayed: 4, wins: 4, losses: 0, pushes: 0, blackjacks: 9 } }),
  ),
  holding('a milestone list that is a string', 'field', statisticsWith({ milestones: 'all' })),
  holding(
    'a milestone SPEC 9 does not name',
    'field',
    statisticsWith({ milestones: ['firstNatural', 'wonTheHouse', 'reachedSilver'] }),
  ),
  holding(
    'the same milestone twice',
    'field',
    statisticsWith({ milestones: ['firstNatural', 'firstNatural'] }),
  ),
  holding('a negative round count', 'field', statisticsWith({ rounds: -3 })),
  holding('a low-water latch that is a string', 'field', statisticsWith({ belowLowWater: 'yes' })),

  // SPEC 7's coach accuracy.
  holding('a coach record that is a string', 'field', payloadWith({ coach: 'none' })),
  holding(
    'more matches than decisions',
    'field',
    payloadWith({ coach: { session: { decisions: 0, matched: 0 }, lifetime: { decisions: 5, matched: 9 } } }),
  ),
  holding(
    'a negative decision count',
    'field',
    payloadWith({ coach: { session: { decisions: -1, matched: 0 }, lifetime: { decisions: 0, matched: 0 } } }),
  ),

  // SPEC 8's hand history.
  holding('a history that is a string', 'field', payloadWith({ history: 'none' })),
  holding('a history longer than SPEC 8 keeps', 'field', payloadWith({ history: overlongHistory() })),
  holding('an entry that is a number', 'field', payloadWith({ history: [1] })),
  holding('an entry missing the dealer hand', 'field', payloadWith({ history: [withoutEntryKey('dealer')] })),
  holding('an entry missing its hands', 'field', payloadWith({ history: [withoutEntryKey('hands')] })),
  holding('an entry with an impossible card', 'field', payloadWith({ history: [entryWithBadCard()] })),
  holding('an entry with an unknown action', 'field', payloadWith({ history: [entryWithBadAction()] })),
  holding('an entry with an unknown outcome', 'field', payloadWith({ history: [entryWithBadOutcome()] })),
  holding('an entry whose coach field is a number', 'field', payloadWith({ history: [entryWithBadCoach()] })),
  // The four salvage branches inside an entry that nothing reached. Each one
  // stops at a different guard: `handOf`'s non-record arm, `handOf`'s count
  // arm, `verdictsOfEntry`'s malformed-member arm and `cardOf`'s non-record
  // arm. All four drop the entry rather than the document, which is what the
  // reach column below asserts.
  holding('an entry whose hand is a number', 'field', payloadWith({ history: [entryWithHandNumber()] })),
  holding('an entry whose hand wager is a string', 'field', payloadWith({ history: [entryWithHandBadWager()] })),
  holding('an entry whose coach list holds a malformed verdict', 'field', payloadWith({ history: [entryWithBadVerdict()] })),
  holding('an entry whose dealer card is a number', 'field', payloadWith({ history: [entryWithNumericCard()] })),

  // SPEC 14's settings.
  holding('settings that are a string', 'field', payloadWith({ settings: 'default' })),
  holding('a shoe size SPEC 4.1 does not deal', 'field', settingsWith({ rules: { ...DEFAULT_RULES, decks: 4 } })),
  holding('a split comparison SPEC 4.6 does not name', 'field', settingsWith({ rules: { ...DEFAULT_RULES, splitRule: 'equalSuit' } })),
  holding('a house-rule toggle that is a string', 'field', settingsWith({ rules: { ...DEFAULT_RULES, surrender: 'on' } })),
  holding('rules that are a number', 'field', settingsWith({ rules: 6 })),
  holding('a coach mode SPEC 7 does not have', 'field', settingsWith({ coach: 'expert' })),
  holding('a speed SPEC 5 does not have', 'field', settingsWith({ speed: 'turbo' })),
  holding('a surface size QUALITY-BAR 4 does not list', 'field', settingsWith({ surfaceSize: 137 })),
  holding('a theme SPEC 14 does not have', 'field', settingsWith({ theme: 'neon' })),
  holding('a reduced-motion setting SPEC 14 does not have', 'field', settingsWith({ reducedMotion: 'never' })),
  holding('a volume above the ceiling', 'field', settingsWith({ volume: 5 })),
  holding('a volume below the floor', 'field', settingsWith({ volume: -1 })),
  holding('a volume that is a string', 'field', settingsWith({ volume: 'loud' })),
  holding('a mute that is a string', 'field', settingsWith({ muted: 'yes' })),

  // SPEC 17's seen flag.
  holding('a seen flag that is a number', 'field', payloadWith({ howToPlaySeen: 1 })),
]);

/** The whole matrix. */
const CORRUPT: readonly Fixture[] = Object.freeze([...UNREADABLE, ...STORED]);

/**
 * The size the bank must not fall below. `BJ-11`'s record quotes 73.
 *
 * A floor rather than a count, so a fixture added needs no edit here and a
 * fixture deleted is loud. Every other guard in this file's census is satisfied
 * by four fixtures as readily as by seventy-three, because each loop iterates
 * the list: erosion makes them assert less and stay green.
 *
 * **Raised to 77.** Four fixtures were added for the salvage branches inside a
 * history entry that nothing reached: a hand that is not a record, a hand whose
 * wager is not a count, a coach list holding a malformed verdict and a dealer
 * card that is a number. The floor moves with the bank deliberately, so that a
 * later deletion cannot quietly take the bank back below what the record now
 * describes.
 */
const BANK_FLOOR = 77;

function withoutKey(key: string): Readonly<Record<string, unknown>> {
  const copy: Record<string, unknown> = { ...HEALTHY };
  delete copy[key];
  return copy;
}

function entryRecord(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(REAL_HISTORY[0])) as Record<string, unknown>;
}

function withoutEntryKey(key: string): Readonly<Record<string, unknown>> {
  const entry = entryRecord();
  delete entry[key];
  return entry;
}

function entryWithBadCard(): Readonly<Record<string, unknown>> {
  const entry = entryRecord();
  entry['dealer'] = [{ rank: 'Z', suit: 'spades' }];
  return entry;
}

function entryWithBadAction(): Readonly<Record<string, unknown>> {
  const entry = entryRecord();
  entry['actions'] = ['stand', 'teleport'];
  return entry;
}

function entryWithBadOutcome(): Readonly<Record<string, unknown>> {
  const entry = entryRecord();
  const hands = JSON.parse(JSON.stringify(entry['hands'])) as Record<string, unknown>[];
  const first = hands[0];
  if (first === undefined) {
    throw new Error('the real entry has no hands to damage');
  }
  first['outcome'] = 'ALMOST_WON';
  entry['hands'] = hands;
  return entry;
}

function entryWithBadCoach(): Readonly<Record<string, unknown>> {
  const entry = entryRecord();
  entry['coach'] = 7;
  return entry;
}

/** A hand that is not a record at all, which `handOf` refuses before reading it. */
function entryWithHandNumber(): Readonly<Record<string, unknown>> {
  const entry = entryRecord();
  entry['hands'] = [7];
  return entry;
}

/** A hand whose wager is not a count, which `handOf` refuses on the field. */
function entryWithHandBadWager(): Readonly<Record<string, unknown>> {
  const entry = entryRecord();
  const hands = JSON.parse(JSON.stringify(entry['hands'])) as Record<string, unknown>[];
  const first = hands[0];
  if (first === undefined) {
    throw new Error('the real entry has no hands to damage');
  }
  first['wager'] = 'a lot';
  entry['hands'] = hands;
  return entry;
}

/**
 * A coach LIST holding one malformed verdict, which is a different arm from
 * `entryWithBadCoach`: that one stops at "the coach field is not a list", and
 * this one gets past that and is refused per member.
 */
function entryWithBadVerdict(): Readonly<Record<string, unknown>> {
  const entry = entryRecord();
  entry['coach'] = [{ played: 'hit', recommended: 'nope' }];
  return entry;
}

/** A dealer card that is a number, which `cardOf` refuses before reading a rank. */
function entryWithNumericCard(): Readonly<Record<string, unknown>> {
  const entry = entryRecord();
  entry['dealer'] = [3];
  return entry;
}

/**
 * More rounds than SPEC 8 keeps, each one distinguishable from its neighbours.
 *
 * The wager carries the index, so which end of the list survived the truncation
 * is visible. Identical copies would let a slice taken from the wrong end pass:
 * SPEC 8 keeps "the last 50" and `history.ts` puts the newest at index 0, so it
 * is the front that has to survive.
 */
function overlongHistory(): readonly unknown[] {
  const entry = REAL_HISTORY[0];
  if (entry === undefined) {
    throw new Error('the real round produced no entry');
  }
  return Array.from({ length: SPEC_ROUNDS_KEPT + 12 }, (_unused, index) => {
    const copy = JSON.parse(JSON.stringify(entry)) as Record<string, unknown>;
    copy['wager'] = index * 10;
    return copy;
  });
}

/** Split by how far the corruption reaches. Both counts are derived from the list. */
const WHOLE_DOCUMENT_FIXTURES = CORRUPT.filter((one) => one.reach === 'whole').length;
const PER_FIELD_FIXTURES = CORRUPT.filter((one) => one.reach === 'field').length;

/**
 * Stored marks a trusting loader cannot survive.
 *
 * Each is a value `createWallet` refuses by contract: not a whole number, or
 * below the starting bankroll. `null` and an absent key are deliberately not
 * here, because the wallet's own `?? STARTING_CHIPS` absorbs both, so a control
 * built on them would prove nothing about sanitising. `1e300` is not here
 * either: the wallet accepts it, because `Number.isInteger` is true of it, and
 * the sanitiser is deliberately the stricter of the two.
 */
const HOSTILE_MARKS: readonly unknown[] = Object.freeze([
  999,
  0,
  -500,
  1000.5,
  '2500',
  true,
  [],
  {},
]);

describe('I2: a corrupt saved value does not prevent the game from starting', () => {
  describe('the whole matrix', () => {
    /**
     * SPEC 13's bank, as a floor rather than a count.
     *
     * The counts below are derived from the list, so adding a fixture moves
     * them rather than slipping past a hard-coded number. What is asserted is
     * that the list is partitioned, that neither half is empty, and that no two
     * fixtures share a name, since a duplicated name is a fixture that is
     * silently running twice instead of covering two cases.
     *
     * **The floor is what those six guards could not say.** Every one of them
     * is satisfied by four fixtures as readily as by seventy-three: each loop in
     * this file iterates the list, so a deletion makes every assertion run
     * fewer times and leaves the suite green. `BANK_FLOOR` is the number the
     * part's record and `BJ-11`'s report both quote, written down once, as a
     * floor so that adding a fixture still needs no edit and removing one is
     * loud. It is deliberately not an equality: the bank is meant to grow.
     *
     * One line was dropped with it. `CORRUPT` is defined as
     * `[...UNREADABLE, ...STORED]`, so requiring its length to equal the sum of
     * those two lengths is a property of the spread operator and cannot fail;
     * the partition assertion below it is the one with force, because it fails
     * on any fixture whose `reach` is neither `'whole'` nor `'field'`.
     */
    it('covers both reaches and every category the criterion names', () => {
      expect(CORRUPT.length).toBeGreaterThanOrEqual(BANK_FLOOR);
      expect(CORRUPT).toHaveLength(WHOLE_DOCUMENT_FIXTURES + PER_FIELD_FIXTURES);
      expect(UNREADABLE.length).toBeGreaterThan(0);
      expect(WHOLE_DOCUMENT_FIXTURES).toBeGreaterThan(UNREADABLE.length);
      expect(PER_FIELD_FIXTURES).toBeGreaterThan(0);
      expect(new Set(CORRUPT.map((one) => one.name)).size).toBe(CORRUPT.length);
    });

    it('never throws on any of them', () => {
      for (const fixture of CORRUPT) {
        expect(() => loadDocument(fixture.store()), fixture.name).not.toThrow();
      }
    });

    it('produces a complete document with exactly SPEC 13 keys on every one', () => {
      const expected = [...new Set(SPEC_13_PERSISTED.flatMap((group) => group.keys))].sort();
      for (const fixture of CORRUPT) {
        const { document } = loadDocument(fixture.store());
        expect(Object.keys(document).sort(), fixture.name).toEqual(expected);
        expect(typeof document.bestBalance, fixture.name).toBe('number');
        expect(typeof document.table, fixture.name).toBe('string');
        expect(typeof document.howToPlaySeen, fixture.name).toBe('boolean');
        expect(Array.isArray(document.history), fixture.name).toBe(true);
      }
    });

    it('hands the wallet a mark it accepts on every one', () => {
      for (const fixture of CORRUPT) {
        const { document } = loadDocument(fixture.store());
        expect(
          () => createWallet(walletOptionsFor(document.bestBalance)),
          fixture.name,
        ).not.toThrow();
      }
    });

    it('starts the game on every one, all the way to SPEC 10 betting', () => {
      for (const fixture of CORRUPT) {
        const persistence = createPersistence({
          store: fixture.store(),
          durable: true,
          failure: null,
        });
        expect(reachesBetting(persistence.restored()), fixture.name).toBe(true);
      }
    });

    it('salvages exactly as far as each fixture is labelled, and no further', () => {
      // The `reach` label is documentation until something reads it. This is
      // the sweep that makes it a claim: a whole-reach fixture has nothing
      // inside it worth keeping and must come back as the defaults entire,
      // and a field-reach fixture must come back with something of its own
      // still on it. A salvage boundary that quietly moved in either direction
      // fails here, and it fails naming the fixture that moved.
      for (const fixture of CORRUPT) {
        const { document } = loadDocument(fixture.store());
        if (fixture.reach === 'whole') {
          expect(document, fixture.name).toEqual(DEFAULT_DOCUMENT);
        } else {
          expect(document, fixture.name).not.toEqual(DEFAULT_DOCUMENT);
        }
      }
    });

    it('records at least one repair on every one, because every one is corrupt', () => {
      for (const fixture of CORRUPT) {
        const { report } = loadDocument(fixture.store());
        expect(report.repairs.length, fixture.name).toBeGreaterThan(0);
      }
    });

    it('seats the player somewhere SPEC 6 opens on every one', () => {
      for (const fixture of CORRUPT) {
        const persistence = createPersistence({
          store: fixture.store(),
          durable: true,
          failure: null,
        });
        const { launch, wallet } = persistence.restored();
        expect(wallet.readout().chips, fixture.name).toBe(SPEC_STARTING_CHIPS);
        expect(['bronze', 'silver', 'gold'], fixture.name).toContain(launch.table);
      }
    });
  });

  describe('the positive control', () => {
    it('a document with nothing wrong with it repairs nothing', () => {
      const loaded = loadDocument(storeHolding(envelopeText(DOCUMENT_VERSION, HEALTHY)));
      expect(loaded.report.source).toBe('stored');
      expect(loaded.report.repairs).toEqual([]);
      expect(loaded.document.bestBalance).toBe(12_500);
      expect(loaded.document.table).toBe('gold');
      expect(loaded.document.settings.rules.decks).toBe(8);
      expect(loaded.document.howToPlaySeen).toBe(true);
    });

    it('an absent document is not a repair: a first launch lost nothing', () => {
      const loaded = loadDocument(createMemoryStore());
      expect(loaded.report.source).toBe('absent');
      expect(loaded.report.repairs).toEqual([]);
      expect(loaded.document).toEqual(DEFAULT_DOCUMENT);
    });

    it('a real hand-history entry survives the sanitiser unchanged', () => {
      // The history fixtures are damaged copies of this, so it matters that the
      // undamaged one passes: a sanitiser that rejected every entry would make
      // every history assertion below pass for the wrong reason.
      const loaded = loadDocument(storeHolding(envelopeText(DOCUMENT_VERSION, HEALTHY)));
      expect(loaded.document.history).toEqual(REAL_HISTORY);
      expect(loaded.document.history).toHaveLength(1);
    });

    it('a coached entry survives with every verdict field it was recorded with', () => {
      // The control the matrix never had. `REAL_HISTORY` is recorded with the
      // coach off, so `verdictOf` and the whole `CoachVerdict` shape below it
      // had no positive round trip: a sanitiser that dropped every coached
      // entry would leave a reloaded history holding only the rounds the coach
      // was off for, and every other assertion in this file would still pass.
      //
      // `toStrictEqual` rather than `toEqual`, because the difference between a
      // field restored as `undefined` and a field restored at all is exactly
      // what a round trip through `JSON` loses.
      const coached: GameDocument = Object.freeze({ ...HEALTHY, history: COACHED_HISTORY });
      const roundTripped = sanitiseDocument(JSON.parse(JSON.stringify(coached)));
      expect(roundTripped.repairs).toEqual([]);
      expect(roundTripped.document.history).toStrictEqual(COACHED_HISTORY);

      // And the fixture is really a coached one, so the assertion above cannot
      // quietly become the uncoached case again.
      const entry = COACHED_HISTORY[0];
      expect(entry?.coach, 'the hunted seed produced no verdicts').not.toBeNull();
      expect(entry?.coach?.length ?? 0).toBeGreaterThan(0);
      expect(COACHED_ROUND.verdicts.length).toBeGreaterThan(0);
    });
  });

  describe('the defaults SPEC states', () => {
    function documentIn(text: string): GameDocument {
      return loadDocument(storeHolding(text)).document;
    }

    it('replaces an out-of-range mark with SPEC 4.11 starting bankroll', () => {
      for (const mark of [999, 0, -500, 1000.5, '2500', true, null, 1e300]) {
        expect(documentIn(payloadWith({ bestBalance: mark })).bestBalance).toBe(
          SPEC_STARTING_CHIPS,
        );
      }
    });

    it('replaces a table SPEC 6 does not name with the one it never locks', () => {
      for (const seat of ['platinum', '', 4, null]) {
        expect(documentIn(payloadWith({ table: seat })).table).toBe(SPEC_LOWEST_TABLE);
      }
    });

    it('keeps the rest of the document when only the mark is corrupt', () => {
      // The salvage granularity, asserted where it matters: one bad field must
      // not cost the player their milestones, their history or their settings.
      const document = documentIn(payloadWith({ bestBalance: -1 }));
      expect(document.bestBalance).toBe(SPEC_STARTING_CHIPS);
      expect(document.table).toBe('gold');
      expect(document.statistics.lifetime.handsPlayed).toBe(40);
      expect(document.statistics.milestones).toEqual(['firstNatural', 'reachedSilver']);
      expect(document.coach.lifetime).toEqual({ decisions: 120, matched: 111 });
      expect(document.history).toEqual(REAL_HISTORY);
      expect(document.settings.theme).toBe('dark');
      expect(document.howToPlaySeen).toBe(true);
    });

    it('defaults one counter scope without touching the other', () => {
      const text = statisticsWith({
        lifetime: { handsPlayed: 10, wins: 4, losses: 4, pushes: 4, blackjacks: 0 },
      });
      const document = documentIn(text);
      expect(document.statistics.lifetime).toEqual(NO_COUNTERS);
      expect(document.statistics.milestones).toEqual(['firstNatural', 'reachedSilver']);
    });

    it('drops only the milestone SPEC 9 does not name', () => {
      const document = documentIn(
        statisticsWith({ milestones: ['firstNatural', 'wonTheHouse', 'reachedSilver'] }),
      );
      expect(document.statistics.milestones).toEqual(['firstNatural', 'reachedSilver']);
      expect(MILESTONES).toHaveLength(SPEC_MILESTONE_COUNT);
    });

    it('keeps one copy of a milestone stored twice', () => {
      const document = documentIn(statisticsWith({ milestones: ['firstNatural', 'firstNatural'] }));
      expect(document.statistics.milestones).toEqual(['firstNatural']);
    });

    it('defaults a coach scope claiming more matches than decisions', () => {
      const document = documentIn(
        payloadWith({
          coach: { session: { decisions: 0, matched: 0 }, lifetime: { decisions: 5, matched: 9 } },
        }),
      );
      expect(document.coach.lifetime).toEqual({ decisions: 0, matched: 0 });
    });

    it('truncates a history longer than SPEC 8 keeps, from the older end', () => {
      const document = documentIn(payloadWith({ history: overlongHistory() }));
      expect(document.history).toHaveLength(SPEC_ROUNDS_KEPT);
      // Newest first, so the front is what SPEC 8's "the last 50" means.
      expect(document.history[0]?.wager).toBe(0);
      expect(document.history[SPEC_ROUNDS_KEPT - 1]?.wager).toBe((SPEC_ROUNDS_KEPT - 1) * 10);
    });

    it('drops one malformed entry and keeps its neighbours', () => {
      const good = REAL_HISTORY[0];
      if (good === undefined) {
        throw new Error('the real round produced no entry');
      }
      const document = documentIn(
        payloadWith({ history: [good, withoutEntryKey('dealer'), good] }),
      );
      expect(document.history).toHaveLength(2);
      expect(document.history[0]).toEqual(good);
      expect(document.history[1]).toEqual(good);
    });

    it('replaces every SPEC 14 setting with the value its section states', () => {
      // SPEC 4.1: six decks. SPEC 4.6, 4.7 and 4.8: three toggles, default on.
      // SPEC 4.6: equal value. SPEC 7: the coach is off. SPEC 5: Normal.
      // QUALITY-BAR 4: 100 percent. SPEC 14: system theme, system motion, not
      // muted. All written out here rather than imported.
      const document = documentIn(payloadWith({ settings: 'default' }));
      expect(document.settings.rules.decks).toBe(6);
      expect(document.settings.rules.doubleAfterSplit).toBe(true);
      expect(document.settings.rules.surrender).toBe(true);
      expect(document.settings.rules.evenMoney).toBe(true);
      expect(document.settings.rules.splitRule).toBe('equalValue');
      expect(document.settings.coach).toBe('off');
      expect(document.settings.speed).toBe('normal');
      expect(document.settings.surfaceSize).toBe(100);
      expect(document.settings.muted).toBe(false);
      expect(document.settings.theme).toBe('system');
      expect(document.settings.reducedMotion).toBe('system');
    });

    it('replaces one bad setting without resetting the panel', () => {
      const document = documentIn(settingsWith({ theme: 'neon' }));
      expect(document.settings.theme).toBe('system');
      expect(document.settings.coach).toBe('hint');
      expect(document.settings.rules.decks).toBe(8);
    });

    it('clamps nothing: a volume out of range takes the default, not the bound', () => {
      // SPEC 4.11's stance on a rejected wager, applied to a stored value: a
      // number outside the range is not a number the player chose, so guessing
      // what they meant would be inventing a setting.
      expect(documentIn(settingsWith({ volume: 5 })).settings.volume).toBe(
        DEFAULT_SETTINGS.volume,
      );
      expect(documentIn(settingsWith({ volume: -1 })).settings.volume).toBe(
        DEFAULT_SETTINGS.volume,
      );
      expect(documentIn(settingsWith({ volume: 0 })).settings.volume).toBe(0);
      expect(documentIn(settingsWith({ volume: 0.4 })).settings.volume).toBe(0.4);
    });
  });

  describe('SPEC 13 not-persisted set', () => {
    it('does not carry the chip balance or anything about a round in progress', () => {
      const keys = Object.keys(DEFAULT_DOCUMENT);
      for (const excluded of SPEC_13_EXCLUDED) {
        expect(keys).not.toContain(excluded);
      }
    });

    it('is built out of exactly SPEC 13 keys, at the point it is built', () => {
      // Asserted against `sanitiseDocument` itself and not against a loaded
      // document, because `openDocumentSession` rebuilds the value from seven
      // named fields on the way out and would quietly strip an eighth. The
      // sanitiser's own literal is where a field could be added by hand, so it
      // is where the key set has to be checked.
      const expected = [...new Set(SPEC_13_PERSISTED.flatMap((group) => group.keys))].sort();
      const { document } = sanitiseDocument({
        ...HEALTHY,
        chips: 5_000,
        phase: 'playerTurn',
        round: 12,
      });
      expect(Object.keys(document).sort()).toEqual(expected);
    });

    it('drops a chip balance somebody put in the document, and never writes one back', () => {
      const store = storeHolding(
        envelopeText(DOCUMENT_VERSION, { ...HEALTHY, chips: 5_000, phase: 'playerTurn', round: 12 }),
      );
      const persistence = createPersistence({ store, durable: true, failure: null });
      expect(Object.keys(persistence.document())).not.toContain('chips');

      persistence.save(persistence.document());
      const written = store.read(STORAGE_KEY);
      if (written === null) {
        throw new Error('nothing was written back');
      }
      const stored = JSON.parse(written) as { data: Record<string, unknown> };
      for (const excluded of SPEC_13_EXCLUDED) {
        expect(Object.keys(stored.data)).not.toContain(excluded);
      }
      // A launch starts at 1,000 whatever the document said.
      expect(persistence.restored().wallet.readout().chips).toBe(SPEC_STARTING_CHIPS);
    });

    it('opens the session scope on the way in, so nothing session-shaped is carried', () => {
      const store = storeHolding(
        payloadWith({
          statistics: {
            ...HEALTHY_STATISTICS,
            session: { handsPlayed: 9, wins: 4, losses: 4, pushes: 1, blackjacks: 1 },
            streak: 4,
            rounds: 240,
            belowLowWater: true,
          },
          coach: {
            session: { decisions: 30, matched: 20 },
            lifetime: { decisions: 120, matched: 111 },
          },
        }),
      );
      const { document } = loadDocument(store);
      expect(document.statistics.session).toEqual(NO_COUNTERS);
      expect(document.statistics.streak).toBe(0);
      expect(document.statistics.rounds).toBe(0);
      expect(document.statistics.belowLowWater).toBe(false);
      expect(document.coach.session).toEqual({ decisions: 0, matched: 0 });
      // And the lifetime scopes and the milestones came through, which is the
      // other half of SPEC 13's sentence.
      expect(document.statistics.lifetime.handsPlayed).toBe(40);
      expect(document.statistics.milestones).toEqual(['firstNatural', 'reachedSilver']);
      expect(document.coach.lifetime).toEqual({ decisions: 120, matched: 111 });
    });

    it('writes no session scope either, whatever the game hands it', () => {
      // The projection at the write, rather than only the open at the read.
      // What reaches storage is SPEC 13's persisted set: a document handed over
      // mid-session, with counters and a latch on it, is written without them.
      const store = createMemoryStore();
      const persistence = createPersistence({ store, durable: true, failure: null });
      persistence.save({
        ...HEALTHY,
        statistics: {
          ...HEALTHY_STATISTICS,
          session: { handsPlayed: 9, wins: 4, losses: 4, pushes: 1, blackjacks: 1 },
          streak: 4,
          rounds: 240,
          belowLowWater: true,
        },
        coach: {
          session: { decisions: 30, matched: 20 },
          lifetime: { decisions: 120, matched: 111 },
        },
      });

      const written = store.read(STORAGE_KEY);
      if (written === null) {
        throw new Error('nothing was written');
      }
      const stored = JSON.parse(written) as { data: GameDocument };
      expect(stored.data.statistics.session).toEqual(NO_COUNTERS);
      expect(stored.data.statistics.streak).toBe(0);
      expect(stored.data.statistics.rounds).toBe(0);
      expect(stored.data.statistics.belowLowWater).toBe(false);
      expect(stored.data.coach.session).toEqual({ decisions: 0, matched: 0 });
      expect(stored.data.statistics.lifetime.handsPlayed).toBe(40);
      expect(stored.data.coach.lifetime).toEqual({ decisions: 120, matched: 111 });
    });
  });

  describe('the wallet options seam', () => {
    it('spells a missing mark as an absent key, not as an undefined one', () => {
      // `exactOptionalPropertyTypes` makes the two different, and the wallet
      // reads `options.bestBalance ?? STARTING_CHIPS`, so a present-but-undefined
      // key is legal at runtime and rejected at compile time. One helper keeps
      // the two spellings from ever being written by hand.
      expect(Object.keys(walletOptionsFor(undefined))).toEqual([]);
      expect(Object.keys(walletOptionsFor(4_000))).toEqual(['bestBalance']);
      expect(createWallet(walletOptionsFor(undefined)).readout().bestBalance).toBe(
        SPEC_STARTING_CHIPS,
      );
      expect(createWallet(walletOptionsFor(4_000)).readout().bestBalance).toBe(4_000);
    });
  });

  describe('overwritten on the next successful write', () => {
    it('replaces the corrupt document, so the next load repairs nothing', () => {
      // Over every fixture that has something stored to replace. The two whose
      // store refuses the read have nothing to overwrite and nothing to read
      // back, and item `I3` is where a refusing store is graded.
      for (const fixture of STORED) {
        const store = fixture.store();
        const persistence = createPersistence({ store, durable: true, failure: null });
        const next: GameDocument = { ...persistence.document(), bestBalance: 3_000 };
        expect(persistence.save(next).ok, fixture.name).toBe(true);

        const again = loadDocument(store);
        expect(again.report.source, fixture.name).toBe('stored');
        expect(again.report.repairs, fixture.name).toEqual([]);
        expect(again.document.bestBalance, fixture.name).toBe(3_000);
      }
    });
  });

  describe('the trusting loader, which is the control', () => {
    /** Hands the stored mark straight to the wallet. What this part exists to stop. */
    function trusting(mark: unknown): void {
      createWallet({ bestBalance: mark as number });
    }

    it('throws on all 8 hostile marks, where the real loader throws on none', () => {
      let refused = 0;
      for (const mark of HOSTILE_MARKS) {
        let threw = false;
        try {
          trusting(mark);
        } catch (error) {
          threw = error instanceof RangeError;
        }
        if (threw) {
          refused += 1;
        }

        const { document } = loadDocument(storeHolding(payloadWith({ bestBalance: mark })));
        expect(() => createWallet(walletOptionsFor(document.bestBalance))).not.toThrow();
        expect(document.bestBalance).toBe(SPEC_STARTING_CHIPS);
      }
      expect(refused).toBe(HOSTILE_MARKS.length);
      expect(HOSTILE_MARKS.length).toBeGreaterThan(0);
    });

    it('agrees with the real loader on a mark that is genuinely fine', () => {
      expect(() => trusting(12_500)).not.toThrow();
      const { document } = loadDocument(storeHolding(payloadWith({ bestBalance: 12_500 })));
      expect(document.bestBalance).toBe(12_500);
    });
  });

  describe('the session-blind loader, which is the other control', () => {
    /**
     * SPEC 9 row 11 is "surviving a bankroll below 10 percent and recovering to
     * the starting amount", and `belowLowWater` is the session latch that
     * records the first half. A launch hands the player 1,000 chips, which is
     * the starting amount, so a latch carried across a launch awards the row on
     * the first round the player finishes without them having recovered
     * anything. This is `BJ-10`'s binding handoff, and it is the reason the
     * loader calls `openSession`.
     */
    const LATCHED = statisticsWith({ belowLowWater: true, rounds: 0, milestones: [] });

    function blindLoad(text: string): Statistics {
      // Exactly the real loader with `openSession` left out.
      const parsed = JSON.parse(text) as { data: unknown };
      return sanitiseDocument(parsed.data).document.statistics;
    }

    /**
     * A first round that ends at or above SPEC 4.11's starting bankroll.
     *
     * Row 11's second half is "recovering to the starting amount", so the
     * control needs a boundary where the balance is at least 1,000. Searched
     * rather than asserted of a chosen seed, because which seed wins its first
     * round is an accident of the shuffle and not something this file should
     * pretend to know.
     */
    function firstRoundAtOrAboveStart(): TableReadout {
      for (let seed = 1; seed <= 60; seed += 1) {
        const readout = playOneRound(createTable({ seed }));
        const { phase } = readout;
        if (phase.kind === 'roundResult' && phase.result.chips >= SPEC_STARTING_CHIPS) {
          return readout;
        }
      }
      throw new RangeError('no seed in 1..60 ended its first round at or above 1,000 chips');
    }

    it('awards SPEC 9 row 11 on the first round, where the real loader does not', () => {
      const readout = firstRoundAtOrAboveStart();

      const blind = observeRound(blindLoad(LATCHED), readout, NO_DECISIONS);
      expect(blind.awarded).toContain('survivedAndRecovered');

      const real = loadDocument(storeHolding(LATCHED)).document.statistics;
      const honest = observeRound(real, readout, NO_DECISIONS);
      expect(honest.awarded).not.toContain('survivedAndRecovered');
      expect(real.belowLowWater).toBe(false);
    });

    it('throws at the first round boundary on a restored round count, where the real loader does not', () => {
      const carried = statisticsWith({ rounds: 240, belowLowWater: false });
      const table = createTable({ seed: 6 });
      const readout = playOneRound(table);

      expect(() => observeRound(blindLoad(carried), readout, NO_DECISIONS)).toThrow(
        /is not the one after/,
      );

      const real = loadDocument(storeHolding(carried)).document.statistics;
      expect(real.rounds).toBe(0);
      expect(() => observeRound(real, readout, NO_DECISIONS)).not.toThrow();
    });

    it('agrees with the real loader on a document with nothing latched', () => {
      const clean = statisticsWith({ belowLowWater: false, rounds: 0, streak: 0 });
      expect(blindLoad(clean).lifetime).toEqual(
        loadDocument(storeHolding(clean)).document.statistics.lifetime,
      );
    });
  });

  describe('the defaults themselves', () => {
    it('are SPEC 4.11 bankroll, SPEC 6 lowest table, and every empty record', () => {
      expect(DEFAULT_DOCUMENT.bestBalance).toBe(SPEC_STARTING_CHIPS);
      expect(DEFAULT_DOCUMENT.bestBalance).toBe(STARTING_CHIPS);
      expect(DEFAULT_DOCUMENT.table).toBe(SPEC_LOWEST_TABLE);
      expect(DEFAULT_DOCUMENT.statistics).toBe(NO_STATISTICS);
      expect(DEFAULT_DOCUMENT.coach).toBe(NO_DECISIONS);
      expect(DEFAULT_DOCUMENT.history).toBe(NO_HISTORY);
      expect(DEFAULT_DOCUMENT.howToPlaySeen).toBe(false);
    });

    it('are a fixed point of the session open, which the default path rests on', () => {
      // `loadDocument` hands back `DEFAULT_DOCUMENT` on every whole-document
      // default **without** putting it through `openDocumentSession`, because
      // the two empty records are already session-clean and the shortcut keeps
      // the value's identity. That is only sound while opening a session on the
      // defaults changes nothing. Add a launch-time field to either module's
      // `openSession` and the shortcut silently starts skipping it; this is
      // where that says so, in the two modules and in the document at once.
      expect(openStatisticsSession(NO_STATISTICS)).toEqual(NO_STATISTICS);
      expect(openCoachSession(NO_DECISIONS)).toEqual(NO_DECISIONS);
      expect(openDocumentSession(DEFAULT_DOCUMENT)).toEqual(DEFAULT_DOCUMENT);
    });
  });
});
