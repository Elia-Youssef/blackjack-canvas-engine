/**
 * SPEC 13's load, save and reset, over the store seam. Items `I1`, `I2` and
 * `I3` at `BJ-11`, QUALITY-BAR sections 8 and 12, SPEC 18.
 *
 * **Every store call in the game goes through this file, and every one of them
 * sits inside a `try` whose binding is read.** QUALITY-BAR section 12 forbids a
 * bare `catch {}`, and both failures it names are here: a read that throws takes
 * the defaults, and a write that throws leaves the in-memory document
 * authoritative and degrades only the carry across sessions. The handlers are
 * here rather than inside the adapter in `store.ts` so that a fabricated
 * throwing store in a unit test exercises the same handler a blocked browser
 * does.
 *
 * **The in-memory document is authoritative from the moment it is set.** `save`
 * replaces it before it attempts the write, so a `QuotaExceededError` on the way
 * out cannot roll a value back. Item `I3`: "the in-memory value stays
 * authoritative and only the cross-session carry degrades." Nothing here returns
 * a failure the caller has to act on: `SaveResult` exists so a readout can say
 * the carry is degraded, and the next write retries naturally because every
 * write sends the whole document.
 *
 * **The loader is the one place three core contracts are honoured**, and each
 * would be a silent defect anywhere else:
 *
 *   1. **`createWallet` throws on a bad persisted mark, by contract.** It is
 *      called here and nowhere else with a stored figure, and `document.ts`
 *      sanitises the mark first. The corrupt matrix in
 *      `tests/unit/storage-corrupt.test.ts` requires every mark this loader
 *      produces to be one the wallet accepts.
 *   2. **A loaded `Statistics` document must have a session opened on it.**
 *      `BJ-10` left this as a binding handoff and the reason is SPEC 9 row 11:
 *      `belowLowWater` is a session latch, and a document carrying it into a
 *      launch that starts at 1,000 chips satisfies "recovered to the starting
 *      amount" on the very first round the player finishes. `statistics.rounds`
 *      is the second half: `observeRound` refuses a round that is not the one
 *      after the record's, so a restored count of 240 against a table starting
 *      at zero throws on the first boundary. `openDocumentSession` clears both
 *      and keeps the lifetime tallies and the milestones, which is SPEC 13's
 *      sentence exactly.
 *   3. **The seat comes from `launchTable`.** SPEC 13 starts a launch at the
 *      persisted table and names a fallback; the persisted table and the
 *      persisted mark are two independently salvaged fields, so the pair can be
 *      inconsistent even when neither is corrupt, and `launchTable` is the
 *      function SPEC 13 gives for exactly that.
 *
 * **Two tabs on the one key are merged at the write, and the monotone fields
 * cannot go backwards.** `AUDIT-2`, finding `J3-01`. Each tab still loads the
 * document once at construction and holds it in memory, and last-writer-wins on
 * whole documents was the earlier design: a second tab that merely went hidden
 * wrote the document it had booted with over whatever the first had since
 * achieved, which measured as the best chip balance falling from 1,100 to
 * 1,000, the lifetime tallies and the hand history going to zero, and SPEC 6
 * re-locking a table the player had earned, all from one press of a settings
 * button in a tab that had played nothing. SPEC 13 says lifetime statistics
 * accumulate and SPEC 6 keys the unlocks to a high-water mark, so both
 * sentences were being violated rather than merely stretched, and QUALITY-BAR
 * section 8's best-effort framing is about storage failing, not about the game
 * destroying its own record.
 *
 * So `save` re-reads the key through `loadDocument`, the same sanitising path a
 * launch uses, and hands both documents to `mergeDocuments`, which takes the
 * maximum of everything that only rises and this session's own values for
 * everything that is a choice. Three consequences are worth stating:
 *
 *   1. **The cost is one `getItem` and one parse per save**, and there are two
 *      save points, a round boundary and a setting change, plus the write on
 *      the way out of sight.
 *   2. **Another tab's bytes are never trusted.** The re-read goes through the
 *      envelope, the migration walk and `sanitiseDocument`, so a corrupt or
 *      hand-edited document merges as the salvaged one and is then overwritten
 *      by the merged result, which is SPEC 18's own sentence.
 *   3. **The in-memory document is still authoritative and still moves first**:
 *      `current` becomes the merged document before the write is attempted, so
 *      a `QuotaExceededError` on the way out cannot roll a value back.
 *
 * `tests/unit/storage-merge.test.ts` drives the policy field by field and
 * `tests/browser/two-tabs.spec.ts` drives two real tabs over the built page.
 *
 * **The chip balance is not here, and cannot be.** SPEC 13 does not persist one,
 * `GameDocument` has no field for it, and the wallet this file builds starts at
 * `STARTING_CHIPS` because that is what `createWallet` does. Item `I4` at
 * `BJ-20` grades the launch in a browser.
 *
 * No canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { History } from '../core/history';
import type { Statistics } from '../core/statistics';
import type { CoachRecord } from '../core/strategy';
import type { LaunchChoice, Wallet, WalletOptions } from '../core/wallet';
import { createWallet, launchTable } from '../core/wallet';

import type { GameDocument, Repair, Settings } from './document';
import {
  DEFAULT_DOCUMENT,
  STORAGE_KEY,
  mergeDocuments,
  openDocumentSession,
  sanitiseDocument,
} from './document';
import type { MigrationOptions } from './migrations';
import { migrate, readEnvelope, sealEnvelope } from './migrations';
import type { KeyValueStore, StorageSource, StoreFailure, StoreProbe } from './store';
import { browserStorage, describeFailure, probeStore } from './store';

// ---------------------------------------------------------------------------
// What a load did
// ---------------------------------------------------------------------------

/** Where the document in hand came from. Item `I2`'s report. */
export type LoadSource =
  /** Nothing was stored: a first launch, or a browser that cleared it. */
  | 'absent'
  /** A document at this build's version. */
  | 'stored'
  /** An older document, walked forward. Item `I1`. */
  | 'migrated'
  /** Something was stored and none of it could be interpreted. */
  | 'discarded'
  /** The store threw on the read. */
  | 'unreadable';

