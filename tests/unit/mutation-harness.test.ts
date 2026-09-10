/**
 * The mutation harness's own reading of a gate. AUDIT-2, finding `Z9-01`.
 *
 * `scripts/mutation-check.mjs` is the evidence behind the claim that every other
 * gate in this project gates anything, and for most of its life it decided that
 * question from an exit status alone: any non-zero exit was "the gate went red",
 * and the child's output was discarded before anything could read it. Three
 * different events wear that face. A gate killed while it ran, a gate that
 * crashed before its first assertion and a gate whose command is missing are all
 * non-zero, and all three were printed as `detected` in a sweep that runs about
 * two hours and re-checks the environment nowhere after it starts. Both triggers
 * are on this project's record: a foreign server on the preview port reddening
 * 77 specs at `BJ-23`, and two sweeps killed at the end at `BJ-21` and `BJ-22`.
 *
 * So the discrimination is asserted here rather than described in the harness.
 * `classifyGateRun` is pure and takes a run's own facts, which is what lets a
 * unit test construct the four cases that no green tree ever produces. The
 * patterns each gate is read by are held against a real summary line and against
 * a run that printed none, because a pattern that matched everything would put
 * the defect straight back.
 *
 * The importing itself is part of the claim: the harness edits live source
 * files, and its entry-point guard is what keeps a mere import from starting a
 * sweep. A test that imports it and does not rewrite `src/` is that guard's
 * only demonstration.
 *
 * @vitest-environment node
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ADDITIONS,
  EDITS,
  GATE_RED,
  classifyGateRun,
  lockfileDrift,
  staleLedgerEntries,
} from '../../scripts/mutation-check.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HARNESS = readFileSync(join(PROJECT_ROOT, 'scripts', 'mutation-check.mjs'), 'utf8');

/** A gate descriptor, as small as the classifier's contract allows. */
const GATE = { label: 'npm run test', red: GATE_RED.vitest };

/** One `spawnSync` result, with the fields a green run leaves. */
function run(over: Record<string, unknown>): Record<string, unknown> {
  return { status: 0, signal: null, error: undefined, stdout: '', stderr: '', ...over };
}

describe('Z9-01: a gate that did not reach a verdict is not evidence', () => {
  it('reads a gate that ran, asserted and failed as red', () => {
    expect(
      classifyGateRun(GATE, run({ status: 1, stdout: ' Test Files  1 failed | 42 passed (43)\n' })),
    ).toBe('red');
  });

  it('reads a gate that ran and passed as green', () => {
    expect(classifyGateRun(GATE, run({ stdout: ' Test Files  43 passed (43)\n' }))).toBe('green');
  });

  it('refuses a gate that was killed while it ran', () => {
    // The shape a timeout or a harness stop leaves: no status, a signal, and
    // whatever the gate had printed before it was stopped.
    expect(() =>
      classifyGateRun(GATE, run({ status: null, signal: 'SIGTERM', stdout: ' RUN  v4.1.11\n' })),
    ).toThrow(/killed by SIGTERM/);
  });

  it('refuses a gate that could not be started at all', () => {
    expect(() =>
      classifyGateRun(GATE, run({ status: null, error: { code: 'ENOENT' } })),
    ).toThrow(/could not be started \(ENOENT\)/);
  });

  it('refuses an exit status the gate does not use for an assertion failure', () => {
    // 2 is `scripts/report/gate.mjs`'s usage error and eslint's fatal
    // configuration error: the tool refusing its own arguments, not a breach.
    expect(() => classifyGateRun(GATE, run({ status: 2, stderr: 'usage: ...\n' }))).toThrow(
      /exited 2, which it does not use/,
    );
  });

  it("refuses an exit of one that carries no verdict of the gate's own", () => {
    // **The Windows case, and the reason the output is read at all.** An
    // externally killed child arrives here as status 1 with `signal` null, so
    // the only thing separating it from a failing assertion is whether the gate
    // printed its own summary line before it stopped.
    expect(() => classifyGateRun(GATE, run({ status: 1, stdout: ' RUN  v4.1.11\n' }))).toThrow(
      /without printing its own verdict/,
    );
  });

  it('names the gate and shows what it did print, so the stop can be acted on', () => {
    expect(() =>
      classifyGateRun(GATE, run({ status: 1, stderr: 'Error: connect ECONNREFUSED 127.0.0.1:4173\n' })),
    ).toThrow(/npm run test:[\s\S]*ECONNREFUSED/);
  });
});

