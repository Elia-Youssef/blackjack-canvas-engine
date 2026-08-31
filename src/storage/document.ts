/**
 * SPEC 13's saved document: what is in it, what it defaults to, and how a
 * corrupt one is read. QUALITY-BAR section 8, SPEC 18, items `I1` and `I2`.
 *
 * **SPEC 13's persisted list, name for name.** "Best chip balance, lifetime
 * statistics, coach accuracy, milestones, table unlocks, selected table, hand
 * history, settings, and the How-to-Play seen flag." Nine names and seven keys,
 * because two of the nine are carried rather than stored:
 *
 *   - **Milestones are inside the statistics document.** `statistics.ts` holds
 *     SPEC 9's awarded list on the same frozen value as the two counter scopes,
 *     and splitting it out here would mean reassembling it on load and keeping
 *     the two halves in step forever.
 *   - **Table unlocks are the best-balance mark.** SPEC 6 keys every unlock to
 *     the best chip balance ever reached, so a stored list of unlocked tables
 *     would be a second answer to a question `wallet.isUnlocked` already
 *     answers, and a document whose list disagreed with its mark would have no
 *     right answer. Storing the mark alone makes that disagreement unspellable.
 *
 * **SPEC 13's not-persisted list, name for name.** "The chip balance, and
 * nothing about a round in progress." Neither is here and neither is reachable
 * from here: there is no `chips`, no phase, no hand, no wager and no shoe state
 * in `GameDocument`, and `tests/unit/storage-corrupt.test.ts` asserts the key
 * set is exactly the seven below, so one cannot be added quietly.
 *
 * **The session scope is projected out at the write, not merely ignored at the
 * read.** SPEC 13: "Session statistics reset on launch; lifetime statistics
 * accumulate." `openDocumentSession` runs both modules' `openSession`, and
 * `persistence.ts` calls it at the write so the stored bytes carry lifetime
 * figures and milestones and nothing session-shaped, and again at the read
 * because a document is never trusted and a hand-edited or migrated one can
 * carry anything. It is one function because it is one sentence.
 *
 * **Read defensively, field by field.** SPEC 18: "A corrupt or unparseable
 * saved document must not prevent the game starting. Read defensively, fall
 * back to defaults, overwrite on the next successful write." The granularity
 * below is **per field wherever a field can stand on its own**, and whole only
 * where nothing can:
 *
 *   - A string that is not JSON, or a JSON value that is not an object, has no
 *     fields to salvage, so the whole document defaults. Same for an envelope
 *     whose version cannot be interpreted: see `migrations.ts`.
 *   - A document that parses gives every field independently, and SPEC 13's set
 *     carries no invariant coupling two of them, with one exception: the
 *     selected table against the unlocks. That pair is not resolved here at all.
 *     `wallet.launchTable` is the function SPEC 13 names for exactly it, and
 *     `persistence.ts` calls it, so a table this file salvaged and a mark that
 *     does not open it still seat the player somewhere SPEC 6 allows.
 *   - Inside a field, salvage stops where the value stops being that field. A
 *     counter scope whose five tallies do not add up is not four good numbers
 *     and one bad one, it is a scope with no meaning, so the scope defaults. A
 *     history **entry** missing a SPEC 8 field is dropped and its neighbours
 *     kept, because SPEC 8's list is a list of rounds and one unreadable round
 *     is not the other forty-nine.
 *
 * Every repair is recorded and handed back, so `I2`'s "defaults are used and
 * overwritten on the next successful write" has something to assert against and
 * a later readout has something to say.
 *
 * No canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { Card } from '../core/cards';
import { RANKS, SUITS } from '../core/cards';
import type { SplitRule } from '../core/hand';
import type { History, HistoryEntry, HistoryHand } from '../core/history';
import { HISTORY_LIMIT, NO_HISTORY } from '../core/history';
import type { HouseRules } from '../core/rules';
import { DEFAULT_RULES } from '../core/rules';
import type { Outcome, Rung } from '../core/settlement';
import type { DeckCount } from '../core/shoe';
import { DECK_COUNTS } from '../core/shoe';
import type { Counters, MilestoneId, Statistics } from '../core/statistics';
import {
  MILESTONES,
  NO_COUNTERS,
  NO_STATISTICS,
  openSession as openStatisticsSession,
} from '../core/statistics';
import type {
  CellAddress,
  ChartRank,
  CoachAccuracy,
  CoachAction,
  CoachMode,
  CoachRecord,
  CoachVerdict,
} from '../core/strategy';
import {
  COACH_MODES,
  DEFAULT_COACH_MODE,
  NO_DECISIONS,
  UP_CARDS,
  openSession as openCoachSession,
} from '../core/strategy';
import type { Speed } from '../core/table';
import { DEFAULT_SPEED, PLAYER_ACTIONS, SPEEDS } from '../core/table';
import type { PlayerAction } from '../core/types';
import type { TableId } from '../core/wallet';
import { LOWEST_TABLE, STARTING_CHIPS, isTableId } from '../core/wallet';
import { DEFAULT_MUTED, DEFAULT_VOLUME, MAX_VOLUME, MIN_VOLUME } from '../ui/audio';
import { DEFAULT_REDUCED_MOTION, MOTION_SETTINGS, type MotionSetting } from '../ui/motion';
import { DEFAULT_THEME, THEMES, type Theme } from '../ui/theme';
import {
  DEFAULT_SURFACE_SIZE,
  SURFACE_SIZES,
  type SurfaceSize,
} from '../render/surface';

import { isRecord } from './store';

// ---------------------------------------------------------------------------
// The key and the schema version. QUALITY-BAR section 8
// ---------------------------------------------------------------------------

/** The namespace both games share, so neither can collide with the other. */
export const STORAGE_NAMESPACE = 'js-games';

