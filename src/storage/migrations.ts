/**
 * The versioned envelope and the walk that carries an older one forward.
 * QUALITY-BAR section 8, item `I1` at `BJ-11`.
 *
 *   "Saved state is a single namespaced versioned document, and a version bump
 *    migrates losslessly where possible and discards cleanly where not."
 *
 * **The envelope, and why the payload sits inside one.** A stored document is
 * `{ "version": n, "data": { ... } }` and never the payload alone. The version
 * has to be readable before the payload is interpreted, so it cannot live inside
 * the payload's own shape: a v1 reader looking at a v3 payload would be reading
 * a field list it does not know out of a document whose shape it has already
 * assumed. Two keys, one of them a number, is the smallest thing any version of
 * this game can read safely.
 *
 * **The machinery is the deliverable and the versions in the test are the
 * fixtures.** `MIGRATIONS` is empty in this build because `DOCUMENT_VERSION` is
 * 1 and there is nothing to migrate from; inventing a version 0 to have
 * something to walk would be a migration that exists only to be tested. What is
 * real here is the walk: the from-version lookup, the step application, the
 * policy on a version with no registered step, and the future-version policy.
 * `migrate` takes the target version and the step map as parameters so that
 * `tests/unit/storage-migration.test.ts` drives that same real walk with
 * synthetic versions, one lossless step and one deliberate gap, without a line
 * of production code existing for the test's benefit.
 *
 * **Discarding is a value, not a throw.** SPEC 18 says a corrupt saved document
 * must not prevent the game starting, so nothing here throws on anything a
 * document can contain. The one thing that does throw is a caller asking to
 * migrate to a version that is not a version, which is a caller defect in the
 * house sense and not something a stored byte can cause.
 *
 * No canvas, no renderer import, no `Math.random()`, no clock.
 */

import type { RepairReason } from './document';
import { DOCUMENT_VERSION, MIN_DOCUMENT_VERSION } from './document';
import { errorName, isRecord } from './store';

/**
 * A stored document, as any version of this game can read it.
 *
 * `data` is `unknown` on purpose: its shape is whatever the version says, and
 * only the migration walk and then `sanitiseDocument` are allowed an opinion
 * about it.
 */
export interface Envelope {
  readonly version: number;
  readonly data: unknown;
}

/**
 * One step of the walk: the payload as version `n`, returned as version `n + 1`.
 *
 * Registered under the version it reads, not the one it writes, so the lookup is
 * "what do I do with what I am holding" rather than "who produced what I want".
 * A step may return anything; the sanitiser downstream decides whether the
 * result is usable, so a step that produces the wrong shape degrades to defaults
 * rather than reaching the game.
 */
export type Migration = (data: unknown) => unknown;

/**
 * Every registered step, keyed by the version it reads.
 *
 * Empty, and honestly so: this build writes version 1 and there is no version 0.
 * The first bump adds an entry keyed `1` here and leaves everything else in this
 * file alone, which is the whole point of building the walk before it is needed.
 */
export const MIGRATIONS: ReadonlyMap<number, Migration> = new Map<number, Migration>();

/** How the walk was driven. Both fields default to what this build ships. */
export interface MigrationOptions {
  /** The version to arrive at. Defaults to `DOCUMENT_VERSION`. */
  readonly to?: number;
  /** The steps available. Defaults to `MIGRATIONS`. */
  readonly migrations?: ReadonlyMap<number, Migration>;
}

/** What the walk produced, or why it discarded the document. */
export type MigrationResult =
  | {
      readonly ok: true;
      /** The payload, at the target version. */
      readonly data: unknown;
      /** The version it arrived as. */
      readonly from: number;
      /** How many steps were applied. Zero when it was already current. */
      readonly steps: number;
    }
  | {
      readonly ok: false;
      readonly reason: RepairReason;
      /** The version it claimed, or `null` when it claimed nothing usable. */
      readonly from: number | null;
      /** The name of whatever was thrown, or the empty string when nothing was. */
      readonly detail: string;
    };

/** A read that produced an envelope, or the reason it could not. */
export type EnvelopeResult =
  | { readonly ok: true; readonly envelope: Envelope }
  | { readonly ok: false; readonly reason: RepairReason; readonly detail: string };

