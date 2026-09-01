/**
 * The storage seam: one key-value interface, an in-memory fallback, and the
 * single place `window.localStorage` is named. QUALITY-BAR section 8, SPEC 18,
 * item `I3` at `BJ-11`.
 *
 * **The property access is the dangerous one, so it is the thing wrapped.**
 * QUALITY-BAR section 8: "`window.localStorage` can throw `SecurityError` on
 * **property access** - Firefox with all cookies blocked, Safari with 'Block all
 * cookies', partitioned Chromium contexts. The wrapper probes once at startup
 * inside `try`/`catch` around the property access itself and falls back to an
 * in-memory store for the session." `probeStore` below is that sentence: the
 * access happens inside `try`, not before it, and nothing else in this project
 * reads the global.
 *
 * **Store-interface-first, because the logic has to be testable without a
 * browser.** Everything above this file talks to `KeyValueStore`, which is three
 * methods and no platform type, so the whole of `persistence.ts` can be driven
 * by a fabricated store that throws on read, throws on write, throws on remove,
 * or answers with a corrupt string. `adaptStorage` is the only adapter and the
 * only code that knows the platform's names.
 *
 * **The adapter deliberately does not catch.** Every call into a store is
 * wrapped where the document lives, in `persistence.ts`, so a fabricated
 * throwing store exercises the same handler the browser's does. An adapter that
 * swallowed its own failures would leave the real handler untested and would
 * report a write as successful when it was not, which is the half of item `I3`
 * that says the in-memory value stays authoritative.
 *
 * **Three methods and not five.** QUALITY-BAR section 8 stores one JSON document
 * per game, so exactly one key is ever touched. `length`, `key(n)` and `clear()`
 * are not here: `clear()` in particular would take out every other key on the
 * origin, which on a shared static host is somebody else's data, and item `I5`'s
 * reset is specified as clearing this game's values rather than the origin.
 *
 * This module is outside `core/` because `localStorage` is a BOM API the `core/`
 * lint boundary forbids, and `src/storage/` is where the boundary intends such a
 * thing to live. No canvas, no renderer import, no `Math.random()`, no clock.
 */

// ---------------------------------------------------------------------------
// The interface everything above this file talks to
// ---------------------------------------------------------------------------

/**
 * A namespaced key-value store, as this project uses one.
 *
 * `read` answers `null` for a key that was never written, which is the answer
 * `Storage.getItem` gives and is what makes a first launch and a browser that
 * cleared its storage the same case.
 */
export interface KeyValueStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * The part of the platform's `Storage` this project uses.
 *
 * Narrower than `Storage` on purpose: a `Storage` carries an index signature,
 * `length`, `key(n)` and `clear()`, and typing the seam as the whole thing would
 * let a later caller reach for one of them. `window.localStorage` satisfies this
 * shape, so the adapter needs no cast.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ---------------------------------------------------------------------------
// Failures, as values a readout can surface
// ---------------------------------------------------------------------------

/** Which call failed. `probe` is the property access of QUALITY-BAR section 8. */
export type StoreOperation = 'probe' | 'read' | 'write' | 'remove';

/**
 * One failed store call, described without keeping the error itself.
 *
 * A plain frozen value rather than the caught object, because item `I3` asks for
 * a degradation "a later readout can surface" and a readout is rendered by
 * chrome that must not be handed a live `Error` to poke at. The name is kept
 * because it is the one field that separates `SecurityError` from
 * `QuotaExceededError`, and QUALITY-BAR section 8 names both.
 */
export interface StoreFailure {
  readonly operation: StoreOperation;
  readonly name: string;
  readonly message: string;
}

/**
 * A thrown value's name, without converting anything.
 *
 * `String(value)` appears nowhere in this file: a thrown symbol makes it throw,
 * and a thrown object with a hostile `toString` makes it throw too, which would
 * put an exception inside the handler that exists to stop one. Anything that is
 * not an `Error` is described rather than printed.
 */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'NonError';
}

/**
 * An object with readable fields, which is the only shape a stored document or
 * a stored envelope has.
 *
 * Here, beside `errorName`, because both halves of the read path need it and
 * this file is the one they already share: `migrations.ts` reads envelopes and
 * `document.ts` reads payloads, and two private copies of one three-clause test
 * are two places for the array case to be forgotten. The array clause is the
 * load-bearing one: `typeof []` is `'object'`, so a stored `[]` would otherwise
 * present itself as a record with no fields and be salvaged into a document of
 * defaults rather than refused.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'a value that is not an Error was thrown';
}

/** Describe a caught value. Never bare: the binding is read, not discarded. */
export function describeFailure(operation: StoreOperation, error: unknown): StoreFailure {
  return Object.freeze({ operation, name: errorName(error), message: messageOf(error) });
}