/** This game's segment of the namespace. */
export const STORAGE_GAME = 'blackjack';

/**
 * The one key this game ever touches. QUALITY-BAR section 8.
 *
 * **Namespaced key, versioned document, and the version is deliberately not in
 * the key.** Section 8 asks for "namespaced and versioned keys, one JSON
 * document per game with a schema version, migrated on bump", and the second
 * half of that sentence decides the first: a version in the key means a bump
 * writes somewhere new and leaves the previous document behind under a name the
 * loader has to go looking for, so the migration starts with a key scan and a
 * guess about which of several documents is the real one. A version inside the
 * document means the bump finds it exactly where it has always been, reads its
 * `version` field and walks it forward. That is what `migrations.ts` does.
 */
export const STORAGE_KEY = `${STORAGE_NAMESPACE}.${STORAGE_GAME}`;

/**
 * The schema version this build writes. QUALITY-BAR section 8's "schema
 * version, migrated on bump".
 *
 * One, because this is the first shipped shape. `MIGRATIONS` in `migrations.ts`
 * is therefore empty, and it is empty because there is nothing to migrate from
 * rather than because the machinery is missing: the walk, the per-version step
 * lookup and the future-version policy are all real code, and
 * `tests/unit/storage-migration.test.ts` drives them with synthetic versions.
 */
export const DOCUMENT_VERSION = 1;

/** The lowest version number a document may claim. Zero is not a schema. */
export const MIN_DOCUMENT_VERSION = 1;

// ---------------------------------------------------------------------------
// SPEC 14's settings
// ---------------------------------------------------------------------------

/**
 * SPEC 5's Speed setting, re-exported from the module that now owns it.
 *
 * `BJ-11` declared the type here because the persisted document was the first
 * thing in the build that had to name the setting, and said in as many words
 * that a later part should move it to the module that reads it. `BJ-14` is that
 * part: `core/table.ts` reads it in `timedStep`, so the type, the list and the
 * default live there beside `TIMINGS` and `FAST_SPEED_MULTIPLIER`, and this file
 * takes them the way it already takes `HouseRules`, `CoachMode` and
 * `PLAYER_ACTIONS`. No new import edge was created: `table.ts` was already in
 * this module's import list.
 *
 * They are re-exported rather than merely imported so that every reader of the
 * persisted shape still finds the setting where the document names it, and so
 * the move cost no caller an edit.
 */
export type { Speed };
export { SPEEDS, DEFAULT_SPEED };

/**
 * QUALITY-BAR section 4's play-surface size, in percent. `BJ-20`.
 *
 * Declared by `src/render/surface.ts`, the logical-to-CSS seam, and re-exported
 * here rather than declared a second time: the duplicate this file carried from
 * `BJ-11` collapses now that something wires the reload flows, on the ruling
 * that corrected `surface.ts`'s header at `BJ-19` to say exactly this. The
 * import edge runs one way (`render/` imports nothing from `src/storage/`),
 * the same direction the sound constants' edge took at `BJ-19`.
 */
export type { SurfaceSize };
export { SURFACE_SIZES, DEFAULT_SURFACE_SIZE };

/**
 * SPEC 14's theme setting. Re-exported from `src/ui/theme.ts`, which `BJ-20`
 * built beside the attribute writer that reads it, on the Speed precedent.
 */
export type { Theme };
export { THEMES, DEFAULT_THEME };

/**
 * SPEC 14's reduced-motion setting. Re-exported from `src/ui/motion.ts`, the
 * module that owns the resolution rule both arms run through, on the same
 * precedent.
 */