/** What the load found, for a readout and for a test. */
export interface LoadReport {
  readonly source: LoadSource;
  /** Every value replaced by a default, in the order they were found. */
  readonly repairs: readonly Repair[];
  /** The version walked forward from, or `null` when nothing was walked. */
  readonly migratedFrom: number | null;
  /** The read failure, when the store threw. `null` otherwise. */
  readonly failure: StoreFailure | null;
}

/** A write that landed, or the failure that stopped it. */
export type SaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: StoreFailure };

/** What a load produced. */
export interface LoadedDocument {
  readonly document: GameDocument;
  readonly report: LoadReport;
}

function defaulted(
  source: LoadSource,
  repairs: readonly Repair[],
  failure: StoreFailure | null,
): LoadedDocument {
  return Object.freeze({
    document: DEFAULT_DOCUMENT,
    report: Object.freeze({
      source,
      repairs: Object.freeze([...repairs]),
      migratedFrom: null,
      failure,
    }),
  });
}

/**
 * Read the one document, defensively. SPEC 18, items `I1` and `I2`.
 *
 * Total: every store, every stored string and every parsed shape produces a
 * complete `GameDocument`, and nothing on this path throws. The four ways a
 * document can fail whole are the four early returns, and everything past them
 * is `document.ts`'s field-by-field salvage.
 *
 * Exported separately from `createPersistence` because it is the half with no
 * state: a test can drive it over a corrupt matrix without building a session,
 * and `createPersistence` is then the thin thing that remembers the answer.
 *
 * **`options` is the migration seam, and it is here so the loader's own bump
 * path is exercised before there is a bump.** It is `migrate`'s own option
 * shape, forwarded unchanged, so nothing new is expressible through it. Left
 * out, the three lines below that turn a walked payload into a `migrated`
 * report with a `migratedFrom` version would run for the very first time on the
 * day a real schema bump shipped, against a live player's document, which is
 * the one moment they must not be running for the first time. `BJ-19`'s
 * composition root passes nothing and gets `DOCUMENT_VERSION` and `MIGRATIONS`,
 * which is what a real bump will already have moved.
 */
