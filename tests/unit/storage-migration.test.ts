/**
 * Item I1, severity Major, 9 points.
 *
 *   "Saved state is a single namespaced versioned document, and a version bump
 *    migrates losslessly where possible and discards cleanly where not."
 *
 * QUALITY-BAR section 8. Every clause is driven below in the order the criterion
 * states them: one document, namespaced, versioned, walked forward where the
 * steps exist, discarded cleanly where they do not.
 *
 * **The walk is real and the versions are fixtures.** `DOCUMENT_VERSION` is 1 in
 * this build and `MIGRATIONS` is therefore empty, so there is no shipped bump to
 * drive. Inventing one would be a migration that exists only for this file to
 * run. What is driven instead is the shipped `migrate`, with a synthetic target
 * version and a synthetic step map passed in through the parameters it already
 * takes: the from-version lookup, the one-version-at-a-time walk, the missing
 * step and the future-version policy are all production code, and nothing in
 * `src/` exists for this file's benefit.
 *
 * **Two controls, each blind to one half of the criterion.** "Migrates" and
 * "one version at a time" are separate claims and a walk missing either answers
 * correctly for every input that does not exercise it. A **version-blind**
 * reader, which hands back whatever was stored, is right about a document
 * already at the target and wrong about every other case. A **skip-ahead**
 * walker, which applies only the last step, is right about a document one
 * version behind and wrong about one that is two behind. Both are run beside the
 * real walk over the same matrix and each is required to disagree on exactly its
 * own derived set.
 *
 * **What this file does not claim.** The corrupt-value matrix and the boot path
 * are item `I2` in `tests/unit/storage-corrupt.test.ts`. The probe and the write
 * failures are item `I3` in `tests/unit/storage-write-failure.test.ts`. That the
 * chip balance is not persisted and a fresh launch starts at 1,000 is item `I4`
 * at `BJ-20`, in a browser, and the settings control that clears everything is
 * item `I5` there.
 */

import { describe, expect, it } from 'vitest';

import { NO_HISTORY } from '../../src/core/history';
import { DEFAULT_RULES } from '../../src/core/rules';
import { NO_STATISTICS } from '../../src/core/statistics';
import { NO_DECISIONS } from '../../src/core/strategy';
import { STARTING_CHIPS } from '../../src/core/wallet';
import type { GameDocument } from '../../src/storage/document';
import {
  DEFAULT_DOCUMENT,
  DEFAULT_SETTINGS,
  DOCUMENT_VERSION,
  MIN_DOCUMENT_VERSION,
  STORAGE_GAME,
  STORAGE_KEY,
  STORAGE_NAMESPACE,
  sanitiseDocument,
} from '../../src/storage/document';
import type { Envelope, Migration, MigrationResult } from '../../src/storage/migrations';
import { MIGRATIONS, migrate, readEnvelope, sealEnvelope } from '../../src/storage/migrations';
import { createPersistence, loadDocument } from '../../src/storage/persistence';
import type { KeyValueStore } from '../../src/storage/store';
import { createMemoryStore, probeStore } from '../../src/storage/store';

import { envelopeText, reachesBetting, storeHolding } from './support/storage-fixtures';

// ---------------------------------------------------------------------------
// A store that remembers which keys were touched
// ---------------------------------------------------------------------------

interface RecordingStore extends KeyValueStore {
  /** Every key ever written, in first-write order. */
  keys(): readonly string[];
  /** How many keys currently hold a value. */
  size(): number;
}

function recordingStore(): RecordingStore {
  const entries = new Map<string, string>();
  const written: string[] = [];
  return {
    read(key: string): string | null {
      return entries.get(key) ?? null;
    },
    write(key: string, value: string): void {
      if (!written.includes(key)) {
        written.push(key);
      }
      entries.set(key, value);
    },
    remove(key: string): void {
      entries.delete(key);
    },
    keys(): readonly string[] {
      return [...written];
    },
    size(): number {
      return entries.size;
    },
  };
}

