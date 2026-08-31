/**
 * SPEC 13's settings, restored: the census the boot side never had.
 *
 * The save side is compiler-enforced. `save()` in `src/main.ts` builds a whole
 * `Settings` literal, so a ninth persisted setting is a compile error there
 * until it is written. The restore side is eight separate reads with no shape
 * between them, so a ninth field sanitised in `src/storage/document.ts` and
 * never read at boot would persist correctly, never come back, and leave
 * `typecheck`, `lint` and the whole unit suite green. That is the class SPEC 13
 * exists to prevent, and it fails in the direction users notice least at review
 * time and most in use.
 *
 * **The trade in this file is stated rather than hidden: the last hop is a
 * source census and not a boot.** `bootSession` assembles the DOM chrome, the
 * frame loop and the audio engine, so it cannot run under this runner's `node`
 * environment, and a fake boot that stubbed all three would be evidence about
 * the stubs. So the file is in two halves, and only one of them is a scan:
 *
 *   1. **Measured.** A persistence built over an in-memory store holding a
 *      document whose eight settings all differ from `DEFAULT_SETTINGS` gives
 *      back a `restored()` whose settings are those eight values, key by key,
 *      driven by `Object.keys(DEFAULT_SETTINGS)` so the key list is the census
 *      rather than a transcription. That is the whole of the storage half, run
 *      against the real loader and the real sanitiser.
 *   2. **Scanned.** `bootSession` reads every one of those keys out of the
 *      restored settings. A scan, with a planted control proving it can see a
 *      read and can miss an absent one, including in the wrapped form prettier
 *      produces, which is the reach defect the `M2` census carried.
 *
 * What the second half cannot say is that the value reaches the running game
 * intact, which is `I4`'s browser evidence in `tests/browser/persistence.spec.ts`
 * and is deliberately not restated here.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stripComments } from './support/source-scan';

import type { GameDocument, Settings } from '../../src/storage/document';
import { DEFAULT_DOCUMENT, DEFAULT_SETTINGS, STORAGE_KEY } from '../../src/storage/document';
import { createPersistence } from '../../src/storage/persistence';
import { createMemoryStore } from '../../src/storage/store';

import { envelopeText } from './support/storage-fixtures';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAIN = stripComments(readFileSync(join(PROJECT_ROOT, 'src', 'main.ts'), 'utf8'));

/** SPEC 13's eight, as the document declares them. The census reads this. */
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as readonly (keyof Settings)[];

/**
 * A settings record every field of which differs from the default.
 *
 * Written out rather than derived, because a derived one would have to know how
 * to differ from a value it was handed, and a rule for that is a second reading
 * of what each setting is. Each value below is a legal one the sanitiser keeps.
 */
const ALL_DIFFERENT: Settings = Object.freeze({
  rules: Object.freeze({
    decks: 8,
    doubleAfterSplit: false,
    surrender: false,
    evenMoney: false,
    splitRule: 'equalRank',
  }),
  coach: 'review',
  speed: 'fast',
  surfaceSize: 125,
  muted: true,
  volume: 0.25,
  theme: 'dark',
  reducedMotion: 'always',
});

/** Everything in `bootSession`, which is where the restore happens. */
function bootBody(): string {
  const start = MAIN.indexOf('function bootSession(');
  expect(start, 'bootSession was not found in the composition root').toBeGreaterThan(-1);
  return MAIN.slice(start);
}

/**
 * Does this source read `persisted.settings.<key>`?
 *
 * Whitespace-tolerant around both dots, so the scan is statement-scoped rather
 * than line-scoped: prettier is free to wrap a member access across lines, and
 * a census that could not see the wrapped form would report a clean sweep over
 * exactly the code that had drifted.
 */
function readsSetting(source: string, key: string): boolean {
  return new RegExp(`persisted\\s*\\.\\s*settings\\s*\\.\\s*${key}\\b`).test(source);
}

describe('SPEC 13: the persisted settings all come back out of storage', () => {
  it('gives every key of the document back at the value it was stored with', () => {
    const stored: GameDocument = Object.freeze({ ...DEFAULT_DOCUMENT, settings: ALL_DIFFERENT });
    const store = createMemoryStore();
    store.write(STORAGE_KEY, envelopeText(1, stored));

    const persistence = createPersistence({ store, durable: true, failure: null });
    const restored = persistence.restored();
    // The load repaired nothing, or the comparison below would be against the
    // defaults rather than against what was written.
    expect(persistence.readout().load.repairs).toEqual([]);

    let checked = 0;
    for (const key of SETTING_KEYS) {
      expect(restored.settings[key], `${key} did not survive the load`).toEqual(
        ALL_DIFFERENT[key],
      );
      // And the fixture really differs from the default, or a loader that
      // ignored the document entirely would pass the line above.
      expect(ALL_DIFFERENT[key], `${key} is the default, so it proves nothing`).not.toEqual(
        DEFAULT_SETTINGS[key],
      );
      checked += 1;
    }
    expect(checked).toBe(SETTING_KEYS.length);
    expect(checked).toBe(8);
  });
});

describe('SPEC 13: the composition root reads every one of them at boot', () => {
  it('proves the scan against a planted read, an absence and a wrapped form', () => {
    // The control the census's own reach rests on. Without it, "every key is
    // read" is satisfied by a scanner that matches everything or nothing.
    expect(readsSetting('const speed = persisted.settings.speed;', 'speed')).toBe(true);
    expect(readsSetting('const speed = persisted.settings.speed;', 'volume')).toBe(false);
    expect(readsSetting('const x = options.speed ?? DEFAULT_SETTINGS.speed;', 'speed')).toBe(false);
    // The wrapped form, which is the shape a line-scoped census walks past.
    expect(
      readsSetting(
        ['      const theme =', '        persisted.settings', '          .theme;'].join('\n'),
        'theme',
      ),
    ).toBe(true);
    // A near miss that must not count: a longer key that starts with this one.
    expect(readsSetting('persisted.settings.volumeCurve', 'volume')).toBe(false);
  });

  it('reads all eight persisted settings inside bootSession', () => {
    const body = bootBody();
    // Non-vacuity: the slice really is the composition root's body.
    expect(body.length).toBeGreaterThan(10_000);
    expect(body).toContain('const table: Table = createTable(tableOptions);');

    const missing = SETTING_KEYS.filter((key) => !readsSetting(body, key));
    expect(missing, 'a persisted setting is saved and never restored').toEqual([]);
  });

  it('writes all eight back, which the compiler already enforces', () => {
    // The other end of the round trip, asserted here so the two halves are
    // stated together rather than one of them being assumed. `save()` builds a
    // whole `Settings` literal, so this cannot fail without the compiler
    // failing first; what it buys is that the key list below is the same list
    // the restore census walks.
    const save = MAIN.slice(MAIN.indexOf('function save('));
    expect(save.length).toBeGreaterThan(0);
    const settings = save.slice(save.indexOf('settings:'), save.indexOf('howToPlaySeen'));
    expect(settings.length).toBeGreaterThan(0);
    // Either spelling: a named property or the shorthand, which two of the
    // eight use because the binding already carries the key's name.
    for (const key of SETTING_KEYS) {
      expect(new RegExp(`\\b${key}\\s*[:,]`).test(settings), `${key} is not saved`).toBe(true);
    }
  });
});