export function loadDocument(
  store: KeyValueStore,
  options: MigrationOptions = {},
): LoadedDocument {
  let text: string | null;
  try {
    text = store.read(STORAGE_KEY);
  } catch (error) {
    // Typed and read. A store that refuses the read is the same case as one
    // the probe never got: the game starts on defaults.
    const failure = describeFailure('read', error);
    return defaulted('unreadable', [Object.freeze({ field: '', reason: 'unreadable' })], failure);
  }

  if (text === null) {
    // Not a repair. A first launch has nothing stored and nothing was lost.
    return defaulted('absent', [], null);
  }

  const envelope = readEnvelope(text);
  if (!envelope.ok) {
    return defaulted('discarded', [Object.freeze({ field: '', reason: envelope.reason })], null);
  }

  const walked = migrate(envelope.envelope, options);
  if (!walked.ok) {
    return defaulted('discarded', [Object.freeze({ field: '', reason: walked.reason })], null);
  }

  const sanitised = sanitiseDocument(walked.data);
  return Object.freeze({
    // SPEC 13's session scope, opened on the way in. See the header, point 2.
    document: openDocumentSession(sanitised.document),
    report: Object.freeze({
      source: walked.steps > 0 ? 'migrated' : 'stored',
      repairs: sanitised.repairs,
      migratedFrom: walked.steps > 0 ? walked.from : null,
      failure: null,
    }),
  });
}

/**
 * Write the one document. Item `I3`'s second half.
 *
 * The envelope is sealed at this build's version and the session scope is
 * projected out, so what reaches storage is SPEC 13's persisted set and nothing
 * else. A throw is caught, described and returned; it is never propagated,
 * because SPEC 18 says a failed write must not interrupt a round.
 */
export function saveDocument(store: KeyValueStore, document: GameDocument): SaveResult {
  try {
    store.write(STORAGE_KEY, JSON.stringify(sealEnvelope(openDocumentSession(document))));
    return Object.freeze({ ok: true });
  } catch (error) {
    // Typed and read: `QuotaExceededError` is the one QUALITY-BAR section 8
    // names, and its name is what the readout carries.
    return Object.freeze({ ok: false, failure: describeFailure('write', error) });
  }
}

// ---------------------------------------------------------------------------
// The restored session
// ---------------------------------------------------------------------------

/**
 * What a launch is handed. SPEC 13, and item `I4`'s subject at `BJ-20`.
 *
 * A wallet rather than a number, because `createWallet` is the only thing that
 * can hold a high-water mark and the loader is the only caller allowed to give
 * it a persisted one. The four read-through fields are on the document too; they
 * are repeated here so a composition root wiring up a table, a coach and an
 * overlay does not have to know which of them came from where.
 */
export interface RestoredSession {
  /** The document these were built from, already session-opened. */
  readonly document: GameDocument;
  /** SPEC 4.11's 1,000 chips, carrying SPEC 6's persisted unlock mark. */
  readonly wallet: Wallet;
  /** SPEC 13's seat, through the fallback SPEC 13 names. */
  readonly launch: LaunchChoice;
  /** SPEC 11's counters, with the session scope opened. */
  readonly statistics: Statistics;
  /** SPEC 7's accuracy, with the session scope opened. */
  readonly coach: CoachRecord;
  /** SPEC 8's last 50 rounds. */
  readonly history: History;
  /** SPEC 14's panel. */
  readonly settings: Settings;
  /** SPEC 17's dismissal. */
  readonly howToPlaySeen: boolean;
}

