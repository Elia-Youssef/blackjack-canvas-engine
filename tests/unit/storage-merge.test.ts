/**
 * The two-tab merge, field by field. `AUDIT-2`, finding `J3-01`.
 *
 * The defect: the persisted document was read once per page at boot, and every
 * write replaced the whole key with whatever that page held. A second tab of
 * the game therefore kept a private copy from the moment it booted, and any
 * write in it, a round boundary or one press of a settings button, overwrote
 * everything the other tab had achieved since. Measured on the shipped page:
 * the high-water mark fell from 1,100 to 1,000, the lifetime tallies and the
 * hand history went to zero, and SPEC 6 re-locked a table the player had earned.
 *
 * **The property this file gates**, and the reason `mergeDocuments` exists: no
 * save, from any tab, in any order, may decrease the stored best balance,
 * decrease any stored lifetime counter, drop an awarded milestone, or shorten
 * the stored history. Everything below is that sentence, taken apart.
 *
 * Three things are asserted that the property alone does not say, and each is a
 * way the property could be satisfied by something useless:
 *
 *   1. **The settings still follow the writer.** A merge that simply kept the
 *      stored document would never decrease anything and would throw away
 *      every press a player made in the older tab.
 *   2. **The merged counters stay internally consistent.** `statistics.ts`
 *      states `handsPlayed === wins + losses + pushes`, and `document.ts`
 *      refuses a scope where it does not hold, WHOLE. Five independent maxima
 *      can break it, and a broken scope is thrown away on the next read, which
 *      would turn the cure into a slower version of the defect.
 *   3. **A corrupt stored document cannot poison the merge.** The re-read on
 *      the save path goes through the same sanitising loader a launch uses, so
 *      what is merged is the salvaged document; this file drives that end to
 *      end through a real `Persistence` over a store holding real corruption.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import type { History } from '../../src/core/history';
import { NO_HISTORY, record } from '../../src/core/history';
import type { Counters, MilestoneId, Statistics } from '../../src/core/statistics';
import { NO_COUNTERS, NO_STATISTICS } from '../../src/core/statistics';
import type { CoachAccuracy, CoachRecord } from '../../src/core/strategy';
import { NO_DECISIONS } from '../../src/core/strategy';
import type { TableReadout } from '../../src/core/table';
import { createTable } from '../../src/core/table';
import { STARTING_CHIPS, createWallet } from '../../src/core/wallet';
import type { GameDocument, Settings } from '../../src/storage/document';
import {
  DEFAULT_DOCUMENT,
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  mergeDocuments,
  sanitiseDocument,
} from '../../src/storage/document';
import { createPersistence, loadDocument } from '../../src/storage/persistence';
import type { KeyValueStore } from '../../src/storage/store';
import { createMemoryStore } from '../../src/storage/store';

import { acceptIntent as accept } from './support/drive';
import { envelopeText, storeHolding } from './support/storage-fixtures';

/** SPEC 5: a frame long enough to pay for any one timed step. */
const TICK = 0.25;

/** Bounded, in the house pattern: a stall must fail loudly, not hang. */
const LOOP_LIMIT = 500;

