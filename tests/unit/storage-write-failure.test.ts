/**
 * Item I3, severity Critical, 14 points.
 *
 *   "A storage write that throws does not interrupt the round, and a
 *    SecurityError thrown on window.localStorage property access at startup
 *    falls back to an in-memory store without preventing the game from starting.
 *    The in-memory value stays authoritative and only the cross-session carry
 *    degrades."
 *
 * QUALITY-BAR sections 8 and 12, SPEC 18. Four clauses, driven separately below.
 *
 * **The property access is the trap, so the fixture is a property access.**
 * `throwingHost` is an object with a real getter that throws, and the source
 * handed to `probeStore` is `() => host.localStorage`, which is the same
 * expression `browserStorage` uses on `window`. Reading the property is what
 * runs the getter, so what is being tested is the access itself and not a method
 * call standing in for it.
 *
 * **"Does not interrupt the round" is asserted against a round that was not
 * interrupted.** The same seeded round is played twice, once against a store
 * that throws on every write and once against one that never does, with a save
 * attempted at every phase transition in both. The two readouts must be
 * identical, byte for byte, and both must reach SPEC 10's round result. A weaker
 * assertion, that no exception escaped, would pass for a game that quietly
 * stopped dealing.
 *
 * **Two scanners, each with a can-see control.** A scanner that finds nothing is
 * indistinguishable from a scanner that cannot see, so both are run first over
 * synthetic text containing exactly what they hunt for and required to find it.
 * The first is QUALITY-BAR section 12's "no bare `catch {}` anywhere". The
 * second is the seam claim this part rests on: `window` and `localStorage` are
 * named in one file, so there is one place the probe has to protect.
 *
 * **What this file does not claim.** The versioned envelope and the migration
 * walk are item `I1` in `tests/unit/storage-migration.test.ts`, and the corrupt
 * matrix is item `I2` in `tests/unit/storage-corrupt.test.ts`. The reload and
 * reset flows in a browser are items `I4` and `I5` at `BJ-20`.
 *
 * **The environment is pinned, deliberately.** One assertion below drives the
 * shipped `browserStorage` source itself, and it is only a test of the
 * `SecurityError` path because this runner has no `window` at all. The pragma
 * pins that, and the assertion checks it before relying on it, so a later part
 * switching this suite to a DOM environment fails as "the environment changed"
 * rather than as an assertion that looks wrong and invites deletion.
 *
 * @vitest-environment node
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { acceptIntent as accept } from './support/drive';
import { stripComments as code } from './support/source-scan';

import type { TableReadout } from '../../src/core/table';
import { createTable } from '../../src/core/table';
import { STARTING_CHIPS } from '../../src/core/wallet';
import type { GameDocument } from '../../src/storage/document';
import { DEFAULT_DOCUMENT, STORAGE_KEY } from '../../src/storage/document';
import type { Persistence } from '../../src/storage/persistence';
import {
  createPersistence,
  loadDocument,
  openPersistence,
  saveDocument,
} from '../../src/storage/persistence';
import type { StorageLike } from '../../src/storage/store';
import { createMemoryStore, probeStore } from '../../src/storage/store';

import {
  emptyHost,
  quotaError,
  reachesBetting,
  securityError,
  storeThatFailsWrites,
  storeThatThrows,
  throwingHost,
} from './support/storage-fixtures';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** SPEC 4.11: what a launch starts at, however badly storage is behaving. */
const SPEC_STARTING_CHIPS = 1000;

/** SPEC 5: a frame long enough to pay for any one timed step. */
const TICK = 0.25;

/** Bounded, in the house pattern: a stall must fail loudly, not hang. */
const LOOP_LIMIT = 500;

// ---------------------------------------------------------------------------
// The probe. QUALITY-BAR section 8's more dangerous failure
// ---------------------------------------------------------------------------