function storedFrom(store: RecordingStore): { readonly version: unknown; readonly data: unknown } {
  const text = store.read(STORAGE_KEY);
  if (text === null) {
    throw new Error('nothing was stored under the game key');
  }
  return JSON.parse(text) as { version: unknown; data: unknown };
}

// ---------------------------------------------------------------------------
// The synthetic ladder. Fixtures, not production versions
// ---------------------------------------------------------------------------

/**
 * A payload one version behind a synthetic target, with a field in it that no
 * step may drop and one that a step renames. Both are what "lossless" is
 * measured against.
 */
const V1_PAYLOAD: Readonly<Record<string, unknown>> = Object.freeze({
  bestBalance: 2500,
  table: 'silver',
  howToPlaySeen: true,
  legacyTag: 'a value from an older shape',
});

/** The synthetic target. Two versions above `V1_PAYLOAD`, so the walk has two steps. */
const SYNTHETIC_TARGET = 3;

/** Version 1 to version 2: renames one field and adds one. Nothing is dropped. */
const toVersion2: Migration = (data) => {
  const source = data as Readonly<Record<string, unknown>>;
  const { legacyTag, ...rest } = source;
  return { ...rest, carriedTag: legacyTag, addedAt2: true };
};

/** Version 2 to version 3: adds one field and touches nothing else. */
const toVersion3: Migration = (data) => {
  const source = data as Readonly<Record<string, unknown>>;
  return { ...source, addedAt3: true };
};

const FULL_LADDER: ReadonlyMap<number, Migration> = new Map<number, Migration>([
  [1, toVersion2],
  [2, toVersion3],
]);

/** The same ladder with its first rung missing, so a v1 document has no path. */
const BROKEN_LADDER: ReadonlyMap<number, Migration> = new Map<number, Migration>([[2, toVersion3]]);

/** A rung that throws, which is a migration meeting a payload it never saw. */
const HOSTILE_LADDER: ReadonlyMap<number, Migration> = new Map<number, Migration>([
  [
    1,
    () => {
      throw new TypeError('this step cannot read that payload');
    },
  ],
  [2, toVersion3],
]);

function envelope(version: number, data: unknown = V1_PAYLOAD): Envelope {
  return { version, data };
}

// ---------------------------------------------------------------------------
// The matrix, and the counts derived from its shape
// ---------------------------------------------------------------------------

/**
 * Four arriving versions against a target of 3: two behind, one behind, level,
 * and from the future.
 */
const ARRIVING = [1, 2, 3, 5] as const;

/**
 * Where a version-blind reader disagrees with the walk.
 *
 * It hands back the stored payload untouched, so it agrees only where the walk
 * also changed nothing and also accepted the document. Of the four: version 1 is
 * walked twice and its payload changes, version 2 once, version 5 is discarded,
 * and only version 3 passes through unchanged. 3 of 4.
 */
const VERSION_BLIND_DISAGREEMENTS = 3;

/**
 * Where a skip-ahead walker disagrees with the walk.
 *
 * It applies only the step registered one below the target, so it is right
 * wherever exactly one step was needed and wrong wherever two were. Of the four:
 * version 1 needs two steps, version 2 needs one, version 3 needs none and
 * version 5 is discarded by both. 1 of 4.
 */
const SKIP_AHEAD_DISAGREEMENTS = 1;

/** The pair every comparison is made on: did it accept, and what came out. */
function verdict(result: MigrationResult): string {
  return result.ok ? `ok:${JSON.stringify(result.data)}` : `no:${result.reason}`;
}

/** A reader that never looks at the version. Control. */
function versionBlind(one: Envelope): MigrationResult {
  return { ok: true, data: one.data, from: one.version, steps: 0 };
}

/** A walker that jumps to the last step instead of walking. Control. */
function skipAhead(one: Envelope, to: number, ladder: ReadonlyMap<number, Migration>): MigrationResult {
  if (one.version > to) {
    return { ok: false, reason: 'future-version', from: one.version, detail: '' };
  }
  if (one.version === to) {
    return { ok: true, data: one.data, from: one.version, steps: 0 };
  }
  const step = ladder.get(to - 1);
  if (step === undefined) {
    return { ok: false, reason: 'no-migration', from: one.version, detail: '' };
  }
  return { ok: true, data: step(one.data), from: one.version, steps: 1 };
}