export type { MotionSetting };
export { MOTION_SETTINGS, DEFAULT_REDUCED_MOTION };

/**
 * SPEC 14's sound: not muted until a player mutes it.
 *
 * `BJ-11` declared these beside the persisted settings because the document
 * was the first thing that had to name the values, and said in as many words
 * that a later part should move each to the module that reads it. `BJ-14` did
 * that for Speed, from here to `core/table.ts`. `BJ-19` does it for sound,
 * from here to `src/ui/audio.ts`: the engine applies both at the context's
 * creation, so the constants live beside the engine and this file re-exports
 * them the way it already re-exports `SPEEDS` and `DEFAULT_SPEED`. That gives
 * this file a `storage` to `ui` import, an edge earlier headers declared
 * absent on purpose; it is taken here deliberately under the ruling that
 * moves each setting's constants to the module that reads them, it runs in
 * one direction only (`src/ui/audio.ts` imports nothing from this directory),
 * and nothing imports `src/storage/` until `BJ-20`.
 */
export { DEFAULT_MUTED, MIN_VOLUME, MAX_VOLUME, DEFAULT_VOLUME };

/**
 * SPEC 14's settings panel, as a persisted value.
 *
 * The first five are exactly `rules.ts`'s `HouseRules`, reused rather than
 * respelled: SPEC 14 lists shoe size, double after split, surrender, even money
 * and the split comparison, which is that record field for field, and a second
 * spelling here would be a second place a default could drift from SPEC. The
 * rest are the coach and presentation settings whose controls arrive at `BJ-15`;
 * they are persisted now because SPEC 13 persists the settings and a shape that
 * gained a field later would need a migration for each one.
 *
 * **Reset all data is not here.** SPEC 14 lists it in the same sentence, but it
 * is a control rather than a stored value, and it is `resetAll` in
 * `persistence.ts`.
 */
export interface Settings {
  /** SPEC 14's first five, as the record everything else already reads. */
  readonly rules: HouseRules;
  /** SPEC 7's three modes. Off by default, which SPEC 7 states. */
  readonly coach: CoachMode;
  /** SPEC 5's Speed. Presentation only: it changes no outcome. */
  readonly speed: Speed;
  /** QUALITY-BAR section 4's play-surface size, in percent. */
  readonly surfaceSize: SurfaceSize;
  /** SPEC 14's mute. QUALITY-BAR section 10 applies it at context creation. */
  readonly muted: boolean;
  /** SPEC 14's volume, from `MIN_VOLUME` to `MAX_VOLUME` inclusive. */
  readonly volume: number;
  /** SPEC 14's theme. */
  readonly theme: Theme;
  /** SPEC 14's reduced motion: follow the platform query, or always reduce. */
  readonly reducedMotion: MotionSetting;
}

/** Every SPEC 14 default, each read off the section that states it. */
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  rules: DEFAULT_RULES,
  coach: DEFAULT_COACH_MODE,
  speed: DEFAULT_SPEED,
  surfaceSize: DEFAULT_SURFACE_SIZE,
  muted: DEFAULT_MUTED,
  volume: DEFAULT_VOLUME,
  theme: DEFAULT_THEME,
  reducedMotion: DEFAULT_REDUCED_MOTION,
});

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/**
 * Everything SPEC 13 persists, as one plain serialisable value.
 *
 * Seven keys for SPEC 13's nine names, for the two reasons the header gives.
 * Every field is a number, a boolean, a string or a frozen structure of those,
 * so `JSON.stringify` is the whole encoder, and `statistics.ts` and `history.ts`
 * each already prove their own half round-trips exactly.
 */
export interface GameDocument {
  /** SPEC 13's "best chip balance", and SPEC 6's unlock mark with it. */
  readonly bestBalance: number;
  /** SPEC 13's "selected table". */
  readonly table: TableId;
  /** SPEC 13's "lifetime statistics" and "milestones", on one document. */
  readonly statistics: Statistics;
  /** SPEC 13's "coach accuracy". SPEC 7's two counter pairs. */
  readonly coach: CoachRecord;
  /** SPEC 13's "hand history". SPEC 8's last 50 completed rounds. */
  readonly history: History;
  /** SPEC 13's "settings". SPEC 14's panel. */
  readonly settings: Settings;
  /** SPEC 13's and SPEC 17's How-to-Play seen flag. Dismissal persists. */
  readonly howToPlaySeen: boolean;
}

/**
 * A first launch, a cleared browser and a document nothing could be salvaged
 * from all land here. SPEC 13 and SPEC 4.11.
 *
 * The chip balance is not in it, because SPEC 13 does not persist one: a launch
 * starts at `STARTING_CHIPS` whatever this document says, and the figure below
 * is the high-water mark rather than a balance.
 */