describe('Z9-01: each gate is read by the summary line that gate prints', () => {
  it('matches a real red summary and not a run that printed none', () => {
    for (const [pattern, red, green] of [
      [GATE_RED.vitest, ' Test Files  1 failed | 42 passed (43)', ' Test Files  43 passed (43)'],
      [GATE_RED.eslint, '  2 problems (2 errors, 0 warnings)', ''],
      [GATE_RED.playwright, '  1 failed\n  188 passed (2.1m)', '  189 passed (2.1m)'],
      [GATE_RED.report, 'bundle-size.md FAILED with 1 breach(es).', 'bundle-size.md PASSED.'],
    ] as const) {
      expect(pattern.test(red), `${String(pattern)} does not match its own gate's red`).toBe(true);
      expect(pattern.test(green), `${String(pattern)} matches a gate that did not go red`).toBe(
        false,
      );
    }
  });

  it('gives every gate in the ledger a pattern to be read by', () => {
    // A gate descriptor with no `red` would throw on the first entry measured
    // against it rather than passing quietly, but the four constructors are
    // where a fifth gate would be added and this is the cheaper place to say so.
    for (const field of [
      'red: GATE_RED.vitest,',
      'red: GATE_RED.eslint,',
      'red: GATE_RED.playwright,',
      'red: GATE_RED.report,',
    ]) {
      expect(HARNESS, `a gate constructor lost "${field}"`).toContain(field);
    }
  });
});