/** Play one seeded round to SPEC 10's round result, so a history row is real. */
function playOneRound(seed: number): TableReadout {
  const table = createTable({ seed });
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

/** A history of `count` genuine SPEC 8 entries, newest first. */
function realHistory(count: number): History {
  let history: History = NO_HISTORY;
  for (let index = 0; index < count; index += 1) {
    history = record(history, playOneRound(11 + index), null);
  }
  return history;
}

function counters(
  handsPlayed: number,
  wins: number,
  losses: number,
  pushes: number,
  blackjacks: number,
): Counters {
  return Object.freeze({ handsPlayed, wins, losses, pushes, blackjacks });
}

function statisticsOf(lifetime: Counters, milestones: readonly MilestoneId[]): Statistics {
  return Object.freeze({ ...NO_STATISTICS, lifetime, milestones });
}

function coachOf(lifetime: CoachAccuracy): CoachRecord {
  return Object.freeze({ session: NO_DECISIONS.session, lifetime });
}

/** A document with named contents, everything else at its default. */
function documentOf(patch: Partial<GameDocument>): GameDocument {
  return Object.freeze({ ...DEFAULT_DOCUMENT, ...patch });
}

/** Every settings value different from the default, so a choice is visible. */
const OTHER_SETTINGS: Settings = Object.freeze({
  ...DEFAULT_SETTINGS,
  speed: 'fast',
  theme: 'dark',
  muted: true,
  volume: 0.25,
  coach: 'review',
  surfaceSize: 125,
});

// ---------------------------------------------------------------------------
// The property, per field
// ---------------------------------------------------------------------------

describe('J3-01: no merge decreases a field that only rises', () => {
  it('takes the higher best balance, from either side', () => {
    expect(
      mergeDocuments(documentOf({ bestBalance: 9_000 }), documentOf({ bestBalance: 1_000 }))
        .bestBalance,
    ).toBe(9_000);
    expect(
      mergeDocuments(documentOf({ bestBalance: 1_000 }), documentOf({ bestBalance: 9_000 }))
        .bestBalance,
    ).toBe(9_000);
    // Equal is equal, and the merge invents nothing.
    expect(
      mergeDocuments(documentOf({ bestBalance: 4_000 }), documentOf({ bestBalance: 4_000 }))
        .bestBalance,
    ).toBe(4_000);
  });

  it('takes each lifetime tally at its maximum, in both directions', () => {
    const stored = documentOf({
      statistics: statisticsOf(counters(10, 6, 3, 1, 2), []),
    });
    const ours = documentOf({
      statistics: statisticsOf(counters(8, 2, 5, 1, 4), []),
    });
    const merged = mergeDocuments(stored, ours).statistics.lifetime;
    expect(merged.wins).toBe(6);
    expect(merged.losses).toBe(5);
    expect(merged.pushes).toBe(1);
    expect(merged.blackjacks).toBe(4);
    // Every counter is at or above both sources, which is the property itself
    // rather than a restatement of the four lines above.
    for (const key of ['handsPlayed', 'wins', 'losses', 'pushes', 'blackjacks'] as const) {
      expect(merged[key], key).toBeGreaterThanOrEqual(stored.statistics.lifetime[key]);
      expect(merged[key], key).toBeGreaterThanOrEqual(ours.statistics.lifetime[key]);
    }
  });

  it('keeps the merged counters internally consistent, and the sanitiser accepts them', () => {
    // The case five independent maxima get wrong: two documents that agree on
    // the count and disagree on how it was reached. 8 wins against 8 losses
    // merges to 16 outcomes, which `countersOf` refuses WHOLE, so a naive merge
    // would throw the whole scope away on the very next read.
    const stored = documentOf({ statistics: statisticsOf(counters(8, 8, 0, 0, 0), []) });
    const ours = documentOf({ statistics: statisticsOf(counters(8, 0, 8, 0, 0), []) });
    const merged = mergeDocuments(stored, ours).statistics.lifetime;

    expect(merged.wins).toBe(8);
    expect(merged.losses).toBe(8);
    expect(merged.handsPlayed, 'the count did not follow the outcomes').toBe(16);
    expect(merged.wins + merged.losses + merged.pushes).toBe(merged.handsPlayed);
    expect(merged.blackjacks).toBeLessThanOrEqual(merged.handsPlayed);

    // And the sanitiser keeps it, which is the assertion that matters: a scope
    // it refuses comes back as `NO_COUNTERS` and the player has lost everything.
    const salvaged = sanitiseDocument(mergeDocuments(stored, ours));
    expect(salvaged.repairs).toEqual([]);
    expect(salvaged.document.statistics.lifetime).toEqual(merged);
  });

  it('keeps the count consistent over a sweep of divergent scopes', () => {
    // The identity has to hold for every pair, not for the one that was thought
    // of: a repair that only fixed the case above would pass the test above.
    //
    // **Both sides of the sweep are scopes the sanitiser accepts**, which is
    // the merge's precondition rather than a convenience: `blackjacks` is
    // bounded by the count in each source, and a fixture that broke that would
    // be asking the merge to repair an input the loader cannot produce. The
    // first draft of this sweep did exactly that, at zero hands with one
    // natural, and the assertion caught it.
    for (let wins = 0; wins <= 4; wins += 1) {
      for (let losses = 0; losses <= 4; losses += 1) {
        for (let pushes = 0; pushes <= 2; pushes += 1) {
          const hands = wins + losses + pushes;
          const stored = statisticsOf(counters(hands, wins, losses, pushes, 0), []);
          const ours = statisticsOf(
            counters(hands, losses, wins, pushes, Math.min(1, hands)),
            [],
          );
          const merged = mergeDocuments(
            documentOf({ statistics: stored }),
            documentOf({ statistics: ours }),
          ).statistics.lifetime;
          expect(
            merged.wins + merged.losses + merged.pushes,
            `${String(wins)}/${String(losses)}/${String(pushes)}`,
          ).toBe(merged.handsPlayed);
          expect(merged.blackjacks).toBeLessThanOrEqual(merged.handsPlayed);
          expect(sanitiseDocument(documentOf({ statistics: { ...NO_STATISTICS, lifetime: merged } })).repairs).toEqual(
            [],
          );
        }
      }
    }
  });

  it('takes the union of the awarded milestones, keeping ours in front', () => {
    const stored = documentOf({
      statistics: statisticsOf(NO_COUNTERS, ['firstNatural', 'reachedSilver']),
    });
    const ours = documentOf({
      statistics: statisticsOf(NO_COUNTERS, ['reachedSilver', 'doubledBankroll']),
    });
    expect(mergeDocuments(stored, ours).statistics.milestones).toEqual([
      'reachedSilver',
      'doubledBankroll',
      'firstNatural',
    ]);
    // No duplicates, whichever side repeats: SPEC 9 awards each one once.
    expect(mergeDocuments(ours, ours).statistics.milestones).toEqual([
      'reachedSilver',
      'doubledBankroll',
    ]);
  });

  it('takes each coach counter at its maximum and keeps matched inside decisions', () => {
    const merged = mergeDocuments(
      documentOf({ coach: coachOf({ decisions: 120, matched: 111 }) }),
      documentOf({ coach: coachOf({ decisions: 30, matched: 4 }) }),
    ).coach.lifetime;
    expect(merged).toEqual({ decisions: 120, matched: 111 });

    // The invariant `accuracyOf` refuses, over a sweep: a merged record with
    // more matches than decisions would be discarded whole on the next read.
    for (const stored of [
      { decisions: 10, matched: 10 },
      { decisions: 10, matched: 0 },
      { decisions: 3, matched: 2 },
    ]) {
      for (const ours of [
        { decisions: 4, matched: 4 },
        { decisions: 12, matched: 1 },
        { decisions: 0, matched: 0 },
      ]) {
        const pair = mergeDocuments(
          documentOf({ coach: coachOf(stored) }),
          documentOf({ coach: coachOf(ours) }),
        ).coach.lifetime;
        expect(pair.matched, `${JSON.stringify(stored)} ${JSON.stringify(ours)}`).toBeLessThanOrEqual(
          pair.decisions,
        );
        expect(pair.decisions).toBeGreaterThanOrEqual(Math.max(stored.decisions, ours.decisions));
        expect(pair.matched).toBeGreaterThanOrEqual(Math.max(stored.matched, ours.matched));
      }
    }
  });

  it('keeps the longer history, and prefers ours when the two are the same length', () => {
    const three = realHistory(3);
    const one = realHistory(1);
    expect(mergeDocuments(documentOf({ history: three }), documentOf({ history: one })).history)
      .toHaveLength(3);
    expect(mergeDocuments(documentOf({ history: one }), documentOf({ history: three })).history)
      .toHaveLength(3);
    // A tie goes to this session, whose list carries the round it just played.
    const ours = realHistory(2);
    expect(
      mergeDocuments(documentOf({ history: realHistory(2) }), documentOf({ history: ours })).history,
    ).toBe(ours);
  });

  it('never un-sees the How-to-Play overlay', () => {
    // SPEC 17 persists a dismissal and nothing takes it back, so the flag is
    // monotone in exactly the way the tallies are.
    expect(
      mergeDocuments(documentOf({ howToPlaySeen: true }), documentOf({ howToPlaySeen: false }))
        .howToPlaySeen,
    ).toBe(true);
    expect(
      mergeDocuments(documentOf({ howToPlaySeen: false }), documentOf({ howToPlaySeen: true }))
        .howToPlaySeen,
    ).toBe(true);
    expect(
      mergeDocuments(documentOf({ howToPlaySeen: false }), documentOf({ howToPlaySeen: false }))
        .howToPlaySeen,
    ).toBe(false);
  });
});

describe('J3-01: the fields that are a choice follow the writer', () => {
  it('writes our settings over the stored ones, key by key', () => {
    const merged = mergeDocuments(
      documentOf({ settings: DEFAULT_SETTINGS, table: 'gold' }),
      documentOf({ settings: OTHER_SETTINGS, table: 'silver' }),
    );
    for (const key of Object.keys(DEFAULT_SETTINGS) as readonly (keyof Settings)[]) {
      expect(merged.settings[key], key).toEqual(OTHER_SETTINGS[key]);
    }
    expect(merged.table).toBe('silver');
    // The fixture really differs, or "ours won" is satisfied by two equal
    // records and this test says nothing at all.
    expect(OTHER_SETTINGS).not.toEqual(DEFAULT_SETTINGS);
  });

  it('leaves the session scope alone, because the write projects it out anyway', () => {
    const ours = documentOf({
      statistics: Object.freeze({
        ...NO_STATISTICS,
        session: counters(3, 2, 1, 0, 0),
        streak: 2,
        rounds: 3,
        belowLowWater: true,
      }),
    });
    const merged = mergeDocuments(
      documentOf({ statistics: statisticsOf(counters(9, 4, 4, 1, 0), []) }),
      ours,
    );
    expect(merged.statistics.session).toEqual(counters(3, 2, 1, 0, 0));
    expect(merged.statistics.streak).toBe(2);
    expect(merged.statistics.rounds).toBe(3);
    expect(merged.statistics.belowLowWater).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Through the real save path, over real stores
// ---------------------------------------------------------------------------

/** A store whose reads can be counted, so "one re-read per save" is measurable. */
function countingStore(backing: KeyValueStore): KeyValueStore & { reads(): number } {
  let reads = 0;
  return Object.freeze({
    read(key: string): string | null {
      reads += 1;
      return backing.read(key);
    },
    write(key: string, value: string): void {
      backing.write(key, value);
    },
    remove(key: string): void {
      backing.remove(key);
    },
    reads: () => reads,
  });
}

describe('J3-01: the save path re-reads, merges and writes', () => {
  it('reads the key exactly once per save, and after the caller assembled', () => {
    const store = countingStore(createMemoryStore());
    const persistence = createPersistence({ store, durable: true, failure: null });
    const atBoot = store.reads();
    expect(atBoot, 'the launch load read the key').toBeGreaterThan(0);

    persistence.save(documentOf({ bestBalance: 2_000 }));
    expect(store.reads() - atBoot, 'a save costs one read').toBe(1);
    persistence.save(documentOf({ bestBalance: 3_000 }));
    expect(store.reads() - atBoot, 'a second save costs one more').toBe(2);
  });

  it('salvages a corrupt stored document before merging it, and never inherits its damage', () => {
    // The corrupt-matrix ethos on the write path: another tab, a hand edit or a
    // half-written document is not trusted, it is salvaged. A mark below the
    // starting bankroll is unreachable and the loader replaces it with 1,000,
    // so the merge must see 1,000 and our 5,000 must survive.
    const store = storeHolding(
      envelopeText(1, {
        ...DEFAULT_DOCUMENT,
        bestBalance: -500,
        statistics: { ...NO_STATISTICS, lifetime: { handsPlayed: 'lots' } },
        history: 'not a list',
        howToPlaySeen: 'maybe',
      }),
    );
    const persistence = createPersistence({ store, durable: true, failure: null });
    expect(persistence.readout().load.repairs.length).toBeGreaterThan(0);

    persistence.save(documentOf({ bestBalance: 5_000, howToPlaySeen: true }));
    const written = loadDocument(store);
    expect(written.report.repairs, 'the merged document needed repairing').toEqual([]);
    expect(written.document.bestBalance).toBe(5_000);
    expect(written.document.statistics.lifetime).toEqual(NO_COUNTERS);
    expect(written.document.history).toEqual([]);
    // The salvaged mark is one the wallet accepts, which is the contract the
    // loader has and the merge must not break by inventing a value of its own.
    expect(() => createWallet({ bestBalance: written.document.bestBalance })).not.toThrow();
  });

  it('merges against an absent store without inventing anything', () => {
    const store = createMemoryStore();
    const persistence = createPersistence({ store, durable: true, failure: null });
    const ours = documentOf({ bestBalance: 7_000, settings: OTHER_SETTINGS });
    expect(persistence.save(ours).ok).toBe(true);
    // A first launch merges against the defaults, so what lands is ours.
    expect(loadDocument(store).document.bestBalance).toBe(7_000);
    expect(loadDocument(store).document.settings.speed).toBe('fast');
    expect(persistence.document().bestBalance).toBe(7_000);
  });

  it('resurrects this session into a store another tab reset, which is the stated reading', () => {
    // Recorded rather than cured, and stated at the merge site in
    // `src/storage/document.ts`: a tab that is still live has no way to know
    // that the emptied store means "the player asked for everything to go"
    // rather than "the browser cleared its site data", and tearing a running
    // session down because of a window the player may not be looking at is the
    // worse of the two answers. The reset still clears the store, and the tab
    // that ran it re-boots onto the defaults.
    const store = createMemoryStore();
    const live = createPersistence({ store, durable: true, failure: null });
    const other = createPersistence({ store, durable: true, failure: null });
    live.save(documentOf({ bestBalance: 6_000 }));

    expect(other.resetAll().ok).toBe(true);
    expect(store.read(STORAGE_KEY)).toBeNull();

    live.save(documentOf({ bestBalance: 6_000 }));
    expect(loadDocument(store).document.bestBalance).toBe(6_000);
  });

  it('holds the property over a hostile interleaving of two tabs', () => {
    // The general shape, driven rather than reasoned about: two sessions over
    // one store, taking turns, each writing what it holds. After every write
    // the stored mark, every stored lifetime tally, the milestone list and the
    // history length are required not to have gone down.
    const store = createMemoryStore();
    const tabs = [
      createPersistence({ store, durable: true, failure: null }),
      createPersistence({ store, durable: true, failure: null }),
    ];
    const marks = [STARTING_CHIPS, STARTING_CHIPS];
    const played = [0, 0];
    let floor = loadDocument(store).document;

    for (let step = 0; step < 24; step += 1) {
      const which = step % 2;
      const tab = tabs[which];
      if (tab === undefined) {
        throw new Error('a tab went missing');
      }
      marks[which] = (marks[which] ?? STARTING_CHIPS) + (which === 0 ? 250 : 100);
      played[which] = (played[which] ?? 0) + 1;
      const hands = played[which] ?? 0;
      tab.save(
        documentOf({
          bestBalance: marks[which] ?? STARTING_CHIPS,
          statistics: statisticsOf(
            counters(hands, hands, 0, 0, 0),
            which === 0 ? ['firstNatural'] : ['reachedSilver'],
          ),
          history: realHistory(Math.min(hands, 2)),
        }),
      );

      const now = loadDocument(store).document;
      expect(now.bestBalance, `step ${String(step)} rolled the mark back`).toBeGreaterThanOrEqual(
        floor.bestBalance,
      );
      for (const key of ['handsPlayed', 'wins', 'losses', 'pushes', 'blackjacks'] as const) {
        expect(
          now.statistics.lifetime[key],
          `step ${String(step)} rolled ${key} back`,
        ).toBeGreaterThanOrEqual(floor.statistics.lifetime[key]);
      }
      for (const id of floor.statistics.milestones) {
        expect(now.statistics.milestones, `step ${String(step)} dropped ${id}`).toContain(id);
      }
      expect(now.history.length, `step ${String(step)} shortened the history`).toBeGreaterThanOrEqual(
        floor.history.length,
      );
      floor = now;
    }

    // Non-vacuity: the interleaving really moved the numbers, or a store nobody
    // wrote satisfies every line above.
    expect(floor.bestBalance).toBeGreaterThan(STARTING_CHIPS);
    expect(floor.statistics.lifetime.handsPlayed).toBeGreaterThan(1);
    expect(floor.statistics.milestones).toEqual(
      expect.arrayContaining(['firstNatural', 'reachedSilver']),
    );
  });
});