export const DEFAULT_DOCUMENT: GameDocument = Object.freeze({
  bestBalance: STARTING_CHIPS,
  table: LOWEST_TABLE.id,
  statistics: NO_STATISTICS,
  coach: NO_DECISIONS,
  history: NO_HISTORY,
  settings: DEFAULT_SETTINGS,
  howToPlaySeen: false,
});

/**
 * SPEC 13's "session statistics reset on launch; lifetime statistics
 * accumulate", as one function over the whole document.
 *
 * Both modules' `openSession`, and nothing else. It is called at the read
 * because a stored document is not trusted, and at the write because what
 * reaches storage must carry SPEC 13's persisted set and nothing else; it is
 * idempotent, which is what lets `persistence.ts` hold one document in memory
 * and write it unchanged. Why the read call is not optional is spelled out at
 * the load site: milestone row 11 and the round-boundary guard both depend on
 * it.
 */
export function openDocumentSession(document: GameDocument): GameDocument {
  return Object.freeze({
    bestBalance: document.bestBalance,
    table: document.table,
    statistics: openStatisticsSession(document.statistics),
    coach: openCoachSession(document.coach),
    history: document.history,
    settings: document.settings,
    howToPlaySeen: document.howToPlaySeen,
  });
}

// ---------------------------------------------------------------------------
// Repairs, as values a readout can surface
// ---------------------------------------------------------------------------

/** Why a stored value was replaced by a default. Item `I2`. */
export type RepairReason =
  /** The store threw when the document was read. */
  | 'unreadable'
  /** `JSON.parse` refused the stored string. */
  | 'unparseable'
  /** It parsed, and is not an object with fields. */
  | 'not-a-document'
  /** The envelope carries no usable schema version. */
  | 'bad-version'
  /** The version is newer than this build writes. */
  | 'future-version'
  /** An older version with no registered step to walk it forward. */
  | 'no-migration'
  /** A registered migration step threw. */
  | 'migration-failed'
  /** The key is absent from a document that is otherwise readable. */
  | 'missing'
  /** Present, and not the shape the field is. */
  | 'malformed'
  /** The right shape, outside the range the field allows. */
  | 'out-of-range'
  /** A string or number naming nothing the spec defines. */
  | 'unknown-value'
  /** More entries than the spec keeps. */
  | 'too-long'
  /** Well-formed fields that contradict each other. */
  | 'inconsistent';

/** One replaced value, named by its path through the document. */
export interface Repair {
  /** A dotted path, or the empty string for the document as a whole. */
  readonly field: string;
  readonly reason: RepairReason;
}

/** A sanitised document, and everything that had to be replaced to get one. */
export interface SanitisedDocument {
  readonly document: GameDocument;
  readonly repairs: readonly Repair[];
}

type Note = (field: string, reason: RepairReason) => void;

/**
 * A missing key and a wrong value are different repairs and the same default.
 *
 * `undefined` is unreachable in a document that came through `JSON.parse`, so it
 * means the key was absent rather than that it held `undefined`, and the report
 * says so.
 */
function reasonFor(value: unknown, mismatch: RepairReason): RepairReason {
  return value === undefined ? 'missing' : mismatch;
}

// ---------------------------------------------------------------------------
// The primitives every field is checked with
// ---------------------------------------------------------------------------

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * A count: a safe non-negative integer.
 *
 * `Number.isSafeInteger` is the whole guard and deliberately the strict one: it
 * refuses `NaN`, both infinities, every fraction and anything past 2^53 - 1,
 * each of which is a number `JSON.parse` will happily produce and none of which
 * is a number of hands, chips or decisions.
 */
function countOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** A signed whole number, for a chip delta, which SPEC 4.10 lets go negative. */
function integerOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function isMember<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function isNumberMember<T extends number>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'number' && (allowed as readonly number[]).includes(value);
}

/**
 * A membership test built from a total map of a union.
 *
 * The map is `Record<T, true>`, so a member added to the union stops this file
 * compiling instead of quietly becoming a value the loader rejects. Used for the
 * four unions whose owning module publishes no runtime list; the ones that do
 * publish one are read from it, because that list is their own and is guarded by
 * their own tests.
 */
function unionMember<T extends string>(all: Readonly<Record<T, true>>, value: unknown): value is T {
  return typeof value === 'string' && Object.hasOwn(all, value);
}

const OUTCOMES: Readonly<Record<Outcome, true>> = Object.freeze({
  SURRENDER: true,
  PUSH: true,
  BLACKJACK: true,
  DEALER_WIN: true,
  PLAYER_WIN: true,
});