describe('Z9-06: a stale ledger stops the sweep before anything is built', () => {
  /**
   * The pass the harness did not have.
   *
   * `runEdit` threw at the entry's own turn, `main` caught nothing, and the
   * process ended: the entries after it were never measured and the `N of M`
   * summary was never printed, so a ledger that had gone stale at entry 50 cost
   * a two-hour sweep and reported none of the 49 that had run. Nothing between
   * sweeps noticed ledger rot at all.
   *
   * The pass is pure and takes its readers as parameters, so the arms below run
   * it over constructed ledgers. The two failure shapes are the two ways an
   * entry stops testing what it claims: a `find` that no longer appears exactly
   * once, and an addition whose file is already there.
   */
  const io = (files: Record<string, string>) => ({
    read: (file: string): string => {
      const text = files[file];
      if (text === undefined) {
        throw new Error(`no such file: ${file}`);
      }
      return text;
    },
    exists: (file: string): boolean => files[file] !== undefined,
  });

  const edit = (over: Record<string, string>) => ({
    item: 'B1',
    name: 'a thing',
    file: 'src/core/hand.ts',
    find: 'const LIMIT = 21;',
    replace: 'const LIMIT = 20;',
    ...over,
  });

  it('reports nothing for a ledger whose every target is where it says', () => {
    expect(
      staleLedgerEntries(
        [edit({}), edit({ file: 'src/core/shoe.ts', find: 'const CUT = 3;' })],
        [{ item: 'M3', name: 'an addition', file: 'src/core/new.ts', content: 'x' }],
        io({ 'src/core/hand.ts': 'const LIMIT = 21;', 'src/core/shoe.ts': 'const CUT = 3;' }),
      ),
    ).toEqual([]);
  });

  it('names an entry whose target has gone, and one that now matches twice', () => {
    const stale = staleLedgerEntries(
      [
        edit({ name: 'gone' }),
        edit({ name: 'twice', file: 'src/core/shoe.ts', find: 'const CUT = 3;' }),
      ],
      [],
      io({
        'src/core/hand.ts': 'const LIMIT = 22;',
        'src/core/shoe.ts': 'const CUT = 3; const CUT = 3;',
      }),
    );
    expect(stale).toHaveLength(2);
    expect(stale[0]).toContain('appears 0 times, expected exactly 1');
    expect(stale[0]).toContain('src/core/hand.ts');
    expect(stale[0]).toContain('gone');
    expect(stale[1]).toContain('appears 2 times, expected exactly 1');
  });

  it('names an entry whose file is missing rather than throwing over it', () => {
    const stale = staleLedgerEntries([edit({})], [], io({}));
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain('the file it names is missing');
  });

  it('names an addition whose file already exists', () => {
    const stale = staleLedgerEntries(
      [],
      [{ item: 'M3', name: 'an addition', file: 'src/core/new.ts', content: 'x' }],
      io({ 'src/core/new.ts': 'already here' }),
    );
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain('already exists');
  });

  it('reports every stale entry rather than stopping at the first', () => {
    const stale = staleLedgerEntries(
      [edit({ name: 'one' }), edit({ name: 'two' }), edit({ name: 'three' })],
      [],
      io({ 'src/core/hand.ts': 'nothing like it' }),
    );
    expect(stale).toHaveLength(3);
  });

  it('exports the ledger the pre-flight reads, without starting a sweep', () => {
    // The import itself is the entry-point guard's demonstration, and the two
    // arrays are what the sweep hands the pass. Their contents are deliberately
    // not asserted here; see below.
    expect(EDITS.length + ADDITIONS.length).toBeGreaterThan(800);
    expect(EDITS.every((entry) => typeof entry.find === 'string')).toBe(true);
    expect(ADDITIONS.every((entry) => typeof entry.content === 'string')).toBe(true);
  });

  // **The same pass over the REAL ledger is deliberately not asserted here, and
  // that is a construction rather than a preference.** It was written, and it
  // made every ledger entry detected for the wrong reason: a mutation applied by
  // the sweep is, by definition, a find string that no longer matches its file,
  // so the pass reports that entry stale and this suite goes red whatever the
  // entry's own detector did. Measured while it was in: the F1 entry that blinds
  // the scroller census in tests/browser/support/game.ts, whose detector is the
  // breakpoints spec, reddened npm run test at 1 failed of 1360 with nothing
  // else touched, and every entry carrying detectedBy UNIT would then have been
  // recorded detected on the strength of this file alone. The pre-flight belongs
  // where it runs once, on an unmutated tree, before the baseline; here it is
  // asserted over constructed ledgers only.

  it('runs the pass before the baseline, and stops without applying anything', () => {
    // The ordering is the finding. Pinned as source, because a sweep is the one
    // thing a unit test cannot start: the pre-flight call has to come before the
    // baseline command set is built, and the refusal has to return rather than
    // fall through into the mutation loop.
    const preflight = HARNESS.indexOf('const stale = staleLedgerEntries(EDITS, ADDITIONS);');
    const baseline = HARNESS.indexOf('const commands = [UNIT, LINT,');
    const loop = HARNESS.indexOf('for (const mutation of EDITS) {');
    expect(preflight, 'the sweep no longer runs the pre-flight').toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(baseline);
    expect(preflight).toBeLessThan(loop);
    expect(HARNESS).toContain(
      "    console.error('The ledger has gone stale. No mutation was applied and nothing was built.');",
    );
    // The refusal returns rather than falling through, held with real newlines
    // so the ledger entry that quotes these lines as an escaped string cannot
    // satisfy the pin the mutation is supposed to break. The flag the discard
    // reads is set on the line past it, which is what makes "nothing was built"
    // and the bundle's survival the same fact rather than two.
    expect(HARNESS).toContain(
      [
        '    process.exitCode = 1;',
        '    return;',
        '  }',
        '  // Past the refusal, so a command may now be spawned and a command may build.',
        '  mayHaveBuilt = true;',
      ].join('\n'),
    );
    // And the belt behind it: `runEdit` still refuses its own entry.
    expect(HARNESS).toContain('    if (occurrences !== 1) {');
  });
});

