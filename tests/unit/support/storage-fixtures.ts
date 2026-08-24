/**
 * Fabricated stores, hostile hosts and stored strings, for the persistence
 * tests of `BJ-11`. Support code, not a second implementation and not an oracle.
 *
 * **Why the tests need them.** Items `I2` and `I3` are claims about a browser
 * that is refusing to cooperate: `window.localStorage` throwing `SecurityError`
 * on the property access, `setItem` throwing `QuotaExceededError`, a stored
 * string that is not JSON. None of those can be produced by a real browser under
 * a unit runner, and all of them are reachable through the store seam
 * `src/storage/store.ts` publishes. Everything here builds one of those
 * conditions and nothing here decides what the game should do about it.
 *
 * **What it deliberately is not.** It holds no rule, no default and no salvage
 * decision. It does not know what SPEC 13 persists, what a version is, or what a
 * corrupt value should become; the expectations live in the test files, written
 * from the criteria. `reachesBetting` is the one function that touches the game,
 * and it only asks the question item `I2` asks: did the game start.
 */

import type { HouseRules } from '../../../src/core/rules';
import type { Table } from '../../../src/core/table';
import { createTable } from '../../../src/core/table';
import type { GameDocument } from '../../../src/storage/document';
import { DOCUMENT_VERSION, STORAGE_KEY } from '../../../src/storage/document';
import type { RestoredSession } from '../../../src/storage/persistence';
import type { KeyValueStore, StorageLike } from '../../../src/storage/store';
import { createMemoryStore } from '../../../src/storage/store';

// ---------------------------------------------------------------------------
// Errors a browser really throws
// ---------------------------------------------------------------------------

/**
 * An error carrying a platform name, for the two QUALITY-BAR section 8 names.
 *
 * A `DOMException` where the runtime has one, which is every supported Node, so
 * that what the handler sees is the class a browser would throw and not a
 * lookalike. The fallback keeps the suite runnable on a host without the global
 * rather than skipping the case, and both arms carry the same `name`, which is
 * the only field the handler reads.
 */
export function platformError(name: string, message: string): Error {
  if (typeof DOMException === 'function') {
    return new DOMException(message, name);
  }
  const error = new Error(message);
  error.name = name;
  return error;
}

/** What Firefox with all cookies blocked and Safari with block-all throw. */
export function securityError(): Error {
  return platformError('SecurityError', 'access to storage is denied on this origin');
}

/** What a genuine storage overrun throws. QUALITY-BAR section 8. */
export function quotaError(): Error {
  return platformError('QuotaExceededError', 'the storage quota has been exceeded');
}

// ---------------------------------------------------------------------------
// Hostile hosts, for the property-access probe
// ---------------------------------------------------------------------------

/**
 * A host object whose `localStorage` **property access** throws.
 *
 * A real getter in an object literal rather than a function that throws when
 * called, because the trap item `I3` names is the access itself: reading the
 * property is what runs this body. A source built over it is
 * `() => host.localStorage`, which is the same expression `browserStorage` uses.
 */
export function throwingHost(error: unknown): { readonly localStorage: StorageLike } {
  return {
    get localStorage(): StorageLike {
      throw error;
    },
  };
}

/** A host that defines the property and leaves it empty. */
export function emptyHost(): { readonly localStorage: StorageLike | null } {
  return { localStorage: null };
}

// ---------------------------------------------------------------------------
// Fabricated stores
// ---------------------------------------------------------------------------

/** Which call a fabricated store refuses. */
export type FailingOperation = 'read' | 'write' | 'remove';

/**
 * A store that answers everything except one call, which throws.
 *
 * It delegates to a real in-memory store for the other two, so a test that
 * breaks the write can still seed the read and see what survived.
 */
export function storeThatThrows(
  operation: FailingOperation,
  error: unknown,
  base: KeyValueStore = createMemoryStore(),
): KeyValueStore {
  return Object.freeze({
    read(key: string): string | null {
      if (operation === 'read') {
        throw error;
      }
      return base.read(key);
    },
    write(key: string, value: string): void {
      if (operation === 'write') {
        throw error;
      }
      base.write(key, value);
    },
    remove(key: string): void {
      if (operation === 'remove') {
        throw error;
      }
      base.remove(key);
    },
  });
}

/**
 * A store whose first `failures` writes throw and whose later writes land.
 *
 * This is what item `I3`'s "retries on the next write naturally" is driven
 * against: nothing in the game asks for a retry, so the only way the carry can
 * recover is that the next ordinary write sends the whole document.
 */
export function storeThatFailsWrites(
  failures: number,
  error: unknown,
  base: KeyValueStore = createMemoryStore(),
): KeyValueStore {
  let refused = 0;
  return Object.freeze({
    read(key: string): string | null {
      return base.read(key);
    },
    write(key: string, value: string): void {
      if (refused < failures) {
        refused += 1;
        throw error;
      }
      base.write(key, value);
    },
    remove(key: string): void {
      base.remove(key);
    },
  });
}

/** A memory store with one string already under this game's key. */
export function storeHolding(text: string): KeyValueStore {
  const store = createMemoryStore();
  store.write(STORAGE_KEY, text);
  return store;
}

// ---------------------------------------------------------------------------
// Stored strings
// ---------------------------------------------------------------------------

/** An envelope around any payload, at any claimed version. */
export function envelopeText(version: unknown, data: unknown): string {
  return JSON.stringify({ version, data });
}

/** An envelope around a well-formed document, at this build's version. */
export function documentText(document: GameDocument): string {
  return envelopeText(DOCUMENT_VERSION, document);
}

// ---------------------------------------------------------------------------
// The question item `I2` asks
// ---------------------------------------------------------------------------

/**
 * Did the game start? SPEC 10's opening screen through to SPEC 10's betting
 * screen, on the seat and the rules the restored session produced.
 *
 * This is the boot-shaped path in one call: the wallet the loader built, the
 * table `launchTable` chose and the house rules the settings carried, all
 * handed to the real phase machine, with the real `start` intent applied. SPEC
 * 10's `start` refuses a table SPEC 6 does not open, so a seat the loader
 * salvaged badly fails here rather than passing quietly.
 */
export function reachesBetting(session: RestoredSession): boolean {
  const rules: HouseRules = session.settings.rules;
  const table: Table = createTable({
    wallet: session.wallet,
    table: session.launch.table,
    rules,
  });
  const started = table.apply({ kind: 'start' });
  return started.ok && table.readout().phase.kind === 'betting';
}