const RUNGS: Readonly<Record<Rung, true>> = Object.freeze({
  1: true,
  2: true,
  3: true,
  4: true,
  5: true,
  6: true,
  7: true,
  8: true,
  9: true,
});

const SPLIT_RULES: Readonly<Record<SplitRule, true>> = Object.freeze({
  equalValue: true,
  equalRank: true,
});

const COACH_ACTIONS: Readonly<Record<CoachAction, true>> = Object.freeze({
  hit: true,
  stand: true,
  double: true,
  split: true,
  surrender: true,
});

function isOutcome(value: unknown): value is Outcome {
  return unionMember(OUTCOMES, value);
}

function isRung(value: unknown): value is Rung {
  return typeof value === 'number' && Number.isInteger(value) && Object.hasOwn(RUNGS, String(value));
}

function isCoachAction(value: unknown): value is CoachAction {
  return unionMember(COACH_ACTIONS, value);
}

function isChartRank(value: unknown): value is ChartRank {
  return isMember(value, UP_CARDS);
}

// ---------------------------------------------------------------------------
// Field by field
// ---------------------------------------------------------------------------

function flag(value: unknown, field: string, fallback: boolean, note: Note): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  note(field, reasonFor(value, 'malformed'));
  return fallback;
}

function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  fallback: T,
  note: Note,
): T {
  if (isMember(value, allowed)) {
    return value;
  }
  note(field, reasonFor(value, typeof value === 'string' ? 'unknown-value' : 'malformed'));
  return fallback;
}

function numberChoice<T extends number>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  fallback: T,
  note: Note,
): T {
  if (isNumberMember(value, allowed)) {
    return value;
  }
  note(field, reasonFor(value, typeof value === 'number' ? 'unknown-value' : 'malformed'));
  return fallback;
}

function countOr(value: unknown, field: string, fallback: number, note: Note): number {
  const count = countOf(value);
  if (count !== null) {
    return count;
  }
  note(field, reasonFor(value, typeof value === 'number' ? 'out-of-range' : 'malformed'));
  return fallback;
}

/**
 * SPEC 13's best chip balance, and SPEC 6's unlock mark with it.
 *
 * **The loader is the only caller of `createWallet` with a persisted mark, and
 * `createWallet` throws on a bad one by contract.** So the predicate is here,
 * ahead of it, and it is the wallet's own sentence: a whole number of chips at
 * or above the starting bankroll. A mark below 1,000 is not merely unusual, it
 * is unreachable, because the balance starts at 1,000 and the mark only ever
 * rises. `tests/unit/storage-corrupt.test.ts` binds the two by requiring every
 * value this function returns to be one `createWallet` accepts, over the whole
 * corrupt matrix, so the predicate cannot drift from the contract it exists to
 * satisfy.
 */
function markOf(value: unknown, note: Note): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= STARTING_CHIPS) {
    return value;
  }
  note('bestBalance', reasonFor(value, typeof value === 'number' ? 'out-of-range' : 'malformed'));
  return STARTING_CHIPS;
}

/** SPEC 13's selected table. SPEC 6 names three and there is no fourth. */
function seatOf(value: unknown, note: Note): TableId {
  if (typeof value === 'string' && isTableId(value)) {
    return value;
  }
  note('table', reasonFor(value, typeof value === 'string' ? 'unknown-value' : 'malformed'));
  return LOWEST_TABLE.id;
}

function volumeOf(value: unknown, note: Note): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_VOLUME &&
    value <= MAX_VOLUME
  ) {
    return value;
  }
  note('settings.volume', reasonFor(value, typeof value === 'number' ? 'out-of-range' : 'malformed'));
  return DEFAULT_VOLUME;
}

// ---------------------------------------------------------------------------
// SPEC 11's counters and SPEC 9's milestones
// ---------------------------------------------------------------------------

/**
 * One counter scope. SPEC 11's five tallies.
 *
 * **The scope defaults whole, and that is the salvage boundary.**
 * `statistics.ts` states `handsPlayed === wins + losses + pushes` as an identity
 * rather than a coincidence, so a scope where it does not hold is not four good
 * numbers and one bad one: there is no way to know which of the five moved.
 * `blackjacks` is outside that identity by design, since a natural that met a
 * dealer natural is a push and a blackjack at once, so it is bounded separately.
 */