/** Whether a stored number can be a schema version at all. */
function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= MIN_DOCUMENT_VERSION;
}

/**
 * Read the stored string as an envelope. Item `I2`'s "unparseable" arm.
 *
 * Total, and never throws: `JSON.parse` is the one call here that can, and it is
 * inside a `try` whose binding is read rather than discarded. What comes back is
 * either an envelope with a usable version, or a reason the document has to be
 * discarded whole, because a string that is not JSON and an object with no
 * schema version both have nothing inside them that can be salvaged field by
 * field.
 */
export function readEnvelope(text: string): EnvelopeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // Typed and read. QUALITY-BAR section 12 forbids a bare catch, and the
    // name is what a later readout says when it explains the loss.
    return Object.freeze({ ok: false, reason: 'unparseable', detail: errorName(error) });
  }
  if (!isRecord(parsed)) {
    return Object.freeze({ ok: false, reason: 'not-a-document', detail: '' });
  }
  const version = parsed['version'];
  if (!isVersion(version)) {
    return Object.freeze({ ok: false, reason: 'bad-version', detail: '' });
  }
  return Object.freeze({ ok: true, envelope: Object.freeze({ version, data: parsed['data'] }) });
}

/**
 * Walk one envelope up to the target version. Item `I1`.
 *
 * Four answers, and each is one clause of the criterion:
 *
 *   - **Already current**: carried through untouched, zero steps.
 *   - **Older, with every step registered**: walked forward one version at a
 *     time, losslessly, which is the criterion's "migrates losslessly where
 *     possible". Losslessness is the step's promise rather than this walk's;
 *     what the walk guarantees is that every step between the two versions runs,
 *     in order, and that none is skipped.
 *   - **Older, with a step missing**: discarded cleanly. Applying the steps that
 *     do exist and stopping short would hand a half-migrated payload to the
 *     sanitiser, which would salvage some of it and quietly keep a document
 *     nobody can reason about.
 *   - **Newer than this build**: discarded cleanly, never crashed. A player who
 *     opened a newer deployment and came back to a cached older one holds a
 *     document from the future; the honest answer is to start fresh, and the
 *     next successful write puts back one this build understands.
 *
 * A step that throws is caught and turned into the same clean discard, because a
 * migration is code running against a payload it may never have seen and item
 * `I2` says no stored value may stop the game starting.
 */
export function migrate(envelope: Envelope, options: MigrationOptions = {}): MigrationResult {
  const to = options.to ?? DOCUMENT_VERSION;
  const steps = options.migrations ?? MIGRATIONS;
  if (!isVersion(to)) {
    throw new RangeError(
      `a migration target is a schema version at or above ${String(MIN_DOCUMENT_VERSION)}; ` +
        `${String(to)} is not one`,
    );
  }
  if (!isVersion(envelope.version)) {
    return Object.freeze({ ok: false, reason: 'bad-version', from: null, detail: '' });
  }
  if (envelope.version > to) {
    return Object.freeze({
      ok: false,
      reason: 'future-version',
      from: envelope.version,
      detail: '',
    });
  }

  let data = envelope.data;
  let applied = 0;
  for (let version = envelope.version; version < to; version += 1) {
    const step = steps.get(version);
    if (step === undefined) {
      return Object.freeze({
        ok: false,
        reason: 'no-migration',
        from: envelope.version,
        detail: '',
      });
    }
    try {
      data = step(data);
    } catch (error) {
      // Typed and read, per QUALITY-BAR section 12. A step that throws is a
      // document this build cannot carry forward, which is a clean discard.
      return Object.freeze({
        ok: false,
        reason: 'migration-failed',
        from: envelope.version,
        detail: errorName(error),
      });
    }
    applied += 1;
  }
  return Object.freeze({ ok: true, data, from: envelope.version, steps: applied });
}

/** The envelope this build writes. What is inside it is `document.ts`'s answer. */
export function sealEnvelope(data: unknown): Envelope {
  return Object.freeze({ version: DOCUMENT_VERSION, data });
}