describe('I3: a SecurityError on the property access falls back to memory', () => {
  it('catches a SecurityError thrown by reading the property itself', () => {
    const host = throwingHost(securityError());
    const probe = probeStore(() => host.localStorage);

    expect(probe.durable).toBe(false);
    expect(probe.failure?.operation).toBe('probe');
    expect(probe.failure?.name).toBe('SecurityError');
    expect(probe.store).toBeDefined();
  });

  it('hands back a store that answers every call anyway', () => {
    const host = throwingHost(securityError());
    const { store } = probeStore(() => host.localStorage);

    expect(store.read('anything')).toBeNull();
    store.write('anything', 'a value');
    expect(store.read('anything')).toBe('a value');
    store.remove('anything');
    expect(store.read('anything')).toBeNull();
  });

  it('degrades on anything the access can throw, not only on a SecurityError', () => {
    const thrown: readonly unknown[] = [
      securityError(),
      new ReferenceError('window is not defined'),
      new TypeError('cannot read localStorage'),
      'a string',
      42,
      null,
      undefined,
    ];
    for (const error of thrown) {
      const host = throwingHost(error);
      const probe = probeStore(() => host.localStorage);
      expect(probe.durable).toBe(false);
      expect(probe.failure).not.toBeNull();
      expect(probe.store.read(STORAGE_KEY)).toBeNull();
    }
  });

  it('describes a thrown non-Error without converting it', () => {
    // `String(value)` on a thrown symbol throws, which would put an exception
    // inside the handler that exists to stop one.
    const host = throwingHost(Symbol('hostile'));
    const probe = probeStore(() => host.localStorage);
    expect(probe.durable).toBe(false);
    expect(probe.failure?.name).toBe('NonError');
  });

  it('treats a defined but empty storage property as no storage at all', () => {
    const host = emptyHost();
    const probe = probeStore(() => host.localStorage);
    expect(probe.durable).toBe(false);
    expect(probe.failure?.name).toBe('Unavailable');
    expect(() => probe.store.write(STORAGE_KEY, '{}')).not.toThrow();
  });

  it('reports a store that answers as durable, and passes all three calls through', () => {
    const backing = new Map<string, string>();
    const calls: string[] = [];
    const storage: StorageLike = {
      getItem: (key) => {
        calls.push('getItem');
        return backing.get(key) ?? null;
      },
      setItem: (key, value) => {
        calls.push('setItem');
        backing.set(key, value);
      },
      removeItem: (key) => {
        calls.push('removeItem');
        backing.delete(key);
      },
    };
    const probe = probeStore(() => storage);
    expect(probe.durable).toBe(true);
    expect(probe.failure).toBeNull();

    probe.store.write(STORAGE_KEY, 'through the adapter');
    expect(backing.get(STORAGE_KEY)).toBe('through the adapter');

    // **All three pass-throughs, not just the write.** `adaptStorage` is the one
    // place in the codebase that names the platform, and only its `setItem` arm
    // had ever been driven by a unit test or broken by a mutation entry: a
    // `getItem` that always answered `null` would make every reload look like a
    // first launch, and a `removeItem` that did nothing would make Reset all
    // data leave the document exactly where it was. Both are covered in the
    // browser tier, which is precisely the shape the `BJ-20` sweep-miss lesson
    // names, an entry family only one tier can see.
    expect(probe.store.read(STORAGE_KEY)).toBe('through the adapter');
    expect(probe.store.read('js-games.blackjack.absent')).toBeNull();
    probe.store.remove(STORAGE_KEY);
    expect(backing.has(STORAGE_KEY)).toBe(false);
    expect(probe.store.read(STORAGE_KEY)).toBeNull();

    // The count is the control: a read that answered out of a cache of its own
    // rather than out of the platform would pass everything above.
    expect(calls).toEqual(['setItem', 'getItem', 'getItem', 'removeItem', 'getItem']);
  });

  it('reports a refusal raised by the platform store, through the real adapter', () => {
    // **The path a real blocked browser actually takes.** Every other write
    // failure here is driven through a fabricated `KeyValueStore`, which skips
    // `adaptStorage` entirely; this one throws from a `StorageLike`, so the
    // throw crosses the adapter before it reaches the handler in
    // `persistence.ts`. An adapter that caught its own failure would report a
    // write as successful while nothing persisted, and no other assertion in
    // this file would notice.
    const backing = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (key) => backing.get(key) ?? null,
      setItem: () => {
        throw quotaError();
      },
      removeItem: (key) => {
        backing.delete(key);
      },
    };
    const probe = probeStore(() => storage);
    expect(probe.durable).toBe(true);

    const result = saveDocument(probe.store, DEFAULT_DOCUMENT);
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.failure.operation).toBe('write');
    expect(result.ok ? null : result.failure.name).toBe('QuotaExceededError');
    // And nothing landed, which is what makes "reported as successful" a lie
    // rather than a wording quibble.
    expect(backing.size).toBe(0);
  });

  it('uses the shipped source by default, and survives it throwing', () => {
    // This runner is a Node environment with no `window` at all, so the shipped
    // `browserStorage` throws `ReferenceError` on the same property access the
    // criterion is about. Nothing is stubbed: the default path is the one under
    // test here. The precondition is asserted rather than assumed, so a switch
    // to a DOM environment fails here, by name, instead of further down.
    expect(typeof window).toBe('undefined');
    expect(() => probeStore()).not.toThrow();
    const probe = probeStore();
    expect(probe.durable).toBe(false);
    expect(probe.store.read(STORAGE_KEY)).toBeNull();
    // And it degraded because the access threw, not because the source answered
    // with nothing: a source that returned `null` would report `Unavailable`.
    expect(probe.failure?.operation).toBe('probe');
    expect(probe.failure?.name).not.toBe('Unavailable');
  });
});