function countersOf(value: unknown, field: string, note: Note): Counters {
  if (!isRecord(value)) {
    note(field, reasonFor(value, 'malformed'));
    return NO_COUNTERS;
  }
  const handsPlayed = countOf(value['handsPlayed']);
  const wins = countOf(value['wins']);
  const losses = countOf(value['losses']);
  const pushes = countOf(value['pushes']);
  const blackjacks = countOf(value['blackjacks']);
  if (
    handsPlayed === null ||
    wins === null ||
    losses === null ||
    pushes === null ||
    blackjacks === null
  ) {
    note(field, 'malformed');
    return NO_COUNTERS;
  }
  if (wins + losses + pushes !== handsPlayed || blackjacks > handsPlayed) {
    note(field, 'inconsistent');
    return NO_COUNTERS;
  }
  return Object.freeze({ handsPlayed, wins, losses, pushes, blackjacks });
}

/**
 * SPEC 9's awarded list. Eleven ids, each at most once, in award order.
 *
 * Salvaged per entry rather than whole: an id SPEC 9 does not name is dropped
 * and the ones beside it are kept, because SPEC 9 calls a milestone permanent
 * and taking ten real awards away over one unreadable name would be the loss
 * item `I2` exists to prevent. Order is preserved because it is award order and
 * SPEC 9 gives no other.
 */
function milestonesOf(value: unknown, note: Note): readonly MilestoneId[] {
  const field = 'statistics.milestones';
  if (!isList(value)) {
    note(field, reasonFor(value, 'malformed'));
    return Object.freeze([]);
  }
  const kept: MilestoneId[] = [];
  for (const entry of value) {
    if (!isMember(entry, MILESTONES)) {
      note(field, 'unknown-value');
      continue;
    }
    if (kept.includes(entry)) {
      note(field, 'inconsistent');
      continue;
    }
    kept.push(entry);
  }
  return Object.freeze(kept);
}

function statisticsOf(value: unknown, note: Note): Statistics {
  if (!isRecord(value)) {
    note('statistics', reasonFor(value, 'malformed'));
    return NO_STATISTICS;
  }
  return Object.freeze({
    session: countersOf(value['session'], 'statistics.session', note),
    lifetime: countersOf(value['lifetime'], 'statistics.lifetime', note),
    streak: countOr(value['streak'], 'statistics.streak', 0, note),
    rounds: countOr(value['rounds'], 'statistics.rounds', 0, note),
    milestones: milestonesOf(value['milestones'], note),
    belowLowWater: flag(value['belowLowWater'], 'statistics.belowLowWater', false, note),
  });
}

/**
 * SPEC 7's two counters for one scope.
 *
 * `matched > decisions` is the inconsistency that matters here: SPEC 9 row 10
 * awards at 90 percent over 100 decisions, so a document claiming more matches
 * than decisions would award it on a scope that never happened.
 */
function accuracyOf(value: unknown, field: string, note: Note): CoachAccuracy {
  if (!isRecord(value)) {
    note(field, reasonFor(value, 'malformed'));
    return NO_DECISIONS.session;
  }
  const decisions = countOf(value['decisions']);
  const matched = countOf(value['matched']);
  if (decisions === null || matched === null) {
    note(field, 'malformed');
    return NO_DECISIONS.session;
  }
  if (matched > decisions) {
    note(field, 'inconsistent');
    return NO_DECISIONS.session;
  }
  return Object.freeze({ decisions, matched });
}

function coachOf(value: unknown, note: Note): CoachRecord {
  if (!isRecord(value)) {
    note('coach', reasonFor(value, 'malformed'));
    return NO_DECISIONS;
  }
  return Object.freeze({
    session: accuracyOf(value['session'], 'coach.session', note),
    lifetime: accuracyOf(value['lifetime'], 'coach.lifetime', note),
  });
}

// ---------------------------------------------------------------------------
// SPEC 8's hand history
// ---------------------------------------------------------------------------

function cardOf(value: unknown): Card | null {
  if (!isRecord(value)) {
    return null;
  }
  const rank = value['rank'];
  const suit = value['suit'];
  if (!isMember(rank, RANKS) || !isMember(suit, SUITS)) {
    return null;
  }
  return Object.freeze({ rank, suit });
}

function cardsOf(value: unknown): readonly Card[] | null {
  if (!isList(value)) {
    return null;
  }
  const cards: Card[] = [];
  for (const entry of value) {
    const card = cardOf(entry);
    if (card === null) {
      return null;
    }
    cards.push(card);
  }
  return Object.freeze(cards);
}

function actionsOf(value: unknown): readonly PlayerAction[] | null {
  if (!isList(value)) {
    return null;
  }
  const actions: PlayerAction[] = [];
  for (const entry of value) {
    if (!isMember(entry, PLAYER_ACTIONS)) {
      return null;
    }
    actions.push(entry);
  }
  return Object.freeze(actions);
}

function coachActionsOf(value: unknown): readonly CoachAction[] | null {
  if (!isList(value)) {
    return null;
  }
  const actions: CoachAction[] = [];
  for (const entry of value) {
    if (!isCoachAction(entry)) {
      return null;
    }
    actions.push(entry);
  }
  return Object.freeze(actions);
}