/**
 * The `exactOptionalPropertyTypes` seam on `WalletOptions`.
 *
 * `{ bestBalance: undefined }` is not the same as `{}` under that flag: the
 * wallet's `options.bestBalance ?? STARTING_CHIPS` would read the first as a
 * missing mark while the type system refuses to accept it at all. One helper, so
 * a caller with no mark still has a legal call and the trap is written down once.
 */
export function walletOptionsFor(mark: number | undefined): WalletOptions {
  return mark === undefined ? {} : { bestBalance: mark };
}

/** Build a launch out of a document that has been sanitised and session-opened. */
function restoreFrom(document: GameDocument): RestoredSession {
  return Object.freeze({
    document,
    wallet: createWallet(walletOptionsFor(document.bestBalance)),
    launch: launchTable(document.table, document.bestBalance),
    statistics: document.statistics,
    coach: document.coach,
    history: document.history,
    settings: document.settings,
    howToPlaySeen: document.howToPlaySeen,
  });
}

// ---------------------------------------------------------------------------
// The one object the composition root holds
// ---------------------------------------------------------------------------

/** What the game can say about its own storage. Item `I3`'s degradation value. */
export interface PersistenceReadout {
  /** True when the startup probe found the platform's own store. */
  readonly durable: boolean;
  /**
   * True when nothing written now will be there next session: either the probe
   * fell back to memory, or the most recent write threw. It goes back to false
   * when a write lands, because every write sends the whole document.
   */
  readonly carryDegraded: boolean;
  /** Writes that landed. */
  readonly writes: number;
  /** Writes and removes that threw. */
  readonly failedWrites: number;
  /** Why the probe fell back, or `null` when it did not. */
  readonly probeFailure: StoreFailure | null;
  /** The most recent read, write or remove failure, or `null`. */
  readonly lastFailure: StoreFailure | null;
  /** What the load found. */
  readonly load: LoadReport;
}

/**
 * SPEC 13's persistence, as the composition root holds it.
 *
 * **Five of the seven are the shipped page's, and two are test-facing seams.**
 * `restored()`, `save()`, `resetAll()`, `stored()` and `readout()` are what
 * `src/main.ts` calls. `document()` and `update()` are consumed by
 * `tests/unit/storage-migration.test.ts` and `tests/unit/storage-corrupt.test.ts`
 * and by nothing under `src/`: the root assembles the whole document from the
 * live session at every save rather than patching a held one, deliberately, so
 * the patch form is a convenience for a test that wants one field moved.
 * Named here rather than deleted, so the surface reads as what it is.
 */
export interface Persistence {
  /** The degradation, for the settings panel and for a test. */
  readout(): PersistenceReadout;
  /** The authoritative in-memory document. A test-facing seam. */
  document(): GameDocument;
  /**
   * The document as the store holds it right now, salvaged. `AUDIT-2`.
   *
   * The one re-read in the project, and it is a re-read on purpose: the whole
   * point is to see what another tab has written since this one booted. It goes
   * through `loadDocument`, so nothing here is trusted, and it is total: a
   * store that throws, an absent key and an unsalvageable document all answer
   * with the defaults rather than raising.
   *
   * `save` uses it for the merge. The composition root uses it from its
   * `storage` listener, which fires only in the tabs that did not write, to
   * fold the same monotone fields into the live session.
   */
  stored(): GameDocument;
  /**
   * The launch this load produced. Rebuilt only by `resetAll`.
   *
   * Named `restored` and not `session`, because `Game.session()` in
   * `src/main.ts` is a different shape with a different lifetime, the live
   * settings set rebuilt on every call, and the composition root holds both.
   */
  restored(): RestoredSession;
  /** Replace the document and try to write it. */
  save(next: GameDocument): SaveResult;
  /** Replace some of the document and try to write it. A test-facing seam. */
  update(patch: Partial<GameDocument>): SaveResult;
  /**
   * SPEC 14's Reset all data, and SPEC 8's "cleared only by a full data reset".
   * The stored document is removed and the in-memory state goes back to
   * defaults, including a fresh wallet at the starting mark. Item `I5` at
   * `BJ-20` puts the confirmation in front of it; nothing here is wired to a
   * control.
   */
  resetAll(): SaveResult;
}