describe('I3: without preventing the game from starting', () => {
  it('starts the game on a blocked browser, all the way to SPEC 10 betting', () => {
    const host = throwingHost(securityError());
    const persistence = openPersistence(() => host.localStorage);

    expect(persistence.readout().durable).toBe(false);
    expect(reachesBetting(persistence.restored())).toBe(true);
    expect(persistence.restored().wallet.readout().chips).toBe(SPEC_STARTING_CHIPS);
  });

  it('starts the game when the store refuses the read', () => {
    const store = storeThatThrows('read', securityError());
    const persistence = createPersistence({ store, durable: true, failure: null });

    expect(persistence.readout().load.source).toBe('unreadable');
    expect(persistence.readout().load.failure?.name).toBe('SecurityError');
    expect(persistence.document()).toEqual(DEFAULT_DOCUMENT);
    expect(reachesBetting(persistence.restored())).toBe(true);
  });

  it('says plainly that the carry is degraded, which is what settings shows', () => {
    const host = throwingHost(securityError());
    const readout = openPersistence(() => host.localStorage).readout();
    expect(readout.durable).toBe(false);
    expect(readout.carryDegraded).toBe(true);
    expect(readout.probeFailure?.name).toBe('SecurityError');
  });
});

// ---------------------------------------------------------------------------
// The in-memory value stays authoritative, and only the carry degrades
// ---------------------------------------------------------------------------