/** SPEC 7's cell address, as `strategy.ts`'s three-armed union. */
function addressOf(value: unknown): CellAddress | null {
  if (!isRecord(value)) {
    return null;
  }
  const surface = value['surface'];
  const up = value['up'];
  if (!isChartRank(up)) {
    return null;
  }
  if (surface === 'hard' || surface === 'soft') {
    const total = integerOf(value['total']);
    if (total === null) {
      return null;
    }
    const cell: CellAddress =
      surface === 'hard'
        ? { surface: 'hard', total, up }
        : { surface: 'soft', total, up };
    return Object.freeze(cell);
  }
  if (surface === 'pair') {
    const pair = value['pair'];
    if (!isChartRank(pair)) {
      return null;
    }
    const cell: CellAddress = { surface: 'pair', pair, up };
    return Object.freeze(cell);
  }
  return null;
}

function verdictOf(value: unknown): CoachVerdict | null {
  if (!isRecord(value)) {
    return null;
  }
  const played = value['played'];
  const recommended = value['recommended'];
  const matched = value['matched'];
  const preference = coachActionsOf(value['preference']);
  const address = addressOf(value['address']);
  if (!isCoachAction(played) || !isCoachAction(recommended) || typeof matched !== 'boolean') {
    return null;
  }
  if (preference === null || address === null) {
    return null;
  }
  return Object.freeze({ played, recommended, matched, preference, address });
}

/**
 * SPEC 8's "the coach verdict if the coach was on".
 *
 * Three answers rather than two, because `null` is a legitimate stored value
 * meaning the coach was off for that round, which `history.ts` is explicit is a
 * different sentence from an empty list. `undefined` is this function's way of
 * saying the field is unreadable, and it is what drops the entry.
 */
function verdictsOfEntry(value: unknown): readonly CoachVerdict[] | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isList(value)) {
    return undefined;
  }
  const verdicts: CoachVerdict[] = [];
  for (const entry of value) {
    const verdict = verdictOf(entry);
    if (verdict === null) {
      return undefined;
    }
    verdicts.push(verdict);
  }
  return Object.freeze(verdicts);
}

function handOf(value: unknown): HistoryHand | null {
  if (!isRecord(value)) {
    return null;
  }
  const cards = cardsOf(value['cards']);
  const total = countOf(value['value']);
  const wager = countOf(value['wager']);
  const outcome = value['outcome'];
  const rung = value['rung'];
  const delta = integerOf(value['delta']);
  if (cards === null || total === null || wager === null || delta === null) {
    return null;
  }
  if (!isOutcome(outcome) || !isRung(rung)) {
    return null;
  }
  return Object.freeze({ cards, value: total, wager, outcome, rung, delta });
}

/** SPEC 4.6 plays at least one hand per round, so an empty list is not a round. */
function handsOf(value: unknown): readonly HistoryHand[] | null {
  if (!isList(value) || value.length === 0) {
    return null;
  }
  const hands: HistoryHand[] = [];
  for (const entry of value) {
    const hand = handOf(entry);
    if (hand === null) {
      return null;
    }
    hands.push(hand);
  }
  return Object.freeze(hands);
}

/**
 * One SPEC 8 entry, whole or not at all.
 *
 * SPEC 8 lists seven field groups and calls the list reviewable; an entry
 * missing one of them is not a shorter entry, it is a row that cannot be read,
 * so it is dropped and its neighbours are kept. That is the salvage boundary for
 * the history, and it is one level finer than the whole field.
 */
function entryOf(value: unknown, field: string, note: Note): HistoryEntry | null {
  if (!isRecord(value)) {
    note(field, reasonFor(value, 'malformed'));
    return null;
  }
  const hands = handsOf(value['hands']);
  const dealer = cardsOf(value['dealer']);
  const dealerValue = countOf(value['dealerValue']);
  const actions = actionsOf(value['actions']);
  const wager = countOf(value['wager']);
  const delta = integerOf(value['delta']);
  const coach = verdictsOfEntry(value['coach']);
  if (hands === null || dealer === null || dealerValue === null || actions === null) {
    note(field, 'malformed');
    return null;
  }
  if (wager === null || delta === null || coach === undefined) {
    note(field, 'malformed');
    return null;
  }
  return Object.freeze({ hands, dealer, dealerValue, actions, wager, delta, coach });
}