/**
 * Hold one loaded document over one store. Items `I1`, `I2` and `I3`.
 *
 * The launch load happens here, once, at construction: SPEC 13 reads the
 * document at launch, and the session that is built from it, the wallet, the
 * seat and the settings, is built from that one answer. The later reads `save`
 * and `stored` perform are a different question, "what has another tab written
 * since", and they answer it without rebuilding anything: `restored` is
 * replaced by `resetAll` alone, for the reason its own comment gives.
 */
export function createPersistence(probe: StoreProbe): Persistence {
  const loaded = loadDocument(probe.store);
  let current: GameDocument = loaded.document;
  let restored: RestoredSession = restoreFrom(current);
  let writes = 0;
  let failedWrites = 0;
  let carryFailing = false;
  let lastFailure: StoreFailure | null = loaded.report.failure;

  function record(result: SaveResult): SaveResult {
    if (result.ok) {
      writes += 1;
      // The carry is healthy again. A write sends the whole document, so one
      // that lands has already made up for every one that did not: this is what
      // item `I3` means by retrying on the next write naturally.
      carryFailing = false;
    } else {
      failedWrites += 1;
      carryFailing = true;
      lastFailure = result.failure;
    }
    return result;
  }

  function stored(): GameDocument {
    return loadDocument(probe.store).document;
  }

  function save(next: GameDocument): SaveResult {
    // The re-read is immediately before the write and after everything the
    // caller assembled, so the window in which another tab could land a write
    // this one misses is the two statements below rather than the whole session.
    // The platform store is synchronous and one key is written whole, so there
    // is no torn document to read; what is at stake is only which whole document
    // wins, and the merge is what decides that.
    const merged = mergeDocuments(stored(), next);
    // Authoritative first, written second. A write that throws below cannot
    // take this assignment back, which is item `I3` in one line.
    current = merged;
    return record(saveDocument(probe.store, merged));
  }

  function update(patch: Partial<GameDocument>): SaveResult {
    return save(Object.freeze({ ...current, ...patch }));
  }

  function resetAll(): SaveResult {
    // In memory first, for the reason `save` puts its assignment first: a
    // remove that throws must still leave the session cleared.
    current = DEFAULT_DOCUMENT;
    restored = restoreFrom(current);
    try {
      probe.store.remove(STORAGE_KEY);
      carryFailing = false;
      return Object.freeze({ ok: true });
    } catch (error) {
      // Typed and read, per QUALITY-BAR section 12.
      const failure = describeFailure('remove', error);
      failedWrites += 1;
      carryFailing = true;
      lastFailure = failure;
      return Object.freeze({ ok: false, failure });
    }
  }

  return Object.freeze({
    readout(): PersistenceReadout {
      return Object.freeze({
        durable: probe.durable,
        carryDegraded: !probe.durable || carryFailing,
        writes,
        failedWrites,
        probeFailure: probe.failure,
        lastFailure,
        load: loaded.report,
      });
    },
    document(): GameDocument {
      return current;
    },
    stored,
    /**
     * The launch, and deliberately not rebuilt on every save.
     *
     * The wallet handed out here is the one the round is being played on, so
     * rebuilding it when the document is written would put the balance back to
     * 1,000 mid-session. Only `resetAll` replaces it, because that is the one
     * operation whose whole point is that everything starts again.
     */
    restored(): RestoredSession {
      return restored;
    },
    save,
    update,
    resetAll,
  });
}

/**
 * Probe the platform and load, in one call. The composition root's entry point.
 *
 * The default source is the property access QUALITY-BAR section 8 warns about,
 * and `probeStore` is what makes it safe. A test passes its own source, which is
 * how the `SecurityError` path is driven with no browser.
 */
export function openPersistence(source: StorageSource = browserStorage): Persistence {
  return createPersistence(probeStore(source));
}