describe('2026-09-10: a drifted install stops the sweep before anything is built', () => {
  /**
   * The pass beside the ledger pre-flight, for the other thing a sweep took on
   * trust: that `node_modules/` is what `package-lock.json` says it is. For the
   * sweeps since `BJ-22` it was not. `report:lighthouse` installed its tool
   * with `--no-package-lock`, which makes npm ignore the lock file while
   * resolving, and eleven locked packages had moved to newer versions, the
   * bundler among them. Every gate measured that tree, and the summary had no
   * way to say so.
   *
   * The pass is pure and takes its reader as a parameter, so the arms below
   * run it over constructed records. Only a package present in both records at
   * different versions is drift: Lighthouse's own subtree is installed
   * unrecorded on purpose, and the lock file names the optional binaries of
   * every platform while an install takes only this one's.
   *
   * The same pass over the REAL records is deliberately not asserted here, for
   * the reason the ledger pre-flight gives above: this suite is the sweep's own
   * unit gate, and a unit test that reads the machine it runs on would report
   * the environment rather than the source. The pre-flight belongs where it
   * runs once, on an unmutated tree, before the baseline.
   */
  const TRACKED = 'package-lock.json';
  const INSTALLED = 'node_modules/.package-lock.json';
  const record = (packages: Record<string, { version: string }>): string =>
    JSON.stringify({ lockfileVersion: 3, packages: { '': { version: '0.0.0' }, ...packages } });
  const io = (files: Record<string, string>) => ({
    read: (file: string): string => {
      const text = files[file];
      if (text === undefined) {
        throw new Error(`no such file: ${file}`);
      }
      return text;
    },
  });

  it('reports nothing when the installed record is the lock file', () => {
    const packages = {
      'node_modules/vite': { version: '8.2.2' },
      'node_modules/rolldown': { version: '1.2.5' },
    };
    expect(
      lockfileDrift(io({ [TRACKED]: record(packages), [INSTALLED]: record(packages) })),
    ).toEqual([]);
  });

  it('names a package that moved, with both versions', () => {
    const drift = lockfileDrift(
      io({
        [TRACKED]: record({ 'node_modules/rolldown': { version: '1.2.5' } }),
        [INSTALLED]: record({ 'node_modules/rolldown': { version: '1.2.8' } }),
      }),
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('node_modules/rolldown');
    expect(drift[0]).toContain('locked 1.2.5');
    expect(drift[0]).toContain('installed 1.2.8');
  });

  it('reports every moved package rather than stopping at the first', () => {
    const drift = lockfileDrift(
      io({
        [TRACKED]: record({
          'node_modules/rolldown': { version: '1.2.5' },
          'node_modules/postcss': { version: '8.5.26' },
          'node_modules/vite': { version: '8.2.2' },
        }),
        [INSTALLED]: record({
          'node_modules/rolldown': { version: '1.2.8' },
          'node_modules/postcss': { version: '8.5.28' },
          'node_modules/vite': { version: '8.2.2' },
        }),
      }),
    );
    expect(drift).toHaveLength(2);
  });

  it('ignores a package only the installed record has, which is how the tool arrives', () => {
    const drift = lockfileDrift(
      io({
        [TRACKED]: record({ 'node_modules/vite': { version: '8.2.2' } }),
        [INSTALLED]: record({
          'node_modules/vite': { version: '8.2.2' },
          'node_modules/lighthouse': { version: '13.4.1' },
          'node_modules/puppeteer-core': { version: '25.10.0' },
        }),
      }),
    );
    expect(drift).toEqual([]);
  });

  it("ignores a package only the lock file has, which is every other platform's binary", () => {
    const drift = lockfileDrift(
      io({
        [TRACKED]: record({
          'node_modules/vite': { version: '8.2.2' },
          'node_modules/@rolldown/binding-darwin-arm64': { version: '1.2.5' },
        }),
        [INSTALLED]: record({ 'node_modules/vite': { version: '8.2.2' } }),
      }),
    );
    expect(drift).toEqual([]);
  });

  it('reports a record it cannot read rather than throwing over it', () => {
    const missing = lockfileDrift(io({ [TRACKED]: record({}) }));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain(INSTALLED);
    expect(missing[0]).toContain('npm ci');
    const broken = lockfileDrift(io({ [TRACKED]: 'not a record', [INSTALLED]: record({}) }));
    expect(broken).toHaveLength(1);
    expect(broken[0]).toContain(TRACKED);
  });

  it('reports a record with no packages table rather than reading it as agreement', () => {
    const drift = lockfileDrift(
      io({ [TRACKED]: JSON.stringify({ lockfileVersion: 1 }), [INSTALLED]: record({}) }),
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('no packages table');
  });

  it('runs after the ledger pre-flight and before the baseline, and stops without applying anything', () => {
    // The ordering is the finding, pinned as source for the reason the ledger
    // arm gives: a sweep is the one thing a unit test cannot start.
    const drift = HARNESS.indexOf('const drift = lockfileDrift();');
    const ledger = HARNESS.indexOf('const stale = staleLedgerEntries(EDITS, ADDITIONS);');
    const baseline = HARNESS.indexOf('const commands = [UNIT, LINT,');
    expect(drift, 'the sweep no longer runs the lock-file pre-flight').toBeGreaterThan(-1);
    expect(ledger).toBeLessThan(drift);
    expect(drift).toBeLessThan(baseline);
    expect(HARNESS).toContain(
      "      'The installed tree has drifted from the lock file. No mutation was applied and nothing was built.',",
    );
    // The refusal returns rather than falling through, held with real newlines
    // for the reason the ledger arm gives, and it is the last refusal before
    // the flag the discard reads: a drift that fell through would set it.
    expect(HARNESS).toContain(
      [
        "    console.error('Run npm ci, then npm run report:lighthouse, and start the sweep again.');",
        '    process.exitCode = 1;',
        '    return;',
        '  }',
        '  // Past the refusal, so a command may now be spawned and a command may build.',
        '  mayHaveBuilt = true;',
      ].join('\n'),
    );
  });
});

describe('Z9-05: an interrupted sweep leaves neither a mutation nor a bundle', () => {
  // A `finally` does not run when a process is terminated by a signal, which is
  // the whole of the finding: measured by a signal probe kept with the audit's
  // working notes outside the repository, an interrupted entry left its
  // mutation written into the file. The handler and the discard are pinned here
  // the way `report-gates.test.ts` pins a report's no-sample guards, because
  // what they defend against cannot be produced inside a test runner: delivery
  // is the platform's, and on Windows an external kill runs no handler at all.
  it('installs the handler on both signals', () => {
    // Held with the line above it and with real newlines, so that the ledger
    // entry which quotes these two lines as an escaped string cannot satisfy
    // the pin the mutation is supposed to break.
    expect(HARNESS).toContain(
      "function main() {\n  process.on('SIGINT', onSignal);\n  process.on('SIGTERM', onSignal);\n",
    );
  });

  it('publishes how to undo the entry in flight, in both entry shapes', () => {
    expect(HARNESS).toContain('    inFlight = () => {\n      writeFileSync(path, original);\n    };');
    expect(HARNESS).toContain('    inFlight = () => {\n      rmSync(path, { force: true });\n    };');
  });

  it('discards the bundle a gate may have built under a mutation', () => {
    expect(HARNESS).toContain('function discardBuild() {\n  rmSync(DIST, { recursive: true, force: true });\n}');
    expect(HARNESS).toContain('  try {\n    sweep();\n  } finally {');
    expect(HARNESS).toContain("      discardBuild();\n      console.log('dist/ was removed");
  });
});

/**
 * The run that reached no gate leaves the bundle alone, and says nothing else.
 * The cure round's review, finding `MIN-1`.
 *
 * The pre-flight's own refusal states that nothing was applied and nothing was
 * built, and the discard in `main`'s `finally` then removed the operator's
 * bundle and printed a line claiming a gate here may have built it. Both cannot
 * be true of one run, and the true one is the pre-flight's: no command is
 * spawned on that path at all.
 *
 * Run rather than read, on `tests/unit/repository-policy.test.ts`'s technique:
 * the shipped file is copied into a constructed repository whose `scripts/` is
 * the only thing in it, so `PROJECT_ROOT` resolves there, every ledger entry's
 * file is missing, and the pre-flight refuses on the first pass. A `dist/` is
 * put there first, with a file in it, and it is the survival of that file the
 * assertion is about. Nothing in this project's own tree is touched: the copy
 * spawns nothing before it refuses.
 */
describe('MIN-1: a refused pre-flight builds nothing and destroys nothing', () => {
  it('leaves a bundle it never built, and claims no removal', () => {
    const root = mkdtempSync(join(tmpdir(), 'bj-preflight-'));
    try {
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, 'dist'));
      writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html>\n');
      const script = join(root, 'scripts', 'mutation-check.mjs');
      copyFileSync(join(PROJECT_ROOT, 'scripts', 'mutation-check.mjs'), script);

      const ran = spawnSync(process.execPath, [script], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
      const output = `${ran.stdout ?? ''}${ran.stderr ?? ''}`;

      // The refusal itself, so this is measuring the path it says it is.
      expect(ran.status, output.slice(-2_000)).toBe(1);
      expect(output).toContain('The ledger has gone stale.');
      expect(output).toContain('the file it names is missing');

      // The bundle, which no command in this run could have built.
      expect(
        existsSync(join(root, 'dist', 'index.html')),
        'the refusal removed a bundle it had no hand in',
      ).toBe(true);
      expect(output, 'the refusal claimed a removal it did not make').not.toContain(
        'dist/ was removed',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