describe('I3: the in-memory value stays authoritative', () => {
  function blockedSession(): Persistence {
    const host = throwingHost(securityError());
    return openPersistence(() => host.localStorage);
  }

  it('keeps everything written during the session, on the fallback store', () => {
    const persistence = blockedSession();
    expect(persistence.update({ bestBalance: 9_000 }).ok).toBe(true);
    expect(persistence.document().bestBalance).toBe(9_000);

    expect(persistence.update({ howToPlaySeen: true }).ok).toBe(true);
    expect(persistence.document().howToPlaySeen).toBe(true);
    expect(persistence.document().bestBalance).toBe(9_000);
  });

  it('keeps the new value even when the write itself throws', () => {
    const store = storeThatThrows('write', quotaError());
    const persistence = createPersistence({ store, durable: true, failure: null });

    const result = persistence.update({ bestBalance: 25_000 });
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.failure.name).toBe('QuotaExceededError');
    // The whole clause: the value the game is using did not move back.
    expect(persistence.document().bestBalance).toBe(25_000);
  });

  it('degrades only the carry: a new session on a blocked browser sees defaults', () => {
    const first = blockedSession();
    first.update({ bestBalance: 9_000 });
    expect(first.document().bestBalance).toBe(9_000);

    // A new launch. The probe fell back again and its store is a new one, so
    // nothing carried, which is exactly what the criterion says degrades.
    const second = blockedSession();
    expect(second.document().bestBalance).toBe(STARTING_CHIPS);
    expect(second.document()).toEqual(DEFAULT_DOCUMENT);
  });

  it('the same two sessions over a store that works do carry, which is the control', () => {
    // Without this, the assertion above passes for a game that never persisted
    // anything at all.
    const store = createMemoryStore();
    const first = createPersistence({ store, durable: true, failure: null });
    first.update({ bestBalance: 9_000 });

    const second = createPersistence({ store, durable: true, failure: null });
    expect(second.document().bestBalance).toBe(9_000);
  });

  it('gives every probe its own fallback store, so two sessions cannot share one', () => {
    const host = throwingHost(securityError());
    const one = probeStore(() => host.localStorage);
    const two = probeStore(() => host.localStorage);

    one.store.write(STORAGE_KEY, 'from the first session');
    expect(two.store.read(STORAGE_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A write that throws does not interrupt the round
// ---------------------------------------------------------------------------

/**
 * Play one round, saving at every phase transition. The shape a composition
 * root has: the game does something, and then the document is written.
 */
function playSaving(seed: number, persistence: Persistence): TableReadout {
  const table = createTable({ seed });
  let seen = '';
  for (let turn = 0; turn < LOOP_LIMIT; turn += 1) {
    const state = table.readout();
    if (state.phase.kind !== seen) {
      seen = state.phase.kind;
      persistence.update({ bestBalance: Math.max(STARTING_CHIPS, state.wallet.bestBalance) });
    }
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

describe('I3: a write that throws does not interrupt the round', () => {
  const SEED = 21;

  it('plays the identical round against a store that throws on every write', () => {
    const throwing = createPersistence({
      store: storeThatThrows('write', quotaError()),
      durable: true,
      failure: null,
    });
    const working = createPersistence({
      store: createMemoryStore(),
      durable: true,
      failure: null,
    });

    const broken = playSaving(SEED, throwing);
    const whole = playSaving(SEED, working);

    expect(broken.phase.kind).toBe('roundResult');
    expect(whole.phase.kind).toBe('roundResult');
    // Byte for byte: the cards dealt, the hands, the wallet and SPEC 4.11's
    // four-term identity. Storage failing changed nothing about the game.
    expect(JSON.stringify(broken)).toBe(JSON.stringify(whole));
  });

  it('records the degradation rather than raising it', () => {
    const persistence = createPersistence({
      store: storeThatThrows('write', quotaError()),
      durable: true,
      failure: null,
    });
    expect(() => playSaving(SEED, persistence)).not.toThrow();

    const readout = persistence.readout();
    expect(readout.writes).toBe(0);
    expect(readout.failedWrites).toBeGreaterThan(0);
    expect(readout.carryDegraded).toBe(true);
    expect(readout.lastFailure?.operation).toBe('write');
    expect(readout.lastFailure?.name).toBe('QuotaExceededError');
    // The probe found a real store; it is the writes that are failing, and the
    // readout keeps the two apart.
    expect(readout.durable).toBe(true);
  });

  it('retries on the next write naturally, with no retry anywhere in the game', () => {
    const backing = createMemoryStore();
    const persistence = createPersistence({
      store: storeThatFailsWrites(2, quotaError(), backing),
      durable: true,
      failure: null,
    });

    expect(persistence.update({ bestBalance: 2_000 }).ok).toBe(false);
    expect(persistence.update({ bestBalance: 4_000 }).ok).toBe(false);
    expect(persistence.readout().carryDegraded).toBe(true);
    expect(backing.read(STORAGE_KEY)).toBeNull();

    // Nothing asked for a retry. The third ordinary write sends the whole
    // document, so the two that failed are made up for by the one that lands.
    expect(persistence.update({ howToPlaySeen: true }).ok).toBe(true);
    expect(persistence.readout().carryDegraded).toBe(false);
    expect(persistence.readout().writes).toBe(1);
    expect(persistence.readout().failedWrites).toBe(2);

    const loaded = loadDocument(backing);
    expect(loaded.document.bestBalance).toBe(4_000);
    expect(loaded.document.howToPlaySeen).toBe(true);
  });

  it('does not roll a value back when the write that carried it failed', () => {
    const persistence = createPersistence({
      store: storeThatThrows('write', quotaError()),
      durable: true,
      failure: null,
    });
    const next: GameDocument = { ...DEFAULT_DOCUMENT, bestBalance: 7_777, table: 'silver' };
    expect(persistence.save(next).ok).toBe(false);
    expect(persistence.document()).toEqual(next);
  });
});

// ---------------------------------------------------------------------------
// Reset all data, over a store that refuses
// ---------------------------------------------------------------------------

describe('I3: reset all data degrades the same way', () => {
  it('clears the session even when the remove throws', () => {
    const persistence = createPersistence({
      store: storeThatThrows('remove', quotaError()),
      durable: true,
      failure: null,
    });
    persistence.update({ bestBalance: 11_000, howToPlaySeen: true });

    const result = persistence.resetAll();
    expect(result.ok).toBe(false);
    expect(persistence.document()).toEqual(DEFAULT_DOCUMENT);
    expect(persistence.restored().wallet.readout().bestBalance).toBe(STARTING_CHIPS);
    expect(persistence.readout().carryDegraded).toBe(true);
  });

  it('clears the stored document and rebuilds the session when the remove lands', () => {
    // The store is seeded first, so the session this launch produced is one a
    // reset has something to take away. Starting from an empty store would give
    // a pre-reset session already holding the defaults, and the rebuild would
    // be invisible whether it happened or not.
    const store = createMemoryStore();
    const carried: GameDocument = {
      ...DEFAULT_DOCUMENT,
      bestBalance: 11_000,
      table: 'gold',
      howToPlaySeen: true,
    };
    createPersistence({ store, durable: true, failure: null }).save(carried);

    const persistence = createPersistence({ store, durable: true, failure: null });
    expect(persistence.restored().wallet.readout().bestBalance).toBe(11_000);
    expect(persistence.restored().launch.table).toBe('gold');
    expect(persistence.restored().howToPlaySeen).toBe(true);
    expect(store.read(STORAGE_KEY)).not.toBeNull();

    expect(persistence.resetAll().ok).toBe(true);
    expect(store.read(STORAGE_KEY)).toBeNull();
    expect(persistence.document()).toEqual(DEFAULT_DOCUMENT);
    // SPEC 14's "clears every persisted value": a fresh wallet at the starting
    // mark, back at the table SPEC 6 never locks, with nothing seen.
    expect(persistence.restored().wallet.readout().bestBalance).toBe(STARTING_CHIPS);
    expect(persistence.restored().launch.table).toBe('bronze');
    expect(persistence.restored().history).toHaveLength(0);
    expect(persistence.restored().howToPlaySeen).toBe(false);
    expect(loadDocument(store).report.source).toBe('absent');
  });
});

// ---------------------------------------------------------------------------
// The two scanners, and the controls that prove they can see
// ---------------------------------------------------------------------------

/** QUALITY-BAR section 12: a `catch` with no binding, or with an empty body. */
function bareCatches(text: string): readonly string[] {
  const found: string[] = [];
  const source = code(text);
  for (const match of source.matchAll(/catch\s*\{/g)) {
    found.push(match[0]);
  }
  for (const match of source.matchAll(/catch\s*\([^)]*\)\s*\{\s*\}/g)) {
    found.push(match[0]);
  }
  return found;
}

/** Every occurrence of a platform storage name, in code. */
function platformNames(text: string): readonly string[] {
  return [...code(text).matchAll(/\b(?:window|localStorage|sessionStorage)\b/g)].map(
    (match) => match[0],
  );
}

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

function sourcesUnder(...segments: readonly string[]): readonly SourceFile[] {
  const root = join(PROJECT_ROOT, ...segments);
  const files: SourceFile[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        files.push({ path: full.replace(/\\/g, '/'), text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  return files;
}

describe('I3: no bare catch, and the scanner can see one', () => {
  it('finds a bare catch, an empty handler and nothing in a clean one', () => {
    expect(bareCatches('try { go(); } catch { }')).toHaveLength(1);
    expect(bareCatches('try { go(); } catch {}')).toHaveLength(1);
    expect(bareCatches('try { go(); } catch (error) {}')).toHaveLength(1);
    expect(bareCatches('try { go(); } catch (error) { report(error); }')).toEqual([]);
    // And it reads code, not prose: a comment naming the thing is not the thing.
    expect(bareCatches('// never write catch {} here\ntry { go(); } catch (e) { see(e); }')).toEqual(
      [],
    );
  });

  it('finds none anywhere in the storage module', () => {
    const files = sourcesUnder('src', 'storage');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(bareCatches(file.text), file.path).toEqual([]);
    }
  });

  it('finds none anywhere else in the shipped source either', () => {
    for (const file of sourcesUnder('src')) {
      expect(bareCatches(file.text), file.path).toEqual([]);
    }
  });

  it('binds and reads every catch in the storage module', () => {
    // The count is derived by scanning, not written down: what is asserted is
    // that every `catch` found is a binding form, and that there is at least one
    // to find, since a module with no handlers would pass the check above for
    // the wrong reason.
    let handlers = 0;
    for (const file of sourcesUnder('src', 'storage')) {
      handlers += [...code(file.text).matchAll(/\bcatch\s*\(/g)].length;
      expect([...code(file.text).matchAll(/\bcatch\b/g)]).toHaveLength(
        [...code(file.text).matchAll(/\bcatch\s*\(/g)].length,
      );
    }
    expect(handlers).toBeGreaterThan(0);
  });
});

/**
 * Two tabs on the one namespaced key, pinned as the design it is.
 *
 * SPEC 13 and QUALITY-BAR section 8 say nothing about a second tab, so this is
 * not a graded criterion; it is a behaviour a player can reach, and the choice
 * between accepting it and merging the monotone fields at the write is recorded
 * in `persistence.ts`'s header. The pin is here so the decision cannot change by
 * accident: the day someone puts a re-read on the save path, this goes red and
 * says which sentence they are editing.
 *
 * Torn reads are deliberately not part of the claim. `setItem` and `getItem`
 * are atomic per key and the document is one key, so what is at stake is which
 * whole document wins, not a half-written one.
 */
describe('SPEC 13: one key, one document, and the last writer wins', () => {
  it('lets a stale tab overwrite what the other tab achieved, which is the chosen design', () => {
    const store = createMemoryStore();
    // Both tabs boot on the same empty document, which is the realistic case:
    // a second tab opened while the first is mid-session.
    const tabA = createPersistence({ store, durable: true, failure: null });
    const tabB = createPersistence({ store, durable: true, failure: null });

    tabA.update({ bestBalance: 42_000, howToPlaySeen: true });
    expect(loadDocument(store).document.bestBalance).toBe(42_000);

    // Tab B writes anything at all: a settings toggle, a round boundary, or the
    // pagehide save `main.ts` wires to `onHidden`. It carries its own boot-time
    // document, so tab A's mark goes.
    tabB.update({ howToPlaySeen: true });
    expect(loadDocument(store).document.bestBalance).toBe(STARTING_CHIPS);

    // The other half of the same design: tab A's own view is unaffected, because
    // the in-memory document is authoritative and nothing re-reads.
    expect(tabA.document().bestBalance).toBe(42_000);
    tabA.update({ howToPlaySeen: true });
    expect(loadDocument(store).document.bestBalance).toBe(42_000);
  });
});

describe('I3: one seam names the platform, and the scanner can see it', () => {
  it('finds a platform name in code and ignores one in a comment', () => {
    expect(platformNames('const s = window.localStorage;')).toEqual(['window', 'localStorage']);
    expect(platformNames('// window.localStorage is the trap')).toEqual([]);
    expect(platformNames('/* window.localStorage */ const x = 1;')).toEqual([]);
    expect(platformNames('const x = 1;')).toEqual([]);
  });

  it('names window and localStorage in exactly one file, and once each', () => {
    const named = sourcesUnder('src').filter((file) => platformNames(file.text).length > 0);
    expect(named.map((file) => file.path.slice(file.path.lastIndexOf('src/')))).toEqual([
      'src/storage/store.ts',
    ]);

    const seam = named[0];
    if (seam === undefined) {
      throw new Error('the seam file was not found');
    }
    expect(platformNames(seam.text)).toEqual(['window', 'localStorage']);
  });
});