describe('I1: one namespaced versioned document, migrated on bump', () => {
  describe('a single document', () => {
    it('writes exactly one key, however many times it is saved', () => {
      const store = recordingStore();
      const persistence = createPersistence({ store, durable: true, failure: null });
      expect(persistence.save(DEFAULT_DOCUMENT).ok).toBe(true);
      expect(persistence.update({ bestBalance: 4000 }).ok).toBe(true);
      expect(persistence.update({ howToPlaySeen: true }).ok).toBe(true);

      expect(store.keys()).toEqual([STORAGE_KEY]);
      expect(store.size()).toBe(1);
    });

    it('removes that one key on a full data reset, leaving nothing behind', () => {
      const store = recordingStore();
      const persistence = createPersistence({ store, durable: true, failure: null });
      persistence.save(DEFAULT_DOCUMENT);
      expect(store.size()).toBe(1);

      expect(persistence.resetAll().ok).toBe(true);
      expect(store.size()).toBe(0);
      expect(store.read(STORAGE_KEY)).toBeNull();
    });
  });

  describe('namespaced', () => {
    it('carries a shared namespace segment and this game beneath it', () => {
      expect(STORAGE_NAMESPACE.length).toBeGreaterThan(0);
      expect(STORAGE_GAME.length).toBeGreaterThan(0);
      expect(STORAGE_KEY.startsWith(`${STORAGE_NAMESPACE}.`)).toBe(true);
      expect(STORAGE_KEY.endsWith(STORAGE_GAME)).toBe(true);
      // Not a bare word: an unqualified key on a shared static host is how one
      // deployment quietly reads another's document.
      expect(STORAGE_KEY).not.toBe(STORAGE_GAME);
      expect(STORAGE_KEY.includes('.')).toBe(true);
    });

    it('keeps the same key across writes, so a bump cannot orphan a document', () => {
      const store = recordingStore();
      const persistence = createPersistence({ store, durable: true, failure: null });
      persistence.save(DEFAULT_DOCUMENT);
      const first = store.keys();
      persistence.update({ bestBalance: 12_000 });
      expect(store.keys()).toEqual(first);
    });
  });

  describe('versioned', () => {
    it('stores the schema version beside the payload, not inside it', () => {
      const store = recordingStore();
      createPersistence({ store, durable: true, failure: null }).save(DEFAULT_DOCUMENT);

      const stored = storedFrom(store);
      expect(typeof stored.version).toBe('number');
      expect(stored.version).toBe(DOCUMENT_VERSION);
      expect(stored.data).not.toBeNull();
      expect(typeof stored.data).toBe('object');
    });

    it('seals what this build writes at this build version', () => {
      expect(sealEnvelope({ any: 'payload' })).toEqual({
        version: DOCUMENT_VERSION,
        data: { any: 'payload' },
      });
    });

    it('reads a version out of a stored string before it reads anything else', () => {
      const read = readEnvelope(envelopeText(2, { anything: true }));
      expect(read.ok).toBe(true);
      expect(read.ok ? read.envelope.version : null).toBe(2);
      expect(read.ok ? read.envelope.data : null).toEqual({ anything: true });
    });

    it('has a registered step for every version below the current one', () => {
      // Vacuous at version 1 and exactly the point: the day this build writes
      // version 2, a missing step for version 1 fails here rather than
      // discarding a live player's document in silence. A step keyed at a
      // version no document can claim fails the size check beside it.
      for (let version = MIN_DOCUMENT_VERSION; version < DOCUMENT_VERSION; version += 1) {
        expect(MIGRATIONS.has(version)).toBe(true);
      }
      expect(MIGRATIONS.size).toBe(DOCUMENT_VERSION - MIN_DOCUMENT_VERSION);
    });
  });

  describe('migrates losslessly where possible', () => {
    it('walks a document two versions behind, one version at a time', () => {
      const walked = migrate(envelope(1), { to: SYNTHETIC_TARGET, migrations: FULL_LADDER });
      expect(walked.ok).toBe(true);
      expect(walked.ok ? walked.steps : -1).toBe(2);
      expect(walked.ok ? walked.from : -1).toBe(1);
    });

    it('drops nothing: every value in the old payload survives the walk', () => {
      const walked = migrate(envelope(1), { to: SYNTHETIC_TARGET, migrations: FULL_LADDER });
      const after = (walked.ok ? walked.data : {}) as Readonly<Record<string, unknown>>;

      // The three fields carried under their own names.
      expect(after['bestBalance']).toBe(V1_PAYLOAD['bestBalance']);
      expect(after['table']).toBe(V1_PAYLOAD['table']);
      expect(after['howToPlaySeen']).toBe(V1_PAYLOAD['howToPlaySeen']);
      // The one the first step renamed. Lossless means the value is still
      // reachable, not that the key never moved.
      expect(after['carriedTag']).toBe(V1_PAYLOAD['legacyTag']);
      expect(after['legacyTag']).toBeUndefined();
      // Both steps ran, in order.
      expect(after['addedAt2']).toBe(true);
      expect(after['addedAt3']).toBe(true);
    });

    it('applies one step to a document one version behind', () => {
      const walked = migrate(envelope(2, { kept: 7 }), {
        to: SYNTHETIC_TARGET,
        migrations: FULL_LADDER,
      });
      expect(walked.ok ? walked.steps : -1).toBe(1);
      expect(walked.ok ? walked.data : null).toEqual({ kept: 7, addedAt3: true });
    });

    it('carries a document already at the target through untouched', () => {
      const payload = { untouched: true };
      const walked = migrate(envelope(SYNTHETIC_TARGET, payload), {
        to: SYNTHETIC_TARGET,
        migrations: FULL_LADDER,
      });
      expect(walked.ok ? walked.steps : -1).toBe(0);
      expect(walked.ok ? walked.data : null).toBe(payload);
    });

    it('hands the migrated payload on to the sanitiser, which completes it', () => {
      // The whole chain a bump would run: walk the old shape forward, then read
      // it field by field. What the steps preserved is still there and what the
      // old shape never had comes from SPEC's defaults.
      const walked = migrate(envelope(1), { to: SYNTHETIC_TARGET, migrations: FULL_LADDER });
      const sanitised = sanitiseDocument(walked.ok ? walked.data : null);

      expect(sanitised.document.bestBalance).toBe(2500);
      expect(sanitised.document.table).toBe('silver');
      expect(sanitised.document.howToPlaySeen).toBe(true);
      expect(sanitised.document.statistics).toEqual(NO_STATISTICS);
      expect(sanitised.document.coach).toEqual(NO_DECISIONS);
      expect(sanitised.document.history).toEqual(NO_HISTORY);
      expect(sanitised.document.settings).toEqual(DEFAULT_SETTINGS);
      expect(sanitised.document.settings.rules).toEqual(DEFAULT_RULES);
    });
  });

  describe('discards cleanly where not', () => {
    it('discards an older document with no registered step, and does not throw', () => {
      const walked = migrate(envelope(1), { to: SYNTHETIC_TARGET, migrations: BROKEN_LADDER });
      expect(walked.ok).toBe(false);
      expect(walked.ok ? null : walked.reason).toBe('no-migration');
      expect(walked.ok ? null : walked.from).toBe(1);
    });

    it('applies no partial walk: a missing rung discards rather than stopping short', () => {
      // The rung from 2 to 3 exists, so a walker that applied what it could
      // would hand back a payload that had skipped 1 to 2. Nothing comes back.
      const walked = migrate(envelope(1), { to: SYNTHETIC_TARGET, migrations: BROKEN_LADDER });
      expect(walked.ok).toBe(false);
    });

    it('discards when a registered step throws, and does not throw itself', () => {
      const walked = migrate(envelope(1), { to: SYNTHETIC_TARGET, migrations: HOSTILE_LADDER });
      expect(walked.ok).toBe(false);
      expect(walked.ok ? null : walked.reason).toBe('migration-failed');
      expect(walked.ok ? null : walked.detail).toBe('TypeError');
    });

    it('discards a document from the future rather than reading it', () => {
      const walked = migrate(envelope(5), { to: SYNTHETIC_TARGET, migrations: FULL_LADDER });
      expect(walked.ok).toBe(false);
      expect(walked.ok ? null : walked.reason).toBe('future-version');
      expect(walked.ok ? null : walked.from).toBe(5);
    });

    it('discards a version that is not a version at all', () => {
      for (const version of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const walked = migrate({ version, data: {} });
        expect(walked.ok).toBe(false);
        expect(walked.ok ? null : walked.reason).toBe('bad-version');
      }
    });

    it('refuses a caller asking to migrate to something that is not a version', () => {
      // A stored byte can never cause this: it is the one argument that comes
      // from the program rather than from the document, so it throws in the
      // house style rather than degrading.
      expect(() => migrate(envelope(1), { to: 0 })).toThrow(/schema version/);
      expect(() => migrate(envelope(1), { to: 2.5 })).toThrow(/schema version/);
    });

    it('starts the game on defaults after every clean discard', () => {
      const discarded = [
        envelopeText(DOCUMENT_VERSION + 1, { bestBalance: 9999 }),
        envelopeText(0, { bestBalance: 9999 }),
        envelopeText('one', { bestBalance: 9999 }),
        envelopeText(null, { bestBalance: 9999 }),
      ];
      for (const text of discarded) {
        const loaded = loadDocument(storeHolding(text));
        expect(loaded.report.source).toBe('discarded');
        expect(loaded.document).toEqual(DEFAULT_DOCUMENT);
        expect(loaded.document.bestBalance).toBe(STARTING_CHIPS);

        const persistence = createPersistence(probeStore(() => null));
        expect(reachesBetting(persistence.restored())).toBe(true);
      }
    });

    it('overwrites the discarded document on the next successful write', () => {
      const store = storeHolding(envelopeText(DOCUMENT_VERSION + 4, { anything: true }));
      const persistence = createPersistence({ store, durable: true, failure: null });
      expect(persistence.readout().load.source).toBe('discarded');

      const next: GameDocument = { ...DEFAULT_DOCUMENT, bestBalance: 7000 };
      expect(persistence.save(next).ok).toBe(true);

      const again = loadDocument(store);
      expect(again.report.source).toBe('stored');
      expect(again.report.repairs).toEqual([]);
      expect(again.document.bestBalance).toBe(7000);
    });
  });

  describe('through the loader, which is where a real bump runs', () => {
    /**
     * The whole chain, driven today rather than on the day it first matters.
     *
     * `migrate` above is exercised on its own; this drives the three lines in
     * `loadDocument` that turn a walked payload into a report, through the same
     * store a launch reads. Without it, `source: 'migrated'` and `migratedFrom`
     * would run for the first time against a live player's document.
     */
    it('reads a stored older document, walks it, and says that it walked it', () => {
      const store = storeHolding(envelopeText(1, V1_PAYLOAD));
      const loaded = loadDocument(store, {
        to: SYNTHETIC_TARGET,
        migrations: FULL_LADDER,
      });

      expect(loaded.report.source).toBe('migrated');
      expect(loaded.report.migratedFrom).toBe(1);
      expect(loaded.report.failure).toBeNull();
      // And what the steps preserved is in the document the game gets.
      expect(loaded.document.bestBalance).toBe(2500);
      expect(loaded.document.table).toBe('silver');
      expect(loaded.document.howToPlaySeen).toBe(true);
    });

    it('says stored, not migrated, when nothing had to be walked', () => {
      const store = storeHolding(envelopeText(SYNTHETIC_TARGET, V1_PAYLOAD));
      const loaded = loadDocument(store, {
        to: SYNTHETIC_TARGET,
        migrations: FULL_LADDER,
      });

      expect(loaded.report.source).toBe('stored');
      expect(loaded.report.migratedFrom).toBeNull();
      // The payload was not walked, so the renamed field never happened and the
      // one SPEC 13 does not know is dropped by the sanitiser rather than kept.
      expect(loaded.document.howToPlaySeen).toBe(true);
      expect(Object.keys(loaded.document)).not.toContain('legacyTag');
    });

    it('discards through the loader too, and starts on defaults', () => {
      const store = storeHolding(envelopeText(1, V1_PAYLOAD));
      const loaded = loadDocument(store, {
        to: SYNTHETIC_TARGET,
        migrations: BROKEN_LADDER,
      });

      expect(loaded.report.source).toBe('discarded');
      expect(loaded.report.migratedFrom).toBeNull();
      expect(loaded.document).toEqual(DEFAULT_DOCUMENT);
    });

    it('passes this build version and step map when the caller passes nothing', () => {
      // The composition root at `BJ-19` calls it with no options, so the
      // defaults have to be the shipped ones rather than a test's.
      const store = storeHolding(envelopeText(DOCUMENT_VERSION, { bestBalance: 4000 }));
      const loaded = loadDocument(store);
      expect(loaded.report.source).toBe('stored');
      expect(loaded.document.bestBalance).toBe(4000);

      const ahead = loadDocument(storeHolding(envelopeText(DOCUMENT_VERSION + 1, {})));
      expect(ahead.report.source).toBe('discarded');
    });
  });

  describe('the round trip', () => {
    it('reads back what it wrote, field for field', () => {
      const store = createMemoryStore();
      const written: GameDocument = {
        ...DEFAULT_DOCUMENT,
        bestBalance: 12_500,
        table: 'gold',
        howToPlaySeen: true,
        settings: {
          ...DEFAULT_SETTINGS,
          coach: 'review',
          speed: 'fast',
          surfaceSize: 150,
          muted: true,
          volume: 0.25,
          theme: 'dark',
          reducedMotion: 'always',
          rules: { ...DEFAULT_RULES, decks: 8, surrender: false },
        },
      };
      createPersistence({ store, durable: true, failure: null }).save(written);

      const loaded = loadDocument(store);
      expect(loaded.report.source).toBe('stored');
      expect(loaded.report.repairs).toEqual([]);
      expect(loaded.document).toEqual(written);
    });
  });

  describe('the controls', () => {
    it('a version-blind reader disagrees on exactly 3 of the 4 arriving versions', () => {
      let disagreements = 0;
      for (const version of ARRIVING) {
        const real = migrate(envelope(version), {
          to: SYNTHETIC_TARGET,
          migrations: FULL_LADDER,
        });
        if (verdict(real) !== verdict(versionBlind(envelope(version)))) {
          disagreements += 1;
        }
      }
      expect(disagreements).toBe(VERSION_BLIND_DISAGREEMENTS);
    });

    it('a skip-ahead walker disagrees on exactly 1 of the 4, the two-step one', () => {
      let disagreements = 0;
      const disagreed: number[] = [];
      for (const version of ARRIVING) {
        const real = migrate(envelope(version), {
          to: SYNTHETIC_TARGET,
          migrations: FULL_LADDER,
        });
        if (verdict(real) !== verdict(skipAhead(envelope(version), SYNTHETIC_TARGET, FULL_LADDER))) {
          disagreements += 1;
          disagreed.push(version);
        }
      }
      expect(disagreements).toBe(SKIP_AHEAD_DISAGREEMENTS);
      expect(disagreed).toEqual([1]);
    });

    it('both controls agree with the walk on a document already at the target', () => {
      // The control that is right everywhere proves nothing, so the case where
      // all three agree is asserted rather than assumed.
      const at = envelope(SYNTHETIC_TARGET, { level: true });
      const real = migrate(at, { to: SYNTHETIC_TARGET, migrations: FULL_LADDER });
      expect(verdict(real)).toBe(verdict(versionBlind(at)));
      expect(verdict(real)).toBe(verdict(skipAhead(at, SYNTHETIC_TARGET, FULL_LADDER)));
    });
  });
});