// ---------------------------------------------------------------------------
// The in-memory fallback
// ---------------------------------------------------------------------------

/**
 * A store that keeps everything in a `Map` and loses it when the tab closes.
 *
 * This is what item `I3` means by "falls back to an in-memory store": the game
 * gets a store that answers every call, so nothing above it has a second code
 * path, and the only thing that degrades is the carry across sessions. A fresh
 * `Map` per call and no module-level instance, because two sessions sharing one
 * would carry state a blocked browser is not carrying, and the test that proves
 * the carry really is gone asks for two stores and requires them to be separate.
 */
export function createMemoryStore(): KeyValueStore {
  const entries = new Map<string, string>();
  return Object.freeze({
    read(key: string): string | null {
      return entries.get(key) ?? null;
    },
    write(key: string, value: string): void {
      entries.set(key, value);
    },
    remove(key: string): void {
      entries.delete(key);
    },
  });
}

/** Wrap a platform `Storage` as a `KeyValueStore`. It does not catch: see above. */
function adaptStorage(storage: StorageLike): KeyValueStore {
  return Object.freeze({
    read(key: string): string | null {
      return storage.getItem(key);
    },
    write(key: string, value: string): void {
      storage.setItem(key, value);
    },
    remove(key: string): void {
      storage.removeItem(key);
    },
  });
}

// ---------------------------------------------------------------------------
// The probe. QUALITY-BAR section 8, item `I3`
// ---------------------------------------------------------------------------

/** What the startup probe found. The game starts on either answer. */
export interface StoreProbe {
  /** A store that answers every call, whichever branch produced it. */
  readonly store: KeyValueStore;
  /** True when the platform's own store answered. False on the fallback. */
  readonly durable: boolean;
  /** Why the fallback was taken, or `null` when it was not. */
  readonly failure: StoreFailure | null;
}

/**
 * Where the probe looks. The one seam that names the platform.
 *
 * A function rather than a value, so the access happens inside the probe's `try`
 * and not while this module is being evaluated. A module-level
 * `const storage = window.localStorage` would throw on import in exactly the
 * browsers item `I3` names, and an import that throws takes the whole bundle
 * down before any handler exists.
 */
export type StorageSource = () => StorageLike | null | undefined;

/**
 * The browser's store, read by property access. **This line is the trap.**
 *
 * `window.localStorage` is a getter, and in Firefox with all cookies blocked and
 * Safari with "Block all cookies" it throws `SecurityError` before `getItem` is
 * ever called. It is also a `ReferenceError` in any environment with no `window`
 * at all, which is what the unit suite runs in. Both are thrown out of this
 * function and caught by the one handler in `probeStore`, and neither is
 * distinguished, because the answer to both is the same fallback.
 */
export const browserStorage: StorageSource = () => window.localStorage;

/**
 * Probe once, at startup, and hand back a store either way. Item `I3`.
 *
 * The whole criterion in one function: the property access is inside the `try`,
 * a throw falls back to memory rather than propagating, and the caller receives
 * a `StoreProbe` in both cases, so there is no branch above this line and no way
 * for the game not to start. `durable` is the only difference, and it exists so
 * a settings panel can say plainly that progress will not carry, which is
 * QUALITY-BAR section 8's last clause.
 *
 * A source that answers `null` or `undefined` is treated as a missing store
 * rather than a working one: some embedders define the property and leave it
 * empty, and `adaptStorage(null)` would turn that into a `TypeError` on the
 * first read, which is a crash at boot rather than a degraded carry.
 */
export function probeStore(source: StorageSource = browserStorage): StoreProbe {
  try {
    const storage = source();
    if (storage === null || storage === undefined) {
      return degraded(
        Object.freeze({
          operation: 'probe',
          name: 'Unavailable',
          message: 'the platform defines no storage on this origin',
        }),
      );
    }
    return Object.freeze({ store: adaptStorage(storage), durable: true, failure: null });
  } catch (error) {
    // Typed, and read. QUALITY-BAR section 12 forbids a bare `catch {}`, and
    // this is the one the whole item is about: `SecurityError` on the property
    // access above, or a `ReferenceError` where there is no `window`.
    return degraded(describeFailure('probe', error));
  }
}

function degraded(failure: StoreFailure): StoreProbe {
  return Object.freeze({ store: createMemoryStore(), durable: false, failure });
}