/**
 * SPEC 8's list. Newest first, and never longer than `HISTORY_LIMIT`.
 *
 * A list longer than 50 is truncated rather than discarded, and the front is
 * what survives: SPEC 8 keeps "the last 50 completed rounds" and `history.ts`
 * puts the newest at index 0, so the first 50 are exactly the ones SPEC 8 asks
 * for and the tail is what a longer document was holding beyond the rule.
 */
function historyOf(value: unknown, note: Note): History {
  if (!isList(value)) {
    note('history', reasonFor(value, 'malformed'));
    return NO_HISTORY;
  }
  const source = value.length > HISTORY_LIMIT ? value.slice(0, HISTORY_LIMIT) : value;
  if (value.length > HISTORY_LIMIT) {
    note('history', 'too-long');
  }
  const kept: HistoryEntry[] = [];
  source.forEach((raw, index) => {
    const entry = entryOf(raw, `history[${String(index)}]`, note);
    if (entry !== null) {
      kept.push(entry);
    }
  });
  return Object.freeze(kept);
}

// ---------------------------------------------------------------------------
// SPEC 14's settings, and the whole document
// ---------------------------------------------------------------------------

function splitRuleOf(value: unknown, note: Note): SplitRule {
  if (unionMember(SPLIT_RULES, value)) {
    return value;
  }
  note(
    'settings.rules.splitRule',
    reasonFor(value, typeof value === 'string' ? 'unknown-value' : 'malformed'),
  );
  return DEFAULT_RULES.splitRule;
}

function rulesOf(value: unknown, note: Note): HouseRules {
  if (!isRecord(value)) {
    note('settings.rules', reasonFor(value, 'malformed'));
    return DEFAULT_RULES;
  }
  return Object.freeze({
    decks: numberChoice<DeckCount>(
      value['decks'],
      DECK_COUNTS,
      'settings.rules.decks',
      DEFAULT_RULES.decks,
      note,
    ),
    doubleAfterSplit: flag(
      value['doubleAfterSplit'],
      'settings.rules.doubleAfterSplit',
      DEFAULT_RULES.doubleAfterSplit,
      note,
    ),
    surrender: flag(value['surrender'], 'settings.rules.surrender', DEFAULT_RULES.surrender, note),
    evenMoney: flag(value['evenMoney'], 'settings.rules.evenMoney', DEFAULT_RULES.evenMoney, note),
    splitRule: splitRuleOf(value['splitRule'], note),
  });
}

function settingsOf(value: unknown, note: Note): Settings {
  if (!isRecord(value)) {
    note('settings', reasonFor(value, 'malformed'));
    return DEFAULT_SETTINGS;
  }
  return Object.freeze({
    rules: rulesOf(value['rules'], note),
    coach: choice(value['coach'], COACH_MODES, 'settings.coach', DEFAULT_COACH_MODE, note),
    speed: choice(value['speed'], SPEEDS, 'settings.speed', DEFAULT_SPEED, note),
    surfaceSize: numberChoice<SurfaceSize>(
      value['surfaceSize'],
      SURFACE_SIZES,
      'settings.surfaceSize',
      DEFAULT_SURFACE_SIZE,
      note,
    ),
    muted: flag(value['muted'], 'settings.muted', DEFAULT_MUTED, note),
    volume: volumeOf(value['volume'], note),
    theme: choice(value['theme'], THEMES, 'settings.theme', DEFAULT_THEME, note),
    reducedMotion: choice(
      value['reducedMotion'],
      MOTION_SETTINGS,
      'settings.reducedMotion',
      DEFAULT_REDUCED_MOTION,
      note,
    ),
  });
}

/**
 * Read a parsed payload defensively. SPEC 18, item `I2`.
 *
 * Total: every input produces a complete `GameDocument`, and nothing here
 * throws. What could not be read is replaced by the default the spec states and
 * recorded as a `Repair`, so the caller can say what was lost and the next
 * successful write puts the repaired document back in storage.
 */
export function sanitiseDocument(value: unknown): SanitisedDocument {
  const repairs: Repair[] = [];
  const note: Note = (field, reason) => {
    repairs.push(Object.freeze({ field, reason }));
  };

  if (!isRecord(value)) {
    note('', 'not-a-document');
    return Object.freeze({ document: DEFAULT_DOCUMENT, repairs: Object.freeze(repairs) });
  }

  const document: GameDocument = Object.freeze({
    bestBalance: markOf(value['bestBalance'], note),
    table: seatOf(value['table'], note),
    statistics: statisticsOf(value['statistics'], note),
    coach: coachOf(value['coach'], note),
    history: historyOf(value['history'], note),
    settings: settingsOf(value['settings'], note),
    howToPlaySeen: flag(value['howToPlaySeen'], 'howToPlaySeen', false, note),
  });

  return Object.freeze({ document, repairs: Object.freeze(repairs) });
}
